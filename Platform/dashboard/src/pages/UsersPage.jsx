// Platform/dashboard/src/pages/UsersPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { Card, CardHeader, CardBody } from "../components/ui";
import {
  getUsers,
  getRoles,
  updateUser,
  deleteUser,
  createUser,
  assignUserRole,
  setUserApproval, // <-- used by toggle
} from "../api";
import { DIAL_CODES } from "../constants/dialCodes";
import { Pencil, Save, X, Trash2, Plus, ShieldAlert } from "lucide-react";

const inputClass =
  "mt-1 block w-full rounded-xl border border-slate-300/60 bg-transparent " +
  "px-3 py-2 " + // padding so first char doesn't clip the border
  "text-slate-900 placeholder-slate-500 " +
  "focus:border-slate-300 focus:ring-0 focus:outline-none";

   // Swap ISO for country
  function countryNameFromCode(code) {
  if (!code) return "";
  const hit = DIAL_CODES.find(c => c.code === code);
  return hit ? hit.name : code;
}

function NewUserForm({ roles, canAssign, onCreate }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");
  const [loading, setLoading] = useState(false);

 


  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { name: name.trim(), email: email.trim(), password };
      if (canAssign && roleId) payload.roleId = roleId;
      await onCreate(payload);
      setName(""); setEmail(""); setPassword(""); setRoleId("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div>
        <label className="text-sm text-slate-600">Name</label>
        <input className={inputClass} value={name} onChange={(e)=>setName(e.target.value)} placeholder="Alex Doe" />
      </div>
      <div>
        <label className="text-sm text-slate-600">Email</label>
        <input className={inputClass} type="email" required value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="you@example.com" />
      </div>
      <div>
        <label className="text-sm text-slate-600">Password</label>
        <input className={inputClass} type="password" required value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Temporary password" />
      </div>
      <div className="flex items-end gap-2">
        {canAssign && (
          <select className={inputClass} value={roleId} onChange={(e)=>setRoleId(e.target.value)}>
            <option value="">Role (optional)</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}
        <button
          type="submit"
          className="h-[42px] w-full md:w-auto rounded-xl bg-slate-900 text-white px-4 text-sm hover:bg-slate-800 disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Creating…" : "Create"}
        </button>
      </div>
    </form>
  );
}

