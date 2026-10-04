import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Match } from '../shared/simulation.js';
import { BALANCE as B, STATES, resourceProducer, mineEconomy } from '../shared/config.js';
import { constructionCount } from '../shared/construction-quota.js';
import { cosmetic, normalizeCosmetics, SKINS } from '../shared/cosmetics.js';
import { FrameMetrics, resolutionStep } from '../client/frame-performance.js';
import { followCameraOffset, character } from '../client/renderer.js';
import { FirstPersonViewmodel } from '../client/viewmodel.js';
import { cosmeticsMarkup } from '../client/cosmetics-menu.js';
import { soundSamples, PHYSICAL_SOUNDS } from '../client/sound-design.js';
import { SessionService } from '../server/sessions.js';
import { PlatformDatabase } from '../server/database.js';
import { AuthService } from '../server/auth.js';
import { grantGameAdmin, isGameAdmin } from '../server/game-admin.js';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';
import { structureHP } from '../shared/config.js';

const slots=()=>[{id:'t0',role:'troll',occupant:{type:'human',name:'Troll'}},...Array.from({length:5},(_,i)=>({id:'e'+i,role:'elf',occupant:{type:'human',name:'Elf '+i,partyId:i<2?'coop':null}}))];
const fixture=()=>new Match({seed:'THORNHOLD',coop:true},slots());

test('co-op stun cannot consume the partner cooldown or snapshot readiness',()=>{
  const m=fixture(),a=m.unit('e0'),b=m.unit('e1'),t=m.unit('t0');m.state=STATES.ACTIVE;m.time=60;
  Object.assign(a,{x:t.x+2,z:t.z});Object.assign(b,{x:t.x+3,z:t.z});
  assert.equal(m.act(a.id,{type:'elfStun'}),undefined);assert.equal(b.cooldowns.elfStun,undefined);
  assert.equal(m.snapshot(a.id).elfStun.available,false);assert.equal(m.snapshot(b.id).elfStun.available,true);
  assert.equal(m.act(b.id,{type:'elfStun'}),undefined);assert.equal(a.cooldowns.elfStun,120);assert.equal(b.cooldowns.elfStun,120);
});

test('recall lasts 7.5 seconds and remains interruptible without changing cooldown',()=>{
  const m=fixture(),t=m.unit('t0');m.state=STATES.ACTIVE;m.time=60;
  assert.equal(B.troll.recallChannel,7.5);assert.equal(B.troll.recallCooldown,180);
  assert.equal(m.act(t.id,{type:'trollRecall'}),undefined);assert.equal(t.recallUntil,67.5);
  m.time=65;m.step(1/B.tick);assert.ok(t.recallUntil>m.time);
  m.damage(t,1,m.unit('e0'),'tower','test');assert.equal(t.recallUntil,0);
});

test('co-op mine and tower quotas are personal, while core and gate stay shared',()=>{
  const settings={coop:true},a={id:'e0',partyId:'p'},b={id:'e1',partyId:'p'};
  const structures=['mine','tower','tower','wall','core'].map((kind,i)=>({id:i,baseId:'base',kind,owner:b.id,hp:100}));
  for(const kind of ['mine','tower']){assert.equal(constructionCount(structures,'base',kind,settings,a,b),0);assert.ok(constructionCount(structures,'base',kind,settings,b,b)>0);}
  for(const kind of ['wall','core'])assert.equal(constructionCount(structures,'base',kind,settings,a,b),1);
  assert.equal(constructionCount(structures,'base','tower',{coop:false},a,b),2);
  assert.equal(constructionCount(structures,'base','tower',settings,{...a,partyId:'other'},b),2);
});

