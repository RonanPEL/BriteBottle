import React from "react";
import { Factory, Wrench, AlertTriangle, MapPin, CreditCard } from "lucide-react";

export function buildEventsFromCrusher(c) {
    if (!c) return [];
    const serial = c.serial || c.serialNumber || c.serial_no || c.id || "—";
    const out = [];

    // CREATED
    const createdTs = c.createdAt || c.created_at || c.createdTS || c.created || null;
    if (createdTs) {
        out.push({
            id: `created-${c.id || serial}-${createdTs}`,
            ts: createdTs,
            serial,
            who: c.createdBy || c.owner || c.accountName || "System",
            type: "CREATED",
            eventLabel: "Crusher created",
            icon: React.createElement(Factory, { size: 14 })
        });
    }

    // SERVICE
    const srs = Array.isArray(c.serviceReports) ? c.serviceReports : [];
    for (const r of srs) {
        const ts = r.ts || r.timestamp || r.time || null;
        if (!ts) continue;
        out.push({
            id: r.id || `sr-${serial}-${ts}`,
            ts, serial,
            who: r.by || "Unknown",
            type: "SERVICE",
            eventLabel: r.description || "Service report",
            icon: React.createElement(Wrench, { size: 14 })
        });
    }

    // ALERT
    const alertArrays = [
        ...(Array.isArray(c.alerts) ? c.alerts : []),
        ...(Array.isArray(c.activeAlerts) ? c.activeAlerts : []),
        ...(Array.isArray(c.latestAlerts) ? c.latestAlerts : []),
    ];
    for (const a of alertArrays) {
        const ts = a.ts || a.timestamp || a.time || a.occurredAt || null;
        if (!ts) continue;
        const label = a.label || a.title || a.type || a.name || (a.severity ? `Alert (${a.severity})` : "Alert");
        out.push({
            id: a.id || `al-${serial}-${label}-${ts}`,
            ts, serial,
            who: a.by || "System",
            type: "ALERT",
            eventLabel: label,
            icon: React.createElement(AlertTriangle, { size: 14 }),
            severity: a.severity || a.level || null
        });
    }

    // INSTALL
    const installs = Array.isArray(c.installs)
        ? c.installs
        : Array.isArray(c.installHistory)
            ? c.installHistory
            : Array.isArray(c.installations)
                ? c.installations
                : [];
    for (const ins of installs) {
        const ts = ins.installedAt || ins.ts || ins.timestamp || ins.time || ins.date || null;
        if (!ts) continue;
        const who = ins.by || ins.installer || ins.user || "Unknown";
        const where = ins.site || ins.location || ins.place || "";
        const label = ins.description || ins.note || `Installed${where ? ` @ ${where}` : ""}`;
        out.push({
            id: ins.id || `inst-${serial}-${ts}`,
            ts, serial, who,
            type: "INSTALL",
            eventLabel: label,
            icon: React.createElement(MapPin, { size: 14 })
        });
    }

    const subs = Array.isArray(c.subscriptions) ? c.subscriptions : [];
    for (const s of subs) {
        const ts = s.createdAt || s.startAt || s.startDate || s.ts || s.timestamp || s.time || null;
        if (!ts) continue;
        const label = s.plan ? `Subscription: ${s.plan}${s.status ? ` (${s.status})` : ""}` : (s.status ? `Subscription: ${s.status}` : "Subscription");
        out.push({
            id: s.id || `sub-${serial}-${ts}`,
            ts,
            serial,
            who: s.by || s.createdBy || "System",
            type: "SUBSCRIPTION",
            eventLabel: label,
            icon: React.createElement(CreditCard, { size: 14 }),
        });
    }


    return out
        .filter(e => Number.isFinite(new Date(e.ts).getTime()))
        .sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
}

export function buildEventsFromCrushers(list) {
    const arr = Array.isArray(list) ? list : [];
    return arr.flatMap(c => buildEventsFromCrusher(c));
}
