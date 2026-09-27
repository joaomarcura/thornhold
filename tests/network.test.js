import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';
import { BALANCE as B, STATES } from '../shared/config.js';
import { SessionService } from '../server/sessions.js';

async function client(port,name,token){
  const socket=new WebSocket(`ws://127.0.0.1:${port}`),queue=[],waiters=[];
  socket.on('message',raw=>{const msg=JSON.parse(raw);queue.push(msg);for(const fn of [...waiters])fn();});
  const send=(type,data={})=>socket.send(JSON.stringify({type,...data}));
  const wait=(type,predicate=()=>true,timeout=3500)=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{waiters.splice(waiters.indexOf(check),1);reject(new Error(`Timeout esperando ${type}: ${JSON.stringify(queue.slice(-3))}`));},timeout);
    function check(){const i=queue.findIndex(m=>m.type===type&&predicate(m));if(i>=0){clearTimeout(timer);const ix=waiters.indexOf(check);if(ix>=0)waiters.splice(ix,1);resolve(queue.splice(i,1)[0]);}}
    waiters.push(check);check();
  });
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});send('hello',{name,token});const hello=await wait('hello');return {socket,send,wait,hello,queue};
}
const closeClient=c=>new Promise(resolve=>{if(c.socket.readyState===WebSocket.CLOSED)return resolve();c.socket.once('close',resolve);c.socket.close();});
const nextTurn=()=>new Promise(resolve=>setTimeout(resolve,70));

test('Revanche alterna lado inicial e sentido da patrulha do Troll',()=>{
  const sessions=new SessionService(),host=sessions.addClient('host','Host'),room=sessions.create(host,{role:'troll',fillBots:true,settings:{elfSlots:5,seed:'SAME-WORLD'}});room.members.get(host.id).ready=true;
  const first=sessions.start(room,host).settings;room.state=STATES.LOBBY;room.members.get(host.id).ready=true;const second=sessions.start(room,host).settings;
  assert.notEqual(first.routeVariant,second.routeVariant);assert.notEqual(first.trollPatrolStart,second.trollPatrolStart);assert.equal(first.trollPatrolDirection,-second.trollPatrolDirection);
});

for(const scenario of [
  {name:'A: humano Troll contra 5 Elfos bots',role:'troll',elves:5,humans:1,bots:true},
  {name:'B: humano Elfo + 4 bots contra Troll bot',role:'elf',elves:5,humans:1,bots:true},
  {name:'C: Troll humano contra 2 Elfos humanos',role:'troll',elves:2,humans:3,bots:false},
  {name:'D: Troll humano contra 3 Elfos humanos + 3 bots',role:'troll',elves:6,humans:4,bots:true}
])test(scenario.name,async()=>{
  const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false}),clients=[];
  try{
    const host=await client(app.port,'Host');clients.push(host);host.send('create',{role:scenario.role,fillBots:scenario.bots,settings:{elfSlots:scenario.elves,seed:'NET-TEST',private:true}});const {room}=await host.wait('lobby');
    for(let i=1;i<scenario.humans;i++){const guest=await client(app.port,'Humano '+i);clients.push(guest);guest.send('join',{code:room.id});await guest.wait('lobby');if(scenario.bots){guest.send('slot',{slot:'e'+(i-1),action:'claim'});await guest.wait('lobby',m=>m.room.slots.some(s=>s.id==='e'+(i-1)&&s.occupant?.clientId===guest.hello.id));}}
    const live=app.sessions.rooms.get(room.id);assert.equal(live.slots.filter(s=>s.occupant?.type==='human').length,scenario.humans);
    host.send('start');assert.match((await host.wait('error')).message,/prontos/);
    for(const c of clients)c.send('ready',{ready:true});await host.wait('lobby',m=>m.room.errors.length===0);
    host.send('start');const maps=await Promise.all(clients.map(c=>c.wait('map')));assert.ok(maps.every(m=>m.map.seed==='NET-TEST'));assert.ok(maps.every(m=>JSON.stringify(m.map.grid)===JSON.stringify(maps[0].map.grid)));
    assert.equal(live.match.units.length,scenario.elves+1);assert.equal(live.match.units.filter(u=>u.controller==='human').length,scenario.humans);
    const elfClient=clients.find(c=>live.slots.find(s=>s.occupant?.clientId===c.hello.id)?.role==='elf');
    if(elfClient){const id=live.slots.find(s=>s.occupant?.clientId===elfClient.hello.id).id,unit=live.match.unit(id),before=unit.x;elfClient.send('input',{x:1,z:0,gold:1e12,speed:999});await nextTurn();assert.ok(unit.x>before);assert.ok(unit.x-before<2);assert.ok(unit.gold<1e6);}
    host.send('settings',{settings:{seed:'CHEAT'}});assert.match((await host.wait('error')).message,/bloqueada/);assert.equal(live.match.map.seed,'NET-TEST');
  }finally{await Promise.all(clients.map(closeClient));await app.close();}
});

