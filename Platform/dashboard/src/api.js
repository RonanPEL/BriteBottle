import { emitAuthEvent, AUTH_EVENTS } from "./auth/authBus";

/* ---------------------------------------
 * Runtime config (single source of truth)
 * ------------------------------------- */
const RUNTIME = typeof window !== "undefined" ? (window.__APP_CONFIG__ || {}) : {};
const API_BASE = (RUNTIME.apiBase || import.meta.env.VITE_API_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const API_KEY = RUNTIME.apiKey || import.meta.env.VITE_API_KEY || "";

/* ---------------------------------------
 * Auth token + readiness wiring
 * ------------------------------------- */
let AUTH_TOKEN = null;
export function setAuthToken(token) {
  AUTH_TOKEN = token || null;
}

// Promise that resolves once AuthContext has hydrated localStorage
let _resolveReady;
const _authReady = new Promise((res) => (_resolveReady = res));
let _isReady = false;
export function markAuthReady() {
  if (!_isReady) {
    _isReady = true;
    _resolveReady?.();
  }
}

// optional: small safety timeout so nothing hangs forever
async function waitAuthReady(ms = 8000) {
  let to;
  const timeout = new Promise((_, rej) => {
    to = setTimeout(() => rej(new Error("Auth init timeout")), ms);
  });
  await Promise.race([_authReady, timeout]).finally(() => clearTimeout(to));
}

/* ---------------------------------------
 * Header builder (canonical)
 * ------------------------------------- */
function withAuth(headers = {}) {
  const h = { ...headers };
  // Content-Type is set by callers when needed

  // API Key (runtime or env)
  if (API_KEY) h["X-API-Key"] = API_KEY;

  // Bearer token (prefer in-memory, fall back to localStorage if needed)
  const token = AUTH_TOKEN || (() => {
    try { return JSON.parse(localStorage.getItem("auth") || "{}").token || null; } catch { return null; }
  })();
  if (token) h["Authorization"] = `Bearer ${token}`;

  return h;
}

/* ---------------------------------------
 * Core request helpers
 * ------------------------------------- */
async function request(path, opt = {}) {
  await waitAuthReady(); // ensures setAuthToken ran after refresh
  const res = await fetch(`${API_BASE}${path}`, {
    ...opt,
    headers: withAuth(opt.headers || {}),
  });
  if (res.status === 401) {
    emitAuthEvent(AUTH_EVENTS.EXPIRED, { path, method: (opt.method || "GET").toUpperCase() });
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} – ${t || res.statusText}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : {};
}

/** Auth endpoints must NOT wait (we need to log in first), but still send X-API-Key */
export function authPost(path, body) {
  return fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: withAuth({ "Content-Type": "application/json" }), // withAuth adds API key; no token yet
    body: JSON.stringify(body),
  }).then(async (res) => {
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} – ${t || res.statusText}`);
    }
    const ct = res.headers.get("content-type") || "";
    return ct.includes("application/json") ? res.json() : {};
  });
}

/* ---------------------------------------
 * Generic HTTP helpers (single definitions)
 * ------------------------------------- */
export function get(path) {
  return request(path);
}
export function post(path, body) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}
export function patch(path, body) {
  return request(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}
export function del(path) {
  return request(path, { method: "DELETE" });
}

/* ---------------------------------------
 * Crushers CRUD / actions
 * ------------------------------------- */
export function createCrusher(payload) {
  return post("/crushers", payload);
}
export function updateCrusher(id, body) {
  return patch(`/crushers/${id}`, body);
}
export function deleteCrusher(id) {
  return del(`/crushers/${id}`);
}
// Optional lock action — backend may 404 until you add the route
export function lockCrusher(id, hours) {
  return post(`/crushers/${id}/lock`, { hours: Number(hours) || 1 });
}
export function lookupCrusherBySerial(serial) {
  const s = encodeURIComponent(serial || "");
  return get(`/crushers/lookup?serial=${s}`);
}
export function syncCrusherBySerial(serial) {
  return get(`/crushers/sync-serial?serial=${encodeURIComponent(serial)}`);
}

/* ---------------------------------------
 * Events API (global + per-crusher)
 * ------------------------------------- */
export async function fetchEvents({ crusherId, types = [], before, limit = 100 } = {}) {
  const params = new URLSearchParams();
  if (crusherId) params.set("crusherId", crusherId);
  if (Array.isArray(types) && types.length) params.set("types", types.map(s => String(s).toUpperCase()).join(","));
  if (before) params.set("before", before);
  params.set("limit", String(limit));
  return get(`/events?${params.toString()}`);
}

export async function fetchCrusherEvents(id, { types = [], before, limit = 100 } = {}) {
  const params = new URLSearchParams();
  if (Array.isArray(types) && types.length) params.set("types", types.map(s => String(s).toUpperCase()).join(","));
  if (before) params.set("before", before);
  params.set("limit", String(limit));
  return get(`/crushers/${id}/events?${params.toString()}`);
}

export async function createCrusherEvent(id, payload) {
  return post(`/crushers/${id}/events`, payload);
}

/* ---------------------------------------
 * Dashboard summary / activity
 * ------------------------------------- */
export async function fetchDashboard() {
  const raw = await request("/dashboard/summary");
  const crushedToday =
    raw.crushedToday ?? raw.bottlesCrushedToday ?? raw.today?.crushed ?? 0;
  const queued = raw.queued ?? raw.queue ?? raw.pending ?? 0;
  const alerts = raw.alerts ?? raw.activeAlerts ?? raw.alertCount ?? 0;
  const s = raw.status ?? raw.hopperLevels ?? { low: 0, medium: 0, high: 0 };
  const status = [
    { name: "Low", value: s.low ?? s.Low ?? 0, color: "#22c55e" },
    { name: "Medium", value: s.medium ?? s.Medium ?? 0, color: "#eab308" },
    { name: "High", value: s.high ?? s.High ?? 0, color: "#ef4444" },
  ];
  return { crushedToday, queued, alerts, status };
}

export async function fetchRecentActivity(limit = 20) {
  const params = new URLSearchParams({ limit: String(limit) });
  const arr = await request(`/events?${params.toString()}`);
  return (Array.isArray(arr) ? arr : []).map((it) => ({
    id: it.id ?? it._id ?? String(Math.random()).slice(2),
    time: it.ts ?? it.time ?? it.timestamp ?? new Date().toISOString(),
    type: it.type ?? it.eventType ?? "event",
    crusherId: it.crusherId ?? it.source ?? it.sourceId ?? null,
    qty: it.qty ?? it.amount ?? null,
    message: it.message ?? it.note ?? "",
  }));
}

/* ---------------------------------------
 * Crushers list/detail fetch
 * ------------------------------------- */
export async function fetchCrushers() {
  const arr = await request("/crushers");
  // Preserve server-enriched fields and lightly normalize defaults
  return (Array.isArray(arr) ? arr : []).map((c) => ({
    // keep everything the server gives us
    ...c,

    // ensure stable primitives / fallbacks
    id: c.id ?? c._id ?? c.crusherId,
    name: c.name ?? `Crusher ${c.id ?? ""}`,

    // NEW columns (server already sends them; just default-sanitize)
    type: c.type ?? "BB01",
    location: c.location ?? "",
    serial: c.serial ?? "",
    mainsVoltage: Number(c.mainsVoltage ?? 230),
    temperature: Number(c.temperature ?? 22),
    customer: c.customer ?? "",
    lastSync: c.lastSync ?? c.lastSeen ?? null,
    alertsCount: Number(c.alertsCount ?? 0),

    // existing fields
    lat: +c.lat || +c.latitude || 0,
    lng: +c.lng || +c.longitude || 0,
    status: c.status ?? c.state ?? "ok",
    fillLevel: typeof c.fillLevel === "number" ? c.fillLevel : +(c.fill ?? 0),
    crushedToday: c.crushedToday ?? c.today ?? 0,
    lastEmptied: c.lastEmptied ?? c.lastService ?? null,
  }));
}

export async function fetchCrusherById(id) {
  const c = await request(`/crushers/${id}`);
  return {
    ...c,
    id: c.id ?? id,
    name: c.name ?? `Crusher ${id}`,
    type: c.type ?? "BB01",
    location: c.location ?? "",
    serial: c.serial ?? "",
    mainsVoltage: Number(c.mainsVoltage ?? 230),
    temperature: Number(c.temperature ?? 22),
    customer: c.customer ?? "",
    lastSync: c.lastSync ?? c.lastSeen ?? null,
    alertsCount: Number(c.alertsCount ?? 0),

    lat: +c.lat || +c.latitude || 0,
    lng: +c.lng || +c.longitude || 0,
    status: c.status ?? "ok",
    fillLevel: typeof c.fillLevel === "number" ? c.fillLevel : 0,
    crushedToday: c.crushedToday ?? 0,
    lastEmptied: c.lastEmptied ?? null,
    recentEvents: c.recentEvents ?? [],
    metrics: c.metrics ?? {},
  };
}

/* ---------------------------------------
 * Alerts & Routes
 * ------------------------------------- */
export async function fetchAlerts(limit = 50) {
  const arr = await request(`/alerts?limit=${limit}`);
  return (Array.isArray(arr) ? arr : []).map((a) => ({
    id: a.id ?? a._id,
    level: a.level ?? a.severity ?? "info",
    time: a.ts ?? a.time ?? a.timestamp ?? new Date().toISOString(),
    crusherId: a.crusherId ?? a.sourceId ?? a.source ?? null,
    message: a.message ?? a.text ?? "",
  }));
}

export async function fetchRoutes() {
  const arr = await request("/routes");
  return (Array.isArray(arr) ? arr : []).map((r) => ({
    id: r.id ?? r.routeId ?? r._id,
    name: r.name ?? `Route ${r.id ?? ""}`,
    path: r.path || r.points || [],
    stops: (r.stops || []).map((s) => ({
      lat: +s.lat || +s.latitude || 0,
      lng: +s.lng || +s.longitude || 0,
      name: s.name || s.label || "",
      crusherId: s.crusherId ?? null,
    })),
    assignedTo: r.assignedTo ?? null,
  }));
}

/* ---------------------------------------
 * Roles API helpers
 * ------------------------------------- */
export const getRoles = () => get("/roles");
export const createRole = (payload) => post("/roles", payload);
export const updateRole = (roleId, body) => patch(`/roles/${roleId}`, body);
export const deleteRole = (roleId) => del(`/roles/${roleId}`);

/* ---------------------------------------
 * Users API helpers
 * ------------------------------------- */
export const getUsers = () => get("/users");
export const createUser = (payload) => post("/users", payload); // { name, email, password, profile? }
export const updateUser = (userId, body) => patch(`/users/${userId}`, body);
export const deleteUser = (userId) => del(`/users/${userId}`);
export const assignUserRole = (userId, body /* { roleId } or { roleName } */) =>
  patch(`/users/${userId}/role`, body);

// Single, canonical toggle for approval (used by UsersPage slider)
export const setUserApproval = (userId, approved) =>
  patch(`/users/${userId}/approve`, { approved });

/* ---------------------------------------
 * Optional grouped export
 * ------------------------------------- */
export const api = {
  summary: fetchDashboard,
  recentEvents: fetchRecentActivity,
  crushers: fetchCrushers,
  crusherById: fetchCrusherById,
  alerts: fetchAlerts,
  routes: fetchRoutes,
  roles: {
    list: getRoles,
    create: createRole,
    update: updateRole,
    remove: deleteRole,
  },
};
