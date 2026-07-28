const games = [
  { id: "zeeslag", title: "Zeeslag", icon: "🚢", color: "blue", description: "Vind de verstopte schepen!", modes: "Solo · Samen · 100 levels" },
  { id: "galgje", title: "Galgje", icon: "🔤", color: "orange", description: "Raad het woord, letter voor letter.", modes: "Solo · Samen · 100 levels" },
  { id: "sudoku", title: "Mini Sudoku", icon: "🧩", color: "purple", description: "Vul ieder vakje slim in.", modes: "100 levels" },
  { id: "woordzoeker", title: "Woordzoeker", icon: "🔎", color: "green", description: "Speur alle woorden op.", modes: "100 levels" },
  { id: "memory", title: "Memory", icon: "🃏", color: "purple", description: "Vind alle gelijke ruimteparen.", modes: "100 levels" },
  { id: "vieropeenrij", title: "Vier op een rij", icon: "🔴", color: "blue", description: "Maak als eerste een rij van vier.", modes: "Solo · Samen · 100 levels" },
  { id: "boterkaaseieren", title: "Boter-kaas-en-eieren", icon: "❌", color: "orange", description: "Drie op een rij wint!", modes: "Solo · Samen · 100 levels" },
  { id: "mastermind", title: "Kleurcode", icon: "🎨", color: "green", description: "Kraak de geheime kleurcode.", modes: "100 levels" },
  { id: "rekensprint", title: "Rekensprint", icon: "➕", color: "orange", description: "Los snelle sommen op.", modes: "100 levels" },
  { id: "simon", title: "Sterrenreeks", icon: "✨", color: "purple", description: "Onthoud de kleurenreeks.", modes: "100 levels" },
  { id: "ruimterunner", title: "Ruimterunner", icon: "🏃", color: "blue", description: "Spring over robots en buk voor ufo’s.", modes: "Ellie, Mila of Mats · 100 levels" },
  { id: "doolhof", title: "Sterren­doolhof", icon: "🌀", color: "green", description: "Vind de veiligste route naar de planeet.", modes: "100 levels" },
];
const gameCategories = {
  zeeslag:"Samen", galgje:"Taal", sudoku:"Puzzels", woordzoeker:"Taal", memory:"Geheugen",
  vieropeenrij:"Samen", boterkaaseieren:"Samen", mastermind:"Puzzels", rekensprint:"Rekenen", simon:"Geheugen", ruimterunner:"Actie", doolhof:"Puzzels",
};

const state = {
  player: JSON.parse(localStorage.getItem("speelplaneet-player") || "null"),
  progress: JSON.parse(localStorage.getItem("speelplaneet-progress") || '{"stars":0,"completed":[],"gameWins":{}}'),
  authToken: localStorage.getItem("speelplaneet-auth-token") || "",
  activeGame: null,
  supabase: null,
  room: null,
  roomChannel: null,
  roomListener: null,
  sessionId: localStorage.getItem("speelplaneet-session") || crypto.randomUUID(),
  inviteHandled: false,
  selectedLevels: {},
  gameCleanup: null,
  syncTimer: 0,
  battleshipJoin: null,
  turnGameJoin: null,
  playStartedAt: 0,
  levelCompleted: false,
  parentSettings: null,
  category:"Alles",
  gamePause:null,
  gameResume:null,
  gamePaused:false,
  tournament:null,
};
localStorage.setItem("speelplaneet-session", state.sessionId);
const playerProgressKey = name => `speelplaneet-progress-${String(name || "").normalize("NFKC").trim().toLocaleLowerCase("nl-BE")}`;
const parentSettingsKey = name => `speelplaneet-parent-settings-${String(name || "").normalize("NFKC").trim().toLocaleLowerCase("nl-BE")}`;
if (state.player) {
  const savedPlayerProgress = localStorage.getItem(playerProgressKey(state.player.name));
  if (savedPlayerProgress) state.progress = JSON.parse(savedPlayerProgress);
  state.parentSettings = JSON.parse(localStorage.getItem(parentSettingsKey(state.player.name)) || "null");
}
state.progress.levels ||= {};
state.progress.runnerHighscores ||= JSON.parse(localStorage.getItem("speelplaneet-runner-highscores") || "{}");
state.progress.stats ||= {};
state.progress.milestoneAwards ||= [];
state.progress.activity ||= {};
state.progress.missionClaims ||= [];
state.progress.favorites ||= [];
state.progress.favoritesUpdatedAt ||= 0;
state.progress.recentGame ||= "";
state.progress.recentGameUpdatedAt ||= 0;
state.progress.seasons ||= {};
state.progress.support ||= {};

const inviteParams = new URLSearchParams(window.location.search);
const levelTestMode = inviteParams.get("testlevels") === "1";
let levelTestOpened = false;
const pendingInvite = {
  game: inviteParams.get("game"),
  code: inviteParams.get("code"),
};

const $ = (selector) => document.querySelector(selector);
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[character]);
const loginView = $("#login-view");
const dashboardView = $("#dashboard-view");
const homeScreen = $("#home-screen");
const gameScreen = $("#game-screen");
const stage = $("#game-stage");
const accessibilityDefaults = { largeText:false, highContrast:false, reducedMotion:false, colorSymbols:false, sound:true, music:false, speech:false };
let accessibility = { ...accessibilityDefaults, ...JSON.parse(localStorage.getItem("speelplaneet-accessibility") || "{}") };
let audioContext = null, musicNodes = [];
let lastErrorReport = 0;

function applyAccessibility() {
  document.body.classList.toggle("large-text", accessibility.largeText);
  document.body.classList.toggle("high-contrast", accessibility.highContrast);
  document.body.classList.toggle("reduced-motion", accessibility.reducedMotion);
  document.body.classList.toggle("color-symbols", accessibility.colorSymbols);
  document.querySelectorAll("[data-accessibility]").forEach(input => { input.checked = Boolean(accessibility[input.dataset.accessibility]); });
}

function ensureAudio() {
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function playUiSound() {
  if (!accessibility.sound) return;
  try {
    const context = ensureAudio(), oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.frequency.value = 520; gain.gain.setValueAtTime(.025, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .12);
    oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .13);
  } catch {}
}

function setMusic(active) {
  musicNodes.forEach(node => { try { node.stop(); } catch {} }); musicNodes = [];
  if (!active) return;
  try {
    const context = ensureAudio(), gain = context.createGain(); gain.gain.value = .012; gain.connect(context.destination);
    [174,261].forEach(frequency => { const oscillator=context.createOscillator();oscillator.type="sine";oscillator.frequency.value=frequency;oscillator.connect(gain);oscillator.start();musicNodes.push(oscillator); });
  } catch {}
}

applyAccessibility();

function setParentSettings(settings) {
  if (!settings) return;
  state.parentSettings = settings;
  if (state.player?.name) localStorage.setItem(parentSettingsKey(state.player.name), JSON.stringify(settings));
}

function reportClientError(type, message, context = "") {
  if (!state.authToken || Date.now() - lastErrorReport < 60000) return;
  lastErrorReport = Date.now();
  fetch("/api/log-error", {
    method:"POST",
    headers:{ "Content-Type":"application/json", Authorization:`Bearer ${state.authToken}` },
    body:JSON.stringify({ type, message:String(message || ""), context }),
  }).catch(() => {});
}

window.addEventListener("error", event => reportClientError("javascript", event.message, `${event.filename || ""}:${event.lineno || 0}`));
window.addEventListener("unhandledrejection", event => reportClientError("promise", event.reason?.message || event.reason || "Onbekende fout"));

function clearGamePause() {
  state.gamePause = null; state.gameResume = null; state.gamePaused = false;
  const button = $("#pause-game");
  button.classList.add("hidden"); button.textContent = "⏸ Pauze";
}

function configureGamePause(pause, resume) {
  state.gamePause = pause; state.gameResume = resume; state.gamePaused = false;
  $("#pause-game").classList.remove("hidden");
}

function pauseActiveGame() {
  if (!state.gamePause || state.gamePaused || state.gamePause() === false) return false;
  state.gamePaused = true; $("#pause-game").textContent = "▶ Hervat"; return true;
}

function resumeActiveGame() {
  if (!state.gameResume || !state.gamePaused || state.gameResume() === false) return false;
  state.gamePaused = false; $("#pause-game").textContent = "⏸ Pauze"; return true;
}

function saveProgress() {
  localStorage.setItem("speelplaneet-progress", JSON.stringify(state.progress));
  if (state.player?.name) localStorage.setItem(playerProgressKey(state.player.name), JSON.stringify(state.progress));
  scheduleProgressSync();
}

function setSyncStatus(text, online = false) {
  const element = $("#sync-status");
  if (!element) return;
  element.textContent = text;
  element.classList.toggle("synced", online);
}

function mergeProgress(local, remote) {
  const maxMap = (left = {}, right = {}) => Object.fromEntries(
    [...new Set([...Object.keys(left), ...Object.keys(right)])].map(key => [key, Math.max(Number(left[key]) || 0, Number(right[key]) || 0)])
  );
  const statKeys = [...new Set([...Object.keys(local?.stats || {}), ...Object.keys(remote?.stats || {})])];
  const activityKeys = [...new Set([...Object.keys(local?.activity || {}), ...Object.keys(remote?.activity || {})])];
  return {
    stars: Math.max(Number(local?.stars) || 0, Number(remote?.stars) || 0),
    completed: [...new Set([...(local?.completed || []), ...(remote?.completed || [])])],
    gameWins: maxMap(local?.gameWins, remote?.gameWins),
    levels: maxMap(local?.levels, remote?.levels),
    runnerHighscores: maxMap(local?.runnerHighscores, remote?.runnerHighscores),
    stats: Object.fromEntries(statKeys.map(key => [key, maxMap(local?.stats?.[key], remote?.stats?.[key])])),
    milestoneAwards: [...new Set([...(local?.milestoneAwards || []), ...(remote?.milestoneAwards || [])])],
    activity: Object.fromEntries(activityKeys.map(key => [key, [...new Set([...(local?.activity?.[key] || []), ...(remote?.activity?.[key] || [])])]])),
    missionClaims: [...new Set([...(local?.missionClaims || []), ...(remote?.missionClaims || [])])],
    favorites:Number(local?.favoritesUpdatedAt || 0) >= Number(remote?.favoritesUpdatedAt || 0) ? [...new Set(local?.favorites || [])] : [...new Set(remote?.favorites || [])],
    favoritesUpdatedAt:Math.max(Number(local?.favoritesUpdatedAt) || 0, Number(remote?.favoritesUpdatedAt) || 0),
    recentGame:Number(local?.recentGameUpdatedAt || 0) >= Number(remote?.recentGameUpdatedAt || 0) ? (local?.recentGame || "") : (remote?.recentGame || ""),
    recentGameUpdatedAt:Math.max(Number(local?.recentGameUpdatedAt) || 0, Number(remote?.recentGameUpdatedAt) || 0),
    seasons:mergeSeasonProgress(local?.seasons, remote?.seasons),
    support:mergeSupportProgress(local?.support, remote?.support),
  };
}

function mergeSeasonProgress(left = {}, right = {}) {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
  return Object.fromEntries(keys.map(key => [key, {
    games:[...new Set([...(left[key]?.games || []), ...(right[key]?.games || [])])],
    rewards:[...new Set([...(left[key]?.rewards || []), ...(right[key]?.rewards || [])])],
  }]));
}

function mergeSupportProgress(left = {}, right = {}) {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
  return Object.fromEntries(keys.map(key => {
    const local = left[key] || {}, remote = right[key] || {};
    const newest = Number(local.updatedAt || 0) >= Number(remote.updatedAt || 0) ? local : remote;
    return [key,{
      streak:Math.max(0,Number(newest.streak) || 0),
      hints:Math.max(Number(local.hints) || 0,Number(remote.hints) || 0),
      updatedAt:Math.max(Number(local.updatedAt) || 0,Number(remote.updatedAt) || 0),
    }];
  }));
}

