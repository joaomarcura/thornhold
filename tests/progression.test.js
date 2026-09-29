import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../shared/simulation.js';
import { BALANCE as B, STATES, distance, wispCost, wispIncome, structureHP, structureRewardHP, tierScale, combatTierScale, lateTierScale, wallTierScale, towerDamage, trollLateThreatIncome, trollLateThreatMultiplier, trollCost, upgradeCost, mineEconomy, resourceProducer, essenceIncome, repairPower } from '../shared/config.js';
import { combatStats, ITEMS, EQUIPMENT_SLOTS, ITEM_RARITIES, itemEffects, itemRarity, itemUpgradeCost } from '../shared/equipment.js';
import { jobRefund } from '../shared/jobs.js';
import { availableTrees } from '../shared/wisps.js';
import { siegeParity } from '../shared/siege-balance.js';
import { shopMarkup } from '../client/shop.js';
import { applySnapshotDelta, createSnapshotDelta } from '../shared/snapshot-delta.js';
import { chooseTechnology, technologyEffects } from '../shared/elf-progression.js';
import { epicProjectCostPlan, epicProjectEntries, epicProjectResourceNeed } from '../shared/elf-team-director.js';

function match(){return new Match({seed:'PROGRESSION'},[
  {id:'t',role:'troll',occupant:{type:'human',name:'Troll'}},
  {id:'e',role:'elf',occupant:{type:'human',name:'Elfo'}},
  {id:'ally',role:'elf',occupant:{type:'human',name:'Aliado'}}
]);}
function advance(m,seconds){for(let i=0;i<Math.ceil(seconds*20);i++)m.step(.05);}
test('Reparo percentual mantém o early e recebe retorno decrescente após tier 8',()=>{
  const tier8={kind:'wall',tier:8,maxHp:10000},tier9={...tier8,tier:9},tier16={...tier8,tier:16};
  assert.equal(repairPower(tier8),B.elf.repair+tier8.maxHp*B.elf.wallRepairRate);assert.ok(repairPower(tier9)<repairPower(tier8));assert.ok(repairPower(tier16)<repairPower(tier9));assert.ok(repairPower(tier16)>B.elf.repair);
});
function baseFixture(m){
  const e=m.unit('e'),b=m.map.bases[0];Object.assign(e,{x:b.x+4.4,z:b.z,gold:1000000,wood:1000000});
  assert.equal(m.act('e',{type:'build',kind:'core',x:b.x,z:b.z}),undefined);advance(m,5);
  const core=m.structures[0];Object.assign(e,{x:b.gate.x,z:b.gate.z});assert.equal(m.act('e',{type:'build',kind:'wall',x:b.gate.x,z:b.gate.z}),undefined);advance(m,4);Object.assign(e,{x:core.x+3,z:core.z});
  return {e,core,wall:m.structures.find(s=>s.kind==='wall'),b};
}
function arena(){
  const m=match(),t=m.unit('t'),e=m.unit('e');m.state=STATES.ACTIVE;m.time=80;
  Object.assign(e,{x:t.x,z:t.z+2,hp:10000,maxHp:10000});Object.assign(m.unit('ally'),m.map.bases[0]);t.yaw=0;
  return {m,t,e};
}
function ready(m,t){advance(m,Math.max(0,(t.cooldowns.attack||0)-m.time)+.05);}

