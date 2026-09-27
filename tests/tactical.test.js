import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../shared/simulation.js';
import { STATES, BALANCE as B, distance } from '../shared/config.js';
import { toCell, index, baseAt } from '../shared/map.js';
import { AIController } from '../shared/controllers.js';
import { TacticalMap } from '../client/tactical-map.js';
import { StrategicMap } from '../shared/strategic-map.js';
import { TROLL_STATES, TrollBrain } from '../shared/troll-brain.js';
import { evaluateThreatAt } from '../shared/combat-risk.js';
import { BUILDS } from '../shared/equipment.js';
const match=()=>new Match({seed:'TACTICS'},[{id:'t',role:'troll',occupant:{type:'human',name:'Troll'}},...['e0','e1'].map(id=>({id,role:'elf',occupant:{type:'human',name:id}}))]);

test('Seed varia patrulha do Troll, refúgios e planos de construção sem perder reprodutibilidade',()=>{
  const plan=seed=>{
    const slots=[{id:'t',role:'troll',occupant:{type:'human',name:'Troll'}},...Array.from({length:5},(_,i)=>({id:`e${i}`,role:'elf',occupant:{type:'human',name:`Elfo ${i}`}}))];
    const m=new Match({seed},slots),elf=new AIController('normal'),troll=new AIController('normal');
    elf.elf(m,m.unit('e0'));troll.searchStarted=true;troll.explore(m,m.unit('t'));
    return {strategy:elf.elfProfile,build:elf.buildPlan,refuges:elf.metrics.refugeOrder,patrol:troll.metrics.patrolOrder};
  };
  assert.deepEqual(plan('DYNAMIC-A'),plan('DYNAMIC-A'));
  const variants=Array.from({length:8},(_,i)=>JSON.stringify(plan(`DYNAMIC-${i}`)));
  assert.ok(new Set(variants).size>=6,JSON.stringify(variants));
});
test('Variação de rota muda lado inicial e sentido sem alterar a seed do mapa',()=>{
  const route=(start,direction)=>{
    const m=new Match({seed:'SAME-WORLD',routeVariant:`route-${start}-${direction}`,trollPatrolStart:start,trollPatrolDirection:direction},[{id:'t',role:'troll',occupant:{type:'human',name:'Troll'}},{id:'e',role:'elf',occupant:{type:'human',name:'Elf'}}]),c=new AIController('normal');
    c.explore(m,m.unit('t'));return {start:c.metrics.patrolStart,direction:c.metrics.patrolDirection,order:c.metrics.patrolOrder,destination:c.destination};
  };
  const first=route(0,1),second=route(5,-1);assert.notEqual(first.start,second.start);assert.notEqual(first.direction,second.direction);assert.notDeepEqual(first.order,second.order);assert.notDeepEqual(first.destination,second.destination);
});
test('Troll reinicia patrulha quando todo o mapa conhecido fica sem alvo',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal');m.state=STATES.ACTIVE;m.time=1200;c.searchStarted=true;c.searchBases=[...m.map.bases];c.searchBaseIndex=c.searchBases.length;
  for(let z=0;z<m.map.size;z++)for(let x=0;x<m.map.size;x++)c.explored.add(index(m.map,x,z));
  c.explore(m,u);assert.ok(c.destination);assert.equal(c.searchBaseIndex,1);assert.equal(c.metrics.patrolCycles,1);
});
test('Custo de tempo reduz prioridade de viagens enquanto cinco economias continuam crescendo',()=>{
  const m=match(),u=m.unit('t'),brain=new TrollBrain(),target={id:'far-elf',role:'elf',ghost:false,x:u.x+20,z:u.z,hp:85,maxHp:85,seenAt:m.time},core={id:'known-core',kind:'core',x:u.x+4,z:u.z,tier:5,hp:1000,maxHp:1000,progress:1,seenAt:m.time},stats=m.trollStats(u);
  const without=brain.targetScore(m,u,target,[],stats),withEconomy=brain.targetScore(m,u,target,[core],stats);assert.ok(withEconomy.opportunityCost>0);assert.ok(withEconomy.score<without.score);
});
test('Seleção e combate compartilham a mesma avaliação de ameaça ao longo da rota',()=>{
  const m=match(),u=m.unit('t'),brain=new TrollBrain(),tower={id:'risk-tower',kind:'tower',x:u.x+5,z:u.z+2,hp:360,maxHp:360,tier:4,branch:'power',progress:1},wall={id:'risk-wall',kind:'wall',x:u.x+11,z:u.z,hp:2310,maxHp:2310,tier:1,progress:1},known=[tower,wall],stats=m.trollStats(u),d=distance(u,wall),reach=stats.range+B.structures.wall.radius-.35,approach={x:wall.x+(u.x-wall.x)/d*Math.min(d,reach),z:wall.z+(u.z-wall.z)/d*Math.min(d,reach)};
  const selected=brain.targetScore(m,u,wall,known,stats).danger,direct=evaluateThreatAt(m,u,known,{position:approach,target:wall,path:[u,approach]});
  assert.equal(selected.riskScore,direct.riskScore);assert.equal(selected.dps,direct.dps);assert.equal(selected.towers,direct.towers);assert.ok(selected.pathDamage>0);
});
test('Ameaça de torre atravessa a fronteira entre setores estratégicos',()=>{
  const m=match(),u=m.unit('t'),memory=new StrategicMap(),width=memory.dimensions(m)/memory.grid,point={x:width+1,z:width*.5},tower={id:'border-tower',kind:'tower',x:width-1,z:point.z,hp:360,maxHp:360,tier:4,branch:'power',progress:1,seenAt:m.time};
  memory.update(m,u,[tower]);const sectorId=memory.idAt(m,point);memory.ensure(m,sectorId);const report=memory.report(m,u).find(row=>row.id===sectorId);assert.ok(report.estimatedTowerDps>0,JSON.stringify(report));
});
test('Três cercos fracassados suprimem o alvo até o Troll ficar mais forte',()=>{
  const m=match(),u=m.unit('t'),brain=new TrollBrain(),wall={id:'fortified-wall',kind:'wall',x:u.x+4,z:u.z,hp:5000,maxHp:5000,tier:6,progress:1};m.time=100;
  brain.recordTargetOutcome(m,u,wall.id,false,.2);brain.recordTargetOutcome(m,u,wall.id,false,.3);brain.recordTargetOutcome(m,u,wall.id,false,.1);
  assert.equal(brain.targetFailure(wall.id).fortified,true);assert.equal(brain.targetSuppressed(m,u,wall),true);u.levels.siege=3;assert.equal(brain.targetSuppressed(m,u,wall),true,'o cooldown impede retorno imediato mesmo após uma melhoria');m.time=brain.targetFailure(wall.id).retryAfter+.1;assert.equal(brain.targetSuppressed(m,u,wall),false);
});
test('Fortificação suprimida força patrulha em vez de uma quarta tentativa imediata',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal'),wall={id:'scout-wall',kind:'wall',owner:'e0',baseId:'scout-base',x:u.x+5,z:u.z,hp:5000,maxHp:5000,tier:8,progress:1};m.state=STATES.ACTIVE;m.time=200;m.structures.push(wall);for(const elf of m.units.filter(unit=>unit.role==='elf'))Object.assign(elf,{x:0,z:0});
  c.brain=new TrollBrain();c.brain.probedBases.set(wall.baseId,m.time);c.brain.targetFailures.set(wall.id,{failures:3,lastPower:c.brain.powerValue(u),suppressedUntil:m.time+600,retryAfter:m.time+180,tradeScores:[0,0],fortified:true,siegeLevel:0,equipmentCount:0,targetHpRatio:1,knownTowers:0,legendary:false});
  c.troll(m,u);assert.equal(c.brain.state,'explore');assert.equal(c.brain.targetId,null);assert.ok(c.destination);assert.ok(distance(c.destination,wall)>1);
});
test('Patrulha após fortificação suprimida não alterna HUNT e EXPLORE a cada decisão',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal'),wall={id:'oscillation-wall',kind:'wall',owner:'e0',baseId:'oscillation-base',x:u.x+5,z:u.z,hp:5000,maxHp:5000,tier:8,progress:1};m.state=STATES.ACTIVE;m.time=352;m.structures.push(wall);for(const elf of m.units.filter(unit=>unit.role==='elf'))Object.assign(elf,{x:0,z:0});
  c.brain=new TrollBrain();c.brain.probedBases.set(wall.baseId,m.time);c.brain.targetFailures.set(wall.id,{failures:3,lastPower:c.brain.powerValue(u),suppressedUntil:m.time+600,retryAfter:m.time+180,tradeScores:[0,0],fortified:true,siegeLevel:0,equipmentCount:0,targetHpRatio:1,knownTowers:0,legendary:false});
  c.troll(m,u);assert.equal(c.brain.state,'explore');assert.ok(c.brain.suppressionScout);
  Object.assign(u,{x:u.x-40,z:u.z-40});
  for(let i=0;i<12;i++){m.time+=.8;c.troll(m,u);assert.equal(c.brain.state,'explore',`decisão ${i} voltou para ${c.brain.state}`);assert.notEqual(c.brain.targetId,wall.id);}
});
test('CHASE mantém o Elfo em alcance como alvo até completar um ataque',()=>{
  const m=match(),t=m.unit('t'),elf=m.unit('e0'),c=new AIController('normal'),wall={id:'chase-wall',kind:'wall',owner:'e1',baseId:'other-base',x:t.x,z:t.z+5,hp:5000,maxHp:5000,tier:6,progress:1};m.state=STATES.ACTIVE;m.time=200;Object.assign(elf,{x:t.x+2.5,z:t.z});Object.assign(m.unit('e1'),{x:0,z:0});m.structures.push(wall);
  c.brain=new TrollBrain();c.brain.targetId=elf.id;c.brain.chase={targetId:elf.id,startedAt:m.time-1,budget:15,killsAtStart:0,lastSeen:{x:elf.x,z:elf.z},strikeUntil:m.time+1.6};
  c.troll(m,t);assert.equal(c.brain.targetId,elf.id);assert.equal(c.brain.state,'chase');assert.ok(t.pendingStrike);
});
test('CHASE em alcance ignora marcador antigo de rotação até resolver o golpe',()=>{
  const m=match(),t=m.unit('t'),elf=m.unit('e0'),c=new AIController('normal'),tower={id:'tempting-tower',kind:'tower',owner:'e1',baseId:'other-base',x:t.x-4,z:t.z,hp:300,maxHp:300,tier:2,branch:'power',progress:1};m.state=STATES.ACTIVE;m.time=200;Object.assign(elf,{x:t.x+2.5,z:t.z});Object.assign(m.unit('e1'),{x:0,z:0});m.structures.push(tower);
  c.brain=new TrollBrain();c.brain.targetId=elf.id;c.brain.chase={targetId:elf.id,startedAt:m.time-1,budget:15,killsAtStart:0,lastSeen:{x:elf.x,z:elf.z},strikeUntil:m.time+1.6};c.brain.avoid.push({id:elf.id,x:elf.x,z:elf.z,until:m.time+8});
  c.troll(m,t);assert.equal(c.brain.targetId,elf.id);assert.equal(c.brain.state,'chase');assert.ok(t.pendingStrike);
});