const localDateKey = date => {
  const year = date.getFullYear(), month = String(date.getMonth() + 1).padStart(2, "0"), day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const recentActivityKeys = days => Array.from({length:days}, (_, offset) => {
  const date = new Date(); date.setHours(12,0,0,0); date.setDate(date.getDate() - offset); return localDateKey(date);
});
const weekKey = date => {
  const monday = new Date(date); monday.setHours(12,0,0,0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return localDateKey(monday);
};

const familyChallengeStorageKey = "speelplaneet-family-challenge";
const familyChallengeTarget = 20;
function loadFamilyChallenge() {
  let challenge = {};
  try { challenge = JSON.parse(localStorage.getItem(familyChallengeStorageKey) || "{}"); } catch {}
  const currentWeek = weekKey(new Date());
  if (challenge.week !== currentWeek) challenge = { week:currentWeek, stars:0, contributors:{} };
  challenge.stars = Math.max(0, Number(challenge.stars) || 0);
  challenge.contributors ||= {};
  return challenge;
}
function saveFamilyChallenge(challenge) {
  localStorage.setItem(familyChallengeStorageKey, JSON.stringify(challenge));
}
function addFamilyStar() {
  const challenge = loadFamilyChallenge();
  const playerName = String(state.player?.name || "Ruimteverkenner").trim().slice(0,24);
  challenge.stars += 1;
  challenge.contributors[playerName] = (Number(challenge.contributors[playerName]) || 0) + 1;
  saveFamilyChallenge(challenge);
  return challenge.stars;
}
function renderFamilyChallenge() {
  const challenge = loadFamilyChallenge();
  saveFamilyChallenge(challenge);
  const visibleStars = Math.min(challenge.stars, familyChallengeTarget);
  $("#family-stars").textContent = visibleStars;
  $("#family-progress").style.width = `${visibleStars / familyChallengeTarget * 100}%`;
  $(".family-progress-track").setAttribute("aria-valuenow", String(visibleStars));
  const preferredNames = ["Ellie","Mila","Mats"];
  const names = [...new Set([...preferredNames, ...Object.keys(challenge.contributors)])];
  $("#family-contributors").innerHTML = names.map(name => {
    const count = Number(challenge.contributors[name]) || 0;
    const safeName = escapeHtml(name);
    return `<div class="family-contributor"><span>${escapeHtml(name.slice(0,1).toUpperCase())}</span>${safeName}: ${count} ⭐</div>`;
  }).join("");
  const rewards = [
    { at:5, icon:"🛰️", name:"Familiesatelliet" },
    { at:12, icon:"☄️", name:"Kometenmedaille" },
    { at:20, icon:"🚀", name:"Sterrenmotor" },
  ];
  $("#family-rewards").innerHTML = rewards.map(reward => {
    const unlocked = challenge.stars >= reward.at;
    return `<div class="family-reward ${unlocked ? "" : "locked"}"><span>${unlocked ? reward.icon : "🔒"}</span><div><strong>${reward.name}</strong><small>${unlocked ? "Samen ontdekt!" : `Bij ${reward.at} sterren`}</small></div></div>`;
  }).join("");
}

const seasonWorlds = {
  spring:{ title:"Bloesemnevel", description:"Laat nieuwe ruimtebloemen groeien door verschillende spellen te ontdekken.", rewards:[["🌱","Sterrenzaad"],["🌸","Nevelbloesem"],["🦋","Kosmische vlinder"]] },
  summer:{ title:"Zomerse sterrenbaai", description:"Vaar langs zonnige planeten door verschillende spellen te ontdekken.", rewards:[["🐚","Maanschelp"],["☀️","Zonnekompas"],["🏝️","Sterreneiland"]] },
  autumn:{ title:"Kometenbos", description:"Verzamel warme ruimtekleuren door verschillende spellen te ontdekken.", rewards:[["🍂","Maanblad"],["🦊","Sterrenvos"],["🌠","Herfstkomeet"]] },
  winter:{ title:"IJsplaneet Aurora", description:"Ontsteek het poollicht door verschillende spellen te ontdekken.", rewards:[["❄️","IJskristal"],["⛄","Ruimtesneeuwman"],["🌌","Noorderlicht"]] },
};
function currentSeason() {
  const now = new Date(), month = now.getMonth(), year = now.getFullYear();
  const id = month >= 2 && month <= 4 ? "spring" : month >= 5 && month <= 7 ? "summer" : month >= 8 && month <= 10 ? "autumn" : "winter";
  const seasonYear = id === "winter" && month === 11 ? year + 1 : year;
  return { id, key:`${id}-${seasonYear}`, ...seasonWorlds[id] };
}
function addSeasonProgress(gameId) {
  const season = currentSeason();
  const progress = state.progress.seasons[season.key] ||= { games:[], rewards:[] };
  if (!progress.games.includes(gameId)) progress.games.push(gameId);
  const newlyUnlocked = [];
  [3,6,10].forEach((target,index) => {
    const rewardKey = `reward-${target}`;
    if (progress.games.length >= target && !progress.rewards.includes(rewardKey)) {
      progress.rewards.push(rewardKey);
      state.progress.stars += 1;
      newlyUnlocked.push(season.rewards[index][1]);
    }
  });
  return newlyUnlocked;
}
function renderSeasonWorld() {
  const season = currentSeason();
  const progress = state.progress.seasons[season.key] ||= { games:[], rewards:[] };
  document.body.dataset.season = season.id;
  $("#season-title").textContent = season.title;
  $("#season-description").textContent = season.description;
  $("#season-eyebrow").textContent = `${season.id === "spring" ? "LENTE" : season.id === "summer" ? "ZOMER" : season.id === "autumn" ? "HERFST" : "WINTER"} · SEIZOENSWERELD`;
  const count = Math.min(progress.games.length,10);
  $("#season-progress").style.width = `${count * 10}%`;
  $(".season-progress-track").setAttribute("aria-valuenow",String(count));
  $("#season-missions").innerHTML = [3,6,10].map((target,index) => {
    const unlocked = progress.games.length >= target;
    const [icon,name] = season.rewards[index];
    return `<div class="season-mission ${unlocked ? "" : "locked"}"><span>${unlocked ? icon : "🔒"}</span><div><strong>${name}</strong><small>${unlocked ? "Ontdekt!" : `${count} / ${target} spellen`}</small></div></div>`;
  }).join("");
  const archived = Object.values(state.progress.seasons).filter(item => item?.rewards?.length).reduce((sum,item) => sum + item.rewards.length,0);
  $("#season-archive-count").textContent = archived ? `Je bewaart ${archived} seizoensbeloning${archived === 1 ? "" : "en"} in je verzameling.` : "Je eerste seizoensbeloning wacht na drie verschillende spellen.";
}

const tournamentStorageKey = "speelplaneet-family-tournament";
const tournamentGames = ["sudoku","memory","mastermind","rekensprint","simon","woordzoeker"];
function saveTournament() {
  if (state.tournament) sessionStorage.setItem(tournamentStorageKey, JSON.stringify(state.tournament));
  else sessionStorage.removeItem(tournamentStorageKey);
}
function tournamentGameForRound(round) {
  return tournamentGames[round % tournamentGames.length];
}
function renderTournamentDialog() {
  const tournament = state.tournament;
  $("#tournament-setup").classList.toggle("hidden", Boolean(tournament));
  $("#tournament-status").classList.toggle("hidden", !tournament);
  if (!tournament) return;
  const finished = tournament.round >= tournament.rounds;
  $("#tournament-scoreboard").innerHTML = tournament.players.map(name =>
    `<div class="tournament-score"><strong>${name}</strong><span>☄️ ${tournament.scores[name] || 0}</span></div>`).join("");
  const nextPlayer = tournament.players[tournament.round % tournament.players.length];
  const nextGame = games.find(game => game.id === tournamentGameForRound(tournament.round));
  $("#tournament-player-avatar").textContent = finished ? "🏆" : nextPlayer.slice(0,1);
  $("#tournament-round-label").textContent = finished ? "TOERNOOI VOLTOOID" : `RONDE ${tournament.round + 1} VAN ${tournament.rounds}`;
  $("#tournament-next-player").textContent = finished ? "Samen de finish gehaald!" : `${nextPlayer} is aan de beurt`;
  $("#tournament-next-game").textContent = finished
    ? "Goed gespeeld! Alle kometenpunten horen bij deze vrolijke toernooimissie."
    : `Geef het toestel door. De volgende uitdaging is ${nextGame.title}.`;
  $("#tournament-next").classList.toggle("hidden", finished);
  $("#stop-tournament").textContent = finished ? "Toernooi afsluiten" : "Toernooi stoppen";
}
function openTournamentDialog() {
  renderTournamentDialog();
  $("#tournament-dialog").showModal();
}
function finishTournamentRound(gameId) {
  const tournament = state.tournament;
  if (!tournament || tournamentGameForRound(tournament.round) !== gameId) return false;
  const player = tournament.players[tournament.round % tournament.players.length];
  tournament.scores[player] = (tournament.scores[player] || 0) + 1;
  tournament.round += 1;
  addFamilyStar();
  saveTournament();
  renderTournamentDialog();
  $("#tournament-dialog").showModal();
  return true;
}

function scheduleProgressSync() {
  if (!state.authToken) return;
  clearTimeout(state.syncTimer);
  setSyncStatus("Synchroniseren…");
  state.syncTimer = setTimeout(async () => {
    try {
      const response = await fetch("/api/progress", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.authToken}` },
        body: JSON.stringify({ progress: state.progress }),
      });
      if (!response.ok) throw new Error("sync");
      const data = await response.json();
      setParentSettings(data.settings);
      setSyncStatus("Gesynchroniseerd", true);
    } catch {
      setSyncStatus("Offline bewaard");
    }
  }, 500);
}

async function refreshCloudProgress() {
  if (!state.authToken) return;
  try {
    const response = await fetch("/api/progress", { headers: { Authorization: `Bearer ${state.authToken}` } });
    if (response.status === 401) {
      state.authToken = "";
      localStorage.removeItem("speelplaneet-auth-token");
      return setSyncStatus("Op dit apparaat");
    }
    if (!response.ok) throw new Error("sync");
    const data = await response.json();
    state.progress = mergeProgress(state.progress, data.progress);
    setParentSettings(data.settings);
    localStorage.setItem("speelplaneet-progress", JSON.stringify(state.progress));
    setSyncStatus("Gesynchroniseerd", true);
    if (!homeScreen.classList.contains("hidden")) renderHome();
    scheduleProgressSync();
  } catch {
    setSyncStatus("Offline bewaard");
  }
}

function unlockedLevel(gameId = state.activeGame) {
  if (levelTestMode) return 100;
  return Math.min(100, Math.max(1, state.progress.levels[gameId] || 1));
}

function gameLevel(gameId = state.activeGame) {
  const unlocked = unlockedLevel(gameId);
  return Math.min(unlocked, Math.max(1, state.selectedLevels[gameId] || unlocked));
}

function difficultyBand(level) {
  if (level <= 20) return "Ontdekker";
  if (level <= 40) return "Speurneus";
  if (level <= 60) return "Avonturier";
  if (level <= 80) return "Expert";
  return "Kampioen";
}

function levelSeed(gameId, level = gameLevel(gameId)) {
  let hash = 2166136261;
  for (const char of `${gameId}-${level}-speelplaneet`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function levelRng(gameId, level = gameLevel(gameId)) {
  let seed = levelSeed(gameId, level);
  return () => {
    seed += 0x6D2B79F5;
    let value = seed;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function shuffled(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function missionCode(gameId, level = gameLevel(gameId)) {
  return `${gameId.slice(0, 3).toUpperCase()}-${String(level).padStart(3, "0")}-${levelSeed(gameId, level).toString(36).slice(-3).toUpperCase()}`;
}

function addLevelBar(gameId) {
  const panel = stage.querySelector(".game-panel");
  if (!panel) return;
  const level = gameLevel(gameId);
  const unlocked = unlockedLevel(gameId);
  panel.querySelector(".game-level-bar")?.remove();
  panel.insertAdjacentHTML("afterbegin", `<div class="game-level-bar">
    <button class="level-nav-button" data-level-prev aria-label="Vorig niveau" ${level <= 1 ? "disabled" : ""}>←</button>
    <label class="level-select-wrap"><small>NIVEAU</small>
      <select data-level-select aria-label="Kies niveau">${Array.from({length:unlocked},(_,index)=>`<option value="${index+1}" ${index+1===level?"selected":""}>${index+1} / 100</option>`).join("")}</select>
    </label>
    <span>${difficultyBand(level)}</span>
    ${[10,25,50,75,100].includes(level) ? '<strong class="milestone-badge">🏅 MIJLPAAL</strong>' : ""}
    <small class="mission-code" title="Unieke levelcode">${missionCode(gameId, level)}</small>
    <div class="level-dots">${[20,40,60,80,100].map(mark => `<i class="${level >= mark ? "reached" : ""}"></i>`).join("")}</div>
    <button class="level-nav-button level-next-button" data-level-next ${level >= unlocked ? "disabled" : ""}>Volgende →</button>
    ${levelTestMode ? '<strong class="level-test-badge">TESTMODUS</strong>' : ""}
  </div>`);
  const milestone = SpeelplaneetLevels.milestone(level);
  if (milestone) panel.querySelector(".game-level-bar").insertAdjacentHTML("afterend",
    `<div class="milestone-mission"><strong>🏅 ${milestone.title}</strong><span>${milestone.description}</span><small>Eerste voltooiing: 2 bonussterren</small></div>`);
  panel.querySelector("[data-level-prev]").addEventListener("click", () => {
    state.selectedLevels[gameId] = Math.max(1, gameLevel(gameId) - 1);
    openGame(gameId);
  });
  panel.querySelector("[data-level-next]").addEventListener("click", () => {
    state.selectedLevels[gameId] = Math.min(unlockedLevel(gameId), gameLevel(gameId) + 1);
    openGame(gameId);
  });
  panel.querySelector("[data-level-select]").addEventListener("change", event => {
    state.selectedLevels[gameId] = Number(event.target.value);
    openGame(gameId);
  });
  renderAdaptiveHelp(gameId, panel);
}

const adaptiveTips = {
  zeeslag:"Probeer in een dambordpatroon te schieten. Zo vind je lange schepen met minder schoten.",
  galgje:"Begin met klinkers zoals A, E en O en kijk daarna welke lettercombinaties bij de hint passen.",
  sudoku:"Zoek eerst de rij, kolom of het blok waarin al de meeste cijfers staan.",
  woordzoeker:"Zoek eerst de beginletter en kijk daarna horizontaal, verticaal en schuin.",
  memory:"Noem ieder symbool zachtjes en onthoud samen met de plek ook de rij.",
  vieropeenrij:"Kijk vóór je zet of jij kunt winnen én of je een rij van de tegenstander moet blokkeren.",
  boterkaaseieren:"Het middelste vak en de hoeken geven meestal de meeste mogelijkheden.",
  mastermind:"Verander één kleur tegelijk. Zo ontdek je welke wijziging de aanwijzing beter maakt.",
  rekensprint:"Splits een moeilijke som op in een gemakkelijk tiental en het stukje dat overblijft.",
  simon:"Zeg de kleuren in een ritme hardop; korte groepjes zijn makkelijker te onthouden.",
  ruimterunner:"Spring iets vóór de robot bij je is en laat de knop daarna los om rustig te landen.",
  doolhof:"Kijk welke muur open is en probeer eerst één richting rustig te volgen. Je kunt altijd terug.",
};
function supportEntry(gameId) {
  return state.progress.support[gameId] ||= { streak:0,hints:0,updatedAt:0 };
}
function recordUnfinishedAttempt(gameId) {
  if (!gameId || state.levelCompleted || state.tournament) return;
  const support = supportEntry(gameId);
  support.streak = Math.min(10,support.streak + 1);
  support.updatedAt = Date.now();
  saveProgress();
}
function noteStruggle(gameId) {
  if (state.tournament) return;
  const support = supportEntry(gameId);
  support.streak = Math.min(10,support.streak + 1);
  support.updatedAt = Date.now();
  saveProgress();
  const panel = stage.querySelector(".game-panel");
  if (panel) renderAdaptiveHelp(gameId,panel);
}
function renderAdaptiveHelp(gameId,panel) {
  const support = supportEntry(gameId);
  if (support.streak < 2) return;
  const automaticTip = support.streak >= 4;
  panel.querySelector(".adaptive-help")?.remove();
  panel.querySelector(".game-level-bar")?.insertAdjacentHTML("afterend",`<aside class="adaptive-help" aria-live="polite">
    <span>🛟</span><div><strong>${automaticTip ? "Extra hulp staat klaar" : "Zullen we samen even kijken?"}</strong>
    <p>${automaticTip ? adaptiveTips[gameId] : "Je hoeft niet te haasten. Een kleine tip kan helpen zonder je niveau te veranderen."}</p></div>
    ${automaticTip ? "" : '<button class="mini-button" type="button" data-adaptive-hint>Geef me een tip</button>'}
  </aside>`);
  panel.querySelector("[data-adaptive-hint]")?.addEventListener("click",event => {
    event.currentTarget.remove();
    const paragraph = panel.querySelector(".adaptive-help p");
    paragraph.textContent = adaptiveTips[gameId];
    support.hints += 1; support.updatedAt = Date.now(); saveProgress();
    if (accessibility.speech && "speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance(adaptiveTips[gameId]));
  });
}

function toast(message) {
  const box = $("#toast");
  box.textContent = message;
  box.classList.add("show");
  playUiSound();
  setTimeout(() => box.classList.remove("show"), 2500);
}

async function initializeOnline() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) return;
    const config = await response.json();
    if (config.supabaseUrl && config.supabaseAnonKey && window.supabase) {
      state.supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      await handlePendingInvite();
    }
  } catch {
    // De site blijft volledig speelbaar als de online dienst niet bereikbaar is.
  }
}

async function handlePendingInvite() {
  if (
    state.inviteHandled ||
    !state.player ||
    !state.supabase ||
    state.parentSettings?.paused ||
    !["zeeslag", "galgje", "vieropeenrij", "boterkaaseieren"].includes(pendingInvite.game) ||
    !/^[A-Z]{3}-[0-9]{3}$/i.test(pendingInvite.code || "")
  ) return;
  state.inviteHandled = true;
  openGame(pendingInvite.game);
  if (pendingInvite.game === "zeeslag" && state.battleshipJoin) {
    await state.battleshipJoin(pendingInvite.code);
  } else if (state.turnGameJoin) {
    await state.turnGameJoin(pendingInvite.code);
  } else {
    state.inviteHandled = false;
    return;
  }
  if (state.room) {
    document.querySelector("[data-room-details]")?.classList.remove("hidden");
    window.history.replaceState({}, "", window.location.pathname);
  } else {
    state.inviteHandled = false;
  }
}

function makeJoinCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const part = Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
  return `${part}-${Math.floor(100 + Math.random() * 900)}`;
}

async function leaveRoom() {
  if (state.roomChannel && state.supabase) await state.supabase.removeChannel(state.roomChannel);
  state.roomChannel = null;
  state.room = null;
  state.roomListener = null;
}

async function watchRoom(room) {
  if (!state.supabase) return;
  if (state.roomChannel) await state.supabase.removeChannel(state.roomChannel);
  state.room = room;
  state.roomChannel = state.supabase
    .channel(`room-${room.id}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "multiplayer_rooms", filter: `id=eq.${room.id}` }, payload => {
      state.room = payload.new;
      updateRoomPanel(payload.new);
      if (state.roomListener) state.roomListener(payload.new.game_state);
    })
    .subscribe();
  updateRoomPanel(room);
}

async function createRoom(gameType, gameState) {
  if (!state.supabase) return toast("Online spelen is nog niet verbonden met Supabase.");
  const room = {
    join_code: makeJoinCode(),
    game_type: gameType,
    host_id: state.sessionId,
    host_name: state.player.name,
    status: "waiting",
    game_state: gameState,
  };
  const { data, error } = await state.supabase.from("multiplayer_rooms").insert(room).select().single();
  if (error) return toast("Kamer maken lukt nog niet. Controleer het databaseschema.");
  await watchRoom(data);
  toast("Kamer klaar! Deel de joincode.");
}

async function joinRoom(code, gameType) {
  if (!state.supabase) return toast("Online spelen is nog niet verbonden met Supabase.");
  const normalized = code.trim().toUpperCase();
  const { data, error } = await state.supabase
    .from("multiplayer_rooms")
    .select("*")
    .eq("join_code", normalized)
    .eq("game_type", gameType)
    .maybeSingle();
  if (error || !data) return toast("Deze kamer bestaat niet of hoort bij een ander spel.");
  if (data.host_id === state.sessionId) {
    await watchRoom(data);
    return toast("Je eigen kamer is weer geopend.");
  }
  if (data.guest_id && data.guest_id !== state.sessionId) return toast("Deze kamer heeft al twee spelers.");
  const { data: joined, error: joinError } = await state.supabase
    .from("multiplayer_rooms")
    .update({ guest_id: state.sessionId, guest_name: state.player.name, status: "playing" })
    .eq("id", data.id)
    .select()
    .single();
  if (joinError) return toast("Deelnemen lukt niet. Probeer opnieuw.");
  await watchRoom(joined);
  if (state.roomListener) state.roomListener(joined.game_state);
  toast(`Je speelt nu samen met ${joined.host_name}!`);
}

async function syncGameState(gameState) {
  if (!state.supabase || !state.room) return;
  const { data, error } = await state.supabase
    .from("multiplayer_rooms")
    .update({ game_state: gameState, updated_at: new Date().toISOString() })
    .eq("id", state.room.id)
    .select()
    .single();
  if (!error) state.room = data;
}

function updateRoomPanel(room) {
  const code = document.querySelector("[data-room-code]");
  const status = document.querySelector("[data-room-status]");
  if (code) code.textContent = room.join_code;
  if (status) status.textContent = room.guest_name
    ? `${room.host_name} speelt samen met ${room.guest_name}`
    : "Wachten op de tweede speler…";
}

function showDashboard() {
  loginView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  $("#profile-name").textContent = state.player.name;
  $("#avatar").textContent = state.player.name[0].toUpperCase();
  setSyncStatus(state.authToken ? "Synchroniseren…" : "Op dit apparaat", false);
  renderHome();
  const testGame = inviteParams.get("game");
  const testLevel = Number(inviteParams.get("level"));
  if (!levelTestOpened && levelTestMode && games.some(game => game.id === testGame) && testLevel >= 1 && testLevel <= 100) {
    levelTestOpened = true;
    state.selectedLevels[testGame] = Math.floor(testLevel);
    openGame(testGame);
  }
}

function renderHome() {
  if (!gameScreen.classList.contains("hidden")) recordUnfinishedAttempt(state.activeGame);
  if (state.gameCleanup) {
    state.gameCleanup();
    state.gameCleanup = null;
  }
  clearGamePause();
  homeScreen.classList.remove("hidden");
  gameScreen.classList.add("hidden");
  const stars = state.progress.stars || 0;
  const level = Math.floor(stars / 5) + 1;
  const titles = ["Ruimteverkenner", "Sterrenzoeker", "Planeetpiloot", "Kosmische kampioen"];
  $("#header-stars").textContent = stars;
  $("#level-number").textContent = level;
  $("#level-title").textContent = titles[Math.min(level - 1, titles.length - 1)];
  $("#progress-stars").textContent = stars % 5;
  $("#level-progress").style.width = `${(stars % 5) * 20}%`;
  const today = localDateKey(new Date());
  const dailyDone = (state.progress.activity[today] || []).length;
  const weeklyDone = recentActivityKeys(7).reduce((sum, key) => sum + (state.progress.activity[key] || []).length, 0);
  $("#daily-count").textContent = `${Math.min(dailyDone, 2)} / 2`;
  $("#weekly-count").textContent = `${Math.min(weeklyDone, 7)} / 7`;
  $("#daily-mission-text").textContent = state.progress.missionClaims.includes(`daily-${today}`) ? "Bonusster verdiend — morgen verschijnt een nieuwe missie." : "Verdien een bonusster zonder tijdsdruk.";
  const weekClaim = `weekly-${weekKey(new Date())}`;
  $("#weekly-mission-text").textContent = state.progress.missionClaims.includes(weekClaim) ? "Drie bonussterren verdiend!" : "Verdien drie bonussterren deze week.";
  renderFamilyChallenge();
  renderSeasonWorld();
  const rewards = [
    ["🪖","Ruimtehelm",5],["🌙","Maan",15],["🏅","Sterrenmedaille",30],["🛸","Ruimteschip",50],
    ["🪐","Ringplaneet",75],["👨‍🚀","Gouden ruimtepak",100],["🏆","Kosmische trofee",150],["🌌","Eigen sterrenstelsel",250],
  ];
  $("#reward-shelf").innerHTML = rewards.map(([icon,name,needed]) => `<div class="${stars >= needed ? "unlocked" : "locked"}"><span>${stars >= needed ? icon : "🔒"}</span><strong>${name}</strong><small>${stars >= needed ? "Ontdekt!" : `${needed} sterren`}</small></div>`).join("");
  const continueButton = $("#continue-game");
  const recent = games.find(game => game.id === state.progress.recentGame);
  continueButton.classList.toggle("hidden", !recent);
  if (recent) continueButton.textContent = `Verder met ${recent.title}`;
  const gameStats = gameId => {
    const stats = state.progress.stats[gameId];
    if (!stats?.attempts) return "";
    const minutes = Math.round((stats.totalSeconds || 0) / 60);
    const success = Math.round(((stats.wins || 0) / stats.attempts) * 100);
    return `<small class="game-stat">${stats.wins || 0} voltooid · ${stats.attempts} pogingen · ${success}% succes · ${minutes} min</small>`;
  };
  const categories = ["Alles","Taal","Rekenen","Puzzels","Geheugen","Samen","Actie"];
  $("#category-filters").innerHTML = categories.map(category => `<button class="${state.category === category ? "active" : ""}" data-category="${category}">${category}</button>`).join("");
  document.querySelectorAll("[data-category]").forEach(button => button.addEventListener("click", () => { state.category=button.dataset.category;renderHome(); }));
  if (state.parentSettings?.paused) {
    $("#game-grid").innerHTML = `<div class="paused-profile-card"><span>⏸️</span><div><h3>Dit profiel is gepauzeerd</h3><p>Een ouder kan het profiel weer vrijgeven via Ouderomgeving.</p></div></div>`;
    return;
  }
  const orderedGames = games.filter(game => state.category === "Alles" || gameCategories[game.id] === state.category)
    .sort((left,right) => Number(state.progress.favorites.includes(right.id)) - Number(state.progress.favorites.includes(left.id)));
  $("#game-grid").innerHTML = orderedGames.map(game => `
    <div class="game-card-wrap">
    <button class="favorite-button ${state.progress.favorites.includes(game.id) ? "active" : ""}" data-favorite="${game.id}" aria-label="${state.progress.favorites.includes(game.id) ? "Verwijder uit" : "Voeg toe aan"} favorieten">★</button>
    <button class="game-card" data-game="${game.id}" aria-label="Speel ${game.title}">
      <div class="game-icon icon-${game.color}">${game.icon}</div>
      <h4>${game.title}</h4>
      <p>${game.description}</p>
      ${gameStats(game.id)}
      <div class="card-footer"><span>${game.modes}</span><span class="play-arrow">→</span></div>
    </button></div>`).join("");
  document.querySelectorAll("[data-game]").forEach(button => {
    button.addEventListener("click", () => openGame(button.dataset.game));
  });
  document.querySelectorAll("[data-favorite]").forEach(button => button.addEventListener("click", () => {
    const id = button.dataset.favorite;
    state.progress.favorites = state.progress.favorites.includes(id)
      ? state.progress.favorites.filter(gameId => gameId !== id)
      : [...state.progress.favorites, id];
    state.progress.favoritesUpdatedAt = Date.now();
    saveProgress(); renderHome();
  }));
}

function completeGame(gameId, message) {
  if (state.levelCompleted) return;
  state.levelCompleted = true;
  if (finishTournamentRound(gameId)) {
    toast(`${message} ☄️ Kometenpunt verdiend voor het gezinstoernooi!`);
    return;
  }
  const adaptiveSupport = supportEntry(gameId);
  adaptiveSupport.streak = 0;
  adaptiveSupport.updatedAt = Date.now();
  state.progress.stars += 1;
  state.progress.completed.push(gameId);
  state.progress.gameWins[gameId] = (state.progress.gameWins[gameId] || 0) + 1;
  const today = localDateKey(new Date());
  state.progress.activity[today] ||= [];
  if (!state.progress.activity[today].includes(gameId)) state.progress.activity[today].push(gameId);
  let missionBonus = 0;
  if (state.progress.activity[today].length >= 2 && !state.progress.missionClaims.includes(`daily-${today}`)) {
    state.progress.missionClaims.push(`daily-${today}`); missionBonus += 1;
  }
  const weekClaim = `weekly-${weekKey(new Date())}`;
  const weeklyDone = recentActivityKeys(7).reduce((sum,key) => sum + (state.progress.activity[key] || []).length, 0);
  if (weeklyDone >= 7 && !state.progress.missionClaims.includes(weekClaim)) {
    state.progress.missionClaims.push(weekClaim); missionBonus += 3;
  }
  state.progress.stars += missionBonus;
  const familyStars = addFamilyStar();
  const seasonRewards = addSeasonProgress(gameId);
  const completedLevel = gameLevel(gameId);
  const stats = state.progress.stats[gameId] ||= { attempts:0, wins:0, totalSeconds:0 };
  stats.wins++;
  stats.totalSeconds += Math.max(1, Math.round((Date.now() - state.playStartedAt) / 1000));
  const milestoneKey = `${gameId}-${completedLevel}`;
  const milestone = [10,25,50,75,100].includes(completedLevel) && !state.progress.milestoneAwards.includes(milestoneKey);
  if (milestone) {
    state.progress.milestoneAwards.push(milestoneKey);
    state.progress.stars += 2;
  }
  const previouslyUnlocked = unlockedLevel(gameId);
  state.selectedLevels[gameId] = completedLevel;
  if (completedLevel >= previouslyUnlocked) state.progress.levels[gameId] = Math.min(100, previouslyUnlocked + 1);
  saveProgress();
  addLevelBar(gameId);
  toast(missionBonus ? `${message} ☀️ Missiebonus: ${missionBonus} extra ster${missionBonus === 1 ? "" : "ren"}!`
    : milestone ? `${message} 🏅 Mijlpaal gehaald: 3 sterren verdiend!`
    : seasonRewards.length ? `${message} ${seasonRewards[0]} Nieuwe seizoensbeloning ontdekt!`
    : [5,12,20].includes(familyStars) ? `${message} 🚀 Jullie gezin heeft samen een nieuwe beloning ontdekt!`
    : completedLevel < 100 && completedLevel >= previouslyUnlocked
    ? `${message} ⭐ Niveau ${completedLevel + 1} vrijgespeeld — tik op Volgende!`
    : `${message} ⭐ Goed gespeeld!`);
}

function openGame(id) {
  if (state.parentSettings?.paused) return toast("Dit profiel is door een ouder gepauzeerd.");
  if (!gameScreen.classList.contains("hidden")) recordUnfinishedAttempt(state.activeGame);
  if (state.gameCleanup) {
    state.gameCleanup();
    state.gameCleanup = null;
  }
  clearGamePause();
  leaveRoom();
  state.activeGame = id;
  state.progress.recentGame = id;
  state.progress.recentGameUpdatedAt = Date.now();
  state.playStartedAt = Date.now();
  state.levelCompleted = false;
  if (!levelTestMode && !state.tournament) {
    const stats = state.progress.stats[id] ||= { attempts:0, wins:0, totalSeconds:0 };
    stats.attempts++;
    saveProgress();
  }
  homeScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  if (id === "galgje") renderHangman();
  if (id === "sudoku") renderSudoku();
  if (id === "woordzoeker") renderWordSearch();
  if (id === "zeeslag") renderBattleship();
  if (id === "memory") renderMemory();
  if (id === "vieropeenrij") renderConnectFour();
  if (id === "boterkaaseieren") renderTicTacToe();
  if (id === "mastermind") renderMastermind();
  if (id === "rekensprint") renderMathSprint();
  if (id === "simon") renderSimon();
  if (id === "ruimterunner") renderSpaceRunner();
  if (id === "doolhof") renderMaze();
  if (state.tournament && tournamentGameForRound(state.tournament.round) === id) {
    const tournamentPlayer = state.tournament.players[state.tournament.round % state.tournament.players.length];
    stage.insertAdjacentHTML("afterbegin", `<div class="tournament-game-banner" role="status"><span>☄️</span><div><small>GEZINSTOERNOOI · RONDE ${state.tournament.round + 1} VAN ${state.tournament.rounds}</small><strong>${tournamentPlayer} speelt deze ronde</strong></div></div>`);
  }
  addLevelBar(id);
  if (accessibility.speech && "speechSynthesis" in window) {
    speechSynthesis.cancel();
    const game = games.find(item => item.id === id);
    speechSynthesis.speak(new SpeechSynthesisUtterance(`${game.title}. ${game.description}`));
  }
  if (!localStorage.getItem(`speelplaneet-tutorial-${id}`)) {
    const tutorials = {
      zeeslag:"Plaats eerst alle vijf schepen. Schiet daarna om de beurt op het bord van je tegenstander.",
      galgje:"Tik letters aan om samen het verborgen woord te ontdekken. De hint helpt je op weg.",
      sudoku:"Vul 1 tot en met 4 precies één keer in iedere rij, kolom en ieder blok.",
      woordzoeker:"Tik de letters van elk woord achter elkaar aan. Woorden kunnen verschillende richtingen uitgaan.",
      memory:"Draai twee kaartjes om en onthoud waar ieder ruimtesymbool ligt.",
      vieropeenrij:"Kies een kolom en maak eerder dan je tegenstander een rij van vier.",
      boterkaaseieren:"Maak met jouw teken als eerste drie op een rij.",
      mastermind:"Kies een kleurcode en gebruik de gouden en witte aanwijzingen.",
      rekensprint:"Vul het antwoord in en druk op Controleer. Rustig nadenken mag.",
      simon:"Bekijk de lichtjes en tik daarna precies dezelfde reeks.",
      ruimterunner:"Spring over robots en buk onder ufo's. De snelheid groeit heel geleidelijk.",
      doolhof:"Breng de raket naar de planeet. Gebruik de pijlen of veeg niet: één rustige tik per stap werkt het best.",
    };
    $("#tutorial-title").textContent = `Zo speel je ${games.find(game => game.id === id)?.title}`;
    $("#tutorial-text").textContent = tutorials[id];
    $("#tutorial-dialog").dataset.game = id;
    $("#tutorial-dialog").showModal();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("#continue-game").addEventListener("click", () => {
  if (state.progress.recentGame) openGame(state.progress.recentGame);
});
try { state.tournament = JSON.parse(sessionStorage.getItem(tournamentStorageKey) || "null"); } catch { state.tournament = null; }
$("#family-tournament").addEventListener("click", openTournamentDialog);
$("#close-tournament").addEventListener("click", () => $("#tournament-dialog").close());
$("#start-tournament").addEventListener("click", () => {
  const players = [...document.querySelectorAll('[name="tournament-player"]:checked')].map(input => input.value);
  if (players.length < 2) return toast("Kies minstens twee spelers voor het gezinstoernooi.");
  const rounds = Number($("#tournament-rounds").value);
  state.tournament = { players, rounds, round:0, scores:Object.fromEntries(players.map(name => [name,0])) };
  saveTournament();
  renderTournamentDialog();
});
$("#tournament-next").addEventListener("click", () => {
  if (!state.tournament || state.tournament.round >= state.tournament.rounds) return;
  const gameId = tournamentGameForRound(state.tournament.round);
  $("#tournament-dialog").close();
  openGame(gameId);
});
$("#stop-tournament").addEventListener("click", () => {
  state.tournament = null;
  saveTournament();
  $("#tournament-dialog").close();
  renderHome();
});

function sidePanel(title, text, code = true) {
  const multiplayerDisabled = code && state.parentSettings?.multiplayerEnabled === false;
  return `<aside class="side-panel">
    <p class="eyebrow">SAMEN SPELEN</p><h3>${title}</h3><p>${text}</p>
    ${multiplayerDisabled ? '<div class="online-disabled">🔒 Online samenspelen is uitgeschakeld in de ouderomgeving.</div>' : code ? `<div class="online-actions">
      <button class="mini-button" data-create-room>Maak een kamer</button>
      <span class="online-or">of</span>
      <div class="join-form"><input data-join-input maxlength="7" placeholder="ABC-123" aria-label="Joincode" /><button data-join-room>Meedoen</button></div>
      <div class="room-details hidden" data-room-details>
        <small>JOUW JOINCODE</small>
        <div class="join-code" data-room-code>---</div>
        <button class="mini-button" data-copy-room>Kopieer joincode</button>
        <button class="whatsapp-button" data-share-whatsapp>Deel via WhatsApp</button>
        <button class="mini-button hidden" data-forfeit>Geef deze partij op</button>
        <button class="mini-button hidden" data-rematch>Speel een revanche</button>
        <div class="connection-status" data-connection-status><i></i><span>Verbonden</span></div>
        <p class="online-status" data-room-status>Wachten op de tweede speler…</p>
      </div>
    </div>` : ""}
  </aside>`;
}

function wireMultiplayer(gameType, getGameState, applyGameState) {
  state.roomListener = applyGameState;
  const create = document.querySelector("[data-create-room]");
  const join = document.querySelector("[data-join-room]");
  const copy = document.querySelector("[data-copy-room]");
  const share = document.querySelector("[data-share-whatsapp]");
  if (!create) return;
  create.addEventListener("click", async () => {
    await createRoom(gameType, getGameState());
    if (state.room) document.querySelector("[data-room-details]").classList.remove("hidden");
  });
  join.addEventListener("click", async () => {
    await joinRoom(document.querySelector("[data-join-input]").value, gameType);
    if (state.room) document.querySelector("[data-room-details]").classList.remove("hidden");
  });
  copy.addEventListener("click", async () => {
    const roomCode = document.querySelector("[data-room-code]").textContent;
    try { await navigator.clipboard.writeText(roomCode); } catch {}
    toast("Joincode gekopieerd!");
  });
  share.addEventListener("click", () => {
    if (!state.room) return;
    const invitationUrl = `https://speelplaneet.vercel.app/?game=${encodeURIComponent(gameType)}&code=${encodeURIComponent(state.room.join_code)}`;
    const gameNames = { zeeslag: "Zeeslag", galgje: "Galgje", vieropeenrij: "Vier op een rij", boterkaaseieren: "Boter-kaas-en-eieren" };
    const gameName = gameNames[gameType] || "een spel";
    const message = `Kom je ${gameName} met mij spelen op Speelplaneet? Open deze link en je komt meteen in mijn spel: ${invitationUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  });
}

function wireBattleshipMultiplayer(getFleet, applyGameState) {
  const create = document.querySelector("[data-create-room]");
  const join = document.querySelector("[data-join-room]");
  const copy = document.querySelector("[data-copy-room]");
  const share = document.querySelector("[data-share-whatsapp]");
  const forfeit = document.querySelector("[data-forfeit]");
  const rematch = document.querySelector("[data-rematch]");
  let pollTimer = 0;
  const request = async (method, body) => {
    if (!state.authToken) throw new Error("LOGIN_REQUIRED");
    const url = method === "GET" ? `/api/battleship?id=${encodeURIComponent(body.id)}` : "/api/battleship";
    const response = await fetch(url, {
      method,
      headers:{ "Content-Type":"application/json", Authorization:`Bearer ${state.authToken}` },
      body:method === "GET" ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(()=>({}));
    if (!response.ok) { const error=new Error(data.error||"BATTLESHIP_FAILED");error.code=data.error;throw error; }
    data.room.serverBattleship = true;
    return data.room;
  };
  const accept = room => {
    state.room = room;
    updateRoomPanel(room);
    document.querySelector("[data-room-details]")?.classList.remove("hidden");
    applyGameState(room.game_state);
    const finished = room.game_state.phase === "finished";
    forfeit?.classList.toggle("hidden", finished || !room.guest_id);
    rematch?.classList.toggle("hidden", !finished || !room.guest_id);
    if (finished && room.game_state.rematchReady?.[room.role]) {
      rematch.textContent = "Wachten op akkoord…";
      rematch.disabled = true;
    } else if (rematch) {
      rematch.textContent = "Speel een revanche";
      rematch.disabled = false;
    }
  };
  const startPolling = () => {
    clearInterval(pollTimer);
    pollTimer = setInterval(async()=>{
      if(!state.room?.serverBattleship)return;
      try {
        const room=await request("GET",{id:state.room.id});
        if(room.revision!==state.room.revision)accept(room);
        document.querySelector("[data-connection-status]")?.classList.remove("offline");
      } catch {
        document.querySelector("[data-connection-status]")?.classList.add("offline");
      }
    },1200);
    state.gameCleanup=()=>{clearInterval(pollTimer);state.battleshipJoin=null;};
  };
  const errorMessage = error => ({
    LOGIN_REQUIRED:"Meld dit profiel online aan om samen te spelen.",
    ROOM_NOT_FOUND:"Deze kamer bestaat niet meer.",
    ROOM_FULL:"Deze kamer heeft al twee spelers.",
    STALE_STATE:"De spelstand veranderde. Probeer je zet opnieuw.",
    MULTIPLAYER_DISABLED:"Online samenspelen is uitgeschakeld in de ouderomgeving.",
  }[error.code]||"Online zeeslag lukt nu niet. Probeer opnieuw.");

  create.addEventListener("click",async()=>{
    try{
      const room=await request("POST",{action:"create"});
      accept(room);startPolling();toast("Veilige zeeslagkamer aangemaakt.");
      const fleet=getFleet();
      if(fleet.length===5){const placed=await request("POST",{action:"place",roomId:room.id,ships:fleet});accept(placed);}
    }catch(error){toast(errorMessage(error));}
  });
  const joinCode=async code=>{
    try{const room=await request("POST",{action:"join",code});accept(room);startPolling();toast(`Je speelt tegen ${room.host_name}.`);return true;}
    catch(error){toast(errorMessage(error));}
    return false;
  };
  state.battleshipJoin=joinCode;
  join.addEventListener("click",()=>joinCode(document.querySelector("[data-join-input]").value));
  copy.addEventListener("click",async()=>{if(!state.room)return;try{await navigator.clipboard.writeText(state.room.join_code);}catch{}toast("Joincode gekopieerd!");});
  share.addEventListener("click",()=>{if(!state.room)return;const url=`https://speelplaneet.vercel.app/?game=zeeslag&code=${encodeURIComponent(state.room.join_code)}`;const message=`Kom je Zeeslag met mij spelen op Speelplaneet? ${url}`;window.open(`https://wa.me/?text=${encodeURIComponent(message)}`,"_blank","noopener,noreferrer");});
  forfeit?.addEventListener("click", async () => {
    if (!window.confirm("Wil je deze partij echt opgeven?")) return;
    try { accept(await request("POST", { action:"forfeit", roomId:state.room.id })); toast("De partij is opgegeven."); }
    catch { toast("Opgeven lukt nu niet."); }
  });
  rematch?.addEventListener("click",async()=>{
    try {
      const room = await request("POST",{action:"rematch",roomId:state.room.id});
      accept(room);
      toast(room.game_state.phase === "placing" ? "Revanche gestart: plaats je vloot!" : "Wachten tot de andere speler ook akkoord gaat.");
    } catch { toast("Revanche aanvragen lukt nog niet."); }
  });
  return { request, accept };
}

function wireServerTurnGame(gameType, level, applyGameState) {
  const create = document.querySelector("[data-create-room]");
  const join = document.querySelector("[data-join-room]");
  const copy = document.querySelector("[data-copy-room]");
  const share = document.querySelector("[data-share-whatsapp]");
  const forfeit = document.querySelector("[data-forfeit]");
  const rematch = document.querySelector("[data-rematch]");
  let pollTimer = 0;
  const request = async (method, body) => {
    if (!state.authToken) throw Object.assign(new Error("LOGIN_REQUIRED"), { code: "LOGIN_REQUIRED" });
    const url = method === "GET" ? `/api/turn-game?id=${encodeURIComponent(body.id)}` : "/api/turn-game";
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.authToken}` },
      body: method === "GET" ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || "TURN_GAME_FAILED"), { code: data.error });
    return data.room;
  };
  const accept = room => {
    state.room = room;
    updateRoomPanel(room);
    document.querySelector("[data-room-details]")?.classList.remove("hidden");
    applyGameState(room.game_state);
    const finished = room.game_state.phase === "finished";
    forfeit?.classList.toggle("hidden", finished || !room.guest_id);
    rematch?.classList.toggle("hidden", !finished || !room.guest_id);
    if (finished && room.game_state.rematchReady?.[room.role]) {
      rematch.textContent = "Wachten op akkoord…";
      rematch.disabled = true;
    } else if (rematch) {
      rematch.textContent = "Speel een revanche";
      rematch.disabled = false;
    }
  };
  const startPolling = () => {
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      if (!state.room?.serverTurnGame) return;
      try {
        const room = await request("GET", { id: state.room.id });
        if (room.revision !== state.room.revision) accept(room);
        document.querySelector("[data-connection-status]")?.classList.remove("offline");
      } catch {
        document.querySelector("[data-connection-status]")?.classList.add("offline");
      }
    }, 1200);
    state.gameCleanup = () => { clearInterval(pollTimer); state.turnGameJoin = null; };
  };
  const messages = {
    LOGIN_REQUIRED: "Meld dit profiel online aan om samen te spelen.",
    ROOM_NOT_FOUND: "Deze kamer bestaat niet meer.",
    ROOM_FULL: "Deze kamer heeft al twee spelers.",
    NOT_YOUR_TURN: "De andere speler is eerst aan de beurt.",
    INVALID_MOVE: "Die zet kan niet meer.",
    GAME_FINISHED: "Deze ronde is al afgelopen.",
    OPPONENT_REQUIRED: "Wacht eerst tot de tweede speler meedoet.",
    REMATCH_UNAVAILABLE: "Een revanche kan pas na een gespeelde ronde.",
    MULTIPLAYER_DISABLED: "Online samenspelen is uitgeschakeld in de ouderomgeving.",
    STALE_STATE: "De spelstand veranderde. Probeer opnieuw.",
  };
  const showError = error => toast(messages[error.code] || "Online spelen lukt nu niet. Probeer opnieuw.");
  create?.addEventListener("click", async () => {
    try {
      accept(await request("POST", { action: "create", gameType, level }));
      startPolling();
      toast("Veilige spelkamer aangemaakt.");
    } catch (error) { showError(error); }
  });
  const joinCode = async code => {
    try {
      const room = await request("POST", { action: "join", gameType, code });
      accept(room);
      startPolling();
      toast(`Je speelt tegen ${room.host_name}.`);
      return true;
    } catch (error) { showError(error); }
    return false;
  };
  state.turnGameJoin = joinCode;
  join?.addEventListener("click", () => joinCode(document.querySelector("[data-join-input]").value));
  copy?.addEventListener("click", async () => {
    if (!state.room) return;
    try { await navigator.clipboard.writeText(state.room.join_code); } catch {}
    toast("Joincode gekopieerd!");
  });
  share?.addEventListener("click", () => {
    if (!state.room) return;
    const names = { galgje: "Galgje", vieropeenrij: "Vier op een rij", boterkaaseieren: "Boter-kaas-en-eieren" };
    const url = `https://speelplaneet.vercel.app/?game=${encodeURIComponent(gameType)}&code=${encodeURIComponent(state.room.join_code)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(`Kom je ${names[gameType]} met mij spelen op Speelplaneet? ${url}`)}`, "_blank", "noopener,noreferrer");
  });
  forfeit?.addEventListener("click", async () => {
    if (!window.confirm("Wil je deze partij echt opgeven?")) return;
    try {
      accept(await request("POST", { action: "forfeit", roomId: state.room.id }));
      toast("De partij is opgegeven.");
    } catch (error) { showError(error); }
  });
  rematch?.addEventListener("click", async () => {
    try {
      const room = await request("POST", { action: "rematch", roomId: state.room.id, level });
      accept(room);
      toast(room.game_state.phase === "playing" ? "De revanche is gestart!" : "Wachten tot de andere speler ook akkoord gaat.");
    } catch (error) { showError(error); }
  });
  return { request, accept };
}

function renderHangman() {
  const level = gameLevel("galgje");
  const contentLevel = state.parentSettings?.wordLevel === "basis" ? Math.min(level, 40)
    : state.parentSettings?.wordLevel === "gevorderd" ? Math.max(level, 41) : level;
  const words = [
    { word:"MAAN", hint:"Je ziet haar vaak ’s nachts aan de hemel." },
    { word:"STER", hint:"Een klein lichtpuntje hoog in de lucht." },
    { word:"ROBOT", hint:"Een machine die kan bewegen en opdrachten uitvoeren." },
    { word:"KASTEEL", hint:"Een groot gebouw waar vroeger koningen woonden." },
    { word:"DOLFIJN", hint:"Een slim zeedier dat graag uit het water springt." },
    { word:"VLINDER", hint:"Begint als rups en krijgt later mooie vleugels." },
    { word:"PLANEET", hint:"Een grote bol die rond een ster draait." },
    { word:"REGENBOOG", hint:"Verschijnt soms als de zon door regendruppels schijnt." },
    { word:"PANNENKOEK", hint:"Een ronde lekkernij uit de koekenpan." },
    { word:"VERREKIJKER", hint:"Hiermee kun je iets ver weg dichterbij bekijken." },
    { word:"RUIMTESCHIP", hint:"Vervoert astronauten buiten de aarde." },
    { word:"SCHATKAART", hint:"Laat zien waar een verborgen buit kan liggen." },
    { word:"ONTDEKKINGSREIZIGER", hint:"Iemand die op pad gaat om nieuwe plekken te vinden." }
  ];
  const meters = [
    { name:"Raketbrandstof", full:"●", empty:"○", intro:"Raad het woord voordat de raket vertrekt." },
    { name:"Ruimteschild", full:"◆", empty:"◇", intro:"Vind het woord en houd het ruimteschild sterk." },
    { name:"Sterrenkracht", full:"★", empty:"☆", intro:"Verzamel genoeg sterrenkracht om het woord te vinden." },
    { name:"Duiklucht", full:"●", empty:"○", intro:"Los het woord op voordat de duiklucht op is." },
    { name:"Toverkracht", full:"✦", empty:"·", intro:"Gebruik je letters voordat de toverkracht verdwijnt." },
    { name:"Zaklamplicht", full:"■", empty:"□", intro:"Vind het woord zolang je zaklamp nog schijnt." }
  ];
  const chosen = SpeelplaneetLevels.hangman(contentLevel);
  let word = chosen.word;
  let wordHint = chosen.hint;
  const meter = meters[(level - 1) % meters.length];
  let maxMistakes = Math.max(4, 8 - Math.floor((level - 1) / 25));
  const guessed = new Set();
  let mistakes = 0;
  let serverDisplay = null;
  let serverPhase = null;
  let serverWinner = null;
  let serverControls = null;
  let completionAwarded = false;
  let struggleNoted = false;
  stage.innerHTML = `<div class="game-layout">
    <div class="game-panel">
      <p class="eyebrow">WOORDSPEL</p><h2>🔤 Galgje</h2><p class="game-subtitle">${meter.intro}</p>
      <div class="hang-hint"><strong>💡 Hint</strong><span id="hang-hint-text">${wordHint}</span></div>
      <div class="status-box" id="hang-status">${meter.name}: <span>${meter.full.repeat(maxMistakes)}</span></div>
      <div class="word-display" id="hang-word"></div>
      <div class="letter-grid" id="letters"></div>
    </div>
    ${sidePanel("Nodig iemand uit", "Maak een kamer of vul de code van iemand anders in. Jullie raden samen hetzelfde woord.")}
  </div>`;
  const draw = () => {
    $("#hang-word").textContent = serverDisplay
      ? [...serverDisplay].join(" ")
      : [...word].map(letter => guessed.has(letter) ? letter : "_").join(" ");
    $("#hang-status").innerHTML = `${meter.name}: <span>${meter.full.repeat(maxMistakes - mistakes)}${meter.empty.repeat(mistakes)}</span>`;
    const won = serverPhase ? serverPhase === "finished" && serverWinner === "together" : [...word].every(letter => guessed.has(letter));
    if (won) {
      $("#hang-status").textContent = "Geweldig! Je hebt het woord gevonden.";
      if (!completionAwarded) {
        completionAwarded = true;
        completeGame("galgje", "Galgje opgelost!");
      }
      document.querySelectorAll(".letter-button").forEach(b => b.disabled = true);
    } else if ((serverPhase === "finished" && serverWinner === "lost") || mistakes >= maxMistakes) {
      $("#hang-status").textContent = `Bijna! Het woord was ${serverDisplay || word}. Probeer opnieuw.`;
      document.querySelectorAll(".letter-button").forEach(b => b.disabled = true);
      if (!struggleNoted) { struggleNoted = true; noteStruggle("galgje"); }
    }
  };
  $("#letters").innerHTML = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(l => `<button class="letter-button">${l}</button>`).join("");
  const applyHangmanState = remote => {
    if (!remote || remote.kind !== "galgje") return;
    if (serverPhase === "finished" && remote.phase === "playing") completionAwarded = false;
    wordHint = remote.hint || wordHint;
    serverDisplay = remote.display || null;
    serverPhase = remote.phase || null;
    serverWinner = remote.winner || null;
    maxMistakes = remote.maxMistakes || maxMistakes;
    $("#hang-hint-text").textContent = wordHint;
    guessed.clear();
    (remote.guessed || []).forEach(letter => guessed.add(letter));
    mistakes = remote.mistakes || 0;
    document.querySelectorAll(".letter-button").forEach(button => button.disabled = guessed.has(button.textContent));
    draw();
  };
  document.querySelectorAll(".letter-button").forEach(button => button.addEventListener("click", async () => {
    if (state.room?.serverTurnGame) {
      try {
        const room = await serverControls.request("POST", { action: "move", roomId: state.room.id, letter: button.textContent });
        serverControls.accept(room);
        if (room.game_state.winner === "together") completeGame("galgje", "Galgje opgelost!");
      } catch (error) { toast(error.code === "INVALID_MOVE" ? "Die letter is al geprobeerd." : "De letter kon niet worden verstuurd."); }
      return;
    }
    button.disabled = true;
    guessed.add(button.textContent);
    if (!word.includes(button.textContent)) mistakes++;
    draw();
    await syncGameState({ kind: "galgje", word, hint: wordHint, guessed: [...guessed], mistakes });
  }));
  draw();
  serverControls = wireServerTurnGame("galgje", contentLevel, applyHangmanState);
}

function renderSudoku() {
  const level = gameLevel("sudoku");
  const { solution, puzzle } = SpeelplaneetLevels.sudoku(level);
  stage.innerHTML = `<div class="game-layout">
    <div class="game-panel">
      <p class="eyebrow">LEVEL 1 · LOGICA</p><h2>🧩 Mini Sudoku</h2><p class="game-subtitle">Zorg dat 1, 2, 3 en 4 één keer in iedere rij en elk blok staan.</p>
      <div class="sudoku-grid">${puzzle.map((n, i) => `<input aria-label="Sudoku vak ${i+1}" class="sudoku-cell" inputmode="numeric" maxlength="1" data-index="${i}" value="${n || ""}" ${n ? "disabled" : ""}>`).join("")}</div>
      <button id="check-sudoku" class="primary-button">Controleer mijn puzzel</button>
    </div>
    ${sidePanel("Slimme tip", "Begin bij een rij waar al veel cijfers ingevuld zijn.", false)}
  </div>`;
  document.querySelectorAll(".sudoku-cell:not(:disabled)").forEach(cell => cell.addEventListener("input", () => {
    cell.value = cell.value.replace(/[^1-4]/g, "").slice(0, 1);
  }));
  $("#check-sudoku").addEventListener("click", () => {
    const values = [...document.querySelectorAll(".sudoku-cell")].map(c => Number(c.value));
    if (values.every((v, i) => v === solution[i])) completeGame("sudoku", "Sudoku helemaal goed!");
    else { noteStruggle("sudoku"); toast("Er klopt nog iets niet. Kijk rustig nog eens."); }
  });
}

function renderWordSearch() {
  const level = gameLevel("woordzoeker");
  const { words, grid, placements } = SpeelplaneetLevels.wordSearch(level);
  const found = new Set();
  let selected = [];
  stage.innerHTML = `<div class="game-layout">
    <div class="game-panel">
      <p class="eyebrow">LEVEL 1 · SPEUREN</p><h2>🔎 Woordzoeker</h2><p class="game-subtitle">Tik de letters van een woord van links naar rechts aan.</p>
      <div class="wordsearch-grid">${grid.map((letter,index) => `<button class="wordsearch-cell" data-index="${index}">${letter}</button>`).join("")}</div>
      <div class="word-list">${words.map(w => `<span class="word-pill" data-word="${w}">${w}</span>`).join("")}</div>
    </div>
    ${sidePanel("Zoektip", "Alle woorden staan in deze eerste ronde horizontaal. Een volgend level kan ook verticaal en schuin.", false)}
  </div>`;
  document.querySelectorAll(".wordsearch-cell").forEach(cell => cell.addEventListener("click", () => {
    const index = Number(cell.dataset.index);
    selected.push(index);
    cell.classList.add("selected");
    const matching = placements.filter(placement => selected.every((value, offset) => placement.indices[offset] === value));
    const completed = matching.find(placement => placement.indices.length === selected.length);
    if (completed) {
      found.add(completed.word);
      document.querySelector(`[data-word="${completed.word}"]`).classList.add("found");
      completed.indices.forEach(i => document.querySelector(`[data-index="${i}"]`).classList.add("found-cell"));
      selected = [];
      setTimeout(() => document.querySelectorAll(".wordsearch-cell.selected").forEach(c => c.classList.remove("selected")), 400);
      if (found.size === words.length) completeGame("woordzoeker", "Alle woorden gevonden!");
    } else if (!matching.length) {
      setTimeout(() => {
        document.querySelectorAll(".wordsearch-cell.selected").forEach(c => c.classList.remove("selected"));
        selected = [];
      }, 250);
    }
  }));
}

function renderMemory() {
  const level = gameLevel("memory");
  const generated = SpeelplaneetLevels.memory(level);
  const pairCount = generated.pairCount;
  const symbolIcon = { raket:"🚀", planeet:"🪐", ster:"⭐", alien:"👽", maan:"🌙", satelliet:"🛰️", komeet:"☄️", aarde:"🌍", telescoop:"🔭", ufo:"🛸", melkweg:"🌌", astronaut:"👩‍🚀" };
  const cards = generated.cards.map(symbol => symbolIcon[symbol]);
  let open = [], found = new Set(), moves = 0, locked = false;
  stage.innerHTML = `<div class="game-layout">
    <div class="game-panel">
      <p class="eyebrow">GEHEUGENSPEL · LEVEL 1</p><h2>🃏 Ruimte-Memory</h2>
      <p class="game-subtitle">Draai steeds twee kaartjes om en vind alle zes paren.</p>
      <div class="status-box" id="memory-status">Zetten: 0 · Paren: 0 / ${pairCount}</div>
      <div class="memory-grid" style="--memory-columns:${pairCount > 8 ? 6 : 4}">${cards.map((_, i) => `<button class="memory-card" data-card="${i}" aria-label="Gesloten kaart">✦</button>`).join("")}</div>
    </div>
    ${sidePanel("Memory-tip", "Probeer niet alleen het plaatje, maar ook de plek van ieder kaartje te onthouden.", false)}
  </div>`;
  document.querySelectorAll("[data-card]").forEach(card => card.addEventListener("click", () => {
    const index = Number(card.dataset.card);
    if (locked || open.includes(index) || found.has(index)) return;
    open.push(index); card.textContent = cards[index]; card.classList.add("open");
    if (open.length === 2) {
      moves++;
      const [a, b] = open;
      if (cards[a] === cards[b]) {
        found.add(a); found.add(b); open = [];
        document.querySelectorAll("[data-card]")[a].classList.add("matched");
        document.querySelectorAll("[data-card]")[b].classList.add("matched");
        if (found.size === cards.length) completeGame("memory", `Memory klaar in ${moves} zetten!`);
      } else {
        locked = true;
        setTimeout(() => {
          [a, b].forEach(i => { const c = document.querySelector(`[data-card="${i}"]`); c.textContent = "✦"; c.classList.remove("open"); });
          open = []; locked = false;
        }, 750);
      }
      $("#memory-status").textContent = `Zetten: ${moves} · Paren: ${found.size / 2} / ${pairCount}`;
    }
  }));
}

function renderTicTacToe() {
  const level = gameLevel("boterkaaseieren");
  const random = levelRng("boterkaaseieren", level);
  const aiProfile = SpeelplaneetLevels.turnGames(level);
  let game = { kind: "boterkaaseieren", board: Array(9).fill(null), turn: "host", winner: null };
  const role = () => state.room?.role || (state.room && state.room.host_id !== state.sessionId ? "guest" : "host");
  const mark = playerRole => playerRole === "host" ? "X" : "O";
  const winner = board => {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    const line = lines.find(([a,b,c]) => board[a] && board[a] === board[b] && board[a] === board[c]);
    return line ? board[line[0]] : board.every(Boolean) ? "draw" : null;
  };
  stage.innerHTML = `<div class="game-layout"><div class="game-panel">
    <p class="eyebrow">KLASSIEKER</p><h2>❌ Boter-kaas-en-eieren</h2>
    <p class="game-subtitle">Maak horizontaal, verticaal of schuin drie dezelfde tekens op een rij.</p>
    <div class="status-box" id="ttt-status">Jij begint met X.</div>
    <div class="ttt-grid">${Array.from({length:9},(_,i)=>`<button class="ttt-cell" data-ttt="${i}"></button>`).join("")}</div>
  </div>${sidePanel("Speel met z'n tweeën", "Deel een kamer via WhatsApp of speel meteen tegen de computer.")}</div>`;
  const draw = () => {
    document.querySelectorAll("[data-ttt]").forEach(cell => {
      const i = Number(cell.dataset.ttt);
      cell.textContent = game.board[i] || "";
      cell.classList.toggle("mark-o", game.board[i] === "O");
      cell.disabled = Boolean(game.board[i]) || Boolean(game.winner) || game.turn !== role();
    });
    $("#ttt-status").textContent = game.winner === "draw" ? "Gelijkspel — knap gespeeld!"
      : game.winner ? (game.winner === mark(role()) ? "🏆 Jij hebt gewonnen!" : "De tegenstander wint deze ronde.")
      : game.turn === role() ? `Jij bent aan de beurt met ${mark(role())}.` : "Even wachten op de tegenstander…";
  };
  const apply = remote => { if (remote?.kind === "boterkaaseieren") { game = remote; draw(); } };
  let serverControls = null;
  document.querySelectorAll("[data-ttt]").forEach(cell => cell.addEventListener("click", async () => {
    const i = Number(cell.dataset.ttt);
    if (cell.disabled) return;
    if (state.room?.serverTurnGame) {
      try {
        const room = await serverControls.request("POST", { action: "move", roomId: state.room.id, index: i });
        serverControls.accept(room);
        if (room.game_state.winner === mark(room.role)) completeGame("boterkaaseieren", "Drie op een rij!");
      } catch (error) { toast(error.code === "NOT_YOUR_TURN" ? "De andere speler is aan de beurt." : "Die zet lukte niet."); }
      return;
    }
    game.board[i] = mark(role());
    game.winner = winner(game.board);
    if (!game.winner) game.turn = role() === "host" ? "guest" : "host";
    if (!state.room && !game.winner) {
      const free = game.board.map((v,i) => v ? null : i).filter(i => i !== null);
      const tactical = symbol => free.find(i => { const test=[...game.board];test[i]=symbol;return winner(test)===symbol; });
      const smart = random() < aiProfile.ticTacToeSmart;
      const choice = smart ? (tactical("O") ?? tactical("X") ?? (free.includes(4) ? 4 : free[Math.floor(random()*free.length)])) : free[Math.floor(random()*free.length)];
      game.board[choice] = "O"; game.winner = winner(game.board); game.turn = "host";
    }
    if (game.winner === mark(role())) completeGame("boterkaaseieren", "Drie op een rij!");
    draw(); await syncGameState(game);
  }));
  draw(); serverControls = wireServerTurnGame("boterkaaseieren", level, apply);
}

function renderConnectFour() {
  const level = gameLevel("vieropeenrij");
  const random = levelRng("vieropeenrij", level);
  const aiProfile = SpeelplaneetLevels.turnGames(level);
  let game = { kind: "vieropeenrij", board: Array(42).fill(null), turn: "host", winner: null };
  const role = () => state.room?.role || (state.room && state.room.host_id !== state.sessionId ? "guest" : "host");
  const token = r => r === "host" ? "red" : "yellow";
  const drop = (board, column, color) => {
    for (let row = 5; row >= 0; row--) { const i = row * 7 + column; if (!board[i]) { board[i] = color; return i; } }
    return -1;
  };
  const hasFour = (board, color) => {
    for (let r=0;r<6;r++) for(let c=0;c<7;c++) for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]])
      if ([0,1,2,3].every(n => { const rr=r+dr*n, cc=c+dc*n; return rr>=0&&rr<6&&cc>=0&&cc<7&&board[rr*7+cc]===color; })) return true;
    return false;
  };
  stage.innerHTML = `<div class="game-layout"><div class="game-panel">
    <p class="eyebrow">VIER OP EEN RIJ</p><h2>🔴 Sterrenstapelaar</h2>
    <p class="game-subtitle">Laat je fiches vallen en maak als eerste een rij van vier.</p>
    <div class="status-box" id="four-status">Jij begint met rood.</div>
    <div class="connect-grid">${Array.from({length:42},(_,i)=>`<button class="connect-cell" data-column="${i%7}" aria-label="Kolom ${i%7+1}"><span></span></button>`).join("")}</div>
  </div>${sidePanel("Speel samen", "Maak een kamer en deel de uitnodiging. Iedere speler krijgt een eigen kleur.")}</div>`;
  const draw = () => {
    document.querySelectorAll(".connect-cell").forEach((cell,i) => {
      cell.querySelector("span").className = game.board[i] ? `token-${game.board[i]}` : "";
      cell.disabled = Boolean(game.winner) || game.turn !== role() || Boolean(game.board[Number(cell.dataset.column)]);
    });
    $("#four-status").textContent = game.winner === "draw" ? "Het bord is vol: gelijkspel!"
      : game.winner ? (game.winner === token(role()) ? "🏆 Vier op een rij — jij wint!" : "De tegenstander heeft vier op een rij.")
      : game.turn === role() ? `Jouw beurt met ${token(role()) === "red" ? "rood" : "geel"}.` : "De tegenstander denkt na…";
  };
  const apply = remote => { if (remote?.kind === "vieropeenrij") { game = remote; draw(); } };
  let serverControls = null;
  document.querySelectorAll("[data-column]").forEach(cell => cell.addEventListener("click", async () => {
    if (cell.disabled) return;
    if (state.room?.serverTurnGame) {
      try {
        const room = await serverControls.request("POST", { action: "move", roomId: state.room.id, column: Number(cell.dataset.column) });
        serverControls.accept(room);
        if (room.game_state.winner === token(room.role)) completeGame("vieropeenrij", "Vier op een rij!");
      } catch (error) { toast(error.code === "NOT_YOUR_TURN" ? "De andere speler is aan de beurt." : "Die zet lukte niet."); }
      return;
    }
    const color = token(role());
    drop(game.board, Number(cell.dataset.column), color);
    game.winner = hasFour(game.board, color) ? color : game.board.every(Boolean) ? "draw" : null;
    if (!game.winner) game.turn = role() === "host" ? "guest" : "host";
    if (!state.room && !game.winner) {
      const valid = [0,1,2,3,4,5,6].filter(c => !game.board[c]);
      const winning = valid.find(c=>{const test=[...game.board];drop(test,c,"yellow");return hasFour(test,"yellow");});
      const blocking = valid.find(c=>{const test=[...game.board];drop(test,c,"red");return hasFour(test,"red");});
      const smart = random() < aiProfile.connectFourSmart;
      const preferred = valid.slice().sort((a,b)=>Math.abs(a-3)-Math.abs(b-3));
      const col = smart ? (winning ?? blocking ?? preferred[0]) : valid[Math.floor(random()*valid.length)];
      drop(game.board, col, "yellow");
      game.winner = hasFour(game.board, "yellow") ? "yellow" : game.board.every(Boolean) ? "draw" : null;
      game.turn = "host";
    }
    if (game.winner === color) completeGame("vieropeenrij", "Vier op een rij!");
    draw(); await syncGameState(game);
  }));
  draw(); serverControls = wireServerTurnGame("vieropeenrij", level, apply);
}

function renderMastermind() {
  const level = gameLevel("mastermind");
  const colors = ["coral","blue","yellow","purple","green","navy"];
  const generated = SpeelplaneetLevels.mastermind(level);
  const { codeLength, maxTurns } = generated;
  const secret = generated.code.map(index => colors[index]);
  let guess = [], turn = 1;
  stage.innerHTML = `<div class="game-layout"><div class="game-panel">
    <p class="eyebrow">LOGICAPUZZEL</p><h2>🎨 Kraak de kleurcode</h2>
    <p class="game-subtitle">Kies ${codeLength} kleuren. Een gouden stip is goed én op de juiste plek; wit is een goede kleur op een andere plek.</p>
    <div class="code-history" id="code-history"></div><div class="current-code" id="current-code"></div>
    <div class="color-picker">${colors.map(c=>`<button class="color-dot color-${c}" data-color="${c}" aria-label="${c}"></button>`).join("")}</div>
    <button class="primary-button" id="check-code" disabled>Controleer code</button>
  </div>${sidePanel("Kleurentip", "Gebruik de aanwijzingen van iedere poging om kleuren uit te sluiten.", false)}</div>`;
  const drawGuess = () => {
    $("#current-code").innerHTML = Array.from({length:codeLength},(_,i)=>`<span class="${guess[i] ? `color-${guess[i]}` : ""}">${guess[i] ? "" : "?"}</span>`).join("");
    $("#check-code").disabled = guess.length !== codeLength;
  };
  document.querySelectorAll("[data-color]").forEach(b=>b.addEventListener("click",()=>{ if(guess.length<codeLength){guess.push(b.dataset.color);drawGuess();} }));
  $("#current-code").addEventListener("click",()=>{guess.pop();drawGuess();});
  $("#check-code").addEventListener("click",()=>{
    const exact = guess.filter((c,i)=>c===secret[i]).length;
    const remainingSecret = secret.filter((c,i)=>guess[i]!==c), remainingGuess = guess.filter((c,i)=>secret[i]!==c);
    let near=0; remainingGuess.forEach(c=>{const i=remainingSecret.indexOf(c);if(i>=0){near++;remainingSecret.splice(i,1);}});
    $("#code-history").insertAdjacentHTML("beforeend",`<div class="code-row"><strong>${turn}</strong>${guess.map(c=>`<span class="color-${c}"></span>`).join("")}<small>🟡 ${exact} · ⚪ ${near}</small></div>`);
    if(exact===codeLength){completeGame("mastermind","Kleurcode gekraakt!");$("#check-code").disabled=true;document.querySelectorAll("[data-color]").forEach(b=>b.disabled=true);}
    else if(turn===maxTurns){noteStruggle("mastermind");toast("De code ontsnapte. Probeer een nieuwe ronde!");$("#check-code").disabled=true;}
    else {turn++;guess=[];drawGuess();}
  });
  drawGuess();
}

function renderMathSprint() {
  const level=gameLevel("rekensprint");
  const contentLevel=state.parentSettings?.mathLevel==="basis"?Math.min(level,60)
    :state.parentSettings?.mathLevel==="tafels"?Math.min(80,Math.max(61,level))
    :state.parentSettings?.mathLevel==="gemengd"?Math.max(81,level):level;
  const challenge=SpeelplaneetLevels.mathLevel(contentLevel), total=challenge.questions.length;
  let question=0, score=0, answer=0;
  stage.innerHTML=`<div class="game-layout"><div class="game-panel math-panel">
    <p class="eyebrow">REKENMISSIE · ${challenge.goal.toUpperCase()}</p><h2>➕ Rekensprint</h2><p class="game-subtitle">Los ${total} sommen op. Rustig nadenken mag!</p>
    <div class="status-box" id="math-status">Som 1 van ${total} · Score: 0</div>
    <div class="math-question" id="math-question"></div>
    <form id="math-form"><input id="math-answer" inputmode="numeric" autocomplete="off" aria-label="Antwoord"><button class="primary-button">Controleer</button></form>
  </div>${sidePanel("Rekentip","Splits een moeilijke som op in twee kleinere stapjes.",false)}</div>`;
  const next=()=>{const current=challenge.questions[question];answer=current.answer;$("#math-question").textContent=current.text;$("#math-answer").value="";$("#math-answer").focus();};
  $("#math-form").addEventListener("submit",e=>{e.preventDefault();if(Number($("#math-answer").value)===answer){score++;toast("Goed gerekend!");}else {noteStruggle("rekensprint");toast(`Bijna! Het antwoord was ${answer}.`);}question++;if(question===total){$("#math-question").textContent=`${score} van de ${total} goed!`;$("#math-form").classList.add("hidden");if(score>=Math.ceil(total*.7))completeGame("rekensprint","Rekensprint voltooid!");}else{$("#math-status").textContent=`Som ${question+1} van ${total} · Score: ${score}`;next();}});
  next();
}

function renderSimon() {
  const gameLvl=gameLevel("simon"), generated=SpeelplaneetLevels.simon(gameLvl), target=generated.target;
  const colors=["coral","blue","yellow","purple"]; let sequence=[],input=[],level=0,accepting=false;
  const levelSequence=generated.sequence.map(index=>colors[index]);
  stage.innerHTML=`<div class="game-layout"><div class="game-panel simon-panel">
    <p class="eyebrow">GEHEUGENMISSIE</p><h2>✨ Sterrenreeks</h2><p class="game-subtitle">Bekijk de lichtjes en tik daarna precies dezelfde reeks.</p>
    <div class="status-box" id="simon-status">Druk op start wanneer je klaar bent.</div>
    <div class="simon-grid">${colors.map(c=>`<button class="simon-pad color-${c}" data-simon="${c}" aria-label="${c}"></button>`).join("")}</div>
    <button class="primary-button" id="start-simon">Start de reeks</button>
  </div>${sidePanel("Onthoudtip","Zeg de kleuren zachtjes in je hoofd terwijl ze oplichten.",false)}</div>`;
  const flash=async()=>{accepting=false;$("#simon-status").textContent=`Kijk goed… level ${level}`;for(const c of sequence){await new Promise(r=>setTimeout(r,350));const p=document.querySelector(`[data-simon="${c}"]`);p.classList.add("flash");await new Promise(r=>setTimeout(r,420));p.classList.remove("flash");}input=[];accepting=true;$("#simon-status").textContent="Jouw beurt!";};
  const advance=()=>{level++;sequence.push(levelSequence[level-1]);flash();};
  $("#start-simon").addEventListener("click",()=>{$("#start-simon").classList.add("hidden");advance();});
  document.querySelectorAll("[data-simon]").forEach(p=>p.addEventListener("click",()=>{if(!accepting)return;input.push(p.dataset.simon);const i=input.length-1;if(input[i]!==sequence[i]){noteStruggle("simon");accepting=false;$("#simon-status").textContent=`Oeps! Je haalde reeks ${level}.`;$("#start-simon").textContent="Opnieuw";$("#start-simon").classList.remove("hidden");sequence=[];level=0;}else if(input.length===sequence.length){accepting=false;if(level===target){completeGame("simon",`${target} reeksen onthouden!`);$("#simon-status").textContent=`🏆 Alle ${target} reeksen goed onthouden!`;}else setTimeout(advance,650);}}));
}

function renderMaze() {
  const level = gameLevel("doolhof");
  const maze = SpeelplaneetLevels.maze(level);
  let position = maze.start, moves = 0;
  const directions = {
    up:{ delta:-maze.size,wall:1,key:"ArrowUp" },
    right:{ delta:1,wall:2,key:"ArrowRight" },
    down:{ delta:maze.size,wall:4,key:"ArrowDown" },
    left:{ delta:-1,wall:8,key:"ArrowLeft" },
  };
  stage.innerHTML = `<div class="game-layout"><div class="game-panel maze-panel">
    <p class="eyebrow">ROUTEMISSIE</p><h2>🌀 Sterrendoolhof</h2>
    <p class="game-subtitle">Breng de raket veilig naar de planeet. Je kunt altijd een stap terug.</p>
    <div class="status-box" id="maze-status">Zet de eerste stap naar de planeet.</div>
    <div class="maze-grid" style="--maze-size:${maze.size}" role="grid" aria-label="Doolhof van ${maze.size} bij ${maze.size}">
      ${maze.walls.map((walls,index) => `<div role="gridcell" class="maze-cell ${walls&1?"wall-n":""} ${walls&2?"wall-e":""} ${walls&4?"wall-s":""} ${walls&8?"wall-w":""}" data-maze-cell="${index}" aria-label="Vak ${index+1}"></div>`).join("")}
    </div>
    <div class="maze-controls" aria-label="Bestuur de raket">
      <button type="button" data-maze-move="up" aria-label="Omhoog">↑</button>
      <button type="button" data-maze-move="left" aria-label="Links">←</button>
      <button type="button" data-maze-move="down" aria-label="Omlaag">↓</button>
      <button type="button" data-maze-move="right" aria-label="Rechts">→</button>
    </div>
  </div>${sidePanel("Routehulp","Tik op Toon één stap wanneer je even niet weet welke kant je op kunt.",false).replace("</aside>",'<button class="mini-button" type="button" id="maze-hint">Toon één stap</button></aside>')}</div>`;
  const pathFrom = start => {
    const parents = Array(maze.walls.length).fill(-1), queue=[start], seen=new Set([start]);
    for (let cursor=0;cursor<queue.length;cursor++) {
      const cell=queue[cursor];
      for (const direction of Object.values(directions)) {
        if (maze.walls[cell]&direction.wall) continue;
        const next=cell+direction.delta;
        if (seen.has(next)) continue;
        seen.add(next);parents[next]=cell;queue.push(next);
      }
    }
    const path=[];
    for(let cell=maze.goal;cell>=0;cell=parents[cell]){path.push(cell);if(cell===start)break;}
    return path.reverse();
  };
  const draw = () => {
    document.querySelectorAll("[data-maze-cell]").forEach((cell,index) => {
      cell.classList.toggle("maze-player",index===position);
      cell.classList.toggle("maze-goal",index===maze.goal);
      cell.textContent = index===position ? "🚀" : index===maze.goal ? "🪐" : "";
      cell.setAttribute("aria-current",index===position ? "true" : "false");
    });
    $("#maze-status").textContent = position===maze.goal ? `Planeet bereikt in ${moves} stappen!` : `${moves} stap${moves===1?"":"pen"} gezet · rustig verder zoeken.`;
  };
  const move = name => {
    const direction=directions[name];
    if (!direction || maze.walls[position]&direction.wall || state.levelCompleted) return;
    position+=direction.delta;moves++;draw();
    if(position===maze.goal) completeGame("doolhof","Route naar de planeet gevonden!");
  };
  document.querySelectorAll("[data-maze-move]").forEach(button=>button.addEventListener("click",()=>move(button.dataset.mazeMove)));
  $("#maze-hint").addEventListener("click",()=>{
    const path=pathFrom(position),next=path[1];
    if(next===undefined)return;
    const cell=document.querySelector(`[data-maze-cell="${next}"]`);
    cell.classList.add("maze-hint-cell");setTimeout(()=>cell.classList.remove("maze-hint-cell"),1400);
    const support=supportEntry("doolhof");support.hints++;support.updatedAt=Date.now();saveProgress();
  });
  const keyHandler=event=>{
    if (["INPUT","SELECT","TEXTAREA"].includes(event.target.tagName)) return;
    const entry=Object.entries(directions).find(([,direction])=>direction.key===event.key);
    if(!entry)return;event.preventDefault();move(entry[0]);
  };
  document.addEventListener("keydown",keyHandler);
  state.gameCleanup=()=>document.removeEventListener("keydown",keyHandler);
  draw();
}

function renderSpaceRunner() {
  const level = gameLevel("ruimterunner");
  const random = levelRng("ruimterunner", level);
  const runnerProfile = SpeelplaneetLevels.runner(level);
  const { target, startSpeed } = runnerProfile;
  let character = localStorage.getItem("speelplaneet-runner") || "ellie";
  if (!["ellie","mila","mats"].includes(character)) character = "ellie";
  const runnerName = name => ({ ellie:"Ellie", mila:"Mila", mats:"Mats" }[name] || "Ellie");
  const runnerHighscores = state.progress.runnerHighscores;
  let running = false, paused = false, jumping = false, ducking = false, y = 0, velocity = 0, duckUntil = 0, duckTimer = 0;
  let passed = 0, distance = 0, nextSpawn = 1050 + random() * 700, lastTime = 0, frame = 0;
  const obstacles = [];

  stage.innerHTML = `<div class="game-panel runner-panel">
    <p class="eyebrow">OFFLINE RUIMTEMISSIE</p><h2>🏃 Ruimterunner</h2>
    <p class="game-subtitle">Spring over ruimterobots en buk onder vliegende ufo’s. Dit spel blijft ook zonder internet werken.</p>
    <div class="runner-toolbar">
      <div class="runner-choices">
        <button class="runner-choice ${character === "ellie" ? "active" : ""}" data-runner-choice="ellie"><img src="assets/ellie-runner-transparent.png" alt="" /><span>Ellie</span></button>
        <button class="runner-choice ${character === "mila" ? "active" : ""}" data-runner-choice="mila"><img src="assets/mila-runner-transparent.png" alt="" /><span>Mila</span></button>
        <button class="runner-choice ${character === "mats" ? "active" : ""}" data-runner-choice="mats"><img src="assets/mats-runner-transparent.png" alt="" /><span>Mats</span></button>
      </div>
      <div class="runner-meters">
        <div class="runner-score"><small>HINDERNISSEN</small><strong><span id="runner-score">0</span> / ${target}</strong></div>
        <div class="runner-score"><small>AFSTAND</small><strong><span id="runner-distance">0</span> m</strong></div>
        <div class="runner-score runner-best"><small>HIGH­SCORE</small><strong><span id="runner-best">${runnerHighscores[character] || 0}</span> m</strong></div>
      </div>
    </div>
    <div class="runner-status" id="runner-status">Kies Ellie of Mila en start de ruimtemissie!</div>
    <div class="runner-world" id="runner-world" tabindex="0" aria-label="Ruimterunner speelveld">
      <div class="space-stars"></div><div class="space-planet planet-a"></div><div class="space-planet planet-b"></div>
      <div class="runner-ground"></div>
      <img class="runner-character" id="runner-character" src="assets/${character}-runner-transparent.png" alt="${runnerName(character)} rent door de ruimte" />
    </div>
    <div class="runner-controls">
      <button class="runner-action jump-action" id="runner-jump">↑ Spring</button>
      <button class="primary-button" id="runner-start">Start missie</button>
      <button class="runner-action duck-action" id="runner-duck">↓ Bukken</button>
    </div>
    <p class="runner-help">Toetsenbord: spatie of ↑ om te springen · ↓ om te bukken</p>
  </div>`;

  const world = $("#runner-world");
  const runner = $("#runner-character");
  const status = $("#runner-status");

  const setCharacter = name => {
    if (running) return;
    character = name;
    localStorage.setItem("speelplaneet-runner", name);
    runner.src = `assets/${name}-runner-transparent.png`;
    runner.alt = `${runnerName(name)} rent door de ruimte`;
    $("#runner-best").textContent = runnerHighscores[name] || 0;
    document.querySelectorAll("[data-runner-choice]").forEach(button => button.classList.toggle("active", button.dataset.runnerChoice === name));
  };

  const jump = () => {
    if (!running || jumping) return;
    jumping = true; ducking = false; duckUntil = 0; clearTimeout(duckTimer); runner.classList.remove("ducking");
    velocity = 12.6;
  };
  const duck = active => {
    if (!running || jumping) return;
    if (active) {
      ducking = true;
      duckUntil = Math.max(duckUntil, performance.now() + 720);
      clearTimeout(duckTimer);
      runner.classList.add("ducking");
      return;
    }
    const remaining = duckUntil - performance.now();
    if (remaining > 0) {
      clearTimeout(duckTimer);
      duckTimer = setTimeout(() => duck(false), remaining);
      return;
    }
    ducking = false;
    runner.classList.remove("ducking");
  };

  const spawnObstacle = () => {
    const type = random() < runnerProfile.ufoChance ? "ufo" : "robot";
    const element = document.createElement("div");
    element.className = `runner-obstacle obstacle-${type}`;
    element.textContent = type === "robot" ? "🤖" : "🛸";
    element.setAttribute("aria-hidden", "true");
    world.appendChild(element);
    obstacles.push({ element, type, x: world.clientWidth + 50, counted: false });
  };

  const collides = obstacle => {
    const runnerRect = runner.getBoundingClientRect();
    const obstacleRect = obstacle.element.getBoundingClientRect();
    const padding = 12;
    return runnerRect.right - padding > obstacleRect.left + padding &&
      runnerRect.left + padding < obstacleRect.right - padding &&
      runnerRect.bottom - 7 > obstacleRect.top + 8 &&
      runnerRect.top + 8 < obstacleRect.bottom - 5;
  };

  const finish = won => {
    running = false; paused = false;
    cancelAnimationFrame(frame);
    clearTimeout(duckTimer);
    const meters = Math.floor(distance / 100);
    const previousBest = runnerHighscores[character] || 0;
    const isRecord = meters > previousBest;
    if (isRecord) {
      runnerHighscores[character] = meters;
      saveProgress();
      $("#runner-best").textContent = meters;
    }
    $("#runner-start").classList.remove("hidden");
    $("#runner-start").textContent = won ? "Speel nog eens" : "Probeer opnieuw";
    status.textContent = won
      ? `🏆 ${runnerName(character)} voltooide de missie met ${meters} meter${isRecord ? " — nieuw record!" : "!"}`
      : `Botsing na ${meters} meter.${isRecord ? " 🏅 Nieuw afstandsrecord!" : " Gelukkig beschermde het ruimtepak je."}`;
    if (won) completeGame("ruimterunner", "Ruimtemissie voltooid!");
    else noteStruggle("ruimterunner");
  };

  const loop = time => {
    if (!running || paused) return;
    const delta = Math.min(32, time - lastTime || 16.7);
    lastTime = time;
    const gradualAcceleration = Math.min(2.9, passed * .085 + distance / 48000);
    const speed = (startSpeed + gradualAcceleration) * (delta / 16.7);
    distance += delta;
    $("#runner-distance").textContent = Math.floor(distance / 100);
    nextSpawn -= delta;
    if (nextSpawn <= 0) {
      spawnObstacle();
      const difficultyGap = Math.max(1050, runnerProfile.minimumGap - passed * 10);
      nextSpawn = difficultyGap + random() * 800;
    }
    if (jumping) {
      y += velocity * (delta / 16.7);
      velocity -= .43 * (delta / 16.7);
      if (y <= 0) { y = 0; velocity = 0; jumping = false; }
      runner.style.transform = `translateY(${-y}px)`;
    }
    for (let index = obstacles.length - 1; index >= 0; index--) {
      const obstacle = obstacles[index];
      obstacle.x -= speed;
      obstacle.element.style.transform = `translateX(${obstacle.x}px)`;
      if (collides(obstacle)) return finish(false);
      if (!obstacle.counted && obstacle.x < 35) {
        obstacle.counted = true; passed++;
        $("#runner-score").textContent = passed;
        status.textContent = `${target - passed} hindernissen te gaan — goed bezig!`;
        if (passed >= target) return finish(true);
      }
      if (obstacle.x < -100) { obstacle.element.remove(); obstacles.splice(index, 1); }
    }
    frame = requestAnimationFrame(loop);
  };

  const start = () => {
    obstacles.splice(0).forEach(obstacle => obstacle.element.remove());
    running = true; paused = false; jumping = false; ducking = false; duckUntil = 0; clearTimeout(duckTimer); y = 0; velocity = 0; passed = 0; distance = 0;
    nextSpawn = 1450 + random() * 650; runner.style.transform = ""; runner.classList.remove("ducking");
    $("#runner-score").textContent = "0"; $("#runner-distance").textContent = "0"; $("#runner-start").classList.add("hidden");
    status.textContent = "De missie is gestart — let goed op!";
    lastTime = performance.now(); world.focus(); frame = requestAnimationFrame(loop);
  };

  document.querySelectorAll("[data-runner-choice]").forEach(button => button.addEventListener("click", () => setCharacter(button.dataset.runnerChoice)));
  $("#runner-start").addEventListener("click", start);
  $("#runner-jump").addEventListener("pointerdown", jump);
  $("#runner-duck").addEventListener("pointerdown", () => duck(true));
  $("#runner-duck").addEventListener("pointerup", () => duck(false));
  $("#runner-duck").addEventListener("pointerleave", () => duck(false));
  const keyHandler = event => {
    if (!stage.contains(world)) return document.removeEventListener("keydown", keyHandler);
    if (event.code === "Space" || event.code === "ArrowUp") { event.preventDefault(); jump(); }
    if (event.code === "ArrowDown") { event.preventDefault(); duck(true); }
  };
  const keyUpHandler = event => {
    if (!stage.contains(world)) return document.removeEventListener("keyup", keyUpHandler);
    if (event.code === "ArrowDown") duck(false);
  };
  document.addEventListener("keydown", keyHandler);
  document.addEventListener("keyup", keyUpHandler);
  configureGamePause(
    () => {
      if (!running || paused) return false;
      paused = true; cancelAnimationFrame(frame); clearTimeout(duckTimer);
      status.textContent = "⏸ Missie gepauzeerd — neem rustig de tijd.";
      return true;
    },
    () => {
      if (!running || !paused) return false;
      paused = false; lastTime = performance.now(); frame = requestAnimationFrame(loop);
      status.textContent = "De missie gaat verder — let goed op!";
      return true;
    }
  );
  state.gameCleanup = () => {
    running = false; paused = false;
    cancelAnimationFrame(frame);
    clearTimeout(duckTimer);
    document.removeEventListener("keydown", keyHandler);
    document.removeEventListener("keyup", keyUpHandler);
  };
}

function renderBattleship() {
  const level = gameLevel("zeeslag");
  const random = levelRng("zeeslag", level);
  const fleet = [5, 4, 3, 3, 2];
  let orientation = "horizontal";
  let selectedShip = 0;
  let fleetVariant = 0;
  let battle = {
    kind: "zeeslag",
    phase: "placing",
    turn: "host",
    winner: null,
    players: {
      host: { ships: [], shots: [], ready: false },
      guest: { ships: [], shots: [], ready: false },
    },
  };

  stage.innerHTML = `<div class="game-layout">
    <div class="game-panel">
      <p class="eyebrow">KLASSIEK ZEESLAG</p><h2>🚢 Zeeslag</h2>
      <p class="game-subtitle">Plaats je vloot, schiet om de beurt en breng alle schepen van je tegenstander tot zinken.</p>
      <div class="status-box" id="sea-status">Plaats eerst je vijf schepen.</div>
      <div class="fleet-controls" id="fleet-controls">
        <div class="ship-picker">${fleet.map((length, index) => `<button class="ship-choice ${index === 0 ? "active" : ""}" data-ship-index="${index}"><span>${"▰".repeat(length)}</span><small>${length} vakjes</small></button>`).join("")}</div>
        <div class="fleet-buttons">
          <button class="mode-button" id="rotate-ship">↻ Draai: horizontaal</button>
          <button class="mode-button" id="random-fleet">🎲 Plaats willekeurig</button>
          <button class="primary-button ready-button" id="fleet-ready" disabled>Vloot is klaar</button>
        </div>
      </div>
      <div class="battle-boards">
        <section class="battle-board-wrap">
          <div class="board-heading"><strong>Jouw oceaan</strong><span>Je eigen vloot</span></div>
          <div class="sea-grid" id="own-sea">${Array.from({length:100}, (_,i) => `<button class="sea-cell" data-own="${i}" aria-label="Eigen vak ${i+1}"></button>`).join("")}</div>
        </section>
        <section class="battle-board-wrap opponent-wrap">
          <div class="board-heading"><strong>Vijandelijke oceaan</strong><span id="opponent-label">Nog verborgen</span></div>
          <div class="sea-grid locked" id="opponent-sea">${Array.from({length:100}, (_,i) => `<button class="sea-cell" data-target="${i}" aria-label="Doelwit ${i+1}"></button>`).join("")}</div>
        </section>
      </div>
    </div>
    ${sidePanel("Daag iemand uit", "Maak een kamer en deel de code. Iedere speler plaatst een eigen, verborgen vloot en jullie schieten om de beurt.")}
  </div>`;

  const role = () => state.room && state.room.host_id !== state.sessionId ? "guest" : "host";
  const opponentRole = () => role() === "host" ? "guest" : "host";
  const occupied = player => new Set(player.ships.flatMap(ship => ship.cells));
  const allPlaced = player => player.ships.length === fleet.length;
  const allSunk = (targetRole, shooterRole) => {
    const enemyShots = new Set(battle.players[shooterRole].shots);
    const cells = [...occupied(battle.players[targetRole])];
    return cells.length === 17 && cells.every(cell => enemyShots.has(cell));
  };

  const cellsForPlacement = (start, length) => {
    const row = Math.floor(start / 10);
    const column = start % 10;
    if (orientation === "horizontal" && column + length > 10) return null;
    if (orientation === "vertical" && row + length > 10) return null;
    return Array.from({ length }, (_, offset) => start + (orientation === "horizontal" ? offset : offset * 10));
  };

  const placeShip = (start, shipIndex) => {
    const player = battle.players[role()];
    const cells = cellsForPlacement(start, fleet[shipIndex]);
    const otherCells = new Set(player.ships.filter(ship => ship.index !== shipIndex).flatMap(ship => ship.cells));
    if (!cells || cells.some(cell => otherCells.has(cell))) return toast("Daar past dit schip niet.");
    player.ships = player.ships.filter(ship => ship.index !== shipIndex);
    player.ships.push({ index: shipIndex, length: fleet[shipIndex], cells });
    const next = fleet.findIndex((_, index) => !player.ships.some(ship => ship.index === index));
    selectedShip = next === -1 ? shipIndex : next;
    drawBattle();
  };

  const randomizeFleet = player => {
    player.ships = SpeelplaneetLevels.battleship(level, fleetVariant++).ships;
  };

  const drawBattle = () => {
    const mine = battle.players[role()];
    const enemy = battle.players[opponentRole()];
    const myCells = occupied(mine);
    const enemyCells = occupied(enemy);
    const enemyShots = new Set(enemy.shots);
    const myShots = new Set(mine.shots);
    const myConfirmedHits = new Set(battle.hits?.[role()] || []);

    document.querySelectorAll("[data-own]").forEach(cell => {
      const index = Number(cell.dataset.own);
      cell.className = "sea-cell";
      cell.textContent = "";
      if (myCells.has(index)) { cell.classList.add("ship"); cell.textContent = "■"; }
      if (enemyShots.has(index) && myCells.has(index)) { cell.classList.add("hit"); cell.textContent = "✹"; }
      if (enemyShots.has(index) && !myCells.has(index)) { cell.classList.add("miss"); cell.textContent = "•"; }
      cell.disabled = battle.phase !== "placing" || mine.ready;
    });

    document.querySelectorAll("[data-target]").forEach(cell => {
      const index = Number(cell.dataset.target);
      cell.className = "sea-cell";
      cell.textContent = "";
      const confirmedHit = state.room?.serverBattleship ? myConfirmedHits.has(index) : enemyCells.has(index);
      if (myShots.has(index) && confirmedHit) { cell.classList.add("hit"); cell.textContent = "✹"; }
      if (myShots.has(index) && !confirmedHit) { cell.classList.add("miss"); cell.textContent = "•"; }
      if (battle.phase === "finished" && enemyCells.has(index)) cell.classList.add("revealed");
      cell.disabled = battle.phase !== "playing" || battle.turn !== role() || myShots.has(index);
    });

    $("#opponent-sea").classList.toggle("locked", battle.phase !== "playing" || battle.turn !== role());
    $("#fleet-controls").classList.toggle("fleet-locked", mine.ready || battle.phase !== "placing");
    $("#fleet-ready").disabled = !allPlaced(mine) || mine.ready;
    document.querySelectorAll("[data-ship-index]").forEach(button => {
      const index = Number(button.dataset.shipIndex);
      button.classList.toggle("active", index === selectedShip);
      button.classList.toggle("placed", mine.ships.some(ship => ship.index === index));
    });

    if (battle.phase === "placing") {
      $("#sea-status").textContent = mine.ready
        ? (enemy.ready ? "Beide vloten zijn klaar. De strijd begint!" : "Jouw vloot is klaar. Wachten op de tegenstander…")
        : `Plaats je vloot: ${mine.ships.length} van ${fleet.length} schepen staan klaar.`;
      $("#opponent-label").textContent = enemy.ready ? "Vloot staat klaar" : "Nog niet klaar";
    } else if (battle.phase === "playing") {
      $("#sea-status").textContent = battle.turn === role() ? "Jij bent aan de beurt — kies een doelwit!" : "De tegenstander is aan de beurt…";
      $("#opponent-label").textContent = `${mine.shots.length} schoten gelost`;
    } else {
      const won = battle.winner === role();
      $("#sea-status").textContent = won ? "🏆 Jij hebt de volledige vijandelijke vloot gezonken!" : "Je vloot is gezonken. Goed gespeeld!";
      $("#opponent-label").textContent = "Partij afgelopen";
    }
  };

  const applySeaState = remote => {
    if (!remote || remote.kind !== "zeeslag") return;
    battle = remote;
    drawBattle();
  };
  let serverBattleControls = null;

  document.querySelectorAll("[data-ship-index]").forEach(button => button.addEventListener("click", () => {
    selectedShip = Number(button.dataset.shipIndex);
    drawBattle();
  }));
  document.querySelectorAll("[data-own]").forEach(cell => cell.addEventListener("click", () => placeShip(Number(cell.dataset.own), selectedShip)));
  $("#rotate-ship").addEventListener("click", () => {
    orientation = orientation === "horizontal" ? "vertical" : "horizontal";
    $("#rotate-ship").textContent = `↻ Draai: ${orientation === "horizontal" ? "horizontaal" : "verticaal"}`;
  });
  $("#random-fleet").addEventListener("click", () => {
    randomizeFleet(battle.players[role()]);
    drawBattle();
  });
  $("#fleet-ready").addEventListener("click", async () => {
    const mine = battle.players[role()];
    if (state.room?.serverBattleship) {
      try {
        const room=await serverBattleControls.request("POST",{action:"place",roomId:state.room.id,ships:mine.ships});
        serverBattleControls.accept(room);
      } catch { toast("De vloot kon niet worden bewaard. Probeer opnieuw."); }
      return;
    }
    mine.ready = true;
    if (!state.room) {
      randomizeFleet(battle.players.guest);
      battle.players.guest.ready = true;
    }
    if (battle.players.host.ready && battle.players.guest.ready) {
      battle.phase = "playing";
      battle.turn = "host";
    }
    drawBattle();
    await syncGameState(battle);
  });
  document.querySelectorAll("[data-target]").forEach(cell => cell.addEventListener("click", async () => {
    if (cell.disabled) return;
    if (state.room?.serverBattleship) {
      cell.disabled=true;
      try {
        const room=await serverBattleControls.request("POST",{action:"shot",roomId:state.room.id,index:Number(cell.dataset.target)});
        const won=room.game_state.phase==="finished"&&room.game_state.winner===room.role;
        serverBattleControls.accept(room);
        if(won)completeGame("zeeslag","Zeeslag gewonnen!");
      } catch(error) {
        toast(error.code==="NOT_YOUR_TURN"?"De tegenstander is eerst aan de beurt.":"De zet kon niet worden verwerkt.");
      }
      return;
    }
    const mine = battle.players[role()];
    mine.shots.push(Number(cell.dataset.target));
    if (allSunk(opponentRole(), role())) {
      battle.phase = "finished";
      battle.winner = role();
      completeGame("zeeslag", "Zeeslag gewonnen!");
    } else {
      battle.turn = opponentRole();
      if (!state.room) {
        const computer = battle.players.guest;
        const choices = Array.from({ length: 100 }, (_, index) => index).filter(index => !computer.shots.includes(index));
        const hostCells = occupied(battle.players.host);
        const previousHits = computer.shots.filter(index => hostCells.has(index));
        const nearby = previousHits.flatMap(index => {
          const row=Math.floor(index/10),col=index%10;
          return [[row-1,col],[row+1,col],[row,col-1],[row,col+1]]
            .filter(([r,c])=>r>=0&&r<10&&c>=0&&c<10)
            .map(([r,c])=>r*10+c);
        }).filter(index=>choices.includes(index));
        const smartShot = nearby.length && random() < (.15 + level * .008);
        computer.shots.push(smartShot ? nearby[Math.floor(random()*nearby.length)] : choices[Math.floor(random() * choices.length)]);
        if (allSunk("host", "guest")) {
          battle.phase = "finished";
          battle.winner = "guest";
        } else {
          battle.turn = "host";
        }
      }
    }
    drawBattle();
    await syncGameState(battle);
  }));
  drawBattle();
  serverBattleControls=wireBattleshipMultiplayer(()=>battle.players[role()].ships,applySeaState);
}

const parentDialog = $("#parent-dialog");
let parentCodeSession = "";
let parentReportText = "";

async function parentRequest(action, settings) {
  const response = await fetch("/api/parent", {
    method:"POST",
    headers:{ "Content-Type":"application/json", Authorization:`Bearer ${state.authToken}` },
    body:JSON.stringify({ action, parentCode:parentCodeSession, settings }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || "PARENT_FAILED"), { code:data.error });
  return data;
}

function renderParentDashboard(data) {
  setParentSettings(data.settings);
  const stats = data.progress.stats || {};
  const totalMinutes = Math.round(Object.values(stats).reduce((sum, item) => sum + (item.totalSeconds || 0), 0) / 60);
  const favorite = games.slice().sort((left,right) => (stats[right.id]?.wins || 0) - (stats[left.id]?.wins || 0))[0];
  const favoriteTitle = (stats[favorite?.id]?.wins || 0) > 0 ? favorite.title : "Nog ontdekken";
  const highestLevel = Math.max(1, ...Object.values(data.progress.levels || {}).map(Number));
  $("#parent-summary").innerHTML = `<div><small>PROFIEL</small><strong id="parent-child-name"></strong></div>
    <div><small>SPEELTIJD</small><strong>${totalMinutes} min</strong></div>
    <div><small>HOOGSTE LEVEL</small><strong>${highestLevel}</strong></div>
    <div><small>FAVORIET</small><strong>${favoriteTitle}</strong></div>
    <div><small>TECHNISCHE FOUTEN · 7 DAGEN</small><strong>${data.system?.recentErrors || 0}</strong></div>
    <div><small>DIENSTSTATUS</small><strong id="parent-service-health">Controleren…</strong></div>`;
  $("#parent-child-name").textContent = data.player.name;
  renderPositiveParentReport(data);
  $("#parent-game-stats").innerHTML = games.map(game => {
    const item = stats[game.id] || { attempts:0, wins:0, totalSeconds:0 };
    const success = item.attempts ? Math.round(item.wins / item.attempts * 100) : 0;
    return `<div><span>${game.icon}</span><strong>${game.title}</strong><small>${item.wins} voltooid · ${success}% succes · ${Math.round(item.totalSeconds / 60)} min</small></div>`;
  }).join("");
  $("#setting-multiplayer").checked = data.settings.multiplayerEnabled !== false;
  $("#setting-paused").checked = data.settings.paused === true;
  $("#setting-word-level").value = data.settings.wordLevel || "auto";
  $("#setting-math-level").value = data.settings.mathLevel || "auto";
  $("#parent-unlock-form").classList.add("hidden");
  $("#parent-dashboard-content").classList.remove("hidden");
  fetch("/api/health").then(response => response.json()).then(health => {
    $("#parent-service-health").textContent = health.status === "ok" ? "Alles werkt" : "Aandacht nodig";
  }).catch(() => { $("#parent-service-health").textContent = "Niet bereikbaar"; });
}

function renderPositiveParentReport(data) {
  const progress = data.progress || {}, stats = progress.stats || {};
  const played = games.filter(game => (stats[game.id]?.attempts || 0) > 0);
  const completedRounds = Object.values(stats).reduce((sum,item) => sum + (item.wins || 0),0);
  const highestLevel = Math.max(1,...Object.values(progress.levels || {}).map(Number));
  const activeDays = recentActivityKeys(14).filter(key => (progress.activity?.[key] || []).length).length;
  const favorite = games.slice().sort((a,b) => (stats[b.id]?.wins || 0) - (stats[a.id]?.wins || 0))[0];
  const favoriteWins = stats[favorite?.id]?.wins || 0;
  const supportGame = games.slice().sort((a,b) => (progress.support?.[b.id]?.streak || 0) - (progress.support?.[a.id]?.streak || 0))[0];
  const supportStreak = progress.support?.[supportGame?.id]?.streak || 0;
  const highlights = [];
  if (completedRounds > 0) highlights.push(["🌟","Volhouden",`${completedRounds} ronde${completedRounds === 1 ? "" : "s"} met succes afgerond.`]);
  else highlights.push(["🌱","Mooie start","Er ligt nog een hele speelwereld klaar om rustig te ontdekken."]);
  if (played.length >= 3) highlights.push(["🧭","Nieuwsgierig",`${played.length} verschillende spellen uitgeprobeerd.`]);
  else highlights.push(["🪐","Eigen tempo",played.length ? `${played.length} spel${played.length === 1 ? "" : "len"} rustig leren kennen.` : "De eerste spelkeuze mag helemaal op eigen tempo gebeuren."]);
  if (favoriteWins > 0) highlights.push(["💛","Graag gespeeld",`${favorite.title} lijkt op dit moment veel speelplezier te geven.`]);
  else if (highestLevel > 1) highlights.push(["🚀","Vooruitgang",`Al tot niveau ${highestLevel} op ruimtemissie.`]);
  else highlights.push(["🎈","Zonder druk","Spelen en ontdekken mag hier belangrijker zijn dan winnen."]);
  let suggestion = "Kies samen één kort spel en laat het kind zelf bepalen of er daarna nog een ronde komt.";
  if (supportStreak >= 2) suggestion = `${supportGame.title} vraagt momenteel wat extra oefening. Speel eens samen en gebruik de rustige hint wanneer dat fijn voelt.`;
  else if (played.length < 4) {
    const unplayed = games.find(game => !played.includes(game));
    suggestion = `Probeer samen eens ${unplayed?.title || "een nieuw spel"} voor extra afwisseling, zonder doel of tijdsdruk.`;
  } else if (activeDays >= 5) suggestion = "Er is de voorbije twee weken regelmatig gespeeld. Een speelpauze of een gezamenlijke ronde kan even waardevol zijn.";
  else if (favoriteWins > 0) suggestion = `Laat het kind kiezen: verder met ${favorite.title}, of juist één heel ander spel ontdekken.`;
  $("#parent-highlights").innerHTML = highlights.map(([icon,title,text]) => `<article class="parent-highlight"><span>${icon}</span><div><strong>${title}</strong><p>${text}</p></div></article>`).join("");
  $("#parent-suggestion-text").textContent = suggestion;
  parentReportText = `${data.player.name} — positieve Speelplaneet-terugblik\n\n${highlights.map(([,title,text]) => `${title}: ${text}`).join("\n")}\n\nRustige volgende stap: ${suggestion}\n\nGeen ranglijst of vergelijking met andere kinderen.`;
}

$("#copy-parent-report").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(parentReportText); toast("De positieve samenvatting is gekopieerd."); }
  catch { toast("Kopiëren lukte niet op dit apparaat."); }
});

