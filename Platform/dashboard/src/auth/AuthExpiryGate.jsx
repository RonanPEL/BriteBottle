import React from "react";
import { useNavigate } from "react-router-dom";
import { onAuthEvent, AUTH_EVENTS } from "./authBus";
import { authPost, setAuthToken } from "../api";

export default function AuthExpiryGate({ redirectOnNextClick = true }) {
  const [expired, setExpired] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const navigate = useNavigate();

  React.useEffect(() => onAuthEvent(e => {
    if (e.type === AUTH_EVENTS.EXPIRED) setExpired(true);
  }), []);

  React.useEffect(() => {
    if (!expired || !redirectOnNextClick) return;
    const handler = (ev) => { ev.preventDefault(); toLogin(); };
    document.addEventListener("click", handler, { once: true, capture: true });
    return () => document.removeEventListener("click", handler, { capture: true });
  }, [expired, redirectOnNextClick]);

  function clearLocalSession() {
    try { localStorage.removeItem("auth"); } catch {}
    setAuthToken(null);
  }
  function toLogin() {
    clearLocalSession();
    setExpired(false);
    navigate("/login");
  }

  async function tryRefresh() {
    setBusy(true); setErr("");
    try {
      const data = await authPost("/auth/refresh", {}); 
      const token = data?.token || data?.accessToken;
      if (!token) throw new Error("No token");
      localStorage.setItem("auth", JSON.stringify({ token }));
      setAuthToken(token);
      setExpired(false);
    } catch {
      setErr("Session refresh failed. Please log in again.");
    } finally {
      setBusy(false);
    }
  }

  if (!expired) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-200">
          <div className="text-base font-semibold text-slate-800">Session expired</div>
        </div>
        <div className="px-4 py-3 space-y-2">
          <p className="text-sm text-slate-600">
            Your login has expired. {redirectOnNextClick ? "Click anywhere to go to the login page, or" : "Please log in again, or"} try refreshing your session.
          </p>
          {err && <div className="text-sm text-rose-600">{err}</div>}
        </div>
        <div className="px-4 py-3 flex items-center justify-end gap-2 border-t border-slate-200">
          <button onClick={toLogin} className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">
            Log in
          </button>
          <button onClick={tryRefresh} disabled={busy} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white disabled:opacity-60">
            {busy ? "Refreshing…" : "Refresh session"}
          </button>
        </div>
      </div>
    </div>
  );
}
