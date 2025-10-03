import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function ProtectedRoute(){
  const { ready, isAuthenticated } = useAuth();
  const loc = useLocation();
  if(!ready) return null; // let main Splash show instead of redirecting early
  if(!isAuthenticated) return <Navigate to="/login" replace state={{ from: loc }} />;
  return <Outlet />;
}

export function PublicOnlyRoute(){
  const { ready, isAuthenticated } = useAuth();
  if(!ready) return null;
  if(isAuthenticated) return <Navigate to="/" replace />;
  return <Outlet />;
}
