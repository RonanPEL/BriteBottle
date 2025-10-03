// Platform/dashboard/src/components/InstallsPanel.jsx
import React, { useMemo, useState } from "react";
import { Plus, Save, X, Image as ImageIcon, Camera, Pencil, Trash2, Check } from "lucide-react";
import { updateCrusher } from "../api";
import { useAuth } from "../auth/AuthContext";
import { compressImageFile, uploadViaPresigned } from "../lib/uploads";
import { createCrusherEvent } from "../api";

export default function InstallsPanel({ crusher, onChange }) {
  const { user } = useAuth();

  const [adding, setAdding] = useState(false);
  const [desc, setDesc] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editDesc, setEditDesc] = useState("");
  const [editFile, setEditFile] = useState(null);
  const [editPreview, setEditPreview] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState(null);

  async function onPick(e) { const f = e.target.files?.[0] || null; setFile(f); setPreview(""); if (f) setPreview(await compressImageFile(f)); }
  async function onEditPick(e) { const f = e.target.files?.[0] || null; setEditFile(f); if (f) setEditPreview(await compressImageFile(f)); }

  const installs = useMemo(() => {
    const arr = Array.isArray(crusher?.installs) ? crusher.installs : [];
    return [...arr].sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));
  }, [crusher?.installs]);

  async function save() {
    setErr("");
    if (!crusher?.id) return;
    if (!desc.trim() && !preview) { setErr("Please add a description and/or an image."); return; }
    setSaving(true);
    try {
      const image = preview ? await uploadViaPresigned(preview) : null;
      const now = new Date().toISOString();
      const newInstall = {
        id: (crypto?.randomUUID && crypto.randomUUID()) || `inst-${Date.now()}`,
        ts: now,
        installedAt: now, // alias compat
        by: user?.name || user?.email || "Unknown",
        installer: user?.name || user?.email || "Unknown",
        description: desc.trim(),
        image,
        // site later add a "Site / Location" input ????
      };
      const next = [newInstall, ...(Array.isArray(crusher?.installs) ? crusher.installs : [])];
      await updateCrusher(crusher.id, { installs: next });
      onChange?.({ ...crusher, installs: next });
      createCrusherEvent(crusher.id, {
        type: "INSTALL",
        message: newInstall.description || "Installed",
        ts: newInstall.ts,
        source: newInstall.by || "Unknown",
        meta: { id: newInstall.id, image: !!newInstall.image }
      }).catch(() => { });
      setAdding(false); setDesc(""); setFile(null); setPreview("");
    } catch (e) { setErr(e?.message || "Failed to save install"); }
    finally { setSaving(false); }
  }

  function startEdit(r) { setEditingId(r.id); setEditDesc(r.description || ""); setEditFile(null); setEditPreview(r.image || ""); }
  function cancelEdit() { setEditingId(null); setEditDesc(""); setEditFile(null); setEditPreview(""); }

  async function saveEdit(instId) {
    if (!crusher?.id) return;
    setEditSaving(true);
    try {
      let image = editPreview || null;
      if (image && image.startsWith("data:")) image = await uploadViaPresigned(image);
      const next = (Array.isArray(crusher?.installs) ? crusher.installs : []).map((r) =>
        r.id === instId ? { ...r, description: editDesc.trim(), image, editedTs: new Date().toISOString(), editedBy: user?.name || user?.email || "Unknown" } : r
      );
      await updateCrusher(crusher.id, { installs: next });
      onChange?.({ ...crusher, installs: next });
      createCrusherEvent(crusher.id, {
        type: "INSTALL",
        message: editDesc.trim() ? `Install edited: ${editDesc.trim()}` : "Install edited",
        source: user?.name || user?.email || "Unknown",
        meta: { id: instId, edited: true, image: !!image }
      }).catch(() => { });
      cancelEdit();
    } catch (e) { alert(e?.message || "Failed to update install"); }
    finally { setEditSaving(false); }
  }

  async function deleteInstall(instId) {
    if (!crusher?.id) return;
    const ok = window.confirm("Delete this install entry? This cannot be undone.");
    if (!ok) return;
    setDeleteBusyId(instId);
    try {
      const next = (Array.isArray(crusher?.installs) ? crusher.installs : []).filter((r) => r.id !== instId);
      await updateCrusher(crusher.id, { installs: next });
      onChange?.({ ...crusher, installs: next });
      createCrusherEvent(crusher.id, {
        type: "INSTALL",
        message: "Install deleted",
        source: user?.name || user?.email || "Unknown",
        meta: { id: instId, deleted: true }
      }).catch(() => { });
      if (editingId === instId) cancelEdit();
    } catch (e) { alert(e?.message || "Failed to delete install"); }
    finally { setDeleteBusyId(null); }
  }

  return (
    <div className="space-y-5">
      {!adding && (
        <div className="flex justify-end">
          <button onClick={() => { setAdding(true); setErr(""); }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm bg-slate-900 text-white hover:bg-slate-800">
            <Plus size={16} /> Add install
          </button>
        </div>
      )}

      {adding && (
        <div className="border border-slate-200 rounded-xl p-4 space-y-4 bg-slate-50/50">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <div><span className="font-medium">By:</span> {user?.name || user?.email || "Unknown"}</div>
            <div>•</div>
            <div><span className="font-medium">When:</span> {new Date().toLocaleString()}</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1 space-y-2">
              <label className="block text-sm font-medium text-slate-700">Image (optional)</label>
              <label className="flex items-center justify-center gap-2 border border-dashed border-slate-300 rounded-xl p-4 text-sm text-slate-600 cursor-pointer hover:bg-white">
                <ImageIcon size={16} /><span>{file ? file.name : "Choose image…"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={onPick} />
              </label>
              <label className="flex items-center justify-center gap-2 border border-dashed border-slate-300 rounded-xl p-4 text-sm text-slate-600 cursor-pointer hover:bg-white">
                <Camera size={16} /><span>Take photo (camera)…</span>
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
              </label>
              {preview && <img src={preview} alt="Selected" className="mt-2 w-full h-36 object-cover rounded-lg border border-slate-200" />}
            </div>

            <div className="md:col-span-2 space-y-2">
              <label className="block text-sm font-medium text-slate-700">Description</label>
              <textarea rows={6} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What was installed / where / notes, etc."
                className="w-full rounded-xl border border-slate-300/60 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:border-slate-300 focus:ring-0" />
            </div>
          </div>

          {err && <div className="text-sm text-red-600">{err}</div>}

          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm bg-slate-900 text-white disabled:opacity-60">
              <Save size={16} /> {saving ? "Saving…" : "Save install"}
            </button>
            <button onClick={() => { setAdding(false); setErr(""); setDesc(""); setFile(null); setPreview(""); }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm border border-slate-300 text-slate-700 hover:bg-slate-50">
              <X size={16} /> Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {installs.map((r) => {
          const isEditing = editingId === r.id;
          return (
            <div key={r.id} className="border border-slate-200 rounded-xl p-3 bg-white">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm text-slate-600">
                  <span className="font-medium">{r.by || "Unknown"}</span> • {r.ts ? new Date(r.ts).toLocaleString() : "—"}
                  {r.editedTs && <span className="ml-2 text-slate-400">(edited {new Date(r.editedTs).toLocaleString()})</span>}
                </div>

                {!isEditing ? (
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setEditingId(r.id); setEditDesc(r.description || ""); setEditPreview(r.image || ""); }} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-slate-300 text-slate-700 hover:bg-slate-50">
                      <Pencil size={14} /> Edit
                    </button>
                    <button onClick={() => deleteInstall(r.id)} disabled={deleteBusyId === r.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-60">
                      <Trash2 size={14} /> {deleteBusyId === r.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button onClick={() => saveEdit(r.id)} disabled={editSaving} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60">
                      <Check size={14} /> {editSaving ? "Saving…" : "Save"}
                    </button>
                    <button onClick={cancelEdit} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-slate-300 text-slate-700 hover:bg-slate-50">
                      <X size={14} /> Cancel
                    </button>
                  </div>
                )}
              </div>

              {!isEditing ? (
                <div className="mt-2 flex gap-3 items-start">
                  {r.image ? <img src={r.image} alt="Install" loading="lazy" className="w-28 h-28 object-cover rounded-lg border border-slate-200 shrink-0" /> : null}
                  {r.description ? <div className="flex-1 min-w-0 text-slate-800 text-sm whitespace-pre-wrap">{r.description}</div> : null}
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-1 space-y-2">
                    <label className="block text-sm font-medium text-slate-700">Image</label>
                    {editPreview ? <img src={editPreview} alt="Preview" className="w-full h-36 object-cover rounded-lg border border-slate-200" /> : <div className="w-full h-36 rounded-lg border border-dashed border-slate-300 text-slate-400 text-sm flex items-center justify-center">No image</div>}
                    <label className="mt-1 flex items-center justify-center gap-2 border border-dashed border-slate-300 rounded-xl p-3 text-sm text-slate-600 cursor-pointer hover:bg-white">
                      <ImageIcon size={16} /><span>{editFile ? editFile.name : "Replace image…"}</span>
                      <input type="file" accept="image/*" className="hidden" onChange={onEditPick} />
                    </label>
                    <label className="flex items-center justify-center gap-2 border border-dashed border-slate-300 rounded-xl p-3 text-sm text-slate-600 cursor-pointer hover:bg-white">
                      <Camera size={16} /><span>Take new photo…</span>
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onEditPick} />
                    </label>
                    {editPreview && <button type="button" onClick={() => { setEditFile(null); setEditPreview(""); }} className="w-full mt-1 text-xs text-slate-600 underline">Remove image</button>}
                  </div>

                  <div className="md:col-span-2 space-y-2">
                    <label className="block text-sm font-medium text-slate-700">Description</label>
                    <textarea rows={6} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Update notes…" className="w-full rounded-xl border border-slate-300/60 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:border-slate-300 focus:ring-0" />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {installs.length === 0 && !adding && (
          <div className="text-slate-500 text-sm">No installs yet. Click <span className="font-medium">Add install</span> to create one.</div>
        )}
      </div>
    </div>
  );
}
