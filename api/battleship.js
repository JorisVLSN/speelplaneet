const { db, configured, sessionPlayer, multiplayerAllowed } = require("../server/supabase");

const FLEET_LENGTHS = [5, 4, 3, 3, 2];

function makeCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  return `${Array.from({length:3},()=>letters[Math.floor(Math.random()*letters.length)]).join("")}-${Math.floor(100+Math.random()*900)}`;
}

function validFleet(ships) {
  if (!Array.isArray(ships) || ships.length !== 5) return false;
  const lengths = ships.map(ship => Number(ship.length)).sort((a,b)=>b-a);
  if (lengths.join(",") !== FLEET_LENGTHS.join(",")) return false;
  const occupied = new Set();
  for (const ship of ships) {
    if (!Array.isArray(ship.cells) || ship.cells.length !== ship.length) return false;
    const cells = ship.cells.map(Number);
    if (cells.some(cell => !Number.isInteger(cell) || cell < 0 || cell > 99 || occupied.has(cell))) return false;
    const horizontal = cells.every((cell,index) => cell === cells[0]+index && Math.floor(cell/10) === Math.floor(cells[0]/10));
    const vertical = cells.every((cell,index) => cell === cells[0]+index*10);
    if (!horizontal && !vertical) return false;
    cells.forEach(cell => occupied.add(cell));
  }
  return occupied.size === 17;
}

function fleetCells(fleet) {
  return new Set((fleet || []).flatMap(ship => ship.cells || []).map(Number));
}

function roleFor(room, playerId) {
  if (room.host_player_id === playerId) return "host";
  if (room.guest_player_id === playerId) return "guest";
  return null;
}

function roomView(room, role) {
  const state = room.public_state;
  const ownFleet = role === "host" ? room.host_fleet : room.guest_fleet;
  const reveal = state.phase === "finished";
  return {
    id: room.id,
    join_code: room.join_code,
    game_type: "zeeslag",
    host_id: room.host_player_id,
    guest_id: room.guest_player_id,
    host_name: room.host_name,
    guest_name: room.guest_name,
    status: room.status,
    revision: room.revision,
    role,
    game_state: {
      kind: "zeeslag",
      phase: state.phase,
      turn: state.turn,
      winner: state.winner,
      rematchReady: state.rematchReady || { host:false, guest:false },
      hits: state.hits,
      players: {
        host: {
          ships: role === "host" || reveal ? (room.host_fleet || []) : [],
          shots: state.shots.host,
          ready: state.ready.host,
        },
        guest: {
          ships: role === "guest" || reveal ? (room.guest_fleet || []) : [],
          shots: state.shots.guest,
          ready: state.ready.guest,
        },
      },
    },
  };
}

async function playerName(playerId) {
  const rows = await db(`players?id=eq.${playerId}&select=name&limit=1`);
  return rows?.[0]?.name || "Speler";
}

