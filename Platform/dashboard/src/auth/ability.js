// dashboard/src/auth/ability.js
// Simple permission reader. Usage: can(auth, "view.alerts") -> boolean
export function can(auth, path) {
  const parts = String(path).split(".");
  let node = auth?.user?.role?.permissions || null;
  for (const p of parts) {
    if (!node || typeof node !== "object" || !(p in node)) return false;
    node = node[p];
  }
  return node === true || (typeof node === "number" ? !!node : Boolean(node));
}

// e.g., canSeeField(auth, "fillLevel")
export function canSeeField(auth, fieldName) {
  const fields = auth?.user?.role?.permissions?.view?.telemetryFields || {};
  return !!fields[fieldName];
}