test('E + G: lobby padrão 1×5 só com bots, fim real, retorno conjunto e revanche',async()=>{
  const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false});let host,guest;
  try{
    host=await client(app.port,'Observador');host.send('create',{role:'elf',fillBots:true,settings:{elfSlots:5,private:true,seed:'THORNHOLD'}});const {room}=await host.wait('lobby');
    guest=await client(app.port,'Observador 2');guest.send('join',{code:room.id});await guest.wait('lobby');host.send('observe');await host.wait('lobby',m=>!m.room.slots.some(s=>s.occupant?.clientId===host.hello.id));host.send('slot',{slot:'e0',action:'bot'});await host.wait('lobby',m=>m.room.slots.filter(s=>s.occupant?.type==='bot').length===6);
    host.send('ready',{ready:true});guest.send('ready',{ready:true});await host.wait('lobby',m=>m.room.errors.length===0);host.send('start');await host.wait('map');await guest.wait('map');
    const live=app.sessions.rooms.get(room.id);for(let i=0;i<6000&&live.match.state!==STATES.END;i++)live.match.step(.1);
    // This is a network lifecycle test, not a balance simulation. If the bots
    // have not produced a natural result in ten minutes, validate the official
    // 60-minute score resolution directly instead of requiring an early win.
    if(live.match.state!==STATES.END){live.match.time=B.matchHardLimit;live.match.checkEndState();}
    const results=await Promise.all([host.wait('result'),guest.wait('result')]);assert.deepEqual(results[0],results[1]);assert.ok(results[0].result.trollDamage>0);assert.ok(results[0].result.towerDamage>0);
    host.send('return');await Promise.all([host.wait('lobby',m=>m.room.state===STATES.LOBBY&&!m.room.members.some(p=>p.ready)),guest.wait('lobby',m=>m.room.state===STATES.LOBBY&&!m.room.members.some(p=>p.ready))]);
    host.send('settings',{settings:{seed:'REMATCH-2'}});await host.wait('lobby',m=>m.room.settings.seed==='REMATCH-2');host.send('ready',{ready:true});guest.send('ready',{ready:true});await host.wait('lobby',m=>m.room.errors.length===0&&m.room.settings.seed==='REMATCH-2');host.send('start');const maps=await Promise.all([host.wait('map'),guest.wait('map')]);assert.ok(maps.every(m=>m.map.seed==='REMATCH-2'));assert.equal(live.members.size,2);
  }finally{if(host)await closeClient(host);if(guest)await closeClient(guest);await app.close();}
});