test('IA prioriza roubo de vida na Forja após cercos repetidamente fracassados',()=>{
  const m=match(),u=m.unit('t'),controller=new AIController('normal'),brain=new TrollBrain();m.state=STATES.ACTIVE;m.time=100;u.gold=1000;Object.assign(u,m.map.trollShop);brain.build=BUILDS.hunter;brain.failedSieges=2;
  assert.equal(brain.purchase(controller,m,u,false,[]),true);assert.ok(u.inventory.includes('amber'));assert.equal(u.equipment.helmet,'amber');
});

test('Mapa estratégico esquece estrutura quando o Troll confirma que o local está vazio',()=>{
  const m=match(),t=m.unit('t'),brain=new TrollBrain();
  const remembered={id:'gone-tower',kind:'tower',x:t.x+3,z:t.z,maxHp:100,hp:100,progress:1,baseId:'base-x'};
  brain.strategicMap.update(m,t,[remembered]);
  assert.ok(brain.strategicMap.observations.has(remembered.id));
  brain.strategicMap.update(m,t,[]);
  assert.equal(brain.strategicMap.observations.has(remembered.id),false);
});
test('CHASE usa orçamento dinâmico e estagnação troca caça improdutiva por raid',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal'),brain=new TrollBrain(),elf=m.unit('e0');m.state=STATES.ACTIVE;
  Object.assign(elf,{x:u.x+6,z:u.z,hp:10});assert.equal(brain.chaseBudget(m,u,elf,{danger:{towers:0}}),20);elf.hp=elf.maxHp;elf.x=u.x+16;assert.equal(brain.chaseBudget(m,u,elf,{danger:{towers:1}}),9);
  brain.strategy='hunter';brain.lastProgressAt=0;m.time=100;brain.updateDirector(c,m,u,[]);assert.equal(brain.strategy,'raider');assert.equal(brain.stagnationEvents,1);assert.equal(brain.director.stagnant,true);
});