test('building a mine in partner base spends only own resources and leaves partner quota intact',()=>{
  const m=fixture(),a=m.unit('e0'),b=m.unit('e1'),base=m.map.bases[0];m.time=20;
  m.structures.push({id:'partner-core',kind:'core',tier:1,owner:b.id,baseId:base.id,x:base.x,z:base.z,hp:structureHP('core',1),maxHp:structureHP('core',1),progress:1});
  for(const u of [a,b])Object.assign(u,{x:base.x,z:base.z-3,gold:100000,wood:100000,baseId:base.id});
  b.x=base.x+7;b.z=base.z+7;m.trees.forEach(t=>t.amount=0);
  const points=[];for(let dx=-6;dx<=6;dx+=1.5)for(let dz=-6;dz<=6;dz+=1.5)points.push({x:base.x+dx,z:base.z+dz});
  const point=points.find(p=>m.placement(a,'mine',p.x,p.z)===null);assert.ok(point);const before=b.gold;
  assert.equal(m.act(a.id,{type:'build',kind:'mine',...point}),undefined);assert.equal(b.gold,before);assert.equal(m.structures.at(-1).owner,a.id);assert.ok(a.gold<100000);
  assert.equal(constructionCount(m.structures,base.id,'mine',m.settings,b,b),0);
  b.x=base.x;b.z=base.z-3;a.x=base.x-7;a.z=base.z+7;
  const ownPoint=points.find(p=>m.placement(b,'mine',p.x,p.z)===null);assert.ok(ownPoint);
  assert.equal(m.act(b.id,{type:'build',kind:'mine',...ownPoint}),undefined);assert.equal(m.structures.filter(s=>s.kind==='mine').length,2);
  assert.ok(points.some(p=>/uma Mina/.test(m.placement(b,'mine',p.x,p.z)||'')));
});

test('one mine produces twice the previous base income at every tier/core band',()=>{
  for(const tier of [1,9,10,19,20,30])for(const coreTier of [1,5,20]){
    const amount=resourceProducer({kind:'mine',tier,coreTier}).amount;
    assert.ok(Number.isFinite(amount)&&amount>0);assert.equal(mineEconomy(coreTier).capacity,1);
  }
  assert.equal(B.structures.mine.income,1.3*2);assert.equal(B.construction.limits.mine,1);assert.equal(B.elfProgression.capital.requiredMines,1);
});

test('all six skins validate by faction and cannot inject combat attributes',()=>{
  assert.deepEqual(Object.keys(SKINS),['troll','elf']);for(const options of Object.values(SKINS)){assert.equal(options.length,3);assert.equal(new Set(options.map(s=>s.id)).size,3);for(const s of options)assert.deepEqual(Object.keys(s),['id','name','description','body','tunic','accent']);}
  assert.deepEqual(normalizeCosmetics({troll:'dawn',elf:'frost',damage:999}),{troll:'moss',elf:'grove'});
  assert.equal(cosmetic('troll','frost').body,0x7399ac);
});

test('lobby skins follow the occupant and freeze when the match starts',()=>{
  const sessions=new SessionService(),client=sessions.addClient('host','Host');
  sessions.setCosmetics(client,{troll:'frost',elf:'dawn'});const room=sessions.create(client,{role:'elf',fillBots:true,settings:{elfSlots:5,seed:'THORNHOLD',local:true}});
  assert.equal(sessions.serialize(room).slots.find(s=>s.occupant?.clientId===client.id).occupant.skinId,'dawn');
  sessions.setCosmetics(client,{troll:'ember',elf:'dusk'});room.members.get(client.id).ready=true;
  sessions.start(room,client);const unit=room.match.units.find(u=>u.clientId===client.id);assert.equal(unit.skinId,'dusk');assert.equal(room.match.snapshot(unit.id).units.find(u=>u.id===unit.id).skinId,'dusk');
  assert.throws(()=>sessions.setCosmetics(client,{elf:'grove'}),/bloqueada/);assert.equal(unit.skinId,'dusk');
});

test('skin selection appears in the catalog and first-person arm matches world palette',()=>{
  const choices={troll:'frost',elf:'dusk'},markup=cosmeticsMarkup(choices,'troll',true);
  assert.match(markup,/Preview 3D/);assert.equal((markup.match(/data-do="cosmetic-equip"/g)||[]).length,3);assert.match(markup,/EQUIPADO/);
  const viewmodel=new FirstPersonViewmodel(new T.PerspectiveCamera());
  viewmodel.update(1,.016,{entity:{role:'troll',skinId:'frost',alive:true,equipment:{}},blend:1});
  assert.equal(viewmodel.rig.children[0].material.color.getHex(),cosmetic('troll','frost').body);
});