test('Barricadas preservam o early game e limitam a curva tardia',()=>{
  assert.equal(B.structures.wall.hp,2541);assert.equal(structureHP('wall',1),2541);
  for(let tier=1;tier<=9;tier++)assert.equal(structureHP('wall',tier),2541*tierScale(B.structures.wall.growth,tier));
  for(let tier=2;tier<=B.maxTier;tier++)assert.ok(structureHP('wall',tier)>structureHP('wall',tier-1));
  assert.equal(structureHP('wall',10),2541*wallTierScale(10)*B.legendary.wallHealth);
  assert.ok(structureHP('wall',10)<structureHP('wall',9)*1.35);
  assert.ok(structureHP('wall',20)<150000);
});
test('Estruturas Épicas recebem um salto defensivo e ofensivo explícito',()=>{
  assert.ok(Math.abs(structureHP('wall',20)/structureRewardHP('wall',20)-B.legendary.wallHealth*B.epic.wallHealth)<1e-9);
  assert.ok(Math.abs(structureHP('tower',20)/structureRewardHP('tower',20)-B.epic.towerHealth)<1e-9);
  assert.ok(Math.abs(towerDamage(20)/(B.structures.tower.damage*combatTierScale(B.structures.tower.growth,20))-B.epic.towerDamage)<1e-9);
});
test('Nível 20 usa o mineral da especialização e conclui os seis marcos do Projeto Épico',()=>{
  const m=match(),{e,core,wall,b}=baseFixture(m);m.state=STATES.ACTIVE;Object.assign(e,{elfSpecialization:'fortress',gold:1e9,wood:1e9,x:core.x,z:core.z});e.specialResources.crystal=200;
  const make=(id,kind,tier=20)=>({id,kind,owner:e.id,baseId:b.id,x:core.x,z:core.z,tier,hp:10000,maxHp:10000,progress:1,upgrading:0,lastHit:-100,branch:'power'}),tower=make('project-tower','tower'),mine=make('project-mine','mine'),workshop=make('project-workshop','workshop'),bastion=make('project-bastion','bastion');Object.assign(core,{tier:19,hp:10000,maxHp:10000});Object.assign(wall,{tier:20,hp:10000,maxHp:10000});m.structures.push(tower,mine,workshop,bastion);m.elfEpicProject={coreId:core.id,wallId:wall.id,towerId:tower.id,mineId:mine.id,workshopId:workshop.id,signatureId:bastion.id,signatureKind:'bastion',resource:'crystal',ownerId:e.id,baseId:b.id,startedAt:m.time,designatedAt:m.time,resources:{gold:0,wood:0,essence:0,specialResources:{}}};
  const cost=upgradeCost(core,e.elfPath,e.elfSpecialization),before=e.specialResources.crystal;assert.equal(cost.essence,undefined);assert.equal(cost.specialResource,'crystal');assert.equal(cost.specialAmount,B.epic.resourceCost.core);assert.equal(m.act(e.id,{type:'upgrade',target:core.id}),undefined);assert.equal(e.specialResources.crystal,before-cost.specialAmount);advance(m,11);assert.equal(core.tier,20);assert.ok(m.elfEpicProject.completedAt);assert.equal(m.elfEpicProject.resources.specialResources.crystal,cost.specialAmount);
});
test('Projeto Épico reserva somente o próximo bloco executável',()=>{
  const m=match(),{e,core,wall,b}=baseFixture(m);Object.assign(e,{elfSpecialization:'fortress',x:core.x,z:core.z});core.tier=10;wall.tier=10;
  const make=(id,kind)=>({id,kind,owner:e.id,baseId:b.id,x:core.x,z:core.z,tier:20,hp:10000,maxHp:10000,progress:1,upgrading:0}),tower=make('reserve-tower','tower'),mine=make('reserve-mine','mine'),workshop=make('reserve-workshop','workshop'),bastion=make('reserve-bastion','bastion');core.tier=19;wall.tier=20;m.structures.push(tower,mine,workshop,bastion);
  m.elfEpicProject={coreId:core.id,wallId:wall.id,towerId:tower.id,mineId:mine.id,workshopId:workshop.id,signatureId:bastion.id,signatureKind:'bastion',resource:'crystal',ownerId:e.id,baseId:b.id,startedAt:m.time,resources:{gold:0,wood:0,essence:0,specialResources:{}}};
  const expected=B.epic.resourceCost.core,plan=epicProjectCostPlan(m,m.elfEpicProject);
  assert.equal(plan.targetId,core.id);assert.equal(plan.fromTier,19);assert.equal(plan.toTier,20);assert.equal(plan.levels,1);
  assert.equal(epicProjectResourceNeed(m,m.elfEpicProject),expected);e.specialResources.crystal=expected+29;
  assert.match(chooseTechnology(m,e,'efficient-production'),/reservado para o Projeto Épico/);e.specialResources.crystal++;
  assert.equal(chooseTechnology(m,e,'efficient-production'),null);assert.equal(e.specialResources.crystal,expected);
});
test('Projeto Épico calcula a reserva restante de ouro, madeira, essência e mineral',()=>{
  const m=match(),{e,core,wall,b}=baseFixture(m);Object.assign(e,{elfSpecialization:'fortress',elfPath:'defense'});core.tier=9;wall.tier=10;
  const make=(id,kind,tier)=>({id,kind,owner:e.id,baseId:b.id,x:core.x,z:core.z,tier,hp:10000,maxHp:10000,progress:1,upgrading:0}),tower=make('plan-tower','tower',9),mine=make('plan-mine','mine',9),workshop=make('plan-workshop','workshop',9),bastion=make('plan-bastion','bastion',9);m.structures.push(tower,mine,workshop,bastion);
  const project={coreId:core.id,wallId:wall.id,towerId:tower.id,mineId:mine.id,workshopId:workshop.id,signatureId:bastion.id,signatureKind:'bastion',resource:'crystal',ownerId:e.id,baseId:b.id};
  const plan=epicProjectCostPlan(m,project);assert.ok(plan.gold>0);assert.ok(plan.wood>0);assert.ok(plan.essence>0);assert.equal(plan.specialResource,'crystal');assert.equal(plan.specialAmount,epicProjectResourceNeed(m,project));assert.equal(plan.targetId,core.id);assert.equal(plan.levels,2);assert.equal(plan.toTier,11);
});
test('Nova especialização atualiza Projeto Épico e Wisp especial atomicamente',()=>{
  const m=match(),{e,core,wall,b}=baseFixture(m);core.tier=10;wall.tier=10;Object.assign(e,{elfSpecialization:null,previousElfSpecialization:'fortress',specializationReselectionPending:true,x:core.x,z:core.z});
  const make=(id,kind)=>({id,kind,owner:e.id,baseId:b.id,x:core.x,z:core.z,tier:10,hp:10000,maxHp:10000,progress:1,upgrading:0,epicProject:true}),tower=make('sync-tower','tower'),mine=make('sync-mine','mine'),workshop=make('sync-workshop','workshop'),oldSignature=make('sync-bastion','bastion');m.structures.push(tower,mine,workshop,oldSignature);
  const crystalNode=m.specialNodes.find(node=>node.resource==='crystal'),wisp={id:'sync-wisp',owner:e.id,alive:true,specialResource:'crystal',specialNodeId:crystalNode?.id||'old-crystal'};m.wisps.push(wisp);
  m.elfEpicProject={coreId:core.id,wallId:wall.id,towerId:tower.id,mineId:mine.id,workshopId:workshop.id,signatureId:oldSignature.id,signatureKind:'bastion',resource:'crystal',ownerId:e.id,baseId:b.id,startedAt:m.time,resources:{gold:0,wood:0,essence:0,specialResources:{}}};
  assert.equal(m.act(e.id,{type:'chooseElfSpecialization',key:'industrial'}),null);assert.equal(m.elfEpicProject.signatureKind,null);assert.equal(m.elfEpicProject.signatureId,null);assert.equal(m.elfEpicProject.resource,'ancientWood');assert.equal(m.elfEpicProject.recoveringKind,null);assert.equal(m.elfEpicProject.resourcePlan.resource,'ancientWood');assert.equal(wisp.specialResource,'ancientWood');assert.equal(m.specialNodes.find(node=>node.id===wisp.specialNodeId)?.resource,'ancientWood');assert.equal(oldSignature.epicProject,false);assert.equal(epicProjectEntries(m.elfEpicProject).length,4);
});
test('Concentração do Projeto Épico reduz somente o custo de seus marcos até o nível 20',()=>{
  const ordinary={kind:'core',tier:14},focused={...ordinary,epicProject:true},normal=upgradeCost(ordinary,'defense','industrial'),project=upgradeCost(focused,'defense','industrial');
  assert.equal(project.gold,Math.round(normal.gold*B.epic.projectCostMultiplier));assert.equal(project.wood,Math.round(normal.wood*B.epic.projectCostMultiplier));focused.tier=20;ordinary.tier=20;assert.deepEqual(upgradeCost(focused,'defense','industrial'),upgradeCost(ordinary,'defense','industrial'));
});
test('V3.3 preserva níveis 1–9 e suaviza combate e fortificações após o Lendário',()=>{
  for(let tier=1;tier<=9;tier++)assert.equal(combatTierScale(B.structures.tower.growth,tier),tierScale(B.structures.tower.growth,tier));
  assert.ok(towerDamage(10)/towerDamage(9)<=1.071);
  assert.ok(structureHP('tower',10)/structureHP('tower',9)<=1.071);
  const normalTier9=towerDamage(9)*B.tower.standard.damage/B.structures.tower.interval;
  assert.ok(B.legendary.towerDps/normalTier9<1.5);
  assert.ok(B.legendary.towerDps*B.legendary.maxRamp/normalTier9<4);
});
test('Economia tardia desacelera sem alterar os níveis 1–9',()=>{
  const core=tier=>resourceProducer({kind:'core',tier}).amount,mine=tier=>resourceProducer({kind:'mine',tier,coreTier:5}).amount,wisp=level=>wispIncome({level,rich:false});
  for(let tier=1;tier<=9;tier++){
    assert.equal(core(tier),B.structures.core.income*tierScale(B.structures.core.growth,tier));
    assert.equal(mine(tier),B.structures.mine.income*tierScale(B.structures.mine.growth,tier)*mineEconomy(5).productionFactor);
    assert.equal(wisp(tier),B.wisps.income*Math.pow(B.wisps.incomeGrowth,tier-1));
  }
  assert.equal(lateTierScale(B.structures.core.growth,9),tierScale(B.structures.core.growth,9));
  assert.ok(core(20)<80);assert.ok(mine(20)<105);assert.ok(mine(20)/mine(19)>B.epic.mineProduction);assert.ok(wisp(20)<25);
  assert.ok(core(20)>core(10));assert.ok(mine(20)>mine(10));assert.ok(wisp(20)>wisp(10));
});
test('Curva econômica B25 torna o projeto nível 20 financiável sem baratear o early game',()=>{
  const kinds=['core','wall','tower','mine','workshop'],remaining=kinds.reduce((total,kind)=>total+Array.from({length:20-14},(_,i)=>upgradeCost({kind,tier:14+i},null,'industrial').gold).reduce((a,b)=>a+b,0),0);
  assert.equal(B.progression.lateStructureCostGrowth,1.14);assert.equal(B.progression.lateStructureWoodCostGrowth,1.14);assert.ok(remaining<340000,`reserva tardia ainda inviável: ${remaining}`);assert.deepEqual(upgradeCost({kind:'core',tier:8}),{gold:2278,wood:288});
});
test('Renda de ameaça do Troll cresce somente no late game',()=>{
  assert.equal(trollLateThreatIncome(899,439,1),null);assert.equal(trollLateThreatIncome(900,439,0),null);
  assert.equal(trollLateThreatIncome(900,0,1),16);
  const raw=B.economy.trollLateThreatBase+B.economy.trollLateThreatLogScale*Math.log1p(439/B.economy.trollLateThreatReference)+B.economy.trollLateThreatMatureBase+3*B.economy.trollLateThreatLegendary;
  const expected=raw<=B.economy.trollLateThreatSoftCap?raw:B.economy.trollLateThreatSoftCap+(raw-B.economy.trollLateThreatSoftCap)*B.economy.trollLateThreatOverflowRate;
  assert.ok(Math.abs(trollLateThreatIncome(900,439,1,3)-expected)<1e-9);assert.equal(trollLateThreatIncome(900,100000,5,20),B.economy.trollLateThreatCap);
  assert.equal(trollLateThreatMultiplier(15),1);assert.ok(trollLateThreatIncome(900,439,1,3,20)<expected);assert.ok(trollLateThreatIncome(900,439,1,3,20)>=expected*B.economy.trollLateThreatMinimum);
});
test('Pressão de Cerco foi removida sem alterar reparo ou Siege Parity',()=>{
  const m=match(),e=m.unit('e'),wall={id:'plain-wall',kind:'wall',owner:e.id,baseId:m.map.bases[0].id,x:e.x,z:e.z,hp:10000,maxHp:20000,tier:B.legendary.tier,legendary:true,progress:1,lastHit:-100};m.state=STATES.ACTIVE;m.time=m.preparation+1800;m.structures.push(wall);Object.assign(e,{x:wall.x,z:wall.z});
  assert.equal(B.breachMomentum,undefined);assert.equal(m.addBreachMomentum,undefined);const before=wall.hp,expected=repairPower(wall);m.act(e.id,{type:'repair',target:wall.id});assert.ok(Math.abs((wall.hp-before)-expected)<.01);
  const visible=m.snapshot(e.id).structures.find(row=>row.id===wall.id);assert.equal('breachStacks' in visible,false);assert.equal(visible.effects.some(effect=>effect.id==='breach-pressure'),false);
});
test('Siege Parity cai com torres e reparo e mede uma fortaleza real',()=>{
  const m=match(),t=m.unit('t'),e=m.unit('e'),base=m.map.bases[0];m.state=STATES.ACTIVE;Object.assign(t.levels,{damage:10,speed:10,health:10,armor:10,regen:10,movement:10,siege:10,utility:10});t.maxHp=m.trollStats(t).maxHp;t.hp=t.maxHp;e.elfPath='defense';
  const wall={id:'parity-wall',kind:'wall',owner:e.id,baseId:base.id,x:base.gate.x,z:base.gate.z,hp:structureHP('wall',10)*1.15,maxHp:structureHP('wall',10)*1.15,tier:10,legendary:true,progress:1},tower=id=>({id,kind:'tower',owner:e.id,baseId:base.id,x:base.x,z:base.z,hp:1000,maxHp:1000,tier:10,legendary:true,branch:'power',progress:1}),workshop={id:'parity-workshop',kind:'workshop',owner:e.id,baseId:base.id,x:base.x,z:base.z,hp:1000,maxHp:1000,tier:10,progress:1};m.structures.push(wall,workshop,tower('tower-a'),tower('tower-b'));
  const none=siegeParity(m,t,wall,{towers:[],assumeRepair:false}),one=siegeParity(m,t,wall,{towers:[m.entity('tower-a')],assumeRepair:false}),two=siegeParity(m,t,wall,{towers:[m.entity('tower-a'),m.entity('tower-b')],assumeRepair:true});
  assert.ok(none.parity>one.parity);assert.ok(one.parity>two.parity);assert.ok(two.breakSeconds>one.breakSeconds);assert.equal(two.towerCount,2);
});
test('Recompensa escalável fica restrita ao Lendário ou ao período após 15 minutos',()=>{
  const m=match(),t=m.unit('t'),before=t.stats.goldFromDamage,multiplier=m.trollStats(t).objectiveGold;m.objectiveReward(t,{id:'cheap',kind:'wall',tier:1,x:0,z:0,investmentCost:{gold:50000,wood:12000,essence:30}});const cheap=t.stats.goldFromObjectives;
  assert.ok(Math.abs(cheap-B.economy.trollObjective.wall*multiplier)<1e-9,'estrutura comum não escala no early/mid game');
  m.objectiveReward(t,{id:'fortress',kind:'wall',tier:15,legendary:true,x:0,z:0,investmentCost:{gold:50000,wood:12000,essence:30}});const fortress=t.stats.goldFromObjectives-cheap;
  m.time=m.preparation+B.economy.trollLateThreatStart;const beforeLate=t.stats.goldFromObjectives;m.objectiveReward(t,{id:'late-mine',kind:'mine',tier:2,x:0,z:0,investmentCost:{gold:1000,wood:500}});const late=t.stats.goldFromObjectives-beforeLate;
  m.settings.objectiveScalingMode='legendary';const beforeAblation=t.stats.goldFromObjectives;m.objectiveReward(t,{id:'legendary-only-mine',kind:'mine',tier:2,x:0,z:0,investmentCost:{gold:1000,wood:500}});const legendaryOnly=t.stats.goldFromObjectives-beforeAblation;
  assert.ok(fortress>cheap*20);assert.ok(late>B.economy.trollObjective.mine*multiplier);assert.ok(Math.abs(legendaryOnly-B.economy.trollObjective.mine*multiplier)<1e-9);assert.equal(t.stats.goldFromDamage,before);
});

