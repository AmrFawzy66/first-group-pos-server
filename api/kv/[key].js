const { connectToDatabase } = require("../_lib/mongo");
const { checkApiKey, applyCors } = require("../_lib/auth");

module.exports = async (req, res) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (!checkApiKey(req, res)) return;

  const key = req.query.key;

  try {
    const db = await connectToDatabase();
    const col = db.collection("kvstore");

    if (req.method === "GET") {
      const doc = await col.findOne({ _id: key });
      res.status(200).json({ key, value: doc ? doc.value : null });
      return;
    }

    if (req.method === "POST") {
      const value = req.body && typeof req.body.value !== "undefined" ? req.body.value : null;
      await col.updateOne(
        { _id: key },
        { $set: { value, updatedAt: new Date() } },
        { upsert: true }
      );
      res.status(200).json({ key, value });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};