test('character batching preserves animated limbs, held items and silhouette geometry',()=>{
  const g=character('troll',{},null,{},'ember');let meshes=0;g.traverse(o=>{if(o.isMesh)meshes++;});
  assert.ok(meshes<35,'excessive character draw calls: '+meshes);assert.equal(g.userData.arms.length,2);assert.equal(g.userData.legs.length,2);assert.ok(g.userData.heldItems.weapon);
  assert.ok(new T.Box3().setFromObject(g).getSize(new T.Vector3()).y>3);
});

test('third-person vertical mouse orbit affects height without changing default view',()=>{
  const low=followCameraOffset(0,13,-.2),high=followCameraOffset(0,13,1);
  assert.ok(high.y>low.y+5);assert.equal(high.x,low.x);assert.ok(low.y>=.6);
});

test('first-person walking bob is subtle without scaling the tool',()=>{
  const viewmodel=new FirstPersonViewmodel(new T.PerspectiveCamera());let min=Infinity,max=-Infinity;
  for(let i=0;i<120;i++){viewmodel.update(i/60,1/60,{entity:{role:'elf',alive:true,equipment:{}},blend:1,moving:true,sprinting:true});min=Math.min(min,viewmodel.root.position.y);max=Math.max(max,viewmodel.root.position.y);}
  assert.ok(max-min<.04);assert.deepEqual(viewmodel.rig.scale.toArray(),[1,1,1]);
});

test('FPS includes stalls and does not reduce resolution just because display is 60 Hz',()=>{
  const metrics=new FrameMetrics();for(let i=0;i<180;i++)metrics.record(1000/60);
  const steady=metrics.summary();assert.equal(steady.fps,60);assert.equal(resolutionStep(steady,1,1.5),1.05);
  for(let i=0;i<30;i++)metrics.record(100);const stalled=metrics.summary();assert.ok(stalled.fps<40);assert.equal(stalled.stalls,30);assert.equal(stalled.p95,100);
  for(let i=0;i<180;i++)metrics.record(33.3);assert.equal(resolutionStep(metrics.summary(),1,1.5),.9);
});

test('snapshot tower diagnostics are computed only when requested',()=>{
  const m=fixture();m.debugTowers=true;m.structures.push({id:'tower',kind:'tower',owner:'e0',tier:1,hp:100,maxHp:100,progress:1,x:0,z:0});
  let calls=0;m.towerTargeting=()=>{calls++;return {valid:false};};
  assert.equal(m.snapshot(null,{debugTowers:false}).debugTowers,undefined);assert.equal(calls,0);
  assert.equal(m.snapshot(null,{debugTowers:true}).debugTowers.length,1);assert.equal(calls,1);
});

test('physical audio buffers are bounded, finite, varied and reusable',()=>{
  for(const type of PHYSICAL_SOUNDS){const a=soundSamples(type,8000,0),b=soundSamples(type,8000,1);assert.ok(a.length<=4800);assert.ok(a.every(v=>Number.isFinite(v)&&Math.abs(v)<=.9));assert.deepEqual(a,soundSamples(type,8000,0));assert.notDeepEqual(a,b);}
});

test('admin privileges require a persisted grant, not nickname or registration input',async()=>{
  const database=new PlatformDatabase({filename:':memory:'}),auth=new AuthService(database);
  try{const result=await auth.register({username:'admin',email:'admin@test.com',displayName:'Admin',password:'StrongPass123',gameAdmin:true});
    assert.equal(result.user.gameAdmin,false);assert.equal(isGameAdmin(database,result.user.id),false);assert.throws(()=>grantGameAdmin(database,'Marcura'),/não encontrada/);
    grantGameAdmin(database,'ADMIN');assert.equal(auth.authenticate(result.token).gameAdmin,true);assert.equal(isGameAdmin(database,null),false);
  }finally{database.close();}
});