test('Retorno decrescente de objetivo preserva recompensa-base e reduz apenas investimento escalável',()=>{
  const m=match(),t=m.unit('t'),target={id:'late-fortress',kind:'wall',tier:15,legendary:true,x:0,z:0,investmentCost:{gold:50000,wood:12000,essence:30}};
  t.trollLevel=9;m.objectiveReward(t,target);const full=t.stats.goldFromObjectives,fullGross=t.stats.goldFromObjectiveScalingGross;
  const reduced=match(),rt=reduced.unit('t');rt.trollLevel=10;reduced.objectiveReward(rt,target);const flat=(B.economy.trollObjective.wall+B.economy.trollObjective.legendary)*(reduced.trollStats(rt).objectiveGold||1);
  assert.ok(rt.stats.goldFromObjectives<full);assert.ok(rt.stats.goldFromObjectives>=flat);assert.equal(rt.stats.goldFromObjectiveScalingGross,fullGross);assert.ok(rt.stats.goldFromObjectiveScalingDiminished>0);
});

test('Melhorias são compromissos; apenas obra e formação podem ser canceladas',()=>{
  const m=match(),{e,core}=baseFixture(m),upgradePrice=upgradeCost(core);m.act('e',{type:'upgrade',target:core.id});advance(m,1);
  const refund=jobRefund(core,m.time),gold=e.gold,wood=e.wood,hp=core.hp;
  assert.equal(refund,null);
  assert.match(m.act('e',{type:'cancelJob',target:core.id}),/não podem/);
  assert.equal(e.gold,gold);assert.equal(e.wood,wood);assert.ok(core.upgrading>0);assert.equal(core.hp,hp);
  advance(m,5);assert.equal(core.tier,2);
  m.act('e',{type:'trainWisp',target:core.id});const w=m.wisps[0];advance(m,1);const before=e.gold,cost=jobRefund(w,m.time);
  m.act('e',{type:'cancelJob',target:w.id});assert.equal(w.alive,false);assert.equal(e.gold,before+cost.gold);advance(m,7);assert.equal(m.snapshot('e').wisps.length,0);
  m.act('e',{type:'trainWisp',target:core.id});advance(m,7);const worker=m.wisps[1];m.act('e',{type:'upgradeWisp',target:worker.id});advance(m,1);assert.match(m.act('e',{type:'cancelJob',target:worker.id}),/não podem/);advance(m,5);assert.equal(worker.level,2);assert.ok(m.snapshot('e').wisps[0].income>0);
});

test('Núcleo 5 oferece especialização e mantém a Refinaria aposentada',()=>{
  const m=match(),{e,core,b}=baseFixture(m);core.tier=5;core.maxHp=structureHP('core',5);core.hp=core.maxHp;Object.assign(e,{x:core.x+2,z:core.z});
  assert.equal(m.act(e.id,{type:'chooseElfSpecialization',key:'industrial'}),null);assert.equal(e.elfSpecialization,'industrial');
  assert.match(m.act(e.id,{type:'chooseElfSpecialization',key:'fortress'}),/permanece até/);
  const spot={x:b.x+4,z:b.z+4};assert.equal(m.placement(e,'refinery',spot.x,spot.z),'Construção indisponível.');assert.equal(m.placement(e,'bastion',spot.x,spot.z),'Esta construção pertence a outra especialização.');
  assert.equal(m.act(e.id,{type:'build',kind:'refinery',...spot}),'Construção indisponível.');assert.equal(m.structures.some(s=>s.kind==='refinery'),false);
});

test('Núcleos 8, 12 e 16 oferecem uma carta tecnológica paga pelo recurso da especialização',()=>{
  const m=match(),{e,core}=baseFixture(m);core.tier=8;Object.assign(e,{x:core.x+2,z:core.z});assert.equal(m.act(e.id,{type:'chooseElfSpecialization',key:'industrial'}),null);
  e.specialResources.ancientWood=160;assert.equal(m.act(e.id,{type:'chooseElfTechnology',key:'efficient-production'}),null);assert.equal(e.specialResources.ancientWood,130);assert.deepEqual(e.elfTechCards,['efficient-production']);assert.equal(technologyEffects(e).production,.08);
  assert.match(m.act(e.id,{type:'chooseElfTechnology',key:'wisp-network'}),/Nenhuma tecnologia/);
  core.tier=12;assert.equal(m.act(e.id,{type:'chooseElfTechnology',key:'external-logistics'}),null);assert.equal(e.specialResources.ancientWood,80);assert.equal(technologyEffects(e).specialWisp,.25);
  core.tier=16;assert.equal(m.act(e.id,{type:'chooseElfTechnology',key:'perfect-synchrony'}),null);assert.equal(e.specialResources.ancientWood,0);assert.equal(e.stats.technologyCards,3);assert.equal(m.snapshot(e.id).units.find(u=>u.id===e.id).elfTechCards.length,3);
});

test('Recursos especiais são finitos, entram direto na reserva e Wisp migra do depósito local esgotado',()=>{
  const m=match(),{e,core,b}=baseFixture(m),node=m.specialNodes.find(n=>n.baseId===b.id);Object.assign(e,{x:node.x,z:node.z});
  const before=node.amount;assert.equal(m.act(e.id,{type:'gatherSpecial',target:node.id}),undefined);assert.equal(node.amount,before-B.elfProgression.specialGather);assert.equal(e.specialResources[node.resource],B.elfProgression.specialGather);
  Object.assign(e,{x:core.x+2,z:core.z});assert.equal(m.act(e.id,{type:'trainSpecialWisp',target:node.id}),undefined);advance(m,7);const w=m.wisps.find(w=>w.specialNodeId===node.id);assert.ok(w?.alive);
  node.amount=.01;advance(m,1);assert.notEqual(w.specialNodeId,node.id);assert.equal(m.specialNodes.find(n=>n.id===w.specialNodeId).local,false);assert.ok(e.specialResources[node.resource]>B.elfProgression.specialGather);
});

test('Habilidade de Fortaleza exige Bastião, usa cooldown e reduz dano recebido',()=>{
  const m=match(),{e,core,wall,b}=baseFixture(m);core.tier=5;core.maxHp=structureHP('core',5);core.hp=core.maxHp;Object.assign(e,{x:core.x+2,z:core.z});m.act(e.id,{type:'chooseElfSpecialization',key:'fortress'});
  const spots=[];for(let z=-6;z<=6;z+=2)for(let x=-6;x<=6;x+=2)spots.push({x:b.x+x,z:b.z+z});const p=spots.find(p=>m.placement(e,'bastion',p.x,p.z)===null);assert.ok(p);m.act(e.id,{type:'build',kind:'bastion',...p});Object.assign(e,p);advance(m,7);
  assert.equal(m.act(e.id,{type:'elfSpecializationAbility'}),null);const hp=wall.hp;m.damage(wall,100,m.unit('t'),'melee');assert.equal(wall.hp,hp-75);assert.match(m.act(e.id,{type:'elfSpecializationAbility'}),/recarregando/);
});

test('Upgrade All evolui cada Wisp elegível exatamente uma vez',()=>{
  const m=match(),{e,core}=baseFixture(m);Object.assign(e,{gold:100000,wood:100000,x:core.x+2,z:core.z});
  assert.equal(m.act(e.id,{type:'trainWisp',target:core.id}),undefined);advance(m,7);
  assert.equal(m.act(e.id,{type:'trainWisp',target:core.id}),undefined);advance(m,7);
  const before=m.wisps.map(w=>w.level);assert.equal(m.act(e.id,{type:'upgradeAllWisps',target:core.id}),undefined);
  assert.ok(m.wisps.every(w=>w.job?.type==='wisp-upgrade'));assert.match(m.act(e.id,{type:'upgradeAllWisps',target:core.id}),/Nenhum Wisp/);
  advance(m,5);assert.deepEqual(m.wisps.map(w=>w.level),before.map(level=>level+1));
});

test('Cura do Troll usa cargas, persiste sob dano e recarrega lentamente',()=>{
  const m=match(),t=m.unit('t');m.state=STATES.ACTIVE;m.time=80;t.hp=t.maxHp*.4;t.lastHit=m.time;
  assert.equal(m.act(t.id,{type:'heal'}),undefined);assert.equal(t.healCharges,1);advance(m,3);m.damage(t,20,m.unit('e'),'tower','test-tower');advance(m,3.1);
  assert.ok(Math.abs(m.telemetry.healing.consumable-t.maxHp*B.troll.healPercent)<2);assert.equal(B.troll.healPercent,.16);assert.equal(m.telemetry.healing.uses,1);assert.equal(t.healingUntil,0);
  m.time=t.healRechargeAt; m.step(.05);assert.equal(t.healCharges,2);
});

