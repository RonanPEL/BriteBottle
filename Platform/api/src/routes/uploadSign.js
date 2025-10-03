// Platform/api/src/routes/uploadSign.js
const express = require("express");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const router = express.Router();

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined, // allow instance/role creds in prod
});

const BUCKET = process.env.S3_BUCKET;

router.post("/", async (req, res) => {
  try {
    if (!BUCKET) return res.status(500).json({ error: "Missing S3_BUCKET" });
    const { contentType = "image/jpeg" } = req.body || {};
    const ext =
      contentType.includes("png") ? "png" :
      contentType.includes("webp") ? "webp" :
      contentType.includes("gif") ? "gif" : "jpg";

    const key = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const cmd = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 60 });
    const publicUrl = `https://${BUCKET}.s3.amazonaws.com/${encodeURIComponent(key)}`;
    res.json({ uploadUrl, publicUrl, key });
  } catch (e) {
    res.status(500).json({ error: e.message || "sign failed" });
  }
});

module.exports = router;
