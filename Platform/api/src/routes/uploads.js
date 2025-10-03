// Platform/api/src/routes/uploads.js
const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");

const UPLOAD_DIR = path.join(__dirname, "../..", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = (file.originalname || "file").replace(/[^a-z0-9_.-]/gi, "_");
    const ext = path.extname(safe) || ".jpg";
    const base = path.basename(safe, ext);
    cb(null, `${base}-${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 6 * 1024 * 1024 } });

const router = express.Router();

router.post("/", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });

  const filename = req.file.filename;
  const rel = `/uploads/${filename}`;

  // Prefer explicit PUBLIC_BASE_URL in prod (e.g. https://api.yourdomain.com)
  const base =
    process.env.PUBLIC_BASE_URL ||
    `${req.protocol}://${req.get("host")}`;

  res.json({
    url: `${base}${rel}`,   
    rel,                    
  });
});

module.exports = { router, UPLOAD_DIR };
