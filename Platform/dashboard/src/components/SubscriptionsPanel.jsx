// src/components/SubscriptionsPanel.jsx
import React, { useMemo, useState } from "react";
import { Plus, Save, X, Pencil, Trash2, Check } from "lucide-react";
import { updateCrusher, createCrusherEvent } from "../api";
import { useAuth } from "../auth/AuthContext";

export default function SubscriptionsPanel({ crusher, onChange }) {
  const { user } = useAuth();

  // composer
  const [adding, setAdding] = useState(false);
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(inDays(30));
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // edit/delete
  const [editingId, setEditingId] = useState(null);
  const [editStart, setEditStart] = useState(today());
  const [editEnd, setEditEnd] = useState(inDays(30));
  const [editEnabled, setEditEnabled] = useState(true);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState(null);

  const subs = useMemo(
    () =>
      Array.isArray(crusher?.subscriptions)
        ? [...crusher.subscriptions].sort((a, b) =>
          String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
        )
        : [],
    [crusher?.subscriptions]
  );

  function resetComposer() {
    setAdding(false);
    setStart(today());
    setEnd(inDays(30));
    setEnabled(true);
    setSaving(false);
    setErr("");
  }

  async function save() {
    setErr("");
    if (!crusher?.id) return;

    if (!isValidRange(start, end)) {
      setErr("Please choose a valid date range (start on/before end).");
      return;
    }

    setSaving(true);
    try {
      const newSub = {
        id: (crypto?.randomUUID && crypto.randomUUID()) || `sub-${Date.now()}`,
        startDate: start, // YYYY-MM-DD
        endDate: end,     // YYYY-MM-DD
        enabled: !!enabled,
        createdAt: new Date().toISOString(),
        createdBy: user?.name || user?.email || "Unknown",
      };

      const next = [newSub, ...subs];
      await updateCrusher(crusher.id, { subscriptions: next });
      onChange?.({ ...crusher, subscriptions: next });
      createCrusherEvent(crusher.id, {
        type: "SUBSCRIPTION",
        message: newSub.plan ? `Subscription created: ${newSub.plan}` : "Subscription created",
        ts: newSub.ts || new Date().toISOString(),
        source: user?.name || user?.email || "Unknown",
        meta: { id: newSub.id, plan: newSub.plan || null, status: newSub.status || null }
      }).catch(() => { });

      resetComposer();
    } catch (e) {
      setErr(e?.message || "Failed to save subscription");
      setSaving(false);
    }
  }

  async function toggleEnabled(subId, nextEnabled) {
    if (!crusher?.id) return;
    const next = subs.map((s) =>
      s.id === subId
        ? {
          ...s,
          enabled: !!nextEnabled,
          updatedAt: new Date().toISOString(),
          updatedBy: user?.name || user?.email || "Unknown",
        }
        : s
    );
    await updateCrusher(crusher.id, { subscriptions: next });
    onChange?.({ ...crusher, subscriptions: next });
  }

  function startEditRow(s) {
    setEditingId(s.id);
    setEditStart(s.startDate || today());
    setEditEnd(s.endDate || inDays(30));
    setEditEnabled(!!s.enabled);
  }

  function cancelEditRow() {
    setEditingId(null);
  }

  async function saveEditRow(subId) {
    if (!crusher?.id) return;
    if (!isValidRange(editStart, editEnd)) {
      alert("Please choose a valid date range (start on/before end).");
      return;
    }
    setEditSaving(true);
    try {
      const next = subs.map((s) =>
        s.id === subId
          ? {
            ...s,
            startDate: editStart,
            endDate: editEnd,
            enabled: !!editEnabled,
            updatedAt: new Date().toISOString(),
            updatedBy: user?.name || user?.email || "Unknown",
          }
          : s
      );
      await updateCrusher(crusher.id, { subscriptions: next });
      onChange?.({ ...crusher, subscriptions: next });
      createCrusherEvent(crusher.id, {
        type: "SUBSCRIPTION",
        message: updated.plan ? `Subscription updated: ${updated.plan}` : "Subscription updated",
        source: user?.name || user?.email || "Unknown",
        meta: { id: subId, edited: true, plan: updated.plan || null, status: updated.status || null }
      }).catch(() => { });

      setEditingId(null);
    } catch (e) {
      alert(e?.message || "Failed to update subscription");
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteSub(subId) {
    if (!crusher?.id) return;
    const ok = window.confirm("Delete this subscription? This cannot be undone.");
    if (!ok) return;
    setDeleteBusyId(subId);
    try {
      const next = subs.filter((s) => s.id !== subId);
      await updateCrusher(crusher.id, { subscriptions: next });
      onChange?.({ ...crusher, subscriptions: next });
      createCrusherEvent(crusher.id, {
        type: "SUBSCRIPTION",
        message: "Subscription deleted",
        source: user?.name || user?.email || "Unknown",
        meta: { id: subId, deleted: true }
      }).catch(() => { });

      if (editingId === subId) setEditingId(null);
    } catch (e) {
      alert(e?.message || "Failed to delete subscription");
    } finally {
      setDeleteBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      {!adding && (
        <div className="flex justify-end">
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm bg-slate-900 text-white hover:bg-slate-800"
          >
            <Plus size={16} />
            Add subscription
          </button>
        </div>
      )}

      {adding && (
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            {/* Start */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Start date
              </label>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full rounded-xl border border-slate-300/60 bg-white px-3 py-2 text-sm focus:border-slate-300 focus:ring-0"
              />
            </div>

            {/* End */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                End date
              </label>
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full rounded-xl border border-slate-300/60 bg-white px-3 py-2 text-sm focus:border-slate-300 focus:ring-0"
              />
            </div>

            {/* Toggle */}
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Enabled
              </label>
              <Toggle value={enabled} onChange={setEnabled} />
            </div>
          </div>

          {err && <div className="text-sm text-red-600">{err}</div>}

          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm bg-slate-900 text-white disabled:opacity-60"
            >
              <Save size={16} />
              {saving ? "Saving…" : "Save subscription"}
            </button>
            <button
              onClick={resetComposer}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              <X size={16} />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="overflow-auto rounded-xl border border-slate-200">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 w-[220px]">Time period</th>
              <th className="px-3 py-2 w-[160px]">Status</th>
              <th className="px-3 py-2 w-[220px]">Who</th>
              <th className="px-3 py-2 w-[220px]">Created</th>
              <th className="px-3 py-2 w-[180px]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {subs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  No subscriptions yet.
                </td>
              </tr>
            ) : (
              subs.map((s) => {
                const isEditing = editingId === s.id;
                return (
                  <tr key={s.id} className="hover:bg-slate-50/60 align-top">
                    {/* Time period */}
                    <td className="px-3 py-2">
                      {!isEditing ? (
                        <div className="text-slate-900 text-sm">
                          {s.startDate} <span className="text-slate-400">to</span> {s.endDate}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-2">
                          <input
                            type="date"
                            value={editStart}
                            onChange={(e) => setEditStart(e.target.value)}
                            className="w-full rounded-xl border border-slate-300/60 bg-white px-3 py-1.5 text-sm focus:border-slate-300 focus:ring-0"
                          />
                          <input
                            type="date"
                            value={editEnd}
                            onChange={(e) => setEditEnd(e.target.value)}
                            className="w-full rounded-xl border border-slate-300/60 bg-white px-3 py-1.5 text-sm focus:border-slate-300 focus:ring-0"
                          />
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2">
                      {!isEditing ? (
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              "inline-block text-[11px] px-2 py-0.5 rounded-full transition-colors duration-300 " +
                              (s.enabled
                                ? "bg-green-100 text-green-700"
                                : "bg-slate-200 text-slate-700")
                            }
                          >
                            {s.enabled ? "Enabled" : "Disabled"}
                          </span>
                          <Toggle
                            value={!!s.enabled}
                            onChange={(v) => toggleEnabled(s.id, v)}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Toggle value={!!editEnabled} onChange={setEditEnabled} />
                          <span className="text-xs text-slate-600">
                            {editEnabled ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Who */}
                    <td className="px-3 py-2">
                      <div className="text-sm text-slate-800">
                        {s.createdBy || "Unknown"}
                      </div>
                    </td>

                    {/* Created */}
                    <td className="px-3 py-2">
                      <div className="text-[12px] text-slate-600">
                        {s.createdAt ? new Date(s.createdAt).toLocaleString() : "—"}
                      </div>
                      {s.updatedAt && (
                        <div className="text-[11px] text-slate-400">
                          edited {new Date(s.updatedAt).toLocaleString()}
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2">
                      {!isEditing ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => startEditRow(s)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-slate-300 text-slate-700 hover:bg-slate-50"
                          >
                            <Pencil size={14} />
                            Edit
                          </button>
                          <button
                            onClick={() => deleteSub(s.id)}
                            disabled={deleteBusyId === s.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-60"
                          >
                            <Trash2 size={14} />
                            {deleteBusyId === s.id ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => saveEditRow(s.id)}
                            disabled={editSaving}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
                          >
                            <Check size={14} />
                            {editSaving ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={cancelEditRow}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-slate-300 text-slate-700 hover:bg-slate-50"
                          >
                            <X size={14} />
                            Cancel
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------- helpers ------------- */

function today() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function inDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function isValidRange(start, end) {
  if (!start || !end) return false;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  return Number.isFinite(a) && Number.isFinite(b) && a <= b;
}

/* Animated, accessible toggle (uses pseudo-element knob so it slides smoothly) */
function Toggle({ value, onChange, disabled }) {
  return (
    <label className="inline-flex items-center select-none cursor-pointer">
      <input
        type="checkbox"
        className="sr-only peer"
        checked={!!value}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span
        className="
          relative block w-10 h-6 rounded-full
          bg-slate-300 peer-checked:bg-green-500
          transition-colors duration-300 ease-out
          outline-none
          peer-focus-visible:ring-2 peer-focus-visible:ring-green-500 peer-focus-visible:ring-offset-2
          before:content-[''] before:absolute before:top-0.5 before:left-0.5
          before:h-5 before:w-5 before:rounded-full before:bg-white before:shadow
          before:transition-transform before:duration-300 before:ease-out
          peer-checked:before:translate-x-4
        "
        aria-hidden="true"
      />
    </label>
  );
}
