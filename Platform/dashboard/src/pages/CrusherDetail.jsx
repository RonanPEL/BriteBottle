// dashboard/src/pages/CrusherDetail.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardHeader, CardBody } from "../components/ui";
import { fetchCrusherById, lockCrusher } from "../api";
import ServiceReportsPanel from "../components/ServiceReportsPanel";
import SubscriptionsPanel from "../components/SubscriptionsPanel";
import InstallsPanel from "../components/InstallsPanel";
import {
  ArrowLeft,
  Thermometer,
  Zap,
  MapPin,
  Hash,
  Lock,
  Factory,
  Wrench,
  AlertTriangle,
  CreditCard,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { buildEventsFromCrusher } from "../lib/events";
import { fetchCrusherEvents } from "../api";

// --- small utils ---
const fmt = {
  pct: (v) => `${Math.round(Number(v || 0) * 100)}%`,
  c: (v) => `${Number(v ?? 0).toFixed(1)}°C`,
  v: (v) => `${Number(v ?? 0).toFixed(0)} V`,
  time: (iso) => (iso ? new Date(iso).toLocaleString() : "—"),
};

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

// --- Half donut gauge ---
function HalfDonut({ value = 0, label = "Fill Level" }) {
  const pct = Math.max(0, Math.min(1, Number(value)));
  const end = Math.PI * (1 - pct); // sweep from left to right
  const R = 70;
  const cx = 80;
  const cy = 80;

  const arc = (from, to, color, width) => {
    const x1 = cx + R * Math.cos(from);
    const y1 = cy + R * Math.sin(from);
    const x2 = cx + R * Math.cos(to);
    const y2 = cy + R * Math.sin(to);
    const large = Math.abs(to - from) > Math.PI ? 1 : 0;
    return (
      <path
        d={`M ${x1} ${y1} A ${R} ${R} 0 ${large} 0 ${x2} ${y2}`}
        stroke={color}
        strokeWidth={width}
        fill="none"
        strokeLinecap="round"
      />
    );
  };

  return (
    <div className="flex flex-col items-center">
      <svg width="160" height="100" viewBox="0 0 160 100">
        {/* track */}
        {arc(Math.PI, 0, "rgba(15,23,42,.12)", 16)}
        {/* value */}
        {arc(Math.PI, end, "#0ea5e9", 16)}
      </svg>
      <div className="text-xl font-semibold text-slate-800">{fmt.pct(pct)}</div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

export default function CrusherDetail() {
  const { id } = useParams();
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("details");
  const [lockHours, setLockHours] = useState(1);
  const [locking, setLocking] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      setErr("");
      setLoading(true);
      try {
        const data = await fetchCrusherById(id);
        if (mounted) setC(data);
      } catch (e) {
        if (mounted) setErr(e?.message || "Failed to load crusher");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  // Build a tiny fallback series when no history present, so chart always shows something
  const series = useMemo(() => {
    const hist = c?.telemetryHistory || c?.metrics?.history || null;
    if (Array.isArray(hist) && hist.length) {
      return hist.map((d) => ({
        t: d.t || d.time || d.ts || "",
        fill: d.fillLevel ?? d.fill ?? null,
        temp: d.temperature ?? null,
        volt: d.voltage ?? d.mainsVoltage ?? null,
        rssi: d.signal ?? d.rssi ?? null,
      }));
    }
    // fallback synth around current values
    const now = Date.now();
    const currentFill = Number(c?.fillLevel ?? 0);
    const currentTemp = Number(c?.temperature ?? 22);
    const currentVolt = Number(c?.mainsVoltage ?? 230);
    const currentRssi = Number(c?.signalStrength ?? -75);
    return new Array(12).fill(0).map((_, i) => ({
      t: new Date(now - (11 - i) * 5 * 60 * 1000).toLocaleTimeString(),
      fill: Math.max(0, Math.min(1, currentFill + Math.sin(i / 2) * 0.03)),
      temp: currentTemp + Math.sin(i / 3) * 0.5,
      volt: currentVolt + Math.sin(i / 4) * 1.5,
      rssi: currentRssi + Math.sin(i / 2) * 2,
    }));
  }, [c]);

  async function onLock() {
    if (!c) return;
    setLocking(true);
    try {
      await lockCrusher(c.id, Number(lockHours) || 1);
      alert("Machine locked.");
    } catch (e) {
      // 404 friendly.
      alert(e?.message || "Could not lock machine (endpoint missing?)");
    } finally {
      setLocking(false);
    }
  }

  if (loading) return <div className="p-6 text-slate-500">Loading…</div>;
  if (err) return <div className="p-6 text-red-600">{err}</div>;
  if (!c) return <div className="p-6 text-slate-500">Not found.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/crushers"
            className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <h1 className="text-lg font-semibold text-slate-800">{c.name}</h1>
          <span
            className={classNames(
              "rounded-full px-2 py-0.5 text-xs",
              c.status === "warning"
                ? "bg-amber-100 text-amber-700"
                : c.status === "error"
                ? "bg-rose-100 text-rose-700"
                : "bg-emerald-100 text-emerald-700"
            )}
          >
            {String(c.status || "ok").toUpperCase()}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* LEFT PANEL */}
        <aside className="col-span-12 lg:col-span-3">
          <Card className="sticky top-20">
            <CardBody>
              <HalfDonut value={c.fillLevel ?? 0} />
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Thermometer className="h-4 w-4" />
                    Temperature
                  </div>
                  <div className="font-medium text-slate-800">{fmt.c(c.temperature)}</div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Zap className="h-4 w-4" />
                    Mains Voltage
                  </div>
                  <div className="font-medium text-slate-800">{fmt.v(c.mainsVoltage)}</div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Hash className="h-4 w-4" />
                    Serial
                  </div>
                  <div className="font-medium text-slate-800">{c.serial || "—"}</div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-slate-500">
                    <MapPin className="h-4 w-4" />
                    Location
                  </div>
                  <div className="font-medium text-slate-800 text-right">{c.location || "—"}</div>
                </div>
              </div>
            </CardBody>
          </Card>
        </aside>

        {/* RIGHT CONTENT */}
        <section className="col-span-12 lg:col-span-9 space-y-4">
          {/* Tabs bar */}
          <div className="flex gap-2">
            {[
              ["details", "Details"],
              ["dev", "Developer Readings"],
              ["service", "Service Report"],
              ["subs", "Subscriptions"],
              ["installs", "Installs"],
              ["logs", "Logs"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={classNames(
                  "px-3 py-1.5 rounded-xl text-sm border",
                  tab === key
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* DETAILS TAB */}
          {tab === "details" && (
            <>
              <Card>
                <CardHeader>
                  <div className="text-base font-medium">Sensor Readings</div>
                </CardHeader>
                <CardBody>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={series}>
                        <XAxis dataKey="t" hide />
                        <YAxis yAxisId="left" />
                        <YAxis orientation="right" yAxisId="right" />
                        <Tooltip />
                        <Legend />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="fill"
                          name="Fill Level"
                          dot={false}
                        />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="temp"
                          name="Temperature"
                          dot={false}
                        />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="volt"
                          name="Voltage"
                          dot={false}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="rssi"
                          name="GSM Signal (RSSI)"
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <div className="text-base font-medium">Details</div>
                </CardHeader>
                <CardBody>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Detail label="Machine Status" value={String(c.status || "ok").toUpperCase()} />
                    <Detail label="Date Synced" value={fmt.time(c.lastSync)} />
                    <Detail label="Tote Empty Level" value={fmt.pct(c.toteEmptyLevel ?? 0)} />
                    <Detail label="Tote Full Level" value={fmt.pct(c.toteFullLevel ?? 1)} />
                    <Detail label="Owner" value={c.customer || "—"} />
                    <Detail label="Machine Model" value={c.type || "—"} />
                  </div>

                  <div className="mt-6">
                    <div className="text-sm font-medium text-slate-700 mb-2">
                      Lock Machine
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        className="w-24 rounded-xl border border-slate-300/60 bg-transparent px-3 py-2 text-sm focus:ring-0 focus:border-slate-300"
                        value={lockHours}
                        onChange={(e) => setLockHours(e.target.value)}
                      />
                      <span className="text-sm text-slate-600">hours</span>
                      <button
                        onClick={onLock}
                        disabled={locking}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-60"
                      >
                        <Lock className="h-4 w-4" />
                        {locking ? "Locking…" : "Lock"}
                      </button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </>
          )}

          {/* DEVELOPER READINGS TAB */}
          {tab === "dev" && (
            <Card>
              <CardHeader>
                <div className="text-base font-medium">Developer Readings</div>
              </CardHeader>
              <CardBody>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Detail label="Firmware Version" value={c.firmwareVersion || c.fw || "—"} />
                  <Detail label="SIM Card Information" value={c.simInfo || c.simcard || "—"} />
                  <Detail label="Mains Voltage" value={fmt.v(c.mainsVoltage)} />
                  <Detail label="Service Hours on Motor" value={c.serviceHours ?? "—"} />
                  <Detail label="Lifetime Flap Openings" value={c.lifetimeFlapOpenings ?? "—"} />
                  <Detail label="Lifetime Door Openings" value={c.lifetimeDoorOpenings ?? "—"} />
                  <Detail label="Lifetime Hammer Jammed Events" value={c.lifetimeHammerJammed ?? "—"} />
                </div>
              </CardBody>
            </Card>
          )}

          {/* SERVICE REPORT TAB */}
          {tab === "service" && (
            <Card>
              <CardHeader>
                <div className="text-base font-medium">Service Reports</div>
              </CardHeader>
              <CardBody>
                <ServiceReportsPanel crusher={c} onChange={setC} />
              </CardBody>
            </Card>
          )}

          {/* SUBSCRIPTIONS TAB */}
          {tab === "subs" && (
            <Card>
              <CardHeader>
                <div className="text-base font-medium">Subscriptions</div>
              </CardHeader>
              <CardBody>
                <SubscriptionsPanel crusher={c} onChange={setC} />
              </CardBody>
            </Card>
          )}

          {/* INSTALLS TAB */}
          {tab === "installs" && (
            <Card>
              <CardHeader>
                <div className="text-base font-medium">Installs</div>
              </CardHeader>
              <CardBody>
                <InstallsPanel crusher={c} onChange={setC} />
              </CardBody>
            </Card>
          )}

          {/* LOGS TAB */}
          {tab === "logs" && (
            <Card>
              <CardHeader>
                <div className="text-base font-medium">Logs</div>
              </CardHeader>
              <CardBody>
                <LogsPanel crusher={c} />
              </CardBody>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm text-slate-800 mt-0.5">{value ?? "—"}</div>
    </div>
  );
}

/** Single Logs panel*/
function iconForType(t) {
  const k = String(t || "").toUpperCase();
  if (k === "SERVICE") return <Wrench size={14} />;
  if (k === "ALERT") return <AlertTriangle size={14} />;
  if (k === "INSTALL") return <MapPin size={14} />;
  if (k === "SUBSCRIPTION") return <CreditCard size={14} />;
  if (k === "CREATED") return <Factory size={14} />;
  return <span className="inline-block w-3 h-3 rounded-full bg-slate-300" />;
}

function LogsPanel({ crusher }) {
  const crusherId = crusher?.id;
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [types, setTypes] = useState([]); // optional type filter here too
  const [cursor, setCursor] = useState(null);
  const [q, setQ] = useState("");

  async function load(reset = false) {
    if (!crusherId) return;
    setBusy(true); setErr("");
    try {
      const page = await fetchCrusherEvents(crusherId, {
        types,
        limit: 100,
        before: reset ? null : cursor
      });
      const merged = reset ? page : [...events, ...page];
      setEvents(merged);
      const last = merged[merged.length - 1];
      setCursor(last ? last.ts : null);
    } catch (e) {
      setErr(e.message || "Failed to load logs");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(true); }, [crusherId]);
  useEffect(() => { load(true); }, [crusherId, JSON.stringify(types)]);

  const filtered = useMemo(() => {
    if (!q.trim()) return events;
    const needle = q.trim().toLowerCase();
    return events.filter(e =>
      `${e.type} ${e.message || ""} ${e.source || ""}`.toLowerCase().includes(needle)
    );
  }, [events, q]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search logs…"
          aria-label="Search logs"
          className="px-3 py-1.5 w-full md:w-80 rounded-xl border border-slate-300/60 text-sm focus:border-slate-300 focus:ring-0"
        />
      </div>

      {err && <div className="text-rose-600 text-sm">{err}</div>}

      <div className="overflow-auto rounded-xl border border-slate-200">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 w-[160px]">When</th>
              <th className="px-3 py-2 w-[220px]">Type</th>
              <th className="px-3 py-2">Message</th>
              <th className="px-3 py-2 w-[220px]">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-slate-500">No logs for this crusher.</td>
              </tr>
            ) : (
              filtered.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{formatWhen(e.ts)}</td>
                  <td className="px-3 py-2 text-slate-900 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-slate-100">
                        {iconForType(e.type)}
                      </span>
                      <span className="uppercase text-xs tracking-wide text-slate-600">{e.type}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-900">{e.message || "—"}</td>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{e.source || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center">
        <button
          onClick={() => load(false)}
          disabled={busy || !cursor}
          className="px-3 py-1.5 rounded-lg border border-slate-300/60 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? "Loading…" : (cursor ? "Load more" : "End of feed")}
        </button>
      </div>
    </div>
  );
}

function formatWhen(ts) {
  try {
    const d = new Date(ts);
    if (!Number.isFinite(d.getTime())) return "—";
    const now = Date.now();
    const diff = Math.floor((now - d.getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleString();
  } catch {
    return "—";
  }
}