test('Melhorias fundamentais do Troll entregam poder relevante nos níveis 1–4',()=>{
  const t=match().unit('t');Object.assign(t.levels,{damage:4,speed:4,health:4,armor:4,siege:4});const stats=combatStats(t);
  const damageGrowth=1+(B.troll.damageGrowth-1)*B.troll.damageUpgradeScale;assert.ok(Math.abs(stats.damage-B.troll.damage*damageGrowth**4)<1e-9);
  assert.ok(Math.abs(stats.interval-B.troll.interval*.87**4)<1e-9);
  assert.equal(stats.maxHp,B.troll.hp+4*B.troll.healthPerLevel);
  assert.equal(stats.armor,B.troll.armor+4*B.troll.armorPerLevel);
  assert.equal(stats.siege,1+4*B.troll.siegeFoundationPerLevel);
});

test('Cerco preserva níveis 1–8 e recebe retorno decrescente depois deles',()=>{
  const t=match().unit('t');
  t.levels.siege=8;const level8=combatStats(t).siege;
  t.levels.siege=9;const level9=combatStats(t).siege;
  t.levels.siege=12;const level12=combatStats(t).siege;
  assert.equal(level8,1+4*B.troll.siegeFoundationPerLevel+4*B.troll.siegePerLevel);
  assert.ok(Math.abs(level9-level8-B.troll.siegeDiminishingPerLevel)<1e-12);
  assert.ok(Math.abs(level12-(level8+4*B.troll.siegeDiminishingPerLevel))<1e-12);
  assert.ok(level12<1+4*B.troll.siegeFoundationPerLevel+8*B.troll.siegePerLevel);
});

test('Bônus final de cerco exige 12 minutos ativos e no máximo dois Elfos vivos',()=>{
  const m=match(),t=m.unit('t'),target={kind:'wall'};t.levels.siege=3;m.state=STATES.ACTIVE;
  m.time=m.preparation+B.troll.finalSiegeUnlockSeconds-0.01;assert.equal(m.finalSiegeMultiplier(t,target),1);
  m.time=m.preparation+B.troll.finalSiegeUnlockSeconds;m.units.push({id:'third-elf',role:'elf',alive:true});assert.equal(m.finalSiegeMultiplier(t,target),1);
  m.units.at(-1).alive=false;assert.equal(m.finalSiegeMultiplier(t,target),B.troll.finalSiege);
  assert.equal(m.finalSiegeMultiplier(t,{role:'elf'}),1);
});

test('XP por dano estrutural diminui após nível 10 sem reduzir XP contra Elfos',()=>{
  const m=match(),t=m.unit('t'),elf=m.unit('e'),structure={id:'xp-wall',kind:'wall',owner:elf.id,baseId:'xp-base',x:t.x,z:t.z+2,hp:1000,maxHp:1000,tier:1,progress:1,bounty:1000,lastHit:-100};m.state=STATES.ACTIVE;m.structures.push(structure);
  t.trollLevel=10;const start=t.stats.xpEarned;m.damage(structure,100,t,'melee');const level10=t.stats.xpEarned-start;assert.equal(level10,18);
  t.trollLevel=11;const diminishedStart=t.stats.xpEarned;m.damage(structure,100,t,'melee');const level11=t.stats.xpEarned-diminishedStart;assert.ok(level11<18&&level11>=18*B.troll.structureXpMinimum);
  Object.assign(elf,{hp:1000,maxHp:1000});const unitStart=t.stats.xpEarned;m.damage(elf,100,t,'melee');assert.equal(t.stats.xpEarned-unitStart,18);
  assert.equal(t.stats.xpFromStructureDamageGross,36);assert.ok(t.stats.xpFromStructureDamageDiminished>0);assert.equal(t.stats.xpFromUnitDamage,18);
});

test('Regeneração base e cada nível de Vigor usam a curva reforçada',()=>{
  const m=match(),t=m.unit('t'),base=combatStats(t);assert.equal(base.combatRegen,.0012);assert.equal(base.restRegen,.0036);
  t.levels.regen=1;const upgraded=combatStats(t);assert.ok(Math.abs(upgraded.combatRegen-base.combatRegen-.00075)<1e-12);assert.ok(Math.abs(upgraded.restRegen-base.restRegen-.0015)<1e-12);
});

test('Escada de dano reduz somente os ganhos por nível em 12%',()=>{
  const m=match(),t=m.unit('t'),base=combatStats(t);assert.equal(base.damage,B.troll.damage);
  t.levels.damage=1;const levelOne=combatStats(t),expected=B.troll.damage*(1+(B.troll.damageGrowth-1)*.88);assert.ok(Math.abs(levelOne.damage-expected)<1e-9);assert.ok(levelOne.damage<B.troll.damage*B.troll.damageGrowth);
});

test('Fogo de torre reduz somente a regeneração de combate do Troll',()=>{
  const setup=()=>{const m=match(),t=m.unit('t');m.state=STATES.ACTIVE;m.time=80;t.hp=t.maxHp*.5;t.lastHit=m.time;return {m,t};};
  const pressured=setup();pressured.t.lastTowerHit=pressured.m.time;const pressuredHp=pressured.t.hp;pressured.m.step(.05);const pressuredHeal=pressured.t.hp-pressuredHp;
  const normal=setup(),normalHp=normal.t.hp;normal.m.step(.05);const normalHeal=normal.t.hp-normalHp;
  assert.ok(normalHeal>0);assert.ok(Math.abs(pressuredHeal/normalHeal-B.troll.towerCombatRegenMultiplier)<1e-9);
  assert.ok(pressured.m.telemetry.healing.combatRegen>0);assert.equal(pressured.m.telemetry.healing.restRegen,0);assert.ok(pressured.m.telemetry.healing.towerSuppressed>0);
  pressured.t.lastHit=pressured.m.time-10;pressured.t.lastTowerHit=-100;pressured.m.step(.05);assert.ok(pressured.m.telemetry.healing.restRegen>0);
});

test('Torres Lendárias concentradas suprimem sustain em 45% e 68% por dez segundos',()=>{
  const m=match(),t=m.unit('t');m.state=STATES.ACTIVE;m.time=100;
  const tower=i=>({id:`legendary-${i}`,kind:'tower',owner:'e',x:t.x,z:t.z+5,tier:10,hp:1000,maxHp:1000,progress:1,legendary:true,beamTarget:t.id,disabledUntil:0});
  m.structures.push(tower(1));assert.deepEqual(m.legendarySustainPressure(t),{towers:1,multiplier:1});
  m.structures.push(tower(2));assert.deepEqual(m.legendarySustainPressure(t),{towers:2,multiplier:.55});
  m.structures.push(tower(3));assert.deepEqual(m.legendarySustainPressure(t),{towers:3,multiplier:.32});
  m.structures[1].disabledUntil=m.time+1;assert.deepEqual(m.legendarySustainPressure(t),{towers:2,multiplier:.55});
  for(const structure of m.structures){structure.beamTarget=null;structure.lastLegendaryHitAt=m.time;}
  assert.deepEqual(m.legendarySustainPressure(t),{towers:3,multiplier:.32},'a pressão persiste após o Troll sair do feixe');
  t.x+=20;t.hp=t.maxHp*.5;t.lastHit=m.time-20;const before=t.hp,restRate=combatStats(t).restRegen;m.step(.05);assert.ok(Math.abs((t.hp-before)-t.maxHp*restRate*.32*.05)<1e-8,'a memória também reduz regeneração passiva fora de combate');
  m.time+=B.legendary.sustainPressureMemory+.01;assert.deepEqual(m.legendarySustainPressure(t),{towers:0,multiplier:1});
});

test('Barricada se recompõe levemente somente fora de cerco',()=>{
  const m=match(),t=m.unit('t'),{wall}=baseFixture(m);m.state=STATES.ACTIVE;m.time=100;wall.hp=wall.maxHp*.5;wall.lastHit=m.time;
  const damaged=wall.hp;advance(m,B.wallRecovery.delay-.1);assert.equal(wall.hp,damaged,'não regenera durante a janela de dano');
  Object.assign(t,{x:wall.x+2,z:wall.z});m.time=wall.lastHit+B.wallRecovery.delay+.1;const before=wall.hp;m.step(.05);const expected=wall.maxHp*B.wallRecovery.rate*.05;
  assert.ok(Math.abs((wall.hp-before)-expected)<1e-8);assert.equal(wall.passiveRegenerating,true);assert.ok(m.stats.wallRegeneration>0);assert.ok(m.snapshot('e').structures.find(s=>s.id===wall.id).effects.some(effect=>effect.id==='wall-recovery'));
  m.damage(wall,1,t,'melee');const hitHp=wall.hp;m.step(.05);assert.equal(wall.hp,hitHp,'novo ataque reinicia a supressão');
});

test('Santuário do Troll acelera cura somente fora de combate e dentro da base',()=>{
  const m=match(),t=m.unit('t');m.state=STATES.ACTIVE;m.time=80;t.hp=t.maxHp*.4;t.lastHit=70;Object.assign(t,m.map.trollSpawn);
  const before=t.hp;advance(m,1);assert.ok(t.hp-before>t.maxHp*B.troll.sanctuaryRegenRate*.95);assert.ok(m.telemetry.healing.sanctuary>0);assert.ok(m.snapshot(t.id).units.find(u=>u.id===t.id).effects.some(e=>e.id==='sanctuary'));
  const sanctuary=m.telemetry.healing.sanctuary;Object.assign(t,{x:m.map.trollSpawn.x+B.troll.sanctuaryRadius+3,z:m.map.trollSpawn.z});advance(m,1);assert.equal(m.telemetry.healing.sanctuary,sanctuary);
  Object.assign(t,m.map.trollSpawn);t.lastHit=m.time;advance(m,1);assert.equal(m.telemetry.healing.sanctuary,sanctuary);
});

