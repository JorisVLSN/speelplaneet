const { db, configured } = require("../server/supabase");

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET") return response.status(405).json({ status:"method_not_allowed" });
  if (!configured()) return response.status(503).json({ status:"configuration_missing" });
  try {
    await db("players?select=id&limit=1");
    return response.status(200).json({
      status:"ok",
      database:"connected",
      environment:process.env.VERCEL_ENV || "local",
      checkedAt:new Date().toISOString(),
    });
  } catch {
    return response.status(503).json({
      status:"degraded",
      database:"unavailable",
      checkedAt:new Date().toISOString(),
    });
  }
};
