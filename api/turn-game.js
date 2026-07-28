const { db, configured, sessionPlayer, multiplayerAllowed } = require("../server/supabase");
const { hangman } = require("../level-engine");

const HANGMAN_WORDS = [
  ["MAAN","Je ziet haar vaak ’s nachts aan de hemel."],["STER","Een klein lichtpuntje hoog in de lucht."],
  ["ROBOT","Een machine die kan bewegen en opdrachten uitvoeren."],["KASTEEL","Een groot gebouw waar vroeger koningen woonden."],
  ["DOLFIJN","Een slim zeedier dat graag uit het water springt."],["VLINDER","Begint als rups en krijgt later mooie vleugels."],
  ["PLANEET","Een grote bol die rond een ster draait."],["REGENBOOG","Verschijnt soms als de zon door regendruppels schijnt."],
  ["PANNENKOEK","Een ronde lekkernij uit de koekenpan."],["VERREKIJKER","Hiermee kun je iets ver weg dichterbij bekijken."],
  ["RUIMTESCHIP","Vervoert astronauten buiten de aarde."],["SCHATKAART","Laat zien waar een verborgen buit kan liggen."],
  ["ONTDEKKINGSREIZIGER","Iemand die op pad gaat om nieuwe plekken te vinden."]
];

function code(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZ";return `${Array.from({length:3},()=>chars[Math.floor(Math.random()*chars.length)]).join("")}-${Math.floor(100+Math.random()*900)}`;}
function role(room,id){return room.host_player_id===id?"host":room.guest_player_id===id?"guest":null;}
function initial(type,level=1){
  if(type==="boterkaaseieren")return {public:{kind:type,board:Array(9).fill(null),turn:"host",winner:null,phase:"playing",rematchReady:{host:false,guest:false}},secret:null};
  if(type==="vieropeenrij")return {public:{kind:type,board:Array(42).fill(null),turn:"host",winner:null,phase:"playing",rematchReady:{host:false,guest:false}},secret:null};
  const {word,hint,maxMistakes}=hangman(level);
  return {public:{kind:type,guessed:[],mistakes:0,maxMistakes,hint,display:"_".repeat(word.length),phase:"playing",winner:null,rematchReady:{host:false,guest:false}},secret:{word}};
}
function view(room,playerRole){return {id:room.id,join_code:room.join_code,game_type:room.game_type,host_id:room.host_player_id,guest_id:room.guest_player_id,host_name:room.host_name,guest_name:room.guest_name,status:room.status,revision:room.revision,role:playerRole,serverTurnGame:true,game_state:room.public_state};}
async function name(id){const rows=await db(`players?id=eq.${id}&select=name&limit=1`);return rows?.[0]?.name||"Speler";}
async function byId(id){const rows=await db(`turn_game_rooms?id=eq.${encodeURIComponent(id)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*&limit=1`);return rows?.[0];}
function tttWinner(board){const lines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];const line=lines.find(([a,b,c])=>board[a]&&board[a]===board[b]&&board[a]===board[c]);return line?board[line[0]]:board.every(Boolean)?"draw":null;}
function four(board,color){for(let r=0;r<6;r++)for(let c=0;c<7;c++)for(const[dr,dc]of[[0,1],[1,0],[1,1],[1,-1]])if([0,1,2,3].every(n=>{const rr=r+dr*n,cc=c+dc*n;return rr>=0&&rr<6&&cc>=0&&cc<7&&board[rr*7+cc]===color;}))return true;return false;}