$("#parent-dashboard").addEventListener("click", () => {
  if (!state.authToken) return toast("Meld dit profiel eerst online aan.");
  parentCodeSession = "";
  $("#parent-unlock-form").reset();
  $("#parent-unlock-form").classList.remove("hidden");
  $("#parent-dashboard-content").classList.add("hidden");
  parentDialog.showModal();
  setTimeout(() => $("#dashboard-parent-code").focus(), 50);
});
$("#close-parent-dialog").addEventListener("click", () => parentDialog.close());
$("#parent-unlock-form").addEventListener("submit", async event => {
  event.preventDefault();
  parentCodeSession = $("#dashboard-parent-code").value;
  try { renderParentDashboard(await parentRequest("overview")); }
  catch (error) {
    const messages = { RECOVERY_NOT_SET:"Stel eerst Ouderherstel in.", WRONG_PARENT_CODE:"De oudercode klopt niet.", TEMPORARILY_LOCKED:"Te veel pogingen. Probeer over 15 minuten opnieuw." };
    toast(messages[error.code] || "De ouderomgeving kon niet worden geopend.");
  }
});
$("#parent-settings-form").addEventListener("submit", async event => {
  event.preventDefault();
  const settings = {
    multiplayerEnabled:$("#setting-multiplayer").checked,
    paused:$("#setting-paused").checked,
    wordLevel:$("#setting-word-level").value,
    mathLevel:$("#setting-math-level").value,
  };
  try {
    renderParentDashboard(await parentRequest("settings", settings));
    renderHome();
    toast("Ouderinstellingen veilig bewaard.");
  } catch { toast("De instellingen konden niet worden bewaard."); }
});
$("#export-parent-data").addEventListener("click", async () => {
  try {
    const data = await parentRequest("export");
    const blob = new Blob([JSON.stringify(data.export, null, 2)], { type:"application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `speelplaneet-${state.player.name.toLowerCase().replace(/[^a-z0-9]+/g,"-")}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast("Gegevensbestand gedownload.");
  } catch { toast("De gegevens konden niet worden gedownload."); }
});
$("#delete-player-profile").addEventListener("click", async () => {
  if (!window.confirm(`Alle voortgang van ${state.player.name} wordt definitief verwijderd. Wil je echt doorgaan?`)) return;
  if (!window.confirm("Dit kan niet ongedaan worden gemaakt. Profiel nu verwijderen?")) return;
  try {
    await parentRequest("delete");
    localStorage.removeItem("speelplaneet-auth-token");
    localStorage.removeItem("speelplaneet-player");
    localStorage.removeItem(playerProgressKey(state.player.name));
    localStorage.removeItem(parentSettingsKey(state.player.name));
    localStorage.removeItem("speelplaneet-progress");
    window.location.reload();
  } catch { toast("Het profiel kon niet worden verwijderd."); }
});

let recoveryMode = "reset";
const recoveryDialog = $("#recovery-dialog");

function openRecovery(mode) {
  recoveryMode = mode;
  const setup = mode === "setup";
  $("#recovery-title").textContent = setup ? "Ouderherstel instellen" : "Pincode herstellen";
  $("#recovery-intro").textContent = setup
    ? `Kies een geheime oudercode voor ${state.player?.name || "deze speler"}.`
    : "Gebruik de oudercode om een nieuwe spelerspincode te kiezen.";
  $("#recovery-name-wrap").classList.toggle("hidden", setup);
  $("#new-pin-wrap").classList.toggle("hidden", setup);
  $("#recovery-name").required = !setup;
  $("#recovery-new-pin").required = !setup;
  $("#recovery-submit").textContent = setup ? "Oudercode bewaren" : "Pincode herstellen";
  $("#recovery-form").reset();
  recoveryDialog.showModal();
  setTimeout(() => (setup ? $("#parent-code") : $("#recovery-name")).focus(), 50);
}

$("#forgot-pin").addEventListener("click", () => openRecovery("reset"));
$("#parent-recovery").addEventListener("click", () => {
  if (!state.authToken) return toast("Meld dit profiel eerst online aan om ouderherstel in te stellen.");
  openRecovery("setup");
});
$("#close-recovery").addEventListener("click", () => recoveryDialog.close());
$("#recovery-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = $("#recovery-submit");
  button.disabled = true;
  const body = recoveryMode === "setup"
    ? { action:"setup", parentCode:$("#parent-code").value }
    : { action:"reset", name:$("#recovery-name").value.trim(), parentCode:$("#parent-code").value, newPin:$("#recovery-new-pin").value };
  try {
    const response = await fetch("/api/parent", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        ...(recoveryMode === "setup" ? { Authorization:`Bearer ${state.authToken}` } : {}),
      },
      body:JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        WRONG_PARENT_CODE:"De oudercode klopt niet.",
        RECOVERY_NOT_SET:"Voor deze speler is nog geen oudercode ingesteld.",
        TEMPORARILY_LOCKED:"Te veel pogingen. Wacht 15 minuten.",
        INVALID_SESSION:"Meld het profiel opnieuw aan.",
      };
      return toast(messages[data.error] || "Herstel lukt nu niet. Probeer later opnieuw.");
    }
    recoveryDialog.close();
    toast(recoveryMode === "setup" ? "Ouderherstel is veilig ingesteld." : "Nieuwe pincode bewaard. Meld opnieuw aan.");
  } catch {
    toast("Voor ouderherstel is een internetverbinding nodig.");
  } finally {
    button.disabled = false;
  }
});

