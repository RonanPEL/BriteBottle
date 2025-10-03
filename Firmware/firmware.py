#!/usr/bin/env python3
"""
PCB Control Firmware (Python) for a Radxa ROCK SBC (referred to as "PCB")

Implements the following activities and sensor logic:

Activities & I/O
----------------
- Mains Power           : monitored by PCB (digital AC-present input)
- Motor                 : PCB drives a contactor coil via a low-voltage output (Motor_EN)
                          OPTIONALLY measures motor current via ADC to track run cycles/duration/overcurrent
- Flap Lock             : double-acting solenoid (LOCK/UNLOCK). Locked when tote full OR door open
                          Lock prevents motor from starting
- Flap Open             : reed sensor; opening requests a motor run cycle
- Door Open             : magnet sensor; door open => engage lock and block motor
- Tote Level            : ultrasonic level sensor (distance -> % full); triggers "full" at threshold
- Tote Present          : ultrasonic presence sensor; blocks motor if not present
- PCB Power             : monitors 5V/3V3 rails via ADC thresholds

Safety Policy (summary)
-----------------------
MOTOR_ALLOWED = (mains_ok and pcb_power_ok and door_closed and tote_present and not tote_full and flap_unlocked)

- On any safety fault => Motor disabled immediately; Flap forced to LOCK.
- Flap unlock allowed only if (door_closed and tote_present and not tote_full and pcb_power_ok)
- Flap open rising edge starts a motor run cycle if MOTOR_ALLOWED.
- Cycle ends when flap closes OR a max_run_time is reached OR a safety fault occurs.
- Cycles are counted & logged with timestamps, durations, and mean RMS current (if configured).

Hardware/Library Assumptions
----------------------------
- GPIO via python-periphery
- Optional ADC (ADS1115) over I2C using python-periphery's I2C (no Blinka dependency)
- Ultrasonic sensors are HC-SR04 style (Trig/Echo). Adjust timing as needed.
- All pin numbers below are PLACEHOLDERS. Replace with your /dev/gpiochipN + line offsets from `gpioinfo`.

*** WORKING WITH MAINS IS DANGEROUS ***
Use proper, certified isolation devices (opto-isolated AC detectors, DIN-rail current transducers, interlocked
contactors, fusing, and an emergency stop). Verify all safety functions with real hardware before service.

Run: sudo -E env PYTHONUNBUFFERED=1 python3 pcb_firmware.py
"""
from __future__ import annotations
import csv
import os
import time
import math
import signal
import logging
from dataclasses import dataclass
from typing import Optional, Tuple

# ----------------------- GPIO / I2C backends ----------------------------------
try:
    from periphery import GPIO, I2C  # type: ignore
except Exception as e:
    raise SystemExit("Install python-periphery: pip3 install python-periphery\n" + str(e))

# ----------------------- Logging ----------------------------------------------
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
log = logging.getLogger("pcb")

# ----------------------- Config ------------------------------------------------
@dataclass
class GpioDesc:
    chip: str
    line: int
    active_high: bool = True

@dataclass
class Pins:
    # Outputs
    motor_en: GpioDesc
    sol_lock_fwd: GpioDesc  # drive to LOCK position
    sol_lock_rev: GpioDesc  # drive to UNLOCK position

    # Inputs (digital)
    flap_open_reed: GpioDesc
    door_closed_reed: GpioDesc   # True when door is closed
    mains_present: GpioDesc      # True when AC present

    # Ultrasonic (presence)
    tote_present_trig: GpioDesc
    tote_present_echo: GpioDesc

    # Ultrasonic (level)
    tote_level_trig: GpioDesc
    tote_level_echo: GpioDesc

