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
  return {
    stars: Math.max(0, Math.floor(Number(source.stars) || 0)),
    completed: [...new Set(Array.isArray(source.completed) ? source.completed.filter(item => typeof item === "string").slice(-500) : [])],
    gameWins: cleanNumbers(source.gameWins),
    levels: Object.fromEntries(Object.entries(cleanNumbers(source.levels)).map(([key, level]) => [key, Math.min(100, Math.max(1, level))])),
    runnerHighscores: cleanNumbers(source.runnerHighscores),
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
};
