import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../shared/simulation.js';
import { BALANCE as B, STATES, wispCost, wispIncome, structureHP, trollCost, upgradeCost, mineEconomy, resourceProducer } from '../shared/config.js';
import { combatStats, ITEMS } from '../shared/equipment.js';
import { jobRefund } from '../shared/jobs.js';

function match(){return new Match({seed:'PROGRESSION'},[
  {id:'t',role:'troll',occupant:{type:'human',name:'Troll'}},
  {id:'e',role:'elf',occupant:{type:'human',name:'Elfo'}},
  {id:'ally',role:'elf',occupant:{type:'human',name:'Aliado'}}
]);}
function advance(m,seconds){for(let i=0;i<Math.ceil(seconds*20);i++)m.step(.05);}
function baseFixture(m){
  const e=m.unit('e'),b=m.map.bases[0];Object.assign(e,{x:b.x+4.4,z:b.z,gold:1000000,wood:1000000});
  assert.equal(m.act('e',{type:'build',kind:'core',x:b.x,z:b.z}),undefined);advance(m,5);
  return {e,core:m.structures[0],b};
}
function arena(){
  const m=match(),t=m.unit('t'),e=m.unit('e');m.state=STATES.ACTIVE;m.time=80;
  Object.assign(e,{x:t.x,z:t.z+2,hp:10000,maxHp:10000});Object.assign(m.unit('ally'),m.map.bases[0]);t.yaw=0;
  return {m,t,e};
}
function ready(m,t){advance(m,Math.max(0,(t.cooldowns.attack||0)-m.time)+.05);}

test('Cancelar investimento devolve apenas trabalho pendente e não permite duplicar recursos',()=>{
  const m=match(),{e,core}=baseFixture(m);m.act('e',{type:'upgrade',target:core.id});advance(m,1);
  const refund=jobRefund(core,m.time),gold=e.gold,wood=e.wood,hp=core.hp;
  assert.equal(m.act('e',{type:'cancelJob',target:core.id}),undefined);
  assert.equal(e.gold,gold+refund.gold);assert.equal(e.wood,wood+refund.wood);assert.equal(core.upgrading,0);assert.equal(core.hp,hp);
  assert.match(m.act('e',{type:'cancelJob',target:core.id}),/andamento/);assert.equal(e.gold,gold+refund.gold);
  advance(m,5);assert.equal(core.tier,1);
  m.act('e',{type:'trainWisp',target:core.id});const w=m.wisps[0];advance(m,1);const before=e.gold,cost=jobRefund(w,m.time);
  m.act('e',{type:'cancelJob',target:w.id});assert.equal(w.alive,false);assert.equal(e.gold,before+cost.gold);advance(m,7);assert.equal(m.snapshot('e').wisps.length,0);
  m.act('e',{type:'trainWisp',target:core.id});advance(m,7);const worker=m.wisps[1];m.act('e',{type:'upgradeWisp',target:worker.id});advance(m,1);m.act('e',{type:'cancelJob',target:worker.id});advance(m,5);assert.equal(worker.level,1);assert.ok(m.snapshot('e').wisps[0].income>0);
});

test('Cancelamento respeita proprietário, distância, combate e obra concluída',()=>{
  const m=match(),e=m.unit('e'),base=m.map.bases[0];Object.assign(e,{x:base.x+4.4,z:base.z});
  m.act('e',{type:'build',kind:'core',x:base.x,z:base.z});const core=m.structures[0];
  assert.match(m.act('ally',{type:'cancelJob',target:core.id}),/sua/);
  e.x+=20;assert.match(m.act('e',{type:'cancelJob',target:core.id}),/Aproxime/);e.x-=20;
  core.lastHit=m.time;assert.match(m.act('e',{type:'cancelJob',target:core.id}),/sem dano/);core.lastHit=-100;
  assert.equal(m.act('e',{type:'cancelJob',target:core.id}),undefined);assert.equal(core.hp,0);assert.equal(e.baseId,null);assert.equal(m.stats.destroyed,0);
  m.act('e',{type:'build',kind:'core',x:base.x,z:base.z});advance(m,5);assert.match(m.act('e',{type:'cancelJob',target:m.structures[1].id}),/andamento/);
});

