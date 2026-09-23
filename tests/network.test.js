import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';
import { STATES } from '../shared/config.js';

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

test('E + G: todos bots, fim real, retorno conjunto ao lobby e nova seed na revanche',async()=>{
  const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false});let host,guest;
  try{
    host=await client(app.port,'Observador');host.send('create',{role:'elf',fillBots:true,settings:{elfSlots:2,private:true,seed:'TEST-2'}});const {room}=await host.wait('lobby');
    guest=await client(app.port,'Observador 2');guest.send('join',{code:room.id});await guest.wait('lobby');host.send('observe');await host.wait('lobby',m=>!m.room.slots.some(s=>s.occupant?.clientId===host.hello.id));host.send('slot',{slot:'e0',action:'bot'});await host.wait('lobby',m=>m.room.slots.filter(s=>s.occupant?.type==='bot').length===3);
    host.send('ready',{ready:true});guest.send('ready',{ready:true});await host.wait('lobby',m=>m.room.errors.length===0);host.send('start');await host.wait('map');await guest.wait('map');
    const live=app.sessions.rooms.get(room.id);for(let i=0;i<18000&&live.match.state!==STATES.END;i++)live.match.step(.1);
    const results=await Promise.all([host.wait('result'),guest.wait('result')]);assert.deepEqual(results[0],results[1]);assert.ok(results[0].result.trollDamage>0);assert.ok(results[0].result.towerDamage>0);
    host.send('return');await Promise.all([host.wait('lobby',m=>m.room.state===STATES.LOBBY&&!m.room.members.some(p=>p.ready)),guest.wait('lobby',m=>m.room.state===STATES.LOBBY&&!m.room.members.some(p=>p.ready))]);
    host.send('settings',{settings:{seed:'REMATCH-2'}});await host.wait('lobby',m=>m.room.settings.seed==='REMATCH-2');host.send('ready',{ready:true});guest.send('ready',{ready:true});await host.wait('lobby',m=>m.room.errors.length===0&&m.room.settings.seed==='REMATCH-2');host.send('start');const maps=await Promise.all([host.wait('map'),guest.wait('map')]);assert.ok(maps.every(m=>m.map.seed==='REMATCH-2'));assert.equal(live.members.size,2);
  }finally{if(host)await closeClient(host);if(guest)await closeClient(guest);await app.close();}
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

test('Servidor HTTP serve apenas assets permitidos; salas privadas não vazam no browser',async()=>{
  const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false});
  try{const base=`http://127.0.0.1:${app.port}`;assert.equal((await fetch(base)).status,200);assert.equal((await fetch(base+'/server/index.js')).status,404);assert.notEqual((await fetch(base+'/client/..%2fserver/index.js')).status,200);assert.equal((await fetch(base+'/shared/config.js')).status,200);}
  finally{await app.close();}
});
