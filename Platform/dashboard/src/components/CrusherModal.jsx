// dashboard/src/components/CrusherModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import { X, RefreshCw } from "lucide-react";
import { lookupCrusherBySerial } from "../api";

export default function CrusherModal({
  open,
  mode = "add",                  // "add" | "edit"
  initial = {},                  // crusher draft when editing
  onClose,
  onSubmit,
}) {
  const [draft, setDraft] = useState(() => ({
    name: "",
    type: "BB01",
    location: "",
    serial: "",
    customer: "",
    fillLevel: 0,
    mainsVoltage: 0,
    temperature: 0,
    status: "ok",
    lastSync: null,
    lat: 0,
    lng: 0,
    ...initial,
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) {
      setDraft((d) => ({
        ...d,
        name: initial.name ?? "",
        type: initial.type ?? "BB01",
        location: initial.location ?? "",
        serial: initial.serial ?? "",
        customer: initial.customer ?? "",
        fillLevel: Number(initial.fillLevel ?? 0),
        mainsVoltage: Number(initial.mainsVoltage ?? 0),
        temperature: Number(initial.temperature ?? 0),
        status: initial.status ?? "ok",
        lastSync: initial.lastSync ?? null,
        lat: Number(initial.lat ?? 0),
        lng: Number(initial.lng ?? 0),
      }));
      setErr("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  function setField(k, v) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  async function handleLookup() {
    if (!draft.serial) return setErr("Enter a serial first.");
    setBusy(true);
    setErr("");
    try {
      const res = await lookupCrusherBySerial(draft.serial);
      if (res?.meta) {
        setDraft((d) => ({
          ...d,
          type: res.meta.type ?? d.type,
          location: res.meta.location ?? d.location,
          customer: res.meta.customer ?? d.customer,
          mainsVoltage: Number(res.meta.mainsVoltage ?? d.mainsVoltage),
          temperature: Number(res.meta.temperature ?? d.temperature),
          fillLevel: Number(res.meta.fillLevel ?? d.fillLevel),
          lastSync: res.meta.lastSync ?? d.lastSync,
          // keep serial as entered (res.meta.serial echoes it anyway)
        }));
      }
    } catch (e) {
      setErr(e?.message || "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      await onSubmit?.(draft);
      onClose?.();
    } catch (e) {
      setErr(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/30 grid place-items-center p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold">
            {mode === "edit" ? "Edit Machine" : "Add Machine"}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 p-3 text-sm">
              {err}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-slate-600">Machine Type</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-300/60 bg-white px-3 py-2"
                value={draft.type}
                onChange={(e) => setField("type", e.target.value)}
              >
                <option value="BB01">BB01</option>
                <option value="BB06">BB06</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-sm text-slate-600">Name</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300/60 bg-transparent px-3 py-2"
                value={draft.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="Optional display name"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm text-slate-600">Serial number</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  className="flex-1 rounded-xl border border-slate-300/60 bg-transparent px-3 py-2"
                  value={draft.serial}
                  onChange={(e) => setField("serial", e.target.value)}
                  placeholder="PEL-XX-000000"
                />
                <button
                  onClick={handleLookup}
                  disabled={!draft.serial || busy}
                  title="Fetch from PCB (stub)"
                  className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
                  Sync
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Enter PCB serial, then click Sync to auto-fill from device (stubbed for now).
              </p>
            </div>

            <div>
              <label className="text-sm text-slate-600">Location</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300/60 bg-transparent px-3 py-2"
                value={draft.location}
                onChange={(e) => setField("location", e.target.value)}
                placeholder="City, Country"
              />
            </div>

            <div>
              <label className="text-sm text-slate-600">Customer</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300/60 bg-transparent px-3 py-2"
                value={draft.customer}
                onChange={(e) => setField("customer", e.target.value)}
                placeholder="Company or site"
              />
            </div>

            <div>
              <label className="text-sm text-slate-600">Mains Voltage (V)</label>
              <input
                type="number"
                className="mt-1 w-full rounded-xl border border-slate-300/60 bg-transparent px-3 py-2"
                value={draft.mainsVoltage}
                onChange={(e) => setField("mainsVoltage", Number(e.target.value))}
              />
            </div>

            <div>
              <label className="text-sm text-slate-600">Temperature (°C)</label>
              <input
                type="number"
                className="mt-1 w-full rounded-xl border border-slate-300/60 bg-transparent px-3 py-2"
                value={draft.temperature}
                onChange={(e) => setField("temperature", Number(e.target.value))}
              />
            </div>

            <div>
              <label className="text-sm text-slate-600">Fill level (0–1)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                className="mt-1 w-full rounded-xl border border-slate-300/60 bg-transparent px-3 py-2"
                value={draft.fillLevel}
                onChange={(e) => setField("fillLevel", Number(e.target.value))}
              />
            </div>

            <div>
              <label className="text-sm text-slate-600">Status</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-300/60 bg-white px-3 py-2"
                value={draft.status}
                onChange={(e) => setField("status", e.target.value)}
              >
                <option value="ok">ok</option>
                <option value="warning">warning</option>
                <option value="offline">offline</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-50"
          >
            {mode === "edit" ? "Save changes" : "Add machine"}
          </button>
        </div>
      </div>
    </div>
  );
}