test('Partida local permite host observador com lobby padrão 1×5 somente de bots',async()=>{
  const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false,devMode:true});let host;
  try{
    host=await client(app.port,'Observador');host.send('create',{role:'observer',fillBots:true,settings:{mode:'custom',local:true,private:true,elfSlots:5,seed:'BOT-WATCH'}});const {room}=await host.wait('lobby');const live=app.sessions.rooms.get(room.id);
    assert.equal(live.slots.filter(s=>s.occupant?.type==='human').length,0);assert.equal(live.slots.filter(s=>s.occupant?.type==='bot').length,6);assert.ok(!live.slots.some(s=>s.occupant?.clientId===host.hello.id));
    host.send('ready',{ready:true});await host.wait('lobby',m=>m.room.errors.length===0);host.send('start');const map=await host.wait('map');assert.equal(map.viewerId,null);assert.equal(live.match.units.length,6);assert.ok(live.match.units.every(unit=>unit.controller==='bot'));
    const snapshot=await host.wait('snapshot',m=>m.snapshot.units.length===6);assert.equal(snapshot.snapshot.viewerId,null);assert.equal(snapshot.snapshot.units.length,6);host.send('dev',{command:'speed',speed:8});await host.wait('dev',m=>m.speed===8);assert.equal(live.devSpeed,8);
    const troll=live.match.units.find(unit=>unit.role==='troll'),before=troll.gold;host.send('dev',{command:'grant',target:troll.id,gold:100});const grant=await host.wait('dev',m=>m.target===troll.id&&m.granted?.gold===100);assert.equal(grant.target,troll.id);assert.equal(troll.gold,before+100);
  }finally{if(host)await closeClient(host);await app.close();}
});

test('F: desconexão, host migrado, IA no mesmo personagem e retomada por token',async()=>{
  const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false});let host,guest,resumed;
  try{
    host=await client(app.port,'Host');guest=await client(app.port,'Aliado');host.send('create',{role:'troll',fillBots:true,settings:{elfSlots:2}});const {room}=await host.wait('lobby');guest.send('join',{code:room.id});await guest.wait('lobby');guest.send('slot',{slot:'e0',action:'claim'});await guest.wait('lobby',m=>m.room.slots.find(s=>s.id==='e0').occupant?.clientId===guest.hello.id);
    host.send('ready',{ready:true});guest.send('ready',{ready:true});await host.wait('lobby',m=>m.room.errors.length===0);host.send('start');await guest.wait('map');await host.wait('map');const live=app.sessions.rooms.get(room.id),unit=live.match.unit('t0');unit.gold=123;
    await closeClient(host);await guest.wait('lobby',m=>m.room.hostId===guest.hello.id);assert.equal(unit.controller,'bot');assert.equal(unit.gold,123);
    resumed=await client(app.port,'Host',host.hello.token);const map=await resumed.wait('map');assert.equal(map.viewerId,'t0');assert.equal(unit.controller,'human');assert.equal(unit.gold,123);assert.equal(live.hostId,guest.hello.id);
  }finally{for(const c of [host,guest,resumed])if(c)await closeClient(c);await app.close();}
});

test('Saída manual salva a partida abandonada com estado final e autor',async()=>{
  const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false});let host;
  try{
    host=await client(app.port,'Troll manual');host.send('create',{role:'troll',fillBots:true,settings:{elfSlots:5,private:true,seed:'MANUAL-EXIT'}});const {room}=await host.wait('lobby');
    host.send('ready',{ready:true});await host.wait('lobby',m=>m.room.errors.length===0);host.send('start');await host.wait('map');
    const live=app.sessions.rooms.get(room.id);live.match.state=STATES.ACTIVE;live.state=STATES.ACTIVE;live.match.time=137;
    host.send('leave');await host.wait('left');await nextTurn();
    assert.equal(live.logged,true);assert.equal(live.resultRecord.completed,false);assert.equal(live.resultRecord.abandoned,true);assert.equal(live.resultRecord.winner,null);assert.equal(live.resultRecord.endReason,'manual-exit');
    assert.equal(live.resultRecord.duration,137);assert.equal(live.resultRecord.seed,'MANUAL-EXIT');assert.equal(live.resultRecord.termination.type,'manual-exit');assert.equal(live.resultRecord.termination.clientId,host.hello.id);assert.equal(live.resultRecord.termination.playerName,'Troll manual');
    assert.equal(live.resultRecord.finalState.state,STATES.ACTIVE);assert.equal(live.resultRecord.finalState.winner,null);assert.equal(live.resultRecord.finalState.endReason,'manual-exit');assert.equal(live.resultRecord.players.length,6);
  }finally{if(host)await closeClient(host);await app.close();}
});

