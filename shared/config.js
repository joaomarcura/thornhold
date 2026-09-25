export const STATES = Object.freeze({ MENU:'MAIN_MENU', LOBBY:'LOBBY', LOADING:'LOADING', PREP:'PREPARATION', ACTIVE:'MATCH_ACTIVE', END:'MATCH_END', RETURN:'RETURN_TO_LOBBY' });
export const BALANCE = {
  tick: 20, snapshot: 10, maxElves: 8, cell: 2.2, maxTier: 20, visualTier: 4,
  prep: 50, matchSeconds: 1200, finalAge: 210, idlePressureAge: 480, idlePressureGrace: 45,
  // The Troll needs enough sight to discover a refuge from the surrounding
  // trail without being given hidden base coordinates.
  vision: { troll: 30, elf: 24 }, interactRange: 6.5,
  movement:{sprint:1.25,elfSprint:1.4375,trollRadius:.64,elfRadius:.37},
  construction:{range:9.75,initialHealth:.15,breachCooldown:45,enemyClearance:5,gateClearance:2.3,placementGap:.5,placementRadius:{wall:.95},limits:{core:1,wall:1,tower:5,mine:5,workshop:1},upgradeSeconds:3},
  economy:{treeStock:1000,richWood:1.65,finalRichWood:2.5,workshopGather:.3,workshopRepair:.2,trollLobbyBonus:[0,0,.08,.12,.16,.2,.2,.2,.18],trollBountyFactor:[0,1.3,1.5,1.45,1.45,1.41,1.4,1.25,1.1],trollMapBounty:{compact:.9,large:1.1},trollLobbySiege:[1,1.15,1,1,1,1.1,1,1,1],trollScenarioBounty:{
    compact:{normal:[1,1,1,1,1,.94,1,1,1.06],hard:[1,1,1,1,1,1,1,1,1.06]},
    large:{}
  }},
  progression:{structureGrowth:1.18,costGrowth:1.35,woodCostGrowth:1.25,trollDamageGrowth:1.12,healthGrowth:1.14},
  wisps:{gold:65,wood:15,hireGrowth:1.32,trainSeconds:6,income:1.4,incomeGrowth:1.25,upgradeGold:70,upgradeWood:20,costGrowth:1.5,seconds:4,hp:55,externalBonus:1.6,range:25,regrowSeconds:35},
  combat:{buffer:.18,lightWindup:.1,heavyWindup:.32,comboWindow:2.8,comboBonus:.25,openingSeconds:1.2,openingBonus:.2},
  elf: { hp: 85, speed: 6.4, gold: 150, wood: 110, gather: 10, gatherInterval: 0.65, repair: 42, repairCost: 3, stunDuration:3, stunCooldown:60, stunRange:10, relocationSeconds:60 },
  ghost:{hp:55,vision:8,revealRadius:18,revealDuration:10,revealCooldown:60,goldReward:25},
  legendary:{tier:10,coreIncome:2,wallHealth:4,towerDps:325,rampPerSecond:.35,maxRamp:4,swordLevels:10,executeThreshold:.15},
  epic:{tier:20},
  tower:{specializations:false,standard:{damage:1.45,interval:1,range:0,armorPierce:0}},
  troll: { hp: 2200, speed: 5.8, travelSpeed:1.05, damage: 24, interval: 1.05, range: 3.6, armor: 1, gold: 0, goldPerDamage: 0.42, combatRegenRate:.001,restRegenRate:.003,combatRegenPerLevel:.0005,restRegenPerLevel:.001,regenLevelCap:10,sanctuaryRadius:6,sanctuaryRegenRate:.005,damageGrowth:1.18,speedFactor:.88,healthPerLevel:320,armorPerLevel:3,movementPerLevel:.08,siegePerLevel:.18,finalSiege:1.35,regenDelay:4,healPercent:.2,healCharges:2,healRecharge:180,healCooldown:75,healDuration:6,exposureGrace:9,exposureRate:.035,heavy: 2.25,heavyRecovery:1.3, heavyCooldown: 4, dashCooldown: 7,dashDuration:.4,dashSpeed:2.5, roarCooldown: 18,roarRange:9,roarDuration:2 },
  structures: {
    core: { name:'Núcleo', gold:65, wood:25, hp:360, radius:1.55, seconds:4, income:3, growth:1.65, upgradeGold:100, upgradeWood:35, color:0xe4c37a },
    wall: { name:'Barricada', gold:35, wood:40, hp:1100, radius:1.05, seconds:3, growth:1.9, upgradeGold:85, upgradeWood:30, color:0xa48862 },
    tower: { name:'Torre', gold:70, wood:35, hp:360, radius:0.9, seconds:4, damage:10.5, interval:1.2, range:17, retainRange:1, muzzleHeight:4.5, targetHeight:2, growth:1.65, upgradeGold:90, upgradeWood:40, color:0x81cabb },
    mine: { name:'Mina', gold:85, wood:35, hp:200, radius:1.05, seconds:5, income:1.3, growth:1.7, upgradeGold:110, upgradeWood:45, color:0xc2a54c },
    workshop: { name:'Oficina', gold:100, wood:50, hp:250, radius:1.1, seconds:5, growth:1.6, upgradeGold:125, upgradeWood:45, color:0x748fa3 }
  },
  branches: {
    power:{name:'Balista',description:'Mais dano por disparo',damage:1.45,interval:1,range:0,armorPierce:0},
    rapid:{name:'Rajada',description:'Disparos mais rápidos',damage:0.9,interval:0.6,range:0,armorPierce:0},
    frost:{name:'Gelo',description:'Reduz a velocidade do Troll',damage:0.8,interval:1,range:2,armorPierce:0,slow:0.65},
    pierce:{name:'Ruptura',description:'Ignora armadura e amplia alcance',damage:1,interval:1,range:5,armorPierce:1}
  },
  upgrades: {
    damage:{name:'Fúria',description:'Dano; crescimento suave após nível 4',cost:75,growth:1.8,max:20},
    speed:{name:'Frenesi',description:'Reduz intervalo; ganhos decrescentes',cost:90,growth:1.85,max:20},
    health:{name:'Vitalidade',description:'Mais vida máxima',cost:90,growth:1.8,max:20},
    armor:{name:'Pele de pedra',description:'Mais armadura',cost:85,growth:1.8,max:20},
    regen:{name:'Vigor',description:'Mais regeneração em combate e fora dele',cost:65,growth:1.85,max:20},
    movement:{name:'Passos largos',description:'Mais movimento; ganhos decrescentes',cost:70,growth:1.85,max:20},
    siege:{name:'Quebra-fortaleza',description:'Mais dano a estruturas',cost:110,growth:1.9,max:20},
    utility:{name:'Rugido ancestral',description:'Rugido e esquiva; ganhos decrescentes',cost:80,growth:1.8,max:20}
  },
  difficulty: { easy:{think:1.6,repair:0.55,retreat:0.42},normal:{think:0.7,repair:0.68,retreat:0.3},hard:{think:0.28,repair:0.75,retreat:0.18} }
};
export const MATCH_MODES=Object.freeze({
  custom:{name:'Personalizado',description:'O host controla mapa, lobby e regras.'},
  normal:{name:'Normal',description:'Regras oficiais sem pontuação ranqueada.',preset:{elfSlots:5,difficulty:'normal',mapSize:'compact',preparation:50,takeover:true,allowRoles:true}},
  ranked:{name:'Ranqueado',description:'Preset competitivo; MMR será ativado na etapa de filas.',preset:{elfSlots:5,difficulty:'normal',mapSize:'compact',preparation:50,takeover:true,allowRoles:false,private:false,local:false}}
});
export const DEFAULT_SETTINGS = { mode:'custom',elfSlots:5, difficulty:'normal', seed:'THORNHOLD', mapSize:'compact', preparation:50, private:true, local:false, region:'SA', takeover:true, allowRoles:true };
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export const mitigation=armor=>1/(1+0.055*Math.max(0,armor));
// Saturation remains defensive for fixtures and imported state; purchases stop at level 20.
export const scaled=(base,growth,level)=>Math.min(Number.MAX_SAFE_INTEGER,base*Math.pow(growth,Math.min(512,Math.max(0,level))));
export const tierScale=(growth,tier)=>scaled(Math.pow(growth,Math.min(3,tier-1)),BALANCE.progression.structureGrowth,Math.max(0,tier-4));
export const legendaryStructure=(kind,tier)=>tier>=BALANCE.legendary.tier&&['core','wall','tower'].includes(kind);
export const epicStructure=(kind,tier)=>tier>=BALANCE.epic.tier&&Object.hasOwn(BALANCE.structures,kind);
export const structureRewardHP=(kind,tier)=>BALANCE.structures[kind].hp*tierScale(BALANCE.structures[kind].growth,tier);
export const structureHP=(kind,tier)=>structureRewardHP(kind,tier)*(kind==='wall'&&legendaryStructure(kind,tier)?BALANCE.legendary.wallHealth:1);
export const towerDamage=tier=>BALANCE.structures.tower.damage*tierScale(BALANCE.structures.tower.growth,tier);
export const towerProfile=s=>BALANCE.tower.specializations?(BALANCE.branches[s?.branch]||BALANCE.branches.power):BALANCE.tower.standard;
export const placementRadius=kind=>BALANCE.construction.placementRadius[kind]??BALANCE.structures[kind].radius;
export const mineEconomy=coreTier=>{const tier=Math.max(1,Math.min(BALANCE.construction.limits.mine,Math.floor(coreTier||1))),costFactor=1+.25*(tier-1);return {tier,capacity:tier,cost:{gold:Math.round(BALANCE.structures.mine.gold*costFactor),wood:Math.round(BALANCE.structures.mine.wood*costFactor)},productionFactor:1+.3*(tier-1)};};
export const income=s=>(BALANCE.structures[s.kind].income||0)*tierScale(BALANCE.structures[s.kind].growth,s.tier)*(s.kind==='mine'?(s.coreTier>0?mineEconomy(s.coreTier).productionFactor:0):1)*(s.kind==='core'&&legendaryStructure(s.kind,s.tier)?BALANCE.legendary.coreIncome:1);
export const resourceProducer=s=>{const amount=income(s);return amount?{resource:'gold',amount,perMinute:amount*60,interval:1,active:true}:null;};
export const upgradeCost=s=>({gold:Math.round(scaled(BALANCE.structures[s.kind].upgradeGold*Math.pow(1.9,Math.min(3,s.tier-1)),BALANCE.progression.costGrowth,s.tier-4)),wood:Math.round(scaled(BALANCE.structures[s.kind].upgradeWood*Math.pow(1.5,Math.min(3,s.tier-1)),BALANCE.progression.woodCostGrowth,s.tier-4))});
export const trollCost=(key,level)=>Math.round(scaled(BALANCE.upgrades[key].cost*Math.pow(BALANCE.upgrades[key].growth,Math.min(4,level)),BALANCE.progression.costGrowth,level-4));
export const trollHealth=level=>scaled(BALANCE.troll.hp+Math.min(4,level)*BALANCE.troll.healthPerLevel,BALANCE.progression.healthGrowth,level-4);
export const wispCost=count=>({gold:Math.round(scaled(BALANCE.wisps.gold,BALANCE.wisps.hireGrowth,count)),wood:Math.round(scaled(BALANCE.wisps.wood,1.15,count))});
export const wispUpgradeCost=level=>({gold:Math.round(scaled(BALANCE.wisps.upgradeGold,BALANCE.wisps.costGrowth,level-1)),wood:Math.round(scaled(BALANCE.wisps.upgradeWood,1.3,level-1))});
export const wispIncome=w=>scaled(BALANCE.wisps.income,BALANCE.wisps.incomeGrowth,w.level-1)*(w.rich?BALANCE.wisps.externalBonus:1);
export function scaling(alive,totalIncome,bases,time) {
  const lobby=BALANCE.economy.trollLobbyBonus[Math.max(0,Math.min(BALANCE.maxElves,alive))]||0;
  return 1+lobby+Math.min(0.12,totalIncome/600)+Math.min(0.08,bases*0.01)+Math.min(0.1,time/6000);
}