@dataclass
class AdcConfig:
    enabled: bool = True
    i2c_dev: str = "/dev/i2c-7"  # update per your board
    addr: int = 0x48              # ADS1115 default
    # Channels: wire 0..3 to sensors through dividers/transducers
    ch_motor_current: int = 0     # 0..3; set None to disable current sensing
    ch_v5: int = 1                # 5V monitor via divider
    ch_v33: int = 2               # 3V3 monitor via divider
    # Voltage scaling (per channel) -> converts ADC volts to real-world units
    # Example: V_in = V_adc * scale; set from your resistor dividers
    scale_v5: float = (5.0/1.0)   # replace after calibrating
    scale_v33: float = (3.3/1.0)
    # Current sensing mode
    current_mode: str = "transducer"  # 'transducer' (0-5V proportional RMS) or 'ct_bias' (AC with mid-bias)
    current_scale: float = 20.0/5.0    # amps per volt (example: 0-5V => 0-20A)
    ct_bias_vmid: float = 2.048        # mid-bias volts if using CT + bias

@dataclass
class Thresholds:
    tote_present_max_cm: float = 25.0   # if distance <= this => present
    tote_level_full_cm: float = 10.0    # distance from sensor to material at "full" (calibrate)
    tote_level_empty_cm: float = 45.0   # distance at empty (used for % fill)
    mains_required: bool = True
    v5_min: float = 4.75
    v33_min: float = 3.15
    motor_overcurrent_a: float = 18.0   # trip if RMS exceeds
    motor_max_run_s: float = 120.0      # safety cap per cycle
    debounce_ms: int = 20
    ultrasonic_timeout_s: float = 0.025

@dataclass
class SolenoidConfig:
    deadtime_ms: int = 50
    max_on_s: float = 5.0               # coil on-time cap (for non-latching designs)

@dataclass
class Paths:
    cycle_log_csv: str = "/var/log/pcb/cycles.csv"

# ----------------------- GPIO helpers -----------------------------------------
class DOut:
    def __init__(self, d: GpioDesc):
        self.g = GPIO(d.chip, d.line, "out")
        self.ah = d.active_high
        self.set(False)
    def set(self, v: bool):
        self.g.write(v if self.ah else (not v))
    def close(self):
        try:
            self.set(False)
            self.g.close()
        except Exception:
            pass

class DIn:
    def __init__(self, d: GpioDesc, debounce_ms: int):
        self.g = GPIO(d.chip, d.line, "in")
        self.ah = d.active_high
        self.db_ns = debounce_ms * 1_000_000
        self._last = self.read()
        self._t = time.monotonic_ns()
    def read_raw(self) -> bool:
        v = bool(self.g.read())
        return v if self.ah else (not v)
    def read(self) -> bool:
        return self.read_raw()
    def read_db(self) -> bool:
        now = time.monotonic_ns()
        v = self.read_raw()
        if v != self._last:
            if now - self._t >= self.db_ns:
                self._last = v
                self._t = now
        else:
            self._t = now
        return self._last
    def close(self):
        try:
            self.g.close()
        except Exception:
            pass

# ----------------------- Ultrasonic (HC-SR04-like) ----------------------------
class Ultrasonic:
    def __init__(self, trig: DOut, echo: DIn, timeout_s: float):
        self.trig = trig
        self.echo = echo
        self.timeout_s = timeout_s
    def measure_cm(self) -> Optional[float]:
        # 10us trigger
        self.trig.set(False)
        time.sleep(2e-6)
        self.trig.set(True)
        time.sleep(10e-6)
        self.trig.set(False)
        # wait for echo high
        t0 = time.monotonic()
        while not self.echo.read():
            if time.monotonic() - t0 > self.timeout_s:
                return None
        start = time.monotonic()
        # wait echo low
        while self.echo.read():
            if time.monotonic() - start > self.timeout_s:
                return None
        end = time.monotonic()
        dt = end - start
        return (dt * 34300.0) / 2.0

