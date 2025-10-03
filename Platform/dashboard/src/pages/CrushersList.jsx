// dashboard/src/pages/CrushersList.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardBody } from "../components/ui";
import {
  fetchCrushers,
  createCrusher,
  updateCrusher,
  deleteCrusher,
  // NEW: serial sync helper (expects GET /crushers/sync-serial?serial=...)
  syncCrusherBySerial,
} from "../api";
import {
  AlertTriangle,
  Loader2,
  Search,
  ExternalLink,
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  RefreshCcw, // icon for serial sync
} from "lucide-react";

const inputClass =
  "rounded-xl border border-slate-300/60 bg-transparent px-3 py-2 text-sm " +
  "text-slate-900 placeholder-slate-500 focus:border-slate-300 focus:ring-0";

function StatusDot({ status = "ok" }) {
  const color =
    status === "ok"
      ? "bg-emerald-500"
      : status === "warning"
      ? "bg-amber-500"
      : status === "error"
      ? "bg-rose-500"
      : "bg-slate-400";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

function FillBar({ value }) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(value || 0) * 100)));
  const color = pct < 50 ? "bg-emerald-500" : pct < 80 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="w-full">
      <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
        <div className={`h-full ${color} transition-[width] duration-300`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs tabular-nums text-slate-600">{pct}%</div>
    </div>
  );
}

function fmtVolt(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `${Number(v)} V`;
}
function fmtTemp(t) {
  if (t == null || Number.isNaN(Number(t))) return "—";
  return `${Number(t).toFixed(1)} °C`;
}
function timeAgo(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 0) return d.toLocaleString();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dys = Math.floor(h / 24);
  if (dys < 7) return `${dys}d ago`;
  return d.toLocaleDateString();
}