test('Estruturas e atributos continuam evoluindo após tier 4 sem custo grátis',()=>{
  const m=match(),{e,core}=baseFixture(m),t=m.unit('t');m.time=300;m.state=STATES.ACTIVE;t.gold=1000000;
  for(let i=0;i<9;i++){
    const before=e.gold,cost=upgradeCost(core),oldHP=core.maxHp;
    assert.equal(m.act('e',{type:'upgrade',target:core.id}),undefined);assert.equal(e.gold,before-cost.gold);advance(m,11);assert.ok(core.maxHp>oldHP);
    const gold=t.gold,price=trollCost('damage',t.levels.damage);assert.equal(m.act('t',{type:'buy',key:'damage'}),undefined);assert.equal(t.gold,gold-price);
  }
  assert.equal(core.tier,10);assert.equal(t.levels.damage,9);assert.ok(trollCost('damage',9)>trollCost('damage',8));assert.ok(structureHP('wall',10)>structureHP('wall',9));
});

test('Minas ganham uma vaga por tier do Núcleo e escalam custo e produção',()=>{
  const m=match(),{e,core,b}=baseFixture(m);e.x=b.x;e.z=b.z;
  const points=[];for(const dx of [-4.4,-2.2,0,2.2,4.4])for(const dz of [-4.4,-2.2,0,2.2,4.4])if(dx||dz)points.push({x:b.x+dx,z:b.z+dz});
  const firstPoint=points.find(p=>m.placement(e,'mine',p.x,p.z)===null);assert.ok(firstPoint);const firstCost=mineEconomy(1).cost,before=e.gold;
  assert.equal(m.act(e.id,{type:'build',kind:'mine',...firstPoint}),undefined);const first=m.structures.at(-1);assert.equal(e.gold,before-firstCost.gold);assert.deepEqual(first.constructionCost,firstCost);advance(m,6);
  const blockedPoint=points.find(p=>/Núcleo nível 2/.test(m.placement(e,'mine',p.x,p.z)||''));assert.ok(blockedPoint);
  e.x=core.x+3;e.z=core.z;e.gold=e.wood=1000000;assert.equal(m.act(e.id,{type:'upgrade',target:core.id}),undefined);advance(m,5);assert.equal(core.tier,2);
  e.x=b.x;e.z=b.z;const secondPoint=points.find(p=>m.placement(e,'mine',p.x,p.z)===null);assert.ok(secondPoint);const secondCost=mineEconomy(2).cost,gold=e.gold;
  assert.equal(m.act(e.id,{type:'build',kind:'mine',...secondPoint}),undefined);assert.equal(e.gold,gold-secondCost.gold);advance(m,6);assert.equal(first.coreTier,2);const tier2Income=resourceProducer(first).amount;
  e.x=core.x+3;e.z=core.z;assert.equal(m.act(e.id,{type:'upgrade',target:core.id}),undefined);advance(m,6);assert.equal(first.coreTier,3);assert.ok(resourceProducer(first).amount>tier2Income);assert.equal(mineEconomy(5).capacity,5);
});

test('Níveis extremos mantêm números finitos e ações com tempo de resposta legível',()=>{
  const u=match().unit('t');for(const key of Object.keys(u.levels))u.levels[key]=1000;
  for(const v of Object.values(combatStats(u)))assert.ok(Number.isFinite(v));
  assert.ok(combatStats(u).interval>=.25);assert.ok(combatStats(u).dashCooldown>2);assert.ok(combatStats(u).roarDuration<8);
  assert.ok(Number.isFinite(trollCost('damage',1000)));assert.ok(Number.isFinite(structureHP('wall',1000)));
});

