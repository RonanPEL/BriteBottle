import React from "react";

const TYPES = ["INSTALL", "SERVICE", "ALERT", "CREATED", "LOCK", "SUBSCRIPTION"];

export default function EventsTypeFilter({ selected = [], onChange }) {
  const set = new Set(selected.map(s => String(s).toUpperCase()));
  const toggle = (t) => {
    const next = new Set(set);
    if (next.has(t)) next.delete(t); else next.add(t);
    onChange?.(Array.from(next));
  };
  const allOn = set.size === 0 || set.size === TYPES.length;

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange?.([])}
        className={`px-2.5 py-1 rounded-lg text-xs border ${allOn ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
      >
        All
      </button>
      {TYPES.map((t) => {
        const on = set.has(t);
        return (
          <button
            key={t}
            type="button"
            onClick={() => toggle(t)}
            className={`px-2.5 py-1 rounded-lg text-xs border ${on ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}
