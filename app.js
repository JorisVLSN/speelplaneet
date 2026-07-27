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
  supabase: null,
  room: null,
  roomChannel: null,
  roomListener: null,
  sessionId: localStorage.getItem("speelplaneet-session") || crypto.randomUUID(),
  inviteHandled: false,
};
localStorage.setItem("speelplaneet-session", state.sessionId);

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
    !["zeeslag", "galgje"].includes(pendingInvite.game) ||
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
  saveProgress();
  toast(`${message} ⭐ Je verdient een ster!`);
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
    const gameName = gameType === "zeeslag" ? "Zeeslag" : "Galgje";
    const message = `Kom je ${gameName} met mij spelen op Speelplaneet? Open deze link en je komt meteen in mijn spel: ${invitationUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  });
}

function renderHangman() {
  const words = ["PLANEET", "DOLFIJN", "REGENBOOG", "KASTEEL", "PANNENKOEK", "VLINDER"];
  let word = words[Math.floor(Math.random() * words.length)];
  const guessed = new Set();
  let mistakes = 0;
  stage.innerHTML = `<div class="game-layout">
    <div class="game-panel">
      <p class="eyebrow">WOORDSPEL</p><h2>🔤 Galgje</h2><p class="game-subtitle">Raad het geheime woord voordat de raket vertrekt.</p>
      <div class="status-box" id="hang-status">Raketbrandstof: <span>●●●●●●</span></div>
      <div class="word-display" id="hang-word"></div>
      <div class="letter-grid" id="letters"></div>
    </div>
    ${sidePanel("Nodig iemand uit", "Maak een kamer of vul de code van iemand anders in. Jullie raden samen hetzelfde woord.")}
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
        computer.shots.push(choices[Math.floor(Math.random() * choices.length)]);
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
