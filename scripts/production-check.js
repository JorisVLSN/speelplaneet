const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const errors = [];
const required = [
  "index.html","styles.css","app.js","level-engine.js","service-worker.js","vercel.json",
  "manifest.webmanifest",
  "api/auth.js","api/progress.js","api/parent.js","api/battleship.js","api/turn-game.js","api/health.js",
  "assets/ellie-en-mila-speelplaneet.png","assets/ellie-runner-transparent.png",
  "assets/mila-runner-transparent.png","assets/mats-runner-transparent.png",
  "assets/speelplaneet-app-icon.svg",
  "assets/speelplaneet-app-icon-192.png","assets/speelplaneet-app-icon-512.png",
];
required.forEach(file => { if (!fs.existsSync(path.join(root,file))) errors.push(`Ontbrekend bestand: ${file}`); });

const javascript = [];
function visit(directory) {
  for (const entry of fs.readdirSync(directory,{withFileTypes:true})) {
    if (entry.name === "outputs") continue;
    const full = path.join(directory,entry.name);
    if (entry.isDirectory()) visit(full);
    else if (entry.name.endsWith(".js")) javascript.push(full);
  }
}
visit(root);
javascript.forEach(file => {
  try { execFileSync(process.execPath,["--check",file],{stdio:"pipe"}); }
  catch { errors.push(`Ongeldige JavaScript-syntax: ${path.relative(root,file)}`); }
});

const coreBytes = ["app.js","level-engine.js","styles.css","index.html"].reduce((sum,file) => sum + fs.statSync(path.join(root,file)).size,0);
const offlineBytes = required.filter(file => file.startsWith("assets/")).reduce((sum,file) => sum + fs.statSync(path.join(root,file)).size,0);
if (coreBytes > 500 * 1024) errors.push(`Kerncode overschrijdt 500 KB: ${Math.round(coreBytes/1024)} KB`);
if (offlineBytes > 5 * 1024 * 1024) errors.push(`Offline-afbeeldingen overschrijden 5 MB: ${Math.round(offlineBytes/1024)} KB`);

const html = fs.readFileSync(path.join(root,"index.html"),"utf8");
["styles.css","level-engine.js","app.js"].forEach(asset => { if (!html.includes(asset)) errors.push(`index.html verwijst niet naar ${asset}`); });
if (!/<meta\s+name=["']viewport["'][^>]*width=device-width/i.test(html)) {
  errors.push("index.html mist een mobiele viewport-instelling");
}
["login-form","accessibility-dialog","tutorial-dialog","privacy-dialog","parent-dialog","family-progress","family-contributors","family-rewards","tournament-dialog","start-tournament","tournament-scoreboard","season-title","season-progress","season-missions","positive-report-title","parent-highlights","parent-suggestion-text","copy-parent-report","connectivity-banner","install-app","update-banner","apply-update"].forEach(id => {
  if (!html.includes(`id="${id}"`)) errors.push(`Interface mist vereist onderdeel: ${id}`);
});

const styles = fs.readFileSync(path.join(root,"styles.css"),"utf8");
[
  { pattern: /@media\s*\(\s*max-width:\s*900px\s*\)/, label: "tabletbreekpunt van 900px" },
  { pattern: /@media\s*\(\s*max-width:\s*580px\s*\)/, label: "telefoonbreekpunt van 580px" },
  { pattern: /\.game-grid\s*\{[^}]*grid-template-columns:\s*1fr/s, label: "enkelkoloms spellijst op telefoon" },
  { pattern: /\.battle-boards\s*\{[^}]*grid-template-columns:\s*1fr/s, label: "enkelkoloms zeeslagborden op tablet" },
  { pattern: /\.privacy-sections\s*\{[^}]*grid-template-columns:\s*1fr/s, label: "enkelkoloms privacyvenster op telefoon" },
].forEach(check => {
  if (!check.pattern.test(styles)) errors.push(`Responsieve controle mist: ${check.label}`);
});
const worker = fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
required.filter(file => /^(assets\/|app\.js|level-engine\.js|styles\.css|index\.html)/.test(file))
  .forEach(asset => { if (!worker.includes(`/${asset}`)) errors.push(`Offline-cache mist ${asset}`); });
const appCode = fs.readFileSync(path.join(root,"app.js"),"utf8");
["adaptiveTips","noteStruggle","renderAdaptiveHelp","mergeSupportProgress"].forEach(symbol => {
  if (!appCode.includes(symbol)) errors.push(`Adaptieve hulp mist: ${symbol}`);
});
["renderMaze","SpeelplaneetLevels.maze","data-maze-move"].forEach(symbol => {
  if (!appCode.includes(symbol)) errors.push(`Sterrendoolhof mist: ${symbol}`);
});
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(root,"manifest.webmanifest"),"utf8"));
  if (manifest.display !== "standalone") errors.push("Appmanifest gebruikt geen standalone-weergave");
  if (manifest.start_url !== "/") errors.push("Appmanifest heeft een ongeldige startpagina");
  if (!manifest.icons?.some(icon => icon.src === "/assets/speelplaneet-app-icon-192.png" && icon.sizes === "192x192")) errors.push("Appmanifest mist het 192px-icoon");
  if (!manifest.icons?.some(icon => icon.src === "/assets/speelplaneet-app-icon-512.png" && icon.sizes === "512x512")) errors.push("Appmanifest mist het 512px-icoon");
} catch {
  errors.push("Appmanifest bevat ongeldige JSON");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Productiecheck geslaagd: ${javascript.length} scripts, ${Math.round(coreBytes/1024)} KB kerncode, ${Math.round(offlineBytes/1024)} KB offline-afbeeldingen, 3 schermformaten bewaakt.`);