async function roomById(id) {
  const rows = await db(`battleship_rooms?id=eq.${encodeURIComponent(id)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*&limit=1`);
  return rows?.[0];
}

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (!configured()) return response.status(503).json({ error:"SYNC_NOT_CONFIGURED" });
  const playerId = await sessionPlayer(request).catch(() => null);
  if (!playerId) return response.status(401).json({ error:"LOGIN_REQUIRED" });
  if (!await multiplayerAllowed(playerId)) return response.status(403).json({ error:"MULTIPLAYER_DISABLED" });

  try {
    if (request.method === "GET") {
      const room = await roomById(request.query?.id);
      const role = room && roleFor(room, playerId);
      if (!room || !role) return response.status(404).json({ error:"ROOM_NOT_FOUND" });
      return response.status(200).json({ room:roomView(room, role) });
    }
    if (request.method !== "POST") return response.status(405).json({ error:"METHOD_NOT_ALLOWED" });
    const action = request.body?.action;

    if (action === "create") {
      const name = await playerName(playerId);
      let created;
      for (let attempt=0;attempt<5&&!created;attempt++) {
        try {
          const rows = await db("battleship_rooms", { method:"POST", body:{ join_code:makeCode(), host_player_id:playerId, host_name:name } });
          created = rows[0];
        } catch (error) {
          if (error.status !== 409) throw error;
        }
      }
      if (!created) return response.status(503).json({ error:"CODE_UNAVAILABLE" });
      return response.status(200).json({ room:roomView(created,"host") });
    }

    if (action === "join") {
      const code = String(request.body?.code || "").trim().toUpperCase();
      const rows = await db(`battleship_rooms?join_code=eq.${encodeURIComponent(code)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*&limit=1`);
      let room = rows?.[0];
      if (!room) return response.status(404).json({ error:"ROOM_NOT_FOUND" });
      let role = roleFor(room,playerId);
      if (!role) {
        if (room.guest_player_id) return response.status(409).json({ error:"ROOM_FULL" });
        const updated = await db(`battleship_rooms?id=eq.${room.id}&guest_player_id=is.null`, {
          method:"PATCH",
          body:{ guest_player_id:playerId, guest_name:await playerName(playerId), status:"placing", revision:room.revision+1, updated_at:new Date().toISOString() },
        });
        if (!updated?.[0]) return response.status(409).json({ error:"ROOM_FULL" });
        room = updated[0]; role = "guest";
      }
      return response.status(200).json({ room:roomView(room,role) });
    }

    const room = await roomById(request.body?.roomId);
    const role = room && roleFor(room,playerId);
    if (!room || !role) return response.status(404).json({ error:"ROOM_NOT_FOUND" });
    const other = role === "host" ? "guest" : "host";

    if (action === "place") {
      const ships = request.body?.ships;
      if (!validFleet(ships)) return response.status(400).json({ error:"INVALID_FLEET" });
      const state = structuredClone(room.public_state);
      state.ready[role] = true;
      if (state.ready.host && state.ready.guest) { state.phase="playing"; state.turn="host"; }
      const body = {
        [`${role}_fleet`]:ships,
        public_state:state,
        status:state.phase,
        revision:room.revision+1,
        updated_at:new Date().toISOString(),
      };
      const updated = await db(`battleship_rooms?id=eq.${room.id}&revision=eq.${room.revision}`, { method:"PATCH", body });
      if (!updated?.[0]) return response.status(409).json({ error:"STALE_STATE" });
      return response.status(200).json({ room:roomView(updated[0],role) });
    }

    if (action === "shot") {
      const index = Number(request.body?.index);
      const state = structuredClone(room.public_state);
      if (state.phase !== "playing" || state.turn !== role) return response.status(409).json({ error:"NOT_YOUR_TURN" });
      if (!Number.isInteger(index)||index<0||index>99||state.shots[role].includes(index)) return response.status(400).json({ error:"INVALID_SHOT" });
      const targetFleet = other === "host" ? room.host_fleet : room.guest_fleet;
      if (!validFleet(targetFleet)) return response.status(409).json({ error:"FLEET_NOT_READY" });
      state.shots[role].push(index);
      const targetCells = fleetCells(targetFleet);
      if (targetCells.has(index)) state.hits[role].push(index);
      if ([...targetCells].every(cell => state.hits[role].includes(cell))) {
        state.phase="finished"; state.winner=role;
      } else state.turn=other;
      const updated = await db(`battleship_rooms?id=eq.${room.id}&revision=eq.${room.revision}`, {
        method:"PATCH",
        body:{ public_state:state, status:state.phase, revision:room.revision+1, updated_at:new Date().toISOString() },
      });
      if (!updated?.[0]) return response.status(409).json({ error:"STALE_STATE" });
      return response.status(200).json({ room:roomView(updated[0],role) });
    }

    if (action === "forfeit") {
      const state=structuredClone(room.public_state);
      if(!room.guest_player_id)return response.status(409).json({error:"OPPONENT_REQUIRED"});
      if(state.phase==="finished")return response.status(409).json({error:"GAME_FINISHED"});
      state.phase="finished";state.winner=other;state.rematchReady={host:false,guest:false};
      const updated=await db(`battleship_rooms?id=eq.${room.id}&revision=eq.${room.revision}`,{
        method:"PATCH",
        body:{public_state:state,status:"finished",revision:room.revision+1,updated_at:new Date().toISOString()},
      });
      if(!updated?.[0])return response.status(409).json({error:"STALE_STATE"});
      return response.status(200).json({room:roomView(updated[0],role)});
    }

    if (action === "rematch") {
      if(room.public_state.phase!=="finished"||!room.guest_player_id)return response.status(409).json({error:"REMATCH_UNAVAILABLE"});
      const waiting=structuredClone(room.public_state);
      waiting.rematchReady ||= {host:false,guest:false};
      waiting.rematchReady[role]=true;
      const both=waiting.rematchReady.host&&waiting.rematchReady.guest;
      const initial={phase:"placing",turn:"host",winner:null,ready:{host:false,guest:false},shots:{host:[],guest:[]},hits:{host:[],guest:[]},rematchReady:{host:false,guest:false}};
      const updated=await db(`battleship_rooms?id=eq.${room.id}&revision=eq.${room.revision}`,{
        method:"PATCH",
        body:{public_state:both?initial:waiting,...(both?{host_fleet:null,guest_fleet:null}:{}),status:both?"placing":"finished",revision:room.revision+1,updated_at:new Date().toISOString()},
      });
      if(!updated?.[0])return response.status(409).json({error:"STALE_STATE"});
      return response.status(200).json({room:roomView(updated[0],role)});
    }
    return response.status(400).json({ error:"UNKNOWN_ACTION" });
  } catch (error) {
    console.error("battleship_error", error.message);
    if (playerId) await db("app_error_logs", { method:"POST", body:{ player_id:playerId, error_type:"battleship", message:String(error.message || "BATTLESHIP_FAILED").slice(0,500), context:String(request.body?.action || request.method).slice(0,100) } }).catch(() => {});
    return response.status(500).json({ error:"BATTLESHIP_FAILED" });
  }
};