test('Núcleo forma Wisp com custo, fila, árvore exclusiva e renda contínua',()=>{
  const m=match(),{e,core}=baseFixture(m),gold=e.gold,wood=e.wood,cost=wispCost(0);
  assert.equal(m.act('e',{type:'trainWisp',target:core.id}),undefined);const w=m.wisps[0],tree=m.trees.find(t=>t.id===w.treeId),reserve=tree.amount;
  assert.equal(e.gold,gold-cost.gold);assert.equal(e.wood,wood-cost.wood);
  assert.match(m.act('e',{type:'trainWisp',target:core.id}),/já está/);
  advance(m,5);assert.equal(e.wood,wood-cost.wood);advance(m,2);const produced=e.wood;assert.ok(produced>wood-cost.wood);assert.equal(tree.amount,reserve);
  assert.equal(m.act('e',{type:'trainWisp',target:core.id}),undefined);assert.notEqual(m.wisps[1].treeId,w.treeId);assert.ok(wispCost(1).gold>cost.gold);
  const snapshot=m.snapshot('e');assert.ok(snapshot.units.find(u=>u.id==='e').woodIncome>0);assert.equal(m.snapshot('t').wisps.length,0);
});

test('Wisp respeita dono, núcleo, visão e perda de produção quando destruído',()=>{
  const m=match(),{e,core}=baseFixture(m);
  assert.match(m.act('ally',{type:'trainWisp',target:core.id}),/núcleo/);
  assert.match(m.act('e',{type:'trainWisp',target:core.id,tree:m.trees.at(-1).id}),/árvore/);
  m.act('e',{type:'trainWisp',target:core.id});advance(m,7);const w=m.wisps[0];
  assert.match(m.act('ally',{type:'upgradeWisp',target:w.id}),/seu/);
  const old=wispIncome(w);m.act('e',{type:'upgradeWisp',target:w.id});advance(m,4.1);assert.equal(w.level,2);assert.ok(wispIncome(w)>old);
  core.hp=0;const paused=e.wood;advance(m,2);assert.equal(e.wood,paused);
  core.hp=core.maxHp;advance(m,1);assert.ok(e.wood>paused);
  m.damage(w,999,m.unit('t'),'melee');const stopped=e.wood;advance(m,2);assert.equal(e.wood,stopped);assert.equal(m.snapshot('e').wisps.length,0);assert.equal(m.unit('e').alive,true);
});

test('Coleta manual não derruba árvore ocupada; rebrote não atravessa construções',()=>{
  const m=match(),{e,core}=baseFixture(m);m.act('e',{type:'trainWisp',target:core.id});const w=m.wisps[0],tree=m.trees.find(t=>t.id===w.treeId);
  Object.assign(e,{x:tree.x+1,z:tree.z});assert.match(m.act('e',{type:'gather',target:tree.id}),/Wisp/);
  const other=m.trees.find(t=>t.id!==tree.id);other.amount=0;other.regrowAt=m.time+.1;
  const blocker={id:'blocker',kind:'tower',owner:'e',x:other.x,z:other.z,hp:100,maxHp:100,progress:1,healthProgress:1,tier:1,branch:'power',lastShot:m.time};m.structures.push(blocker);
  advance(m,1);assert.equal(other.amount,0);blocker.hp=0;advance(m,.1);assert.ok(other.amount>0);
});

test('Equipamentos exigem compra, respeitam espaços e trocas não curam',()=>{
  const {m,t}=arena();t.gold=2000;t.hp=t.maxHp*.5;
  assert.match(m.act('t',{type:'buyItem',item:'__proto__'}),/inválido/);
  assert.match(m.act('e',{type:'buyItem',item:'maul'}),/inválido/);
  assert.match(m.act('t',{type:'equipItem',item:'maul'}),/Compre/);
  m.act('t',{type:'buyItem',item:'maul'});assert.equal(t.gold,2000-ITEMS.maul.cost);assert.equal(t.equipment.weapon,'maul');
  m.act('t',{type:'buyItem',item:'claws'});assert.equal(t.equipment.weapon,'claws');assert.ok(t.inventory.includes('maul'));
  const gold=t.gold;m.act('t',{type:'equipItem',item:'maul'});assert.equal(t.gold,gold);
  m.act('t',{type:'buyItem',item:'mantle'});assert.equal(t.hp/t.maxHp,.5);m.act('t',{type:'buyItem',item:'carapace'});assert.equal(t.hp/t.maxHp,.5);
  t.lastHit=m.time;assert.match(m.act('t',{type:'equipItem',item:'mantle'}),/fora de combate/);
});

