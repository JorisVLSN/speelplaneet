const {
  crypto, db, configured, normalizeName, hashPin, safeEqual, sessionPlayer,
} = require("../server/supabase");

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  if (!configured()) return response.status(503).json({ error: "SYNC_NOT_CONFIGURED" });
  try {
    const action = request.body?.action;
    const parentCode = String(request.body?.parentCode || "");
    if (!/^\d{6}$/.test(parentCode)) return response.status(400).json({ error: "INVALID_PARENT_CODE" });

    if (action === "setup") {
      const playerId = await sessionPlayer(request);
      if (!playerId) return response.status(401).json({ error: "INVALID_SESSION" });
      const salt = crypto.randomBytes(16).toString("hex");
      await db(`players?id=eq.${playerId}`, {
        method: "PATCH",
        body: {
          recovery_salt: salt,
          recovery_hash: hashPin(parentCode, salt),
          recovery_failed_attempts: 0,
          recovery_locked_until: null,
        },
      });
      return response.status(200).json({ ok: true });
    }

    if (action === "reset") {
      const nameKey = normalizeName(request.body?.name);
      const newPin = String(request.body?.newPin || "");
      if (!nameKey || !/^\d{4}$/.test(newPin)) return response.status(400).json({ error: "INVALID_RESET" });
      const rows = await db(`players?name_key=eq.${encodeURIComponent(nameKey)}&select=*&limit=1`);
      const player = rows?.[0];
      if (!player?.recovery_hash || !player.recovery_salt) return response.status(404).json({ error: "RECOVERY_NOT_SET" });
      if (player.recovery_locked_until && new Date(player.recovery_locked_until) > new Date()) {
        return response.status(429).json({ error: "TEMPORARILY_LOCKED" });
      }
      if (!safeEqual(hashPin(parentCode, player.recovery_salt), player.recovery_hash)) {
        const failed = (player.recovery_failed_attempts || 0) + 1;
        await db(`players?id=eq.${player.id}`, {
          method: "PATCH",
          body: {
            recovery_failed_attempts: failed >= 5 ? 0 : failed,
            recovery_locked_until: failed >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null,
          },
        });
        return response.status(401).json({ error: "WRONG_PARENT_CODE" });
      }
      const pinSalt = crypto.randomBytes(16).toString("hex");
      await db(`players?id=eq.${player.id}`, {
        method: "PATCH",
        body: {
          pin_salt: pinSalt,
          pin_hash: hashPin(newPin, pinSalt),
          failed_attempts: 0,
          locked_until: null,
          recovery_failed_attempts: 0,
          recovery_locked_until: null,
        },
      });
      await db(`player_sessions?player_id=eq.${player.id}`, { method: "DELETE", prefer: "return=minimal" });
      return response.status(200).json({ ok: true });
    }
    return response.status(400).json({ error: "UNKNOWN_ACTION" });
  } catch (error) {
    console.error("parent_recovery_error", error.message);
    return response.status(500).json({ error: "RECOVERY_FAILED" });
  }
};
