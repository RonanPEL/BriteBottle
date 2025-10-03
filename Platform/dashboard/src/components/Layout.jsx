// src/components/Layout.jsx
import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  Map,
  Route as RouteIcon,
  Bell,
  FileText,
  Users,
  Recycle,
  Settings,
  LogOut,
  Shield,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import AuthExpiryGate from "../auth/AuthExpiryGate";

const NavItem = ({ to, icon, label, badge }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${isActive
        ? 'bg-slate-900 text-white'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`
    }
  >
    <span className="flex items-center gap-3">
      {icon}
      <span className="font-medium">{label}</span>
    </span>
    {badge != null && (
      <span className="min-w-[28px] h-6 px-2 rounded-full text-xs grid place-items-center bg-rose-100 text-rose-600">
        {badge}
      </span>
    )}
  </NavLink>
)

export default function Layout() {
  const { user, logout } = useAuth()

  // Permission helpers (undefined => allowed for backwards compatibility)
  const view = user?.role?.permissions?.view || {}
  const canView = (key) => (key in view ? !!view[key] : true)
  const canManageRoles = !!user?.role?.permissions?.canManageRoles

  // Safely derive role + company for header
  const roleLabel =
    user?.role?.name ||
    user?.roleName ||
    (Array.isArray(user?.roles) && user.roles[0]) ||
    null



  return (
    <div className="min-h-screen bg-slate-50">
      <AuthExpiryGate redirectOnNextClick={true} />
      {/* Top bar */}
      <div className="border-b bg-white sticky top-0 z-40">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 grid place-items-center rounded-xl bg-red-600 text-white font-bold">
              PEL
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">
                BriteBottle
              </div>
              <h1 className="text-xl font-semibold text-slate-800">Dashboard</h1>
            </div>
          </div>

          {/* Auth area */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col leading-tight items-end">
              <span className="text-sm text-slate-700">{user?.email}</span>
              {roleLabel && (
                <span className="text-xs text-slate-500">{roleLabel}</span>
              )}
            </div>
            <button
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-7xl px-6 py-8 grid grid-cols-12 gap-6">
        <aside className="col-span-12 lg:col-span-2">
          <div className="sticky top-20 space-y-2">
            {canView('dashboard') && (
              <NavItem
                to="/"
                icon={<LayoutDashboard className="h-4 w-4" />}
                label="Dashboard"
              />
            )}
            {canView('map') && (
              <NavItem to="/map" icon={<Map className="h-4 w-4" />} label="Map" />
            )}
            {canView('routes') && (
              <NavItem
                to="/routes"
                icon={<RouteIcon className="h-4 w-4" />}
                label="Routes"
              />
            )}
            {/* Crushers not explicitly in perms; showing by default */}
            <NavItem
              to="/crushers"
              icon={<Recycle className="h-4 w-4" />}
              label="Crushers"
            />
            {canView('alerts') && (
              <NavItem
                to="/alerts"
                icon={<Bell className="h-4 w-4" />}
                label="Alerts"
              />
            )}
            {/* Reports/Users/Settings shown by default unless you add view toggles for them later */}
            <NavItem
              to="/reports"
              icon={<FileText className="h-4 w-4" />}
              label="Reports"
            />
            <NavItem
              to="/users"
              icon={<Users className="h-4 w-4" />}
              label="Users"
            />

            {/* Roles (only for role managers) */}
            {canManageRoles && (
              <NavItem
                to="/roles"
                icon={<Shield className="h-4 w-4" />}
                label="Roles"
              />
            )}

            <NavItem
              to="/settings"
              icon={<Settings className="h-4 w-4" />}
              label="Settings"
            />
          </div>
        </aside>

        <main className="col-span-12 lg:col-span-10 space-y-6">
          <Outlet />
        </main>
      </div>

      <div className="py-8 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} PEL - Waste Reduction Equipment
      </div>
    </div>
  )
}