test('Âmbar vampírico rouba vida de unidades e estruturas com teto próprio',()=>{
  const unitArena=arena(),{m,t,e}=unitArena;t.inventory.push('amber');t.equipment.helmet='amber';t.hp=t.maxHp*.5;
  const stats=m.trollStats(t);assert.equal(stats.drain,.08);assert.equal(stats.drainCap,.02);
  const targetHp=e.hp,trollHp=t.hp;t.pendingStrike={heavy:false,yaw:0,at:m.time};m.resolveStrike(t);const unitDamage=targetHp-e.hp;
  assert.ok(Math.abs((t.hp-trollHp)-Math.min(t.maxHp*.02,unitDamage*.08))<1e-9);

  const structureArena=arena(),sm=structureArena.m,st=structureArena.t;st.inventory.push('amber');st.equipment.helmet='amber';st.hp=st.maxHp*.5;
  Object.assign(structureArena.e,{x:st.x+100,z:st.z+100});
  const wall={id:'drain-wall',kind:'wall',owner:'e',baseId:'drain-base',x:st.x,z:st.z+2,hp:10000,maxHp:10000,tier:1,progress:1,lastHit:-100};sm.structures.push(wall);
  const wallHp=wall.hp,structureTrollHp=st.hp;st.pendingStrike={heavy:false,yaw:0,at:sm.time};sm.resolveStrike(st);const structureDamage=wallHp-wall.hp;
  assert.ok(Math.abs((st.hp-structureTrollHp)-Math.min(st.maxHp*.01,structureDamage*.015))<1e-9);
});

test('Retorno do Troll fica disponível desde o início, pode ser interrompido e concede ímpeto ao sair',()=>{
  const m=match(),t=m.unit('t'),elf=m.unit('e');m.state=STATES.ACTIVE;m.time=m.preparation;Object.assign(t,{x:m.map.trollSpawn.x+35,z:m.map.trollSpawn.z,hp:t.maxHp*.4});
  assert.equal(m.act(t.id,{type:'trollRecall'}),undefined);assert.equal(t.recallUntil,m.time+B.troll.recallChannel);
  m.damage(t,1,elf,'tower','interrupt');assert.equal(t.recallUntil,0);assert.equal(t.stats.recalls,0);
  assert.equal(m.act(t.id,{type:'trollRecall'}),undefined);advance(m,B.troll.recallChannel+.1);assert.ok(distance(t,m.map.trollSpawn)<.01);assert.equal(t.stats.recalls,1);assert.ok(t.cooldowns.recall-m.time>B.troll.recallCooldown-.2&&t.cooldowns.recall-m.time<=B.troll.recallCooldown);
  Object.assign(t,{x:m.map.trollSpawn.x+B.troll.sanctuaryRadius+1,z:m.map.trollSpawn.z,input:{x:1,z:0,sprint:true}});m.movement(t,.05);assert.ok(t.recallSpeedUntil>m.time);assert.ok(m.snapshot(t.id).units.find(u=>u.id===t.id).effects.some(e=>e.id==='recall-speed'));
});

test('Forja Ancestral é física e o servidor bloqueia compras remotas',()=>{
  const m=match(),t=m.unit('t');m.state=STATES.ACTIVE;m.time=m.preparation;t.gold=2000;
  Object.assign(t,{x:m.map.trollSpawn.x+30,z:m.map.trollSpawn.z});
  assert.equal(m.snapshot(t.id).trollShop.available,false);
  assert.match(m.act(t.id,{type:'buy',key:'damage'}),/Forja/);
  assert.match(m.act(t.id,{type:'buyItem',item:'maul'}),/Forja/);
  Object.assign(t,m.map.trollShop);const before=t.gold;
  assert.equal(m.snapshot(t.id).trollShop.available,true);
  assert.equal(m.act(t.id,{type:'buy',key:'damage'}),undefined);assert.equal(t.gold,before-trollCost('damage',0));
  assert.equal(m.act(t.id,{type:'buyItem',item:'maul'}),undefined);assert.equal(t.equipment.weapon,'maul');
});

test('Loja possui quatro categorias, três itens por categoria e nenhum item reduz atributos',()=>{
  assert.deepEqual(Object.keys(EQUIPMENT_SLOTS),['weapon','helmet','armor','boots']);
  for(const slot of Object.keys(EQUIPMENT_SLOTS))assert.equal(Object.values(ITEMS).filter(item=>item.slot===slot).length,3,`${slot} deve oferecer três itens`);
  const m=match(),t=m.unit('t'),baseline=combatStats(t),lowerIsBetter=new Set(['interval','regenDelay','dashCooldown']);
  const metrics=['damage','interval','armor','combatRegen','restRegen','regenDelay','siege','movement','maxHp','range','heavy','dashCooldown','roarDuration','opening','drain','structureDrain'];
  for(const [id,item] of Object.entries(ITEMS))for(let level=1;level<=ITEM_RARITIES.length;level++){
    const equipped={weapon:null,helmet:null,armor:null,boots:null,[item.slot]:id},stats=combatStats({...t,equipment:equipped,itemLevels:{[id]:level}});let improved=false;
    for(const metric of metrics){const good=lowerIsBetter.has(metric)?stats[metric]<=baseline[metric]:stats[metric]>=baseline[metric];assert.ok(good,`${id} ${itemRarity(level).name} não pode piorar ${metric}: ${baseline[metric]} → ${stats[metric]}`);if(stats[metric]!==baseline[metric])improved=true;}
    assert.ok(improved,`${id} ${itemRarity(level).name} precisa conceder ao menos um bônus real`);
  }
});

test('Inventário expõe atributos reais e identifica claramente o loadout equipado',()=>{
  const m=match(),t=m.unit('t');m.state=STATES.ACTIVE;m.time=m.preparation;Object.assign(t,m.map.trollShop);t.gold=5000;
  assert.equal(m.act(t.id,{type:'buyItem',item:'amber'}),undefined);
  const unit=m.snapshot(t.id).units.find(u=>u.id===t.id),effects=itemEffects('amber',1),markup=shopMarkup(unit,m.time,'gear','sustain','helmet','amber');
  assert.ok(effects.some(effect=>effect.key==='drain'&&effect.display==='+8%'));
  assert.match(markup,/ATRIBUTOS REAIS/);assert.match(markup,/Roubo de vida/);assert.match(markup,/\+8%/);
  assert.match(markup,/loadout-slot[^>]*rarity-common/);assert.match(markup,/Coroa de Âmbar Vivo/);assert.match(markup,/Equipado/);
  assert.match(markup,/troll-loadout-preview/);assert.doesNotMatch(markup,/shop-core-stats/);
  assert.match(markup,/Todos os valores exibidos são os modificadores reais usados pelo servidor/);
});

test('Catálogo sempre mostra preços e explica quando falta ouro para comprar',()=>{
  const m=match(),t=m.unit('t');m.state=STATES.ACTIVE;m.time=m.preparation;Object.assign(t,m.map.trollShop);t.gold=0;
  const poor=m.snapshot(t.id).units.find(u=>u.id===t.id),poorMarkup=shopMarkup(poor,m.time,'gear','siege','weapon','maul');
  assert.match(poorMarkup,/Inspecionar Machado Quebra-Muralha; 220 ouro/);assert.match(poorMarkup,/catalog-action unaffordable[^]*?Faltam/);assert.match(poorMarkup,/<span>220<\/span>/);assert.match(poorMarkup,/Seu saldo/);
  t.gold=220;const ready=m.snapshot(t.id).units.find(u=>u.id===t.id),readyMarkup=shopMarkup(ready,m.time,'gear','siege','weapon','maul');
  assert.match(readyMarkup,/data-do="buy-item" data-item="maul"/);assert.match(readyMarkup,/<span>220<\/span><\/span> · Comprar/);
});

test('Ouro conquistado por dano compra equipamento diretamente no card',()=>{
  const m=match(),t=m.unit('t');m.state=STATES.ACTIVE;m.time=m.preparation+10;Object.assign(t,m.map.trollShop);m.grantTrollGold(t,ITEMS.maul.cost,'damage');
  assert.equal(t.stats.goldFromDamage,ITEMS.maul.cost);assert.equal(m.act(t.id,{type:'buyItem',item:'maul'}),undefined);
  assert.equal(t.gold,0);assert.equal(t.equipment.weapon,'maul');assert.ok(t.inventory.includes('maul'));
  const unit=m.snapshot(t.id).units.find(u=>u.id===t.id),markup=shopMarkup(unit,m.time,'gear','siege','weapon','maul');
  assert.match(markup,/catalog-action[^]*?✓ Equipado/);assert.match(markup,/data-do="upgrade-item" data-item="maul"/);assert.match(markup,/Arma · Comum 1/);
});

test('Card equipado evolui diretamente e atualiza raridade, custo e atributo',()=>{
  const m=match(),t=m.unit('t');m.state=STATES.ACTIVE;m.time=m.preparation+10;Object.assign(t,m.map.trollShop);t.gold=1000;
  assert.equal(m.act(t.id,{type:'buyItem',item:'maul'}),undefined);const cost=itemUpgradeCost('maul',1),before=t.gold;
  assert.equal(m.act(t.id,{type:'upgradeItem',item:'maul'}),undefined);assert.equal(t.gold,before-cost);assert.equal(t.itemLevels.maul,2);
  const unit=m.snapshot(t.id).units.find(u=>u.id===t.id),markup=shopMarkup(unit,m.time,'gear','siege','weapon','maul');
  assert.match(markup,/Incomum · Nv. 2/);assert.match(markup,new RegExp(`Evoluir[^]*${itemUpgradeCost('maul',2)}`));
});

