const DEFAULT_ROLES = [
  {
    id: "role-superadminpel",
    name: "SuperAdminPEL",
    power: 100,
    permissions: {
      canManageRoles: true,
      canAssignRoles: true,
      view: {
        dashboard: true, map: true, routes: true, alerts: true,
        users: true, reports: true, settings: true,
        telemetryFields: { fillLevel: true, vibration: true, temperature: true },
      },
    },
  },
  {
    id: "role-adminpel",
    name: "AdminPEL",
    power: 80,
    permissions: {
      canManageRoles: true,
      canAssignRoles: true,
      view: {
        dashboard: true,
        alerts: true,
        routes: true,
        map: true,
        telemetryFields: { fillLevel: true, vibration: true, temperature: true },
      },
    },
  },
  {
    id: "role-distributor",
    name: "Distributor",
    power: 60,
    permissions: {
      canManageRoles: false,
      canAssignRoles: false,
      view: {
        dashboard: true,
        alerts: false,
        routes: true,
        map: true,
        telemetryFields: { fillLevel: true, vibration: false, temperature: false },
      },
    },
  },
  {
    id: "role-technician",
    name: "Technician",
    power: 50,
    permissions: {
      canManageRoles: false,
      canAssignRoles: false,
      view: {
        dashboard: true,
        alerts: true,
        routes: false,
        map: true,
        telemetryFields: { fillLevel: true, vibration: true, temperature: true },
      },
    },
  },
  {
    id: "role-customer",
    name: "Customer",
    power: 40,
    permissions: {
      canManageRoles: false,
      canAssignRoles: false,
      view: {
        dashboard: true,
        alerts: false,
        routes: false,
        map: false,
        telemetryFields: { fillLevel: true, vibration: false, temperature: false },
      },
    },
  },
];

// Ensure roles exist; backfill users to roleId (migrates legacy users[].roles -> roleId)
function ensureRolesSeed(db) {
  if (!Array.isArray(db.roles) || db.roles.length === 0) {
    db.roles = DEFAULT_ROLES.map((r) => ({ ...r }));
  }
  if (Array.isArray(db.users)) {
    const superRole = db.roles.find((r) => r.name === "SuperAdminPEL") || DEFAULT_ROLES[0];
    const customer = db.roles.find((r) => r.name === "Customer") || DEFAULT_ROLES[DEFAULT_ROLES.length - 1];

    db.users = db.users.map((u) => {
      if (u.roleId) return u; // already migrated
      let roleId = customer.id;
      if (Array.isArray(u.roles) && u.roles.includes("admin")) roleId = superRole.id; // legacy admin -> superadmin
      return { ...u, roleId };
    });
  }
  return db;
}

function getRoleById(db, id) {
  return (db.roles || []).find((r) => r.id === id) || null;
}
function getRoleByName(db, name) {
  return (db.roles || []).find((r) => r.name === name) || null;
}

function isHigherPower(roleA, roleB) {
  if (!roleA || !roleB) return false;
  return Number(roleA.power || 0) > Number(roleB.power || 0);
}

function canManageRoles(role) {
  return !!role?.permissions?.canManageRoles;
}
function canAssignRoles(role) {
  return !!role?.permissions?.canAssignRoles;
}

function canManageTargetRole(currentRole, targetRole) {
  return canManageRoles(currentRole) && isHigherPower(currentRole, targetRole);
}
function canAssignTargetRole(currentRole, targetRole) {
  return canAssignRoles(currentRole) && isHigherPower(currentRole, targetRole);
}

// Field-level filter for crusher/telemetry objects based on role perms
function maskCrusherForRole(crusher, role) {
  const perms = role?.permissions?.view?.telemetryFields || {};
  const clone = { ...crusher };
  if (perms.fillLevel === false) delete clone.fillLevel;
  if (perms.vibration === false && clone.metrics?.vibration != null) {
    clone.metrics = { ...(clone.metrics || {}) };
    delete clone.metrics.vibration;
  }
  if (perms.temperature === false && clone.metrics?.temperature != null) {
    clone.metrics = { ...(clone.metrics || {}) };
    delete clone.metrics.temperature;
  }
  return clone;
}

module.exports = {
  DEFAULT_ROLES,
  ensureRolesSeed,
  getRoleById,
  getRoleByName,
  isHigherPower,
  canManageRoles,
  canAssignRoles,
  canManageTargetRole,
  canAssignTargetRole,
  maskCrusherForRole,
};
