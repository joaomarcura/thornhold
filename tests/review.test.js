import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../shared/simulation.js';
import { BALANCE as B, STATES, distance } from '../shared/config.js';
import { upgradeStatus } from '../shared/upgrade-rules.js';
import { selectionMarkup } from '../client/selection.js';
import { resource,resourceCost } from '../client/resources.js';
import { AIController } from '../shared/controllers.js';
import { combatRisk } from '../shared/combat-risk.js';
import { lineOfSight } from '../shared/map.js';
import { playerScore } from '../shared/score.js';
import { BUILD_CAMERA_DISTANCE, FOLLOW_CAMERA_HEIGHT, boundedConstructionPoint, followCameraOffset } from '../client/renderer.js';

const create=()=>new Match({seed:'REVIEW',diagnostics:true},[{id:'t',role:'troll',occupant:{type:'human',name:'Troll'}},{id:'e',role:'elf',occupant:{type:'human',name:'Elf'}}]);

test('Zoom altera distância horizontal sem elevar a câmera de acompanhamento',()=>{
  const offsets=[5,13,23].map(zoom=>followCameraOffset(Math.PI*.37,zoom));
  assert.ok(offsets.every(offset=>Math.abs(offset.y-FOLLOW_CAMERA_HEIGHT)<1e-9));
  assert.ok(Math.hypot(offsets[0].x,offsets[0].z)<Math.hypot(offsets[1].x,offsets[1].z));
  assert.ok(Math.hypot(offsets[1].x,offsets[1].z)<Math.hypot(offsets[2].x,offsets[2].z));
});
test('Câmera de construção mantém a projeção da mira dentro do alcance',()=>{
  const origin={x:10,z:-4},range=B.construction.range;
  const fallback=boundedConstructionPoint(origin,null,Math.PI/2,range);
  assert.ok(Math.abs(distance(origin,fallback)-Math.min(BUILD_CAMERA_DISTANCE,range-.5))<1e-9);
  const clamped=boundedConstructionPoint(origin,{x:100,z:100},0,range);
  assert.ok(distance(origin,clamped)<=range-.5+1e-9);
  const nearby=boundedConstructionPoint(origin,{x:12,z:-1},0,range);
  assert.deepEqual(nearby,{x:12,z:-1});
});
function fixture(){
  const m=create(),u=m.unit('e'),b=m.map.bases[0];Object.assign(u,{x:b.x+4.4,z:b.z});
  assert.equal(m.act(u.id,{type:'build',kind:'core',x:b.x,z:b.z}),undefined);
  for(let i=0;i<100;i++)m.step(.05);
  const core=m.structures[0];Object.assign(u,{x:b.gate.x,z:b.gate.z,gold:1000,wood:1000});assert.equal(m.act(u.id,{type:'build',kind:'wall',x:b.gate.x,z:b.gate.z}),undefined);
  for(let i=0;i<80;i++)m.step(.05);
  const wall=m.structures.find(s=>s.kind==='wall');Object.assign(u,{x:core.x+3,z:core.z,gold:119,wood:67});
  return {m,u,core,wall};
}
test('Core tier 2 accepts screenshot resources immediately, even during preparation',()=>{
  const {m,u,core}=fixture();assert.equal(m.state,STATES.PREP);
  assert.equal(upgradeStatus(u,core,m.time,m.state,m.structures).allowed,true);
  const html=selectionMarkup(core,{u,snapshot:m.snapshot('e'),map:m.map});
  assert.doesNotMatch(html.match(/<button[^>]*data-do="upgrade"[^>]*>/)[0],/disabled/);
  assert.equal(m.act('e',{type:'upgrade',target:core.id}),undefined);
  assert.equal(u.gold,19);assert.equal(u.wood,32);assert.ok(core.upgrading>0);
  for(let i=0;i<100;i++)m.step(.05);assert.equal(core.tier,2);
});
test('Exact affordability, barricade progression, and server messages share one rule',()=>{
  const {m,u,core,wall}=fixture();
  for(const [field,value,code] of [['gold',99.999,'gold'],['wood',34.999,'wood'],['alive',false,'player']]){
    const before=u[field];u[field]=value;const result=upgradeStatus(u,core,m.time,m.state,m.structures);
    assert.ok(result.reasons.some(r=>r.code===code));u[field]=before;
  }
  u.gold=100;u.wood=35;assert.equal(upgradeStatus(u,core,0,STATES.PREP,m.structures).allowed,true);
  u.x+=20;assert.match(m.upgrade(u,core.id),/Aproxime-se/);u.x-=20;
  core.progress=.5;assert.match(m.upgrade(u,core.id),/construção/);core.progress=1;
  core.upgrading=2;assert.match(m.upgrade(u,core.id),/andamento/);core.upgrading=0;
  core.tier=3;u.gold=u.wood=10000;let status=upgradeStatus(u,core,0,STATES.ACTIVE,m.structures);assert.ok(status.reasons.some(r=>r.code==='barricade'));assert.match(status.reasons.find(r=>r.code==='barricade').message,/nível 2 necessária — atual: nível 1/);
  wall.tier=2;assert.equal(upgradeStatus(u,core,0,STATES.ACTIVE,m.structures).allowed,true);
  wall.hp=0;status=upgradeStatus(u,core,0,STATES.ACTIVE,m.structures);assert.match(status.reasons.find(r=>r.code==='barricade').message,/não construída/);wall.hp=wall.maxHp;
  assert.ok(upgradeStatus(u,core,0,STATES.END,m.structures).reasons.some(r=>r.code==='match'));
  core.owner='someone-else';assert.ok(upgradeStatus(u,core,0,STATES.ACTIVE,m.structures).reasons.some(r=>r.code==='owner'));
});
test('Selection changes at resource threshold without a clock tick and explains distance',()=>{
  const {m,u,core}=fixture(),render=()=>selectionMarkup(core,{u,snapshot:m.snapshot('e'),map:m.map});
  u.gold=99.99;const before=render();assert.match(before,/Ouro insuficiente/);
  u.gold=100;const after=render();assert.notEqual(before,after);assert.doesNotMatch(after,/Ouro insuficiente/);
  u.x+=10;assert.match(render(),/Aproxime-se:/);
  const amount=resource('gold',99.99);assert.match(amount,/>99</);assert.doesNotMatch(amount,/>100</);
  const costs=resourceCost({gold:100,wood:35});assert.match(costs,/resource-gold/);assert.match(costs,/resource-wood/);assert.doesNotMatch(costs,/[◇♧]/);
});

