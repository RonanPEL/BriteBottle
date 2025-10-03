// in-memory pub/sub for auth events
const listeners = new Set();

export const AUTH_EVENTS = {
  EXPIRED: "auth/expired",
};

export function onAuthEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitAuthEvent(type, payload) {
  for (const fn of Array.from(listeners)) {
    try { fn({ type, payload }); } catch {}
  }
}
