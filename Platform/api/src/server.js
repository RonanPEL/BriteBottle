// RBAC

require("dotenv").config();

const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
// RBAC 
const {
    ensureRolesSeed,
    getRoleById,
    getRoleByName,
    isHigherPower,
    canManageRoles,
    canAssignRoles,
    canManageTargetRole,
    canAssignTargetRole,
    maskCrusherForRole,
    DEFAULT_ROLES,
} = require("./rbac");

//S3
const uploadSign = require("./routes/uploadSign");
const uploads = require("./routes/uploads");



//sec midware
function noop(req, res, next) { next(); }
function safeRequire(name, fallbackFactory) {
    try { return require(name); }
    catch { console.warn(`[WARN] ${name} not installed; continuing without it`); return fallbackFactory; }
}

const helmet = safeRequire("helmet", () => noop);
const rateLimit = safeRequire("express-rate-limit", () => () => noop);
const cors = safeRequire("cors", () => () => noop);



let CONFIG = {};
try {
    const p = path.join(__dirname, "../../config/app-config.json");
    CONFIG = JSON.parse(fs.readFileSync(p, "utf8"));
} catch { /* ok */ }

const PORT = Number(process.env.PORT || 3000);
const REQUIRE_API_KEY = String(process.env.REQUIRE_API_KEY || "").toLowerCase() === "true";
const API_KEY = process.env.API_KEY || CONFIG.apiKey || "local-key-123";
const CORS_ORIGINS = (process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : (CONFIG.cors?.origins || ["http://localhost:5173"])).map(s => s.trim());
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || CONFIG.publicBaseUrl || `http://localhost:${PORT}`;
const WEB_BASE_URL = process.env.WEB_BASE_URL || CONFIG.webBaseUrl || "http://localhost:5173";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "2h";

if (REQUIRE_API_KEY && !API_KEY) {
    console.warn("[API] REQUIRE_API_KEY=true but no API key provided");
}

const app = express();
//Security + rate limit
app.use(helmet());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }));
app.use(express.json({ limit: "1mb" }));
app.use(cors({
    origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        return CORS_ORIGINS.includes(origin) ? cb(null, true) : cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
}));
app.options("*", cors()); // preflight



function normalizeProfile(p = {}) {
    const phone = p.phone || {};
    return {
        company: p.company || "",
        language: p.language || "en",
        address1: p.address1 || p.address || "",
        address2: p.address2 || "",
        city: p.city || "",
        state: p.state || "",
        country: p.country || "",
        phone: {
            dial: phone.dial || p.phoneDial || "",
            number: phone.number || p.phoneNumber || "",
        },
    };
}