# ----------------------- Minimal ADS1115 over periphery.I2C -------------------
class ADS1115:
    REG_CONV = 0x00
    REG_CFG = 0x01
    PGA_4V096 = 0x0200
    MODE_SINGLE = 0x0100
    DR_860SPS = 0x00E0
    MUX_BASE = 0x4000  # AINx vs GND
    OS_START = 0x8000
    OS_BUSY = 0x0000
    OS_READY = 0x8000

    def __init__(self, dev: str, addr: int):
        self.i2c = I2C(dev)
        self.addr = addr
        self.vref = 4.096  # per PGA
        self.codes = 32768.0

    def _w16(self, reg: int, val: int):
        b = bytes([reg, (val >> 8) & 0xFF, val & 0xFF])
        self.i2c.transfer(self.addr, [I2C.Message(b)])
    def _r16(self, reg: int) -> int:
        self.i2c.transfer(self.addr, [I2C.Message(bytes([reg])), I2C.Message(bytearray(2), read=True)])
        rx = self.i2c.msgs[1].data  # type: ignore[attr-defined]
        return (rx[0] << 8) | rx[1]

    def read_single(self, ch: int) -> float:
        assert 0 <= ch <= 3
        mux = self.MUX_BASE | (ch << 12)
        cfg = self.OS_START | mux | self.PGA_4V096 | self.MODE_SINGLE | self.DR_860SPS | 0x0003  # comp disabled
        self._w16(self.REG_CFG, cfg)
        # wait ready (poll ~2ms)
        t0 = time.monotonic()
        while True:
            st = self._r16(self.REG_CFG) & 0x8000
            if st == self.OS_READY:
                break
            if time.monotonic() - t0 > 0.05:
                break
        raw = self._r16(self.REG_CONV)
        # signed 16-bit
        if raw & 0x8000:
            raw = -((~raw & 0xFFFF) + 1)
        volts = (raw / self.codes) * self.vref
        return volts

    def close(self):
        try:
            self.i2c.close()
        except Exception:
            pass

# ----------------------- Solenoid Driver (double-acting) ----------------------
class DoubleSolenoid:
    def __init__(self, fwd: DOut, rev: DOut, deadtime_ms: int, max_on_s: float):
        self.fwd, self.rev = fwd, rev
        self.dead = deadtime_ms / 1000.0
        self.max_on = max_on_s
        self._on_start: Optional[float] = None
        self._pos: str = "unknown"  # 'locked' or 'unlocked' or 'moving'
    def _all_off(self):
        self.fwd.set(False); self.rev.set(False)
    def lock(self):
        self._all_off(); time.sleep(self.dead)
        self.rev.set(False); self.fwd.set(True)
        self._on_start = time.monotonic(); self._pos = "moving"
    def unlock(self):
        self._all_off(); time.sleep(self.dead)
        self.fwd.set(False); self.rev.set(True)
        self._on_start = time.monotonic(); self._pos = "moving"
    def hold(self):
        self._all_off(); self._on_start = None
    def loop(self):
        if self._on_start and (time.monotonic() - self._on_start) > self.max_on:
            self._all_off(); self._on_start = None
    def hint_position(self, locked: Optional[bool]):
        if locked is None: return
        self._pos = "locked" if locked else "unlocked"
        self._on_start = None
        self._all_off()
    @property
    def position(self) -> str:
        return self._pos

# ----------------------- Helpers ----------------------------------------------
def clamp(x, lo, hi):
    return max(lo, min(hi, x))