/** Quick editor modal with Serial Sync */
function EditorModal({ open, draft, onChange, onClose, onSave, onSyncSerial, saving }) {
  const [syncing, setSyncing] = useState(false);
  const [syncErr, setSyncErr] = useState("");

  if (!open) return null;

  function setField(k, v) {
    onChange({ ...draft, [k]: v });
  }

  async function handleSync() {
    setSyncErr("");
    const serial = (draft.serial || "").trim();
    if (!serial) {
      setSyncErr("Enter a serial number first.");
      return;
    }
    setSyncing(true);
    try {
      const info = await onSyncSerial(serial);
      // Merge only known fields; keep user edits for others
      onChange({
        ...draft,
        serial: info.serial ?? draft.serial,
        type: info.type ?? draft.type,
        location: info.location ?? draft.location,
        customer: info.customer ?? draft.customer,
        mainsVoltage: info.mainsVoltage ?? draft.mainsVoltage,
        temperature: info.temperature ?? draft.temperature,
        fillLevel: info.fillLevel ?? draft.fillLevel,
        lastSync: info.lastSync ?? new Date().toISOString(),
      });
    } catch (e) {
      setSyncErr(e?.message || "Failed to sync from PCB");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/30 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl border border-slate-200">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="text-base font-semibold">
            {draft?.id ? "Edit machine" : "Add machine"}
          </div>
          <button className="rounded-lg p-1 hover:bg-slate-100" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-slate-600">Machine Type</label>
            <input
              className={inputClass}
              value={draft.type || ""}
              onChange={(e) => setField("type", e.target.value)}
              placeholder="BB01 / BB06…"
            />
          </div>

          <div>
            <label className="text-sm text-slate-600">Display Name</label>
            <input
              className={inputClass}
              value={draft.name || ""}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="PEL Office"
            />
          </div>

          <div>
            <label className="text-sm text-slate-600">Location</label>
            <input
              className={inputClass}
              value={draft.location || ""}
              onChange={(e) => setField("location", e.target.value)}
              placeholder="Ballindine, Mayo"
            />
          </div>

          {/* Serial + Sync */}
          <div>
            <label className="text-sm text-slate-600 flex items-center justify-between">
              <span>Serial Number</span>
              <button
                type="button"
                onClick={handleSync}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs border hover:bg-slate-50"
                title="Sync from PCB"
                disabled={syncing}
              >
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                Sync
              </button>
            </label>
            <input
              className={inputClass}
              value={draft.serial || ""}
              onChange={(e) => setField("serial", e.target.value)}
              placeholder="SN-000123"
            />
            {syncErr && <div className="mt-1 text-xs text-rose-600">{syncErr}</div>}
          </div>

          <div>
            <label className="text-sm text-slate-600">Customer</label>
            <input
              className={inputClass}
              value={draft.customer || ""}
              onChange={(e) => setField("customer", e.target.value)}
              placeholder="PEL"
            />
          </div>

          <div>
            <label className="text-sm text-slate-600">Fill Level (0–1)</label>
            <input
              className={inputClass}
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={draft.fillLevel ?? ""}
              onChange={(e) =>
                setField("fillLevel", e.target.value === "" ? "" : Number(e.target.value))
              }
              placeholder="0.42"
            />
          </div>

          <div>
            <label className="text-sm text-slate-600">Mains Voltage (V)</label>
            <input
              className={inputClass}
              type="number"
              value={draft.mainsVoltage ?? ""}
              onChange={(e) =>
                setField("mainsVoltage", e.target.value === "" ? "" : Number(e.target.value))
              }
              placeholder="230"
            />
          </div>

          <div>
            <label className="text-sm text-slate-600">Temperature (°C)</label>
            <input
              className={inputClass}
              type="number"
              step="0.1"
              value={draft.temperature ?? ""}
              onChange={(e) =>
                setField("temperature", e.target.value === "" ? "" : Number(e.target.value))
              }
              placeholder="22.0"
            />
          </div>
        </div>

        <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
          <button className="rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50" onClick={onClose}>
            Cancel
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-60"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CrushersList() {
  const [crushers, setCrushers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set());

  // editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorDraft, setEditorDraft] = useState({});
  const [saving, setSaving] = useState(false);

  const allIds = useMemo(() => crushers.map((c) => c.id), [crushers]);
  const allSelected = selected.size > 0 && selected.size === crushers.length;
  const someSelected = selected.size > 0 && selected.size < crushers.length;

  const headCheckboxRef = useRef(null);
  useEffect(() => {
    if (headCheckboxRef.current) headCheckboxRef.current.indeterminate = someSelected;
  }, [someSelected]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const data = await fetchCrushers();
      setCrushers(Array.isArray(data) ? data : []);
      setSelected(new Set()); // reset selection on refresh
    } catch (e) {
      setErr(e?.message || "Failed to load crushers");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return crushers;
    return crushers.filter((c) => {
      const hay = [c.name, c.type, c.location, c.serial, c.customer, c.status].map((x) =>
        String(x || "").toLowerCase()
      );
      return hay.some((h) => h.includes(q));
    });
  }, [crushers, query]);

  function toggleAll(checked) {
    if (checked) setSelected(new Set(allIds));
    else setSelected(new Set());
  }
  function toggleOne(id, checked) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // --- CRUD handlers ---
  function onAdd() {
    setEditorDraft({
      id: undefined,
      name: "",
      type: "",
      location: "",
      serial: "",
      customer: "",
      fillLevel: 0,
      mainsVoltage: 0,
      temperature: 0,
      status: "ok",
      lastSync: null,
      alertsCount: 0,
    });
    setEditorOpen(true);
  }
  function onEdit(row) {
    setEditorDraft({ ...row });
    setEditorOpen(true);
  }

  async function onSaveEditor() {
    setSaving(true);
    try {
      if (editorDraft.id) {
        // EDIT → PATCH
        const payload = {
          name: editorDraft.name,
          type: editorDraft.type,
          location: editorDraft.location,
          serial: editorDraft.serial,
          customer: editorDraft.customer,
          fillLevel: editorDraft.fillLevel,
          mainsVoltage: editorDraft.mainsVoltage,
          temperature: editorDraft.temperature,
          status: editorDraft.status,
          lastSync: editorDraft.lastSync,
        };
        const saved = await updateCrusher(editorDraft.id, payload);
        setCrushers((list) => list.map((c) => (c.id === editorDraft.id ? { ...c, ...saved } : c)));
      } else {
        // ADD → POST
        const payload = {
          name: editorDraft.name,
          type: editorDraft.type,
          location: editorDraft.location,
          serial: editorDraft.serial,
          customer: editorDraft.customer,
          fillLevel: editorDraft.fillLevel,
          mainsVoltage: editorDraft.mainsVoltage,
          temperature: editorDraft.temperature,
          status: editorDraft.status,
          lastSync: editorDraft.lastSync,
        };
        const created = await createCrusher(payload);
        setCrushers((list) => [created, ...list]);
      }
      setEditorOpen(false);
    } catch (e) {
      alert(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(row) {
    if (!confirm(`Delete machine "${row.name || row.id}"?`)) return;
    // optimistic remove
    const prev = crushers;
    setCrushers((list) => list.filter((c) => c.id !== row.id));
    try {
      await deleteCrusher(row.id);
    } catch (e) {
      alert(e?.message || "Failed to delete");
      setCrushers(prev); // revert on failure
    }
  }

  // --- Serial sync wiring (passed into modal) ---
  async function handleSyncSerial(serial) {
    // calls api helper which hits GET /crushers/sync-serial?serial=...
    const info = await syncCrusherBySerial(serial);
    return info || {};
  }

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center justify-between px-1">
        <h1 className="text-lg font-semibold">Crushers</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white px-3 py-2 text-sm hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className={`${inputClass} pl-8`}
              placeholder="Search type, location, serial, customer…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            onClick={load}
            className="rounded-xl border px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 p-3 text-sm">
          {err}
        </div>
      )}

      {selected.size > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm flex items-center justify-between">
          <div className="text-slate-700">{selected.size} selected</div>
          <div className="flex items-center gap-2">
            <button className="rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50">
              Export CSV
            </button>
            <button className="rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50">
              Assign Route
            </button>
            <button
              className="rounded-xl border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="text-base font-medium">Machines</div>
        </CardHeader>
        <CardBody>
          {loading ? (
            <div className="flex items-center gap-2 text-slate-500 p-3">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-2 pr-3 w-[36px]">
                      <input
                        ref={headCheckboxRef}
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={allSelected}
                        onChange={(e) => toggleAll(e.target.checked)}
                        aria-label="Select all"
                      />
                    </th>
                    <th className="pb-2 pr-3 w-[18%]">Machine Type</th>
                    <th className="pb-2 pr-3 w-[16%]">Location</th>
                    <th className="pb-2 pr-3 w-[16%]">Serial Number</th>
                    <th className="pb-2 pr-3 w-[14%]">Fill Level</th>
                    <th className="pb-2 pr-3 w-[10%]">Mains Voltage</th>
                    <th className="pb-2 pr-3 w-[10%]">Temperature</th>
                    <th className="pb-2 pr-3 w-[14%]">Customer</th>
                    <th className="pb-2 pr-3 w-[12%]">Last synced</th>
                    <th className="pb-2 pr-3 w-[8%]">Alerts</th>
                    <th className="pb-2 text-right w-[14%]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 align-top">
                      <td className="py-3 pr-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300"
                          checked={selected.has(c.id)}
                          onChange={(e) => toggleOne(c.id, e.target.checked)}
                          aria-label={`Select ${c.name || c.id}`}
                        />
                      </td>

                      {/* type + status */}
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2">
                          <StatusDot status={c.status} />
                          <div className="font-medium text-slate-800">{c.type || "—"}</div>
                        </div>
                        <div className="text-xs text-slate-500">{c.name || c.id}</div>
                      </td>

                      {/* location */}
                      <td className="py-3 pr-3">
                        <div className="text-slate-700">{c.location || "—"}</div>
                      </td>

                      {/* serial */}
                      <td className="py-3 pr-3">
                        <div className="font-mono text-slate-800">{c.serial || "—"}</div>
                      </td>

                      {/* fill */}
                      <td className="py-3 pr-3">
                        <FillBar value={c.fillLevel} />
                      </td>

                      {/* mains voltage */}
                      <td className="py-3 pr-3">
                        <div className="text-slate-700 tabular-nums">{fmtVolt(c.mainsVoltage)}</div>
                      </td>

                      {/* temp */}
                      <td className="py-3 pr-3">
                        <div className="text-slate-700 tabular-nums">{fmtTemp(c.temperature)}</div>
                      </td>

                      {/* customer */}
                      <td className="py-3 pr-3">
                        <div className="text-slate-700">{c.customer || "—"}</div>
                      </td>

                      {/* last sync */}
                      <td className="py-3 pr-3">
                        <div className="text-slate-700">{timeAgo(c.lastSync)}</div>
                      </td>

                      {/* alerts */}
                      <td className="py-3 pr-3">
                        {c.alertsCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 px-2 py-0.5 text-xs">
                            <AlertTriangle className="h-3 w-3" />
                            {c.alertsCount}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">0</span>
                        )}
                      </td>

                      {/* actions */}
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Link
                            to={`/crushers/${c.id}`}
                            className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50"
                            title="View details"
                          >
                            <ExternalLink className="h-4 w-4" />
                            View
                          </Link>
                          <button
                            onClick={() => onEdit(c)}
                            className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                            Edit
                          </button>
                          <button
                            onClick={() => onDelete(c)}
                            className="inline-flex items-center gap-2 rounded-xl border border-red-300 text-red-700 px-3 py-1.5 text-sm hover:bg-red-50"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!filtered.length && (
                <div className="p-6 text-slate-500">No machines match your search.</div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <EditorModal
        open={editorOpen}
        draft={editorDraft}
        onChange={setEditorDraft}
        onClose={() => setEditorOpen(false)}
        onSave={onSaveEditor}
        onSyncSerial={handleSyncSerial}
        saving={saving}
      />
    </div>
  );
}