test('Pings validam coordenadas, respeitam equipe, cooldown e expiração',()=>{
  const m=match();assert.match(m.act('e0',{type:'ping',x:NaN,z:1}),/inválida/);assert.match(m.act('e0',{type:'ping',x:-1,z:1}),/inválida/);assert.match(m.act('e0',{type:'ping',x:99999,z:1}),/inválida/);
  assert.equal(m.act('e0',{type:'ping',kind:'danger',x:30,z:40}),undefined);
  assert.equal(m.snapshot('e1').pings[0].x,30);assert.equal(m.snapshot('e1').pings[0].kind,'danger');assert.equal(m.snapshot('t').pings.length,0);
  assert.match(m.act('e0',{type:'ping'}),/Aguarde/);m.time=4;m.unit('e0').alive=false;assert.equal(m.act('e0',{type:'ping',kind:'help',x:40,z:30}),undefined);
  m.time=15;assert.equal(m.snapshot('e1').pings.length,0);
});
test('Roda de comunicação preserva pedidos distintos sem transferir recursos',()=>{
  for(const[kind,text]of Object.entries({gold:'Preciso de ouro!',wood:'Preciso de madeira!',defend:'Defendam esta clareira!',attack:'Ataquem este alvo!'})){const m=match(),u=m.unit('e0'),before=[u.gold,u.wood];assert.equal(m.act(u.id,{type:'ping',kind,x:20,z:20}),undefined);assert.equal(m.pings[0].text,text);assert.deepEqual([u.gold,u.wood],before);}
});
test('Efeitos usam relógio do servidor e desaparecem no vencimento',()=>{
  const m=match(),u=m.unit('t');m.state=STATES.ACTIVE;m.time=20;u.lastHit=19;u.slowUntil=21.5;u.dashUntil=20.4;u.hp=900;u.exposure=12;
  let effects=m.snapshot('t').units.find(e=>e.id==='t').effects;assert.equal(effects.find(e=>e.id==='frost').until,21.5);assert.equal(effects.find(e=>e.id==='regen-delay').until,23);assert.ok(effects.some(e=>e.id==='exposure'));
  m.time=26;effects=m.snapshot('t').units.find(e=>e.id==='t').effects;assert.ok(!effects.some(e=>['frost','dash','regen-delay'].includes(e.id)));assert.ok(effects.some(e=>e.id==='regen'));
  m.time=B.idlePressureAge+50;effects=m.snapshot('t').units.find(e=>e.id==='t').effects;assert.ok(!effects.some(e=>e.id==='hunger'));assert.ok(effects.some(e=>e.id==='regen'));
});
test('Ataques aliados geram alerta sem revelar posição atual do atacante oculto',()=>{
  const m=match(),t=m.unit('t'),ally=m.unit('e1'),base=m.map.bases[0];m.time=20;Object.assign(ally,{x:base.x,z:base.z});Object.assign(t,m.map.bases[7]);m.damage(ally,10,t,'melee');
  const s=m.snapshot('e0');assert.ok(s.alerts.some(a=>a.id===ally.id&&a.x===ally.x));assert.ok(!s.units.some(u=>u.id===t.id));assert.ok(!s.alerts.some(a=>a.owner===t.id));m.time=26;assert.equal(m.snapshot('e0').alerts.length,0);
});
test('Mapa conserva apenas última posição observada e não acompanha Troll oculto',()=>{
  const m=match(),map=new TacticalMap(m.map),u=m.unit('e0');map.update({units:[{id:'t',role:'troll',alive:true,x:10,z:20}],structures:[],time:1},u);
  map.update({units:[],structures:[],time:3},u);assert.deepEqual(map.lastTroll,{x:10,z:20,time:1});
  const point=map.point({getBoundingClientRect:()=>({left:100,top:100,width:200,height:200})},{clientX:200,clientY:200});assert.equal(point.x,(m.map.size-1)*m.map.cell/2);
});
test('IA não memoriza nem contorna estruturas que ainda não avistou',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('hard'),b=m.map.bases[0];m.state=STATES.ACTIVE;m.time=60;
  m.structures.push({id:'hidden',kind:'wall',x:b.gate.x,z:b.gate.z,hp:1000,maxHp:1000,progress:1});assert.equal(m.canSee(u,m.structures[0]),false);c.troll(m,u);assert.equal(c.discovered.has('hidden'),false);assert.equal(c.navigationBlocks(m,u).size,0);
});
test('IA Elfa planeja upgrade distante e caminha até a estrutura',()=>{
  const m=match(),u=m.unit('e0'),t=m.unit('t'),c=new AIController('normal'),base=m.map.bases[0];m.state=STATES.ACTIVE;m.time=80;Object.assign(t,{x:0,z:0});Object.assign(u,{x:base.outside.x,z:base.outside.z,gold:10000,wood:10000,baseId:base.id});
  const core={id:'remote-core',kind:'core',owner:u.id,baseId:base.id,x:base.x,z:base.z,hp:360,maxHp:360,tier:1,progress:1,upgrading:0},wall={id:'remote-wall',kind:'wall',owner:u.id,baseId:base.id,x:base.gate.x,z:base.gate.z,hp:2035,maxHp:2035,tier:2,progress:1,upgrading:0},tower={id:'remote-tower',kind:'tower',owner:u.id,baseId:base.id,x:base.x+3,z:base.z,hp:360,maxHp:360,tier:1,progress:1,upgrading:0};m.structures.push(core,wall,tower);
  assert.ok(distance(u,core)>B.interactRange);c.elf(m,u);assert.equal(c.destination?.entityId,core.id);
});
test('Perfil defensor prioriza Barricada 2 antes da expansão econômica',()=>{
  const m=match(),u=m.unit('e0'),t=m.unit('t'),c=new AIController('normal'),base=m.map.bases[0];m.state=STATES.ACTIVE;m.time=80;Object.assign(t,{x:0,z:0});Object.assign(u,{x:base.gate.x,z:base.gate.z,gold:10000,wood:10000,baseId:base.id});
  c.elfProfile='defense';c.buildPlan={towerDepths:[2,3,4],towerSides:[-2,2],utilityOffset:0,utilityDirection:1};
  const core={id:'opening-core',kind:'core',owner:u.id,baseId:base.id,x:base.x,z:base.z,hp:360,maxHp:360,tier:1,progress:1,upgrading:0},wall={id:'opening-wall',kind:'wall',owner:u.id,baseId:base.id,x:base.gate.x,z:base.gate.z,hp:1155,maxHp:1155,tier:1,progress:1,upgrading:0},tower={id:'opening-tower',kind:'tower',owner:u.id,baseId:base.id,x:base.x+3,z:base.z,hp:360,maxHp:360,tier:1,progress:1,upgrading:0};m.structures.push(core,wall,tower);
  c.elf(m,u);assert.ok(wall.upgrading>0);assert.equal(core.upgrading,0);assert.equal(m.structures.some(s=>s.kind==='mine'),false);
});
test('IA Elfa melhora Barricada viável sob pressão em vez de reparar para sempre',()=>{
  const m=match(),u=m.unit('e0'),t=m.unit('t'),c=new AIController('normal'),base=m.map.bases[0];m.state=STATES.ACTIVE;m.time=80;Object.assign(u,{x:base.gate.x,z:base.gate.z,gold:10000,wood:10000,baseId:base.id});Object.assign(t,{x:base.gate.x+5,z:base.gate.z});
  const core={id:'siege-core',kind:'core',owner:u.id,baseId:base.id,x:base.x,z:base.z,hp:360,maxHp:360,tier:1,progress:1,upgrading:0},wall={id:'siege-wall',kind:'wall',owner:u.id,baseId:base.id,x:base.gate.x,z:base.gate.z,hp:924,maxHp:1155,tier:1,progress:1,upgrading:0},tower={id:'siege-tower',kind:'tower',owner:u.id,baseId:base.id,x:base.x+3,z:base.z,hp:360,maxHp:360,tier:1,progress:1,upgrading:0};m.structures.push(core,wall,tower);
  const hp=wall.hp;c.elf(m,u);assert.ok(wall.upgrading>0);assert.ok(wall.hp>hp);
});
test('IA Elfa não repõe Torre durante cerco ativo',()=>{
  const m=match(),u=m.unit('e0'),t=m.unit('t'),c=new AIController('normal'),base=m.map.bases[0];m.state=STATES.ACTIVE;m.time=180;Object.assign(u,{x:base.x,z:base.z,gold:100000,wood:100000,baseId:base.id});Object.assign(t,{x:base.x+5,z:base.z});
  const core={id:'sieged-core',kind:'core',owner:u.id,baseId:base.id,x:base.x,z:base.z,hp:980,maxHp:980,tier:3,progress:1,upgrading:0},wall={id:'sieged-wall',kind:'wall',owner:u.id,baseId:base.id,x:base.gate.x,z:base.gate.z,hp:4170,maxHp:4170,tier:3,progress:1,upgrading:0};m.structures.push(core,wall);
  c.elf(m,u);assert.equal(m.structures.some(s=>s.kind==='tower'),false);assert.notEqual(u.action,'build');
});
test('Bot próximo mantém Barricada e melhora Torre durante cerco sem entrar em loop de reparo',()=>{
  const m=match(),u=m.unit('e0'),t=m.unit('t'),c=new AIController('normal'),base=m.map.bases[0];m.state=STATES.ACTIVE;m.time=180;Object.assign(u,{x:base.gate.x,z:base.gate.z,baseId:base.id,gold:10000,wood:10000});Object.assign(t,{x:base.outside.x,z:base.outside.z});
  c.elfProfile='defense';c.buildPlan={towerDepths:[2,3,4],towerSides:[-2,2],utilityOffset:0,utilityDirection:1};
  const core={id:'defense-core',kind:'core',owner:u.id,baseId:base.id,x:base.x,z:base.z,hp:980,maxHp:980,tier:2,progress:1,upgrading:0},wall={id:'defense-wall',kind:'wall',owner:u.id,baseId:base.id,x:base.gate.x,z:base.gate.z,hp:1900,maxHp:2035,tier:2,progress:1,upgrading:0,lastHit:m.time-1},tower={id:'defense-tower',kind:'tower',owner:u.id,baseId:base.id,x:base.gate.x+8,z:base.gate.z,hp:360,maxHp:360,tier:1,progress:1,upgrading:0,branch:'power'};m.structures.push(core,wall,tower);Object.assign(u,{x:tower.x,z:tower.z});
  const hp=wall.hp;c.elf(m,u);assert.ok(wall.hp>hp);assert.ok(tower.upgrading>0);
});
test('Memória estratégica V2 persiste com confiança decrescente sem conhecer alvos ocultos',()=>{
  const m=match(),t=m.unit('t'),memory=new StrategicMap(),visible={id:'seen-tower',kind:'tower',x:t.x+4,z:t.z,hp:360,maxHp:360,tier:2,branch:'power',progress:1,baseId:'known'};
  const hidden={id:'hidden-mine',kind:'mine',x:t.x+40,z:t.z+40,hp:200,maxHp:200,tier:7,coreTier:7,progress:1,baseId:'hidden'};m.structures.push(visible,hidden);m.state=STATES.ACTIVE;m.time=60;
  memory.update(m,t,[visible]);let report=memory.report(m,t),known=report.find(s=>s.knownStructures>0);assert.equal(known.knownStructures,1);assert.ok(known.estimatedTowerDps>0);assert.equal(memory.observations.has(hidden.id),false);
  const initial=known.confidence;m.time=240;t.x+=40;t.z+=40;memory.update(m,t,[]);report=memory.report(m,t);known=report.find(s=>s.knownStructures>0);assert.ok(known.confidence<initial);assert.equal(known.knownStructures,1);
});
test('State Machine V2 usa fases explícitas e PROBE sem atacar a estrutura',()=>{
  assert.deepEqual(TROLL_STATES,['explore','hunt','probe','siege','breach','chase','reposition','disengage','recover','rotate']);
  const m=match(),t=m.unit('t'),c=new AIController('normal'),wall={id:'probe-wall',kind:'wall',owner:'e0',baseId:'probe-base',x:t.x+3,z:t.z,hp:1100,maxHp:1100,tier:1,progress:1,bounty:500};m.state=STATES.ACTIVE;m.time=m.preparation+60;m.structures.push(wall);for(const elf of m.units.filter(u=>u.role==='elf'))Object.assign(elf,{x:0,z:0});
  const hp=wall.hp;c.troll(m,t);assert.equal(c.brain.phase(m),'hunt');assert.equal(c.brain.state,'probe');assert.equal(wall.hp,hp);
  m.time+=3.1;c.troll(m,t);assert.equal(c.brain.state,'siege');assert.equal(c.brain.targetEvaluation.phase,'hunt');
  m.time=m.preparation+430;assert.equal(c.brain.phase(m),'siege');m.time=m.preparation+721;assert.equal(c.brain.phase(m),'endgame');
});
test('SIEGE só começa quando o Troll alcança posição real de ataque',()=>{
  const m=match(),t=m.unit('t'),c=new AIController('normal'),wall={id:'approach-wall',kind:'wall',owner:'e0',baseId:'approach-base',x:t.x+9,z:t.z,hp:1100,maxHp:1100,tier:1,progress:1,bounty:500};m.state=STATES.ACTIVE;m.time=100;m.structures.push(wall);for(const elf of m.units.filter(u=>u.role==='elf'))Object.assign(elf,{x:0,z:0});
  c.troll(m,t);m.time+=3.1;c.troll(m,t);assert.equal(c.brain.state,'probe');assert.equal(c.brain.siege,null);
  Object.assign(t,{x:wall.x-3,z:wall.z});c.troll(m,t);assert.equal(c.brain.state,'siege');assert.ok(c.brain.siege);
});
test('PROBE abandona ameaça medida sem usar conhecimento oculto',()=>{
  const m=match(),t=m.unit('t'),c=new AIController('normal'),tower={id:'probe-danger',kind:'tower',owner:'e0',baseId:'danger-base',x:t.x+6,z:t.z,hp:360,maxHp:360,tier:5,branch:'power',progress:1,bounty:500};m.state=STATES.ACTIVE;m.time=100;m.structures.push(tower);for(const elf of m.units.filter(u=>u.role==='elf'))Object.assign(elf,{x:0,z:0});c.troll(m,t);assert.equal(c.brain.state,'probe');
  t.stats.damageReceived=t.maxHp*.2;m.time+=3.1;c.troll(m,t);assert.equal(c.brain.state,'rotate');assert.equal(c.brain.targetId,null);assert.ok(c.brain.strategicMap.report(m,t).some(s=>s.failedSieges===1));
});
test('Siege Budget respeita commitment mínimo e abandona troca improdutiva',()=>{
  const m=match(),t=m.unit('t'),c=new AIController('normal'),wall={id:'budget-wall',kind:'wall',owner:'e0',baseId:'budget-base',x:t.x+2,z:t.z,hp:1100,maxHp:1100,tier:1,progress:1,bounty:500};m.state=STATES.ACTIVE;m.time=100;m.structures.push(wall);for(const elf of m.units.filter(u=>u.role==='elf'))Object.assign(elf,{x:0,z:0});c.brain??=null;c.troll(m,t);c.brain.probedBases.set(wall.baseId,m.time);c.troll(m,t);assert.equal(c.brain.state,'siege');assert.ok(c.brain.siege);
  t.hp=t.maxHp*.76;m.time+=1;c.troll(m,t);assert.equal(c.retreating,false);assert.equal(c.brain.siegeDecision.withinCommitment,true);
  m.time+=4;c.troll(m,t);assert.equal(c.retreating,false);assert.equal(c.brain.state,'rotate');assert.equal(c.brain.targetId,null);
  assert.equal(c.brain.lastFailedSiege.targetId,wall.id);assert.equal(c.brain.lastFailedSiege.targetHpStart,1100);assert.equal(c.brain.lastFailedSiege.targetHpEnd,1100);assert.ok(c.brain.lastFailedSiege.trollHpLoss>0);assert.deepEqual(c.brain.lastFailedSiege.levels,t.levels);
});
test('Siege Budget mantém ataque produtivo acima da duração nominal',()=>{
  const m=match(),t=m.unit('t'),c=new AIController('normal'),wall={id:'productive-wall',kind:'wall',owner:'e0',baseId:'productive-base',x:t.x+2,z:t.z,hp:1100,maxHp:1100,tier:1,progress:1,bounty:500};m.state=STATES.ACTIVE;m.time=100;m.structures.push(wall);for(const elf of m.units.filter(u=>u.role==='elf'))Object.assign(elf,{x:0,z:0});c.troll(m,t);c.brain.probedBases.set(wall.baseId,m.time);c.troll(m,t);wall.hp=220;t.hp=t.maxHp*.9;m.time+=19;c.troll(m,t);
  assert.equal(c.brain.siegeDecision.budgetExceeded,true);assert.ok(c.brain.siegeDecision.tradeScore>.45);assert.equal(c.brain.siegeDecision.shouldExit,false);assert.equal(c.retreating,false);
});
test('Siege Budget impede loop de reposicionamento antes de exceder orçamento',()=>{
  const m=match(),t=m.unit('t'),c=new AIController('normal'),tower={id:'budget-tower',kind:'tower',owner:'e0',baseId:'budget-base',x:t.x+2,z:t.z,hp:900,maxHp:900,tier:1,branch:'power',progress:1,bounty:500};m.state=STATES.ACTIVE;m.time=100;m.structures.push(tower);for(const elf of m.units.filter(u=>u.role==='elf'))Object.assign(elf,{x:0,z:0});c.troll(m,t);c.brain.probedBases.set(tower.baseId,m.time);c.troll(m,t);assert.equal(c.brain.state,'siege');
  t.hp=t.maxHp*.9;t.stats.damageReceived=100;m.time+=5;c.troll(m,t);assert.equal(c.brain.siegeDecision.budgetExceeded,false);assert.equal(c.brain.state,'siege');assert.equal(c.brain.reposition,null);
});
test('Reposicionamento tático retoma a mesma Barricada sem registrar fracasso estratégico',()=>{
  const m=match(),t=m.unit('t'),c=new AIController('normal'),wall={id:'campaign-wall',kind:'wall',owner:'e0',baseId:'campaign-base',x:t.x+5,z:t.z,hp:5000,maxHp:5000,tier:6,progress:1,bounty:500};m.state=STATES.ACTIVE;m.time=500;m.structures.push(wall);for(const elf of m.units.filter(u=>u.role==='elf'))Object.assign(elf,{x:0,z:0});
  c.brain=new TrollBrain();c.brain.beginSiege(m,t,wall,{});c.brain.finishSiegeMemory(m,t,false,{strategicFailure:false});
  assert.equal(c.brain.campaignTargetId,wall.id);assert.equal(c.brain.failedSieges,0);assert.equal(c.brain.targetFailures.size,0);
  c.brain.reposition={point:{x:t.x-5,z:t.z},origin:{x:t.x,z:t.z},until:m.time-1,resumeTarget:wall.id};c.brain.state='reposition';c.brain.targetId=null;c.troll(m,t);
  assert.equal(c.brain.targetId,wall.id);assert.equal(c.brain.state,'hunt');assert.equal(c.brain.campaignResumes,1);assert.ok(!c.destination||c.destination.entityId===wall.id);
});
test('Abandono estratégico encerra a campanha e registra a fortificação',()=>{
  const m=match(),t=m.unit('t'),brain=new TrollBrain(),wall={id:'abandoned-wall',kind:'wall',owner:'e0',baseId:'abandoned-base',x:t.x+3,z:t.z,hp:5000,maxHp:5000,tier:6,progress:1};m.state=STATES.ACTIVE;m.time=500;m.structures.push(wall);
  brain.beginSiege(m,t,wall,{});brain.finishSiegeMemory(m,t,false,{strategicFailure:true});
  assert.equal(brain.campaignTargetId,null);assert.equal(brain.failedSieges,1);assert.equal(brain.targetFailure(wall.id).failures,1);assert.equal(brain.lastFailedSiege.targetId,wall.id);
});
test('Navegação do Troll não trata a própria estrutura-alvo como obstáculo',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('hard'),tower={id:'tower-target',kind:'tower',x:u.x+6,z:u.z,hp:400,maxHp:400,tier:1,branch:'power',progress:1};
  m.state=STATES.ACTIVE;m.structures.push(tower);c.discovered.set(tower.id,{...tower,seenAt:m.time});
  const blocked=c.navigationBlocks(m,u,tower.id),cell=toCell(m,tower);
  assert.equal(blocked.has(index(m,cell.x,cell.z)),false);
  assert.equal(c.go(m,u,tower,3),false);c.follow(m,u);assert.ok(Math.hypot(u.input.x,u.input.z)>0);
});
test('Alvo interno sem rota transforma a Barricada conhecida em pré-requisito',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal'),baseId='blocked-base',wall={id:'blocking-wall',kind:'wall',owner:'e0',baseId,x:u.x+5,z:u.z,hp:5000,maxHp:5000,tier:4,progress:1},mine={id:'blocked-mine',kind:'mine',owner:'e0',baseId,x:u.x+7,z:u.z,hp:500,maxHp:500,tier:4,progress:1};
  m.state=STATES.ACTIVE;m.time=100;for(const elf of m.units.filter(a=>a.role==='elf'))Object.assign(elf,{x:0,z:0});m.structures.push(wall,mine);c.brain=new TrollBrain();for(const entity of [wall,mine])c.discovered.set(entity.id,{...entity,seenAt:m.time});c.navigationFailure=mine.id;
  c.troll(m,u);assert.equal(c.brain.blockedBases.get(baseId).wallId,wall.id);assert.ok(c.brain.navigationBlockedTargets.has(mine.id));assert.equal(c.brain.targetId,wall.id);
  m.structures.push({id:'unrelated',kind:'tower',owner:'e1',baseId:'other-base',x:u.x+30,z:u.z,hp:0,maxHp:300,tier:1,progress:1});c.discovered.delete(mine.id);m.time+=600;c.troll(m,u);
  assert.equal(c.brain.blockedBases.get(baseId).wallId,wall.id,'destruição global ou memória expirada não libera o interior');
  assert.equal(c.brain.navigationBlockedTargets.has(mine.id),false,'o bloqueio do alvo pode expirar sem liberar a dependência da base');
  wall.hp=0;m.time+=1;c.troll(m,u);assert.equal(c.brain.blockedBases.has(baseId),false,'somente a queda da Barricada libera o interior conhecido');
});
test('Modo final não espera na base diante de uma fortificação suprimida',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal'),wall={id:'fortified-final-wall',kind:'wall',owner:'e0',baseId:'final-base',x:u.x+5,z:u.z,hp:5000,maxHp:5000,tier:8,progress:1},core={id:'final-core',kind:'core',owner:'e0',baseId:'final-base',x:u.x+8,z:u.z,hp:2000,maxHp:2000,tier:8,progress:1};
  m.state=STATES.ACTIVE;m.time=900;m.structures.push(wall,core);for(const elf of m.units.filter(a=>a.role==='elf'))elf.alive=false;m.elfBasesClaimed.add(wall.baseId);
  c.brain=new TrollBrain();c.brain.discoveredBases.add(wall.baseId);for(const entity of [wall,core])c.discovered.set(entity.id,{...entity,seenAt:m.time});c.brain.strategicMap.update(m,u,[wall,core]);
  c.brain.targetFailures.set(wall.id,{failures:3,lastPower:c.brain.powerValue(u),suppressedUntil:m.time+600,tradeScores:[0,0],fortified:true,siegeLevel:u.levels.siege,equipmentCount:u.inventory.length,targetHpRatio:1,knownTowers:0,legendary:false});
  u.cooldowns.heavy=m.time+5;c.troll(m,u);assert.equal(c.brain.mode,'finisher');assert.equal(c.brain.targetId,wall.id);assert.equal(c.brain.state,'probe');assert.notEqual(c.brain.state,'recover','o Troll não deve esperar na base pelo ataque pesado');
  u.levels.siege+=1;assert.equal(c.brain.targetSuppressed(m,u,wall),false,'ganho de poder permite reavaliar o alvo');
});
test('Modo final inicia ruptura decisiva sem repetir PROBE quando não existe alternativa',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal'),wall={id:'retry-final-wall',kind:'wall',owner:'e0',baseId:'retry-base',x:u.x+3,z:u.z,hp:5000,maxHp:5000,tier:8,progress:1},core={id:'retry-core',kind:'core',owner:'e0',baseId:'retry-base',x:u.x+7,z:u.z,hp:2000,maxHp:2000,tier:8,progress:1};
  m.state=STATES.ACTIVE;m.time=900;m.structures.push(wall,core);for(const elf of m.units.filter(a=>a.role==='elf'))elf.alive=false;m.elfBasesClaimed.add(wall.baseId);
  c.brain=new TrollBrain();c.brain.discoveredBases.add(wall.baseId);c.brain.observedIds.add(wall.id);c.brain.lastProgressValue=20;c.brain.lastProgressAt=700;for(const entity of [wall,core])c.discovered.set(entity.id,{...entity,seenAt:m.time});c.brain.strategicMap.update(m,u,[wall,core]);
  c.brain.targetFailures.set(wall.id,{failures:3,lastPower:c.brain.powerValue(u),suppressedUntil:1500,retryAfter:850,tradeScores:[0,0],fortified:true,siegeLevel:u.levels.siege,equipmentCount:u.inventory.length,targetHpRatio:1,knownTowers:0,legendary:false});
  c.troll(m,u);assert.equal(c.brain.mode,'finisher');assert.equal(c.brain.targetId,wall.id);assert.equal(c.brain.state,'breach');assert.equal(c.brain.siege.decisive,true);assert.equal(c.brain.decisiveAssaults,1);
});
test('Assalto final escolhe a barricada com menor TTK e exposição prevista',()=>{
  const m=match(),u=m.unit('t'),brain=new TrollBrain(),easy={id:'easy-wall',kind:'wall',baseId:'easy',x:u.x+5,z:u.z,hp:5000,maxHp:5000,tier:7,progress:1},hard={id:'hard-wall',kind:'wall',baseId:'hard',x:u.x-5,z:u.z,hp:9000,maxHp:9000,tier:9,progress:1},towers=Array.from({length:5},(_,i)=>({id:'hard-tower-'+i,kind:'tower',baseId:'hard',x:hard.x+(i-2),z:hard.z+3,hp:1000,maxHp:1000,tier:10,branch:'power',progress:1}));
  m.state=STATES.ACTIVE;m.time=1000;m.structures.push(easy,hard,...towers);const known=[easy,hard,...towers];assert.ok(brain.assaultScore(m,u,easy,known).score<brain.assaultScore(m,u,hard,known).score);
});
test('Percepção de estruturas não depende do yaw do Troll',()=>{
  const m=match(),u=m.unit('t'),tower={id:'tower-visible',kind:'tower',x:u.x+5,z:u.z,hp:400,maxHp:400,tier:1,branch:'power',progress:1};
  m.structures.push(tower);m.state=STATES.ACTIVE;u.yaw=0;assert.equal(m.canSee(u,tower),true);u.yaw=Math.PI;assert.equal(m.canSee(u,tower),true);
});
test('IA recua de cerco perigoso e recupera vida sem ganhar atributos',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal');m.state=STATES.ACTIVE;m.time=60;u.hp=200;u.lastHit=60;
  m.structures.push({id:'tower',kind:'tower',x:u.x+5,z:u.z,hp:400,maxHp:400,tier:3,branch:'power',progress:1});
  const speed=B.troll.speed,maxHp=u.maxHp;c.troll(m,u);assert.equal(c.retreating,true);assert.equal(c.brain.state,'disengage');assert.ok(c.destination);assert.ok(distance(c.destination,u)>5);assert.equal(u.maxHp,maxHp);assert.equal(B.troll.speed,speed);
  Object.assign(u,c.destination);m.time=65;u.lastHit=60;m.structures=[];c.discovered.clear();c.troll(m,u);assert.equal(c.brain.state,'recover');assert.ok(u.recallUntil>m.time);assert.equal(c.destination,null);
  m.time=u.recallUntil;m.finishTrollRecall(u);assert.ok(distance(u,m.map.trollSpawn)<.01);u.hp=u.maxHp*.6;m.time+=3.1;c.troll(m,u);assert.equal(c.retreating,false);assert.notEqual(c.brain.state,'recover','recuperação segura nunca pode prender o Troll na base');
});
test('IA antecipa dano da rota de fuga e usa o Santuário quando muito ferida',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal');m.state=STATES.ACTIVE;m.time=100;u.hp=u.maxHp*.35;u.lastHit=m.time;
  for(let i=0;i<3;i++)m.structures.push({id:'predictive-'+i,kind:'tower',x:u.x-5+i*5,z:u.z+4,hp:600,maxHp:600,tier:4,branch:'power',progress:1,disabledUntil:0});
  c.troll(m,u);assert.ok(c.brain.projectedEscapeHp<.35,JSON.stringify({projection:c.brain.projectedEscapeHp,risk:c.brain.riskScore}));assert.equal(c.retreating,true);assert.ok(c.destination);
  m.structures=[];c.discovered.clear();u.hp=u.maxHp*.25;u.lastHit=-100;Object.assign(u,{x:m.map.trollSpawn.x+30,z:m.map.trollSpawn.z});c.troll(m,u);
  assert.equal(c.brain.state,'recover');assert.ok(u.recallUntil>m.time);assert.equal(c.destination,null);
});
test('IA encontra rota de fuga fora da barricada enquanto o Elfo repara sob fogo de torre',()=>{
  const m=new Match({seed:'THORNHOLD'},[{id:'t',role:'troll',occupant:{type:'human',name:'Troll'}},{id:'e0',role:'elf',occupant:{type:'human',name:'Elf'}}]),t=m.unit('t'),elf=m.unit('e0'),c=new AIController('normal'),base=m.map.bases[4];m.state=STATES.ACTIVE;m.time=157;
  t.controller='bot';m.controllers.set(t.id,c);
  const d=Math.max(.001,distance(base,base.gate)),ix=(base.x-base.gate.x)/d,iz=(base.z-base.gate.z)/d;
  Object.assign(t,{x:190.1,z:83.4,hp:500,maxHp:2520,lastHit:m.time});Object.assign(elf,{x:194.6,z:86.1,gold:10000,wood:10000,baseId:base.id});
  const wall={id:'repair-loop-wall',kind:'wall',owner:elf.id,baseId:base.id,x:base.gate.x,z:base.gate.z,hp:1312,maxHp:2035,tier:2,progress:1,healthProgress:1,lastHit:-100,lastShot:-100,bounty:500};
  const tower={id:'repair-loop-tower',kind:'tower',owner:elf.id,baseId:base.id,x:base.gate.x+ix*10,z:base.gate.z+iz*10,hp:540,maxHp:540,tier:2,branch:'power',progress:1,healthProgress:1,lastHit:-100,lastShot:-100,bounty:100};
  m.structures.push(wall,tower);let retreated=false,minHp=t.hp,maxDistance=distance(t,base.gate);const states=new Set();
  for(let i=0;i<500&&t.alive;i++){if(i%22===0)m.act(elf.id,{type:'repair',target:wall.id});m.step(.05);minHp=Math.min(minHp,t.hp);maxDistance=Math.max(maxDistance,distance(t,base.gate));states.add(c.brain?.state);if(c.retreating&&distance(t,base.gate)>7){retreated=true;break;}}
  const diagnostic=JSON.stringify({hp:t.hp,wall:wall.hp,state:c.brain?.state,retreating:c.retreating,maxDistance,states:[...states],risk:c.brain?.riskScore,metrics:c.metrics});
  assert.equal(t.alive,true,diagnostic);assert.equal(retreated,true,diagnostic);assert.ok(minHp>0);
});
test('Espada lendária mantém agressividade, mas respeita piso de 60% após recuo',()=>{
  assert.ok(B.difficulty.easy.retreat>B.difficulty.normal.retreat&&B.difficulty.normal.retreat>B.difficulty.hard.retreat);
  const m=match(),u=m.unit('t'),c=new AIController('hard');m.state=STATES.ACTIVE;m.time=B.finalAge+50;u.hp=u.maxHp*.18;u.levels.damage=5;u.levels.siege=5;u.levels.health=6;u.lastHit=m.time;
  m.structures.push({id:'legend-danger',kind:'tower',x:u.x+5,z:u.z,hp:400,maxHp:400,tier:5,branch:'power',progress:1,disabledUntil:0});
  c.troll(m,u);assert.equal(c.retreating,true);assert.equal(c.brain.state,'disengage');
  m.structures=[];c.discovered.clear();u.lastHit=-100;Object.assign(u,c.brain.safePoint||u);u.hp=u.maxHp*.59;c.troll(m,u);assert.equal(c.retreating,true);
  u.hp=u.maxHp*.6;m.time+=3.1;c.troll(m,u);assert.equal(c.retreating,false);assert.ok(!['retreat','recover'].includes(c.brain.state));
});
test('Janela de recuperação começa somente quando o Troll sai do fogo das torres',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal');m.state=STATES.ACTIVE;m.time=120;u.hp=u.maxHp*.2;u.lastHit=m.time;
  m.structures.push({id:'recovery-danger',kind:'tower',x:u.x+5,z:u.z,hp:400,maxHp:400,tier:3,branch:'power',progress:1,disabledUntil:0});
  c.troll(m,u);assert.equal(c.retreating,true);assert.equal(c.brain.recoveryUntil,0);
  m.time+=12;u.lastHit=-100;m.structures=[];c.discovered.clear();Object.assign(u,c.brain.safePoint||u);c.troll(m,u);
  assert.equal(c.brain.recoveryUntil,0);assert.ok(u.recallUntil>m.time);assert.equal(c.destination,null);
  m.time=u.recallUntil;m.finishTrollRecall(u);c.troll(m,u);assert.ok(c.brain.recoveryUntil>=m.time+7.9);assert.ok(c.brain.recoveryUntil<=m.time+8.1);assert.equal(c.retreating,true);
});
test('Duas torres conhecidas exigem 70% e o tempo sozinho nunca encerra a recuperação',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal');m.state=STATES.ACTIVE;m.time=180;u.hp=u.maxHp*.2;u.lastHit=m.time;
  for(let i=0;i<2;i++)m.structures.push({id:'recovery-tower-'+i,kind:'tower',baseId:'fortified-base',x:u.x+5,z:u.z+i*2,hp:400,maxHp:400,tier:3,branch:'power',progress:1,disabledUntil:0});
  c.troll(m,u);assert.equal(c.retreating,true);assert.equal(c.brain.recoveryPlan.targetHpPercent,.7);assert.equal(c.brain.recoveryPlan.knownTowers,2);
  m.structures=[];c.discovered.clear();Object.assign(u,m.map.trollSpawn);u.lastHit=-100;u.hp=u.maxHp*.69;m.time+=1;c.troll(m,u);assert.equal(c.retreating,true);
  m.time+=20;c.troll(m,u);assert.equal(c.retreating,true,'o antigo timeout de 8s não pode liberar o Troll abaixo de 70%');
  u.hp=u.maxHp*.7;m.time+=.2;c.troll(m,u);assert.equal(c.retreating,false);
  const retreat=m.telemetry.retreats.at(-1);assert.equal(retreat.reentryReason,'two_tower_recovery_threshold');assert.equal(retreat.recoveryTargetHpPercent,.7);assert.equal(retreat.exception,false);assert.equal(retreat.atSanctuary,true);
});
test('Execução em alcance é exceção explícita ao piso de recuperação',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal');m.state=STATES.ACTIVE;m.time=B.finalAge+20;u.levels.damage=6;u.levels.siege=6;u.levels.health=12;u.hp=u.maxHp*.3;u.lastHit=-100;
  const wall={id:'execution-window',kind:'wall',baseId:'execution-base',x:u.x+2,z:u.z,hp:100,maxHp:1000,tier:4,progress:1};m.structures.push(wall);
  c.brain=new TrollBrain();c.retreating=true;c.brain.recoveryPlan={startedAt:m.time,targetHpPercent:.7,knownTowers:2,baseId:wall.baseId,targetId:wall.id,initialException:null};c.brain.safeSince=m.time-4;m.telemetry.retreatStart(m,u,c.brain.recoveryPlan);
  c.troll(m,u);assert.equal(c.retreating,false);assert.equal(c.brain.targetId,wall.id);
  const retreat=m.telemetry.retreats.at(-1);assert.equal(retreat.reentryReason,'execution_opportunity');assert.equal(retreat.exception,true);assert.ok(retreat.reengageHpPercent<.7);
});
test('Ausência de rota de fuga é registrada como exceção de reentrada',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal');m.state=STATES.ACTIVE;m.time=220;u.hp=u.maxHp*.25;u.lastHit=-100;
  c.brain=new TrollBrain();c.retreating=true;c.brain.recoveryPlan={startedAt:m.time,targetHpPercent:.6,knownTowers:1,baseId:null,targetId:null,initialException:'no_escape_route'};m.telemetry.retreatStart(m,u,c.brain.recoveryPlan);
  c.troll(m,u);assert.equal(c.retreating,false);const retreat=m.telemetry.retreats.at(-1);assert.equal(retreat.reentryReason,'no_escape_route');assert.equal(retreat.exception,true);
});
test('Terceiro reposicionamento no mesmo alvo vira recuo completo',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal'),brain=new TrollBrain();m.state=STATES.ACTIVE;m.time=300;u.hp=u.maxHp*.55;u.lastHit=m.time;c.brain=brain;
  const wall={id:'loop-wall',kind:'wall',baseId:'loop-base',x:u.x+3,z:u.z,hp:5000,maxHp:5000,tier:5,progress:1},tower={id:'loop-tower',kind:'tower',baseId:'loop-base',x:u.x+6,z:u.z+2,hp:1000,maxHp:1000,tier:5,branch:'power',progress:1};m.structures.push(wall,tower);
  brain.beginSiege(m,u,wall,{});brain.targetId=wall.id;brain.repositionStreak={targetId:wall.id,count:2,lastAt:m.time-4};c.troll(m,u);
  assert.equal(c.retreating,true);assert.equal(brain.recoveryPlan.trigger,'reposition_loop');assert.equal(brain.recoveryPlan.forceSanctuary,true);assert.equal(brain.repositionStreak,null);assert.equal(brain.campaignTargetId,null);assert.equal(brain.targetFailure(wall.id).failures,1);
});
test('Rotação reutiliza memória estratégica para procurar outra base conhecida',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal'),brain=new TrollBrain();m.state=STATES.ACTIVE;m.time=500;c.brain=brain;
  const failed={id:'failed-wall',kind:'wall',baseId:'failed-base',x:u.x+80,z:u.z,hp:5000,maxHp:5000,tier:6,progress:1},alternate={id:'alternate-wall',kind:'wall',baseId:'alternate-base',x:u.x,z:u.z+70,hp:2200,maxHp:2200,tier:3,progress:1};
  for(const elf of m.units.filter(unit=>unit.role==='elf'))Object.assign(elf,{x:0,z:0});brain.strategicMap.update(m,u,[failed,alternate]);brain.recordTargetOutcome(m,u,failed.id,false,.1);brain.recordTargetOutcome(m,u,failed.id,false,.1);brain.recordTargetOutcome(m,u,failed.id,false,.1);c.discovered.clear();
  c.troll(m,u);assert.equal(brain.state,'hunt');assert.equal(brain.targetId,alternate.id);assert.equal(c.destination?.entityId,alternate.id);
});
test('Recuo sem progresso por seis segundos abandona pontos locais e vai ao Santuário',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal'),brain=new TrollBrain();m.state=STATES.ACTIVE;m.time=400;u.x+=30;u.hp=u.maxHp*.35;u.lastHit=m.time;c.brain=brain;c.retreating=true;
  const tower={id:'stalled-retreat-tower',kind:'tower',baseId:'stalled-base',x:u.x+5,z:u.z,hp:1000,maxHp:1000,tier:5,branch:'power',progress:1};m.structures.push(tower);c.discovered.set(tower.id,{...tower,seenAt:m.time});
  brain.recoveryPlan={startedAt:m.time-10,targetHpPercent:.6,knownTowers:1,baseId:tower.baseId,targetId:null,initialException:null,trigger:'risk',threatOrigin:{x:u.x,z:u.z},bestThreatDistance:0,lastProgressAt:m.time-7,forceSanctuary:false};brain.safePoint={x:u.x+2,z:u.z};m.telemetry.retreatStart(m,u,brain.recoveryPlan);
  c.troll(m,u);assert.equal(brain.recoveryPlan.forceSanctuary,true);assert.equal(brain.state,'disengage');assert.ok(c.destination);assert.ok(distance(brain.safePoint,m.map.trollSpawn)<.01);
});
test('Recuos repetidos nunca desativam autopreservação do Troll',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal');m.state=STATES.ACTIVE;m.time=B.finalAge+50;u.lastHit=m.time;c.metrics.retreatAttempts=5;
  const tower={id:'late-danger',kind:'tower',x:u.x+5,z:u.z,hp:400,maxHp:400,tier:3,branch:'power',progress:1,disabledUntil:0};m.structures.push(tower);
  u.hp=u.maxHp*.2;c.troll(m,u);assert.equal(c.retreating,true);assert.equal(c.brain.state,'disengage');
});
test('Dez recuos não ativam Last Stand suicida',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal');m.state=STATES.ACTIVE;m.time=B.finalAge+50;u.lastHit=m.time;u.hp=u.maxHp*.05;c.metrics.retreatAttempts=10;
  m.structures.push({id:'last-stand-danger',kind:'tower',x:u.x+5,z:u.z,hp:400,maxHp:400,tier:5,branch:'power',progress:1,disabledUntil:0});c.troll(m,u);
  assert.equal(c.retreating,true);assert.equal(c.brain.state,'disengage');
});
test('Troll não força rush de espada e mantém progressão distribuída',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('hard');m.state=STATES.ACTIVE;m.time=B.finalAge+1;u.levels.damage=4;u.levels.siege=3;u.gold=100;
  c.troll(m,u);assert.ok(u.gold<100);assert.equal(u.levels.damage+u.levels.siege,7);assert.equal(Object.values(u.levels).reduce((a,b)=>a+b,0),8);
});
test('IA persegue Elfo exposto antes de desperdiçar tempo em estrutura resistente',()=>{
  const m=match(),u=m.unit('t'),elf=m.unit('e0'),c=new AIController('hard');m.state=STATES.ACTIVE;m.time=60;elf.x=u.x+6;elf.z=u.z;m.unit('e1').x=0;m.unit('e1').z=0;
  m.structures.push({id:'core',kind:'core',x:u.x-6,z:u.z,hp:3000,maxHp:3000,tier:4,progress:1});c.troll(m,u);assert.equal(c.brain.targetId,elf.id);assert.equal(c.brain.state,'chase');
});
test('Troll mantém a ordem Barricada, Elfo e somente depois estruturas internas',()=>{
  const m=match(),t=m.unit('t'),elf=m.unit('e0'),other=m.unit('e1'),c=new AIController('hard');m.state=STATES.ACTIVE;m.time=100;Object.assign(other,{x:0,z:0});
  Object.assign(elf,{x:t.x+5,z:t.z,baseId:'breached-base'});
  const wall={id:'priority-wall',kind:'wall',owner:elf.id,baseId:'breached-base',x:t.x+3,z:t.z,hp:1100,maxHp:1100,tier:1,progress:1},tower={id:'priority-tower',kind:'tower',owner:elf.id,baseId:'breached-base',x:t.x+4,z:t.z+2,hp:360,maxHp:360,tier:5,branch:'power',progress:1};m.structures.push(wall,tower);
  c.troll(m,t);assert.equal(c.brain.targetId,wall.id);
  wall.hp=0;m.time+=5;c.troll(m,t);assert.equal(c.brain.targetId,elf.id);assert.equal(c.brain.state,'chase');
});
test('Bot Elfo evacua a clareira e não volta imediatamente quando o Troll rompe a entrada',()=>{
  const m=match(),u=m.unit('e0'),t=m.unit('t'),c=new AIController('normal'),base=m.map.bases[0];m.state=STATES.ACTIVE;m.time=100;Object.assign(u,{x:base.x,z:base.z,baseId:base.id,gold:1000,wood:1000});Object.assign(t,{x:base.x+2,z:base.z});m.unit('e1').alive=false;
  m.structures.push({id:'evac-core',kind:'core',owner:u.id,baseId:base.id,x:base.x,z:base.z,hp:980,maxHp:980,tier:3,progress:1,upgrading:0});m.brokenBases.add(base.id);m.breachUntil.set(base.id,m.time+45);
  c.elf(m,u);assert.ok(c.destination);assert.notEqual(baseAt(m.map,c.destination)?.id,base.id);assert.ok(c.metrics.evacuations>=1);
  const destination={...c.destination};Object.assign(u,destination);Object.assign(t,{x:0,z:0});m.time+=3;c.elf(m,u);assert.deepEqual(c.elfEvade.destination,{x:destination.x,z:destination.z});
  m.time+=15;c.elf(m,u);assert.ok(c.elfEvade,'não retorna enquanto a ruptura continua ativa');assert.deepEqual(c.elfEvade.destination,{x:destination.x,z:destination.z});
  m.time=m.breachUntil.get(base.id)+B.elf.evacuationClearSeconds+1;c.elfEvade.clearSince=m.time-B.elf.evacuationClearSeconds;c.elf(m,u);assert.equal(c.elfEvade,null);assert.equal(c.metrics.evacuationReturns,1);
});
test('Bot Elfo deixa a zona de nascimento do Troll antes do fim da preparação',()=>{
  const m=match(),u=m.unit('e0'),c=new AIController('normal');m.time=m.preparation-B.elf.preparationClearSeconds+1;Object.assign(u,{x:m.map.trollSpawn.x+2,z:m.map.trollSpawn.z});
  c.elf(m,u);assert.ok(c.destination);assert.ok(distance(c.destination,m.map.trollSpawn)>=B.elf.preparationTrollClearRadius);assert.equal(c.metrics.preparationEvacuations,1);
});
test('Bot reassentado abandona a base destruída e escolhe outra clareira longe do Troll',()=>{
  const m=match(),u=m.unit('e0'),t=m.unit('t'),c=new AIController('normal'),oldBase=m.map.bases[0];m.state=STATES.ACTIVE;m.time=100;m.unit('e1').alive=false;
  Object.assign(u,{x:oldBase.x,z:oldBase.z,baseId:oldBase.id,gold:1000,wood:1000});Object.assign(t,{x:oldBase.x+2,z:oldBase.z});
  const core={id:'lost-core',kind:'core',owner:u.id,baseId:oldBase.id,x:oldBase.x,z:oldBase.z,hp:360,maxHp:360,tier:1,progress:1,lastHit:-100,bounty:100};m.structures.push(core);m.elfBasesClaimed.add(oldBase.id);
  m.damage(core,core.hp,t,'melee');assert.equal(u.baseId,null);assert.equal(u.displacedBaseId,oldBase.id);assert.ok(u.relocationThreat);
  c.elf(m,u);assert.ok(c.metrics.relocationTarget);assert.notEqual(c.metrics.relocationTarget,oldBase.id);assert.equal(c.metrics.relocationAvoidedBase,oldBase.id);assert.ok(c.destination);
  const target=m.map.bases.find(base=>base.id===c.metrics.relocationTarget);assert.ok(distance(target,t)>distance(oldBase,t));
});
test('Movimento lateral preserva orientação da mira enviada pelo jogador',()=>{
  const m=match(),u=m.unit('e0');m.input(u.id,{x:1,z:0,yaw:Math.PI});m.movement(u,.05);assert.equal(u.yaw,Math.PI);
});
test('Rugido interrompe torres e informa o prazo ao dono sem desativar a economia',()=>{
  const m=match(),u=m.unit('t');m.state=STATES.ACTIVE;m.time=30;
  for(const kind of ['tower','core'])m.structures.push({id:kind,kind,owner:'e0',x:u.x+3,z:u.z,hp:300,maxHp:300,progress:1,tier:1,branch:'power'});
  m.act('t',{type:'roar'});let s=m.snapshot('e0');assert.equal(s.structures.find(e=>e.id==='tower').effects[0].until,32);assert.equal(s.structures.find(e=>e.id==='core').effects.length,0);
  m.time=33;s=m.snapshot('e0');assert.equal(s.structures.find(e=>e.id==='tower').effects.length,0);assert.match(m.act('t',{type:'roar'}),/recarregando/);
});

