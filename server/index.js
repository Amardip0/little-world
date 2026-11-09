import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { fileURLToPath } from "node:url";
import seed from "./seed.json" with { type: "json" };

if (process.argv.includes("--production")) process.env.NODE_ENV = "production";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const app = express();
const PORT = Number(process.env.API_PORT || 4000);
const isProduction = process.env.NODE_ENV === "production";
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  if (isProduction)
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  next();
});
const rateBuckets = new Map();
function rateLimit({
  windowMs = 60000,
  max = 60,
  message = "Too many requests. Please try again shortly.",
} = {}) {
  return (req, res, next) => {
    const now = Date.now(),
      key = `${req.ip || req.socket.remoteAddress}:${req.path}`;
    let item = rateBuckets.get(key);
    if (!item || now - item.start > windowMs) item = { start: now, count: 0 };
    item.count++;
    rateBuckets.set(key, item);
    if (item.count > max) return res.status(429).json({ error: message });
    if (rateBuckets.size > 5000)
      for (const [k, v] of rateBuckets)
        if (now - v.start > windowMs) rateBuckets.delete(k);
    next();
  };
}
function sameOrigin(req, res, next) {
  const origin = req.get("origin");

  // Allow requests without an Origin header.
  if (!origin) return next();

  const allowedOrigins = new Set(
    (process.env.FRONTEND_ORIGIN || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );

  // Local development only.
  if (!isProduction) {
    allowedOrigins.add("http://localhost:5173");
    allowedOrigins.add("http://127.0.0.1:5173");
  }

  try {
    const requestOrigin = new URL(origin).origin;

    if (allowedOrigins.has(requestOrigin)) {
      return next();
    }
  } catch {
    return res.status(403).json({
      error: "Invalid origin.",
    });
  }

  return res.status(403).json({
    error: "Cross-origin request blocked.",
  });
}
const COOKIE = "nidhi_owner";
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "";
const uploadDir = path.join(root, "public", "uploads");
await fs.mkdir(uploadDir, { recursive: true });
app.use(express.json({ limit: "1mb" }));
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use("/api", rateLimit({ windowMs: 60000, max: 180 }));
app.use(
  "/uploads",
  express.static(uploadDir, {
    maxAge: "7d",
    setHeaders(res) {
      res.setHeader("X-Content-Type-Options", "nosniff");
    },
  }),
);

let dbPromise;
async function connectDB() {
  if (!process.env.MONGODB_URI)
    throw new Error(
      "MONGODB_URI is missing. Add your MongoDB Atlas URI to .env.",
    );
  if (mongoose.connection.readyState === 1) return;
  if (!dbPromise)
    dbPromise = mongoose
      .connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 7000,
        maxPoolSize: 20,
        minPoolSize: 2,
        maxIdleTimeMS: 30000,
        retryWrites: true,
      })
      .catch((err) => {
        dbPromise = null;
        throw err;
      });
  await dbPromise;
}
const Content =
  mongoose.models.NidhiContent ||
  mongoose.model(
    "NidhiContent",
    new mongoose.Schema(
      {
        key: { type: String, unique: true },
        value: mongoose.Schema.Types.Mixed,
      },
      { timestamps: true },
    ),
  );
const eventSchema = new mongoose.Schema(
  {
    day: String,
    type: String,
    key: String,
    count: { type: Number, default: 0 },
  },
  { versionKey: false },
);
eventSchema.index({ day: 1, type: 1, key: 1 }, { unique: true });
eventSchema.index({ day: -1 });
const Event =
  mongoose.models.NidhiEvent || mongoose.model("NidhiEvent", eventSchema);
async function getContent() {
  await connectDB();
  let doc = await Content.findOne({ key: "public" }).lean();
  if (!doc) {
    doc = await Content.create({ key: "public", value: seed });
    return doc.value;
  }
  const saved = doc.value || {};
  return {
    ...seed,
    ...saved,
    copy: { ...(seed.copy || {}), ...(saved.copy || {}) },
    qualities: saved.qualities || seed.qualities,
    pollOptions: saved.pollOptions || seed.pollOptions,
    keepsakeDetails: saved.keepsakeDetails || seed.keepsakeDetails,
  };
}
function signed(payload) {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("hex");
}
function sessionToken() {
  const p = Buffer.from(
    JSON.stringify({ role: "owner", exp: Date.now() + 8 * 60 * 60 * 1000 }),
  ).toString("base64url");
  return `${p}.${signed(p)}`;
}
function isOwner(req) {
  if (SESSION_SECRET.length < 32) return false;
  const raw = req.headers.cookie || "";
  const token = raw
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);
  if (!token) return false;
  const [p, sig] = token.split(".");
  if (!p || !sig) return false;
  const expected = Buffer.from(signed(p)),
    actual = Buffer.from(sig);
  if (
    actual.length !== expected.length ||
    !crypto.timingSafeEqual(actual, expected)
  )
    return false;
  try {
    const d = JSON.parse(Buffer.from(p, "base64url").toString());
    return d.role === "owner" && d.exp > Date.now();
  } catch {
    return false;
  }
}
function owner(req, res, next) {
  if (!isOwner(req))
    return res.status(401).json({ error: "Owner authentication required." });
  next();
}
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const ext =
      {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/avif": ".avif",
      }[file.mimetype] || ".jpg";
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    cb(null, /^image\/(jpeg|png|webp|gif|avif)$/.test(file.mimetype)),
});