$("#login-form").addEventListener("submit", async event => {
  event.preventDefault();
  const name = $("#player-name").value.trim();
  const pin = $("#player-pin").value;
  if (!name || !/^\d{4}$/.test(pin)) return;
  const button = event.currentTarget.querySelector("button[type=submit]");
  const originalLabel = button.innerHTML;
  button.disabled = true;
  button.textContent = "Even aanmelden…";
  const stored = localStorage.getItem(playerProgressKey(name));
  const localProgress = stored ? JSON.parse(stored) : { stars:0, completed:[], gameWins:{}, levels:{}, runnerHighscores:{} };
  state.parentSettings = JSON.parse(localStorage.getItem(parentSettingsKey(name)) || "null");
  try {
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, pin, initialProgress: localProgress }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) return toast("Deze pincode klopt niet.");
    if (response.status === 429) return toast("Te veel pogingen. Wacht 15 minuten.");
    if (!response.ok) throw new Error(data.error || "offline");
    state.player = data.player;
    state.authToken = data.token;
    setParentSettings(data.settings);
    state.progress = mergeProgress(localProgress, data.progress);
    localStorage.setItem("speelplaneet-auth-token", state.authToken);
    saveProgress();
    setSyncStatus("Gesynchroniseerd", true);
  } catch {
    state.player = { name };
    state.authToken = "";
    state.progress = mergeProgress(localProgress, {});
    setSyncStatus("Offline bewaard");
    toast("Je speelt lokaal; online synchronisatie is nu niet bereikbaar.");
  } finally {
    button.disabled = false;
    button.innerHTML = originalLabel;
  }
  localStorage.setItem("speelplaneet-player", JSON.stringify(state.player));
  showDashboard();
  handlePendingInvite();
});