test('Inatividade do Troll nunca causa dano nem simula ataque inimigo',()=>{
  const m=match(),u=m.unit('t');m.state=STATES.ACTIVE;m.time=B.idlePressureAge+1;u.hp=900;u.exposure=5;Object.assign(u,{x:m.map.trollSpawn.x+20,z:m.map.trollSpawn.z});
  const hp=u.hp,lastHit=u.lastHit;
  for(let i=0;i<60;i++)m.step(1/B.tick);
  assert.ok(u.hp>hp);
  assert.equal(u.lastHit,lastHit);assert.equal(u.exposure,0);
  const snapshot=m.snapshot('t'),effects=snapshot.units.find(e=>e.id==='t').effects;
  assert.ok(!effects.some(e=>e.id==='hunger'));assert.ok(!effects.some(e=>e.id==='regen-delay'));
  assert.ok(!snapshot.alerts.some(a=>a.id==='t'));
});

test('IA não abandona recuperação segura apenas por pressão de inatividade',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal');m.state=STATES.ACTIVE;m.time=B.idlePressureAge+1;u.hp=200;
  for(const elf of m.units.filter(e=>e.role==='elf'))Object.assign(elf,m.map.bases[0]);
  c.troll(m,u);c.retreating=true;c.brain.recoveryUntil=m.time+36;
  m.step(1/B.tick);c.troll(m,u);
  assert.equal(c.retreating,true);assert.equal(c.brain.state,'recover');
  u.hp=u.maxHp*.6;m.time+=3.1;c.troll(m,u);assert.equal(c.retreating,false);
  // A real hit must still trigger a defensive response under idle pressure.
  u.hp=u.maxHp*.2;m.structures.push({id:'idle-danger',kind:'tower',x:u.x+4,z:u.z,hp:400,maxHp:400,tier:3,branch:'power',progress:1});m.damage(u,1,m.unit('e0'),'tower');c.troll(m,u);
  assert.equal(c.retreating,true);assert.equal(c.brain.state,'disengage');
});
