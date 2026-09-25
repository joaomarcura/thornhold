import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../shared/simulation.js';
import { STATES, BALANCE as B, distance } from '../shared/config.js';
import { toCell, index } from '../shared/map.js';
import { AIController } from '../shared/controllers.js';
import { TacticalMap } from '../client/tactical-map.js';
import { StrategicMap } from '../shared/strategic-map.js';
import { TROLL_STATES } from '../shared/troll-brain.js';
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
test('Memória estratégica V2 persiste com confiança decrescente sem conhecer alvos ocultos',()=>{
  const m=match(),t=m.unit('t'),memory=new StrategicMap(),visible={id:'seen-tower',kind:'tower',x:t.x+4,z:t.z,hp:360,maxHp:360,tier:2,branch:'power',progress:1,baseId:'known'};
  const hidden={id:'hidden-mine',kind:'mine',x:t.x+40,z:t.z+40,hp:200,maxHp:200,tier:7,coreTier:7,progress:1,baseId:'hidden'};m.structures.push(visible,hidden);m.state=STATES.ACTIVE;m.time=60;
  memory.update(m,t,[visible]);let report=memory.report(m,t),known=report.find(s=>s.knownStructures>0);assert.equal(known.knownStructures,1);assert.ok(known.estimatedTowerDps>0);assert.equal(memory.observations.has(hidden.id),false);
  const initial=known.confidence;m.time=240;memory.update(m,t,[]);report=memory.report(m,t);known=report.find(s=>s.knownStructures>0);assert.ok(known.confidence<initial);assert.equal(known.knownStructures,1);
});
test('State Machine V2 usa fases explícitas e PROBE sem atacar a estrutura',()=>{
  assert.deepEqual(TROLL_STATES,['explore','hunt','probe','siege','chase','reposition','disengage','recover','rotate']);
  const m=match(),t=m.unit('t'),c=new AIController('normal'),wall={id:'probe-wall',kind:'wall',owner:'e0',baseId:'probe-base',x:t.x+6,z:t.z,hp:1100,maxHp:1100,tier:1,progress:1,bounty:500};m.state=STATES.ACTIVE;m.time=m.preparation+60;m.structures.push(wall);for(const elf of m.units.filter(u=>u.role==='elf'))Object.assign(elf,{x:0,z:0});
  const hp=wall.hp;c.troll(m,t);assert.equal(c.brain.phase(m),'hunt');assert.equal(c.brain.state,'probe');assert.equal(wall.hp,hp);
  m.time+=3.1;c.troll(m,t);assert.equal(c.brain.state,'siege');assert.equal(c.brain.targetEvaluation.phase,'hunt');
  m.time=m.preparation+430;assert.equal(c.brain.phase(m),'siege');m.time=m.preparation+721;assert.equal(c.brain.phase(m),'endgame');
});
test('PROBE abandona ameaça medida sem usar conhecimento oculto',()=>{
  const m=match(),t=m.unit('t'),c=new AIController('normal'),tower={id:'probe-danger',kind:'tower',owner:'e0',baseId:'danger-base',x:t.x+6,z:t.z,hp:360,maxHp:360,tier:5,branch:'power',progress:1,bounty:500};m.state=STATES.ACTIVE;m.time=100;m.structures.push(tower);for(const elf of m.units.filter(u=>u.role==='elf'))Object.assign(elf,{x:0,z:0});c.troll(m,t);assert.equal(c.brain.state,'probe');
  t.stats.damageReceived=t.maxHp*.2;m.time+=3.1;c.troll(m,t);assert.equal(c.brain.state,'rotate');assert.equal(c.brain.targetId,null);assert.ok(c.brain.strategicMap.report(m,t).some(s=>s.failedSieges===1));
});
test('Siege Budget respeita commitment mínimo e abandona troca improdutiva',()=>{
  const m=match(),t=m.unit('t'),c=new AIController('normal'),wall={id:'budget-wall',kind:'wall',owner:'e0',baseId:'budget-base',x:t.x+2,z:t.z,hp:1100,maxHp:1100,tier:1,progress:1,bounty:500};m.state=STATES.ACTIVE;m.time=100;m.structures.push(wall);for(const elf of m.units.filter(u=>u.role==='elf'))Object.assign(elf,{x:0,z:0});c.brain??=null;c.troll(m,t);c.brain.probedBases.set(wall.baseId,m.time);c.troll(m,t);assert.equal(c.brain.state,'siege');assert.ok(c.brain.siege);
  t.hp=t.maxHp*.76;m.time+=1;c.troll(m,t);assert.equal(c.retreating,false);assert.equal(c.brain.siegeDecision.withinCommitment,true);
  m.time+=4;c.troll(m,t);assert.equal(c.retreating,false);assert.equal(c.brain.state,'rotate');assert.equal(c.brain.targetId,null);
});
test('Siege Budget mantém ataque produtivo acima da duração nominal',()=>{
  const m=match(),t=m.unit('t'),c=new AIController('normal'),wall={id:'productive-wall',kind:'wall',owner:'e0',baseId:'productive-base',x:t.x+2,z:t.z,hp:1100,maxHp:1100,tier:1,progress:1,bounty:500};m.state=STATES.ACTIVE;m.time=100;m.structures.push(wall);for(const elf of m.units.filter(u=>u.role==='elf'))Object.assign(elf,{x:0,z:0});c.troll(m,t);c.brain.probedBases.set(wall.baseId,m.time);c.troll(m,t);wall.hp=220;t.hp=t.maxHp*.9;m.time+=19;c.troll(m,t);
  assert.equal(c.brain.siegeDecision.budgetExceeded,true);assert.ok(c.brain.siegeDecision.tradeScore>.45);assert.equal(c.brain.siegeDecision.shouldExit,false);assert.equal(c.retreating,false);
});
test('Navegação do Troll não trata a própria estrutura-alvo como obstáculo',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('hard'),tower={id:'tower-target',kind:'tower',x:u.x+6,z:u.z,hp:400,maxHp:400,tier:1,branch:'power',progress:1};
  m.state=STATES.ACTIVE;m.structures.push(tower);c.discovered.set(tower.id,{...tower,seenAt:m.time});
  const blocked=c.navigationBlocks(m,u,tower.id),cell=toCell(m,tower);
  assert.equal(blocked.has(index(m,cell.x,cell.z)),false);
  assert.equal(c.go(m,u,tower,3),false);c.follow(m,u);assert.ok(Math.hypot(u.input.x,u.input.z)>0);
});
test('Percepção de estruturas não depende do yaw do Troll',()=>{
  const m=match(),u=m.unit('t'),tower={id:'tower-visible',kind:'tower',x:u.x+5,z:u.z,hp:400,maxHp:400,tier:1,branch:'power',progress:1};
  m.structures.push(tower);m.state=STATES.ACTIVE;u.yaw=0;assert.equal(m.canSee(u,tower),true);u.yaw=Math.PI;assert.equal(m.canSee(u,tower),true);
});
test('IA recua de cerco perigoso e recupera vida sem ganhar atributos',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal');m.state=STATES.ACTIVE;m.time=60;u.hp=200;u.lastHit=60;
  m.structures.push({id:'tower',kind:'tower',x:u.x+5,z:u.z,hp:400,maxHp:400,tier:3,branch:'power',progress:1});
  const speed=B.troll.speed,maxHp=u.maxHp;c.troll(m,u);assert.equal(c.retreating,true);assert.equal(c.brain.state,'disengage');assert.ok(c.destination);assert.ok(distance(c.destination,u)>5);assert.equal(u.maxHp,maxHp);assert.equal(B.troll.speed,speed);
  Object.assign(u,c.destination);m.time=65;u.lastHit=60;c.troll(m,u);assert.equal(c.brain.state,'recover');assert.equal(c.destination.x,m.map.trollSpawn.x);assert.equal(c.destination.z,m.map.trollSpawn.z);
});
test('IA antecipa dano da rota de fuga e usa o Santuário quando muito ferida',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal');m.state=STATES.ACTIVE;m.time=100;u.hp=u.maxHp*.35;u.lastHit=m.time;
  for(let i=0;i<3;i++)m.structures.push({id:'predictive-'+i,kind:'tower',x:u.x-5+i*5,z:u.z+4,hp:600,maxHp:600,tier:4,branch:'power',progress:1,disabledUntil:0});
  c.troll(m,u);assert.ok(c.brain.projectedEscapeHp<.35,JSON.stringify({projection:c.brain.projectedEscapeHp,risk:c.brain.riskScore}));assert.equal(c.retreating,true);assert.ok(c.destination);
  m.structures=[];c.discovered.clear();u.hp=u.maxHp*.25;u.lastHit=-100;Object.assign(u,{x:m.map.trollSpawn.x+30,z:m.map.trollSpawn.z});c.troll(m,u);
  assert.equal(c.brain.state,'recover');assert.equal(c.destination.x,m.map.trollSpawn.x);assert.equal(c.destination.z,m.map.trollSpawn.z);
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
test('Espada lendária mantém agressividade, mas respeita recuo emergencial até 58%',()=>{
  assert.ok(B.difficulty.easy.retreat>B.difficulty.normal.retreat&&B.difficulty.normal.retreat>B.difficulty.hard.retreat);
  const m=match(),u=m.unit('t'),c=new AIController('hard');m.state=STATES.ACTIVE;m.time=B.finalAge+50;u.hp=u.maxHp*.18;u.levels.damage=5;u.levels.siege=5;u.lastHit=m.time;
  m.structures.push({id:'legend-danger',kind:'tower',x:u.x+5,z:u.z,hp:400,maxHp:400,tier:5,branch:'power',progress:1,disabledUntil:0});
  c.troll(m,u);assert.equal(c.retreating,true);assert.equal(c.brain.state,'disengage');
  m.structures=[];c.discovered.clear();u.lastHit=-100;Object.assign(u,c.brain.safePoint||u);u.hp=u.maxHp*.57;c.troll(m,u);assert.equal(c.retreating,true);
  u.hp=u.maxHp*.58;c.troll(m,u);assert.equal(c.retreating,false);assert.ok(!['retreat','recover'].includes(c.brain.state));
});
test('Janela de recuperação começa somente quando o Troll sai do fogo das torres',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal');m.state=STATES.ACTIVE;m.time=120;u.hp=u.maxHp*.2;u.lastHit=m.time;
  m.structures.push({id:'recovery-danger',kind:'tower',x:u.x+5,z:u.z,hp:400,maxHp:400,tier:3,branch:'power',progress:1,disabledUntil:0});
  c.troll(m,u);assert.equal(c.retreating,true);assert.equal(c.brain.recoveryUntil,0);
  m.time+=12;u.lastHit=-100;m.structures=[];c.discovered.clear();Object.assign(u,c.brain.safePoint||u);c.troll(m,u);
  assert.equal(c.brain.recoveryUntil,0);assert.equal(c.destination.x,m.map.trollSpawn.x);
  Object.assign(u,m.map.trollSpawn);c.troll(m,u);assert.ok(c.brain.recoveryUntil>=m.time+17.9);assert.equal(c.retreating,true);
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
test('Troll preserva ouro para completar a espada após o selo lendário',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('hard');m.state=STATES.ACTIVE;m.time=B.finalAge+1;u.levels.damage=4;u.levels.siege=3;u.gold=100;
  c.troll(m,u);assert.equal(u.gold,100);assert.equal(u.levels.damage+u.levels.siege,7);
});
test('IA persegue Elfo exposto antes de desperdiçar tempo em estrutura resistente',()=>{
  const m=match(),u=m.unit('t'),elf=m.unit('e0'),c=new AIController('hard');m.state=STATES.ACTIVE;m.time=60;elf.x=u.x+6;elf.z=u.z;m.unit('e1').x=0;m.unit('e1').z=0;
  m.structures.push({id:'core',kind:'core',x:u.x-6,z:u.z,hp:3000,maxHp:3000,tier:4,progress:1});c.troll(m,u);assert.equal(c.brain.targetId,elf.id);assert.equal(c.brain.state,'chase');
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

test('IA sob pressão de inatividade abandona recuperação segura sem perder vida',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal');m.state=STATES.ACTIVE;m.time=B.idlePressureAge+1;u.hp=200;
  for(const elf of m.units.filter(e=>e.role==='elf'))Object.assign(elf,m.map.bases[0]);
  c.troll(m,u);c.retreating=true;c.brain.recoveryUntil=m.time+36;
  m.step(1/B.tick);c.troll(m,u);
  assert.equal(c.retreating,false);assert.ok(['rotate','explore','hunt'].includes(c.brain.state));assert.ok(c.destination);
  // A real hit must still trigger a defensive response under idle pressure.
  m.damage(u,1,m.unit('e0'),'tower');c.troll(m,u);
  assert.equal(c.retreating,true);assert.equal(c.brain.state,'disengage');
});