function UserRow({
  user,
  roles,
  canEdit,
  canAssign,
  onSave,
  onDelete,
  onToggleApproval, // <-- new prop
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(user);
  useEffect(() => { setDraft(user); }, [user]);

  function set(path, val) {
    setDraft(prev => {
      const next = { ...prev };
      if (path.startsWith("profile.")) {
        const key = path.slice("profile.".length);
        next.profile = { ...(prev.profile || {}) };
        if (key.includes(".")) {
          const [k1, k2] = key.split(".");
          next.profile[k1] = { ...(next.profile[k1] || {}), [k2]: val };
        } else {
          next.profile[key] = val;
        }
      } else {
        next[path] = val;
      }
      return next;
    });
  }

  const changed =
    JSON.stringify({
      name: draft.name, email: draft.email, roleId: draft.roleId || draft.role?.id, profile: draft.profile,
    }) !== JSON.stringify({
      name: user.name, email: user.email, roleId: user.roleId || user.role?.id, profile: user.profile,
    });

  const roleOptions = [{ id: "", name: "(none)" }, ...roles];

  async function save() {
    if (!changed) { setEditing(false); return; }
    try {
      await onSave(
        {
          id: draft.id,
          name: draft.name,
          email: draft.email,
          profile: draft.profile || {},
        },
        draft.roleId || draft.role?.id
      );
      setEditing(false);
    } catch (e) {
      // onSave already alerts
    }
  }

  // Derived display fields
  const company = user.profile?.company || "";
  const addr1 = user.profile?.address1 || user.profile?.address || user.profile?.addr1 || "";
  const addr2 = user.profile?.address2 || user.profile?.addr2 || "";
  const city = user.profile?.city || "";
  const state = user.profile?.state || "";
  const countryCode = user.profile?.country || "";
  const country = countryNameFromCode(countryCode);
  const phoneDial = user.profile?.phone?.dial || "";
  const phoneNumber = user.profile?.phone?.number || "";

  return (
    <>
      {/* Primary row */}
      <tr className="border-b align-top">
        {/* User */}
        <td className="py-3 pr-3 w-[24%]">
          {editing ? (
            <>
              <label className="text-xs text-slate-500">Name</label>
              <input className={inputClass} value={draft.name || ""} onChange={(e)=>set("name", e.target.value)} placeholder="Name" />
              <div className="text-[10px] text-slate-400 mt-1">{user.id}</div>
            </>
          ) : (
            <>
              <div className="font-medium text-slate-800">{user.name || "-"}</div>
              <div className="text-[10px] text-slate-400">{user.id}</div>
            </>
          )}
        </td>

        {/* Email */}
        <td className="py-3 pr-3 w-[26%]">
          {editing ? (
            <>
              <label className="text-xs text-slate-500">Email</label>
              <input className={inputClass} type="email" value={draft.email || ""} onChange={(e)=>set("email", e.target.value)} placeholder="email@domain.com" />
            </>
          ) : (
            <div className="text-slate-700">{user.email}</div>
          )}
        </td>

        {/* Role */}
        <td className="py-3 pr-3 w-[18%]">
          {canAssign ? (
            editing ? (
              <>
                <label className="text-xs text-slate-500">Role</label>
                <select
                  className={inputClass}
                  value={draft.roleId || draft.role?.id || ""}
                  onChange={(e)=>set("roleId", e.target.value)}
                >
                  {roleOptions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </>
            ) : (
              <span className="text-slate-700">{user.role?.name || "-"}</span>
            )
          ) : (
            <span className="text-slate-700">{user.role?.name || "-"}</span>
          )}
        </td>

        {/* Status with slider toggle */}
        <td className="py-3 pr-3 w-[18%]">
          <label className="flex items-center gap-3 select-none">
            {/* Slider */}
            <span className="relative inline-flex items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={!!user.approved}
                disabled={!!user.__savingApproval || !canEdit}
                onChange={(e) => onToggleApproval?.(user, e.target.checked)}
                aria-label={user.approved ? "Approved (click to pause)" : "Paused (click to approve)"}
              />
              <span
                className={
                  "block h-6 w-11 rounded-full transition-colors " +
                  (user.approved ? "bg-emerald-500" : "bg-slate-300") +
                  (user.__savingApproval ? " opacity-60" : "")
                }
              />
              <span
                className={
                  "pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform " +
                  (user.approved ? "translate-x-5" : "translate-x-0")
                }
              />
            </span>

            {/* Label pill */}
            {user.approved ? (
              <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 px-2 py-1 text-xs">
                Approved
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 px-2 py-1 text-xs">
                Paused
              </span>
            )}
          </label>
        </td>

        {/* Actions */}
        <td className="py-3 text-right w-[14%]">
          {editing ? (
            <div className="inline-flex items-center gap-2">
              <button
                onClick={() => { setDraft(user); setEditing(false); }}
                className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm"
                title="Cancel"
                type="button"
              >
                <X className="h-4 w-4" /> Cancel
              </button>
              <button
                onClick={save}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white px-3 py-1.5 text-sm hover:bg-slate-800"
                title="Save"
                type="button"
              >
                <Save className="h-4 w-4" /> Save
              </button>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2">
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm"
                disabled={!canEdit && !canAssign}
                title="Edit"
                type="button"
              >
                <Pencil className="h-4 w-4" /> Edit
              </button>
              <button
                onClick={() => onDelete?.(user.id)}
                className="inline-flex items-center gap-2 rounded-xl border border-red-300 text-red-700 px-3 py-1.5 text-sm hover:bg-red-50"
                disabled={!canEdit}
                title="Delete user"
                type="button"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
          )}
        </td>
      </tr>

{/* Details row (indented panel) */}
<tr className="border-b last:border-0">
  <td colSpan={5} className="py-3 px-2">
    <div className="mx-2 rounded-xl border border-slate-200/70 bg-slate-50/60 px-4 py-3">
      {editing ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Company */}
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Company</div>
            <input
              className={inputClass}
              value={draft.profile?.company || ""}
              onChange={(e)=>set("profile.company", e.target.value)}
              placeholder="Company"
            />
          </div>

          {/* Address */}
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Address</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                className={inputClass}
                value={draft.profile?.address1 || draft.profile?.address || ""}
                onChange={(e)=>set("profile.address1", e.target.value)}
                placeholder="Address line 1"
                autoComplete="address-line1"
              />
              <input
                className={inputClass}
                value={draft.profile?.address2 || ""}
                onChange={(e)=>set("profile.address2", e.target.value)}
                placeholder="Address line 2"
                autoComplete="address-line2"
              />
              <input
                className={inputClass}
                value={draft.profile?.city || ""}
                onChange={(e)=>set("profile.city", e.target.value)}
                placeholder="City"
                autoComplete="address-level2"
              />
              <input
                className={inputClass}
                value={draft.profile?.state || ""}
                onChange={(e)=>set("profile.state", e.target.value)}
                placeholder="State / County"
                autoComplete="address-level1"
              />
              <select
                className={inputClass}
                value={draft.profile?.country || ""}
                onChange={(e)=>set("profile.country", e.target.value)}
                autoComplete="country"
              >
                <option value="">Country</option>
                {DIAL_CODES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {/* Phone */}
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Phone</div>
            <div className="grid grid-cols-[170px,1fr] gap-3">
              <select
                className={inputClass}
                value={draft.profile?.phone?.dial || ""}
                onChange={(e)=>set("profile.phone.dial", e.target.value)}
                aria-label="Country dial code"
              >
                {DIAL_CODES.map(c => (
                  <option key={`${c.code}-${c.dial}`} value={c.dial}>
                    {c.name} ({c.dial})
                  </option>
                ))}
              </select>
              <input
                className={inputClass}
                value={draft.profile?.phone?.number || ""}
                onChange={(e)=>set("profile.phone.number", e.target.value)}
                placeholder="123 456 789"
                inputMode="tel"
                autoComplete="tel-national"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Company */}
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Company</div>
            <div className="text-slate-700">{company || "-"}</div>
          </div>

          {/* Address */}
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Address</div>
            <div className="text-slate-700 space-y-0.5">
              <div>{addr1 || "-"}</div>
              {addr2 ? <div>{addr2}</div> : null}
              <div className="text-sm text-slate-600">
                {[city, state, country].filter(Boolean).join(", ") || "-"}
              </div>
            </div>
          </div>

          {/* Phone */}
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Phone</div>
            <div className="text-slate-700">
              {(phoneDial || phoneNumber) ? `${phoneDial} ${phoneNumber}`.trim() : "-"}
            </div>
          </div>
        </div>
      )}
    </div>
  </td>
</tr>

    </>
  );
}

