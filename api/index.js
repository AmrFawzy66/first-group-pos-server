module.exports = (req, res) => {
  res.status(200).json({ ok: true, service: "first-group-pos-server (vercel)" });
};