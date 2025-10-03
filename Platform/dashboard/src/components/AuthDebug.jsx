import React from "react";
import { useAuth } from "../auth/AuthContext";

export default function AuthDebugHUD(){
  const a = useAuth();
  return (
    <div style={{
      position: "fixed", bottom: 8, right: 8, padding: "6px 8px",
      background: "rgba(0,0,0,.6)", color: "white", fontSize: 12,
      borderRadius: 8, zIndex: 9999
    }}>
      ready:{String(a.ready)} | authed:{String(a.isAuthenticated)}
    </div>
  );
}
