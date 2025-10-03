// src/App.jsx
import React from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";

import Dashboard from "./pages/Dashboard";
import MapPage from "./pages/MapPage";
import RoutesPage from "./pages/RoutesPage";
import CrushersList from "./pages/CrushersList";
import CrusherDetail from "./pages/CrusherDetail";
import AlertsPage from "./pages/AlertsPage";
import ReportsPage from "./pages/ReportsPage";
import UsersPage from "./pages/UsersPage";
import SettingsPage from "./pages/SettingsPage";
import RolesAdmin from "./pages/RolesAdmin";

import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";

import { ProtectedRoute, PublicOnlyRoute } from "./auth/RouteGuards";


export default function App() {
  return (
    <Routes>
      {/* Public-only routes */}
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
      </Route>

      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="map" element={<MapPage />} />
          <Route path="routes" element={<RoutesPage />} />
          <Route path="crushers" element={<CrushersList />} />
          <Route path="crushers/:id" element={<CrusherDetail />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="roles" element={<RolesAdmin />} />
        </Route>
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Login />} />
    </Routes>
  );
}