test('Seleção oferece demolição pronta com reembolso e confirmação no cliente',()=>{
  const {m,u,core}=fixture(),snapshot=m.snapshot('e'),entity=snapshot.structures.find(s=>s.id===core.id),html=selectionMarkup(entity,{u,snapshot,map:m.map});
  assert.match(html,/data-do="demolish"/);assert.match(html,/75% do custo original/);assert.match(html,/Demolir estrutura/);
});
test('Selection identifies free barricade repair and diminishing assistance',()=>{
  const {m,u,core}=fixture(),wall={...core,id:'wall-ui',kind:'wall',hp:core.maxHp-50};
  const html=selectionMarkup(wall,{u,snapshot:m.snapshot('e'),map:m.map});
  assert.match(html,/GRÁTIS/);assert.match(html,/Primeiro reparador: 100%/);assert.match(html,/ajudantes simultâneos: 25%/);assert.doesNotMatch(html,/resource-gold[^>]*>3</);
});
test('Selection no longer offers direct resource transfer to an ally',()=>{
  const {m,u}=fixture(),ally=m.unit('t');Object.assign(ally,{role:'elf',name:'Aliado'});
  const html=selectionMarkup(ally,{u,snapshot:m.snapshot('e'),map:m.map});assert.doesNotMatch(html,/data-do="transfer"|Enviar/);
});
test('Navigation endpoint is in real action range, including last-cell approach',()=>{
  const m=create(),u=m.unit('t'),c=new AIController(),target={id:'target',kind:'tower',x:u.x+12,z:u.z,hp:260,tier:1,progress:1};
  m.structures.push(target);c.discovered.set(target.id,target);m.state=STATES.ACTIVE;
  c.go(m,u,target,3.5);c.follow(m,u,.1);
  assert.ok(c.route.length);assert.ok(distance(c.route.at(-1),target)<=3.5);assert.ok(lineOfSight(m.map,c.route.at(-1),target));
  for(let i=0;i<200&&c.destination;i++){m.time+=.1;c.follow(m,u,.1);m.movement(u,.1);}
  assert.ok(distance(u,target)<=3.5);assert.equal(c.metrics.failedNavigation,0);
});
test('Risk accounts for simultaneous towers, HP, support, armor and finishing window',()=>{
  const m=create(),u=m.unit('t');m.state=STATES.ACTIVE;m.time=60;
  const tower=i=>({id:'tower'+i,kind:'tower',x:u.x+5,z:u.z+i,hp:260,tier:1,branch:'power',progress:1});
  const one=combatRisk(m,u,[tower(0)],u,tower(0)),four=combatRisk(m,u,Array.from({length:4},(_,i)=>tower(i)),u,tower(0));
  assert.equal(one.towers,1);assert.equal(four.towers,4);assert.ok(four.riskScore>one.riskScore);
  u.hp/=2;assert.ok(combatRisk(m,u,[tower(0)],u,tower(0)).riskScore>one.riskScore);
  assert.ok(combatRisk(m,u,[tower(0)],u,{...tower(0),hp:1}).killSeconds<one.killSeconds);
});
test('Telemetry distinguishes hunger, caps overkill, tracks tower count and earned gold',()=>{
  const m=create(),t=m.unit('t'),e=m.unit('e');m.state=STATES.ACTIVE;m.time=60;
  m.damage(t,10,e,'tower','a');m.damage(t,20,e,'tower','b');m.damage(t,5,null,'hunger');
  m.telemetry.step(m,.1);assert.equal(m.telemetry.peakTowers,2);
  const before=t.gold;m.damage(e,20,t,'melee');assert.equal(t.stats.goldGenerated,t.gold-before);
  m.time=63;m.telemetry.step(m,.1);assert.equal(m.telemetry.hits.size,0);
  m.damage(t,999999,e,'tower','a');const report=m.result();
  assert.equal(report.telemetry.death.time,63);assert.equal(report.telemetry.received.hunger,5);
  assert.equal(report.telemetry.received.tower,B.troll.hp-5);assert.equal(report.telemetry.survivalCensored,false);
  assert.ok(report.telemetry.timeline.length<=500);assert.equal(m.state,STATES.END);
});
test('Match diagnostics do not alter deterministic gameplay',()=>{
  const a=create(),b=create();b.telemetry.detailed=false;
  for(let i=0;i<100;i++){a.step(.1);b.step(.1);}
  assert.deepEqual(a.units,b.units);assert.deepEqual(a.structures,b.structures);
});
test('V2.1 registra estado, setores, cercos, trade, pressão e economia sem dirigir a IA',()=>{
  const m=create(),t=m.unit('t'),e=m.unit('e'),controller=new AIController('normal');m.state=STATES.ACTIVE;m.controllers.set(t.id,controller);controller.brain={state:'siege',targetId:'v2-wall'};
  const wall={id:'v2-wall',kind:'wall',owner:e.id,baseId:'v2-base',x:t.x+2,z:t.z,hp:20,maxHp:20,tier:1,progress:1,bounty:20};m.structures.push(wall);
  m.time=60;m.telemetry.step(m,.1);m.damage(wall,20,t,'melee');controller.brain.state='rotate';controller.brain.targetId=null;m.time=65;m.telemetry.step(m,.1);
  m.time=m.preparation+430;m.telemetry.step(m,.1);const v2=m.result().telemetry.v2;
  assert.equal(v2.observational,true);assert.equal(v2.matchState.phase,'SIEGE');assert.ok(v2.sectors.some(s=>s.visits>0));
  assert.equal(v2.siegeSummary.count,1);assert.equal(v2.siegeSummary.successful,1);assert.ok(v2.sieges[0].tradeScore>0);assert.equal(v2.sieges[0].structuresDestroyed.wall,1);
  assert.ok(v2.pressureWindows.length>=1);assert.ok(v2.economyCheckpoints.some(c=>c.time===180));assert.ok(v2.stateSeconds.SIEGE>0);assert.ok(v2.stateSeconds.ROTATE>0);
  const economy=v2.economyCheckpoints.find(c=>c.time===180).elves;assert.ok(Object.hasOwn(economy,'netSpentGold'));assert.ok(Object.hasOwn(economy,'goldUtilization'));assert.ok(economy.spendByPurpose.economy);assert.ok(economy.spendByPurpose.defense);assert.ok(Array.isArray(economy.players));
  const frozen=economy.players[0].spendByPurpose;m.unit('e').stats.spendByPurpose.economy={gold:999,wood:999};assert.notDeepEqual(frozen,m.unit('e').stats.spendByPurpose);
  assert.equal(Object.hasOwn(v2.matchState,'elfPower'),true);assert.equal(Object.hasOwn(v2.matchState,'volatility'),true);
});
test('Stun defensivo só funciona na própria base rompida e bloqueia o Troll por 3s',()=>{
  const m=new Match({seed:'STUN'},[{id:'t',role:'troll',occupant:{type:'human',name:'Troll'}},{id:'e0',role:'elf',occupant:{type:'human',name:'A'}},{id:'e1',role:'elf',occupant:{type:'human',name:'B'}}]);
  const troll=m.unit('t'),elf=m.unit('e0'),ally=m.unit('e1'),base=m.map.bases[0];m.state=STATES.ACTIVE;m.time=60;
  elf.baseId=base.id;ally.baseId=m.map.bases[1].id;Object.assign(elf,{x:base.x,z:base.z});Object.assign(troll,{x:base.x+4,z:base.z});
  assert.match(m.act(elf.id,{type:'elfStun'}),/Barricada/);
  const wall={id:'wall-stun',kind:'wall',owner:elf.id,baseId:base.id,x:base.gate.x,z:base.gate.z,hp:1,maxHp:1100,progress:1,bounty:1};
  m.structures.push(wall);m.damage(wall,1,troll,'melee');assert.ok(m.breachUntil.get(base.id)>m.time);
  troll.pendingStrike={heavy:true,at:m.time+1};troll.input={x:1,z:0};assert.equal(m.act(elf.id,{type:'elfStun'}),undefined);
  assert.equal(troll.stunnedUntil,m.time+3);assert.equal(troll.pendingStrike,null);assert.deepEqual(troll.input,{x:0,z:0});assert.equal(elf.stats.stuns,1);
  const x=troll.x;m.input(troll.id,{x:1,z:0});m.movement(troll,1);assert.equal(troll.x,x);assert.match(m.act(troll.id,{type:'attack'}),/Atordoado/);
  assert.match(m.act(ally.id,{type:'elfStun'}),/Barricada/);
  m.time+=3.01;assert.equal(troll.effects,undefined);assert.match(m.act(elf.id,{type:'elfStun'}),/recarregando/);
  const effects=m.snapshot(troll.id).units.find(u=>u.id===troll.id).effects;assert.ok(!effects.some(e=>e.id==='stunned'));
});
test('Placar ao vivo não vaza posição ou HP e MVP pertence ao time vencedor',()=>{
  const m=new Match({seed:'SCORE'},[{id:'t',role:'troll',occupant:{type:'human',name:'Troll'}},{id:'e0',role:'elf',occupant:{type:'human',name:'Builder'}},{id:'e1',role:'elf',occupant:{type:'human',name:'Guardian'}}]);
  const builder=m.unit('e0'),guardian=m.unit('e1'),troll=m.unit('t');
  Object.assign(builder.stats,{goldGenerated:800,woodGenerated:600,structuresBuilt:4,upgrades:3,healing:200});
  Object.assign(guardian.stats,{damage:1200,kills:1,stuns:2});Object.assign(troll.stats,{damage:9000,structuresDestroyed:4});
  assert.ok(playerScore(guardian)>playerScore(builder));
  const live=m.snapshot(builder.id).scoreboard;assert.equal(live.length,3);assert.ok(!Object.hasOwn(live[0],'x'));assert.ok(!Object.hasOwn(live[0],'hp'));
  m.winner='elves';m.state=STATES.END;const result=m.result();
  assert.equal(result.mvp.id,guardian.id);assert.equal(result.players.length,3);
  assert.ok(result.players.every(p=>Number.isFinite(p.score)&&Object.hasOwn(p,'structuresBuilt')&&Object.hasOwn(p,'stuns')));
});
test('Núcleo destruído abre uma janela de reassentamento antes da derrota',()=>{
  const first=fixture(),{m,u,core}=first,troll=m.unit('t');m.state=STATES.ACTIVE;m.time=60;
  m.damage(core,core.hp,troll,'melee');
  assert.equal(m.state,STATES.ACTIVE);assert.equal(u.baseId,null);assert.equal(u.relocationUntil,60+B.elf.relocationSeconds);
  const own=m.snapshot(u.id).units.find(a=>a.id===u.id);assert.equal(own.relocationUntil,u.relocationUntil);assert.equal(own.relocationVouchers,1);
  const next=m.map.bases.find(b=>b.id!==core.baseId);Object.assign(u,{x:next.x+4.4,z:next.z,gold:0,wood:0});
  assert.equal(m.act(u.id,{type:'build',kind:'core',x:next.x,z:next.z}),undefined);
  assert.equal(u.gold,0);assert.equal(u.wood,0);assert.equal(u.relocationVouchers,0);assert.equal(u.stats.relocations,1);
  assert.equal(u.relocationUntil,0);assert.equal(m.state,STATES.ACTIVE);
  const replacement=m.structures.at(-1);replacement.progress=1;replacement.hp=replacement.maxHp;
  m.damage(replacement,replacement.hp,troll,'melee');assert.equal(u.relocationUntil,0);assert.equal(m.state,STATES.END);

  const expired=fixture();expired.m.state=STATES.ACTIVE;expired.m.time=60;
  expired.m.damage(expired.core,expired.core.hp,expired.m.unit('t'),'melee');
  expired.m.time=expired.u.relocationUntil+.01;expired.m.checkEndState();
  assert.equal(expired.m.state,STATES.END);assert.equal(expired.m.endReason,'all-elf-bases-destroyed');
});
test('Morte do Elfo colapsa patrimônio, paga 25% e libera a clareira após 15s',()=>{
  const m=new Match({seed:'COLLAPSE'},[{id:'t',role:'troll',occupant:{type:'human',name:'Troll'}},{id:'e0',role:'elf',occupant:{type:'human',name:'Dono'}},{id:'e1',role:'elf',occupant:{type:'human',name:'Herdeiro'}}]);
  const troll=m.unit('t'),owner=m.unit('e0'),ally=m.unit('e1'),base=m.map.bases[0];m.state=STATES.ACTIVE;m.time=60;owner.baseId=base.id;owner.gold=999;owner.wood=777;
  const core={id:'collapse-core',kind:'core',owner:owner.id,baseId:base.id,x:base.x,z:base.z,tier:1,hp:360,maxHp:360,progress:1,bounty:160,lastHit:-100};
  const tower={id:'collapse-tower',kind:'tower',owner:owner.id,baseId:base.id,x:base.x+4.4,z:base.z,tier:1,hp:360,maxHp:360,progress:1,bounty:160,lastHit:-100};
  const allied={id:'allied-tower',kind:'tower',owner:ally.id,baseId:base.id,x:base.x-4.4,z:base.z,tier:1,hp:360,maxHp:360,progress:1,bounty:160,lastHit:-100};m.structures.push(core,tower,allied);m.elfBasesClaimed.add(base.id);
  m.wisps.push({id:'collapse-wisp',role:'wisp',owner:owner.id,x:base.x,z:base.z,alive:true,hp:55,maxHp:55,bounty:10});
  m.damage(owner,owner.hp,troll,'melee');const collapse=m.events.find(e=>e.type==='collapse');
  assert.equal(owner.gold,0);assert.equal(owner.wood,0);assert.equal(core.hp,0);assert.equal(tower.hp,0);assert.equal(allied.hp,360);assert.equal(m.wisps[0].alive,false);assert.ok(collapse.reward>0&&collapse.reward<=(160+160)*.25);assert.equal(m.state,STATES.ACTIVE);
  Object.assign(ally,{x:base.x+4.4,z:base.z,gold:1000,wood:1000});assert.match(m.act(ally.id,{type:'build',kind:'core',x:base.x,z:base.z}),/colapso/);
  m.time=75.01;assert.equal(m.act(ally.id,{type:'build',kind:'core',x:base.x,z:base.z}),undefined);assert.equal(m.structures.at(-1).owner,ally.id);
});
test('Espírito move, revela, repara a 50% e uma segunda morte vira observação',()=>{
  const m=new Match({seed:'GHOST'},[{id:'t',role:'troll',occupant:{type:'human',name:'Troll'}},{id:'e0',role:'elf',occupant:{type:'human',name:'Espírito'}},{id:'e1',role:'elf',occupant:{type:'human',name:'Vivo'}}]);
  const troll=m.unit('t'),ghost=m.unit('e0'),ally=m.unit('e1'),base=m.map.bases[0];m.state=STATES.ACTIVE;m.time=60;m.damage(ghost,ghost.hp,troll,'melee');
  assert.equal(ghost.alive,false);assert.equal(ghost.ghost,true);assert.equal(ghost.hp,B.ghost.hp);assert.equal(m.state,STATES.ACTIVE);assert.match(m.act(ghost.id,{type:'build',kind:'tower',x:base.x,z:base.z}),/espírito/);
  Object.assign(ghost,{x:base.x,z:base.z});Object.assign(ally,m.map.bases.at(-1));Object.assign(troll,{x:base.x+14,z:base.z});assert.equal(m.teamSee(ally,troll),false);
  assert.equal(m.act(ghost.id,{type:'ghostReveal'}),undefined);assert.equal(m.teamSee(ally,troll),true);assert.equal(m.reveals[0].until,m.time+B.ghost.revealDuration);assert.match(m.act(ghost.id,{type:'ghostReveal'}),/recarregando/);
  const wall={id:'ghost-wall',kind:'wall',owner:ally.id,baseId:base.id,x:ghost.x+1,z:ghost.z,tier:1,hp:400,maxHp:500,progress:1,bounty:100,lastHit:-100};m.structures.push(wall);assert.equal(m.act(ghost.id,{type:'repair',target:wall.id}),undefined);assert.equal(wall.hp,421);
  const x=ghost.x;m.input(ghost.id,{x:-1,z:0});m.movement(ghost,.1);assert.notEqual(ghost.x,x);
  const gold=troll.gold,kills=m.stats.kills,eliminations=m.telemetry.eliminations.length;m.damage(ghost,ghost.hp,troll,'melee');assert.equal(ghost.ghost,false);assert.equal(ghost.observer,true);assert.equal(troll.gold,gold+B.ghost.goldReward);assert.equal(m.stats.kills,kills);assert.equal(m.telemetry.eliminations.length,eliminations);assert.equal(troll.stats.ghostsDestroyed,1);
});
