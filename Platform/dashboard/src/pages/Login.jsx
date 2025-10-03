// src/pages/Login.jsx
import React, { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "../components/ui";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const from = location.state?.from?.pathname || "/";

  async function onSubmit(e) {
  e.preventDefault();
  setError("");
  setLoading(true);
  try {
    await login(email.trim(), password);
    navigate(from, { replace: true });
  } catch (err) {
    // Parse api.js error shape: "HTTP ### – <server text/json>"
    const raw = String(err?.message || "");
    const afterDash =
      raw.split("–")[1]?.trim() || // EN DASH from api.js
      raw.split("-")[1]?.trim() || // fallback if dash changed
      "";

    let serverMsg = "";
    try {
      serverMsg = JSON.parse(afterDash)?.message || afterDash;
    } catch {
      serverMsg = afterDash;
    }

    // Pending approval
    if (raw.includes("403") || /Waiting for Registration to be approved by Admin/i.test(serverMsg)) {
      setError("Waiting for Registration to be approved by Admin");
      return;
    }

    // Invalid credentials
    if (raw.includes("401") || /Invalid credentials/i.test(serverMsg)) {
      setError("Invalid email or password");
      return;
    }

    // Network/CORS issues
    if (/NetworkError|Failed to fetch|fetch failed|CORS/i.test(raw)) {
      setError("Can’t reach the server. Check that the API is running and your API key/CORS are set.");
      return;
    }

    // Fallback
    setError(serverMsg || "Login failed");
  } finally {
    setLoading(false);
  }
}


 const inputClass =
  "mt-1 block w-full rounded-xl border border-white/50 bg-transparent " +
  "px-1 py-2" +
  "text-slate-900 placeholder-slate-600 " +
  "focus:bg-transparent focus:border-white/60 focus:ring-0 focus:outline-none focus-visible:outline-none";




  const BG_SCALE = 0.85;


  return (

    <div className="auth-no-caret min-h-screen w-full bg-slate-50 flex items-center justify-center p-6" style={{ backgroundImage: "url('../assets/globe.png')", backgroundSize: `${BG_SCALE * 100}% auto`, backgroundPosition: "center" }}>
      <Card className="w-full max-w-md shadow-xl bg-white/80 backdrop-blur-md border border-white/40" style={{ backgroundColor: "rgba(255,255,255,0.8)", backdropFilter: "blur(4px)" }}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">Sign in</CardTitle>
            <span className="text-xs text-slate-500">BriteBottle</span>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="   you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <div className="mt-1 relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass + " pr-10"}
                  placeholder="   ••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 p-3 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-slate-900 text-white py-2.5 font-medium shadow-sm hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </CardContent>
        <CardFooter className="text-xs text-slate-500 flex justify-between">
          <Link to="/forgot-password" className="underline">Forgot password?</Link>
          <span>
            No account? <Link to="/register" className="underline">Create one</Link>
          </span>
        </CardFooter>
      </Card>
    </div>
  );
}