async function socketClient(port,options={}){
  const socket=new WebSocket('ws://127.0.0.1:'+port,{headers:options.cookie?{Cookie:options.cookie}:{}}),queue=[],waiters=[];
  socket.on('message',raw=>{queue.push(JSON.parse(raw));for(const wake of [...waiters])wake();});
  const wait=(type,predicate=()=>true)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{waiters.splice(waiters.indexOf(check),1);reject(new Error('Timeout: '+type+' '+JSON.stringify(queue.slice(-3))));},3000);function check(){const i=queue.findIndex(m=>m.type===type&&predicate(m));if(i>=0){clearTimeout(timer);waiters.splice(waiters.indexOf(check),1);resolve(queue.splice(i,1)[0]);}}waiters.push(check);check();});
  const send=(type,data={})=>socket.send(JSON.stringify({type,...data}));
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  send('hello',{name:'admin',cosmetics:{troll:'frost',elf:'dusk'}});const hello=await wait('hello');
  return {socket,wait,send,hello};
}

test('production WS authorizes granted account, rejects nickname spoof and serves debug only on demand',async()=>{
  const app=await createGameServer({port:0,host:'127.0.0.1',devMode:false,telemetry:false}),clients=[];
  try{
    const session=await app.auth.register({username:'AdminReal',email:'admin-real@test.com',displayName:'Admin real',password:'StrongPass123'});
    grantGameAdmin(app.platformDatabase,session.user.id);
    const admin=await socketClient(app.port,{cookie:'thornhold_session='+session.token}),anonymous=await socketClient(app.port);clients.push(admin,anonymous);
    assert.equal(admin.hello.devMode,true);assert.equal(anonymous.hello.devMode,false);
    for(const c of clients){c.send('create',{role:'troll',fillBots:true,settings:{elfSlots:5,mode:'custom',local:false}});const created=await c.wait('lobby');assert.equal(created.room.slots[0].occupant.skinId,'frost');c.send('observe');await c.wait('lobby',m=>!m.room.slots.some(s=>s.occupant?.clientId===c.hello.id));c.send('slot',{slot:'t0',action:'bot'});await c.wait('lobby',m=>m.room.slots.every(s=>s.closed||s.occupant?.type==='bot'));c.send('ready',{ready:true});await c.wait('lobby',m=>m.room.errors.length===0);c.send('start');await c.wait('map');assert.equal((await c.wait('snapshot')).snapshot.debugTowers,undefined);}
    anonymous.send('dev',{command:'speed',speed:8});assert.match((await anonymous.wait('error')).message,/conta autorizada/);
    admin.send('dev',{command:'speed',speed:8});assert.equal((await admin.wait('dev')).speed,8);
    admin.send('dev',{command:'grant',target:'t0',gold:100});assert.equal((await admin.wait('dev',m=>m.granted)).granted.gold,100);
    admin.send('dev',{command:'debug',enabled:true});assert.ok(Array.isArray((await admin.wait('snapshot',m=>Array.isArray(m.snapshot.debugTowers))).snapshot.debugTowers));
    admin.send('dev',{command:'debug',enabled:false});assert.equal((await admin.wait('snapshot',m=>!m.snapshot.debugTowers)).snapshot.debugTowers,undefined);
    const room=app.sessions.room(app.sessions.clients.get(admin.hello.id));assert.equal(room.adminModified,true);assert.equal(app.platform.rankedStatus(room),'unranked');room.settings.mode='ranked';admin.send('dev',{command:'speed',speed:16});assert.match((await admin.wait('error')).message,/ranqueadas/);room.settings.mode='custom';app.auth.logout(session.token);admin.send('dev',{command:'grant',target:'t0',gold:100});assert.match((await admin.wait('error')).message,/conta autorizada/);
  }finally{for(const c of clients)c.socket.terminate();await app.close();}
});
