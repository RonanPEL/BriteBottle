// Platform/dashboard/src/components/ServiceReportsPanel.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Image as ImageIcon, Camera, Plus, Save, X, Pencil, Trash2, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { updateCrusher, createCrusherEvent } from "../api";
import { useAuth } from "../auth/AuthContext";
import { compressImageFile, uploadViaPresigned } from "../lib/uploads";

export default function ServiceReportsPanel({ crusher, onChange }) {
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

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  async function onPick(e) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setPreview("");
    if (f) setPreview(await compressImageFile(f));
  }
  async function onEditPick(e) {
    const f = e.target.files?.[0] || null;
    setEditFile(f);
    if (f) setEditPreview(await compressImageFile(f));
  }

  async function save() {
    setErr("");
    if (!desc.trim() && !preview) { setErr("Add a description and/or an image."); return; }
    if (!crusher?.id) return;
    setSaving(true);
    try {
      const image = preview ? await uploadViaPresigned(preview) : null;
      const newReport = {
        id: (crypto?.randomUUID && crypto.randomUUID()) || `sr-${Date.now()}`,
        ts: new Date().toISOString(),
        by: user?.name || user?.email || "Unknown",
        description: desc.trim(),
        image,
      };
      const existing = Array.isArray(crusher?.serviceReports) ? crusher.serviceReports : [];
      const next = [newReport, ...existing];
      await updateCrusher(crusher.id, { serviceReports: next });
      onChange?.({ ...crusher, serviceReports: next });

      // Append an event (non-blocking)
      createCrusherEvent(crusher.id, {
        type: "SERVICE",
        message: newReport.description || "Service report",
        ts: newReport.ts,
        source: newReport.by || "Unknown",
        meta: { id: newReport.id, image: !!newReport.image }
      }).catch(() => {});

      setAdding(false); setDesc(""); setFile(null); setPreview("");
    } catch (e) { setErr(e?.message || "Failed to save report"); }
    finally { setSaving(false); }
  }

  function startEdit(r) { setEditingId(r.id); setEditDesc(r.description || ""); setEditFile(null); setEditPreview(r.image || ""); }
  function cancelEdit() { setEditingId(null); setEditDesc(""); setEditFile(null); setEditPreview(""); }

  async function saveEdit(reportId) {
    if (!crusher?.id) return;
    setEditSaving(true);
    try {
      let image = editPreview || null;
      if (image && image.startsWith("data:")) image = await uploadViaPresigned(image);
      const next = (Array.isArray(crusher?.serviceReports) ? crusher.serviceReports : []).map((r) =>
        r.id === reportId ? { ...r, description: editDesc.trim(), image, editedTs: new Date().toISOString(), editedBy: user?.name || user?.email || "Unknown" } : r
      );
      await updateCrusher(crusher.id, { serviceReports: next });
      onChange?.({ ...crusher, serviceReports: next });

      // Append an event noting the edit (non-blocking)
      createCrusherEvent(crusher.id, {
        type: "SERVICE",
        message: editDesc.trim() ? `Service report edited: ${editDesc.trim()}` : "Service report edited",
        source: user?.name || user?.email || "Unknown",
        meta: { id: reportId, edited: true, image: !!image }
      }).catch(() => {});

      cancelEdit();
    } catch (e) { alert(e?.message || "Failed to update report"); }
    finally { setEditSaving(false); }
  }

  async function deleteReport(reportId) {
    if (!crusher?.id) return;
    const ok = window.confirm("Delete this service report? This cannot be undone.");
    if (!ok) return;
    setDeleteBusyId(reportId);
    try {
      const next = (Array.isArray(crusher?.serviceReports) ? crusher.serviceReports : []).filter((r) => r.id !== reportId);
      await updateCrusher(crusher.id, { serviceReports: next });
      onChange?.({ ...crusher, serviceReports: next });
      if (editingId === reportId) cancelEdit();

      // Append an event noting the delete (non-blocking)
      createCrusherEvent(crusher.id, {
        type: "SERVICE",
        message: "Service report deleted",
        source: user?.name || user?.email || "Unknown",
        meta: { id: reportId, deleted: true }
      }).catch(() => {});
    } catch (e) { alert(e?.message || "Failed to delete report"); }
    finally { setDeleteBusyId(null); }
  }

  const reports = useMemo(() => {
    const arr = Array.isArray(crusher?.serviceReports) ? [...crusher.serviceReports] : [];
    return arr.sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));
  }, [crusher?.serviceReports]);

  const lightboxImages = useMemo(
    () => reports.map((r, idx) => r.image ? { reportId: r.id, src: r.image, by: r.by, ts: r.ts, desc: r.description, indexInReports: idx } : null).filter(Boolean),
    [reports]
  );
  const mapIdx = useMemo(() => { const m = new Map(); lightboxImages.forEach((img, i) => m.set(img.reportId, i)); return m; }, [lightboxImages]);
  function openLightbox(reportId) { const i = mapIdx.get(reportId); if (i === undefined) return; setLightboxIndex(i); setLightboxOpen(true); }
  function prev() { setLightboxIndex((i) => (lightboxImages.length ? (i - 1 + lightboxImages.length) % lightboxImages.length : 0)); }
  function next() { setLightboxIndex((i) => (lightboxImages.length ? (i + 1) % lightboxImages.length : 0)); }
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setLightboxOpen(false); if (e.key === "ArrowLeft") prev(); if (e.key === "ArrowRight") next(); };
    const prevOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [lightboxOpen, lightboxImages.length]);

  return (
    <div className="space-y-5">
      {!adding && (
        <div className="flex justify-end">
          <button onClick={() => { setAdding(true); setErr(""); }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm bg-slate-900 text-white hover:bg-slate-800">
            <Plus size={16} /> Add report
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
              <textarea rows={6} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What was done, parts, follow-ups, etc."
                className="w-full rounded-xl border border-slate-300/60 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:border-slate-300 focus:ring-0" />
            </div>
          </div>

          {err && <div className="text-sm text-red-600">{err}</div>}

          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm bg-slate-900 text-white disabled:opacity-60">
              <Save size={16} /> {saving ? "Saving…" : "Save report"}
            </button>
            <button onClick={() => { setAdding(false); setErr(""); setDesc(""); setFile(null); setPreview(""); }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm border border-slate-300 text-slate-700 hover:bg-slate-50">
              <X size={16} /> Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {reports.map((r) => {
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
                    <button onClick={() => startEdit(r)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-slate-300 text-slate-700 hover:bg-slate-50">
                      <Pencil size={14} /> Edit
                    </button>
                    <button onClick={() => deleteReport(r.id)} disabled={deleteBusyId === r.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-60">
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
                  {r.image ? (
                    <button type="button" onClick={() => openLightbox(r.id)} className="group relative" title="Open image">
                      <img src={r.image} alt="Service" loading="lazy" className="w-28 h-28 object-cover rounded-lg border border-slate-200 shrink-0" />
                      <span className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/10 transition" />
                    </button>
                  ) : null}
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

        {reports.length === 0 && !adding && (
          <div className="text-slate-500 text-sm">No service reports yet. Click <span className="font-medium">Add report</span> to create one.</div>
        )}
      </div>

      {lightboxOpen && lightboxImages.length > 0 && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] bg-black/80" onClick={() => setLightboxOpen(false)}>
          <div className="absolute inset-0 flex flex-col">
            <div className="flex items-center justify-between px-3 py-2">
              <div className="text-xs text-white/80">
                {(() => { const img = lightboxImages[lightboxIndex]; if (!img) return null;
                  return (<><span className="font-medium text-white">{img.by || "Unknown"}</span> • {img.ts ? new Date(img.ts).toLocaleString() : "—"}</>);
                })()}
              </div>
              <button onClick={() => setLightboxOpen(false)} className="inline-flex items-center justify-center rounded-lg px-2 py-1 text-white/90 hover:bg-white/10" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="relative flex-1 flex items-center justify-center overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white" aria-label="Previous">
                <ChevronLeft size={22} />
              </button>
              <img src={lightboxImages[lightboxIndex]?.src} alt="Service report" className="max-h-[85vh] max-w-[95vw] object-contain select-none" draggable={false} />
              <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white" aria-label="Next">
                <ChevronRight size={22} />
              </button>
              {lightboxImages[lightboxIndex]?.desc ? (
                <div className="absolute bottom-0 left-0 right-0 p-3 text-xs text-white/90 bg-gradient-to-t from-black/40 to-transparent">{lightboxImages[lightboxIndex].desc}</div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
