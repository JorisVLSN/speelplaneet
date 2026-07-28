const {
  crypto, db, configured, normalizeName, hashPin, safeEqual, sessionPlayer, sanitizeProgress,
} = require("../server/supabase");

async function authenticatedParent(request, parentCode) {
  const playerId = await sessionPlayer(request);
  if (!playerId) return { error:"INVALID_SESSION", status:401 };
  const player = (await db(`players?id=eq.${playerId}&select=*&limit=1`))?.[0];
  if (!player?.recovery_hash || !player.recovery_salt) return { error:"RECOVERY_NOT_SET", status:404 };
  if (player.recovery_locked_until && new Date(player.recovery_locked_until) > new Date()) return { error:"TEMPORARILY_LOCKED", status:429 };
  if (!safeEqual(hashPin(parentCode, player.recovery_salt), player.recovery_hash)) {
    const failed = (player.recovery_failed_attempts || 0) + 1;
    await db(`players?id=eq.${player.id}`, {
      method:"PATCH",
      body:{
        recovery_failed_attempts:failed >= 5 ? 0 : failed,
        recovery_locked_until:failed >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null,
      },
    });
    return { error:"WRONG_PARENT_CODE", status:401 };
  }
  await db(`players?id=eq.${player.id}`, { method:"PATCH", body:{ recovery_failed_attempts:0, recovery_locked_until:null } });
  return { player };
}

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

    if (["overview","settings","export","delete"].includes(action)) {
      const verified = await authenticatedParent(request, parentCode);
      if (verified.error) return response.status(verified.status).json({ error:verified.error });
      let settings = verified.player.parent_settings || { multiplayerEnabled:true, wordLevel:"auto", mathLevel:"auto", paused:false };
      if (action === "delete") {
        await db(`players?id=eq.${verified.player.id}`, { method:"DELETE", prefer:"return=minimal" });
        return response.status(200).json({ deleted:true });
      }
      if (action === "settings") {
        const requested = request.body?.settings || {};
        settings = {
          multiplayerEnabled:requested.multiplayerEnabled !== false,
          wordLevel:["auto","basis","gevorderd"].includes(requested.wordLevel) ? requested.wordLevel : "auto",
          mathLevel:["auto","basis","tafels","gemengd"].includes(requested.mathLevel) ? requested.mathLevel : "auto",
          paused:requested.paused === true,
        };
        await db(`players?id=eq.${verified.player.id}`, { method:"PATCH", body:{ parent_settings:settings } });
      }
      const progressRows = await db(`player_progress?player_id=eq.${verified.player.id}&select=progress&limit=1`);
      if (action === "export") return response.status(200).json({
        export:{
          exportedAt:new Date().toISOString(),
          player:{ name:verified.player.name, createdAt:verified.player.created_at },
          settings,
          progress:sanitizeProgress(progressRows?.[0]?.progress),
        },
      });
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const errorRows = await db(`app_error_logs?player_id=eq.${verified.player.id}&created_at=gt.${encodeURIComponent(since)}&select=id`);
      return response.status(200).json({
        player:{ name:verified.player.name },
        settings,
        progress:sanitizeProgress(progressRows?.[0]?.progress),
        system:{ recentErrors:errorRows?.length || 0 },
      });
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
