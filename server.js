/**
 * First Group POS — sync server
 * -------------------------------------------------------------------------
 * A tiny key-value API backed by MongoDB. It mirrors exactly what the POS
 * frontend's AppStorage adapter already speaks:
 *
 *   GET  /kv/:key          -> { key, value }
 *   POST /kv/:key  {value} -> { key, value }
 *   GET  /kv-bulk?keys=a,b -> { values: { a: "...", b: "..." } }
 *   POST /kv-bulk  {items} -> { ok: true }
 *   GET  /health            -> { status: "ok" }   (no auth — for uptime pings)
 *
 * Every /kv* route requires a header:  X-Api-Key: <your key>
 * matching the API_KEY environment variable. Without it, every device on
 * the internet could read/write your shop's data — so this server refuses
 * to start serving /kv routes if API_KEY isn't set.
 *
 * "value" is always stored/returned as a raw string, exactly what the
 * frontend already sends (a JSON.stringify'd blob) — this server never
 * parses it, just stores and returns it as-is.
 * -------------------------------------------------------------------------
 */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || "first_group_pos";
const API_KEY = process.env.API_KEY;

if (!MONGODB_URI) {
  console.error("FATAL: MONGODB_URI environment variable is not set. See .env.example.");
  process.exit(1);
}
if (!API_KEY) {
  console.error(
    "FATAL: API_KEY environment variable is not set.\n" +
    "This server holds real shop data (sales, cash, customers) — it refuses to run\n" +
    "without an access key so it can't be left open to the whole internet.\n" +
    "Set API_KEY to any long random string (same value goes in the app's Settings)."
  );
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" })); // generous — product images / logos are base64 data URLs

let db;

async function start() {
  const client = new MongoClient(MONGODB_URI, {
    serverApi: { version: "1", strict: true, deprecationErrors: true }
  });
  await client.connect();
  await client.db(DB_NAME).command({ ping: 1 });
  db = client.db(DB_NAME);
  console.log(`Connected to MongoDB database "${DB_NAME}".`);

  app.listen(PORT, () => {
    console.log(`First Group POS sync server listening on port ${PORT}`);
  });
}

// -- auth middleware for every /kv* route -----------------------------------
function requireApiKey(req, res, next) {
  const key = req.header("X-Api-Key");
  if (!key || key !== API_KEY) {
    return res.status(401).json({ error: "Invalid or missing X-Api-Key header" });
  }
  next();
}

// -- routes -------------------------------------------------------------
app.get("/", (req, res) => {
  res.type("text").send("First Group POS sync server is running.");
});

app.get("/health", async (req, res) => {
  try {
    await db.command({ ping: 1 });
    res.json({ status: "ok" });
  } catch (e) {
    res.status(500).json({ status: "error", message: e.message });
  }
});

app.get("/kv/:key", requireApiKey, async (req, res) => {
  try {
    const doc = await db.collection("kvstore").findOne({ _id: req.params.key });
    res.json({ key: req.params.key, value: doc ? doc.value : null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/kv/:key", requireApiKey, async (req, res) => {
  try {
    const value = req.body && typeof req.body.value !== "undefined" ? req.body.value : null;
    await db.collection("kvstore").updateOne(
      { _id: req.params.key },
      { $set: { value, updatedAt: new Date() } },
      { upsert: true }
    );
    res.json({ key: req.params.key, value });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/kv-bulk", requireApiKey, async (req, res) => {
  try {
    const keys = String(req.query.keys || "").split(",").map(k => k.trim()).filter(Boolean);
    if (keys.length === 0) return res.json({ values: {} });
    const docs = await db.collection("kvstore").find({ _id: { $in: keys } }).toArray();
    const found = {};
    docs.forEach(d => { found[d._id] = d.value; });
    // include every requested key (even if never saved) so the frontend's
    // cache treats it as "known — value is null" instead of re-fetching it
    const values = {};
    keys.forEach(k => { values[k] = Object.prototype.hasOwnProperty.call(found, k) ? found[k] : null; });
    res.json({ values });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/kv-bulk", requireApiKey, async (req, res) => {
  try {
    const items = (req.body && req.body.items) || {};
    const ops = Object.keys(items).map(key => ({
      updateOne: {
        filter: { _id: key },
        update: { $set: { value: items[key], updatedAt: new Date() } },
        upsert: true
      }
    }));
    if (ops.length) await db.collection("kvstore").bulkWrite(ops);
    res.json({ ok: true, count: ops.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

start().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