# ----------------------- Controller -------------------------------------------
class Controller:
    def __init__(self, pins: Pins, thr: Thresholds, solcfg: SolenoidConfig, adc_cfg: AdcConfig, paths: Paths):
        # Outputs
        self.motor_en = DOut(pins.motor_en)
        self.sol = DoubleSolenoid(DOut(pins.sol_lock_fwd), DOut(pins.sol_lock_rev), solcfg.deadtime_ms, solcfg.max_on_s)
        # Inputs
        self.flap_open = DIn(pins.flap_open_reed, thr.debounce_ms)
        self.door_closed = DIn(pins.door_closed_reed, thr.debounce_ms)
        self.mains_present = DIn(pins.mains_present, thr.debounce_ms)
        self.toteP = Ultrasonic(DOut(pins.tote_present_trig), DIn(pins.tote_present_echo, thr.debounce_ms), thr.ultrasonic_timeout_s)
        self.toteL = Ultrasonic(DOut(pins.tote_level_trig), DIn(pins.tote_level_echo, thr.debounce_ms), thr.ultrasonic_timeout_s)
        # ADC
        self.adc: Optional[ADS1115] = ADS1115(adc_cfg.i2c_dev, adc_cfg.addr) if adc_cfg.enabled else None
        self.adc_cfg = adc_cfg
        # Configs
        self.thr = thr
        self.paths = paths
        # State
        self.running = True
        self.in_cycle = False
        self.cycle_start_ts: Optional[float] = None
        self.current_samples: list[float] = []
        # Ensure safe default
        self._force_lock()
        self.motor_en.set(False)
        # Prepare log
        os.makedirs(os.path.dirname(paths.cycle_log_csv), exist_ok=True)
        if not os.path.exists(paths.cycle_log_csv):
            with open(paths.cycle_log_csv, 'w', newline='') as f:
                csv.writer(f).writerow(["start_iso","end_iso","duration_s","mean_current_a","reason"])

    # --------------- Sensing ---------------------------------------------------
    def read_ultra_cm(self, u: Ultrasonic) -> Optional[float]:
        try:
            return u.measure_cm()
        except Exception as e:
            log.warning(f"Ultrasonic read error: {e}")
            return None

    def tote_present_ok(self) -> bool:
        d = self.read_ultra_cm(self.toteP)
        return (d is not None) and (d <= self.thr.tote_present_max_cm)

    def tote_full(self) -> Optional[bool]:
        d = self.read_ultra_cm(self.toteL)
        if d is None:
            return None
        return d <= self.thr.tote_level_full_cm

    def tote_fill_percent(self) -> Optional[float]:
        d = self.read_ultra_cm(self.toteL)
        if d is None:
            return None
        empty = self.thr.tote_level_empty_cm
        full = self.thr.tote_level_full_cm
        pct = 100.0 * clamp((empty - d) / max(1.0, (empty - full)), 0.0, 1.0)
        return pct

    def pcb_power_ok(self) -> bool:
        if not self.adc: return True
        try:
            v5 = self.adc.read_single(self.adc_cfg.ch_v5) * self.adc_cfg.scale_v5 if self.adc_cfg.ch_v5 is not None else 5.0
            v33 = self.adc.read_single(self.adc_cfg.ch_v33) * self.adc_cfg.scale_v33 if self.adc_cfg.ch_v33 is not None else 3.3
            ok = (v5 >= self.thr.v5_min) and (v33 >= self.thr.v33_min)
            return ok
        except Exception as e:
            log.warning(f"ADC power read error: {e}")
            return False

    def mains_ok(self) -> bool:
        if not self.thr.mains_required:
            return True
        return self.mains_present.read_db()

    def motor_current_sample(self) -> Optional[float]:
        if not self.adc or self.adc_cfg.ch_motor_current is None:
            return None
        try:
            v = self.adc.read_single(self.adc_cfg.ch_motor_current)
            if self.adc_cfg.current_mode == "transducer":
                amps = max(0.0, v * self.adc_cfg.current_scale)
                return amps
            else:  # ct_bias RMS
                # collect a small window to compute RMS around vmid
                N = 50
                vs = []
                for _ in range(N):
                    vs.append(self.adc.read_single(self.adc_cfg.ch_motor_current))
                    time.sleep(1.0/2000.0)  # ~2 kS/s window
                vmid = self.adc_cfg.ct_bias_vmid
                squares = [(x - vmid)**2 for x in vs]
                v_rms = math.sqrt(sum(squares)/len(squares))
                amps = v_rms * self.adc_cfg.current_scale
                return amps
        except Exception as e:
            log.warning(f"ADC current read error: {e}")
            return None

    # --------------- Safety & Actuation ---------------------------------------
    def _force_lock(self):
        self.sol.lock(); time.sleep(0.1); self.sol.hold()

    def _force_unlock(self):
        self.sol.unlock(); time.sleep(0.1); self.sol.hold()

    def safety_allows_unlock(self) -> bool:
        door_ok = self.door_closed.read_db()
        present = self.tote_present_ok()
        full = self.tote_full()
        mains = self.mains_ok()
        pcb_ok = self.pcb_power_ok()
        if full is None:
            # if level unknown, be conservative: keep locked
            return False
        return door_ok and present and (not full) and mains and pcb_ok

    def safety_allows_motor(self) -> bool:
        return self.safety_allows_unlock()  # motor allowed iff unlock would be allowed

    # --------------- Cycle handling -------------------------------------------
    def start_cycle(self):
        self.in_cycle = True
        self.cycle_start_ts = time.time()
        self.current_samples.clear()
        self.motor_en.set(True)
        log.info("Motor ENABLED (cycle start)")

    def end_cycle(self, reason: str):
        self.motor_en.set(False)
        end_ts = time.time()
        dur = (end_ts - (self.cycle_start_ts or end_ts))
        mean_a = (sum(self.current_samples)/len(self.current_samples)) if self.current_samples else 0.0
        self._log_cycle(self.cycle_start_ts, end_ts, dur, mean_a, reason)
        self.in_cycle = False
        self.cycle_start_ts = None
        log.info(f"Motor DISABLED (cycle end) reason={reason} dur={dur:.2f}s Imean={mean_a:.2f}A")

    def _log_cycle(self, start_ts: Optional[float], end_ts: float, dur: float, mean_a: float, reason: str):
        try:
            with open(self.paths.cycle_log_csv, 'a', newline='') as f:
                w = csv.writer(f)
                start_iso = time.strftime('%Y-%m-%dT%H:%M:%S', time.localtime(start_ts or end_ts))
                end_iso = time.strftime('%Y-%m-%dT%H:%M:%S', time.localtime(end_ts))
                w.writerow([start_iso, end_iso, f"{dur:.3f}", f"{mean_a:.3f}", reason])
        except Exception as e:
            log.warning(f"Failed to write cycle log: {e}")

    # --------------- Main loop -------------------------------------------------
    def run(self):
        def _sig(*_):
            self.running = False
        signal.signal(signal.SIGINT, _sig)
        signal.signal(signal.SIGTERM, _sig)

        # Boot policy: try to set correct lock state
        if self.safety_allows_unlock():
            self._force_unlock()
        else:
            self._force_lock()

        t_last_status = 0.0
        while self.running:
            # Housekeeping solenoid
            self.sol.loop()

            # Evaluate safety & flap request
            safe_to_unlock = self.safety_allows_unlock()
            flap_open = self.flap_open.read_db()

            # Maintain lock state continuously
            if safe_to_unlock:
                # keep unlocked if safe
                if self.sol.position != "unlocked":
                    self._force_unlock()
            else:
                if self.sol.position != "locked":
                    self._force_lock()

            # Cycle state machine
            if not self.in_cycle:
                if flap_open and self.safety_allows_motor():
                    self.start_cycle()
            else:
                # During cycle: gather current, watch for faults, exit conditions
                ia = self.motor_current_sample()
                if ia is not None:
                    self.current_samples.append(ia)
                    if ia > self.thr.motor_overcurrent_a:
                        self.end_cycle("overcurrent")
                        self._force_lock()
                        continue
                # Faults stop motor immediately
                if not self.safety_allows_motor():
                    self.end_cycle("safety_fault")
                    self._force_lock()
                    continue
                # Natural end: flap closed OR max time
                if (not flap_open) or ((time.time() - (self.cycle_start_ts or time.time())) > self.thr.motor_max_run_s):
                    self.end_cycle("complete" if not flap_open else "timeout")

            # (optional) periodic status log
            now = time.time()
            if now - t_last_status > 1.0:
                present = self.tote_present_ok()
                full = self.tote_full()
                pct = self.tote_fill_percent()
                log.debug(f"status: mains={self.mains_ok()} pcb_ok={self.pcb_power_ok()} door_closed={self.door_closed.read_db()} present={present} full={full} fill%={pct}")
                t_last_status = now

            time.sleep(0.01)

        # Shutdown
        self.motor_en.set(False)
        self._force_lock()
        # Close devices
        try:
            self.sol.fwd.close(); self.sol.rev.close()
            self.flap_open.close(); self.door_closed.close(); self.mains_present.close()
            self.toteP.trig.close(); self.toteP.echo.close(); self.toteL.trig.close(); self.toteL.echo.close()
            if self.adc: self.adc.close()
            self.motor_en.close()
        except Exception:
            pass

