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
];

const state = {
  player: JSON.parse(localStorage.getItem("speelplaneet-player") || "null"),
  progress: JSON.parse(localStorage.getItem("speelplaneet-progress") || '{"stars":0,"completed":[],"gameWins":{}}'),
  activeGame: null,
  supabase: null,
  room: null,
  roomChannel: null,
  roomListener: null,
  sessionId: localStorage.getItem("speelplaneet-session") || crypto.randomUUID(),
  inviteHandled: false,
};
localStorage.setItem("speelplaneet-session", state.sessionId);
state.progress.levels ||= {};

const inviteParams = new URLSearchParams(window.location.search);
const pendingInvite = {
  game: inviteParams.get("game"),
  code: inviteParams.get("code"),
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

function gameLevel(gameId = state.activeGame) {
  return Math.min(100, Math.max(1, state.progress.levels[gameId] || 1));
}

function difficultyBand(level) {
  if (level <= 20) return "Ontdekker";
  if (level <= 40) return "Speurneus";
  if (level <= 60) return "Avonturier";
  if (level <= 80) return "Expert";
  return "Kampioen";
}

function addLevelBar(gameId) {
  const panel = stage.querySelector(".game-panel");
  if (!panel) return;
  const level = gameLevel(gameId);
  panel.insertAdjacentHTML("afterbegin", `<div class="game-level-bar">
    <div><small>NIVEAU</small><strong>${level} / 100</strong></div>
    <span>${difficultyBand(level)}</span>
    <div class="level-dots">${[20,40,60,80,100].map(mark => `<i class="${level >= mark ? "reached" : ""}"></i>`).join("")}</div>
  </div>`);
}

function toast(message) {
  const box = $("#toast");
  box.textContent = message;
  box.classList.add("show");
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
    !["zeeslag", "galgje", "vieropeenrij", "boterkaaseieren"].includes(pendingInvite.game) ||
    !/^[A-Z]{3}-[0-9]{3}$/i.test(pendingInvite.code || "")
  ) return;
  state.inviteHandled = true;
  openGame(pendingInvite.game);
  await joinRoom(pendingInvite.code, pendingInvite.game);
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
  const previousLevel = gameLevel(gameId);
  state.progress.levels[gameId] = Math.min(100, previousLevel + 1);
  saveProgress();
  toast(previousLevel < 100 ? `${message} ⭐ Niveau ${previousLevel + 1} vrijgespeeld!` : `${message} ⭐ Niveau 100 voltooid!`);
}

