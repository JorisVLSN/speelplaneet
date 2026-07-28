const { db, configured, tokenHash } = require("../server/supabase");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  if (!configured()) return response.status(204).end();
  const authorization = request.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (token) {
    try { await db(`player_sessions?token_hash=eq.${tokenHash(token)}`, { method: "DELETE", prefer: "return=minimal" }); } catch {}
  }
  return response.status(204).end();
};
