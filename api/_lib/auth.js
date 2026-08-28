function checkApiKey(req, res) {
  const expected = process.env.API_KEY;
  if (!expected) {
    res.status(500).json({ error: "Server misconfigured: API_KEY is not set" });
    return false;
  }
  const key = req.headers["x-api-key"];
  if (!key || key !== expected) {
    res.status(401).json({ error: "Invalid or missing X-Api-Key header" });
    return false;
  }
  return true;
}

function applyCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Api-Key");
}

module.exports = { checkApiKey, applyCors };