test('Árvore usa nomes objetivos e Roubo de Vida concede sustain real',()=>{
  const m=match(),t=m.unit('t');m.state=STATES.ACTIVE;m.time=m.preparation;Object.assign(t,m.map.trollShop);t.gold=1000;
  const before=m.trollStats(t).drain;assert.equal(m.act(t.id,{type:'buy',key:'lifesteal'}),undefined);assert.ok(m.trollStats(t).drain>before);
  const unit=m.snapshot(t.id).units.find(u=>u.id===t.id),markup=shopMarkup(unit,m.time,'levels');
  assert.match(markup,/Dano Físico/);assert.match(markup,/Velocidade de Ataque/);assert.match(markup,/Velocidade de Movimento/);assert.match(markup,/Roubo de Vida/);assert.doesNotMatch(markup,/>Fúria</);
});

test('Equipamentos evoluem de Comum a Épico com custo autoritativo e preservam vida proporcional',()=>{
  const m=match(),t=m.unit('t');m.state=STATES.ACTIVE;m.time=m.preparation;Object.assign(t,m.map.trollShop);t.gold=100000;
  assert.equal(m.act(t.id,{type:'buyItem',item:'maul'}),undefined);assert.equal(t.itemLevels.maul,1);t.hp=t.maxHp*.43;
  for(let level=1;level<ITEM_RARITIES.length;level++){const before=t.gold,cost=itemUpgradeCost('maul',level),siege=m.trollStats(t).siege;assert.equal(m.act(t.id,{type:'upgradeItem',item:'maul'}),undefined);assert.equal(t.itemLevels.maul,level+1);assert.equal(t.gold,before-cost);assert.ok(m.trollStats(t).siege>siege);assert.ok(Math.abs(t.hp/t.maxHp-.43)<1e-9);}
  assert.equal(itemRarity(t.itemLevels.maul).id,'epic');assert.match(m.act(t.id,{type:'upgradeItem',item:'maul'}),/máximo/);assert.equal(m.snapshot(t.id).units.find(unit=>unit.id===t.id).itemLevels.maul,5);
});

test('Loja reflete custo, nível e atributos autoritativos depois de uma compra',()=>{
  const m=match(),t=m.unit('t');m.state=STATES.ACTIVE;m.time=m.preparation;Object.assign(t,m.map.trollShop);t.gold=2000;
  const before=m.snapshot(t.id).units.find(u=>u.id===t.id),beforeMarkup=shopMarkup(before,m.time,'levels');
  assert.match(beforeMarkup,/data-key="speed" data-level="0" data-cost="90"/);const beforeInterval=before.combat.interval;
  assert.equal(m.act(t.id,{type:'buy',key:'speed'}),undefined);
  const after=m.snapshot(t.id).units.find(u=>u.id===t.id),afterMarkup=shopMarkup(after,m.time,'levels');
  assert.equal(before.levels.speed,0,'O snapshot anterior não pode compartilhar levels mutáveis com a simulação');
  assert.match(afterMarkup,new RegExp(`data-key="speed" data-level="1" data-cost="${trollCost('speed',1)}"`));
  assert.ok(after.combat.interval<beforeInterval);assert.match(afterMarkup,new RegExp(`${after.combat.interval.toFixed(2)} →`));
  const beforeSnapshot=m.snapshot(t.id);assert.equal(m.act(t.id,{type:'buy',key:'damage'}),undefined);const afterSnapshot=m.snapshot(t.id),delta=createSnapshotDelta(beforeSnapshot,afterSnapshot,2),patched=applySnapshotDelta(beforeSnapshot,delta);
  assert.equal(patched.units.find(u=>u.id===t.id).levels.damage,1,'O delta precisa transportar a compra para o navegador');
});

test('Estruturas chegam ao nível 30 com marcos Lendário, Épico e Ascendente',()=>{
  const m=match(),{e,core,wall}=baseFixture(m);Object.assign(e,{gold:1e12,wood:1e12,essence:1e12,elfSpecialization:'industrial'});e.specialResources.ancientWood=1e12;wall.tier=9;
  core.tier=9;core.maxHp=structureHP('core',9);core.hp=core.maxHp*.75;Object.assign(e,{x:core.x+2,z:core.z});const income9=resourceProducer(core).amount;
  assert.equal(m.act(e.id,{type:'upgrade',target:core.id}),undefined);advance(m,11);assert.equal(core.tier,10);assert.equal(core.legendary,true);assert.ok(Math.abs(core.hp/core.maxHp-.75)<.001);assert.ok(Math.abs(resourceProducer(core).amount/income9-B.legendary.coreIncome*lateTierScale(B.structures.core.growth,10)/lateTierScale(B.structures.core.growth,9))<1e-9);
  wall.tier=30;wall.maxHp=structureHP('wall',30);wall.hp=wall.maxHp;for(let tier=11;tier<=30;tier++){assert.equal(m.act(e.id,{type:'upgrade',target:core.id}),undefined);advance(m,11);assert.equal(core.tier,tier);if(tier===20)assert.equal(core.epic,true);}assert.equal(core.advanced,true);assert.match(m.act(e.id,{type:'upgrade',target:core.id}),/máximo/);
  wall.tier=9;wall.maxHp=structureHP('wall',9);wall.hp=wall.maxHp*.6;wall.bounty=500;wall.bountyFactor=1.3;Object.assign(e,{x:wall.x,z:wall.z});const bounty=wall.bounty,expectedDelta=(structureRewardHP('wall',10)-structureRewardHP('wall',9))*B.troll.goldPerDamage*wall.bountyFactor;
  assert.equal(m.act(e.id,{type:'upgrade',target:wall.id}),undefined);advance(m,11);assert.equal(wall.legendary,true);assert.equal(wall.maxHp,structureRewardHP('wall',10)*B.legendary.wallHealth);assert.ok(Math.abs(wall.hp/wall.maxHp-.6)<.001);assert.ok(Math.abs(wall.bounty-bounty-expectedDelta)<.01);
});

test('Torre | Portão | Torre cabe com respiro e não fecha a passagem aberta',()=>{
  const m=match(),{e,wall,b}=baseFixture(m),inward={x:b.gate.axis==='x'?-b.gate.sign:0,z:b.gate.axis==='z'?-b.gate.sign:0},lateral={x:b.gate.axis==='x'?0:1,z:b.gate.axis==='x'?1:0};
  const positions=[-1,1].map(sign=>({x:b.gate.x+inward.x*2.2+lateral.x*sign*1.2,z:b.gate.z+inward.z*2.2+lateral.z*sign*1.2}));
  for(const p of positions){Object.assign(e,{x:p.x+inward.x*2,z:p.z+inward.z*2});assert.equal(m.act(e.id,{type:'build',kind:'tower',...p}),undefined);const tower=m.structures.at(-1);Object.assign(tower,{progress:1,healthProgress:1,hp:tower.maxHp});}
  wall.hp=0;const troll=m.unit('t');Object.assign(troll,b.gate);assert.equal(m.positionValid(troll,b.gate.x,b.gate.z),true);
});

test('Demolição devolve 75% do valor atual investido e respeita combate',()=>{
  const m=match(),{e,wall}=baseFixture(m),construction={...wall.constructionCost};Object.assign(e,{x:wall.x,z:wall.z,gold:100000,wood:100000});
  const upgrade=upgradeCost(wall);assert.equal(m.act(e.id,{type:'upgrade',target:wall.id}),undefined);advance(m,5);assert.equal(wall.tier,2);assert.deepEqual(wall.investmentCost,{gold:construction.gold+upgrade.gold,wood:construction.wood+upgrade.wood});
  const gold=e.gold,wood=e.wood;wall.lastHit=m.time;
  assert.match(m.act('e',{type:'demolish',target:wall.id}),/5 s/);wall.lastHit=-100;
  assert.equal(m.act('e',{type:'demolish',target:wall.id}),undefined);assert.equal(wall.hp,0);
  assert.equal(e.gold,gold+Math.floor((construction.gold+upgrade.gold)*.75));assert.equal(e.wood,wood+Math.floor((construction.wood+upgrade.wood)*.75));
  assert.match(m.act('e',{type:'demolish',target:wall.id}),/concluída/);
});

test('Sprint adicional de 15% pertence apenas aos Elfos',()=>{
  const m=match(),elf=m.unit('e'),troll=m.unit('t');m.state=STATES.ACTIVE;m.map.grid.fill(0);
  const elfStart=elf.x;m.input(elf.id,{x:1,z:0,sprint:true});m.step(.1);const elfDistance=elf.x-elfStart;
  const trollStart=troll.x;m.input(troll.id,{x:1,z:0,sprint:true});m.step(.1);const trollDistance=troll.x-trollStart;
  assert.ok(Math.abs(elfDistance-B.elf.speed*B.movement.elfSprint*.1)<.001);
  assert.ok(Math.abs(trollDistance-B.troll.speed*B.movement.sprint*.1)<.001);
});

test('Eventos de renda de aliados não são enviados ao jogador',()=>{
  const m=match();m.emit('resource',{unit:'e',entity:'income-e',x:m.unit('e').x,z:m.unit('e').z,resource:'gold',amount:2});m.emit('resource',{unit:'ally',entity:'income-a',x:m.unit('e').x,z:m.unit('e').z,resource:'gold',amount:3});
  const events=m.snapshot('e').events.filter(e=>e.type==='resource');assert.deepEqual(events.map(e=>e.unit),['e']);
  assert.equal(m.snapshot().events.filter(e=>e.type==='resource').length,2);
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
  const m=match(),{e,core,wall}=baseFixture(m),t=m.unit('t');m.time=0;m.state=STATES.ACTIVE;t.gold=1000000;e.essence=1000000;wall.tier=10;
  for(let i=0;i<9;i++){
    const before=e.gold,cost=upgradeCost(core),oldHP=core.maxHp;
    assert.equal(m.act('e',{type:'upgrade',target:core.id}),undefined);assert.equal(e.gold,before-cost.gold);advance(m,11);assert.ok(core.maxHp>oldHP);
    const gold=t.gold,price=trollCost('damage',t.levels.damage);assert.equal(m.act('t',{type:'buy',key:'damage'}),undefined);assert.equal(t.gold,gold-price);
  }
  assert.equal(core.tier,10);assert.equal(t.levels.damage,9);assert.ok(trollCost('damage',9)>trollCost('damage',8));assert.ok(structureHP('wall',10)>structureHP('wall',9));
});

