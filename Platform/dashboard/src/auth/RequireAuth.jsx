// dashboard/src/auth/RequireAuth.jsx
import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

function Splash() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50">
      <div className="text-slate-500 text-sm">Loading…</div>
    </div>
  );
}

export default function RequireAuth() {
  const { isAuthenticated, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <Splash />; // wait for markAuthReady()
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
