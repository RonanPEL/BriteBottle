// dashboard/src/auth/AuthContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { setAuthToken, authPost, markAuthReady } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [auth, setAuth] = useState(null);

  // Boot: hydrate from localStorage and tell api.js it's safe to send requests
  useEffect(() => {
    try {
      const raw = localStorage.getItem("auth");
      const parsed = raw ? JSON.parse(raw) : null;
      setAuth(parsed);
      setAuthToken(parsed?.token || null); // make token available to api.js right away
    } catch {
      setAuth(null);
      setAuthToken(null);
    } finally {
      markAuthReady();   // <-- api.js request() waits for this before firing
      setReady(true);
    }
  }, []);

  // Keep api.js in sync if token changes later
  const token = auth?.token ?? null;
  useEffect(() => { setAuthToken(token || null); }, [token]);

  // ---- Actions ----
  async function login(email, password) {
    const data = await authPost("/auth/login", { email, password });
    const next = { token: data.token, user: data.user ?? { email } };

    // Immediately push token to api.js to avoid request races after login
    setAuth(next);
    setAuthToken(next.token);
    localStorage.setItem("auth", JSON.stringify(next));
    return next;
  }

 async function register(payload) {
  const data = await authPost("/auth/register", payload);
  if (data?.token) {
    const next = { token: data.token, user: data.user ?? { email: payload.email, name: payload.name } };
    setAuth(next);
    setAuthToken(next.token); // push token immediately
    localStorage.setItem("auth", JSON.stringify(next));
    return next;
  }
  return { ok: true };
}

  async function forgotPassword(email) {
    await authPost("/auth/forgot-password", { email });
    return { ok: true };
  }

  async function resetPassword(tokenArg, newPassword) {
    await authPost("/auth/reset-password", { token: tokenArg, password: newPassword });
    return { ok: true };
  }

  function logout() {
    setAuth(null);
    setAuthToken(null);
    localStorage.removeItem("auth");
  }

  const value = useMemo(() => ({
    ready,
    user: auth?.user ?? null,
    token,
    isAuthenticated: !!token,
    login, register, forgotPassword, resetPassword, logout,
  }), [ready, auth, token]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
