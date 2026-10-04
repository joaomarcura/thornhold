import test from 'node:test';
import assert from 'node:assert/strict';
import { AIController } from '../shared/controllers.js';
import { Match } from '../shared/simulation.js';
import { BALANCE as B, STATES, income, structureHP, towerProfile, upgradeCost } from '../shared/config.js';
import { baseAt, generateMap, pathfind } from '../shared/map.js';
import { CRYSTAL_RULES, constructionEffects, specializationStatus } from '../shared/structure-specializations.js';
import { spawnCrystalWave } from '../shared/crystals.js';
import { upgradeStatus } from '../shared/upgrade-rules.js';
import { productionMultiplier, abilityStatus } from '../shared/elf-progression.js';
import { applySnapshotDelta, createSnapshotDelta } from '../shared/snapshot-delta.js';
import { selectionMarkup } from '../client/selection.js';

function fixture(settings={}){
  const slots=[{id:'t',role:'troll',occupant:{type:'human',name:'Troll'}},...Array.from({length:5},(_,i)=>({id:'e'+i,role:'elf',occupant:{type:'human',name:'Elfo '+i}}))];
  return new Match({seed:'THORNHOLD',...settings},slots);
}
function structure(m,kind,tier=10,owner='e0'){
  const base=m.map.bases[0],point=kind==='wall'?base.gate:base;
  const s={id:'fixture-'+kind+'-'+m.structures.length,kind,tier,owner,baseId:base.id,x:point.x,z:point.z,hp:structureHP(kind,tier),maxHp:structureHP(kind,tier),progress:1,upgrading:0,coreTier:10,lastHit:-100,bounty:100000};
  m.structures.push(s);const u=m.unit(owner);Object.assign(u,{baseId:base.id,x:s.x+3,z:s.z,gold:1000000,wood:1000000});return s;
}
function advance(m,seconds){for(let i=0;i<Math.ceil(seconds*B.tick);i++)m.step(1/B.tick);}
function hold(m,u,node,seconds=3){for(let i=0;i<Math.ceil(seconds*B.tick);i++){m.act(u.id,{type:'gatherSpecial',target:node.id});m.step(1/B.tick);}}

