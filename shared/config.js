import { constructionEffects, crystalUpgradeCost } from './structure-specializations.js';
export const STATES = Object.freeze({ MENU:'MAIN_MENU', LOBBY:'LOBBY', LOADING:'LOADING', PREP:'PREPARATION', ACTIVE:'MATCH_ACTIVE', END:'MATCH_END', RETURN:'RETURN_TO_LOBBY' });
export const BALANCE = {
  tick: 20, snapshot: 10, gameSpeed: 1.25, maxElves: 8, cell: 2.2, maxTier: 20, maxStructureTier: 30, visualTier: 5,
  prep: 60, matchHardLimit: 3600, finalAge: 210, idlePressureAge: 480, idlePressureGrace: 45,
  // The Troll needs enough sight to discover a refuge from the surrounding
  // trail without being given hidden base coordinates.
  vision: { troll: 60, elf: 24, towerRevealSeconds: 3 }, interactRange: 6.5,
  movement:{sprint:1.25,elfSprint:1.4375,trollRadius:.64,elfRadius:.37},
  construction:{range:9.75,initialHealth:.15,breachCooldown:45,enemyClearance:5,gateClearance:2.3,placementGap:.5,placementRadius:{wall:.95},limits:{core:1,wall:1,tower:2,mine:1,fishery:1,bastion:1,arcaneTower:1},upgradeSeconds:3},
  economy:{treeStock:1000,richWood:1.65,finalRichWood:2.5,lateTier:9,lateStructureGrowth:1.035,lateWispGrowth:1.08,trollThreatRate:.022,trollThreatCap:2.2,trollLateThreatStart:900,trollLateThreatBase:8,trollLateThreatLogScale:30,trollLateThreatReference:100,trollLateThreatMatureBase:8,trollLateThreatLegendary:3,trollLateThreatSoftCap:50,trollLateThreatOverflowRate:.35,trollLateThreatCap:100,trollLateThreatDiminishingLevel:15,trollLateThreatLevelPressure:.12,trollLateThreatMinimum:.6,trollDamageGoldDiminishingStart:900,trollDamageGoldDiminishingLevel:10,trollDamageGoldLevelPressure:.1,trollDamageGoldMinutePressure:.08,trollDamageGoldMinimum:.32,trollObjectiveInvestmentRate:.1,trollObjectiveWoodRate:.5,trollObjectiveEssenceRate:12,trollObjectiveIncomeSeconds:15,trollObjective:{discovery:75,elf:75,wisp:5,wall:15,tower:30,mine:25,core:60,workshop:20,legendary:80},trollLobbyBonus:[0,0,.08,.12,.16,.2,.2,.2,.18],trollBountyFactor:[0,1.3,1.5,1.45,1.45,1.41,1.4,1.25,1.1],trollMapBounty:{compact:.9,large:1.1},trollLobbySiege:[1,1.15,1,1,1,1.1,1,1,1],trollScenarioBounty:{
    compact:{normal:[1,1,1,1,1,.94,1,1,1.06],hard:[1,1,1,1,1,1,1,1,1.06]},
    large:{}
  }},
  elfIncremental:{essenceUnlockTier:4,essenceBaseRate:0,essenceGrowth:1.22,pathCost:18,legendaryCost:30,epicCost:90,paths:{economy:{name:'Economia',description:'Ouro e madeira +12%.',gold:1.12,wood:1.12},defense:{name:'Defesa',description:'Estruturas e reparos +15%.',structureHp:1.15,repair:1.15},technology:{name:'Tecnologia',description:'Essência +30% e melhorias 20% mais rápidas.',essence:1.3,upgradeSpeed:1.2}}},
  progression:{structureGrowth:1.18,lateCombatGrowth:1.07,wallLateGrowth:1.045,costGrowth:1.35,woodCostGrowth:1.25,lateStructureCostGrowth:1.14,lateStructureWoodCostGrowth:1.14,trollDamageGrowth:1.12,healthGrowth:1.14},
  wisps:{gold:65,wood:15,hireGrowth:1.32,trainSeconds:6,income:1.4,incomeGrowth:1.25,upgradeGold:70,upgradeWood:20,costGrowth:1.5,seconds:4,hp:55,externalBonus:1.6,range:25,regrowSeconds:35},
  elfProgression:{unlockTier:10,abilityCooldown:90,abilityDuration:12,specialGather:4,specialWisp:{gold:90,wood:30,rate:.45,hp:48},localStock:160,externalStock:420,
    // Defensive upgrades need to compete with five independent economic trees.
    // Keep economy prices intact and discount only fortification investments.
    defenseUpgradeCost:{wall:{earlyGold:.82,earlyWood:.85,lateGold:.62,lateWood:.7},tower:{earlyGold:.85,earlyWood:.88,lateGold:.68,lateWood:.75,epicBand:.78},workshop:{earlyGold:.92,earlyWood:.92,lateGold:.82,lateWood:.85},bastion:{earlyGold:.82,earlyWood:.85,lateGold:.65,lateWood:.72},arcaneTower:{earlyGold:.82,earlyWood:.85,lateGold:.65,lateWood:.72}},
    capital:{start:720,trollLevel:9,minCore:7,requiredMines:1,targets:{economy:10,balanced:12,defense:14}},
    specializations:{
      industrial:{name:'Industrial',resource:'crystal',structure:null,abilityStructure:'core',description:'Automação, Wisps e produção.',ability:'Sobrecarga',wispBonus:.2},
      fortress:{name:'Fortaleza',resource:'crystal',structure:null,abilityStructure:'core',description:'Barricadas, resistência e recuperação.',ability:'Fortificação emergencial',regenPerTier:.00035,fortify:.25},
      arcane:{name:'Arcano',resource:'crystal',structure:null,abilityStructure:'core',description:'Visão, energia e dano explosivo.',ability:'Pulso Arcano',revealRadius:24,overcharge:.4}
    }},
  combat:{buffer:.18,lightWindup:.1,heavyWindup:.32,lightVisualRecovery:.26,heavyVisualRecovery:.42,comboWindow:2.8,comboBonus:.25,openingSeconds:1.2,openingBonus:.2},
  wallRecovery:{delay:8,rate:.0035},
  elf: { hp: 85, speed: 6.4, gold: 150, wood: 110, gather: 10, gatherInterval: 0.65, repair: 42, wallRepairRate:.005, wallRepairDiminishingTier:8, wallRepairDiminishingRate:.65, repairCost: 3, stunDuration:3, stunCooldown:60, stunRange:10, relocationSeconds:60, evacuationMinSeconds:12, evacuationClearSeconds:10, evacuationDistance:20, evacuationThreatRange:28, preparationClearSeconds:10, preparationTrollClearRadius:25 },
  ghost:{hp:55,vision:8,revealRadius:18,revealDuration:10,revealCooldown:60,goldReward:25},
  legendary:{tier:10,coreIncome:1.25,wallHealth:1.2,towerDps:190,rampPerSecond:.12,maxRamp:2.5,parityRamp:1.75,sustainTwoTowers:.55,sustainThreeTowers:.32,sustainPressureMemory:10,swordRequiredTrollLevel:10,swordLevels:12,swordTotalLevels:24,executeThreshold:.15,wallExecuteThreshold:.08,wallExecuteMaxHp:2500,executeCooldown:1.25},
  epic:{
    tier:20,focusLead:2,prepareAt:600,projectAt:900,foundationTier:8,recoveryGrace:180,projectCostMultiplier:.55,wallHealth:1.5,towerHealth:1.4,towerDamage:1.75,
    resourceCost:{core:30,wall:30,tower:30,mine:20,bastion:30,arcaneTower:30},
    coreProduction:1.2,mineProduction:1.75,
    signaturePower:1.6,kingdomProduction:1.15,kingdomStructureReduction:.15
  },
  advanced:{tier:30},
  tower:{specializations:false,standard:{damage:1.45,interval:1,range:0,armorPierce:0}},
  troll: { hp: 1980, speed: 6.4, travelSpeed:1.05, damage: 21.6, interval: 1.05, range: 3.6, armor: 1, gold: 0, goldPerDamage: 0.42, combatRegenRate:.0012,restRegenRate:.0036,combatRegenPerLevel:.00075,restRegenPerLevel:.0015,regenLevelCap:10,towerCombatRegenMultiplier:.5,structureDrainCap:.01,cardOutOfCombatDelay:5,sanctuaryRadius:6,sanctuaryRegenRate:.008,shopRange:5,recallUnlock:0,recallChannel:7.5,recallCooldown:180,recallExitBoost:1.2,recallExitBoostDuration:3,damageGrowth:1.2,damageUpgradeScale:.88,speedFactor:.87,healthPerLevel:324,armorPerLevel:3.5,movementPerLevel:.08,siegePerLevel:.18,siegeFoundationPerLevel:.22,siegeDiminishingLevel:8,siegeDiminishingPerLevel:.08,finalSiege:1.35,finalSiegeUnlockSeconds:720,finalSiegeMaxElves:2,structureXpDiminishingLevel:10,structureXpLevelPressure:.18,structureXpMinimum:.35,regenDelay:4,healPercent:.16,healCharges:2,healRecharge:180,healCooldown:75,healDuration:6,exposureGrace:9,exposureRate:.035,heavy: 2.25,heavyRecovery:1.3, heavyCooldown: 4, dashCooldown: 7,dashDuration:.4,dashSpeed:2.5, roarCooldown: 18,roarRange:9,roarDuration:2 },
  structures: {
    core: { name:'Núcleo', gold:65, wood:25, hp:360, radius:1.55, seconds:4, income:3, growth:1.65, upgradeGold:100, upgradeWood:35, color:0xe4c37a },
    wall: { name:'Barricada', gold:30, wood:34, hp:2541, radius:1.05, seconds:3, growth:1.9, upgradeGold:85, upgradeWood:30, color:0xa48862 },
    tower: { name:'Torre', gold:60, wood:30, hp:360, radius:0.9, seconds:4, damage:10.815, interval:1.2, range:17, retainRange:1, muzzleHeight:4.5, targetHeight:2, growth:1.65, upgradeGold:90, upgradeWood:40, color:0x81cabb },
    mine: { name:'Mina', gold:85, wood:35, hp:200, radius:1.05, seconds:5, income:2.6, growth:1.7, upgradeGold:110, upgradeWood:45, color:0xc2a54c },
    fishery: {name:'Oficina de Pesca',gold:90,wood:45,hp:250,radius:1.1,seconds:5,growth:1,upgradeGold:0,upgradeWood:0,color:0x748fa3},
    // Legacy-only definition for historical snapshots. Essence and path
    // selection now belong to the Core, so new matches cannot build Workshops.
    workshop: { name:'Oficina', available:false, gold:90, wood:45, hp:250, radius:1.1, seconds:5, growth:1.6, upgradeGold:125, upgradeWood:45, color:0x748fa3 },
    // Kept only so historical match snapshots containing a Refinery remain
    // renderable. New matches cannot build or progress this retired structure.
    refinery: { name:'Refinaria', available:false, gold:150, wood:85, hp:300, radius:1.2, seconds:6, growth:1.62, upgradeGold:150, upgradeWood:65, aura:11, color:0xd6a45d },
    bastion: { name:'Bastião', available:false, gold:120, wood:80, hp:520, radius:1.25, seconds:6, growth:1.72, upgradeGold:155, upgradeWood:75, aura:12, color:0x8ea5a0 },
    arcaneTower: { name:'Torre Arcana', available:false, gold:145, wood:75, hp:310, radius:1, seconds:6, damage:46, interval:3, range:22, retainRange:1.5, muzzleHeight:4.8, targetHeight:2, growth:1.68, upgradeGold:170, upgradeWood:70, color:0xa680e6 }
  },
  branches: {
    power:{name:'Balista',description:'Mais dano por disparo',damage:1.45,interval:1,range:0,armorPierce:0},
    rapid:{name:'Rajada',description:'Disparos mais rápidos',damage:0.9,interval:0.6,range:0,armorPierce:0},
    frost:{name:'Gelo',description:'Reduz a velocidade do Troll',damage:0.8,interval:1,range:2,armorPierce:0,slow:0.65},
    pierce:{name:'Ruptura',description:'Ignora armadura e amplia alcance',damage:1,interval:1,range:5,armorPierce:1}
  },
  upgrades: {
    damage:{name:'Dano Físico',description:'Aumenta o dano de todos os ataques.',cost:75,growth:1.8,max:20},
    speed:{name:'Velocidade de Ataque',description:'Reduz o intervalo entre ataques.',cost:90,growth:1.85,max:20},
    movement:{name:'Velocidade de Movimento',description:'Aumenta a velocidade de deslocamento.',cost:70,growth:1.85,max:20},
    lifesteal:{name:'Roubo de Vida',description:'Recupera vida ao causar dano direto.',cost:105,growth:1.9,max:20},
    health:{name:'Vida Máxima',description:'Aumenta a vida máxima do Troll.',cost:90,growth:1.8,max:20},
    armor:{name:'Armadura',description:'Reduz o dano físico recebido.',cost:85,growth:1.8,max:20},
    regen:{name:'Regeneração',description:'Aumenta a recuperação dentro e fora de combate.',cost:65,growth:1.85,max:20},
    siege:{name:'Dano Estrutural',description:'Aumenta o dano causado a estruturas.',cost:110,growth:1.9,max:20},
    utility:{name:'Rugido e Esquiva',description:'Amplia o Rugido e reduz a recarga da esquiva.',cost:80,growth:1.8,max:20}
  },
  difficulty: { easy:{think:1.6,repair:0.55,retreat:0.42},normal:{think:0.7,repair:0.68,retreat:0.3},hard:{think:0.28,repair:0.75,retreat:0.18} }
};
export const TROLL_UPGRADE_BRANCHES=Object.freeze({
  predator:{name:'Predador',description:'Alcance, elimine e sustente a perseguição.',keys:['damage','speed','movement','lifesteal']},
  colossus:{name:'Colosso',description:'Resista ao fogo concentrado e recupere-se.',keys:['health','armor','regen']},
  demolisher:{name:'Demolidor',description:'Rompa fortificações e neutralize torres.',keys:['siege','utility']}
});
export const TROLL_GROWTH_BANDS=Object.freeze([
  {from:1,to:5,name:'Fundação'},
  {from:6,to:10,name:'Especialização'},
  {from:11,to:15,name:'Lendário'},
  {from:16,to:20,name:'Épico'}
]);
export const MATCH_MODES=Object.freeze({
  custom:{name:'Personalizado',description:'O host controla mapa, lobby e regras.'},
  normal:{name:'Normal',description:'Regras oficiais sem pontuação ranqueada.',preset:{elfSlots:5,difficulty:'normal',trollDifficulty:'normal',elfDifficulty:'normal',mapSize:'compact',preparation:60,takeover:true,allowRoles:true}},
  ranked:{name:'Ranqueado',description:'Preset competitivo; MMR será ativado na etapa de filas.',preset:{elfSlots:5,difficulty:'normal',trollDifficulty:'normal',elfDifficulty:'normal',mapSize:'compact',preparation:60,takeover:true,allowRoles:false,private:false,local:false}}
});
export const DEFAULT_SETTINGS = { mode:'custom',elfSlots:5, difficulty:'normal',trollDifficulty:'normal',elfDifficulty:'normal', seed:'THORNHOLD', mapSize:'compact', mapStyle:'woodland', preparation:60, private:true, local:false, region:'SA', takeover:true, allowRoles:true, adaptiveBuildEnabled:true };
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export const mitigation=armor=>1/(1+0.055*Math.max(0,armor));
// Saturation remains defensive for fixtures and imported state; purchases stop at level 20.
export const scaled=(base,growth,level)=>Math.min(Number.MAX_SAFE_INTEGER,base*Math.pow(growth,Math.min(512,Math.max(0,level))));
export const tierScale=(growth,tier)=>scaled(Math.pow(growth,Math.min(3,tier-1)),BALANCE.progression.structureGrowth,Math.max(0,tier-4));
export const combatTierScale=(growth,tier)=>tier<=BALANCE.economy.lateTier?tierScale(growth,tier):tierScale(growth,BALANCE.economy.lateTier)*Math.pow(BALANCE.progression.lateCombatGrowth,tier-BALANCE.economy.lateTier);
export const lateTierScale=(growth,tier,lateGrowth=BALANCE.economy.lateStructureGrowth)=>{
  const lateTier=BALANCE.economy.lateTier,earlyGrowthLevels=Math.max(0,lateTier-4),early=Math.pow(growth,Math.min(3,tier-1))*Math.pow(BALANCE.progression.structureGrowth,Math.min(earlyGrowthLevels,Math.max(0,tier-4)));
  return early*Math.pow(lateGrowth,Math.max(0,tier-lateTier));
};
export const wallTierScale=tier=>lateTierScale(BALANCE.structures.wall.growth,tier,BALANCE.progression.wallLateGrowth);
export const legendaryStructure=(kind,tier)=>tier>=BALANCE.legendary.tier&&['core','wall','tower'].includes(kind);
export const epicStructure=(kind,tier)=>tier>=BALANCE.epic.tier&&Object.hasOwn(BALANCE.structures,kind);
export const advancedStructure=(kind,tier)=>tier>=BALANCE.advanced.tier&&Object.hasOwn(BALANCE.structures,kind);
export const structureRewardHP=(kind,tier)=>BALANCE.structures[kind].hp*(kind==='wall'?wallTierScale(tier):combatTierScale(BALANCE.structures[kind].growth,tier));
export const structureHP=(kind,tier)=>structureRewardHP(kind,tier)*(kind==='wall'&&legendaryStructure(kind,tier)?BALANCE.legendary.wallHealth:1)*(tier>=BALANCE.epic.tier&&kind==='wall'?BALANCE.epic.wallHealth:tier>=BALANCE.epic.tier&&kind==='tower'?BALANCE.epic.towerHealth:1);
export const towerDamage=tier=>BALANCE.structures.tower.damage*combatTierScale(BALANCE.structures.tower.growth,tier)*(tier>=BALANCE.epic.tier?BALANCE.epic.towerDamage:1);
export const repairPower=structure=>{
  if(structure?.kind!=='wall')return BALANCE.elf.repair;
  const lateLevels=Math.max(0,(structure.tier||1)-BALANCE.elf.wallRepairDiminishingTier),diminishing=1/Math.sqrt(1+lateLevels*BALANCE.elf.wallRepairDiminishingRate);
  return BALANCE.elf.repair+(structure.maxHp||0)*BALANCE.elf.wallRepairRate*diminishing;
};
export const arcaneTowerDamage=tier=>BALANCE.structures.arcaneTower.damage*combatTierScale(BALANCE.structures.arcaneTower.growth,tier);
export const towerProfile=s=>{const e=constructionEffects(s),base=BALANCE.tower.standard;return {...base,damage:base.damage*(1+(e.damage||0)),interval:1/(1+(e.attackSpeed||0)),range:e.range||0,armorPierce:Math.min(.8,e.armorPierce||0)};};
export const elfPath=id=>BALANCE.elfIncremental.paths[id]||null;
export const essenceIncome=s=>s?.kind==='core'&&s.tier>=BALANCE.elfIncremental.essenceUnlockTier?BALANCE.elfIncremental.essenceBaseRate*Math.pow(BALANCE.elfIncremental.essenceGrowth,s.tier-BALANCE.elfIncremental.essenceUnlockTier):0;
export const placementRadius=kind=>BALANCE.construction.placementRadius[kind]??BALANCE.structures[kind].radius;
export const mineEconomy=coreTier=>{const tier=Math.max(1,Math.min(5,Math.floor(coreTier||1))),costFactor=1+.25*(tier-1);return {tier,capacity:1,cost:{gold:Math.round(BALANCE.structures.mine.gold*costFactor),wood:Math.round(BALANCE.structures.mine.wood*costFactor)},productionFactor:1+.3*(tier-1)};};
export const income=s=>(1+(constructionEffects(s).production||0))*(BALANCE.structures[s.kind].income||0)*lateTierScale(BALANCE.structures[s.kind].growth,s.tier)*(s.kind==='mine'?(s.coreTier>0?mineEconomy(s.coreTier).productionFactor:0)*(s.tier>=BALANCE.epic.tier?BALANCE.epic.mineProduction:1):1)*(s.kind==='core'&&legendaryStructure(s.kind,s.tier)?BALANCE.legendary.coreIncome:1);
export const resourceProducer=s=>{const amount=income(s);return amount?{resource:'gold',amount,perMinute:amount*60,interval:1,active:true}:null;};
export const specializationResource=key=>BALANCE.elfProgression.specializations[key]?.resource||null;
export const upgradeCost=(s,pathId=null,specializationId=null)=>{
  const target=(s?.tier||0)+1,lateStart=BALANCE.economy.lateTier,earlyLevels=Math.max(0,Math.min(lateStart-4,s.tier-4)),lateLevels=Math.max(0,s.tier-lateStart),goldScale=Math.pow(BALANCE.progression.costGrowth,earlyLevels)*Math.pow(BALANCE.progression.lateStructureCostGrowth,lateLevels),discount=BALANCE.elfProgression.defenseUpgradeCost[s.kind],late=target>lateStart,goldDiscount=discount?(late?discount.lateGold:discount.earlyGold):1,epicBand=s.kind==='tower'&&target>=16&&target<=BALANCE.epic.tier?(discount?.epicBand||1):1,woodScale=Math.pow(BALANCE.progression.woodCostGrowth,earlyLevels)*Math.pow(BALANCE.progression.lateStructureWoodCostGrowth,lateLevels),woodDiscount=discount?(late?discount.lateWood:discount.earlyWood):1,projectEfficiency=s.epicProject&&target<=BALANCE.epic.tier?BALANCE.epic.projectCostMultiplier:1,crystal=crystalUpgradeCost(s,target);
  return {gold:Math.round(BALANCE.structures[s.kind].upgradeGold*Math.pow(1.9,Math.min(3,s.tier-1))*goldScale*goldDiscount*epicBand*projectEfficiency),wood:Math.round(BALANCE.structures[s.kind].upgradeWood*Math.pow(1.5,Math.min(3,s.tier-1))*woodScale*woodDiscount*epicBand*projectEfficiency),...(crystal?{specialResource:'crystal',specialAmount:crystal}:{})};
};
export const trollCost=(key,level)=>Math.round(scaled(BALANCE.upgrades[key].cost*Math.pow(BALANCE.upgrades[key].growth,Math.min(4,level)),BALANCE.progression.costGrowth,level-4));
export const trollUpgradeBranch=key=>Object.entries(TROLL_UPGRADE_BRANCHES).find(([,branch])=>branch.keys.includes(key))?.[0]||null;
export const trollBranchPoints=(levels,branchId)=>TROLL_UPGRADE_BRANCHES[branchId]?.keys.reduce((sum,key)=>sum+(levels?.[key]||0),0)||0;
export function trollUpgradeStatus(levels,key){
  const level=levels?.[key]||0,max=BALANCE.upgrades[key]?.max??BALANCE.maxTier,target=level+1,branchId=trollUpgradeBranch(key),band=TROLL_GROWTH_BANDS.find(row=>target>=row.from&&target<=row.to)||TROLL_GROWTH_BANDS.at(-1),points=trollBranchPoints(levels,branchId);
  if(level>=max)return {allowed:false,code:'max',message:'Melhoria no nível máximo.',branchId,band,points};
  return {allowed:true,code:'ready',message:'Disponível.',branchId,band,points};
}
export const trollHealth=level=>scaled(BALANCE.troll.hp+Math.min(4,level)*BALANCE.troll.healthPerLevel,BALANCE.progression.healthGrowth,level-4);
export const wispCost=count=>({gold:Math.round(scaled(BALANCE.wisps.gold,BALANCE.wisps.hireGrowth,count)),wood:Math.round(scaled(BALANCE.wisps.wood,1.15,count))});
export const wispUpgradeCost=level=>({gold:Math.round(scaled(BALANCE.wisps.upgradeGold,BALANCE.wisps.costGrowth,level-1)),wood:Math.round(scaled(BALANCE.wisps.upgradeWood,1.3,level-1))});
export const wispIncome=w=>BALANCE.wisps.income*Math.pow(BALANCE.wisps.incomeGrowth,Math.min(BALANCE.economy.lateTier-1,Math.max(0,w.level-1)))*Math.pow(BALANCE.economy.lateWispGrowth,Math.max(0,w.level-BALANCE.economy.lateTier))*(w.rich?BALANCE.wisps.externalBonus:1);
export const trollLateThreatMultiplier=trollLevel=>Math.max(BALANCE.economy.trollLateThreatMinimum,1/(1+Math.max(0,(trollLevel||1)-BALANCE.economy.trollLateThreatDiminishingLevel)*BALANCE.economy.trollLateThreatLevelPressure));
export const trollLateThreatIncome=(activeElapsed,elfTeamIncome,matureBases,legendaryStructures=0,trollLevel=1)=>{
  if(activeElapsed<BALANCE.economy.trollLateThreatStart||matureBases<=0)return null;
  const raw=BALANCE.economy.trollLateThreatBase+BALANCE.economy.trollLateThreatLogScale*Math.log1p(Math.max(0,elfTeamIncome)/BALANCE.economy.trollLateThreatReference)+matureBases*BALANCE.economy.trollLateThreatMatureBase+legendaryStructures*BALANCE.economy.trollLateThreatLegendary;
  const soft=BALANCE.economy.trollLateThreatSoftCap,softened=raw<=soft?raw:soft+(raw-soft)*BALANCE.economy.trollLateThreatOverflowRate;
  return clamp(softened,BALANCE.economy.trollLateThreatBase,BALANCE.economy.trollLateThreatCap)*trollLateThreatMultiplier(trollLevel);
};
export function scaling(alive,totalIncome,bases,time) {
  const lobby=BALANCE.economy.trollLobbyBonus[Math.max(0,Math.min(BALANCE.maxElves,alive))]||0;
  return 1+lobby+Math.min(0.12,totalIncome/600)+Math.min(0.08,bases*0.01)+Math.min(0.1,time/6000);
}