app.get("/api/health", async (_req, res) => {
  try {
    await connectDB();
    res.json({ ok: true, database: "MongoDB Atlas", mode: "local-express" });
  } catch (e) {
    console.error("[health]", e.message);
    res
      .status(503)
      .json({
        ok: false,
        error: e.message.includes("MONGODB_URI")
          ? e.message
          : "MongoDB connection failed. Check URI, password encoding and Atlas IP access.",
      });
  }
});
app.get("/api/content", async (_req, res) => {
  try {
    res.json(await getContent());
  } catch (e) {
    console.error("[content]", e.message);
    res
      .status(503)
      .json({ error: "Website content is temporarily unavailable." });
  }
});
app.post(
  "/api/events",
  sameOrigin,
  rateLimit({ windowMs: 60000, max: 45 }),
  async (req, res) => {
    try {
      const allowed = {
        section_view: ["home", "gallery", "appreciation", "keepsakes", "note"],
        style_preference: ["indian", "western", "floral", "minimal", "all"],
        letter_open: ["all"],
        compliment_refresh: ["all"],
        feedback_choice: [
          "beautiful",
          "liked_photos",
          "liked_letter",
          "liked_design",
          "not_for_me",
        ],
      };
      const { type, key } = req.body || {};
      const validPhoto =
        type === "photo_favorite" && /^slot-[1-9][0-9]?$/.test(key || "");
      if (!Object.hasOwn(allowed, type) && !validPhoto)
        return res.status(400).json({ error: "Invalid event" });
      if (allowed[type] && !allowed[type].includes(key))
        return res.status(400).json({ error: "Invalid event value" });
      await connectDB();
      const day = new Date().toISOString().slice(0, 10);
      try {
        await Event.updateOne(
          { day, type, key },
          { $inc: { count: 1 } },
          { upsert: true },
        );
      } catch (err) {
        if (err.code !== 11000) throw err;
        await Event.updateOne({ day, type, key }, { $inc: { count: 1 } });
      }
      res.status(202).json({ ok: true });
    } catch (e) {
      console.error("[events]", e.message);
      res.status(503).json({ error: "Analytics unavailable" });
    }
  },
);
app.post(
  "/api/admin/login",
  sameOrigin,
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 8,
    message: "Too many login attempts. Wait 15 minutes.",
  }),
  async (req, res) => {
    try {
      const hash = process.env.ADMIN_PASSWORD_HASH || "";
      if (!hash || SESSION_SECRET.length < 32)
        return res
          .status(503)
          .json({ error: "Admin credentials are not configured. Check .env." });
      const valid = await bcrypt.compare(
        String(req.body?.password || ""),
        hash,
      );
      if (!valid) return res.status(401).json({ error: "Incorrect password" });
      const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
      res.setHeader(
        "Set-Cookie",
        `${COOKIE}=${sessionToken()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure}`,
      );
      res.json({ ok: true });
    } catch (e) {
      console.error("[login]", e.message);
      res.status(500).json({ error: "Login failed" });
    }
  },
);
app.post("/api/admin/logout", sameOrigin, (_req, res) => {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
  );
  res.json({ ok: true });
});
app.get("/api/admin/summary", owner, async (_req, res) => {
  try {
    await connectDB();
    const rows = await Event.aggregate([
      {
        $group: {
          _id: { type: "$type", key: "$key" },
          count: { $sum: "$count" },
        },
      },
    ]);
    const daily = await Event.aggregate([
      { $group: { _id: "$day", count: { $sum: "$count" } } },
      { $sort: { _id: -1 } },
      { $limit: 14 },
    ]);
    const by = (type) =>
      rows
        .filter((x) => x._id.type === type)
        .map((x) => ({ label: x._id.key, count: x.count }))
        .sort((a, b) => b.count - a.count);
    const totals = rows.map((x) => ({
      event_type: x._id.type,
      total: x.count,
    }));
    res.json({
      total: totals.reduce((n, x) => n + x.total, 0),
      totals,
      sections: by("section_view"),
      favorites: by("photo_favorite"),
      styles: by("style_preference"),
      feedback: by("feedback_choice"),
      daily: daily.map((x) => ({ label: x._id, count: x.count })),
    });
  } catch (e) {
    console.error("[summary]", e.message);
    res
      .status(503)
      .json({ error: "Could not load analytics. Check MongoDB connection." });
  }
});
app.get("/api/admin/content", owner, async (_req, res) => {
  try {
    res.json(await getContent());
  } catch (e) {
    console.error("[admin content]", e.message);
    res
      .status(503)
      .json({ error: "Could not load content. Check MongoDB connection." });
  }
});
app.put("/api/admin/content", sameOrigin, owner, async (req, res) => {
  const c = req.body;
  const safeImage = (value) =>
    typeof value === "string" &&
    value.length < 1500 &&
    /^(\/|https:\/\/)/.test(value);
  const validCopy =
    c &&
    c.copy &&
    typeof c.copy === "object" &&
    Object.values(c.copy).every(
      (v) => typeof v === "string" && v.length <= 3000,
    );
  const valid =
    c &&
    validCopy &&
    Array.isArray(c.photos) &&
    c.photos.length === 15 &&
    Array.isArray(c.quotes) &&
    c.quotes.length <= 100 &&
    c.photos.every(
      (p) =>
        p &&
        safeImage(p.src) &&
        typeof p.title === "string" &&
        p.title.length < 160 &&
        typeof p.caption === "string" &&
        p.caption.length < 800 &&
        typeof p.kind === "string" &&
        p.kind.length < 120 &&
        (p.alt === undefined ||
          (typeof p.alt === "string" && p.alt.length < 300)),
    ) &&
    c.quotes.every(
      (q) => typeof q === "string" && q.trim().length > 0 && q.length < 600,
    ) &&
    Array.isArray(c.keepsakeImages) &&
    c.keepsakeImages.length === 2 &&
    c.keepsakeImages.every(safeImage) &&
    Array.isArray(c.qualities) &&
    c.qualities.length === 3 &&
    c.qualities.every(
      (q) =>
        q &&
        ["number", "title", "description"].every(
          (k) => typeof q[k] === "string" && q[k].length < 600,
        ),
    ) &&
    Array.isArray(c.pollOptions) &&
    c.pollOptions.length === 5 &&
    c.pollOptions.every(
      (o) =>
        o &&
        typeof o.key === "string" &&
        typeof o.label === "string" &&
        o.label.length < 120,
    ) &&
    Array.isArray(c.keepsakeDetails) &&
    c.keepsakeDetails.length === 2 &&
    c.keepsakeDetails.every(
      (d) =>
        d &&
        ["title", "alt", "description"].every(
          (k) => typeof d[k] === "string" && d[k].length < 600,
        ),
    );
  if (!valid)
    return res
      .status(400)
      .json({
        error:
          "Invalid content. Check text lengths and keep the 15 photo slots, 3 appreciation cards and 2 poster slots.",
      });
  try {
    await connectDB();
    await Content.updateOne(
      { key: "public" },
      { $set: { value: c } },
      { upsert: true },
    );
    res.json({ ok: true, content: c });
  } catch (e) {
    console.error("[save]", e.message);
    res.status(503).json({ error: "Save failed. Check MongoDB connection." });
  }
});
app.post(
  "/api/admin/upload",
  sameOrigin,
  owner,
  upload.single("image"),
  (req, res) => {
    if (!req.file)
      return res
        .status(400)
        .json({
          error: "Choose a valid image (JPG, PNG, WEBP, GIF, AVIF), max 8 MB.",
        });
    res.json({ ok: true, url: `/uploads/${req.file.filename}` });
  },
);
app.get("/api/admin/export", owner, async (_req, res) => {
  try {
    await connectDB();
    const rows = await Event.find().sort({ day: -1 }).lean();
    const csv = [
      "day,type,key,count",
      ...rows.map((x) =>
        [
          x.day,
          x.type,
          `"${String(x.key).replaceAll('"', '""')}"`,
          x.count,
        ].join(","),
      ),
    ].join("\n");
    res.type("text/csv").attachment("nidhi-analytics.csv").send(csv);
  } catch (e) {
    console.error("[export]", e.message);
    res.status(503).send("Analytics export unavailable");
  }
});
app.use((err, _req, res, _next) => {
  console.error("[server]", err.message);
  res
    .status(400)
    .json({
      error:
        err instanceof multer.MulterError
          ? "Image upload failed. Maximum file size is 8 MB."
          : "Request failed. Check the submitted data.",
    });
});
if (isProduction) {
  const dist = path.join(root, "dist");
  app.use(
    express.static(dist, {
      maxAge: "1y",
      immutable: true,
      setHeaders(res, file) {
        if (file.endsWith("index.html"))
          res.setHeader("Cache-Control", "no-cache");
      },
    }),
  );
  app.get("*", (req, res, next) =>
    req.path.startsWith("/api/")
      ? next()
      : res.sendFile(path.join(dist, "index.html")),
  );
}
app.listen(PORT, () =>
  console.log(`Nidhi Express server ready at http://localhost:${PORT}`),
);