test('Elfos começam com 100 cristais, Troll não; madeira permanece local',()=>{
  const m=fixture();assert.equal(m.unit('t').specialResources.crystal,0);
  for(const u of m.units.filter(u=>u.role==='elf')){assert.equal(u.specialResources.crystal,100);assert.equal(u.wood,B.elf.wood);assert.equal(u.essence,0);}
  assert.ok(m.map.trees.length);assert.ok(m.map.trees.every(t=>baseAt(m.map,t)));assert.equal(m.specialNodes.length,0);
  assert.equal(m.act('e0',{type:'build',kind:'bastion',x:0,z:0}),'Construção indisponível.');
  assert.equal(m.act('e0',{type:'trainSpecialWisp'}),'Cristais são coletados manualmente; Wisps especiais foram removidos.');
});
test('Custos comuns mantêm ouro/madeira, só 20/30 cobram cristal no upgrade',()=>{
  for(const kind of ['core','wall','tower','mine'])for(let tier=1;tier<30;tier++){
    const cost=upgradeCost({kind,tier});assert.ok(cost.gold>0&&cost.wood>0);assert.equal(cost.essence,undefined);
    assert.equal(cost.specialAmount||0,tier===19?15:tier===29?20:0);
  }
});
test('Especialização é por construção, exclusiva do dono e não duplica gasto',()=>{
  const m=fixture({coop:true}),u=m.unit('e0'),tower=structure(m,'tower');
  assert.equal(specializationStatus(m.unit('e1'),tower,m.time).allowed,false);
  assert.equal(m.act(u.id,{type:'specializeStructure',target:tower.id,key:'rapid'}),null);
  assert.equal(u.specialResources.crystal,90);assert.equal(u.stats.crystalSpent,10);
  assert.ok(m.act(u.id,{type:'specializeStructure',target:tower.id,key:'power'}));
  assert.equal(u.specialResources.crystal,90);assert.equal(tower.specialization,'rapid');
  assert.ok(towerProfile(tower).interval<1);assert.equal(u.elfSpecialization,null);
  assert.ok(upgradeStatus(u,{...tower,specialization:null},m.time,m.state).reasons.some(r=>r.code==='specialization'));
  tower.hp=0;const rebuilt=structure(m,'tower');assert.equal(rebuilt.specialization,undefined);
  assert.equal(m.act(u.id,{type:'specializeStructure',target:rebuilt.id,key:'arcane'}),null);
});
test('Os 12 ramos produzem efeitos reais e escalam somente nos marcos',()=>{
  const m=fixture(),u=m.unit('e0'),core=structure(m,'core'),mine=structure(m,'mine');
  core.specialization='industrial';assert.ok(income(core)>income({...core,specialization:null}));
  assert.ok(productionMultiplier(m,u,mine)>productionMultiplier(m,u,core));
  core.specialization='fortress';assert.equal(constructionEffects(core).baseReduction,.1);
  core.specialization='arcane';assert.equal(constructionEffects(core).abilityCooldown,.15);
  for(const key of ['yield','reserve','logistics']){mine.specialization=key;assert.ok(income(mine)>income({...mine,specialization:null}));}
  assert.equal(constructionEffects({...mine,specialization:'reserve'}).health,.25);
  assert.equal(constructionEffects({...mine,specialization:'logistics'}).collectionSpeed,.25);
  const tower=structure(m,'tower');assert.ok(towerProfile({...tower,specialization:'power'}).damage>towerProfile(tower).damage);
  assert.ok(towerProfile({...tower,specialization:'rapid'}).interval<1);
  assert.equal(towerProfile({...tower,specialization:'arcane'}).range,2);
  const wall=structure(m,'wall');assert.equal(constructionEffects({...wall,specialization:'fortress'}).health,.2);
  assert.equal(constructionEffects({...wall,specialization:'restoration'}).regen,.35);
  assert.equal(constructionEffects({...wall,specialization:'ward',tier:30}).reduction,.27);
});
test('Nível 20/30 desconta cristal uma só vez e recalcula HP especializado',()=>{
  const m=fixture(),u=m.unit('e0'),wall=structure(m,'wall',19);wall.specialization='fortress';
  assert.equal(m.act(u.id,{type:'upgrade',target:wall.id}),undefined);assert.equal(u.specialResources.crystal,85);
  assert.ok(m.act(u.id,{type:'upgrade',target:wall.id}));assert.equal(u.specialResources.crystal,85);
  advance(m,11);assert.equal(wall.tier,20);assert.equal(wall.maxHp,structureHP('wall',20)*1.28);
  wall.tier=29;assert.equal(m.act(u.id,{type:'upgrade',target:wall.id}),undefined);advance(m,11);
  assert.equal(wall.tier,30);assert.equal(u.specialResources.crystal,65);assert.equal(u.stats.crystalSpent,35);
  assert.ok(u.stats.milestoneTimes[wall.id][20]>=0);assert.ok(u.stats.milestoneTimes[wall.id][30]>=0);
  assert.ok(m.act(u.id,{type:'upgrade',target:wall.id}));
});
test('Ondas 15/30/45 reproduzíveis, acessíveis e aceleradas sem duplicação',()=>{
  const m=fixture(),other=fixture();m.time=2700;other.time=2700;
  m.step(.05);other.step(.05);assert.equal(m.crystalWaves.length,3);assert.equal(m.specialNodes.length,30);
  assert.deepEqual(m.specialNodes,other.specialNodes);m.step(.05);assert.equal(m.specialNodes.length,30);
  for(const node of m.specialNodes){assert.equal(node.amount,25);assert.equal(baseAt(m.map,node),undefined);assert.ok(pathfind(m.map,m.map.elfSpawn,node).length);}
  assert.equal(B.matchHardLimit,3600);
});
test('Mapa amplo co-op também conserva apenas madeira interna e dez depósitos',()=>{
  const m=fixture({coop:true,mapSize:'large'});spawnCrystalWave(m,0);assert.equal(m.specialNodes.length,10);
  assert.ok(m.map.trees.every(t=>baseAt(m.map,t)));assert.ok(m.map.coopTunnels.length);
});
test('Canalização manual exige 3s, interrompe e dá depósito ao primeiro',()=>{
  const m=fixture();m.state=STATES.ACTIVE;m.time=900;spawnCrystalWave(m,0);m.nextCrystalWave=1;
  const node=m.specialNodes[0],a=m.unit('e0'),b=m.unit('e1');Object.assign(a,{x:node.x,z:node.z});Object.assign(b,{x:node.x,z:node.z});
  m.act(a.id,{type:'gatherSpecial',target:node.id});advance(m,.7);assert.equal(a.crystalChannel,null);assert.equal(a.specialResources.crystal,100);
  for(let i=0;i<60;i++){m.act(a.id,{type:'gatherSpecial',target:node.id});m.act(b.id,{type:'gatherSpecial',target:node.id});m.step(.05);}
  assert.equal(a.specialResources.crystal+b.specialResources.crystal,225);assert.equal(node.amount,0);
  assert.ok(m.act('t',{type:'gatherSpecial',target:node.id}));assert.ok(m.act(a.id,{type:'gatherSpecial',target:node.id}));
});
test('Movimento, dano, stun e cancelamento explícito interrompem coleta',()=>{
  for(const reason of ['movement','damage','stun','release']){
    const m=fixture();m.state=STATES.ACTIVE;m.time=900;spawnCrystalWave(m,0);m.nextCrystalWave=1;
    const u=m.unit('e0'),node=m.specialNodes[0];Object.assign(u,{x:node.x,z:node.z});m.act(u.id,{type:'gatherSpecial',target:node.id});
    if(reason==='movement')u.x+=1;if(reason==='damage')u.lastHit=m.time+.01;if(reason==='stun')u.stunnedUntil=m.time+5;if(reason==='release')m.act(u.id,{type:'cancelCrystal'});
    m.step(.05);assert.equal(u.crystalChannel,null);assert.equal(node.amount,25);
  }
});
test('Habilidades do Núcleo usam somente cooldown; Arcano afeta torres normais',()=>{
  const m=fixture(),u=m.unit('e0'),core=structure(m,'core'),tower=structure(m,'tower');core.specialization='arcane';u.elfSpecialization='arcane';
  assert.ok(abilityStatus(m,u).available);const crystals=u.specialResources.crystal;
  assert.equal(m.act(u.id,{type:'elfSpecializationAbility'}),null);assert.equal(u.specialResources.crystal,crystals);assert.ok(tower.overchargedUntil>m.time);
  assert.equal(abilityStatus(m,u).available,false);
});
test('Snapshot/delta/reconexão e painel preservam saldo, ramo e ondas',()=>{
  const m=fixture(),u=m.unit('e0'),tower=structure(m,'tower'),before=m.snapshot(u.id);
  m.act(u.id,{type:'specializeStructure',target:tower.id,key:'power'});m.time=900;m.step(.05);
  const after=m.snapshot(u.id),delta=createSnapshotDelta(before,after),restored=applySnapshotDelta(before,delta);
  assert.deepEqual(restored,after);assert.equal(after.structures[0].specialization,'power');
  const html=selectionMarkup(after.structures[0],{u:after.units.find(e=>e.id===u.id),snapshot:after,map:m.map});assert.ok(html.includes('Balista'));assert.ok(!html.includes('Madeira Ancestral'));assert.ok(!html.includes('Tecnologias'));
  assert.equal(after.resourceVersion,2);assert.equal(after.nextCrystalWaveAt,1800);assert.equal(after.specialNodes.length,10);
  assert.equal(m.result().telemetry.crystals.players[0].spent,10);
});
test('Anúncio de onda é global, mas o snapshot não revela quem está coletando',()=>{
  const m=fixture();m.time=900;m.step(.05);
  for(const id of ['e0','t',null])assert.ok(m.snapshot(id).events.some(e=>e.type==='crystal-wave'));
  const node=m.specialNodes[0];node.collectors=['e0','e1'];node.contestedStarts=1;
  assert.equal(m.snapshot('t').specialNodes[0].collectors,undefined);assert.equal(m.snapshot('t').specialNodes[0].contestedStarts,undefined);
});
test('Bots reservam depósitos distintos, sustentam canalização e cancelam diante de ameaça',()=>{
  const m=fixture();m.state=STATES.ACTIVE;m.time=900;spawnCrystalWave(m,0);m.nextCrystalWave=1;
  const a=m.unit('e0'),b=m.unit('e1'),ca=new AIController('normal'),cb=new AIController('normal'),base=m.map.bases[0];ca.elfProfile=cb.elfProfile='balanced';
  m.controllers.set(a.id,ca);m.controllers.set(b.id,cb);
  assert.equal(ca.collectCrystals(m,a,base,null),true);assert.equal(cb.collectCrystals(m,b,base,null),true);assert.notEqual(ca.crystalTargetId,cb.crystalTargetId);
  // Isolate the selected collection intention from unrelated opening/base
  // construction: the normal tick must still sustain its held channel.
  ca.nextThink=cb.nextThink=Infinity;
  const node=m.specialNodes.find(n=>n.id===ca.crystalTargetId);Object.assign(a,{x:node.x,z:node.z});ca.stop(a);
  ca.collectCrystals(m,a,base,null);advance(m,3);
  assert.equal(a.stats.crystalCollected,25);
  ca.collectCrystals(m,a,base,null);const target=ca.crystalTargetId;ca.collectCrystals(m,a,base,{x:a.x,z:a.z});
  assert.equal(a.crystalChannel,null);assert.equal(a.crystalExpedition,null);assert.equal(m.crystalReservations.has(target),false);
});
test('Reparo comum preserva ouro e madeira; marco não pode ser escolhido à distância ou por morto',()=>{
  const m=fixture(),u=m.unit('e0'),tower=structure(m,'tower');tower.hp-=100;
  const before={gold:u.gold,wood:u.wood};m.repair(u,tower.id);assert.equal(u.gold,before.gold-B.elf.repairCost);assert.equal(u.wood,before.wood-1);
  u.x+=30;assert.ok(m.act(u.id,{type:'specializeStructure',target:tower.id,key:'power'}));u.x=tower.x;u.alive=false;
  assert.equal(specializationStatus(u,tower,m.time).allowed,false);
});

test('Eliminação registra cristal perdido sem duplicar perdas na telemetria',()=>{
  const m=fixture(),u=m.unit('e0');m.eliminateElf(u,null);m.eliminateElf(u,null);
  assert.equal(u.stats.crystalLost,100);assert.equal(u.specialResources.crystal,0);
  const ledger=m.result().telemetry.crystals.players.find(row=>row.id===u.id);
  assert.equal(ledger.lostOnElimination,100);
  assert.equal(ledger.initial+ledger.collected+ledger.devGranted+ledger.refunded,ledger.spent+ledger.remaining+ledger.lostOnElimination);
});