export default function UsersPage() {
  const auth = useAuth();
  const canManage =
    !!auth?.user?.role?.permissions?.canManageRoles ||
    (Array.isArray(auth?.user?.roles) && auth.user.roles.includes("admin")) ||
    auth?.user?.email === "admin@example.com";
  const canAssign =
    !!auth?.user?.role?.permissions?.canAssignRoles ||
    (Array.isArray(auth?.user?.roles) && auth.user.roles.includes("admin")) ||
    auth?.user?.email === "admin@example.com";

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u.name || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.role?.name || "").toLowerCase().includes(q) ||
      (u.profile?.company || "").toLowerCase().includes(q) ||
      (u.profile?.city || "").toLowerCase().includes(q) ||
      (u.profile?.state || "").toLowerCase().includes(q) ||
      (u.profile?.country || "").toLowerCase().includes(q)
    );
  }, [users, query]);

  async function load() {
    setLoading(true); setErr("");
    try {
      const [u, r] = await Promise.all([getUsers(), getRoles()]);
      setUsers(Array.isArray(u) ? u : []);
      setRoles(Array.isArray(r) ? r.sort((a,b)=>b.power-a.power) : []);
    } catch (e) {
      setErr(e?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }
  useEffect(()=>{ load(); }, []);

  async function handleCreate(payload) {
    try {
      const created = await createUser(payload);
      if (payload.roleId && (!created.roleId && !created.role)) {
        try { await assignUserRole(created.id, { roleId: payload.roleId }); } catch {}
      }
      await load();
      return created;
    } catch (e) {
      alert(e?.message || "Failed to create user");
      return null;
    }
  }

  async function handleSave(patch, roleId) {
    try {
      await updateUser(patch.id, {
        name: patch.name,
        email: patch.email,
        profile: patch.profile || {},
      });
      if (canAssign && roleId !== undefined) {
        await assignUserRole(patch.id, { roleId: roleId || "" });
      }
      await load();
    } catch (e) {
      alert(e?.message || "Failed to save user");
    }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this user?")) return;
    try {
      await deleteUser(id);
      setUsers(list => list.filter(u => u.id !== id));
    } catch (e) {
      alert(e?.message || "Failed to delete user");
    }
  }

  // Toggle approval (approve/unapprove)
async function handleToggleApproval(user, nextApproved) {
  try {
    // optimistic
    setUsers(list =>
      list.map(u =>
        u.id === user.id ? { ...u, approved: nextApproved, __savingApproval: true } : u
      )
    );

    const res = await setUserApproval(user.id, nextApproved);
    const updated = res?.user;

    setUsers(list =>
      list.map(u => {
        if (u.id !== user.id) return u;
        const base = { ...u, __savingApproval: false };
        if (updated && typeof updated.approved === "boolean") {
          return { ...base, ...updated };
        }
        // if server omitted it (shouldn't with fix), keep our optimistic value
        return base;
      })
    );
  } catch (e) {
    // revert on failure
    setUsers(list =>
      list.map(u =>
        u.id === user.id ? { ...u, approved: !nextApproved, __savingApproval: false } : u
      )
    );
    alert(e?.message || "Failed to update approval");
  }
}



  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center justify-between px-1">
        <h1 className="text-lg font-semibold">Users</h1>
        <div className="flex items-center gap-2">
          <input
            className="rounded-xl border border-slate-300/60 bg-transparent px-3 py-2 text-sm"
            placeholder="Search users…"
            value={query}
            onChange={(e)=>setQuery(e.target.value)}
          />
        </div>
      </div>

      {(!canManage && !canAssign) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 p-3 text-sm flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" />
          You don’t have permission to manage or assign users.
        </div>
      )}

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 p-3 text-sm">{err}</div>
      )}

      {canManage && (
        <Card>
          <CardHeader>
            <div className="text-base font-medium flex items-center gap-2">
              <Plus className="h-4 w-4" /> New user
            </div>
          </CardHeader>
          <CardBody>
            <NewUserForm roles={roles} canAssign={canAssign} onCreate={handleCreate} />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="text-base font-medium">All users</div>
        </CardHeader>
        <CardBody>
          {loading ? (
            <div className="p-3 text-slate-500">Loading…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-2 pr-3 w-[24%]">User</th>
                    <th className="pb-2 pr-3 w-[26%]">Email</th>
                    <th className="pb-2 pr-3 w-[18%]">Role</th>
                    <th className="pb-2 pr-3 w-[18%]">Status</th>
                    <th className="pb-2 text-right w-[14%]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(u => (
                    <UserRow
                      key={u.id}
                      user={u}
                      roles={roles}
                      canEdit={canManage}
                      canAssign={canAssign}
                      onSave={handleSave}
                      onDelete={canManage ? handleDelete : ()=>{}}
                      onToggleApproval={canManage ? handleToggleApproval : null} // <-- pass toggle
                    />
                  ))}
                </tbody>
              </table>
              {!filtered.length && (
                <div className="p-4 text-slate-500">No users match your search.</div>
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