function openGame(id) {
  leaveRoom();
  state.activeGame = id;
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
  addLevelBar(id);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function sidePanel(title, text, code = true) {
  return `<aside class="side-panel">
    <p class="eyebrow">SAMEN SPELEN</p><h3>${title}</h3><p>${text}</p>
    ${code ? `<div class="online-actions">
      <button class="mini-button" data-create-room>Maak een kamer</button>
      <span class="online-or">of</span>
      <div class="join-form"><input data-join-input maxlength="7" placeholder="ABC-123" aria-label="Joincode" /><button data-join-room>Meedoen</button></div>
      <div class="room-details hidden" data-room-details>
        <small>JOUW JOINCODE</small>
        <div class="join-code" data-room-code>---</div>
        <button class="mini-button" data-copy-room>Kopieer joincode</button>
        <button class="whatsapp-button" data-share-whatsapp>Deel via WhatsApp</button>
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

function renderHangman() {
  const level = gameLevel("galgje");
  const words = ["MAAN","STER","ROBOT","KASTEEL","DOLFIJN","VLINDER","PLANEET","REGENBOOG","PANNENKOEK","VERREKIJKER","RUIMTESCHIP","SCHATKAART","ONTDEKKINGSREIZIGER"];
  const poolSize = Math.min(words.length, 4 + Math.floor(level / 9));
  let word = words[Math.floor(Math.random() * poolSize)];
  const maxMistakes = Math.max(4, 8 - Math.floor((level - 1) / 25));
  const guessed = new Set();
  let mistakes = 0;
  stage.innerHTML = `<div class="game-layout">
    <div class="game-panel">
      <p class="eyebrow">WOORDSPEL</p><h2>🔤 Galgje</h2><p class="game-subtitle">Raad het geheime woord voordat de raket vertrekt.</p>
      <div class="status-box" id="hang-status">Raketbrandstof: <span>${"●".repeat(maxMistakes)}</span></div>
      <div class="word-display" id="hang-word"></div>
      <div class="letter-grid" id="letters"></div>
    </div>
    ${sidePanel("Nodig iemand uit", "Maak een kamer of vul de code van iemand anders in. Jullie raden samen hetzelfde woord.")}
  </div>`;
  const draw = () => {
    $("#hang-word").textContent = [...word].map(letter => guessed.has(letter) ? letter : "_").join(" ");
    $("#hang-status").innerHTML = `Raketbrandstof: <span>${"●".repeat(maxMistakes - mistakes)}${"○".repeat(mistakes)}</span>`;
    const won = [...word].every(letter => guessed.has(letter));
    if (won) {
      $("#hang-status").textContent = "Geweldig! Je hebt het woord gevonden.";
      completeGame("galgje", "Galgje opgelost!");
      document.querySelectorAll(".letter-button").forEach(b => b.disabled = true);
    } else if (mistakes >= maxMistakes) {
      $("#hang-status").textContent = `Bijna! Het woord was ${word}. Probeer opnieuw.`;
      document.querySelectorAll(".letter-button").forEach(b => b.disabled = true);
    }
  };
  $("#letters").innerHTML = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(l => `<button class="letter-button">${l}</button>`).join("");
  const applyHangmanState = remote => {
    if (!remote || remote.kind !== "galgje") return;
    word = remote.word;
    guessed.clear();
    (remote.guessed || []).forEach(letter => guessed.add(letter));
    mistakes = remote.mistakes || 0;
    document.querySelectorAll(".letter-button").forEach(button => button.disabled = guessed.has(button.textContent));
    draw();
  };
  document.querySelectorAll(".letter-button").forEach(button => button.addEventListener("click", async () => {
    button.disabled = true;
    guessed.add(button.textContent);
    if (!word.includes(button.textContent)) mistakes++;
    draw();
    await syncGameState({ kind: "galgje", word, guessed: [...guessed], mistakes });
  }));
  draw();
  wireMultiplayer("galgje", () => ({ kind: "galgje", word, guessed: [...guessed], mistakes }), applyHangmanState);
}

function renderSudoku() {
  const level = gameLevel("sudoku");
  const solution = [1,2,3,4, 3,4,1,2, 2,1,4,3, 4,3,2,1];
  const clueCount = Math.max(4, 10 - Math.floor((level - 1) / 17));
  const cluePositions = Array.from({length:16},(_,i)=>(i*7+level*3)%16).slice(0,clueCount);
  const puzzle = solution.map((value,index)=>cluePositions.includes(index)?value:0);
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
  const level = gameLevel("woordzoeker");
  const rows = ["STERABCD","QZEEFGHI","JKLMNOPQ","RAKETUVW","XYZAARDE","BCDEFGHI","MAANJKLM","NOPQRSTU"];
  const allWords = ["STER", "ZEE", "RAKET", "AARDE", "MAAN"];
  const words = allWords.slice(0, Math.min(5, 3 + Math.floor((level - 1) / 34)));
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

function renderMemory() {
  const level = gameLevel("memory");
  const allSymbols = ["🚀", "🪐", "⭐", "👽", "🌙", "🛰️", "☄️", "🌍", "🔭", "🛸", "🌌", "👩‍🚀"];
  const pairCount = Math.min(12, 4 + Math.floor((level - 1) / 12));
  const symbols = allSymbols.slice(0, pairCount);
  const cards = [...symbols, ...symbols].sort(() => Math.random() - .5);
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
  let game = { kind: "boterkaaseieren", board: Array(9).fill(null), turn: "host", winner: null };
  const role = () => state.room && state.room.host_id !== state.sessionId ? "guest" : "host";
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
  document.querySelectorAll("[data-ttt]").forEach(cell => cell.addEventListener("click", async () => {
    const i = Number(cell.dataset.ttt);
    if (cell.disabled) return;
    game.board[i] = mark(role());
    game.winner = winner(game.board);
    if (!game.winner) game.turn = role() === "host" ? "guest" : "host";
    if (!state.room && !game.winner) {
      const free = game.board.map((v,i) => v ? null : i).filter(i => i !== null);
      const tactical = symbol => free.find(i => { const test=[...game.board];test[i]=symbol;return winner(test)===symbol; });
      const smart = Math.random() < (.2 + level * .008);
      const choice = smart ? (tactical("O") ?? tactical("X") ?? (free.includes(4) ? 4 : free[Math.floor(Math.random()*free.length)])) : free[Math.floor(Math.random()*free.length)];
      game.board[choice] = "O"; game.winner = winner(game.board); game.turn = "host";
    }
    if (game.winner === mark(role())) completeGame("boterkaaseieren", "Drie op een rij!");
    draw(); await syncGameState(game);
  }));
  draw(); wireMultiplayer("boterkaaseieren", () => game, apply);
}

function renderConnectFour() {
  const level = gameLevel("vieropeenrij");
  let game = { kind: "vieropeenrij", board: Array(42).fill(null), turn: "host", winner: null };
  const role = () => state.room && state.room.host_id !== state.sessionId ? "guest" : "host";
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
  document.querySelectorAll("[data-column]").forEach(cell => cell.addEventListener("click", async () => {
    if (cell.disabled) return;
    const color = token(role());
    drop(game.board, Number(cell.dataset.column), color);
    game.winner = hasFour(game.board, color) ? color : game.board.every(Boolean) ? "draw" : null;
    if (!game.winner) game.turn = role() === "host" ? "guest" : "host";
    if (!state.room && !game.winner) {
      const valid = [0,1,2,3,4,5,6].filter(c => !game.board[c]);
      const winning = valid.find(c=>{const test=[...game.board];drop(test,c,"yellow");return hasFour(test,"yellow");});
      const blocking = valid.find(c=>{const test=[...game.board];drop(test,c,"red");return hasFour(test,"red");});
      const smart = Math.random() < (.15 + level * .0085);
      const preferred = valid.slice().sort((a,b)=>Math.abs(a-3)-Math.abs(b-3));
      const col = smart ? (winning ?? blocking ?? preferred[0]) : valid[Math.floor(Math.random()*valid.length)];
      drop(game.board, col, "yellow");
      game.winner = hasFour(game.board, "yellow") ? "yellow" : game.board.every(Boolean) ? "draw" : null;
      game.turn = "host";
    }
    if (game.winner === color) completeGame("vieropeenrij", "Vier op een rij!");
    draw(); await syncGameState(game);
  }));
  draw(); wireMultiplayer("vieropeenrij", () => game, apply);
}

function renderMastermind() {
  const level = gameLevel("mastermind");
  const colors = ["coral","blue","yellow","purple","green","navy"];
  const codeLength = Math.min(6, 3 + Math.floor((level - 1) / 25));
  const maxTurns = Math.max(6, 10 - Math.floor((level - 1) / 25));
  const secret = Array.from({length:codeLength}, () => colors[Math.floor(Math.random()*colors.length)]);
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
    else if(turn===maxTurns){toast("De code ontsnapte. Probeer een nieuwe ronde!");$("#check-code").disabled=true;}
    else {turn++;guess=[];drawGuess();}
  });
  drawGuess();
}

function renderMathSprint() {
  const level=gameLevel("rekensprint"), total=Math.min(20,8+Math.floor(level/8));
  let question=0, score=0, answer=0;
  stage.innerHTML=`<div class="game-layout"><div class="game-panel math-panel">
    <p class="eyebrow">REKENMISSIE</p><h2>➕ Rekensprint</h2><p class="game-subtitle">Los ${total} sommen op. Rustig nadenken mag!</p>
    <div class="status-box" id="math-status">Som 1 van ${total} · Score: 0</div>
    <div class="math-question" id="math-question"></div>
    <form id="math-form"><input id="math-answer" inputmode="numeric" autocomplete="off" aria-label="Antwoord"><button class="primary-button">Controleer</button></form>
  </div>${sidePanel("Rekentip","Splits een moeilijke som op in twee kleinere stapjes.",false)}</div>`;
  const next=()=>{const range=10+Math.floor(level*1.8),a=2+Math.floor(Math.random()*range),b=2+Math.floor(Math.random()*range);let op="+";if(level>25&&Math.random()>.55)op="-";if(level>65&&Math.random()>.72)op="×";if(op==="+"){answer=a+b;$("#math-question").textContent=`${a} + ${b} = ?`;}else if(op==="-"){answer=Math.abs(a-b);$("#math-question").textContent=`${Math.max(a,b)} − ${Math.min(a,b)} = ?`;}else{const x=2+Math.floor(Math.random()*Math.min(10,2+level/10)),y=2+Math.floor(Math.random()*10);answer=x*y;$("#math-question").textContent=`${x} × ${y} = ?`;}$("#math-answer").value="";$("#math-answer").focus();};
  $("#math-form").addEventListener("submit",e=>{e.preventDefault();if(Number($("#math-answer").value)===answer){score++;toast("Goed gerekend!");}else toast(`Bijna! Het antwoord was ${answer}.`);question++;if(question===total){$("#math-question").textContent=`${score} van de ${total} goed!`;$("#math-form").classList.add("hidden");if(score>=Math.ceil(total*.7))completeGame("rekensprint","Rekensprint voltooid!");}else{$("#math-status").textContent=`Som ${question+1} van ${total} · Score: ${score}`;next();}});
  next();
}

function renderSimon() {
  const gameLvl=gameLevel("simon"), target=Math.min(15,4+Math.floor((gameLvl-1)/9));
  const colors=["coral","blue","yellow","purple"]; let sequence=[],input=[],level=0,accepting=false;
  stage.innerHTML=`<div class="game-layout"><div class="game-panel simon-panel">
    <p class="eyebrow">GEHEUGENMISSIE</p><h2>✨ Sterrenreeks</h2><p class="game-subtitle">Bekijk de lichtjes en tik daarna precies dezelfde reeks.</p>
    <div class="status-box" id="simon-status">Druk op start wanneer je klaar bent.</div>
    <div class="simon-grid">${colors.map(c=>`<button class="simon-pad color-${c}" data-simon="${c}" aria-label="${c}"></button>`).join("")}</div>
    <button class="primary-button" id="start-simon">Start de reeks</button>
  </div>${sidePanel("Onthoudtip","Zeg de kleuren zachtjes in je hoofd terwijl ze oplichten.",false)}</div>`;
  const flash=async()=>{accepting=false;$("#simon-status").textContent=`Kijk goed… level ${level}`;for(const c of sequence){await new Promise(r=>setTimeout(r,350));const p=document.querySelector(`[data-simon="${c}"]`);p.classList.add("flash");await new Promise(r=>setTimeout(r,420));p.classList.remove("flash");}input=[];accepting=true;$("#simon-status").textContent="Jouw beurt!";};
  const advance=()=>{level++;sequence.push(colors[Math.floor(Math.random()*colors.length)]);flash();};
  $("#start-simon").addEventListener("click",()=>{$("#start-simon").classList.add("hidden");advance();});
  document.querySelectorAll("[data-simon]").forEach(p=>p.addEventListener("click",()=>{if(!accepting)return;input.push(p.dataset.simon);const i=input.length-1;if(input[i]!==sequence[i]){accepting=false;$("#simon-status").textContent=`Oeps! Je haalde reeks ${level}.`;$("#start-simon").textContent="Opnieuw";$("#start-simon").classList.remove("hidden");sequence=[];level=0;}else if(input.length===sequence.length){accepting=false;if(level===target){completeGame("simon",`${target} reeksen onthouden!`);$("#simon-status").textContent=`🏆 Alle ${target} reeksen goed onthouden!`;}else setTimeout(advance,650);}}));
}

function renderBattleship() {
  const level = gameLevel("zeeslag");
  const fleet = [5, 4, 3, 3, 2];
  let orientation = "horizontal";
  let selectedShip = 0;
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
    player.ships = [];
    fleet.forEach((length, index) => {
      let placed = false;
      while (!placed) {
        orientation = Math.random() > .5 ? "horizontal" : "vertical";
        const start = Math.floor(Math.random() * 100);
        const cells = cellsForPlacement(start, length);
        if (cells && !cells.some(cell => occupied(player).has(cell))) {
          player.ships.push({ index, length, cells });
          placed = true;
        }
      }
    });
  };

  const drawBattle = () => {
    const mine = battle.players[role()];
    const enemy = battle.players[opponentRole()];
    const myCells = occupied(mine);
    const enemyCells = occupied(enemy);
    const enemyShots = new Set(enemy.shots);
    const myShots = new Set(mine.shots);

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
      if (myShots.has(index) && enemyCells.has(index)) { cell.classList.add("hit"); cell.textContent = "✹"; }
      if (myShots.has(index) && !enemyCells.has(index)) { cell.classList.add("miss"); cell.textContent = "•"; }
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
        const smartShot = nearby.length && Math.random() < (.15 + level * .008);
        computer.shots.push(smartShot ? nearby[Math.floor(Math.random()*nearby.length)] : choices[Math.floor(Math.random() * choices.length)]);
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
  wireMultiplayer("zeeslag", () => battle, applySeaState);
}

$("#login-form").addEventListener("submit", event => {
  event.preventDefault();
  const name = $("#player-name").value.trim();
  const pin = $("#player-pin").value;
  if (!name || !/^\d{4}$/.test(pin)) return;
  state.player = { name, pinHint: pin.slice(-1) };
  localStorage.setItem("speelplaneet-player", JSON.stringify(state.player));
  showDashboard();
  handlePendingInvite();
});

document.querySelectorAll('[data-action="home"]').forEach(button => button.addEventListener("click", renderHome));
$("#reset-profile").addEventListener("click", () => {
  localStorage.removeItem("speelplaneet-player");
  state.player = null;
  dashboardView.classList.add("hidden");
  loginView.classList.remove("hidden");
  $("#player-name").focus();
});

initializeOnline();
if (state.player) showDashboard();
