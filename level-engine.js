(function (root, factory) {
  const engine = factory();
  if (typeof module === "object" && module.exports) module.exports = engine;
  root.SpeelplaneetLevels = engine;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function seedFor(game, level, extra = 0) {
    let hash = 2166136261;
    for (const char of `${game}-${level}-${extra}-speelplaneet`) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function rng(game, level, extra = 0) {
    let seed = seedFor(game, level, extra);
    return () => {
      seed += 0x6D2B79F5;
      let value = seed;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffle(items, random) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index--) {
      const swap = Math.floor(random() * (index + 1));
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  }

  function sudokuSolutions(puzzle, limit = 2) {
    const board = [...puzzle];
    let count = 0;
    const valid = (index, value) => {
      const row = Math.floor(index / 4), column = index % 4;
      for (let cursor = 0; cursor < 4; cursor++) {
        if (board[row * 4 + cursor] === value || board[cursor * 4 + column] === value) return false;
      }
      const rowStart = Math.floor(row / 2) * 2, columnStart = Math.floor(column / 2) * 2;
      for (let r = rowStart; r < rowStart + 2; r++) for (let c = columnStart; c < columnStart + 2; c++) {
        if (board[r * 4 + c] === value) return false;
      }
      return true;
    };
    const solve = () => {
      const index = board.indexOf(0);
      if (index < 0) { count++; return; }
      for (let value = 1; value <= 4 && count < limit; value++) {
        if (!valid(index, value)) continue;
        board[index] = value; solve(); board[index] = 0;
      }
    };
    solve();
    return count;
  }

  function sudoku(level) {
    const random = rng("sudoku", level);
    const digits = shuffle([1, 2, 3, 4], random);
    const base = [0,1,2,3, 2,3,0,1, 1,0,3,2, 3,2,1,0].map(index => digits[index]);
    const rowOrder = (random() < .5 ? [2,3,0,1] : [0,1,2,3]).flatMap((row, index, rows) =>
      index % 2 === 0 && random() < .5 ? [rows[index + 1], row] : index % 2 ? [] : [row, rows[index + 1]]
    );
    const columnOrder = (random() < .5 ? [2,3,0,1] : [0,1,2,3]).flatMap((column, index, columns) =>
      index % 2 === 0 && random() < .5 ? [columns[index + 1], column] : index % 2 ? [] : [column, columns[index + 1]]
    );
    const solution = rowOrder.flatMap(row => columnOrder.map(column => base[row * 4 + column]));
    const puzzle = [...solution];
    const target = Math.max(4, 10 - Math.floor((level - 1) / 17));
    for (const index of shuffle(Array.from({length:16}, (_, i) => i), random)) {
      if (puzzle.filter(Boolean).length <= target) break;
      const saved = puzzle[index]; puzzle[index] = 0;
      if (sudokuSolutions(puzzle) !== 1) puzzle[index] = saved;
    }
    return { kind:"sudoku", level, puzzle, solution, clues:puzzle.filter(Boolean).length };
  }

  const WORDS = ["STER","MAAN","RAKET","AARDE","ROBOT","KOMEET","ZON","SATURNUS","NEVEL","PLANEET","UFO","HELM","MARS","VENUS","RUIMTE","METEOR","SONDE","KOSMOS","KRATER","MELKWEG"];
  const DIRECTIONS = [[0,1]];
  const HANGMAN = [
    ["MAAN","Je ziet haar vaak als een lichte bol in de nacht."],["STER","Een lichtpuntje dat heel ver weg staat."],
    ["ROBOT","Een machine die opdrachten kan uitvoeren."],["KASTEEL","Een groot oud gebouw met torens."],
    ["DOLFIJN","Een slim zeedier dat graag uit het water springt."],["VLINDER","Begint als rups en krijgt later vleugels."],
    ["PLANEET","Een grote bol die rond een ster draait."],["REGENBOOG","Kleurenboog die na regen kan verschijnen."],
    ["PANNENKOEK","Een ronde lekkernij uit de koekenpan."],["VERREKIJKER","Hiermee bekijk je iets ver weg van dichtbij."],
    ["RUIMTESCHIP","Vervoert astronauten buiten de aarde."],["SCHATKAART","Hierop staat waar een verborgen buit ligt."],
    ["ASTRONAUT","Iemand die voor zijn werk de ruimte in gaat."],["KOMEET","Een ijzige ruimtebal met een lange staart."],
    ["RAKET","Schiet omhoog om iets naar de ruimte te brengen."],["SATELLIET","Draait rond een planeet en stuurt informatie."],
    ["METEORIET","Een ruimtesteen die op een planeet terechtkomt."],["ZONNESTELSEL","De zon met alles wat eromheen draait."],
    ["TELESCOOP","Instrument om heel ver de ruimte in te kijken."],["RUIMTESTATION","Een woning en werkplek die rond de aarde zweeft."],
    ["ZWAARTEKRACHT","Trekt alles naar de grond."],["MAANLANDER","Ruimtevaartuig dat op de maan neerkomt."],
    ["STERRENHEMEL","De nachtelijke lucht vol lichtpuntjes."],["MELKWEG","Het sterrenstelsel waarin onze aarde ligt."],
    ["KOSMONAUT","Een andere benaming voor een ruimtevaarder."],["LUCHTSLUIS","De veilige deur tussen een schip en de ruimte."],
    ["PLANETOIDE","Een kleine rotsachtige wereld in de ruimte."],["KRATER","Een ronde kuil door een inslag of vulkaan."],
    ["RUIMTEPAK","Beschermende kleding voor buiten een ruimteschip."],["EENDHOORN","Een sprookjespaard met één hoorn."],
    ["DRAAK","Een sprookjesdier dat vaak vuur kan spuwen."],["PIRATENSCHIP","Een zeilschip van rovers op zee."],
    ["SCHATEILAND","Een eiland waar een geheime buit verstopt ligt."],["TOVERSTAF","Magisch stokje uit sprookjes."],
    ["ZEEMEERMIN","Half mens en half vis."],["RIDDER","Droeg vroeger een harnas en vocht met een zwaard."],
    ["PRINSES","Dochter van een koning of koningin."],["TOVENAAR","Sprookjesfiguur die magie gebruikt."],
    ["KABOUTER","Klein sprookjesfiguur met vaak een puntmuts."],["OLIFANT","Groot dier met een slurf."],
    ["GIRAFFE","Dier met een bijzonder lange nek."],["KROKODIL","Groot reptiel met een lange bek vol tanden."],
    ["PINGUIN","Vogel die niet vliegt maar uitstekend zwemt."],["PAPEGAAI","Kleurrijke vogel die geluiden kan nadoen."],
    ["KANGOEROE","Springend dier dat zijn jong in een buidel draagt."],["SCHILDPAD","Langzaam dier met een hard huis op zijn rug."],
    ["EGEL","Klein dier met stekels."],["KONIJN","Dier met lange oren dat graag huppelt."],
    ["PAARD","Dier waarop mensen kunnen rijden."],["APPEL","Ronde vrucht die vaak rood of groen is."],
    ["BANAAN","Kromme gele vrucht."],["AARDBEI","Kleine rode vrucht met pitjes aan de buitenkant."],
    ["WATERMELOEN","Grote groene vrucht die vanbinnen rood is."],["SINAASAPPEL","Oranje citrusvrucht vol sap."],
    ["BROCCOLI","Groene groente die op kleine boompjes lijkt."],["WORTEL","Oranje groente die onder de grond groeit."],
    ["TOMATENSOEP","Rode soep gemaakt van een bekende vruchtgroente."],["IJSJE","Koude zoete traktatie die kan smelten."],
    ["CHOCOLADE","Zoete lekkernij gemaakt van cacao."],["FIETS","Voertuig met twee wielen en trappers."],
    ["STEP","Voertuig waarop je met één voet afzet."],["SKATEBOARD","Plank met vier kleine wielen."],
    ["TREIN","Rijdt over rails van station naar station."],["VLIEGTUIG","Groot voertuig met vleugels dat door de lucht reist."],
    ["HELIKOPTER","Vliegt met draaiende wieken bovenop."],["ONDERZEEER","Vaartuig dat diep onder water kan varen."],
    ["BRANDWEERWAGEN","Rood hulpvoertuig met sirene en blusmateriaal."],["TRACTOR","Sterk voertuig dat vaak op een boerderij werkt."],
    ["SCOOTER","Gemotoriseerd voertuig met twee wielen."],["KOMPAS","Wijst waar het noorden en de andere windrichtingen zijn."],["BIBLIOTHEEK","Plaats waar je veel boeken kunt lenen."],
    ["SCHOOLBORD","Hierop schrijft de leerkracht tijdens de les."],["POTLOOD","Hiermee schrijf je en kun je ook weer gummen."],
    ["GUM","Hiermee haal je potloodstrepen weg."],["WERELDKAART","Toont landen en oceanen van de hele aarde."],
    ["RUGZAK","Tas die je met twee banden op je rug draagt."],["REKENBOEK","Schoolboek vol getallen en sommen."],
    ["LEESBOEK","Boek waarin je verhalen oefent of ontdekt."],["PASSER","Tekengereedschap waarmee je een cirkel maakt."],
    ["LINIAAL","Rechte meetlat om lijnen te trekken."],["VOETBAL","Ronde bal die je vooral met je voeten speelt."],
    ["BASKETBAL","Bal die je door een hoge ring probeert te gooien."],["TENNISRACKET","Hiermee sla je een tennisbal over het net."],
    ["ZWEMBAD","Grote bak water om in te zwemmen."],["TURNZAAL","Sportzaal met matten en turntoestellen."],
    ["MEDAILLE","Prijs die aan een lint om je nek hangt."],["DOELPUNT","Je scoort dit wanneer de bal in het doel gaat."],
    ["SCHEIDSRECHTER","Zorgt dat spelers de sportregels volgen."],["SPORTSCHOEN","Schoen gemaakt om gemakkelijk te bewegen."],
    ["SPRINGTOUW","Touw waar je ritmisch overheen springt."],["BLOEM","Gekleurd deel van een plant dat lekker kan ruiken."],
    ["ZONNEBLOEM","Hoge gele bloem die naar de zon lijkt te kijken."],["BOOM","Grote plant met een stam en takken."],
    ["BOS","Plek waar veel bomen bij elkaar groeien."],["PADDESTOEL","Groeit vaak in het bos en heeft een hoed."],
    ["WATERVAL","Water dat van een hoge rand naar beneden stroomt."],["BERG","Zeer hoge natuurlijke heuvel."],
    ["VULKAAN","Berg waar hete lava uit kan komen."],["OCEAAN","Enorm grote hoeveelheid zout water."],
    ["WOESTIJN","Droog gebied met heel weinig regen."]
  ].sort((left, right) => left[0].length - right[0].length || left[0].localeCompare(right[0]));

  function hangman(level) {
    const [word, hint] = HANGMAN[Math.max(1, Math.min(100, level)) - 1];
    return { kind:"galgje", level, word, hint, maxMistakes:Math.max(4, 8 - Math.floor((level - 1) / 25)) };
  }

  function mathLevel(level) {
    const total = Math.min(20, 8 + Math.floor(level / 8));
    const random = rng("rekensprint", level);
    const questions = [];
    let goal = "Optellen tot 20";
    for (let index = 0; index < total; index++) {
      let left, right, operation, answer;
      if (level <= 20) {
        left = 1 + Math.floor(random() * 10);
        right = 1 + Math.floor(random() * (20 - left));
        operation = "+"; answer = left + right;
      } else if (level <= 40) {
        goal = "Aftrekken tot 50";
        left = 12 + Math.floor(random() * 39);
        right = 1 + Math.floor(random() * (left - 1));
        operation = "−"; answer = left - right;
      } else if (level <= 60) {
        goal = "Optellen en aftrekken tot 100";
        operation = random() < .5 ? "+" : "−";
        left = 10 + Math.floor(random() * (operation === "+" ? 90 : 91));
        right = 1 + Math.floor(random() * (operation === "+" ? 100 - left : left));
        answer = operation === "+" ? left + right : left - right;
      } else if (level <= 80) {
        goal = "Tafels van 2 tot 10";
        left = 2 + Math.floor(random() * 9);
        right = 1 + Math.floor(random() * 12);
        operation = "×"; answer = left * right;
      } else {
        goal = "Gemengde bewerkingen";
        const choice = Math.floor(random() * 4);
        if (choice === 0) {
          left = 20 + Math.floor(random() * 181); right = 1 + Math.floor(random() * (201 - left));
          operation = "+"; answer = left + right;
        } else if (choice === 1) {
          left = 20 + Math.floor(random() * 181); right = 1 + Math.floor(random() * left);
          operation = "−"; answer = left - right;
        } else {
          right = 2 + Math.floor(random() * 11); answer = 2 + Math.floor(random() * 11);
          left = choice === 2 ? answer : right * answer;
          operation = choice === 2 ? "×" : "÷";
          if (operation === "×") answer = left * right;
        }
      }
      questions.push({ left, right, operation, answer, text:`${left} ${operation} ${right} = ?` });
    }
    return { kind:"rekensprint", level, goal, questions };
  }

  function wordOccurrences(grid, word) {
    let count = 0;
    const directions = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
    for (let row = 0; row < 8; row++) for (let column = 0; column < 8; column++) for (const [dr, dc] of directions) {
      if ([...word].every((letter, offset) => {
        const r = row + dr * offset, c = column + dc * offset;
        return r >= 0 && r < 8 && c >= 0 && c < 8 && grid[r * 8 + c] === letter;
      })) count++;
    }
    return count;
  }

  function wordSearch(level) {
    const wordCount = Math.min(7, 3 + Math.floor((level - 1) / 20));
    const availableDirections = level <= 20 ? [[0,1]]
      : level <= 40 ? [[0,1],[1,0]]
      : level <= 60 ? [[0,1],[1,0],[1,1],[1,-1]]
      : [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
    for (let attempt = 0; attempt < 100; attempt++) {
      const random = rng("woordzoeker", level, attempt);
      const words = shuffle(WORDS, random).slice(0, wordCount);
      const grid = Array(64).fill("");
      const placements = [];
      let failed = false;
      for (const word of words) {
        let placed = false;
        for (let trial = 0; trial < 250 && !placed; trial++) {
          const [dr, dc] = availableDirections[Math.floor(random() * availableDirections.length)];
          const row = Math.floor(random() * 8), column = Math.floor(random() * 8);
          const cells = [...word].map((_, offset) => [row + dr * offset, column + dc * offset]);
          if (cells.some(([r,c]) => r < 0 || r >= 8 || c < 0 || c >= 8)) continue;
          const indices = cells.map(([r,c]) => r * 8 + c);
          if (indices.some((index, offset) => grid[index] && grid[index] !== word[offset])) continue;
          indices.forEach((index, offset) => { grid[index] = word[offset]; });
          placements.push({ word, indices });
          placed = true;
        }
        if (!placed) { failed = true; break; }
      }
      if (failed) continue;
      for (let index = 0; index < grid.length; index++) if (!grid[index]) grid[index] = "Q";
      if (words.every(word => wordOccurrences(grid, word) === 1)) {
        return { kind:"woordzoeker", level, grid, words, placements, directions:availableDirections.length };
      }
    }
    throw new Error(`Woordzoeker niveau ${level} kon niet worden opgebouwd.`);
  }

  function memory(level) {
    const symbols = ["raket","planeet","ster","alien","maan","satelliet","komeet","aarde","telescoop","ufo","melkweg","astronaut"];
    const pairCount = Math.min(12, 4 + Math.floor((level - 1) / 12));
    const selected = shuffle(symbols, rng("memory-symbols", level)).slice(0, pairCount);
    const cards = shuffle([...selected, ...selected], rng("memory", level));
    return { kind:"memory", level, pairCount, cards };
  }

  function mastermind(level) {
    const codeLength = Math.min(6, 3 + Math.floor((level - 1) / 25));
    const maxTurns = Math.max(6, 10 - Math.floor((level - 1) / 25));
    const code = Array.from({length:codeLength}, (_, position) => Math.floor((level - 1) / (6 ** position)) % 6);
    return { kind:"mastermind", level, codeLength, maxTurns, code };
  }

  function simon(level) {
    const target = Math.min(15, 4 + Math.floor((level - 1) / 9));
    const sequence = Array.from({length:target}, (_, position) => Math.floor((level - 1) / (4 ** position)) % 4);
    return { kind:"simon", level, target, sequence };
  }

  function turnGames(level) {
    return {
      kind:"turn-games",
      level,
      ticTacToeSmart:Math.min(.98, .2 + level * .0078),
      connectFourSmart:Math.min(.98, .15 + level * .0083),
    };
  }

  function runner(level) {
    return {
      kind:"ruimterunner",
      level,
      target:Math.min(35, 8 + Math.floor((level - 1) / 4)),
      startSpeed:2.1 + level * .006,
      ufoChance:level < 8 ? 0 : Math.min(.55, .18 + level / 180),
      minimumGap:Math.max(1050, 1950 - level * 3.2),
    };
  }

  function battleship(level, variant = 0) {
    const lengths = [5,4,3,3,2];
    const random = rng("zeeslag", level, variant);
    const occupied = new Set();
    const ships = [];
    for (let index = 0; index < lengths.length; index++) {
      const length = lengths[index];
      let placed = false;
      for (let attempt = 0; attempt < 1000 && !placed; attempt++) {
        const horizontal = random() > .5;
        const row = Math.floor(random() * 10), column = Math.floor(random() * 10);
        if ((horizontal && column + length > 10) || (!horizontal && row + length > 10)) continue;
        const cells = Array.from({length}, (_, offset) => row * 10 + column + (horizontal ? offset : offset * 10));
        if (cells.some(cell => occupied.has(cell))) continue;
        cells.forEach(cell => occupied.add(cell));
        ships.push({ index, length, cells });
        placed = true;
      }
      if (!placed) throw new Error(`Zeeslag niveau ${level} kon geen vloot plaatsen.`);
    }
    return { kind:"zeeslag", level, ships };
  }

  function validFleet(ships) {
    const expected = [5,4,3,3,2];
    if (!Array.isArray(ships) || ships.length !== expected.length) return false;
    const occupied = new Set();
    return ships.every((ship, index) => {
      if (ship.length !== expected[index] || ship.cells.length !== ship.length) return false;
      const horizontal = ship.cells.every((cell, offset) => cell === ship.cells[0] + offset && Math.floor(cell / 10) === Math.floor(ship.cells[0] / 10));
      const vertical = ship.cells.every((cell, offset) => cell === ship.cells[0] + offset * 10);
      if ((!horizontal && !vertical) || ship.cells.some(cell => cell < 0 || cell > 99 || occupied.has(cell))) return false;
      ship.cells.forEach(cell => occupied.add(cell));
      return true;
    }) && occupied.size === 17;
  }

  function maze(level) {
    const size = 5 + Math.floor((level - 1) / 20) * 2;
    const random = rng("doolhof", level);
    const walls = Array(size * size).fill(15);
    const visited = new Set([0]);
    const stack = [0];
    const directions = [
      { dr:-1,dc:0,wall:1,opposite:4 },
      { dr:0,dc:1,wall:2,opposite:8 },
      { dr:1,dc:0,wall:4,opposite:1 },
      { dr:0,dc:-1,wall:8,opposite:2 },
    ];
    while (stack.length) {
      const current = stack[stack.length - 1];
      const row = Math.floor(current / size), column = current % size;
      const options = shuffle(directions,random).map(direction => ({
        ...direction,index:(row + direction.dr) * size + column + direction.dc,
        row:row + direction.dr,column:column + direction.dc,
      })).filter(option => option.row >= 0 && option.row < size && option.column >= 0 && option.column < size && !visited.has(option.index));
      if (!options.length) { stack.pop(); continue; }
      const next = options[0];
      walls[current] &= ~next.wall;
      walls[next.index] &= ~next.opposite;
      visited.add(next.index);
      stack.push(next.index);
    }
    const parents = Array(size * size).fill(-1), distances = Array(size * size).fill(-1), queue = [0];
    distances[0] = 0;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const cell = queue[cursor], row = Math.floor(cell / size), column = cell % size;
      directions.forEach(direction => {
        if (walls[cell] & direction.wall) return;
        const next = (row + direction.dr) * size + column + direction.dc;
        if (distances[next] >= 0) return;
        distances[next] = distances[cell] + 1; parents[next] = cell; queue.push(next);
      });
    }
    const goal = distances.reduce((best,distance,index) => distance > distances[best] ? index : best,0);
    const solution = [];
    for (let cell = goal; cell >= 0; cell = parents[cell]) { solution.push(cell); if (cell === 0) break; }
    solution.reverse();
    return { kind:"doolhof",level,size,walls,start:0,goal,solution };
  }

  function validMaze(item) {
    const { size,walls,start,goal,solution } = item;
    if (!Number.isInteger(size) || walls.length !== size * size || start !== 0 || goal < 0 || goal >= walls.length) return false;
    const directions = [{ dr:-1,dc:0,wall:1,opposite:4 },{ dr:0,dc:1,wall:2,opposite:8 },{ dr:1,dc:0,wall:4,opposite:1 },{ dr:0,dc:-1,wall:8,opposite:2 }];
    const seen = new Set([start]), queue = [start];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const cell = queue[cursor], row = Math.floor(cell / size), column = cell % size;
      for (const direction of directions) {
        const nextRow=row+direction.dr,nextColumn=column+direction.dc;
        if (nextRow < 0 || nextRow >= size || nextColumn < 0 || nextColumn >= size) {
          if (!(walls[cell] & direction.wall)) return false;
          continue;
        }
        const next = nextRow * size + nextColumn;
        if (Boolean(walls[cell] & direction.wall) !== Boolean(walls[next] & direction.opposite)) return false;
        if (!(walls[cell] & direction.wall) && !seen.has(next)) { seen.add(next);queue.push(next); }
      }
    }
    const solutionValid = solution[0] === start && solution.at(-1) === goal && solution.every((cell,index) => {
      if (index === 0) return true;
      const previous = solution[index - 1], difference = cell - previous;
      const direction = directions.find(item => item.dr * size + item.dc === difference);
      return Boolean(direction) && !(walls[previous] & direction.wall);
    });
    return seen.size === walls.length && solutionValid;
  }

  function milestone(level) {
    return ({
      10:{ title:"Maanproef", description:"Rond de eerste grote ruimtemissie af." },
      25:{ title:"Raketproef", description:"Bewijs dat je klaar bent voor een lange reis." },
      50:{ title:"Planeetproef", description:"Halverwege wacht een extra stevige uitdaging." },
      75:{ title:"Sterrenproef", description:"Alleen ervaren ruimtevaarders komen voorbij." },
      100:{ title:"Kosmische finale", description:"De moeilijkste missie van dit spel." },
    })[level] || null;
  }

  function validateAll() {
    const errors = [];
    for (const [name, generator, validator] of [
      ["sudoku", sudoku, item => sudokuSolutions(item.puzzle) === 1 && item.solution.every((value, index) => item.puzzle[index] === 0 || item.puzzle[index] === value)],
      ["woordzoeker", wordSearch, item => item.words.every(word => wordOccurrences(item.grid, word) === 1)],
    ]) {
      const seen = new Set();
      for (let level = 1; level <= 100; level++) {
        try {
          const item = generator(level);
          const fingerprint = JSON.stringify(name === "sudoku" ? item.puzzle : item.grid);
          if (seen.has(fingerprint)) errors.push(`${name} niveau ${level} is niet uniek`);
          seen.add(fingerprint);
          if (!validator(item)) errors.push(`${name} niveau ${level} is niet geldig`);
        } catch (error) { errors.push(error.message); }
      }
    }
    if (new Set(HANGMAN.map(item => item[0])).size !== 100) errors.push("Galgje bevat geen 100 unieke woorden");
    HANGMAN.forEach(([word, hint], index) => {
      if (!/^[A-Z]+$/.test(word) || hint.length < 12) errors.push(`Galgje niveau ${index + 1} heeft ongeldige inhoud`);
      if (index && word.length < HANGMAN[index - 1][0].length) errors.push(`Galgje niveau ${index + 1} loopt niet op`);
    });
    const mathSeen = new Set();
    for (let level = 1; level <= 100; level++) {
      const item = mathLevel(level);
      const fingerprint = JSON.stringify(item.questions.map(question => [question.left, question.operation, question.right]));
      if (mathSeen.has(fingerprint)) errors.push(`Rekensprint niveau ${level} is niet uniek`);
      mathSeen.add(fingerprint);
      if (item.questions.some(question => !Number.isInteger(question.answer) || question.answer < 0)) errors.push(`Rekensprint niveau ${level} heeft een ongeldige som`);
    }
    for (const [name, generator, fingerprint] of [
      ["Memory", memory, item => item.cards],
      ["Kleurcode", mastermind, item => item.code],
      ["Sterrenreeks", simon, item => item.sequence],
    ]) {
      const seen = new Set();
      let previousDifficulty = 0;
      for (let level = 1; level <= 100; level++) {
        const item = generator(level);
        const key = JSON.stringify(fingerprint(item));
        if (seen.has(key)) errors.push(`${name} niveau ${level} is niet uniek`);
        seen.add(key);
        const difficulty = item.pairCount || item.codeLength || item.target;
        if (difficulty < previousDifficulty) errors.push(`${name} niveau ${level} loopt niet op`);
        previousDifficulty = difficulty;
      }
    }
    const fleetSeen = new Set(), turnSeen = new Set(), runnerSeen = new Set();
    let previousTtt = 0, previousFour = 0, previousSpeed = 0;
    for (let level = 1; level <= 100; level++) {
      const fleet = battleship(level);
      const fleetKey = JSON.stringify(fleet.ships.map(ship => ship.cells));
      if (fleetSeen.has(fleetKey)) errors.push(`Zeeslag niveau ${level} is niet uniek`);
      fleetSeen.add(fleetKey);
      if (!validFleet(fleet.ships)) errors.push(`Zeeslag niveau ${level} heeft een ongeldige vloot`);

      const turns = turnGames(level);
      const turnKey = `${turns.ticTacToeSmart}-${turns.connectFourSmart}`;
      if (turnSeen.has(turnKey)) errors.push(`Beurtspellen niveau ${level} is niet uniek`);
      turnSeen.add(turnKey);
      if (turns.ticTacToeSmart < previousTtt || turns.connectFourSmart < previousFour) errors.push(`Beurtspellen niveau ${level} loopt niet op`);
      previousTtt = turns.ticTacToeSmart; previousFour = turns.connectFourSmart;

      const run = runner(level);
      const runnerKey = JSON.stringify(run);
      if (runnerSeen.has(runnerKey)) errors.push(`Ruimterunner niveau ${level} is niet uniek`);
      runnerSeen.add(runnerKey);
      if (run.startSpeed < previousSpeed || run.startSpeed > 2.71 || run.minimumGap < 1050) errors.push(`Ruimterunner niveau ${level} heeft een onveilige curve`);
      previousSpeed = run.startSpeed;
    }
    const mazeSeen = new Set();
    let previousMazeSize = 0;
    for (let level = 1; level <= 100; level++) {
      const item = maze(level);
      const key = `${item.goal}:${item.walls.join(",")}`;
      if (mazeSeen.has(key)) errors.push(`Doolhof niveau ${level} is niet uniek`);
      mazeSeen.add(key);
      if (!validMaze(item)) errors.push(`Doolhof niveau ${level} is niet geldig`);
      if (item.size < previousMazeSize) errors.push(`Doolhof niveau ${level} loopt niet op`);
      previousMazeSize = item.size;
    }
    return { ok:errors.length === 0, errors };
  }

  return { sudoku, sudokuSolutions, wordSearch, wordOccurrences, hangman, mathLevel, memory, mastermind, simon, turnGames, runner, battleship, validFleet, maze, validMaze, milestone, validateAll };
});
