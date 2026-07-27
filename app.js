const games = [
  { id: "zeeslag", title: "Zeeslag", icon: "🚢", color: "blue", description: "Vind de verstopte schepen!", modes: "Solo · Samen" },
  { id: "galgje", title: "Galgje", icon: "🔤", color: "orange", description: "Raad het woord, letter voor letter.", modes: "Solo · Samen" },
  { id: "sudoku", title: "Mini Sudoku", icon: "🧩", color: "purple", description: "Vul ieder vakje slim in.", modes: "Levels 1–10" },
  { id: "woordzoeker", title: "Woordzoeker", icon: "🔎", color: "green", description: "Speur alle woorden op.", modes: "Levels 1–10" },
];

const state = {
  player: JSON.parse(localStorage.getItem("speelplaneet-player") || "null"),
  progress: JSON.parse(localStorage.getItem("speelplaneet-progress") || '{"stars":0,"completed":[],"gameWins":{}}'),
  activeGame: null,
};

const $ = (selector) => document.querySelector(selector);
const loginView = $("#login-view");
const dashboardView = $("#dashboard-view");
const homeScreen = $("#home-screen");
const gameScreen = $("#game-screen");
const stage = $("#game-stage");

function saveProgress() {
  localStorage.setItem("speelplaneet-progress", JSON.stringify(state.progress));
}

function toast(message) {
  const box = $("#toast");
  box.textContent = message;
  box.classList.add("show");
  setTimeout(() => box.classList.remove("show"), 2500);
}

function showDashboard() {
  loginView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  $("#profile-name").textContent = state.player.name;
  $("#avatar").textContent = state.player.name[0].toUpperCase();
  renderHome();
}

function renderHome() {
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
  $("#daily-count").textContent = `${Math.min(new Set(state.progress.completed).size, 2)} / 2`;
  $("#game-grid").innerHTML = games.map(game => `
    <button class="game-card" data-game="${game.id}" aria-label="Speel ${game.title}">
      <div class="game-icon icon-${game.color}">${game.icon}</div>
      <h4>${game.title}</h4>
      <p>${game.description}</p>
      <div class="card-footer"><span>${game.modes}</span><span class="play-arrow">→</span></div>
    </button>`).join("");
  document.querySelectorAll("[data-game]").forEach(button => {
    button.addEventListener("click", () => openGame(button.dataset.game));
  });
}

function completeGame(gameId, message) {
  state.progress.stars += 1;
  state.progress.completed.push(gameId);
  state.progress.gameWins[gameId] = (state.progress.gameWins[gameId] || 0) + 1;
  saveProgress();
  toast(`${message} ⭐ Je verdient een ster!`);
}

function openGame(id) {
  state.activeGame = id;
  homeScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  if (id === "galgje") renderHangman();
  if (id === "sudoku") renderSudoku();
  if (id === "woordzoeker") renderWordSearch();
  if (id === "zeeslag") renderBattleship();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function sidePanel(title, text, code = true) {
  const join = Math.random().toString(36).slice(2, 5).toUpperCase() + "-" + Math.floor(100 + Math.random() * 900);
  return `<aside class="side-panel">
    <p class="eyebrow">SAMEN SPELEN</p><h3>${title}</h3><p>${text}</p>
    ${code ? `<div class="join-code">${join}</div><button class="mini-button" data-copy="${join}">Kopieer joincode</button>` : ""}
  </aside>`;
}

function wireCopy() {
  const button = document.querySelector("[data-copy]");
  if (!button) return;
  button.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(button.dataset.copy); } catch {}
    toast("Joincode gekopieerd!");
  });
}

function renderHangman() {
  const words = ["PLANEET", "DOLFIJN", "REGENBOOG", "KASTEEL", "PANNENKOEK", "VLINDER"];
  const word = words[Math.floor(Math.random() * words.length)];
  const guessed = new Set();
  let mistakes = 0;
  stage.innerHTML = `<div class="game-layout">
    <div class="game-panel">
      <p class="eyebrow">WOORDSPEL</p><h2>🔤 Galgje</h2><p class="game-subtitle">Raad het geheime woord voordat de raket vertrekt.</p>
      <div class="status-box" id="hang-status">Raketbrandstof: <span>●●●●●●</span></div>
      <div class="word-display" id="hang-word"></div>
      <div class="letter-grid" id="letters"></div>
    </div>
    ${sidePanel("Nodig iemand uit", "De joincode is alvast klaar. Koppel later Supabase om op twee apparaten tegelijk te spelen.")}
  </div>`;
  const draw = () => {
    $("#hang-word").textContent = [...word].map(letter => guessed.has(letter) ? letter : "_").join(" ");
    $("#hang-status").innerHTML = `Raketbrandstof: <span>${"●".repeat(6 - mistakes)}${"○".repeat(mistakes)}</span>`;
    const won = [...word].every(letter => guessed.has(letter));
    if (won) {
      $("#hang-status").textContent = "Geweldig! Je hebt het woord gevonden.";
      completeGame("galgje", "Galgje opgelost!");
      document.querySelectorAll(".letter-button").forEach(b => b.disabled = true);
    } else if (mistakes >= 6) {
      $("#hang-status").textContent = `Bijna! Het woord was ${word}. Probeer opnieuw.`;
      document.querySelectorAll(".letter-button").forEach(b => b.disabled = true);
    }
  };
  $("#letters").innerHTML = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(l => `<button class="letter-button">${l}</button>`).join("");
  document.querySelectorAll(".letter-button").forEach(button => button.addEventListener("click", () => {
    button.disabled = true;
    guessed.add(button.textContent);
    if (!word.includes(button.textContent)) mistakes++;
    draw();
  }));
  draw(); wireCopy();
}

