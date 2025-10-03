const RAW_API_BASE =
  (typeof window !== "undefined" && (window.__API_BASE__ || import.meta.env.VITE_API_BASE_URL)) || "";
const API_BASE = (RAW_API_BASE || "").replace(/\/+$/, ""); // trim trailing slashes
const API_KEY = import.meta.env.VITE_API_KEY || "";

function getToken() {
  try {
    return JSON.parse(localStorage.getItem("auth") || "{}").token || "";
  } catch {
    return "";
  }
}
function authHeaders(json = true) {
  const h = {};
  if (json) h["Content-Type"] = "application/json";
  if (API_KEY) h["X-API-Key"] = API_KEY;
  const t = getToken();
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}
async function tryFetch(url, options, timeoutMs = 6000) {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ac.signal });
    return res;
  } finally {
    clearTimeout(to);
  }
}

function buildCandidates(path) {
  const list = [];
  if (API_BASE) list.push(`${API_BASE}${path}`);
  if (API_BASE && !path.startsWith("/api/")) list.push(`${API_BASE}/api${path}`);
  list.push(path);
  if (!path.startsWith("/api/")) list.push(`/api${path}`);
  return Array.from(new Set(list));
}

function makeAbsoluteUrl(u, triedEndpoint) {
  // already absolute?
  if (/^https?:\/\//i.test(u)) return u;

  // prefer configured API_BASE
  let base = API_BASE;

  // otherwise derive from the endpoint we successfully POSTed to
  if (!base && triedEndpoint) {
    try {
      base = new URL(triedEndpoint, typeof window !== "undefined" ? window.location.href : undefined).origin;
    } catch {
      /* ignore */
    }
  }

  // final fallback: current origin
  if (!base && typeof window !== "undefined") base = window.location.origin;

  base = (base || "").replace(/\/+$/, "");
  return `${base}${u.startsWith("/") ? "" : "/"}${u}`;
}

/** Compress File -> JPEG dataURL */
export async function compressImageFile(file, maxDim = 1280, targetKB = 400) {
  if (!file) return "";
  const blobUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = blobUrl;
    });
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d", { alpha: false }).drawImage(img, 0, 0, w, h);

    let q = 0.82,
      dataUrl = canvas.toDataURL("image/jpeg", q);
    const targetBytes = targetKB * 1024;
    while (dataUrl.length * 0.75 > targetBytes && q > 0.5) {
      q -= 0.08;
      dataUrl = canvas.toDataURL("image/jpeg", q);
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/** Prefer S3 presigned; fallback to local /uploads. Tries both /… and /api/… */
export async function uploadViaPresigned(dataUrl) {
  if (!dataUrl) return null;
  const blob = await (await fetch(dataUrl)).blob();
  const contentType = blob.type || "image/jpeg";

  // --- 1) Try presign
  const signCandidates = buildCandidates("/upload-sign");
  for (const endpoint of signCandidates) {
    try {
      const res = await tryFetch(endpoint, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ contentType }),
      });
      if (res.ok) {
        const { uploadUrl, publicUrl, error } = await res.json();
        if (!error && uploadUrl && publicUrl) {
          const put = await tryFetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": contentType },
            body: blob,
          });
          if (!put.ok) throw new Error(`S3 PUT failed ${put.status}`);
          return publicUrl; // absolute S3 URL
        }
      }
    } catch {
      // try next candidate
    }
  }

  // --- 2) Fallback to local uploads
  const fd = new FormData();
  fd.append("file", blob, "photo.jpg");
  const upCandidates = buildCandidates("/uploads");
  for (const endpoint of upCandidates) {
    try {
      const up = await tryFetch(endpoint, { method: "POST", body: fd });
      if (up.ok) {
        const j = await up.json();
        const u = j?.url || j?.rel || "";
        if (!u) throw new Error("Upload response missing url");
        return makeAbsoluteUrl(u, endpoint); // ensure absolute URL for the <img>
      }
    } catch {
      // try next
    }
  }

  throw new Error("Upload failed (no signer and /uploads missing)");
}
