const { db, configured, sessionPlayer } = require("../server/supabase");

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return response.status(405).json({ error:"METHOD_NOT_ALLOWED" });
  if (!configured()) return response.status(503).json({ error:"SYNC_NOT_CONFIGURED" });
  const playerId = await sessionPlayer(request).catch(() => null);
  if (!playerId) return response.status(401).json({ error:"INVALID_SESSION" });
  const clean = value => String(value || "").replace(/[\r\n\t]+/g, " ").slice(0, 500);
  try {
    await db(`app_error_logs?created_at=lt.${encodeURIComponent(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())}`, { method:"DELETE", prefer:"return=minimal" });
    await db("app_error_logs", {
      method:"POST",
      body:{
        player_id:playerId,
        error_type:clean(request.body?.type || "client"),
        message:clean(request.body?.message),
        context:clean(request.body?.context),
        user_agent:clean(request.headers["user-agent"]),
      },
    });
    return response.status(202).json({ accepted:true });
  } catch {
    return response.status(500).json({ error:"LOG_FAILED" });
  }
};