function renderSudoku() {
  const puzzle = [1,0,0,4, 0,4,1,0, 0,1,4,0, 4,0,0,1];
  const solution = [1,2,3,4, 3,4,1,2, 2,1,4,3, 4,3,2,1];
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
    else toast("Er klopt nog iets niet. Kijk rustig nog eens.");
  });
}

function renderWordSearch() {
  const rows = ["STERABCD","QZEEFGHI","JKLMNOPQ","RAKETUVW","XYZAARDE","BCDEFGHI","MAANJKLM","NOPQRSTU"];
  const words = ["STER", "ZEE", "RAKET", "AARDE", "MAAN"];
  const found = new Set();
  let selected = [];
  stage.innerHTML = `<div class="game-layout">
    <div class="game-panel">
      <p class="eyebrow">LEVEL 1 · SPEUREN</p><h2>🔎 Woordzoeker</h2><p class="game-subtitle">Tik de letters van een woord van links naar rechts aan.</p>
      <div class="wordsearch-grid">${rows.join("").split("").map((l,i) => `<button class="wordsearch-cell" data-index="${i}">${l}</button>`).join("")}</div>
      <div class="word-list">${words.map(w => `<span class="word-pill" data-word="${w}">${w}</span>`).join("")}</div>
    </div>
    ${sidePanel("Zoektip", "Alle woorden staan in deze eerste ronde horizontaal. Een volgend level kan ook verticaal en schuin.", false)}
  </div>`;
  document.querySelectorAll(".wordsearch-cell").forEach(cell => cell.addEventListener("click", () => {
    const index = Number(cell.dataset.index);
    if (selected.length && index !== selected[selected.length - 1] + 1) {
      document.querySelectorAll(".wordsearch-cell.selected").forEach(c => c.classList.remove("selected"));
      selected = [];
    }
    selected.push(index);
    cell.classList.add("selected");
    const attempt = selected.map(i => rows.join("")[i]).join("");
    if (words.includes(attempt)) {
      found.add(attempt);
      document.querySelector(`[data-word="${attempt}"]`).classList.add("found");
      selected = [];
      setTimeout(() => document.querySelectorAll(".wordsearch-cell.selected").forEach(c => c.classList.remove("selected")), 400);
      if (found.size === words.length) completeGame("woordzoeker", "Alle woorden gevonden!");
    } else if (!words.some(w => w.startsWith(attempt))) {
      setTimeout(() => {
        document.querySelectorAll(".wordsearch-cell.selected").forEach(c => c.classList.remove("selected"));
        selected = [];
      }, 250);
    }
  }));
}

function renderBattleship() {
  const ships = new Set();
  while (ships.size < 6) ships.add(Math.floor(Math.random() * 36));
  let shots = 0, hits = 0;
  stage.innerHTML = `<div class="game-layout">
    <div class="game-panel">
      <p class="eyebrow">OCEAANMISSIE</p><h2>🚢 Zeeslag</h2><p class="game-subtitle">Vind de 6 verstopte schepen. Je hebt 18 schoten.</p>
      <div class="status-box" id="sea-status">Schoten over: 18 · Schepen gevonden: 0 / 6</div>
      <div class="sea-grid">${Array.from({length:36}, (_,i) => `<button class="sea-cell" data-sea="${i}" aria-label="Vak ${i+1}">🌊</button>`).join("")}</div>
    </div>
    ${sidePanel("Start een zeeslag", "Deel deze kamer met iemand die je kent. Online zetten worden actief na de databasekoppeling.")}
  </div>`;
  document.querySelectorAll(".sea-cell").forEach(cell => cell.addEventListener("click", () => {
    if (cell.disabled || shots >= 18 || hits === 6) return;
    cell.disabled = true; shots++;
    if (ships.has(Number(cell.dataset.sea))) { cell.textContent = "🚢"; cell.classList.add("hit"); hits++; }
    else { cell.textContent = "💦"; cell.classList.add("miss"); }
    $("#sea-status").textContent = `Schoten over: ${18-shots} · Schepen gevonden: ${hits} / 6`;
    if (hits === 6) completeGame("zeeslag", "Alle schepen gevonden!");
    else if (shots === 18) toast("De vloot ontsnapte. Nog een poging?");
  }));
  wireCopy();
}

$("#login-form").addEventListener("submit", event => {
  event.preventDefault();
  const name = $("#player-name").value.trim();
  const pin = $("#player-pin").value;
  if (!name || !/^\d{4}$/.test(pin)) return;
  state.player = { name, pinHint: pin.slice(-1) };
  localStorage.setItem("speelplaneet-player", JSON.stringify(state.player));
  showDashboard();
});

document.querySelectorAll('[data-action="home"]').forEach(button => button.addEventListener("click", renderHome));
$("#reset-profile").addEventListener("click", () => {
  localStorage.removeItem("speelplaneet-player");
  state.player = null;
  dashboardView.classList.add("hidden");
  loginView.classList.remove("hidden");
  $("#player-name").focus();
});

if (state.player) showDashboard();
