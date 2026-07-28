const {
  crypto, db, configured, normalizeName, hashPin, safeEqual, tokenHash, sanitizeProgress,
} = require("../server/supabase");

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  if (!configured()) return response.status(503).json({ error: "SYNC_NOT_CONFIGURED" });

  try {
    const name = String(request.body?.name || "").trim().replace(/\s+/g, " ");
    const pin = String(request.body?.pin || "");
    if (name.length < 1 || name.length > 16 || !/^\d{4}$/.test(pin)) {
      return response.status(400).json({ error: "INVALID_CREDENTIALS" });
    }
    const nameKey = normalizeName(name);
    const players = await db(`players?name_key=eq.${encodeURIComponent(nameKey)}&select=*&limit=1`);
    let player = players?.[0];

    if (player) {
      if (player.locked_until && new Date(player.locked_until) > new Date()) {
        return response.status(429).json({ error: "TEMPORARILY_LOCKED" });
      }
      if (!safeEqual(hashPin(pin, player.pin_salt), player.pin_hash)) {
        const failed = (player.failed_attempts || 0) + 1;
        await db(`players?id=eq.${player.id}`, {
          method: "PATCH",
          body: { failed_attempts: failed >= 5 ? 0 : failed, locked_until: failed >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null },
        });
        return response.status(401).json({ error: "WRONG_PIN" });
      }
      await db(`players?id=eq.${player.id}`, { method: "PATCH", body: { failed_attempts: 0, locked_until: null, last_login_at: new Date().toISOString() } });
    } else {
      const salt = crypto.randomBytes(16).toString("hex");
      const created = await db("players", {
        method: "POST",
        body: { name, name_key: nameKey, pin_salt: salt, pin_hash: hashPin(pin, salt) },
      });
      player = created[0];
      await db("player_progress", {
        method: "POST",
        body: { player_id: player.id, progress: sanitizeProgress(request.body?.initialProgress) },
      });
    }

    const token = crypto.randomBytes(32).toString("base64url");
    await db("player_sessions", {
      method: "POST",
      body: {
        player_id: player.id,
        token_hash: tokenHash(token),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    const rows = await db(`player_progress?player_id=eq.${player.id}&select=progress&limit=1`);
    return response.status(200).json({
      token,
      player: { id: player.id, name: player.name },
      progress: sanitizeProgress(rows?.[0]?.progress),
      settings: player.parent_settings || { multiplayerEnabled:true, wordLevel:"auto", mathLevel:"auto", paused:false },
    });
  } catch (error) {
    console.error("auth_error", error.message);
    return response.status(500).json({ error: "AUTH_FAILED" });
  }
};
