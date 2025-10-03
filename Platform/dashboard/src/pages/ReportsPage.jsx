import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardBody } from "../components/ui";
import { fetchEvents } from "../api";
import EventsTypeFilter from "../components/EventsTypeFilter";
import { Factory, Wrench, AlertTriangle, MapPin, CreditCard } from "lucide-react";

function iconForType(t) {
  const k = String(t || "").toUpperCase();
  if (k === "SERVICE") return <Wrench size={14} />;
  if (k === "ALERT") return <AlertTriangle size={14} />;
  if (k === "INSTALL") return <MapPin size={14} />;
  if (k === "SUBSCRIPTION") return <CreditCard size={14} />;
  if (k === "CREATED") return <Factory size={14} />;
  return <span className="inline-block w-3 h-3 rounded-full bg-slate-300" />;
}

export default function ReportsPage() {
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [types, setTypes] = useState([]);
  const [cursor, setCursor] = useState(null); // ISO ts
  const [q, setQ] = useState("");

  async function load(reset = false) {
    setBusy(true);
    setErr("");
    try {
      const page = await fetchEvents({
        types,
        limit: 100,
        before: reset ? null : cursor
      });
      const merged = reset ? page : [...events, ...page];
      setEvents(merged);
      const last = merged[merged.length - 1];
      setCursor(last ? last.ts : null);
    } catch (e) {
      setErr(e.message || "Failed to load events");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(true); /* on first mount */ }, []);
  useEffect(() => { load(true); /* whenever type filter changes */ }, [JSON.stringify(types)]);

  const filtered = useMemo(() => {
    if (!q.trim()) return events;
    const needle = q.trim().toLowerCase();
    return events.filter(e =>
      `${e.type} ${e.message || ""} ${e.source || ""}`.toLowerCase().includes(needle)
    );
  }, [events, q]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="text-base font-medium">Reports</div>
            <div className="flex items-center gap-3">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search events…"
                aria-label="Search events"
                className="px-3 py-1.5 rounded-xl border border-slate-300/60 text-sm focus:border-slate-300 focus:ring-0"
              />
              <EventsTypeFilter selected={types} onChange={setTypes} />
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {err && <div className="text-rose-600 text-sm mb-2">{err}</div>}
          <div className="overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 w-[160px]">When</th>
                  <th className="px-3 py-2 w-[220px]">Type</th>
                  <th className="px-3 py-2">Message</th>
                  <th className="px-3 py-2 w-[220px]">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{formatWhen(e.ts)}</td>
                    <td className="px-3 py-2 text-slate-900 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-slate-100">
                          {iconForType(e.type)}
                        </span>
                        <span className="uppercase text-xs tracking-wide text-slate-600">{e.type}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-900">{e.message || "—"}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{e.source || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-center mt-3">
            <button
              onClick={() => load(false)}
              disabled={busy || !cursor}
              className="px-3 py-1.5 rounded-lg border border-slate-300/60 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {busy ? "Loading…" : (cursor ? "Load more" : "End of feed")}
            </button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function formatWhen(ts) {
  try {
    const d = new Date(ts);
    if (!Number.isFinite(d.getTime())) return "—";
    const now = Date.now();
    const diff = Math.floor((now - d.getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleString();
  } catch {
    return "—";
  }
}