test('Saída manual de um jogador não encerra partida com outro humano conectado',async()=>{
  const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false});let host,guest;
  try{
    host=await client(app.port,'Host online');guest=await client(app.port,'Aliado online');host.send('create',{role:'troll',fillBots:true,settings:{elfSlots:5,private:true,seed:'ONLINE-CONTINUES'}});const {room}=await host.wait('lobby');guest.send('join',{code:room.id});await guest.wait('lobby');guest.send('slot',{slot:'e0',action:'claim'});await guest.wait('lobby',m=>m.room.slots.find(s=>s.id==='e0').occupant?.clientId===guest.hello.id);
    host.send('ready',{ready:true});guest.send('ready',{ready:true});await host.wait('lobby',m=>m.room.errors.length===0);host.send('start');await host.wait('map');await guest.wait('map');const live=app.sessions.rooms.get(room.id);
    host.send('leave');await host.wait('left');await guest.wait('lobby',m=>m.room.members.some(member=>member.id===guest.hello.id&&member.connected));await nextTurn();
    assert.equal(live.logged,false);assert.equal(live.resultRecord,undefined);assert.equal(live.match.state!==STATES.END,true);
  }finally{if(host)await closeClient(host);if(guest)await closeClient(guest);await app.close();}
});

test('Servidor HTTP serve apenas assets permitidos; salas privadas não vazam no browser',async()=>{
  const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false});
  try{const base=`http://127.0.0.1:${app.port}`;assert.equal((await fetch(base)).status,200);assert.equal((await fetch(base+'/server/index.js')).status,404);assert.notEqual((await fetch(base+'/client/..%2fserver/index.js')).status,200);assert.equal((await fetch(base+'/shared/config.js')).status,200);}
  finally{await app.close();}
});

test('Servidor sinaliza draining no health check antes de encerrar uma revisão',async()=>{
  const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false});
  const draining=app.drain({graceMs:150});
  const response=await fetch(`http://127.0.0.1:${app.port}/health`),health=await response.json();
  assert.equal(response.status,503);assert.equal(health.ok,false);assert.equal(health.draining,true);await draining;
});

test('Modo dev fica protegido por configuração e controla recursos e velocidade',async()=>{
  const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false,devMode:true});let host;
  try{
    host=await client(app.port,'Dev Troll');assert.equal(host.hello.devMode,true);
    host.send('create',{role:'troll',fillBots:true,settings:{elfSlots:1,private:true,preparation:20}});const {room}=await host.wait('lobby');host.send('ready',{ready:true});await host.wait('lobby',m=>m.room.errors.length===0);host.send('start');await host.wait('map');
    const live=app.sessions.rooms.get(room.id),unit=live.match.unit('t0'),gold=unit.gold,wood=unit.wood;
    host.send('dev',{command:'grant',gold:1000,wood:250});await host.wait('dev',m=>m.granted?.gold===1000);assert.equal(unit.gold,gold+1000);assert.equal(unit.wood,wood+250);
    host.send('dev',{command:'speed',speed:8});await host.wait('dev',m=>m.speed===8);assert.equal(live.devSpeed,8);assert.equal(live.match.devSpeed,8);
    const before={x:unit.x,z:unit.z};host.send('input',{x:1,z:0});await nextTurn();assert.ok(Math.hypot(unit.x-before.x,unit.z-before.z)>.1,'WASD deve continuar ativo em velocidade DEV 8×');host.send('input',{x:0,z:0});
  }finally{if(host)await closeClient(host);await app.close();}
});