const VALID_EVENT_TYPES = new Set(["CREATED", "INSTALL", "SERVICE", "ALERT", "LOCK", "SUBSCRIPTION"]);
function makeId() { try { return require("crypto").randomUUID(); } catch { return `ev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; } }
function normalizeEvent(e) {
    const ts = e.ts || e.timestamp || e.time || new Date().toISOString();
    const type = String(e.type || "").toUpperCase();
    return {
        id: e.id || makeId(),
        crusherId: String(e.crusherId || e.assetId || e.cid || ""),
        ts,
        type: VALID_EVENT_TYPES.has(type) ? type : "NOTE",
        level: e.level || e.severity || null,
        message: e.message || e.eventLabel || "",
        source: e.source || e.who || "System",
        meta: e.meta || {}
    };
}


// Return the shape the dashboard expects - Serializer
function serializeUser(db, user) {
    let role = null;
    if (user.roleId && Array.isArray(db.roles)) {
        role = db.roles.find(r => r.id === user.roleId) || null;
    }
    if (!role && Array.isArray(user.roles) && user.roles.includes("admin")) {
        role = getRoleByName(db, "SuperAdminPEL") || (DEFAULT_ROLES && DEFAULT_ROLES[0]) || null;
    }
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        profile: normalizeProfile(user.profile || {}), // ensure full shape
        approved: user.approved !== false,
        ...(role ? { role } : {}),
    };
}

// ---- Crusher helpers (enrich fields + seed demo machines) ----
function enrichCrusher(c, alerts) {
    const alertsFor = (alerts || []).filter(a => a.source === c.id);
    const alertsCount = alertsFor.length;

    return {
        id: c.id,
        name: c.name || `Crusher ${c.id}`,
        // NEW fields (safe defaults)
        type: c.type || "BB01",
        location: c.location || c.city || c.site || "",
        serial: c.serial || `PEL-${String(c.id).replace(/\W+/g, "").toUpperCase()}`,
        mainsVoltage: c.mainsVoltage ?? 230,
        temperature: c.temperature ?? 22.0,
        customer: c.customer || c.customerName || "",
        lastSync: c.lastSync || c.lastSeen || new Date().toISOString(),
        alertsCount,

        // keep existing fields
        lat: c.lat ?? 0,
        lng: c.lng ?? 0,
        status: c.status || "ok",
        fillLevel: Number(c.fillLevel ?? 0),
        crushedToday: Number(c.crushedToday ?? 0),
        lastEmptied: c.lastEmptied || null,
    };
}

function ensureOnlyTwoDemoCrushers(db) {
    db.crushers = Array.isArray(db.crushers) ? db.crushers : [];

    // Keep ONLY the two demo machines
    db.crushers = db.crushers.filter(c => c.id === "c-201" || c.id === "c-202");

    const byId = Object.fromEntries(db.crushers.map(c => [c.id, c]));

    // c-201 (BB01)
    if (!byId["c-201"]) {
        db.crushers.push({
            id: "c-201",
            name: "PEL Office",
            type: "BB01",
            location: "Mayo, IE",
            serial: "PEL-DC-000201",
            customer: "PEL",
            lat: 53.3498, lng: -6.2603,
            status: "ok",
            temperature: 0,
            mainsVoltage: 0,
            fillLevel: 0,
            crushedToday: 0,
            lastSync: null,
        });
    } else {
        Object.assign(byId["c-201"], {
            type: "BB01",
            location: byId["c-201"].location || "Mayo, IE",
            serial: byId["c-201"].serial || "PEL-DC-000201",
            customer: byId["c-201"].customer || "PEL",
            temperature: 0,
            mainsVoltage: 0,
            fillLevel: 0,
            crushedToday: 0,
            lastSync: null,
        });
    }

    // c-202 (BB06)
    if (!byId["c-202"]) {
        db.crushers.push({
            id: "c-202",
            name: "PEL Warehouse",
            type: "BB06",
            location: "Mayo, IE",
            serial: "PEL-CK-000202",
            customer: "PEL",
            lat: 53.8, lng: -9.1,
            status: "ok",
            temperature: 0,
            mainsVoltage: 0,
            fillLevel: 0,
            crushedToday: 0,
            lastSync: null,
        });
    } else {
        Object.assign(byId["c-202"], {
            type: "BB06",
            location: byId["c-202"].location || "Mayo, IE",
            serial: byId["c-202"].serial || "PEL-CK-000202",
            customer: byId["c-202"].customer || "PEL",
            temperature: 0,
            mainsVoltage: 0,
            fillLevel: 0,
            crushedToday: 0,
            lastSync: null,
        });
    }

    // Enrich both for consistent shape
    db.crushers = db.crushers.map(c => enrichCrusher(c, db.alerts));
    return db;
}





// ----- Simple file DB -----
const DB_PATH = path.join(__dirname, "db.json");
async function readDB() {
    try {
        const raw = await fs.readFile(DB_PATH, "utf8");
        return JSON.parse(raw);
    } catch {
        const seeded = await seedDB();
        return seeded;
    }
}

async function ensureSeededEvents() {
    const db = await readDB();
    if (!Array.isArray(db.events)) db.events = [];
    if (db.events.length > 0) return;

    const crushers = Array.isArray(db.crushers) ? db.crushers : [];
    for (const c of crushers) {
        const cid = String(c.id);

        if (c.createdAt || c.created_at || c.createdTS || c.created) {
            db.events.push(normalizeEvent({
                crusherId: cid,
                ts: c.createdAt || c.created_at || c.createdTS || c.created,
                type: "CREATED",
                message: "Crusher created",
                source: c.createdBy || c.owner || "System"
            }));
        }

        for (const r of (Array.isArray(c.serviceReports) ? c.serviceReports : [])) {
            db.events.push(normalizeEvent({
                crusherId: cid,
                ts: r.ts || r.timestamp || r.time || new Date().toISOString(),
                type: "SERVICE",
                message: r.description || "Service report",
                source: r.by || "Unknown",
                meta: { id: r.id }
            }));
        }

        const installs = Array.isArray(c.installs) ? c.installs
            : Array.isArray(c.installHistory) ? c.installHistory
                : Array.isArray(c.installations) ? c.installations
                    : [];
        for (const ins of installs) {
            db.events.push(normalizeEvent({
                crusherId: cid,
                ts: ins.installedAt || ins.ts || ins.timestamp || ins.time || ins.date || new Date().toISOString(),
                type: "INSTALL",
                message: ins.description || (ins.site ? `Installed @ ${ins.site}` : "Installed"),
                source: ins.by || ins.installer || "Unknown",
                meta: { id: ins.id }
            }));
        }

        const alerts = [
            ...(Array.isArray(c.alerts) ? c.alerts : []),
            ...(Array.isArray(c.latestAlerts) ? c.latestAlerts : []),
            ...(Array.isArray(c.activeAlerts) ? c.activeAlerts : []),
        ];
        for (const a of alerts) {
            db.events.push(normalizeEvent({
                crusherId: cid,
                ts: a.ts || a.timestamp || a.time || a.occurredAt || new Date().toISOString(),
                type: "ALERT",
                message: a.label || a.title || a.type || a.name || "Alert",
                level: a.severity || a.level || null,
                source: a.by || "System",
                meta: { id: a.id }
            }));
        }
        const subs = Array.isArray(c.subscriptions) ? c.subscriptions : [];
        for (const s of subs) {
            const ts = s.createdAt || s.startAt || s.startDate || s.ts || s.timestamp || s.time || null;
            db.events.push(normalizeEvent({
                crusherId: cid,
                ts: ts || new Date().toISOString(),
                type: "SUBSCRIPTION",
                message: s.plan ? `Subscription: ${s.plan}${s.status ? ` (${s.status})` : ""}` : (s.status ? `Subscription: ${s.status}` : "Subscription"),
                source: s.by || s.createdBy || "System",
                meta: { id: s.id, plan: s.plan || null, status: s.status || null }
            }));
        }
    }

    db.events.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    await writeDB(db);
    console.log(`[API] Seeded ${db.events.length} events.`);
}

// call this once during startup (after app is created)
ensureSeededEvents().catch(console.error);




async function writeDB(db) {
    await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}
function uid() {
    return crypto.randomUUID();
}
function nowISO() {
    return new Date().toISOString();
}
async function seedDB() {
    const hash = bcrypt.hashSync("password123", 10);
    const crushers = [
        { id: "c-101", name: "Dublin Central", lat: 53.3498, lng: -6.2603, status: "ok", fillLevel: 0.32, crushedToday: 184, lastEmptied: new Date(Date.now() - 86400000).toISOString() },
        { id: "c-102", name: "Cork City", lat: 51.8985, lng: -8.4756, status: "ok", fillLevel: 0.61, crushedToday: 223, lastEmptied: new Date(Date.now() - 2 * 86400000).toISOString() },
        { id: "c-103", name: "Galway Harbour", lat: 53.2707, lng: -9.0568, status: "warning", fillLevel: 0.87, crushedToday: 301, lastEmptied: new Date(Date.now() - 3 * 86400000).toISOString() }
    ];
    const events = [
        { id: uid(), type: "crush", crusherId: "c-101", qty: 12, ts: nowISO() },
        { id: uid(), type: "crush", crusherId: "c-102", qty: 9, ts: nowISO() },
        { id: uid(), type: "maintenance", crusherId: "c-103", note: "Routine check", ts: nowISO() }
    ];
    const alerts = [
        { id: uid(), level: "warning", source: "c-103", message: "High fill level (>85%)", ts: nowISO() }
    ];
    const routes = [
        {
            id: "r-1",
            name: "Dublin Loop",
            path: [
                [53.3498, -6.2603],
                [53.343, -6.271],
                [53.36, -6.29]
            ],
            stops: [{ crusherId: "c-101" }]
        },
        {
            id: "r-2",
            name: "Southwest",
            path: [
                [53.3498, -6.2603],
                [51.8985, -8.4756]
            ],
            stops: [{ crusherId: "c-102" }]
        }
    ];
    const db = {
        users: [
            { id: "u-1", name: "Admin", email: "admin@example.com", passwordHash: hash, roles: ["admin"], approved: true }
        ],
        passwordResets: [], // { token, userId, expiresAt }
        crushers,
        events,
        alerts,
        routes
    };
    await writeDB(db);
    console.log("Seeded DB with admin@example.com / password123");
    return db;
}

// ----- Middleware -----
function requireApiKey(req, res, next) {
    if (!REQUIRE_API_KEY) return next();
    const got = req.header("X-API-Key");
    if (got && got === API_KEY) return next();
    return res.status(401).json({ message: "API key required" });
}
function signToken(user) {
    return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
async function requireAuth(req, res, next) {
    try {
        const hdr = req.header("Authorization") || "";
        const [, token] = hdr.split(" ");
        if (!token) return res.status(401).json({ message: "Missing token" });

        const payload = jwt.verify(token, JWT_SECRET);
        const db = await readDB();
        const user = (db.users || []).find(u => u.id === payload.sub);
        if (!user) return res.status(401).json({ message: "Invalid token" });

        // Hydrate role for RBAC
        let role = null;
        if (user.roleId && Array.isArray(db.roles)) {
            role = db.roles.find(r => r.id === user.roleId) || null;
        }
        // Legacy support: treat "admin" legacy as SuperAdminPEL
        if (!role && Array.isArray(user.roles) && user.roles.includes("admin")) {
            role = getRoleByName(db, "SuperAdminPEL") || (DEFAULT_ROLES && DEFAULT_ROLES[0]) || null;
        }

        req.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            roleId: user.roleId || null,
            roles: user.roles || [],
            role,
        };
        next();
    } catch (err) {
        return res.status(401).json({ message: "Unauthorized" });
    }
}

// DEBUG check for who and send 401
app.get("/whoami", (req, res) => {
    res.json({
        ok: true,
        user: req.user || null,
        gotAuthHeader: !!req.header("Authorization"),
        gotApiKey: !!req.header("X-API-Key"),
    });
});



async function getCurrentUserAndRole(req) {
    const db = await readDB();
    const user = (db.users || []).find((u) => u.id === req.user?.id || u.email === req.user?.email);
    const role = user ? getRoleById(db, user.roleId) : null;
    return { db, user, role };
}


// ----- Health -----
app.get("/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));


// ----- Auth: Register -----
app.post("/auth/register", requireApiKey, async (req, res) => {
    const { name, email, password, profile = {} } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });

    const db = await readDB();
    const exists = (db.users || []).find(
        (u) => String(u.email || "").toLowerCase() === String(email || "").toLowerCase()
    );
    if (exists) return res.status(409).json({ message: "Email already in use" });

    const customerRole = db.roles?.find((r) => r.name === "Customer");
    const user = {
        id: uid(),
        name: name || "",
        email,
        passwordHash: bcrypt.hashSync(password, 10),
        roleId: customerRole?.id || null,
        profile: normalizeProfile(profile),   // store profile
        approved: false,                      // require approval
    };

    db.users = [...(db.users || []), user];
    await writeDB(db);

    const token = signToken(user);
    res.json({
        token,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            profile: user.profile,
            approved: user.approved,
            // (optionally include role here if you already serialize it)
        },
    });
});

//  Auth Login
app.post("/auth/login", requireApiKey, async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });

    const db = await readDB();
    const user = (db.users || []).find(u => u.email.toLowerCase() === String(email).toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(401).json({ message: "Invalid credentials" });
    }

    if (user.approved === false) {
        return res.status(403).json({ message: "Waiting for Registration to be approved by Admin" });
    }

    const token = signToken(user);
    res.json({ token, user: serializeUser(db, user) });
});


app.post("/auth/forgot-password", requireApiKey, async (req, res) => {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ message: "Email required" });
    const db = await readDB();
    const user = db.users.find(u => u.email.toLowerCase() === String(email).toLowerCase());
    if (user) {
        const token = crypto.randomBytes(24).toString("hex");
        const expiresAt = Date.now() + 1000 * 60 * 60; // 1h
        db.passwordResets = db.passwordResets.filter(p => p.userId !== user.id);
        db.passwordResets.push({ token, userId: user.id, expiresAt });
        await writeDB(db);

        const resetUrl = `${WEB_BASE_URL}/reset-password?token=${token}`;
        console.log(`[PasswordReset] ${email} -> ${resetUrl} (valid 1h)`);
    }
    // Always respond OK to prevent user enumeration
    res.json({ ok: true });
});

app.post("/auth/reset-password", requireApiKey, async (req, res) => {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ message: "Token and password required" });
    const db = await readDB();
    const entry = db.passwordResets.find(p => p.token === token);
    if (!entry || entry.expiresAt < Date.now()) {
        return res.status(400).json({ message: "Invalid or expired token" });
    }
    const user = db.users.find(u => u.id === entry.userId);
    if (!user) return res.status(400).json({ message: "User not found" });
    user.passwordHash = bcrypt.hashSync(password, 10);
    db.passwordResets = db.passwordResets.filter(p => p.token !== token);
    await writeDB(db);
    res.json({ ok: true });
});

// ----- Ingest (API key only) -----
app.post("/ingest/crush", requireApiKey, async (req, res) => {
    const { crusherId, qty } = req.body || {};
    if (!crusherId) return res.status(400).json({ message: "crusherId required" });
    const amount = Math.max(1, Math.min(200, Number(qty || Math.floor(Math.random() * 12) + 5)));

    const db = await readDB();
    const c = db.crushers.find(x => x.id === crusherId);
    if (!c) return res.status(404).json({ message: "Crusher not found" });

    const ev = { id: uid(), type: "crush", crusherId, qty: amount, ts: nowISO() };
    db.events.push(ev);

    // Nudge fill level up a bit; cap at 1.0
    const delta = amount * 0.005; // tweak factor as you like
    c.fillLevel = Math.min(1, Number(c.fillLevel ?? 0) + delta);
    c.crushedToday = Number(c.crushedToday ?? 0) + amount;

    // Emit alert if high
    if (c.fillLevel >= 0.85) {
        db.alerts.push({
            id: uid(),
            level: "warning",
            source: crusherId,
            message: "High fill level (>85%)",
            ts: nowISO(),
        });
    }

    await writeDB(db);
    res.json({ ok: true, event: ev, crusher: c });
});

app.post("/ingest/empty", requireApiKey, async (req, res) => {
    const { crusherId } = req.body || {};
    if (!crusherId) return res.status(400).json({ message: "crusherId required" });

    const db = await readDB();
    const c = db.crushers.find(x => x.id === crusherId);
    if (!c) return res.status(404).json({ message: "Crusher not found" });

    c.fillLevel = 0.05;
    c.lastEmptied = nowISO();
    const ev = { id: uid(), type: "maintenance", crusherId, note: "Emptied hopper", ts: nowISO() };
    db.events.push(ev);

    await writeDB(db);
    res.json({ ok: true, event: ev, crusher: c });
});

app.post("/ingest/telemetry", requireApiKey, async (req, res) => {
    const { crusherId, fillLevel, status } = req.body || {};
    if (!crusherId) return res.status(400).json({ message: "crusherId required" });

    const db = await readDB();
    const c = db.crushers.find(x => x.id === crusherId);
    if (!c) return res.status(404).json({ message: "Crusher not found" });

    if (fillLevel != null) c.fillLevel = Math.max(0, Math.min(1, Number(fillLevel)));
    if (status) c.status = status;

    await writeDB(db);
    res.json({ ok: true, crusher: c });
});

app.post("/ingest/alert", requireApiKey, async (req, res) => {
    const { crusherId, level = "info", message = "Test alert" } = req.body || {};
    if (!crusherId) return res.status(400).json({ message: "crusherId required" });

    const db = await readDB();
    const c = db.crushers.find(x => x.id === crusherId);
    if (!c) return res.status(404).json({ message: "Crusher not found" });

    const alert = { id: uid(), level, source: crusherId, message, ts: nowISO() };
    db.alerts.unshift(alert);
    await writeDB(db);
    res.json({ ok: true, alert });
});

app.use(["/uploads", "/api/uploads"], express.static(uploads.UPLOAD_DIR));
app.use(["/uploads", "/api/uploads"], uploads.router);



// ----- Protected Data -----
app.use(requireApiKey, requireAuth);

app.use(["/upload-sign", "/api/upload-sign"], uploadSign);


//Crusher PCB Sync for metadata
app.get("/crushers/lookup", async (req, res) => {
    const serial = String(req.query.serial || "").trim();
    if (!serial) return res.status(400).json({ message: "serial is required" });

    // Deterministic mock — replace with real PCB call later
    const hash = [...serial].reduce((a, c) => (a + c.charCodeAt(0)) % 1000, 0);
    const type = hash % 2 ? "BB01" : "BB06";
    const locations = ["Mayo, IE", "Dublin, IE", "Cork, IE", "Galway, IE"];
    const simPool = ["8943000000000000001", "8943000000000000002", "8943000000000000003"];

    res.json({
        ok: true,
        meta: {
            serial,
            type,
            location: locations[hash % locations.length],
            customer: "PEL",
            simNumber: simPool[hash % simPool.length],
            mainsVoltage: 230,
            temperature: 0,
            fillLevel: 0,
            lastSync: null,
        },
    });
});

// PCB SYNC SIMULATOR
// GET /crushers/sync-serial?serial=SN123  (stub that simulates PCB lookup)
app.get("/crushers/sync-serial", async (req, res) => {
    const serial = String(req.query.serial || "").trim();
    if (!serial) return res.status(400).json({ message: "serial required" });

    // TODO: replace with real PCB query later
    const demo = {
        serial,
        type: serial.includes("202") ? "BB06" : "BB01",
        location: "Mayo, IE",
        customer: "PEL",
        mainsVoltage: 230,
        temperature: 22.0,
        fillLevel: 0.12,
        lastSync: new Date().toISOString(),
    };
    res.json(demo);
});




// ----- Admin: Approve user -----
// Set a user's approval on/off (requires canManageRoles)
app.patch("/users/:id/approve", async (req, res) => {
    const db = await readDB();

    // Requester + role
    const me = req.user;
    const myRole =
        me?.role || (me?.roleId && db.roles?.find((r) => r.id === me.roleId)) || null;

    if (!myRole) return res.status(403).json({ message: "Forbidden: requester has no role" });
    if (!myRole.permissions?.canManageRoles) {
        return res.status(403).json({ message: "Forbidden: missing canManageRoles" });
    }

    // Target
    const idx = (db.users || []).findIndex((u) => u.id === req.params.id);
    if (idx < 0) return res.status(404).json({ message: "User not found" });

    const target = db.users[idx];
    const targetRole = target.roleId && db.roles?.find((r) => r.id === target.roleId);

    // Power check
    const myPower = Number(myRole.power ?? 0);
    const targetPower = Number(targetRole?.power ?? 0);
    if (targetPower >= myPower) {
        return res.status(403).json({ message: "Forbidden: cannot manage equal/higher role" });
    }

    // Parse "approved"
    let raw = req.body?.approved;
    if (raw === undefined) {
        return res.status(400).json({ message: "approved (boolean) is required" });
    }
    if (typeof raw === "string") raw = raw.toLowerCase() === "true";
    const nextApproved = !!raw;

    // Apply & persist
    target.approved = nextApproved;
    db.users[idx] = target;
    await writeDB(db);

    // Return normalized user
    const role =
        target.roleId && db.roles?.find((r) => r.id === target.roleId)
            ? db.roles.find((r) => r.id === target.roleId)
            : null;

    const updated = {
        id: target.id,
        name: target.name,
        email: target.email,
        approved: !!target.approved,
        profile: target.profile || {},
        ...(role ? { role } : {}),
    };

    return res.json({ ok: true, user: serializeUser(db, db.users[idx]) });
});




// GET /crushers (enriched + role-masked)
app.get("/crushers", async (req, res) => {
    const { db, role } = await getCurrentUserAndRole(req);
    const list = (db.crushers || []).map(c =>
        maskCrusherForRole(enrichCrusher(c, db.alerts), role)
    );
    res.json(list);
});



// List roles (you’ll only see what exists; power checks are enforced on mutations)
app.get("/roles", async (req, res) => {
    const db = await readDB();
    res.json(db.roles || []);
});

// Create a role (must have canManageRoles and higher power than new role)
app.post("/roles", async (req, res) => {
    const { db, role: currentRole } = await getCurrentUserAndRole(req);
    if (!canManageRoles(currentRole)) return res.status(403).json({ message: "Insufficient permissions" });

    const { name, power, permissions } = req.body || {};
    if (!name || typeof power !== "number") return res.status(400).json({ message: "name and power required" });

    if (Number(power) >= Number(currentRole.power)) {
        return res.status(403).json({ message: "New role must be lower power than your role" });
    }
    if ((db.roles || []).some((r) => r.name === name)) {
        return res.status(409).json({ message: "Role name already exists" });
    }
    const newRole = {
        id: uid(),
        name,
        power,
        permissions: permissions || DEFAULT_ROLES[DEFAULT_ROLES.length - 1].permissions,
    };
    db.roles.push(newRole);
    await writeDB(db);
    res.json(newRole);
});

// Update role (only if you outrank the target)
app.patch("/roles/:id", async (req, res) => {
    const { db, role: currentRole } = await getCurrentUserAndRole(req);
    const idx = (db.roles || []).findIndex((r) => r.id === req.params.id);
    if (idx < 0) return res.status(404).json({ message: "Role not found" });
    const target = db.roles[idx];
    if (!canManageTargetRole(currentRole, target)) return res.status(403).json({ message: "Insufficient permissions" });

    const next = { ...target, ...req.body };
    // Prevent escalating above current user
    if (Number(next.power) >= Number(currentRole.power)) {
        return res.status(403).json({ message: "Target role power must remain lower than your role" });
    }
    db.roles[idx] = next;
    await writeDB(db);
    res.json(next);
});

// Delete role (only if you outrank AND no users currently use it)
app.delete("/roles/:id", async (req, res) => {
    const { db, role: currentRole } = await getCurrentUserAndRole(req);
    const idx = (db.roles || []).findIndex((r) => r.id === req.params.id);
    if (idx < 0) return res.status(404).json({ message: "Role not found" });
    const target = db.roles[idx];
    if (!canManageTargetRole(currentRole, target)) return res.status(403).json({ message: "Insufficient permissions" });

    const inUse = (db.users || []).some((u) => u.roleId === target.id);
    if (inUse) return res.status(409).json({ message: "Role is assigned to users" });

    db.roles.splice(idx, 1);
    await writeDB(db);
    res.json({ ok: true });
});

// Assign a role to a user (you must outrank both the target user’s current role and the new role)
app.patch("/users/:id/role", async (req, res) => {
    const { db, role: currentRole } = await getCurrentUserAndRole(req);
    if (!canAssignRoles(currentRole)) return res.status(403).json({ message: "Insufficient permissions" });

    const userIdx = (db.users || []).findIndex((u) => u.id === req.params.id);
    if (userIdx < 0) return res.status(404).json({ message: "User not found" });

    const user = db.users[userIdx];
    const userRole = getRoleById(db, user.roleId);
    const newRole = getRoleById(db, req.body.roleId) || getRoleByName(db, req.body.roleName);

    if (!newRole) return res.status(400).json({ message: "roleId or roleName required/invalid" });

    if (!isHigherPower(currentRole, userRole || { power: -Infinity })) {
        return res.status(403).json({ message: "You must outrank the user's current role" });
    }
    if (!canAssignTargetRole(currentRole, newRole)) {
        return res.status(403).json({ message: "You must outrank the target role" });
    }

    db.users[userIdx] = { ...user, roleId: newRole.id };
    await writeDB(db);

    res.json({
        ok: true,
        user: {
            id: db.users[userIdx].id,
            email: db.users[userIdx].email,
            name: db.users[userIdx].name,
            role: { id: newRole.id, name: newRole.name, power: newRole.power, permissions: newRole.permissions },
        },
    });
});

// CREATE a crusher
app.post("/crushers", async (req, res) => {
    const { db, role } = await getCurrentUserAndRole(req);

    const {
        name = "",
        type = "BB01",
        location = "",
        serial = "",
        customer = "",
        fillLevel = 0,
        mainsVoltage = 230,
        temperature = 22,
        status = "ok",
        lastSync = new Date().toISOString(),
        lat = 0,
        lng = 0,
    } = req.body || {};

    // Optional uniqueness check for serial
    if (
        serial &&
        (db.crushers || []).some(
            (c) => String(c.serial || "").toLowerCase() === String(serial).toLowerCase()
        )
    ) {
        return res.status(409).json({ message: "Serial already exists" });
    }

    const crusher = {
        id: crypto.randomUUID(),
        name,
        type,
        location,
        serial,
        customer,
        fillLevel: Math.max(0, Math.min(1, Number(fillLevel) || 0)),
        mainsVoltage: Number(mainsVoltage) || 0,
        temperature: Number(temperature) || 0,
        status,
        lastSync,
        lat: Number(lat) || 0,
        lng: Number(lng) || 0,
        crushedToday: 0,
        lastEmptied: null,
    };

    db.crushers = [...(db.crushers || []), crusher];
    await writeDB(db);

    // Return enriched + role-masked shape
    const enriched = enrichCrusher(crusher, db.alerts);
    return res.json(maskCrusherForRole(enriched, role));
});

// UPDATE a crusher
app.patch("/crushers/:id", async (req, res) => {
    const { db, role } = await getCurrentUserAndRole(req);
    const idx = (db.crushers || []).findIndex((c) => c.id === req.params.id);
    if (idx < 0) return res.status(404).json({ message: "Not found" });

    const current = db.crushers[idx];
    const next = { ...current, ...req.body };

    // Normalize numeric / bounded fields if provided
    if ("fillLevel" in req.body)
        next.fillLevel = Math.max(0, Math.min(1, Number(req.body.fillLevel) || 0));
    if ("mainsVoltage" in req.body) next.mainsVoltage = Number(req.body.mainsVoltage) || 0;
    if ("temperature" in req.body) next.temperature = Number(req.body.temperature) || 0;
    if ("lat" in req.body) next.lat = Number(req.body.lat) || 0;
    if ("lng" in req.body) next.lng = Number(req.body.lng) || 0;

    // Optional serial uniqueness on update
    if (
        "serial" in req.body &&
        req.body.serial &&
        (db.crushers || []).some(
            (c) =>
                c.id !== current.id &&
                String(c.serial || "").toLowerCase() === String(req.body.serial).toLowerCase()
        )
    ) {
        return res.status(409).json({ message: "Serial already exists" });
    }

    db.crushers[idx] = next;
    await writeDB(db);

    const enriched = enrichCrusher(db.crushers[idx], db.alerts);
    return res.json(maskCrusherForRole(enriched, role));
});

// DELETE a crusher
app.delete("/crushers/:id", async (req, res) => {
    const db = await readDB();
    const idx = (db.crushers || []).findIndex((c) => c.id === req.params.id);
    if (idx < 0) return res.status(404).json({ message: "Not found" });

    db.crushers.splice(idx, 1);
    await writeDB(db);
    return res.json({ ok: true });
});



app.get("/dashboard/summary", async (_req, res) => {
    const db = await readDB();
    const today = new Date().toISOString().slice(0, 10);
    const crushedToday = db.events
        .filter(e => e.type === "crush" && e.ts.slice(0, 10) === today)
        .reduce((acc, e) => acc + (e.qty || 0), 0);

    const alertsOpen = db.alerts.length;
    const activeSince = Date.now() - 24 * 60 * 60 * 1000;
    const activeCrushers = new Set(
        db.events.filter(e => new Date(e.ts).getTime() >= activeSince).map(e => e.crusherId)
    ).size;

    // simplistic queue estimate
    const queue = Math.max(0, db.crushers.filter(c => c.fillLevel > 0.8).length * 3);

    res.json({
        crushedToday,
        queue,
        alertsOpen,
        activeCrushers
    });
});

app.get("/events/recent", async (req, res) => {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 20)));
    const db = await readDB();
    const events = [...db.events]
        .sort((a, b) => new Date(b.ts) - new Date(a.ts))
        .slice(0, limit);
    res.json(events);
});

// GET /events  (global feed; optional filters: crusherId, types=CSV, before, limit)
app.get("/events", async (req, res) => {
    const { crusherId, types, before, limit = 100 } = req.query;
    const db = await readDB();
    let rows = Array.isArray(db.events) ? db.events : [];
    if (crusherId) rows = rows.filter(e => String(e.crusherId) === String(crusherId));
    if (types) {
        const set = new Set(String(types).split(",").map(s => s.trim().toUpperCase()));
        rows = rows.filter(e => set.has(e.type));
    }
    if (before) {
        const bt = new Date(before).getTime();
        rows = rows.filter(e => new Date(e.ts).getTime() < bt);
    }
    rows = rows.sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, Number(limit) || 100);
    res.json(rows);
});

// GET /crushers/:id/events  (per-crusher feed)
app.get("/crushers/:id/events", async (req, res) => {
    const { id } = req.params;
    const { types, before, limit = 100 } = req.query;
    const db = await readDB();
    let rows = (Array.isArray(db.events) ? db.events : []).filter(e => String(e.crusherId) === String(id));
    if (types) {
        const set = new Set(String(types).split(",").map(s => s.trim().toUpperCase()));
        rows = rows.filter(e => set.has(e.type));
    }
    if (before) {
        const bt = new Date(before).getTime();
        rows = rows.filter(e => new Date(e.ts).getTime() < bt);
    }
    rows = rows.sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, Number(limit) || 100);
    res.json(rows);
});

// POST /crushers/:id/events  (append-only)

app.post("/crushers/:id/events", async (req, res) => {
    const { id } = req.params;
    const body = req.body || {};
    if (!body.type) return res.status(400).json({ message: "type required" });

    const db = await readDB();
    const exists = (db.crushers || []).some(x => String(x.id) === String(id));
    if (!exists) return res.status(404).json({ message: "Crusher not found" });

    const ev = normalizeEvent({ ...body, crusherId: id, ts: body.ts || new Date().toISOString() });
    if (ev.type !== "NOTE" && !VALID_EVENT_TYPES.has(ev.type)) {
        return res.status(400).json({ message: "invalid type" });
    }
    if (!Array.isArray(db.events)) db.events = [];
    db.events.unshift(ev);
    await writeDB(db);
    res.status(201).json(ev);
});



// GET /crushers/:id  (single handler)

app.get("/crushers/:id", async (req, res) => {
    const { db, role } = await getCurrentUserAndRole(req);
    const c = (db.crushers || []).find(x => String(x.id) === String(req.params.id));
    if (!c) return res.status(404).json({ message: "Not found" });
    const enriched = enrichCrusher(c, db.alerts);
    res.json(maskCrusherForRole(enriched, role));
});





app.get("/alerts", async (req, res) => {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
    const db = await readDB();
    const alerts = [...db.alerts]
        .sort((a, b) => new Date(b.ts) - new Date(a.ts))
        .slice(0, limit);
    res.json(alerts);
});

app.get("/routes", async (_req, res) => {
    const db = await readDB();
    res.json(db.routes);
});

// List users
app.get("/users", async (_req, res) => {
    const db = await readDB();
    const out = (db.users || []).map((u) => serializeUser(db, u)); // <-- unified serializer
    res.json(out);
});




// Create user (admin only)
app.post("/users", async (req, res) => {
    const { name, email, password, profile, roleId } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });

    const db = await readDB();
    if ((db.users || []).some(u => String(u.email).toLowerCase() === String(email).toLowerCase())) {
        return res.status(409).json({ message: "Email already in use" });
    }
    const user = {
        id: uid(),
        name: name || email,
        email,
        passwordHash: bcrypt.hashSync(password, 10),
        roleId: roleId || (db.roles?.find(r => r.name === "Customer")?.id),
        profile: normalizeProfile(profile || {}), // <-- normalize here
        approved: true, // or false if you want admin-created users pending
    };
    db.users.push(user);
    await writeDB(db);
    res.json({
        id: user.id, name: user.name, email: user.email, roleId: user.roleId, profile: user.profile
    });
});

app.post("/crushers/:id/lock", async (req, res) => {
    const { id } = req.params;
    const { hours = 1 } = req.body || {};
    const db = await readDB();
    const c = (db.crushers || []).find(x => String(x.id) === String(id));
    if (!c) return res.status(404).json({ message: "Not found" });
    c.lockedUntil = new Date(Date.now() + Number(hours) * 3600_000).toISOString();
    await writeDB(db);
    res.json({ ok: true, lockedUntil: c.lockedUntil });
});




// Update user
app.patch("/users/:id", async (req, res) => {
    const db = await readDB();
    const idx = (db.users || []).findIndex(u => u.id === req.params.id);
    if (idx < 0) return res.status(404).json({ message: "User not found" });

    const current = db.users[idx];
    const next = { ...current, ...req.body };

    // prevent email collisions
    if (req.body.email) {
        const taken = (db.users || []).some(
            u => u.id !== current.id && String(u.email).toLowerCase() === String(req.body.email).toLowerCase()
        );
        if (taken) return res.status(409).json({ message: "Email already in use" });
    }

    // do not allow direct password changes here
    delete next.password;
    delete next.passwordHash;

    // normalize profile if provided; otherwise keep existing profile
    if ("profile" in req.body) {
        next.profile = normalizeProfile(req.body.profile || {});
    } else {
        next.profile = normalizeProfile(next.profile || {});
    }

    db.users[idx] = next;
    await writeDB(db);
    return res.json(serializeUser(db, db.users[idx])); // send unified shape back
});


// Delete user
app.delete("/users/:id", async (req, res) => {
    const db = await readDB();
    const idx = (db.users || []).findIndex(u => u.id === req.params.id);
    if (idx < 0) return res.status(404).json({ message: "User not found" });
    db.users.splice(idx, 1);
    await writeDB(db);
    res.json({ ok: true });
});



// ----- Start server -----
app.listen(PORT, async () => {
    try {
        // Load (or seed) the DB
        let db = await readDB();

        // 1) Ensure roles exist (and backfill user.roleId where missing)
        db = ensureRolesSeed(db);

        // 2) Resolve key roles
        const superRole =
            getRoleByName(db, "SuperAdminPEL") || (DEFAULT_ROLES && DEFAULT_ROLES[0]);
        const customerRole =
            getRoleByName(db, "Customer") ||
            (DEFAULT_ROLES && DEFAULT_ROLES[DEFAULT_ROLES.length - 1]);

        // 3) Migrate legacy users[].roles -> roleId (idempotent)
        db.users = (db.users || []).map((u) => {
            if (u.roleId) {
                const { roles, ...rest } = u; // strip legacy array if present
                return rest;
            }
            let roleId = customerRole?.id;
            if (Array.isArray(u.roles) && u.roles.includes("admin")) {
                roleId = superRole?.id || roleId;
            }
            const { roles, ...rest } = u;
            return { ...rest, roleId };
        });

        // 4) Ensure seeded admin gets SuperAdminPEL + approved
        const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL || "admin@example.com").toLowerCase();
        const adminIdx = (db.users || []).findIndex(
            (u) => String(u.email || "").toLowerCase() === ADMIN_EMAIL
        );
        if (adminIdx >= 0 && superRole?.id) {
            db.users[adminIdx].roleId = superRole.id;
            db.users[adminIdx].approved = true;
        }

        // 4b) Backfill 'approved' for legacy users (default true so they aren’t blocked)
        db.users = (db.users || []).map((u) =>
            typeof u.approved === "boolean" ? u : { ...u, approved: true }
        );

        // 4c) Force seeded admin to approved:true (idempotent)
        if (adminIdx >= 0) db.users[adminIdx].approved = true;

        // 4d) Backfill/normalize profile for all users (idempotent)
        //     This ensures Company / Address / Phone exist for Users page rendering.
        db.users = (db.users || []).map((u) => ({
            ...u,
            profile: normalizeProfile(u.profile || u), // also scoops legacy flat fields if any
        }));

        //TEST ACCOUNT SEED
        // 4e) Seed test users for AdminPEL, Distributor, Technician, Customer (idempotent)
        const TEST_PASSWORD = process.env.SEED_TEST_PASSWORD || "password123";

        const testSeeds = [
            { name: "Test Admin", email: "adminpel@test.com", roleName: "AdminPEL" },
            { name: "Test Distributor", email: "distributor@test.com", roleName: "Distributor" },
            { name: "Test Technician", email: "technician@test.com", roleName: "Technician" },
            { name: "Test Customer", email: "customer@test.com", roleName: "Customer" },
        ];

        for (const s of testSeeds) {
            const exists = (db.users || []).some(
                (u) => String(u.email || "").toLowerCase() === s.email.toLowerCase()
            );
            if (!exists) {
                const role = getRoleByName(db, s.roleName);
                db.users.push({
                    id: uid(),
                    name: s.name,
                    email: s.email,
                    passwordHash: bcrypt.hashSync(TEST_PASSWORD, 10),
                    roleId: role?.id || null,                // falls back to null if role not found
                    approved: true,                          // let them log in immediately
                    profile: normalizeProfile({
                        company: "PEL Office",
                        language: "en",
                        address1: "Station Road",
                        city: "Ballindine",
                        state: "Mayo",
                        country: "IE",
                        phone: { dial: "+353", number: "1234567" },
                    }),
                });
                console.log(`Seeded test user: ${s.email} (${s.roleName})`);
            }
        }

        // 4f) Seed + enrich crusher records (idempotent)
        db = ensureOnlyTwoDemoCrushers(db);



        // 5) Persist
        await writeDB(db);
        console.log("RBAC seed OK: roles ensured, users backfilled to roleId + approval + profile");
    } catch (e) {
        console.error("RBAC seed failed:", e);
    }

    console.log(`API listening on http://localhost:${PORT}`);
    console.log(`CORS origins: ${CORS_ORIGINS.join(", ")}`);
    if (REQUIRE_API_KEY) console.log("API key required: X-API-Key header");
});