test('Custo estrutural preserva economia e aplica desconto direcionado às fortificações',()=>{
  const legacy=(kind,tier)=>Math.round(B.structures[kind].upgradeGold*Math.pow(1.9,Math.min(3,tier-1))*Math.pow(B.progression.costGrowth,Math.max(0,tier-4)));
  assert.equal(upgradeCost({kind:'core',tier:9}).gold,legacy('core',9));
  assert.equal(upgradeCost({kind:'mine',tier:9}).gold,legacy('mine',9));
  assert.equal(upgradeCost({kind:'tower',tier:8}).gold,Math.round(legacy('tower',8)*B.elfProgression.defenseUpgradeCost.tower.earlyGold));
  assert.equal(upgradeCost({kind:'tower',tier:9}).gold,Math.round(legacy('tower',9)*B.elfProgression.defenseUpgradeCost.tower.lateGold));
  assert.equal(upgradeCost({kind:'wall',tier:9}).gold,Math.round(legacy('wall',9)*B.elfProgression.defenseUpgradeCost.wall.lateGold));
  assert.ok(upgradeCost({kind:'core',tier:14}).gold<legacy('core',14));
  assert.ok(upgradeCost({kind:'core',tier:14}).gold>upgradeCost({kind:'core',tier:13}).gold);
  assert.ok(upgradeCost({kind:'tower',tier:14}).gold<legacy('tower',14));
  const tier16=upgradeCost({kind:'tower',tier:15}),withoutEpicBand=Math.round(tier16.gold/B.elfProgression.defenseUpgradeCost.tower.epicBand);
  assert.ok(tier16.gold/withoutEpicBand>=.77&&tier16.gold/withoutEpicBand<=.79,'níveis 16–20 recebem cerca de 22% de desconto adicional');
});

test('Minas ganham uma vaga por tier do Núcleo e escalam custo e produção',()=>{
  const m=match(),{e,core,wall,b}=baseFixture(m);e.x=b.x;e.z=b.z;
  const points=[];for(const dx of [-4.4,-2.2,0,2.2,4.4])for(const dz of [-4.4,-2.2,0,2.2,4.4])if(dx||dz)points.push({x:b.x+dx,z:b.z+dz});
  const firstPoint=points.find(p=>m.placement(e,'mine',p.x,p.z)===null);assert.ok(firstPoint);const firstCost=mineEconomy(1).cost,before=e.gold;
  assert.equal(m.act(e.id,{type:'build',kind:'mine',...firstPoint}),undefined);const first=m.structures.at(-1);assert.equal(e.gold,before-firstCost.gold);assert.deepEqual(first.constructionCost,firstCost);advance(m,6);
  const blockedPoint=points.find(p=>/Núcleo nível 2/.test(m.placement(e,'mine',p.x,p.z)||''));assert.ok(blockedPoint);
  e.x=core.x+3;e.z=core.z;e.gold=e.wood=1000000;assert.equal(m.act(e.id,{type:'upgrade',target:core.id}),undefined);advance(m,5);assert.equal(core.tier,2);
  e.x=b.x;e.z=b.z;const secondPoint=points.find(p=>m.placement(e,'mine',p.x,p.z)===null);assert.ok(secondPoint);const secondCost=mineEconomy(2).cost,gold=e.gold;
  assert.equal(m.act(e.id,{type:'build',kind:'mine',...secondPoint}),undefined);assert.equal(e.gold,gold-secondCost.gold);advance(m,6);assert.equal(first.coreTier,2);const tier2Income=resourceProducer(first).amount;
  wall.tier=2;e.x=core.x+3;e.z=core.z;assert.equal(m.act(e.id,{type:'upgrade',target:core.id}),undefined);advance(m,6);assert.equal(first.coreTier,3);assert.ok(resourceProducer(first).amount>tier2Income);assert.equal(mineEconomy(5).capacity,5);
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
  const automatic=availableTrees(m,e,core)[0].id;assert.equal(m.act('e',{type:'trainWisp',target:core.id,tree:m.trees.at(-1).id}),undefined);advance(m,7);const w=m.wisps[0];assert.equal(w.treeId,automatic);
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
  const {m,t,e}=arena();m.act('t',{type:'attack'});advance(m,.95);m.act('t',{type:'attack'});assert.ok(t.queuedStrike);advance(m,.3);assert.ok(Math.abs(e.hp-(10000-2*B.troll.damage))<1e-8);
  ready(m,t);m.act('t',{type:'attack',heavy:true});const hp=e.hp;m.act('t',{type:'dash'});assert.equal(t.pendingStrike,null);advance(m,.4);assert.equal(e.hp,hp);assert.ok(t.z>m.map.trollSpawn.z);assert.ok(t.openingUntil>m.time);
});

test('Terceiro acerto no mesmo alvo finaliza combo; alvo atrás não recebe dano',()=>{
  const {m,t,e}=arena();for(let i=0;i<3;i++){m.act('t',{type:'attack'});advance(m,.15);ready(m,t);}
  assert.ok(Math.abs(e.hp-(10000-B.troll.damage*(3+B.combat.comboBonus)))<1e-8);assert.ok(m.events.some(e=>e.type==='impact'&&e.finisher));
  e.z=t.z-2;const hp=e.hp;m.act('t',{type:'attack'});advance(m,.15);assert.equal(e.hp,hp);
});

test('Ruptura confirma dano real, libera passagem e impede reconstrução imediata',()=>{
  const {m,t}=arena(),base=m.map.bases[0];Object.assign(t,{x:base.gate.x,z:base.gate.z});m.map.grid.fill(0);
  const wall={id:'gate',kind:'wall',owner:'e',baseId:base.id,x:t.x,z:t.z+2,hp:10,maxHp:850,tier:1,bounty:3,progress:1,healthProgress:1};m.structures.push(wall);
  m.act('t',{type:'attack'});advance(m,.15);assert.equal(wall.hp,0);assert.equal(t.stats.goldFromDamage,3);assert.equal(t.stats.goldFromObjectives,B.economy.trollObjective.discovery+B.economy.trollObjective.wall);assert.equal(m.breachUntil.get(base.id)>m.time,true);
  const impact=m.events.find(e=>e.type==='impact');assert.equal(impact.amount,10);assert.equal(impact.broken,true);
});

test('Defesa de torres mata Troll exposto e encerra partida com vitória dos Elfos',()=>{
  const {m,t}=arena();m.map.grid.fill(0);
  for(let i=0;i<5;i++)m.structures.push({id:'defense'+i,kind:'tower',owner:'e',x:t.x+5,z:t.z+i,tier:4,branch:'pierce',hp:800,maxHp:800,progress:1,healthProgress:1,lastShot:0});
  advance(m,30);assert.equal(t.alive,false);assert.equal(m.winner,'elves');assert.equal(m.state,STATES.END);assert.ok(m.stats.towerDamage>0);
  const end=m.time;advance(m,2);assert.equal(m.time,end);
});
test('Progressão lendária exige nível 10, executa uma vez por cooldown e protege Barricadas',()=>{
  const sword=arena(),{m,t,e}=sword,structure={id:'execute-me',kind:'core',owner:'e',baseId:'base-x',x:t.x,z:t.z+2,tier:1,hp:140,maxHp:1000,progress:1,bounty:100,lastHit:-100};Object.assign(e,{x:t.x+20,z:t.z+20});m.structures.push(structure);t.yaw=0;t.levels.damage=6;t.levels.siege=6;t.levels.health=12;
  assert.equal(m.legendarySword(t),false);t.trollLevel=10;assert.equal(m.legendarySword(t),true);m.act(t.id,{type:'attack'});m.time=t.pendingStrike.at;m.resolveStrike(t);assert.equal(structure.hp,0);assert.ok(m.events.some(e=>e.type==='legendary-execute'));assert.ok(t.cooldowns.legendaryExecute>m.time);const executions=m.telemetry.result(m).legendaryExecutions;assert.equal(executions.count,1);assert.ok(executions.hpRemoved>0&&executions.hpRemoved<=140);assert.equal(executions.byKind.core.count,1);assert.equal(executions.events[0].id,structure.id);

  const wall={id:'protected-wall',kind:'wall',owner:'e',baseId:'base-y',x:t.x,z:t.z+2,tier:1,hp:20000,maxHp:100000,progress:1,bounty:100,lastHit:-100};m.structures.push(wall);m.time=t.cooldowns.legendaryExecute;t.cooldowns.attack=0;t.yaw=0;m.act(t.id,{type:'attack'});m.time=t.pendingStrike.at;m.resolveStrike(t);assert.ok(wall.hp>0,'Barricada ainda bem acima de 8% não deve ser executada');

  const capped={id:'capped-wall',kind:'wall',owner:'e',baseId:'base-z',x:t.x,z:t.z+2,tier:10,hp:7000,maxHp:100000,progress:1,bounty:100,lastHit:-100};wall.x+=20;m.structures.push(capped);m.time=t.cooldowns.legendaryExecute;t.cooldowns.attack=0;t.yaw=0;const beforeCap=capped.hp;m.act(t.id,{type:'attack'});m.time=t.pendingStrike.at;m.resolveStrike(t);assert.ok(capped.hp>0);assert.ok(beforeCap-capped.hp<=B.legendary.wallExecuteMaxHp+m.trollStats(t).damage*m.trollStats(t).siege+1,'execução da Barricada respeita o teto por golpe');

  const beam=match(),troll=beam.unit('t'),elf=beam.unit('e');beam.state=STATES.ACTIVE;beam.time=80;troll.hp=troll.maxHp=10000;Object.assign(elf,{x:troll.x+8,z:troll.z+8});
  const tower={id:'legend',kind:'tower',owner:elf.id,baseId:'b',x:troll.x,z:troll.z+5,tier:10,hp:1000,maxHp:1000,progress:1,branch:'pierce',lastShot:-100,lastHit:-100,bounty:100};beam.structures.push(tower);
  advance(beam,.1);assert.equal(tower.legendary,true);const hp0=troll.hp;advance(beam,1);const first=hp0-troll.hp,hp1=troll.hp;advance(beam,1);const second=hp1-troll.hp;assert.ok(second>first);assert.ok(beam.events.some(e=>e.type==='beam'));const beamDiagnostic=beam.telemetry.result(beam).towerDiagnostics.find(row=>row.id===tower.id);assert.ok(beamDiagnostic.beamSeconds>0);assert.ok(beamDiagnostic.beamDamage>0);
  tower.disabledUntil=beam.time+1;advance(beam,.5);assert.equal(tower.beamStartedAt,0);const paused=troll.hp;advance(beam,.4);assert.ok(troll.hp>paused,'sustentação de combate continua enquanto a torre está silenciada');
});

