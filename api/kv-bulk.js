const { connectToDatabase } = require("./_lib/mongo");
const { checkApiKey, applyCors } = require("./_lib/auth");

module.exports = async (req, res) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (!checkApiKey(req, res)) return;

  try {
    const db = await connectToDatabase();
    const col = db.collection("kvstore");

    if (req.method === "GET") {
      const keys = String(req.query.keys || "").split(",").map(k => k.trim()).filter(Boolean);
      if (keys.length === 0) { res.status(200).json({ values: {} }); return; }
      const docs = await col.find({ _id: { $in: keys } }).toArray();
      const found = {};
      docs.forEach(d => { found[d._id] = d.value; });
      const values = {};
      keys.forEach(k => { values[k] = Object.prototype.hasOwnProperty.call(found, k) ? found[k] : null; });
      res.status(200).json({ values });
      return;
    }

    if (req.method === "POST") {
      const items = (req.body && req.body.items) || {};
      const ops = Object.keys(items).map(key => ({
        updateOne: {
          filter: { _id: key },
          update: { $set: { value: items[key], updatedAt: new Date() } },
          upsert: true,
        },
      }));
      if (ops.length) await col.bulkWrite(ops);
      res.status(200).json({ ok: true, count: ops.length });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};