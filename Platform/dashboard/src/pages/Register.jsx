// dashboard/src/pages/Register.jsx
import React, { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Card, CardHeader, CardBody } from "../components/ui"; // <-- only exports you have
import { DIAL_CODES } from "../constants/dialCodes";

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const { register } = useAuth();

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [language, setLanguage] = useState("en");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // Address
  const [addr1, setAddr1] = useState("");
  const [addr2, setAddr2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("IE"); // default Ireland
  const [dial, setDial] = useState("+353");
  const [phone, setPhone] = useState("");

  // UX / errors
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState(""); // <-- MISSING before

  const from = location.state?.from?.pathname || "/";
  const BG_SCALE = 0.85;

  const inputClass =
    "mt-1 block w-full rounded-xl border border-white/50 bg-transparent " +
    "px- py-1" +
    "text-slate-900 placeholder-slate-600 " +
    "focus:bg-transparent focus:border-white/60 focus:ring-0 focus:outline-none focus-visible:outline-none";

  // Keep dial code in sync when country changes
  function onCountryChange(newCode) {
    setCountry(newCode);
    const found = DIAL_CODES.find((c) => c.code === newCode);
    if (found) setDial(found.dial);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setEmailError(""); // clear field error
    if (password !== confirm) return setError("Passwords do not match");
    setLoading(true);
    try {
      const res = await register({
        name: name.trim(),
        email: email.trim(),
        password,
        profile: {
          company: company.trim(),
          language,
          address1: addr1.trim(),
          address2: addr2.trim(),
          city: city.trim(),
          state: state.trim(),
          country,
          phone: { dial, number: phone.trim() },
        },
      });
      if (res?.token) navigate(from, { replace: true });
      else navigate("/login", { replace: true, state: { notice: "Account created. Waiting for Registration to be approved by Admin." } });
    } catch (err) {
      // Turn api.js error ("HTTP ### – <server text/json>") into friendly UI
      const raw = String(err?.message || "");
      const afterDash = raw.split("–")[1]?.trim() || ""; // server text/json after "–"
      let serverMsg = "";
      try {
        serverMsg = JSON.parse(afterDash)?.message || afterDash;
      } catch {
        serverMsg = afterDash;
      }

      if (raw.includes("409") || /already in use|already registered/i.test(serverMsg)) {
        setEmailError("That email is already registered. Try signing in or use Forgot password.");
        setError(""); // no top banner
      } else if (/NetworkError|Failed to fetch|fetch failed|CORS/i.test(raw)) {
        setError("Can’t reach the server. Check that the API is running and your API key/CORS are set.");
      } else {
        setError(serverMsg || "Registration failed");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="auth-no-caret min-h-screen w-full bg-slate-50 flex items-center justify-center p-6"
      style={{
        backgroundImage: "url('../assets/globe.png')",
        backgroundSize: `${BG_SCALE * 100}% auto`,
        backgroundPosition: "center",
      }}
    >
      <Card
        className="w-full max-w-md shadow-xl bg-white/80 backdrop-blur-md border border-white/40"
        style={{ backgroundColor: "rgba(255,255,255,0.8)", backdropFilter: "blur(4px)" }}
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            {/* Replace CardTitle with plain heading to avoid missing export */}
            <h2 className="text-xl font-semibold noninteractive">Create account</h2>
            <span className="text-xs text-slate-500 noninteractive">BriteBottle</span>
          </div>
        </CardHeader>

        {/* Use CardBody instead of CardContent */}
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-5">
            {/* Row 1: Name + Company */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="reg-name" className="block text-sm font-medium text-slate-700">Name</label>
                <input
                  id="reg-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  placeholder="Alex Doe"
                  autoComplete="name"
                />
              </div>
              <div>
                <label htmlFor="reg-company" className="block text-sm font-medium text-slate-700">Company</label>
                <input
                  id="reg-company"
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className={inputClass}
                  placeholder="PEL Waste Reduction Equipment"
                  autoComplete="organization"
                />
              </div>
            </div>

            {/* Row 2: Email + Language */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="reg-email" className="block text-sm font-medium text-slate-700">Email</label>
                <input
                  id="reg-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(""); }}
                  className={inputClass}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
                {emailError && (
                  <p className="mt-1 text-xs text-rose-600">{emailError}</p>
                )}
              </div>

              <div>
                <label htmlFor="reg-language" className="block text-sm font-medium text-slate-700">Language</label>
                <select
                  id="reg-language"
                  className={inputClass}
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="en">English</option>
                  <option value="ga">Irish (Gaeilge)</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="es">Spanish</option>
                  <option value="it">Italian</option>
                  <option value="pt">Portuguese</option>
                </select>
              </div>
            </div>

            {/* Row 3: Password + Confirm */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="reg-password" className="block text-sm font-medium text-slate-700">Password</label>
                <div className="mt-1 relative">
                  <input
                    id="reg-password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass + " pr-10"}
                    placeholder="••••••••"
                    autoComplete="new-password"
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
              <div>
                <label htmlFor="reg-confirm" className="block text-sm font-medium text-slate-700">Confirm password</label>
                <input
                  id="reg-confirm"
                  type={showPassword ? "text" : "password"}
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={inputClass}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
            </div>

            {/* Row 4: Address lines */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="reg-addr1" className="block text-sm font-medium text-slate-700">Primary Address</label>
                <input
                  id="reg-addr1"
                  type="text"
                  value={addr1}
                  onChange={(e) => setAddr1(e.target.value)}
                  className={inputClass}
                  placeholder="123 Main Street"
                  autoComplete="address-line1"
                />
              </div>
              <div>
                <label htmlFor="reg-addr2" className="block text-sm font-medium text-slate-700">Secondary Address</label>
                <input
                  id="reg-addr2"
                  type="text"
                  value={addr2}
                  onChange={(e) => setAddr2(e.target.value)}
                  className={inputClass}
                  placeholder="Unit / Apartment (optional)"
                  autoComplete="address-line2"
                />
              </div>
            </div>

            {/* Row 5: City / State / Country */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="reg-city" className="block text-sm font-medium text-slate-700">City</label>
                <input
                  id="reg-city"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className={inputClass}
                  placeholder="Dublin"
                  autoComplete="address-level2"
                />
              </div>
              <div>
                <label htmlFor="reg-state" className="block text-sm font-medium text-slate-700">State / County</label>
                <input
                  id="reg-state"
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className={inputClass}
                  placeholder="Dublin"
                  autoComplete="address-level1"
                />
              </div>
              <div>
                <label htmlFor="reg-country" className="block text-sm font-medium text-slate-700">Country</label>
                <select
                  id="reg-country"
                  className={inputClass}
                  value={country}
                  onChange={(e) => onCountryChange(e.target.value)}
                  autoComplete="country"
                >
                  {DIAL_CODES.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 6: Phone with country code selector */}
            <div>
              <label className="block text-sm font-medium text-slate-700">Phone number</label>
              <div className="mt-1 grid grid-cols-[160px,1fr] gap-3">
                <select
                  aria-label="Country code"
                  className={inputClass}
                  value={dial}
                  onChange={(e) => setDial(e.target.value)}
                >
                  {DIAL_CODES.map((c) => (
                    <option key={`${c.code}-${c.dial}`} value={c.dial}>
                      {c.name} ({c.dial})
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  inputMode="tel"
                  className={inputClass}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="123 456 789"
                  autoComplete="tel-national"
                />
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
              {loading ? "Creating…" : "Create account"}
            </button>

            {/* Footer links (inline; no CardFooter to avoid missing export) */}
            <div className="flex items-center justify-between text-xs text-slate-500 noninteractive">
              <span>Already have an account? <Link to="/login" className="underline">Sign in</Link></span>
              <Link to="/forgot-password" className="underline">Forgot password?</Link>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
