import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../shared/simulation.js';
import { STATES, BALANCE as B, distance } from '../shared/config.js';
import { toCell, index } from '../shared/map.js';
import { AIController } from '../shared/controllers.js';
import { TacticalMap } from '../client/tactical-map.js';
const match=()=>new Match({seed:'TACTICS'},[{id:'t',role:'troll',occupant:{type:'human',name:'Troll'}},...['e0','e1'].map(id=>({id,role:'elf',occupant:{type:'human',name:id}}))]);

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
  let effects=m.snapshot('t').units.find(e=>e.id==='t').effects;assert.equal(effects.find(e=>e.id==='frost').until,21.5);assert.equal(effects.find(e=>e.id==='regen-delay').until,25);assert.ok(effects.some(e=>e.id==='exposure'));
  m.time=26;effects=m.snapshot('t').units.find(e=>e.id==='t').effects;assert.ok(!effects.some(e=>['frost','dash','regen-delay'].includes(e.id)));assert.ok(effects.some(e=>e.id==='regen'));
  m.time=B.hungerAge+50;assert.ok(m.snapshot('t').units.find(e=>e.id==='t').effects.some(e=>e.id==='hunger'));
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
  const speed=B.troll.speed,maxHp=u.maxHp;c.troll(m,u);assert.equal(c.retreating,true);assert.equal(c.brain.state,'retreat');assert.ok(c.destination);assert.ok(distance(c.destination,u)>5);assert.equal(u.maxHp,maxHp);assert.equal(B.troll.speed,speed);
  Object.assign(u,c.destination);m.time=65;u.lastHit=60;c.troll(m,u);assert.equal(c.brain.state,'recover');assert.equal(c.destination,null);
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
test('Espada lendária encerra recuperação e dificuldades maiores sustentam o assalto',()=>{
  assert.ok(B.difficulty.easy.retreat>B.difficulty.normal.retreat&&B.difficulty.normal.retreat>B.difficulty.hard.retreat);
  const m=match(),u=m.unit('t'),c=new AIController('hard');m.state=STATES.ACTIVE;m.time=B.finalAge+50;u.hp=u.maxHp*.3;u.levels.damage=5;u.levels.siege=5;
  c.troll(m,u);c.retreating=true;c.brain.recoveryUntil=m.time-1;c.troll(m,u);
  assert.equal(c.retreating,false);assert.ok(!['retreat','recover'].includes(c.brain.state));
});
test('Troll preserva ouro para completar a espada após o selo lendário',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('hard');m.state=STATES.ACTIVE;m.time=B.finalAge+1;u.levels.damage=4;u.levels.siege=3;u.gold=100;
  c.troll(m,u);assert.equal(u.gold,100);assert.equal(u.levels.damage+u.levels.siege,7);
});
test('IA persegue Elfo exposto antes de desperdiçar tempo em estrutura resistente',()=>{
  const m=match(),u=m.unit('t'),elf=m.unit('e0'),c=new AIController('hard');m.state=STATES.ACTIVE;m.time=60;elf.x=u.x+6;elf.z=u.z;m.unit('e1').x=0;m.unit('e1').z=0;
  m.structures.push({id:'core',kind:'core',x:u.x-6,z:u.z,hp:3000,maxHp:3000,tier:4,progress:1});c.troll(m,u);assert.equal(c.brain.targetId,elf.id);assert.equal(c.brain.state,'pursue');
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

test('Fome causa desgaste, mas não simula ataque inimigo nem aumenta exposição',()=>{
  const m=match(),u=m.unit('t');m.state=STATES.ACTIVE;m.time=B.hungerAge+1;u.hp=900;u.exposure=5;
  const hp=u.hp,lastHit=u.lastHit;
  for(let i=0;i<60;i++)m.step(1/B.tick);
  assert.ok(Math.abs(u.hp-(hp-u.maxHp*B.hungerRate*3))<1e-7);
  assert.equal(u.lastHit,lastHit);assert.equal(u.exposure,0);
  const snapshot=m.snapshot('t'),effects=snapshot.units.find(e=>e.id==='t').effects;
  assert.ok(effects.some(e=>e.id==='hunger'));assert.ok(!effects.some(e=>e.id==='regen-delay'));
  assert.ok(!snapshot.alerts.some(a=>a.id==='t'));
});

test('IA faminta abandona recuperação segura e procura combate',()=>{
  const m=match(),u=m.unit('t'),c=new AIController('normal');m.state=STATES.ACTIVE;m.time=B.hungerAge+1;u.hp=200;
  for(const elf of m.units.filter(e=>e.role==='elf'))Object.assign(elf,m.map.bases[0]);
  c.troll(m,u);c.retreating=true;c.brain.recoveryUntil=m.time+36;
  m.step(1/B.tick);c.troll(m,u);
  assert.equal(c.retreating,false);assert.ok(['rotate','scout'].includes(c.brain.state));assert.ok(c.destination);
  // A real hit must still trigger a defensive response even while hungry.
  m.damage(u,1,m.unit('e0'),'tower');c.troll(m,u);
  assert.equal(c.retreating,true);assert.equal(c.brain.state,'retreat');
});
