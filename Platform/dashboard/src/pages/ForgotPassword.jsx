// src/pages/ForgotPassword.jsx
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "../components/ui";

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

const inputClass =
  "mt-1 block w-full rounded-xl border border-white/50 bg-transparent " +
  "px-2 py-1" +
  "text-slate-900 placeholder-slate-600 " +
  "focus:bg-transparent focus:border-white/60 focus:ring-0 focus:outline-none focus-visible:outline-none";



  const BG_SCALE = 0.85;


  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err?.message || "Could not send reset email");
    } finally {
      setLoading(false);
    }
  }


  return (
    <div className="auth-no-caret min-h-screen w-full bg-slate-50 flex items-center justify-center p-6" style={{ backgroundImage: "url('../assets/globe.png')", backgroundSize: `${BG_SCALE * 100}% auto`, backgroundPosition: "center" }}>
      <Card
        className="w-full max-w-md shadow-xl bg-white/80 backdrop-blur-md border border-white/40"
        style={{ backgroundColor: "rgba(255,255,255,0.8)", backdropFilter: "blur(4px)" }}
      >

        <CardHeader>
          <CardTitle className="text-xl">Reset your password</CardTitle>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">
                If an account exists for <strong>{email}</strong>, you’ll receive an email with reset instructions shortly.
              </p>
              <p className="text-xs text-slate-500">Be sure to check your spam/junk folder.</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="   you@example.com"
                />
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
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}
        </CardContent>
        <CardFooter className="text-xs text-slate-500 flex justify-between">
          <Link to="/login" className="underline">Back to login</Link>
          <Link to="/register" className="underline">Create account</Link>
        </CardFooter>
      </Card>
    </div>
  );
}
