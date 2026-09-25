import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, validateBase, index, lineOfSight, towerLineOfSight, pathfind, world } from '../shared/map.js';
import { Match } from '../shared/simulation.js';
import { BALANCE as B, STATES, distance } from '../shared/config.js';
import { SessionService } from '../server/sessions.js';

const slots=(n=2,type='human')=>[{id:'t',role:'troll',occupant:{type,name:'Troll'}},...Array.from({length:n},(_,i)=>({id:'e'+i,role:'elf',occupant:{type,name:'Elfo '+i}}))];
const match=(n=2)=>new Match({seed:'TEST-'+n},slots(n));
function completedBase(m,id='e0'){
  const u=m.unit(id),b=m.map.bases[0];u.x=b.x+4.4;u.z=b.z;
  assert.equal(m.act(id,{type:'build',kind:'core',x:b.x,z:b.z}),undefined);
  for(let i=0;i<100;i++)m.step(.05);return {u,b,core:m.structures.find(s=>s.kind==='core')};
}
test('Seed determinística e corte de entrada única em 40 mapas',()=>{
  assert.deepEqual(generateMap('same'),generateMap('same'));
  assert.notDeepEqual(generateMap('same').bases,generateMap('different').bases);
  for(const size of ['compact','large'])for(let seed=0;seed<20;seed++){const m=generateMap('seed-'+seed,size);assert.equal(m.validation.length,12);assert.ok(m.validation.every(v=>v.valid&&v.openings===1&&v.gateIsCutVertex));}
});
test('Validador rejeita passagem alternativa e entrada selada',()=>{
  const m=generateMap(),b=m.bases[0];m.grid[index(m,b.cx-b.rx,b.cz)]=0;assert.equal(validateBase(m,b).valid,false);
  m.grid[index(m,b.cx-b.rx,b.cz)]=1;m.grid[index(m,b.gate.cx,b.gate.cz)]=1;assert.equal(validateBase(m,b).valid,false);
});
test('Pathfinding conecta o spawn a cada interior pelo portão',()=>{
  const m=generateMap();for(const b of m.bases){const path=pathfind(m,m.trollSpawn,b);assert.ok(path.length);assert.ok(path.some(p=>distance(p,b.gate)<.1));assert.equal(pathfind(m,m.trollSpawn,b,new Set([index(m,b.gate.cx,b.gate.cz)])).length,0);}
});
test('Construção consome recursos, é progressiva e gera renda real',()=>{
  const m=match(),u=m.unit('e0'),b=m.map.bases[0];u.x=b.x+4.4;u.z=b.z;
  assert.equal(m.act(u.id,{type:'build',kind:'core',x:b.x,z:b.z}),undefined);const s=m.structures[0];assert.equal(u.gold,85);assert.equal(u.wood,85);assert.equal(s.progress,0);assert.equal(s.hp,s.maxHp*.15);
  for(let i=0;i<100;i++)m.step(.05);assert.equal(s.progress,1);assert.equal(s.hp,s.maxHp);assert.ok(u.gold>85);
  assert.match(m.act(u.id,{type:'build',kind:'core',x:b.x,z:b.z+4.4}),/já possui/);
});
test('Orçamento de recompensa compensa lobbies sem vazar no snapshot',()=>{
  const two=match(2),five=match(5),eight=match(8),a=completedBase(two).core,b=completedBase(five).core,c=completedBase(eight).core;
  const mapFactor=B.economy.trollMapBounty.compact,scenario=B.economy.trollScenarioBounty.compact.normal;assert.equal(a.bountyFactor,B.economy.trollBountyFactor[2]*mapFactor*(scenario[2]||1));assert.equal(b.bountyFactor,B.economy.trollBountyFactor[5]*mapFactor*scenario[5]);assert.equal(c.bountyFactor,B.economy.trollBountyFactor[8]*mapFactor*(scenario[8]||1));
  assert.ok(a.bountyFactor>c.bountyFactor&&b.bountyFactor>c.bountyFactor);assert.equal(two.snapshot('e0').structures[0].bountyFactor,undefined);
  const duel=match(1),team=match(2);assert.equal(duel.trollStats(duel.unit('t')).siege,team.trollStats(team.unit('t')).siege*B.economy.trollLobbySiege[1]);
});
test('Ferramentas dev concedem recursos com limites e não aceitam valores falsos',()=>{
  const m=match(),u=m.unit('e0'),before={gold:u.gold,wood:u.wood};
  assert.equal(m.devGrant('e0',{gold:1000,wood:250}),null);assert.equal(u.gold,before.gold+1000);assert.equal(u.wood,before.wood+250);
  assert.match(m.devGrant('e0',{gold:-1}),/Quantidade/);assert.match(m.devGrant('e0',{gold:1.5}),/Quantidade/);assert.match(m.devGrant('e0',{gold:1_000_001}),/Quantidade/);assert.match(m.devGrant('missing',{gold:1}),/Jogador/);
});
test('Targeting de torres é determinístico e explica borda, cooldown e estado',()=>{
  const m=match(1),t=m.unit('t'),s={id:'tower-debug',kind:'tower',owner:'e0',x:t.x+B.structures.tower.range,z:t.z,tier:1,branch:'power',hp:260,maxHp:260,progress:1,lastShot:-100,disabledUntil:0};m.structures.push(s);m.state=STATES.ACTIVE;
  assert.equal(m.towerTargeting(s).valid,true);s.lastShot=m.time;assert.equal(m.towerTargeting(s).reason,'cooldown');s.disabledUntil=m.time+2;assert.equal(m.towerTargeting(s).reason,'disabled');s.disabledUntil=0;t.alive=false;assert.equal(m.towerTargeting(s).reason,'no-troll');
});
test('Torre usa altura real, mantém alvo na borda e registra por que não disparou',()=>{
  const m=match(1),t=m.unit('t'),terrain=generateMap('THORNHOLD'),a=world(terrain,84,19),b=world(terrain,86,26),def=B.structures.tower;m.map=terrain;
  assert.equal(lineOfSight(terrain,a,b),false);assert.equal(lineOfSight(terrain,a,b,def.muzzleHeight,def.targetHeight),true);
  Object.assign(t,b);const s={id:'tower-height',kind:'tower',owner:'e0',...a,tier:1,branch:'power',hp:260,maxHp:260,progress:1,lastShot:-100,disabledUntil:0};m.structures.push(s);m.state=STATES.ACTIVE;
  assert.equal(m.towerTargeting(s).valid,true);m.step(.05);assert.equal(s.targetLock,t.id);
  m.map={size:20,cell:2.2,grid:Array(400).fill(0),heights:Array(400).fill(0),bases:[],trees:[]};Object.assign(s,{x:10,z:10,lastShot:-100});Object.assign(t,{x:s.x+def.range+.5,z:s.z});
  const retained=m.towerTargeting(s);assert.equal(retained.valid,true);assert.equal(retained.retained,true);
  t.x=s.x+def.range+def.retainRange+.1;assert.equal(m.towerTargeting(s).reason,'out-of-range');m.step(.05);
  const diagnostic=m.telemetry.result(m).towerDiagnostics.find(row=>row.id===s.id);assert.ok(diagnostic);assert.ok(diagnostic.shots>=1);assert.ok(diagnostic.reasons.ready>=1);
});
test('Duas torres atacam através da própria borda elevada da clareira',()=>{
  const m=match(1),t=m.unit('t'),base=m.map.bases[0],def=B.structures.tower;
  const outside=world(m.map,base.gate.cx+(base.gate.axis==='x'?base.gate.sign*2:0),base.gate.cz+(base.gate.axis==='z'?base.gate.sign*2:0));
  const candidates=[];for(let z=base.cz-base.rz+1;z<base.cz+base.rz;z++)for(let x=base.cx-base.rx+1;x<base.cx+base.rx;x++){const p=world(m.map,x,z);if(distance(p,outside)<=def.range&&lineOfSight(m.map,p,outside,def.muzzleHeight,def.targetHeight)!==towerLineOfSight(m.map,p,outside,base.id,def.muzzleHeight,def.targetHeight))candidates.push(p);}
  assert.ok(candidates.length,'O mapa deve conter uma posição interna cuja borda bloqueava a torre');
  const blocked=candidates[0],aligned=world(m.map,base.gate.cx-(base.gate.axis==='x'?base.gate.sign:0),base.gate.cz-(base.gate.axis==='z'?base.gate.sign:0));Object.assign(t,outside);m.state=STATES.ACTIVE;
  const make=(id,p)=>({id,kind:'tower',owner:'e0',baseId:base.id,...p,tier:1,branch:'power',hp:360,maxHp:360,progress:1,lastShot:-100,disabledUntil:0});m.structures.push(make('tower-offset',blocked),make('tower-gate',aligned));
  const hp=t.hp;m.step(.05);assert.ok(t.hp<hp-1.5*B.structures.tower.damage,'As duas torres deveriam causar dano no mesmo tick');
  const diagnostics=m.telemetry.result(m).towerDiagnostics;assert.equal(diagnostics.find(row=>row.id==='tower-offset').shots,1);assert.equal(diagnostics.find(row=>row.id==='tower-gate').shots,1);
});
test('Bots Elfos adotam perfis distintos e todos constroem economia mínima',()=>{
  const elves=Array.from({length:5},(_,i)=>({id:'e'+i,role:'elf',occupant:{type:'bot',name:'Elfo '+i}}));
  const m=new Match({seed:'ECON-TEST',difficulty:'normal',preparation:50},[{id:'t',role:'troll',occupant:{type:'human',name:'Troll'}},...elves]);
  for(let i=0;i<6000;i++)m.step(.05);
  const offsets={economy:-1,balanced:0,defense:1},rows=m.units.filter(u=>u.role==='elf').map(u=>{const own=m.structures.filter(s=>s.owner===u.id&&s.hp>0);return {strategy:m.controllers.get(u.id).elfProfile,core:own.find(s=>s.kind==='core'),wall:own.find(s=>s.kind==='wall'),mines:own.filter(s=>s.kind==='mine'),towers:own.filter(s=>s.kind==='tower')};});
  assert.ok(new Set(rows.map(row=>row.strategy)).size>=3);assert.ok(rows.every(row=>row.core?.tier>=2&&row.wall?.tier>=2&&row.mines.length>=1));assert.ok(rows.every(row=>row.towers.every(t=>t.tier<=Math.max(1,row.core.tier+offsets[row.strategy]))));
});
test('IA do Elfo prioriza a primeira torre antes da barricada',()=>{
  const m=new Match({seed:'EARLY-DEFENSE',difficulty:'easy',preparation:20},[{id:'t',role:'troll',occupant:{type:'bot',name:'Troll',difficulty:'easy'}},{id:'e0',role:'elf',occupant:{type:'bot',name:'Elfo',difficulty:'easy'}}]);
  for(let i=0;i<500&&!m.structures.some(s=>s.kind==='tower');i++)m.step(.1);
  assert.equal(m.structures[0]?.kind,'core');assert.equal(m.structures[1]?.kind,'tower');assert.ok(m.time<50);
});
test('Servidor rejeita construção remota, terreno, sobreposição, protótipos e recursos falsos',()=>{
  const m=match(),u=m.unit('e0'),b=m.map.bases[0],gold=u.gold;
  for(const command of [{type:'build',kind:'core',x:b.x,z:b.z},{type:'build',kind:'constructor',x:u.x,z:u.z},{type:'build',kind:'__proto__',x:u.x,z:u.z},{type:'build',kind:'core',x:NaN,z:0}])assert.equal(typeof m.act(u.id,command),'string');
  assert.equal(u.gold,gold);const {core}=completedBase(m);assert.match(m.act(u.id,{type:'build',kind:'tower',x:core.x,z:core.z}),/ocupado/);
  m.input(u.id,{x:Infinity,z:NaN,speed:999,gold:999999});m.step(.05);assert.ok(Number.isFinite(u.x));assert.ok(u.gold<9999);
});
test('Coleta física esgota árvore; cooldown e reparo custam os mesmos recursos',()=>{
  const m=match(),{u,core,b}=completedBase(m),t=m.trees[0];u.x=t.x+1;u.z=t.z;const wood=u.wood;
  m.act(u.id,{type:'gather',target:t.id});assert.equal(u.wood,wood+B.elf.gather);m.act(u.id,{type:'gather',target:t.id});assert.equal(u.wood,wood+B.elf.gather);
  t.amount=3;m.time+=1;m.act(u.id,{type:'gather',target:t.id});assert.equal(t.amount,0);
  u.x=b.x+3;u.z=b.z;core.hp-=100;const before=u.gold;m.act(u.id,{type:'repair',target:core.id});assert.equal(u.gold,before-3);assert.equal(core.hp,core.maxHp-58);
});
test('Barricada é reparada sem recursos e ajudantes simultâneos contribuem 25%',()=>{
  const m=match(2),a=m.unit('e0'),helper=m.unit('e1'),b=m.map.bases[0];
  const wall={id:'wall-free-repair',kind:'wall',owner:a.id,baseId:b.id,x:b.gate.x,z:b.gate.z,tier:1,hp:300,maxHp:500,progress:1,lastHit:-100,bounty:0};m.structures.push(wall);
  Object.assign(a,{x:wall.x,z:wall.z,gold:0,wood:0});Object.assign(helper,{x:wall.x,z:wall.z,gold:0,wood:0});
  assert.equal(m.act(a.id,{type:'repair',target:wall.id}),undefined);assert.equal(wall.hp,342);
  assert.equal(m.act(helper.id,{type:'repair',target:wall.id}),undefined);assert.equal(wall.hp,352.5);
  assert.equal(a.gold,0);assert.equal(a.wood,0);assert.equal(helper.gold,0);assert.equal(helper.wood,0);
  assert.equal(m.events.at(-1).contribution,.25);assert.equal(m.events.at(-1).contributors,2);
  assert.equal(m.snapshot(a.id).structures[0].repairers,undefined);
  m.time+=1.3;assert.equal(m.act(helper.id,{type:'repair',target:wall.id}),undefined);assert.equal(wall.hp,394.5);assert.equal(m.events.at(-1).contribution,1);
});
test('Dano econômico limitado ao HP aplicado, sem overkill ou alvo já morto',()=>{
  const m=match(),t=m.unit('t'),e=m.unit('e0');const before=t.gold;
  assert.equal(m.damage(e,9999,t,'melee'),B.elf.hp);assert.equal(e.ghost,true);const afterElf=t.gold;
  assert.equal(t.stats.goldFromObjectives,B.economy.trollObjective.elf);assert.equal(m.damage(e,9999,t,'melee'),B.ghost.hp);assert.equal(t.gold,afterElf+B.ghost.goldReward);assert.equal(m.damage(e,9999,t,'melee'),0);assert.ok(t.gold>before);
  assert.equal(t.stats.goldFromObjectives,B.economy.trollObjective.elf+B.ghost.goldReward);assert.equal(t.stats.goldGenerated,t.stats.goldFromDamage+t.stats.goldFromObjectives+t.stats.goldFromThreat);
  assert.equal(m.damage(m.unit('e1'),Infinity,t,'melee'),0);
});
test('Economia Troll V2 separa objetivos e mantém scaling pelo lobby inicial',()=>{
  const m=match(2),t=m.unit('t'),a=m.unit('e0'),b=m.unit('e1');m.state=STATES.ACTIVE;
  const start=t.gold;m.damage(a,10,t,'melee');const first=t.gold-start;a.alive=false;
  m.damage(b,10,t,'melee');const second=t.gold-start-first;
  assert.ok(Math.abs(first-second)<1e-9,'Eliminar um Elfo não pode reduzir o ouro por dano');
  const wall={id:'objective-wall',kind:'wall',owner:b.id,baseId:'objective-base',x:t.x,z:t.z,hp:1,maxHp:1100,tier:1,progress:1,bounty:100};m.structures.push(wall);
  const objectiveBefore=t.stats.goldFromObjectives;m.damage(wall,1,t,'melee');
  assert.equal(t.stats.goldFromObjectives-objectiveBefore,B.economy.trollObjective.wall);
});
test('Descoberta é paga uma vez e ameaça acompanha economia Elfa visível ou não',()=>{
  const m=match(2),t=m.unit('t'),owner=m.unit('e0');m.state=STATES.ACTIVE;
  for(const elf of m.units.filter(u=>u.role==='elf'))Object.assign(elf,{x:t.x+80,z:t.z+80});
  const core={id:'threat-core',kind:'core',owner:owner.id,baseId:'threat-base',x:t.x+1,z:t.z,hp:360,maxHp:360,tier:1,progress:1,bounty:100};m.structures.push(core);
  m.step(.1);assert.equal(t.stats.goldFromObjectives,B.economy.trollObjective.discovery);assert.ok(t.stats.goldFromThreat>0);
  const objective=t.stats.goldFromObjectives,threat=t.stats.goldFromThreat;m.step(.1);
  assert.equal(t.stats.goldFromObjectives,objective);assert.ok(t.stats.goldFromThreat>threat);
});
test('Cooldowns, preparação e bloqueio físico não dependem do cliente',()=>{
  const m=match(),t=m.unit('t'),start={x:t.x,z:t.z};m.input(t.id,{x:1,z:0,sprint:true});m.step(.1);assert.equal(t.x,start.x);assert.match(m.act(t.id,{type:'attack'}),/selo/);
  m.state=STATES.ACTIVE;const e=m.unit('e0');e.x=t.x;e.z=t.z+2;t.yaw=0;m.act(t.id,{type:'attack'});const hp=e.hp;m.act(t.id,{type:'attack'});assert.equal(e.hp,hp);
  const b=m.map.bases[0];t.x=(b.cx-b.rx)*m.map.cell-2;t.z=b.cz*m.map.cell;m.input(t.id,{x:1,z:0});for(let i=0;i<20;i++){m.input(t.id,{x:1,z:0});m.step(.05);}assert.ok(t.x<(b.cx-b.rx)*m.map.cell);
});
test('Fog de guerra omite unidades, economia, construções e eventos inimigos',()=>{
  const m=match(),{u,core}=completedBase(m),t=m.unit('t');u.x=core.x;u.z=core.z+2;
  const s=m.snapshot(t.id);assert.ok(!s.units.some(e=>e.id===u.id));assert.ok(!s.structures.some(e=>e.id===core.id));assert.ok(!s.events.some(e=>e.entity===core.id));assert.ok(!JSON.stringify(s).includes('bounty'));
  t.x=u.x;t.z=u.z+2;const visible=m.snapshot(t.id).units.find(e=>e.id===u.id);assert.ok(visible);assert.equal(visible.gold,undefined);assert.equal(visible.levels,undefined);
});
test('Apoio aliado preserva propriedade individual e limites por clareira',()=>{
  const m=match(),{u:owner,b}=completedBase(m),ally=m.unit('e1');owner.x=m.map.elfSpawn.x;owner.z=m.map.elfSpawn.z;ally.x=b.x;ally.z=b.z;
  const candidates=[];for(const dx of [-4.4,-2.2,0,2.2,4.4])for(const dz of [-4.4,-2.2,0,2.2,4.4])if(dx||dz)candidates.push({x:b.x+dx,z:b.z+dz});
  const first=candidates.find(p=>m.placement(ally,'tower',p.x,p.z)===null);assert.ok(first);const ownBase=ally.baseId;
  assert.equal(m.act(ally.id,{type:'build',kind:'tower',...first}),undefined);const tower=m.structures.at(-1);assert.equal(tower.owner,ally.id);assert.equal(tower.baseId,b.id);assert.equal(ally.baseId,ownBase);
  for(let i=0;i<100;i++)m.step(.05);owner.x=tower.x;owner.z=tower.z;owner.gold=owner.wood=10000;assert.match(m.act(owner.id,{type:'upgrade',target:tower.id}),/estrutura sua/);
  ally.x=b.x;ally.z=b.z;const next=candidates.find(p=>m.placement(ally,'tower',p.x,p.z)===null);assert.ok(next);
  for(let i=0;i<4;i++)m.structures.push({...tower,id:'shared-limit-'+i,x:-100-i*3,z:-100,baseId:b.id});
  assert.match(m.placement(ally,'tower',next.x,next.z),/nesta clareira/);
});
test('Transferência direta de recursos foi removida',()=>{
  const m=match(),a=m.unit('e0'),b=m.unit('e1'),before=[a.gold,a.wood,b.gold,b.wood];
  assert.match(m.act(a.id,{type:'transfer',target:b.id,gold:25,wood:10}),/desconhecido/);assert.deepEqual([a.gold,a.wood,b.gold,b.wood],before);
});
test('Vitórias simétricas, resultado imutável e nenhuma punição de vida por inatividade',()=>{
  const m=match(1);m.unit('t').hp=0;m.unit('t').alive=false;m.step(.05);assert.equal(m.state,STATES.END);assert.equal(m.winner,'elves');const time=m.time;m.step(1);assert.equal(m.time,time);
  const n=match(1);n.unit('e0').alive=false;n.step(.05);assert.equal(n.winner,'troll');
  const idle=match();idle.state=STATES.ACTIVE;idle.time=B.idlePressureAge+1;const hp=idle.unit('t').hp;idle.step(1);assert.equal(idle.unit('t').hp,hp);
});
test('IA usa os mesmos atributos em fácil, normal e difícil',()=>{
  for(const difficulty of Object.keys(B.difficulty)){const m=new Match({difficulty},slots(2,'bot'));assert.equal(m.unit('t').maxHp,B.troll.hp);assert.equal(m.unit('e0').gold,B.elf.gold);assert.equal(m.unit('e0').maxHp,B.elf.hp);}
});
test('Partidas autônomas 1v1, 1v2, 1v5 e 1v8 completam todo o ciclo',()=>{
  const cases=[...[1,2,5,8].map(n=>({n,seed:'TEST-'+n,difficulty:'normal'})),{n:5,seed:'SIM-2',difficulty:'easy'}];
  // Infinite progression can exceed the former 20-minute cap. Pacing is measured separately
  // by the 20 Hz audit, which preserves unfinished games instead of treating them as wins.
  for(const {n,seed,difficulty} of cases){const m=new Match({seed,difficulty},slots(n,'bot'));for(let i=0;i<36000&&m.state!==STATES.END;i++)m.step(.1);assert.equal(m.state,STATES.END,seed);assert.ok(['troll','elves'].includes(m.winner));assert.ok(m.stats.trollDamage>0);assert.ok(m.stats.produced>0);assert.ok(m.stats.upgrades>0);assert.ok(m.winner==='elves'||m.stats.basesDestroyed>0);assert.ok(m.stats.basesDestroyed<=n);}
});
test('Lobby: autorização, slots, readiness, sessão privada e revanche',()=>{
  const service=new SessionService(),host=service.addClient('host','Host'),guest=service.addClient('guest','Guest'),r=service.create(host,{role:'troll',settings:{elfSlots:2,private:true},password:'secret',fillBots:true});
  assert.equal(service.list().length,0);assert.throws(()=>service.join(guest,{code:r.id,password:'wrong'}),/Senha/);service.join(guest,{code:r.id,password:'secret'});
  assert.throws(()=>service.start(r,host),/prontos/);assert.throws(()=>service.configure(r,guest,{elfSlots:8}),/host/);
  service.changeSlot(r,guest,{slot:'e0',action:'claim'});assert.equal(r.slots.filter(s=>s.occupant?.clientId==='guest').length,1);
  assert.throws(()=>service.changeSlot(r,guest,{slot:'t0',action:'claim'}),/indisponível/);
  for(const m of r.members.values())m.ready=true;service.start(r,host);assert.equal(r.match.units.length,3);assert.throws(()=>service.changeSlot(r,host,{slot:'e1',action:'remove'}),/bloqueada/);
  service.disconnect(guest);assert.equal(r.match.unit('e0').controller,'bot');service.resume(guest);assert.equal(r.match.unit('e0').controller,'human');
  r.match.unit('t0').alive=false;r.match.step(.05);r.state=r.match.state;service.returnToLobby(r,host);assert.equal(r.state,STATES.LOBBY);assert.equal(r.members.size,2);assert.ok([...r.members.values()].every(m=>!m.ready));for(const m of r.members.values())m.ready=true;service.start(r,host);assert.equal(r.match.time,0);
});
test('Modos Normal, Personalizado e Ranqueado são presets autoritativos',()=>{
  const service=new SessionService(),host=service.addClient('modes','Host');
  const room=service.create(host,{role:'troll',fillBots:true,settings:{mode:'normal',private:true,elfSlots:2,mapSize:'large',difficulty:'hard',preparation:20}});
  assert.equal(room.settings.mode,'normal');assert.equal(room.settings.elfSlots,5);assert.equal(room.settings.mapSize,'compact');assert.equal(room.settings.difficulty,'normal');assert.equal(room.settings.preparation,50);assert.equal(room.settings.private,true);
  service.configure(room,host,{mapSize:'large',elfSlots:2});assert.equal(room.settings.mapSize,'compact');assert.equal(room.settings.elfSlots,5);
  assert.throws(()=>service.changeSlot(room,host,{slot:'e0',action:'difficulty',difficulty:'hard'}),/fixa/);
  service.configure(room,host,{mode:'custom',mapSize:'large',elfSlots:2,difficulty:'hard',preparation:20});assert.equal(room.settings.mode,'custom');assert.equal(room.settings.mapSize,'large');assert.equal(room.settings.elfSlots,2);assert.equal(room.settings.difficulty,'hard');
  assert.throws(()=>service.configure(room,host,{mode:'ranked'}),/fila ranqueada/);
  const rankedHost=service.addClient('ranked-host','Ranked Host'),ranked=service.create(rankedHost,{role:'troll',matchmade:true,settings:{mode:'ranked',private:true,local:true,seed:'CHEAT'}});assert.equal(ranked.settings.mode,'ranked');assert.equal(ranked.settings.private,false);assert.equal(ranked.settings.local,false);assert.equal(ranked.settings.allowRoles,false);assert.match(ranked.settings.seed,/^RANK-[A-F0-9]{16}$/);assert.equal(service.publicRoom(ranked).mode,'ranked');assert.throws(()=>service.addBot(ranked,'e0'),/preenchimento de teste/);
});
test('Referência de sala expirada não impede criar ou entrar em outra partida',()=>{
  const service=new SessionService(),host=service.addClient('stale-host','Host'),guest=service.addClient('stale-guest','Guest');
  host.roomId='EXPIRADA';
  const room=service.create(host,{role:'troll',settings:{private:false}});
  assert.equal(host.roomId,room.id);
  guest.roomId='AUSENTE';service.join(guest,{code:room.id});assert.equal(guest.roomId,room.id);
  service.rooms.delete(room.id);service.disconnect(host,true);assert.equal(host.roomId,null);
});