test('MODE-204: fila ranqueada forma 1×5 humano e quatro Elfos podem se render após 10 minutos',async()=>{
  const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false}),clients=[];
  try{
    for(let i=0;i<6;i++)clients.push(await client(app.port,i===0?'Troll ranqueado':`Elfo ranqueado ${i}`));
    for(let i=1;i<6;i++)clients[i].send('rankedQueue',{role:'elf'});
    clients[0].send('rankedQueue',{role:'troll'});
    const maps=await Promise.all(clients.map(c=>c.wait('map',()=>true,6000)));assert.equal(maps.filter(m=>m.viewerId==='t0').length,1);assert.equal(maps.filter(m=>m.viewerId?.startsWith('e')).length,5);
    const live=[...app.sessions.rooms.values()].find(r=>r.settings.mode==='ranked');assert.ok(live);assert.equal(live.members.size,6);assert.equal(live.slots.filter(s=>s.occupant?.type==='human').length,6);assert.equal(live.slots.filter(s=>s.occupant?.type==='bot').length,0);assert.equal(live.settings.mapSize,'compact');
    live.match.state=STATES.ACTIVE;live.state=STATES.ACTIVE;live.match.time=600;
    const elfClients=clients.filter(c=>live.slots.find(s=>s.occupant?.clientId===c.hello.id)?.role==='elf');
    for(let i=0;i<3;i++){elfClients[i].send('surrender');const vote=await elfClients[i].wait('surrender',m=>m.status.role==='elf'&&m.status.votes===i+1);assert.equal(vote.status.ended,false);}
    assert.notEqual(live.match.state,STATES.END);elfClients[3].send('surrender');const finalVote=await elfClients[3].wait('surrender',m=>m.status.votes===4);assert.equal(finalVote.status.ended,true);assert.equal(live.match.winner,'troll');assert.equal(live.match.endReason,'elf-surrender');
  }finally{await Promise.all(clients.map(closeClient));await app.close();}
});

test('MODE-204: grupo élfico entra junto na fila e o Troll não aceita grupo',async()=>{
  const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false}),clients=[];
  try{
    const leader=await client(app.port,'Líder'),ally=await client(app.port,'Aliado');clients.push(leader,ally);leader.send('partyCreate');const created=await leader.wait('queue',m=>m.party?.members.length===1);const code=created.party.id;ally.send('partyJoin',{code});await ally.wait('queue',m=>m.party?.id===code&&m.party.members.length===2);leader.send('rankedQueue',{role:'elf'});const queued=await leader.wait('queue',m=>m.queued&&m.role==='elf');assert.equal(queued.players.elf,2);ally.send('create',{role:'elf'});assert.match((await ally.wait('error')).message,/Cancele a fila/);ally.send('rankedCancel');await leader.wait('queue',m=>!m.queued);
    leader.send('rankedQueue',{role:'troll'});assert.match((await leader.wait('error')).message,/sozinho/);
  }finally{await Promise.all(clients.map(closeClient));await app.close();}
});

test('Ranqueada de teste começa imediatamente e completa ambos os times com bots',async()=>{
  const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false}),clients=[];
  try{
    const troll=await client(app.port,'Troll humano');clients.push(troll);troll.send('rankedQueue',{role:'troll',fillBots:true});const trollMap=await troll.wait('map');assert.equal(trollMap.viewerId,'t0');const trollRoom=app.sessions.room(app.sessions.clients.get(troll.hello.id));assert.equal(trollRoom.slots.filter(s=>s.occupant?.type==='bot').length,5);assert.equal(trollRoom.match.units.length,6);assert.equal(trollRoom.rankedBotFill,true);
    const elf=await client(app.port,'Elfo humano');clients.push(elf);elf.send('rankedQueue',{role:'elf',fillBots:true});const elfMap=await elf.wait('map');assert.match(elfMap.viewerId,/^e/);const elfRoom=app.sessions.room(app.sessions.clients.get(elf.hello.id));assert.equal(elfRoom.slots.find(s=>s.role==='troll').occupant.type,'bot');assert.equal(elfRoom.slots.filter(s=>s.occupant?.type==='bot').length,5);assert.equal(elfRoom.match.units.length,6);
    elfRoom.match.state=STATES.ACTIVE;elfRoom.state=STATES.ACTIVE;elfRoom.match.time=600;elf.send('surrender');const vote=await elf.wait('surrender');assert.equal(vote.status.needed,1);assert.equal(vote.status.ended,true);assert.equal(elfRoom.match.winner,'troll');
  }finally{await Promise.all(clients.map(closeClient));await app.close();}
});
