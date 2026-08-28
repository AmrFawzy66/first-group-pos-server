const { MongoClient, ServerApiVersion } = require("mongodb");

let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGODB_URI environment variable");

  const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
  });
  await client.connect();

  const dbName = process.env.DB_NAME || "first_group_pos";
  cachedDb = client.db(dbName);
  return cachedDb;
}

module.exports = { connectToDatabase };