document.querySelectorAll('[data-action="home"]').forEach(button => button.addEventListener("click", renderHome));
$("#accessibility-button").addEventListener("click", () => {
  applyAccessibility();
  $("#accessibility-dialog").showModal();
  if (accessibility.music) setMusic(true);
});
$("#privacy-button").addEventListener("click", () => $("#privacy-dialog").showModal());
$("#close-privacy").addEventListener("click", () => $("#privacy-dialog").close());
$("#close-accessibility").addEventListener("click", () => $("#accessibility-dialog").close());
document.querySelectorAll("[data-accessibility]").forEach(input => input.addEventListener("change", () => {
  accessibility[input.dataset.accessibility] = input.checked;
  localStorage.setItem("speelplaneet-accessibility", JSON.stringify(accessibility));
  applyAccessibility();
  if (input.dataset.accessibility === "music") setMusic(input.checked);
}));
const finishTutorial = () => {
  const dialog = $("#tutorial-dialog");
  if (dialog.dataset.game) localStorage.setItem(`speelplaneet-tutorial-${dialog.dataset.game}`, "1");
  dialog.close();
};
$("#close-tutorial").addEventListener("click", finishTutorial);
$("#tutorial-start").addEventListener("click", finishTutorial);
$("#fullscreen-game").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await gameScreen.requestFullscreen();
  } catch { toast("Volledig scherm wordt op dit apparaat niet ondersteund."); }
});
$("#pause-game").addEventListener("click", () => {
  if (state.gamePaused) resumeActiveGame();
  else pauseActiveGame();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseActiveGame();
});
$("#reset-profile").addEventListener("click", () => {
  const oldToken = state.authToken;
  if (oldToken) fetch("/api/logout", { method:"POST", headers:{ Authorization:`Bearer ${oldToken}` } }).catch(() => {});
  localStorage.removeItem("speelplaneet-player");
  localStorage.removeItem("speelplaneet-auth-token");
  state.player = null;
  state.authToken = "";
  state.parentSettings = null;
  state.progress = { stars:0, completed:[], gameWins:{}, levels:{}, runnerHighscores:{} };
  dashboardView.classList.add("hidden");
  loginView.classList.remove("hidden");
  $("#player-name").focus();
});

