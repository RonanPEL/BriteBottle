// src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardBody, CardFooter } from "../components/ui";
import { api, fetchCrushers } from "../api";
import {
  RefreshCw,
  Download,
  AlertTriangle,
  PackageCheck as CrushedIcon,
  ListChecks as QueueIcon,
} from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);

  async function load() {
  setErr("");
  try {
    const [s, ev] = await Promise.all([api.summary(), api.recentEvents(15)]);

    // If backend doesn't provide status (or all zeros), derive from crushers' fillLevel
    let summaryNext = s || {};
    const statusArr = Array.isArray(summaryNext.status) ? summaryNext.status : [];
    const hasNonZero = statusArr.some(x => Number(x?.value || 0) > 0);

    if (!hasNonZero) {
      const crushers = await fetchCrushers();
      const counts = { low: 0, medium: 0, high: 0 };
      for (const c of crushers) {
        const f = Number(c.fillLevel ?? 0);
        if (f >= 0.85) counts.high++;
        else if (f >= 0.5) counts.medium++;
        else counts.low++;
      }
      summaryNext.status = [
        { name: "Low", value: counts.low, color: "#22c55e" },
        { name: "Medium", value: counts.medium, color: "#eab308" },
        { name: "High", value: counts.high, color: "#ef4444" },
      ];
    }

    setSummary(summaryNext);
    setEvents(Array.isArray(ev) ? ev : []);
  } catch (e) {
    setErr(e?.message || "Failed to load dashboard");
  } finally {
    setLoading(false);
  }
}


  useEffect(() => {
    load();
    const id = setInterval(load, 15000); // light polling
    return () => clearInterval(id);
  }, []);

  const statusData = useMemo(() => {
    const d = summary?.status || [];
    const by = Object.fromEntries(d.map((x) => [String(x.name || "").toLowerCase(), x]));
    return [
      { name: "Low", value: Number(by.low?.value ?? 0), color: "#22c55e" },
      { name: "Medium", value: Number(by.medium?.value ?? 0), color: "#eab308" },
      { name: "High", value: Number(by.high?.value ?? 0), color: "#ef4444" },
    ];
  }, [summary]);

  function exportCSV() {
    const rows = [
      ["id", "time", "type", "crusherId", "qty", "message"],
      ...events.map((e) => [
        e.id ?? "",
        e.time ?? "",
        e.type ?? "",
        e.crusherId ?? "",
        e.qty ?? "",
        String(e.message ?? "").replace(/\n/g, " "),
      ]),
    ];
    const csv = rows
      .map((r) =>
        r
          .map((v) => {
            const s = String(v ?? "");
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recent-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="p-6 text-slate-500">Loading dashboard…</div>;
  }

  if (err) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 p-3 text-sm">
          {err}
        </div>
      </div>
    );
  }

  const crushedToday = summary?.crushedToday ?? 0;
  const queued = summary?.queued ?? 0;
  const alerts = summary?.alerts ?? 0;
  const totalStatus = statusData.reduce((a, b) => a + (b.value || 0), 0);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Crushed today</CardTitle>
              <CrushedIcon className="h-5 w-5 text-slate-400" />
            </div>
          </CardHeader>
          <CardBody>
            <div className="text-3xl font-semibold">{crushedToday}</div>
            <div className="text-xs text-slate-500 mt-1">Bottles</div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Queue</CardTitle>
              <QueueIcon className="h-5 w-5 text-slate-400" />
            </div>
          </CardHeader>
          <CardBody>
            <div className="text-3xl font-semibold">{queued}</div>
            <div className="text-xs text-slate-500 mt-1">Estimated pickups</div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Open alerts</CardTitle>
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
          </CardHeader>
          <CardBody>
            <div className="text-3xl font-semibold">{alerts}</div>
            <div className="text-xs text-slate-500 mt-1">Across all crushers</div>
          </CardBody>
        </Card>
      </div>

      {/* Status + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Status Donut */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Hopper status</CardTitle>
            <button
              onClick={load}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </CardHeader>
          <CardBody>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="60%"
                    outerRadius="85%"
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {statusData.map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [v, "Units"]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 grid grid-cols-3 text-sm">
              {statusData.map((s) => (
                <div key={s.name} className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="text-slate-600">
                    {s.name} <span className="text-slate-400">({s.value})</span>
                  </span>
                </div>
              ))}
            </div>
            {totalStatus === 0 && (
              <div className="text-xs text-slate-500 mt-2">No status data available.</div>
            )}
          </CardBody>
        </Card>

        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Recent activity</CardTitle>
            <button
              onClick={exportCSV}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </CardHeader>
          <CardBody>
            {events.length === 0 ? (
              <div className="text-sm text-slate-500">No recent events.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-2 pr-4">Time</th>
                      <th className="py-2 pr-4">Type</th>
                      <th className="py-2 pr-4">Crusher</th>
                      <th className="py-2 pr-4">Qty</th>
                      <th className="py-2">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev) => (
                      <tr key={ev.id} className="border-t">
                        <td className="py-2 pr-4">{new Date(ev.time).toLocaleString()}</td>
                        <td className="py-2 pr-4">{ev.type}</td>
                        <td className="py-2 pr-4">{ev.crusherId || "-"}</td>
                        <td className="py-2 pr-4">{ev.qty ?? "-"}</td>
                        <td className="py-2">{ev.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
          <CardFooter className="text-xs text-slate-500">Auto-refreshing every 15s</CardFooter>
        </Card>
      </div>
    </div>
  );
}
