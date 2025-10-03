// Platform/dashboard/src/pages/RolesAdmin.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { Card, CardHeader, CardTitle, CardBody } from "../components/ui";
import { getRoles, createRole, updateRole, deleteRole } from "../api";
import { AlertTriangle, Plus, Save, Trash2, RotateCw } from "lucide-react";

function Toggle({ label, checked, onChange, disabled }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300"
        checked={!!checked}
        onChange={(e) => onChange?.(e.target.checked)}
        disabled={disabled}
      />
      <span className={disabled ? "text-slate-400" : "text-slate-700"}>{label}</span>
    </label>
  );
}

function RoleEditor({ role, onSave, onDelete, canEdit }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(role)));
  useEffect(() => setDraft(JSON.parse(JSON.stringify(role))), [role]);

  function set(path, value) {
    setDraft((d) => {
      const next = { ...d };
      let node = next;
      const parts = path.split(".");
      for (let i = 0; i < parts.length - 1; i++) {
        node[parts[i]] = node[parts[i]] ?? {};
        node = node[parts[i]];
      }
      node[parts[parts.length - 1]] = value;
      return next;
    });
  }

  const changed = useMemo(() => JSON.stringify(draft) !== JSON.stringify(role), [draft, role]);

  // Helper to quickly set all page view toggles on/off
  function setAllPages(val) {
    const keys = ["dashboard","map","routes","crushers","alerts","reports","users","roles","settings"];
    const obj = {};
    keys.forEach(k => { obj[k] = !!val; });
    set("permissions.view", {
      ...(draft.permissions?.view || {}),
      ...obj,
    });
  }

  const v = draft.permissions?.view || {};

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {role.name} <span className="text-slate-400">({role.power})</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDraft(JSON.parse(JSON.stringify(role)))}
              disabled={!changed || !canEdit}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm disabled:opacity-50"
              title="Reset changes"
            >
              <RotateCw className="h-4 w-4" />
              Reset
            </button>
            <button
              onClick={() => onSave?.(draft)}
              disabled={!changed || !canEdit}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-50"
              title="Save role"
            >
              <Save className="h-4 w-4" />
              Save
            </button>
            <button
              onClick={onDelete}
              disabled={!canEdit}
              className="inline-flex items-center gap-2 rounded-xl border border-red-300 text-red-700 px-3 py-1.5 text-sm hover:bg-red-50 disabled:opacity-50"
              title="Delete role"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Basics */}
          <div className="space-y-3">
            <div>
              <label className="text-sm text-slate-600">Name</label>
              <input
                type="text"
                className="mt-1 block w-full rounded-xl border border-slate-300/60 bg-transparent
                           text-slate-900 placeholder-slate-500 focus:border-slate-300 focus:ring-0"
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className="text-sm text-slate-600">Power (higher = more powerful)</label>
              <input
                type="number"
                className="mt-1 block w-full rounded-xl border border-slate-300/60 bg-transparent
                           text-slate-900 placeholder-slate-500 focus:border-slate-300 focus:ring-0"
                value={draft.power}
                onChange={(e) => set("power", Number(e.target.value))}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-slate-700">Management</div>
              <Toggle
                label="Can manage roles"
                checked={draft.permissions?.canManageRoles}
                onChange={(v) => set("permissions.canManageRoles", v)}
                disabled={!canEdit}
              />
              <Toggle
                label="Can assign roles"
                checked={draft.permissions?.canAssignRoles}
                onChange={(v) => set("permissions.canAssignRoles", v)}
                disabled={!canEdit}
              />
            </div>
          </div>

          {/* Page visibility (ALL PAGES) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-700">Page access</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAllPages(true)}
                  disabled={!canEdit}
                  className="text-xs rounded-lg border px-2 py-1"
                  title="Enable all"
                >
                  Enable all
                </button>
                <button
                  type="button"
                  onClick={() => setAllPages(false)}
                  disabled={!canEdit}
                  className="text-xs rounded-lg border px-2 py-1"
                  title="Disable all"
                >
                  Disable all
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Toggle label="Dashboard" checked={v.dashboard} onChange={(val) => set("permissions.view.dashboard", val)} disabled={!canEdit} />
              <Toggle label="Map"       checked={v.map}       onChange={(val) => set("permissions.view.map", val)}       disabled={!canEdit} />
              <Toggle label="Routes"    checked={v.routes}    onChange={(val) => set("permissions.view.routes", val)}    disabled={!canEdit} />
              <Toggle label="Crushers"  checked={v.crushers}  onChange={(val) => set("permissions.view.crushers", val)}  disabled={!canEdit} />
              <Toggle label="Alerts"    checked={v.alerts}    onChange={(val) => set("permissions.view.alerts", val)}    disabled={!canEdit} />
              <Toggle label="Reports"   checked={v.reports}   onChange={(val) => set("permissions.view.reports", val)}   disabled={!canEdit} />
              <Toggle label="Users"     checked={v.users}     onChange={(val) => set("permissions.view.users", val)}     disabled={!canEdit} />
              <Toggle label="Roles"     checked={v.roles}     onChange={(val) => set("permissions.view.roles", val)}     disabled={!canEdit} />
              <Toggle label="Settings"  checked={v.settings}  onChange={(val) => set("permissions.view.settings", val)}  disabled={!canEdit} />
            </div>
            <div className="text-[11px] text-slate-500">
              Note: To see the <strong>Roles</strong> page, a role must have both
              <code className="mx-1">permissions.view.roles = true</code> and
              <code className="mx-1">permissions.canManageRoles = true</code>
            </div>
          </div>

          {/* Telemetry fields */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-700">Telemetry fields</div>
            <Toggle
              label="fillLevel"
              checked={draft.permissions?.view?.telemetryFields?.fillLevel}
              onChange={(v) => set("permissions.view.telemetryFields.fillLevel", v)}
              disabled={!canEdit}
            />
            <Toggle
              label="vibration"
              checked={draft.permissions?.view?.telemetryFields?.vibration}
              onChange={(v) => set("permissions.view.telemetryFields.vibration", v)}
              disabled={!canEdit}
            />
            <Toggle
              label="temperature"
              checked={draft.permissions?.view?.telemetryFields?.temperature}
              onChange={(v) => set("permissions.view.telemetryFields.temperature", v)}
              disabled={!canEdit}
            />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export default function RolesAdmin() {
  const auth = useAuth();
  const canManage = !!auth?.user?.role?.permissions?.canManageRoles;
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    try {
      const data = await getRoles();
      setRoles(Array.isArray(data) ? data.sort((a, b) => b.power - a.power) : []);
    } catch (e) {
      setErr(e?.message || "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    try {
      const top = roles[0];
      const newRole = await createRole({
        name: "NewRole",
        power: Math.max(0, (top?.power ?? 100) - 1),
        permissions: {
          canManageRoles: false,
          canAssignRoles: false,
          view: {
            // defaults for ALL pages (you can change these)
            dashboard: true,
            map: false,
            routes: false,
            crushers: false,
            alerts: false,
            reports: false,
            users: false,
            roles: false,
            settings: false,
            telemetryFields: { fillLevel: true, vibration: false, temperature: false },
          },
        },
      });
      setRoles((rs) => [newRole, ...rs].sort((a, b) => b.power - a.power));
    } catch (e) {
      alert(e?.message || "Failed to create role");
    }
  }

  async function handleSave(updated) {
    try {
      const saved = await updateRole(updated.id, updated);
      setRoles((rs) => rs.map((r) => (r.id === saved.id ? saved : r)).sort((a, b) => b.power - a.power));
    } catch (e) {
      alert(e?.message || "Failed to save role");
    }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this role? Users assigned to it will block deletion.")) return;
    try {
      await deleteRole(id);
      setRoles((rs) => rs.filter((r) => r.id !== id));
    } catch (e) {
      alert(e?.message || "Failed to delete role (is it assigned to users?)");
    }
  }

  if (!canManage) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 p-3 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          You don’t have permission to manage roles.
        </div>
      </div>
    );
  }

  if (loading) return <div className="p-6 text-slate-500">Loading roles…</div>;

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center justify-between px-1">
        <h1 className="text-lg font-semibold">Roles</h1>
        <button
          onClick={handleCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white px-3 py-1.5 text-sm hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" /> New role
        </button>
      </div>

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 p-3 text-sm">{err}</div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {roles.map((r) => (
          <RoleEditor
            key={r.id}
            role={r}
            onSave={handleSave}
            onDelete={() => handleDelete(r.id)}
            canEdit={canManage}
          />
        ))}
      </div>
    </div>
  );
}