module.exports=async function handler(request,response){
  response.setHeader("Cache-Control","no-store");
  if(!configured())return response.status(503).json({error:"SYNC_NOT_CONFIGURED"});
  const playerId=await sessionPlayer(request).catch(()=>null);
  if(!playerId)return response.status(401).json({error:"LOGIN_REQUIRED"});
  if(!await multiplayerAllowed(playerId))return response.status(403).json({error:"MULTIPLAYER_DISABLED"});
  try{
    if(request.method==="GET"){
      const room=await byId(request.query?.id),r=room&&role(room,playerId);
      if(!room||!r)return response.status(404).json({error:"ROOM_NOT_FOUND"});
      return response.status(200).json({room:view(room,r)});
    }
    if(request.method!=="POST")return response.status(405).json({error:"METHOD_NOT_ALLOWED"});
    const action=request.body?.action;
    if(action==="create"){
      const type=request.body?.gameType;
      if(!["galgje","vieropeenrij","boterkaaseieren"].includes(type))return response.status(400).json({error:"INVALID_GAME"});
      const start=initial(type,Number(request.body?.level)||1);
      let room;
      for(let i=0;i<5&&!room;i++)try{room=(await db("turn_game_rooms",{method:"POST",body:{join_code:code(),game_type:type,host_player_id:playerId,host_name:await name(playerId),public_state:start.public,secret_state:start.secret}}))[0];}catch(error){if(error.status!==409)throw error;}
      if(!room)return response.status(503).json({error:"CODE_UNAVAILABLE"});
      return response.status(200).json({room:view(room,"host")});
    }
    if(action==="join"){
      const joinCode=String(request.body?.code||"").trim().toUpperCase(),type=request.body?.gameType;
      let room=(await db(`turn_game_rooms?join_code=eq.${encodeURIComponent(joinCode)}&game_type=eq.${encodeURIComponent(type)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*&limit=1`))?.[0];
      if(!room)return response.status(404).json({error:"ROOM_NOT_FOUND"});
      let r=role(room,playerId);
      if(!r){
        if(room.guest_player_id)return response.status(409).json({error:"ROOM_FULL"});
        const rows=await db(`turn_game_rooms?id=eq.${room.id}&guest_player_id=is.null`,{method:"PATCH",body:{guest_player_id:playerId,guest_name:await name(playerId),status:"playing",revision:room.revision+1,updated_at:new Date().toISOString()}});
        if(!rows?.[0])return response.status(409).json({error:"ROOM_FULL"});room=rows[0];r="guest";
      }
      return response.status(200).json({room:view(room,r)});
    }
    const room=await byId(request.body?.roomId),r=room&&role(room,playerId);
    if(!room||!r)return response.status(404).json({error:"ROOM_NOT_FOUND"});
    const other=r==="host"?"guest":"host",state=structuredClone(room.public_state);
    if(action==="move"){
      if(state.phase==="finished")return response.status(409).json({error:"GAME_FINISHED"});
      if(room.game_type==="galgje"){
        const letter=String(request.body?.letter||"").toUpperCase();
        if(!/^[A-Z]$/.test(letter)||state.guessed.includes(letter))return response.status(400).json({error:"INVALID_MOVE"});
        state.guessed.push(letter);const word=room.secret_state.word;
        if(!word.includes(letter))state.mistakes++;
        state.display=[...word].map(char=>state.guessed.includes(char)?char:"_").join("");
        if(!state.display.includes("_")){state.phase="finished";state.winner="together";}
        else if(state.mistakes>=state.maxMistakes){state.phase="finished";state.winner="lost";state.display=word;}
      }else{
        if(state.turn!==r)return response.status(409).json({error:"NOT_YOUR_TURN"});
        if(room.game_type==="boterkaaseieren"){
          const index=Number(request.body?.index);if(!Number.isInteger(index)||index<0||index>8||state.board[index])return response.status(400).json({error:"INVALID_MOVE"});
          state.board[index]=r==="host"?"X":"O";state.winner=tttWinner(state.board);
        }else{
          const column=Number(request.body?.column);if(!Number.isInteger(column)||column<0||column>6||state.board[column])return response.status(400).json({error:"INVALID_MOVE"});
          const color=r==="host"?"red":"yellow";for(let row=5;row>=0;row--){const index=row*7+column;if(!state.board[index]){state.board[index]=color;break;}}
          state.winner=four(state.board,color)?color:state.board.every(Boolean)?"draw":null;
        }
        if(state.winner)state.phase="finished";else state.turn=other;
      }
      const rows=await db(`turn_game_rooms?id=eq.${room.id}&revision=eq.${room.revision}`,{method:"PATCH",body:{public_state:state,status:state.phase==="finished"?"finished":"playing",revision:room.revision+1,updated_at:new Date().toISOString()}});
      if(!rows?.[0])return response.status(409).json({error:"STALE_STATE"});
      return response.status(200).json({room:view(rows[0],r)});
    }
    if(action==="forfeit"){
      if(!room.guest_player_id)return response.status(409).json({error:"OPPONENT_REQUIRED"});
      if(state.phase==="finished")return response.status(409).json({error:"GAME_FINISHED"});
      state.phase="finished";state.rematchReady={host:false,guest:false};
      if(room.game_type==="galgje"){state.winner="lost";state.display=room.secret_state.word;}
      else state.winner=room.game_type==="boterkaaseieren"?(other==="host"?"X":"O"):(other==="host"?"red":"yellow");
      const rows=await db(`turn_game_rooms?id=eq.${room.id}&revision=eq.${room.revision}`,{method:"PATCH",body:{public_state:state,status:"finished",revision:room.revision+1,updated_at:new Date().toISOString()}});
      if(!rows?.[0])return response.status(409).json({error:"STALE_STATE"});
      return response.status(200).json({room:view(rows[0],r)});
    }
    if(action==="rematch"){
      if(state.phase!=="finished"||!room.guest_player_id)return response.status(409).json({error:"REMATCH_UNAVAILABLE"});
      state.rematchReady ||= {host:false,guest:false};state.rematchReady[r]=true;
      const both=state.rematchReady.host&&state.rematchReady.guest;
      const start=both?initial(room.game_type,Number(request.body?.level)||1):{public:state,secret:room.secret_state};
      const rows=await db(`turn_game_rooms?id=eq.${room.id}&revision=eq.${room.revision}`,{method:"PATCH",body:{public_state:start.public,secret_state:start.secret,status:both?"playing":"finished",revision:room.revision+1,updated_at:new Date().toISOString()}});
      if(!rows?.[0])return response.status(409).json({error:"STALE_STATE"});
      return response.status(200).json({room:view(rows[0],r)});
    }
    return response.status(400).json({error:"UNKNOWN_ACTION"});
  }catch(error){
    console.error("turn_game_error",error.message);
    if(playerId)await db("app_error_logs",{method:"POST",body:{player_id:playerId,error_type:"turn_game",message:String(error.message||"TURN_GAME_FAILED").slice(0,500),context:String(request.body?.action||request.method).slice(0,100)}}).catch(()=>{});
    return response.status(500).json({error:"TURN_GAME_FAILED"});
  }
};