test('Golpe tem preparação, não acerta alvo que saiu do alcance nem repete por spam',()=>{
  const {m,t,e}=arena(),hp=e.hp;m.act('t',{type:'attack'});assert.equal(e.hp,hp);
  for(let i=0;i<8;i++)m.act('t',{type:'attack'});advance(m,.15);assert.equal(e.hp,hp-B.troll.damage);
  ready(m,t);m.act('t',{type:'attack',heavy:true});e.z+=10;advance(m,.4);assert.equal(e.hp,hp-B.troll.damage);assert.ok(m.events.some(e=>e.type==='miss'));
});

test('Buffer aceita um comando perto do fim do cooldown e esquiva cancela preparação',()=>{
  const {m,t,e}=arena();m.act('t',{type:'attack'});advance(m,.95);m.act('t',{type:'attack'});assert.ok(t.queuedStrike);advance(m,.3);assert.equal(e.hp,10000-2*B.troll.damage);
  ready(m,t);m.act('t',{type:'attack',heavy:true});const hp=e.hp;m.act('t',{type:'dash'});assert.equal(t.pendingStrike,null);advance(m,.4);assert.equal(e.hp,hp);assert.ok(t.z>m.map.trollSpawn.z);assert.ok(t.openingUntil>m.time);
});

test('Terceiro acerto no mesmo alvo finaliza combo; alvo atrás não recebe dano',()=>{
  const {m,t,e}=arena();for(let i=0;i<3;i++){m.act('t',{type:'attack'});advance(m,.15);ready(m,t);}
  assert.equal(e.hp,10000-B.troll.damage*(3+B.combat.comboBonus));assert.ok(m.events.some(e=>e.type==='impact'&&e.finisher));
  e.z=t.z-2;const hp=e.hp;m.act('t',{type:'attack'});advance(m,.15);assert.equal(e.hp,hp);
});

test('Ruptura confirma dano real, libera passagem e impede reconstrução imediata',()=>{
  const {m,t}=arena(),base=m.map.bases[0];Object.assign(t,{x:base.gate.x,z:base.gate.z});m.map.grid.fill(0);
  const wall={id:'gate',kind:'wall',owner:'e',baseId:base.id,x:t.x,z:t.z+2,hp:10,maxHp:850,tier:1,bounty:3,progress:1,healthProgress:1};m.structures.push(wall);
  m.act('t',{type:'attack'});advance(m,.15);assert.equal(wall.hp,0);assert.equal(t.gold,3);assert.equal(m.breachUntil.get(base.id)>m.time,true);
  const impact=m.events.find(e=>e.type==='impact');assert.equal(impact.amount,10);assert.equal(impact.broken,true);
});

test('Defesa de torres mata Troll exposto e encerra partida com vitória dos Elfos',()=>{
  const {m,t}=arena();m.map.grid.fill(0);
  for(let i=0;i<5;i++)m.structures.push({id:'defense'+i,kind:'tower',owner:'e',x:t.x+5,z:t.z+i,tier:4,branch:'pierce',hp:800,maxHp:800,progress:1,healthProgress:1,lastShot:0});
  advance(m,30);assert.equal(t.alive,false);assert.equal(m.winner,'elves');assert.equal(m.state,STATES.END);assert.ok(m.stats.towerDamage>0);
  const end=m.time;advance(m,2);assert.equal(m.time,end);
});
