const crypto = require("node:crypto");

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function configured() {
  return Boolean(supabaseUrl && serviceKey);
}

async function db(path, options = {}) {
  if (!configured()) throw new Error("SERVER_NOT_CONFIGURED");
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || `Databasefout ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function normalizeName(name) {
  return String(name || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("nl-BE");
}

function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 64).toString("hex");
}

function safeEqual(left, right) {
  const a = Buffer.from(left || "", "hex");
  const b = Buffer.from(right || "", "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function sanitizeProgress(value) {
  const source = value && typeof value === "object" ? value : {};
  const cleanNumbers = object => Object.fromEntries(
    Object.entries(object || {})
      .filter(([key, number]) => /^[a-z0-9_-]{1,40}$/i.test(key) && Number.isFinite(Number(number)))
      .map(([key, number]) => [key, Math.max(0, Math.floor(Number(number)))])
  );
  const stats = Object.fromEntries(
    Object.entries(source.stats || {})
      .filter(([key, entry]) => /^[a-z0-9_-]{1,40}$/i.test(key) && entry && typeof entry === "object")
      .map(([key, entry]) => [key, {
        attempts: Math.max(0, Math.floor(Number(entry.attempts) || 0)),
        wins: Math.max(0, Math.floor(Number(entry.wins) || 0)),
        totalSeconds: Math.max(0, Math.floor(Number(entry.totalSeconds) || 0)),
      }])
  );
  const activity = Object.fromEntries(
    Object.entries(source.activity || {})
      .filter(([key, value]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && Array.isArray(value))
      .slice(-35)
      .map(([key, value]) => [key, [...new Set(value.filter(item => /^[a-z0-9_-]{1,40}$/i.test(item)).slice(0, 20))]])
  );
  const seasons = Object.fromEntries(
    Object.entries(source.seasons || {})
      .filter(([key, entry]) => /^(spring|summer|autumn|winter)-\d{4}$/.test(key) && entry && typeof entry === "object")
      .slice(-12)
      .map(([key, entry]) => [key, {
        games:[...new Set(Array.isArray(entry.games) ? entry.games.filter(item => /^[a-z0-9_-]{1,40}$/i.test(item)).slice(0,20) : [])],
        rewards:[...new Set(Array.isArray(entry.rewards) ? entry.rewards.filter(item => /^reward-(3|6|10)$/.test(item)).slice(0,3) : [])],
      }])
  );
  const support = Object.fromEntries(
    Object.entries(source.support || {})
      .filter(([key,entry]) => /^[a-z0-9_-]{1,40}$/i.test(key) && entry && typeof entry === "object")
      .slice(0,30)
      .map(([key,entry]) => [key,{
        streak:Math.min(10,Math.max(0,Math.floor(Number(entry.streak) || 0))),
        hints:Math.max(0,Math.floor(Number(entry.hints) || 0)),
        updatedAt:Math.max(0,Math.floor(Number(entry.updatedAt) || 0)),
      }])
  );
  return {
    stars: Math.max(0, Math.floor(Number(source.stars) || 0)),
    completed: [...new Set(Array.isArray(source.completed) ? source.completed.filter(item => typeof item === "string").slice(-500) : [])],
    gameWins: cleanNumbers(source.gameWins),
    levels: Object.fromEntries(Object.entries(cleanNumbers(source.levels)).map(([key, level]) => [key, Math.min(100, Math.max(1, level))])),
    runnerHighscores: cleanNumbers(source.runnerHighscores),
    stats,
    milestoneAwards: [...new Set(Array.isArray(source.milestoneAwards)
      ? source.milestoneAwards.filter(item => /^[a-z0-9_-]{1,50}$/i.test(item)).slice(-100)
      : [])],
    activity,
    missionClaims: [...new Set(Array.isArray(source.missionClaims)
      ? source.missionClaims.filter(item => /^(daily|weekly)-\d{4}-\d{2}-\d{2}$/.test(item)).slice(-100)
      : [])],
    favorites: [...new Set(Array.isArray(source.favorites)
      ? source.favorites.filter(item => /^[a-z0-9_-]{1,40}$/i.test(item)).slice(0, 20)
      : [])],
    favoritesUpdatedAt:Math.max(0, Math.floor(Number(source.favoritesUpdatedAt) || 0)),
    recentGame:/^[a-z0-9_-]{1,40}$/i.test(source.recentGame || "") ? source.recentGame : "",
    recentGameUpdatedAt:Math.max(0, Math.floor(Number(source.recentGameUpdatedAt) || 0)),
    seasons,
    support,
  };
}

async function sessionPlayer(request) {
  const authorization = request.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;
  const sessions = await db(`player_sessions?token_hash=eq.${tokenHash(token)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=player_id&limit=1`);
  if (!sessions?.[0]) return null;
  return sessions[0].player_id;
}

async function multiplayerAllowed(playerId) {
  const rows = await db(`players?id=eq.${playerId}&select=parent_settings&limit=1`);
  return rows?.[0]?.parent_settings?.multiplayerEnabled !== false;
}

module.exports = {
  crypto,
  db,
  configured,
  normalizeName,
  hashPin,
  safeEqual,
  tokenHash,
  sanitizeProgress,
  sessionPlayer,
  multiplayerAllowed,
};