test('Ouro estrutural recebe retorno decrescente, mas dano contra Elfos mantém recompensa integral',()=>{
  const early=match(),t=early.unit('t'),e=early.unit('e');early.state=STATES.ACTIVE;early.time=early.preparation;t.trollLevel=9;const start=t.gold;early.damage(e,10,t,'melee');const baseline=t.gold-start;
  e.hp=e.maxHp;t.trollLevel=15;const levelStart=t.gold;early.damage(e,10,t,'melee');assert.equal(t.gold-levelStart,baseline);assert.equal(t.stats.goldFromDamageDiminished,0);
  const wall={id:'gold-wall',kind:'wall',owner:e.id,baseId:'gold-base',x:t.x,z:t.z+2,tier:1,hp:10000,maxHp:10000,progress:1,bounty:10000,lastHit:-100};early.structures.push(wall);const wallStart=t.gold;early.damage(wall,10,t,'melee');const structuralGold=t.gold-wallStart;assert.ok(structuralGold<baseline&&structuralGold>=baseline*B.economy.trollDamageGoldMinimum);assert.ok(t.stats.goldFromDamageDiminished>0);
  const late=match(),lateTroll=late.unit('t'),lateElf=late.unit('e');late.state=STATES.ACTIVE;late.time=late.preparation+B.economy.trollDamageGoldDiminishingStart+300;const lateStart=lateTroll.gold,grossStart=lateTroll.stats.goldFromDamageGross;late.damage(lateElf,10,lateTroll,'melee');assert.equal(lateTroll.gold-lateStart,lateTroll.stats.goldFromDamageGross-grossStart);assert.equal(lateTroll.stats.goldFromDamageDiminished,0);
});
test('Núcleo produz Essência e especializa clareiras em Economia, Defesa ou Tecnologia',()=>{
  const setup=()=>{const m=match(),{e,core,wall}=baseFixture(m);m.state=STATES.ACTIVE;core.tier=4;Object.assign(e,{x:core.x,z:core.z,essence:B.elfIncremental.pathCost});return {m,e,core,wall};};
  const economy=setup(),gold=economy.e.gold;assert.equal(essenceIncome(economy.core),B.elfIncremental.essenceBaseRate);assert.equal(economy.m.act(economy.e.id,{type:'chooseElfPath',target:economy.core.id,path:'economy'}),null);advance(economy.m,1);assert.equal(economy.e.elfPath,'economy');assert.ok(economy.e.gold-gold>resourceProducer(economy.core).amount);assert.ok(economy.e.essence>0);assert.match(economy.m.act(economy.e.id,{type:'chooseElfPath',target:economy.core.id,path:'defense'}),/já possui/);
  const defense=setup(),hp=defense.core.maxHp;assert.equal(defense.m.act(defense.e.id,{type:'chooseElfPath',target:defense.core.id,path:'defense'}),null);assert.ok(Math.abs(defense.core.maxHp/hp-B.elfIncremental.paths.defense.structureHp)<.001);
  const technology=setup();assert.equal(technology.m.act(technology.e.id,{type:'chooseElfPath',target:technology.core.id,path:'technology'}),null);assert.equal(upgradeCost({kind:'core',tier:9},'technology').essence,Math.ceil(B.elfIncremental.legendaryCost*.75));technology.wall.tier=4;technology.e.gold=technology.e.wood=1000000;assert.equal(technology.m.act(technology.e.id,{type:'upgrade',target:technology.core.id}),undefined);assert.ok(technology.core.upgradeDuration<(B.construction.upgradeSeconds+4));
});
test('Especializações registram produção, mitigação, cura e dano reais',()=>{
  const industrial=match(),i=industrial.unit('e'),core={id:'impact-core',kind:'core',owner:i.id,baseId:'impact-base',x:i.x,z:i.z,tier:8,hp:1000,maxHp:1000,progress:1,lastHit:-100,overdriveUntil:100};industrial.state=STATES.ACTIVE;industrial.time=50;i.elfSpecialization='industrial';industrial.structures.push(core);industrial.step(.1);assert.equal(i.stats.specializationImpact.refineryBonusGold,0);assert.ok(i.stats.specializationImpact.overdriveBonusGold>0);
  const fortress=match(),f=fortress.unit('e'),ft=fortress.unit('t'),wall={id:'impact-wall',kind:'wall',owner:f.id,baseId:'impact-fort',x:f.x,z:f.z,tier:8,hp:500,maxHp:1000,progress:1,lastHit:-100,fortifiedUntil:100},bastion={id:'impact-bastion',kind:'bastion',owner:f.id,baseId:'impact-fort',x:f.x+1,z:f.z,tier:6,hp:1000,maxHp:1000,progress:1,lastHit:-100};fortress.state=STATES.ACTIVE;fortress.time=50;f.elfSpecialization='fortress';fortress.structures.push(wall,bastion);fortress.step(.1);assert.ok(f.stats.specializationImpact.bastionHealing>0);const before=wall.hp;fortress.damage(wall,100,ft,'melee');assert.ok(before-wall.hp<100);assert.ok(f.stats.specializationImpact.fortifiedDamagePrevented>0);
  const arcane=match(),a=arcane.unit('e'),at=arcane.unit('t');arcane.state=STATES.ACTIVE;arcane.time=50;Object.assign(at,{hp:100000,maxHp:100000});a.elfSpecialization='arcane';const tower={id:'impact-arcane',kind:'arcaneTower',owner:a.id,baseId:'impact-arc',x:at.x,z:at.z+4,tier:7,hp:1000,maxHp:1000,progress:1,lastHit:-100,lastShot:-100};arcane.structures.push(tower);advance(arcane,4);assert.ok(a.stats.specializationImpact.arcaneDamage>0);const report=arcane.result().telemetry.specializations;assert.equal(report.structures.arcaneTower.maxTier,7);assert.ok(report.impact.arcaneDamage>0);
});
test('Telemetria separa coleta manual e produção de madeira dos Wisps',()=>{
  const m=match(),e=m.unit('e'),tree=m.trees.find(t=>t.amount>0);Object.assign(e,{x:tree.x,z:tree.z});m.act(e.id,{type:'gather',target:tree.id});assert.ok(e.stats.manualWoodGathered>0);assert.equal(e.stats.wispWoodGenerated,0);const checkpoint=m.telemetry.economySnapshot(m,180).elves;assert.equal(checkpoint.manualWoodGathered,e.stats.manualWoodGathered);assert.equal(checkpoint.wispWoodGenerated,0);
});
test('Limite de 60 minutos encerra por soma de pontos da equipe',()=>{
  const trollWin=match(),troll=trollWin.unit('t');trollWin.state=STATES.ACTIVE;troll.stats.damage=5000;trollWin.time=B.matchHardLimit;trollWin.checkEndState();
  assert.equal(trollWin.state,STATES.END);assert.equal(trollWin.winner,'troll');assert.equal(trollWin.endReason,'score-limit');assert.equal(trollWin.scoreLimit.at,3600);assert.ok(trollWin.result().teamScores.troll>trollWin.result().teamScores.elves);

  const elfWin=match(),elf=elfWin.unit('e');elfWin.state=STATES.ACTIVE;elf.stats.goldGenerated=25000;elfWin.time=B.matchHardLimit-.01;elfWin.step(.05);
  assert.equal(elfWin.time,B.matchHardLimit);assert.equal(elfWin.state,STATES.END);assert.equal(elfWin.winner,'elves');assert.equal(elfWin.endReason,'score-limit');assert.ok(elfWin.result().teamScores.elves>elfWin.result().teamScores.troll);

  const tie=match();tie.state=STATES.ACTIVE;tie.time=B.matchHardLimit;tie.checkEndState();assert.equal(tie.winner,'elves');assert.equal(tie.scoreLimit.tieBreaker,'defenders-hold');

  const drift=match();drift.state=STATES.ACTIVE;drift.time=B.matchHardLimit-.3;drift.step(.1);drift.step(.1);drift.step(.1);assert.equal(drift.state,STATES.END);assert.equal(drift.time,B.matchHardLimit);
});