initializeOnline();
if (state.player) {
  showDashboard();
  refreshCloudProgress();
}

let deferredInstallPrompt = null;
const installButton = $("#install-app");
const connectivityBanner = $("#connectivity-banner");
const updateBanner = $("#update-banner");
function updateConnectivityStatus() {
  connectivityBanner.classList.toggle("hidden", navigator.onLine);
  if (navigator.onLine && state.player) setSyncStatus(state.authToken ? "Online" : "Lokaal profiel",Boolean(state.authToken));
  if (!navigator.onLine && state.player) setSyncStatus("Offline bewaard");
}
window.addEventListener("online", () => {
  updateConnectivityStatus();
  toast("Je bent weer online. De voortgang wordt bijgewerkt.");
  refreshCloudProgress();
});
window.addEventListener("offline", updateConnectivityStatus);
updateConnectivityStatus();
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.classList.remove("hidden");
});
installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  if (choice.outcome === "accepted") installButton.classList.add("hidden");
  deferredInstallPrompt = null;
});
window.addEventListener("appinstalled", () => {
  installButton.classList.add("hidden");
  deferredInstallPrompt = null;
  toast("Speelplaneet staat nu als app op dit toestel!");
});
$("#dismiss-update").addEventListener("click", () => updateBanner.classList.add("hidden"));
$("#apply-update").addEventListener("click", () => window.location.reload());

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/service-worker.js");
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) updateBanner.classList.remove("hidden");
        });
      });
      setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
    } catch {}
  });
}