# ----------------------- Entrypoint -------------------------------------------
if __name__ == "__main__":
    # >>>>>>>>>>>>>>>>>>>>>>>  REPLACE THESE PIN MAPS  <<<<<<<<<<<<<<<<<<<<<<<<<
    pins = Pins(
        motor_en=GpioDesc("/dev/gpiochip4", 16, True),
        sol_lock_fwd=GpioDesc("/dev/gpiochip4", 17, True),
        sol_lock_rev=GpioDesc("/dev/gpiochip4", 18, True),
        flap_open_reed=GpioDesc("/dev/gpiochip4", 19, True),
        door_closed_reed=GpioDesc("/dev/gpiochip4", 20, True),
        mains_present=GpioDesc("/dev/gpiochip4", 21, True),
        tote_present_trig=GpioDesc("/dev/gpiochip4", 22, True),
        tote_present_echo=GpioDesc("/dev/gpiochip4", 23, True),
        tote_level_trig=GpioDesc("/dev/gpiochip4", 24, True),
        tote_level_echo=GpioDesc("/dev/gpiochip4", 25, True),
    )

    thr = Thresholds(
        tote_present_max_cm=25.0,
        tote_level_full_cm=10.0,
        tote_level_empty_cm=45.0,
        mains_required=True,
        v5_min=4.75,
        v33_min=3.15,
        motor_overcurrent_a=18.0,
        motor_max_run_s=120.0,
        debounce_ms=20,
        ultrasonic_timeout_s=0.025,
    )

    solcfg = SolenoidConfig(deadtime_ms=50, max_on_s=5.0)

    adc_cfg = AdcConfig(
        enabled=True,
        i2c_dev="/dev/i2c-7",
        addr=0x48,
        ch_motor_current=0,
        ch_v5=1,
        ch_v33=2,
        scale_v5=2.0,    # TODO: set per your divider
        scale_v33=1.0,   # TODO: set per your divider
        current_mode="transducer",  # or 'ct_bias'
        current_scale=4.0,           # amps per volt (set to your transducer)
        ct_bias_vmid=2.048,
    )

    paths = Paths(cycle_log_csv="/var/log/pcb/cycles.csv")

    ctl = Controller(pins, thr, solcfg, adc_cfg, paths)
    ctl.run()

"""
# -----------------------
# SYSTEMD SERVICE (example)
# -----------------------
# /etc/systemd/system/pcb-firmware.service
# [Unit]
# Description=PCB Control Firmware
# After=network.target
#
# [Service]
# Type=simple
# ExecStart=/usr/bin/env python3 /usr/local/bin/pcb_firmware.py
# Restart=always
# RestartSec=2
# User=root
#
# [Install]
# WantedBy=multi-user.target
#
# Install steps:
#   sudo cp pcb_firmware.py /usr/local/bin/
#   sudo chmod +x /usr/local/bin/pcb_firmware.py
#   sudo systemctl daemon-reload
#   sudo systemctl enable --now pcb-firmware.service
"""
