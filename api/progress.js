const { db, configured, sanitizeProgress, sessionPlayer } = require("../server/supabase");

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (!configured()) return response.status(503).json({ error: "SYNC_NOT_CONFIGURED" });
  try {
    const playerId = await sessionPlayer(request);
    if (!playerId) return response.status(401).json({ error: "INVALID_SESSION" });

    if (request.method === "GET") {
      const rows = await db(`player_progress?player_id=eq.${playerId}&select=progress&limit=1`);
      return response.status(200).json({ progress: sanitizeProgress(rows?.[0]?.progress) });
    }
    if (request.method === "PUT") {
      const progress = sanitizeProgress(request.body?.progress);
      await db(`player_progress?player_id=eq.${playerId}`, {
        method: "PATCH",
        body: { progress, updated_at: new Date().toISOString() },
      });
      return response.status(200).json({ progress });
    }
    return response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  } catch (error) {
    console.error("progress_error", error.message);
    return response.status(500).json({ error: "PROGRESS_FAILED" });
  }
};
