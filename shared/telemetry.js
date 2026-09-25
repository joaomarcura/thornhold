import { BALANCE as B, income, towerDamage, towerProfile, wispIncome } from './config.js';

const round=(value,digits=2)=>Number.isFinite(value)?+value.toFixed(digits):0;
const sum=values=>values.reduce((total,value)=>total+value,0);
const copyLedger=ledger=>Object.fromEntries(Object.entries(ledger||{}).map(([key,value])=>[key,{gold:round(value.gold||0),wood:round(value.wood||0)}]));
const ledgerTotal=(units,key)=>Object.fromEntries(['economy','defense','other'].map(category=>[category,{gold:round(sum(units.map(u=>u.stats[key]?.[category]?.gold||0))),wood:round(sum(units.map(u=>u.stats[key]?.[category]?.wood||0)))}]));
const actionTotal=units=>Object.fromEntries(['construction','upgrade','training','repair','other'].map(action=>[action,{gold:round(sum(units.map(u=>u.stats.spendByAction?.[action]?.gold||0))),wood:round(sum(units.map(u=>u.stats.spendByAction?.[action]?.wood||0)))}]));
const phaseFor=elapsed=>elapsed<180?'HUNT':elapsed<420?'PRESSURE':elapsed<720?'SIEGE':'ENDGAME';
const confidenceFor=age=>Math.exp(-Math.max(0,age)/120);

// V2.1 is deliberately observational. Controllers never read these values,
// so diagnostics cannot secretly influence a match outcome.
export class CombatTelemetry {
  constructor(detailed=false){
    this.detailed=detailed;this.timeline=[];this.nextSample=0;this.hits=new Map();
    this.received={tower:0,elf:0,hunger:0,other:0};this.dealt=0;this.dealtToBuildings=0;this.combatSeconds=0;this.retreatSeconds=0;this.movingWithoutCombatSeconds=0;
    this.healing={consumable:0,regen:0,sanctuary:0,uses:0};this.retreats=[];this.currentRetreat=null;
    this.engagementCount=0;this.lastContact=-Infinity;this.peakTowers=0;this.peakAttackers=0;
    this.towersSeconds=0;this.death=null;this.destroyed={};this.eliminations=[];this.towerDiagnostics=new Map();
    this.stateSeconds={};this.stateTransitions=[];this.previousState=null;
    this.sectors=new Map();this.lastSectorId=null;this.discoveredBases=new Set();
    this.sieges=[];this.currentSiege=null;this.nextSiegeId=1;
    this.economyCheckpoints=[];this.checkpointTimes=[180,300,480,600,720,900,1200,1500,1800,2100,2400,2700,3000,3300,3600];this.nextCheckpoint=0;
    this.pressureWindows=[];this.nextPressureAt=60;this.pressureBaseline=null;
    this.matchState=null;this.matchStateTimeline=[];
    this.progressionMilestones={firstLegendaryStructureAt:null,firstLegendaryTowerAt:null,firstEpicStructureAt:null,trollLegendarySwordAt:null};
  }
  towerState(tower,status,dt){
    if(!tower)return;let row=this.towerDiagnostics.get(tower.id);
    if(!row){row={id:tower.id,owner:tower.owner||null,branch:tower.branch||'power',tier:tower.tier||1,shots:0,reasons:{},seconds:{},closestDistance:null};this.towerDiagnostics.set(tower.id,row);}
    row.branch=tower.branch||row.branch;row.tier=tower.tier||row.tier;row.reasons[status.reason]=(row.reasons[status.reason]||0)+1;row.seconds[status.reason]=(row.seconds[status.reason]||0)+dt;
    if(Number.isFinite(status.distance))row.closestDistance=row.closestDistance===null?status.distance:Math.min(row.closestDistance,status.distance);
  }
  towerShot(id){const row=this.towerDiagnostics.get(id);if(row)row.shots++;}
  sectorId(m,entity){
    if(!entity||!Number.isFinite(entity.x)||!Number.isFinite(entity.z))return null;
    const width=Math.max(1,(m.map.size-1)*m.map.cell),x=Math.max(0,Math.min(5,Math.floor(entity.x/width*6))),z=Math.max(0,Math.min(5,Math.floor(entity.z/width*6)));
    return `${x}:${z}`;
  }
  sector(m,entity){
    const id=this.sectorId(m,entity);if(!id)return null;
    if(!this.sectors.has(id)){const[x,z]=id.split(':').map(Number);this.sectors.set(id,{id,x,z,visits:0,secondsVisited:0,lastVisitedAt:null,lastEnemySeenAt:null,damageTaken:0,damageDealt:0,structuresDestroyed:0,elvesKilled:0,knownStructureIds:new Set(),knownElfIds:new Set()});}
    return this.sectors.get(id);
  }
  hit(m,target,actual,source,kind,sourceId){
    const destroyed=target.hp<=0;
    if(target.kind&&destroyed)this.destroyed[target.kind]=(this.destroyed[target.kind]||0)+1;
    if(destroyed&&target.role&&!target.ghost)this.eliminations.push({time:m.time,id:target.id,role:target.role,cause:kind,source:sourceId||source?.id||null});
    if(target.role==='troll'){
      const category=kind==='tower'||kind==='legendary-beam'?'tower':kind==='hunger'?'hunger':source?.role==='elf'?'elf':'other';
      this.received[category]+=actual;if(kind!=='hunger')this.hits.set(sourceId||source?.id||kind,{time:m.time,kind:category});
      if(destroyed)this.death={time:m.time,cause:kind,source:sourceId||source?.id||null};
      const sector=this.sector(m,target);if(sector)sector.damageTaken+=actual;if(this.currentSiege)this.currentSiege.hpDamage+=actual;
    }
    if(source?.role==='troll'){
      this.dealt+=actual;if(target.kind)this.dealtToBuildings+=actual;
      const sector=this.sector(m,target);if(sector){sector.damageDealt+=actual;if(destroyed&&target.kind)sector.structuresDestroyed++;if(destroyed&&target.role==='elf'&&!target.ghost)sector.elvesKilled++;}
      if(this.currentSiege){
        this.currentSiege.damageDealt+=actual;if(target.kind)this.currentSiege.structureDamage+=actual;if(target.role==='elf'&&!target.ghost)this.currentSiege.killProgress+=actual/Math.max(1,target.maxHp);
        if(destroyed&&target.kind){const economicDamage=['core','mine'].includes(target.kind)?income(target)*60:0,objectiveValue={tower:45,wall:35,core:70,mine:50,workshop:30}[target.kind]||20;this.currentSiege.valueDestroyed+=objectiveValue+economicDamage;this.currentSiege.economicDamage+=economicDamage;this.currentSiege.structuresDestroyed[target.kind]=(this.currentSiege.structuresDestroyed[target.kind]||0)+1;}
        if(destroyed&&target.role==='elf'&&!target.ghost)this.currentSiege.elvesKilled++;
      }
    }
    if(source?.role==='troll'||(target.role==='troll'&&kind!=='hunger')){if(m.time-this.lastContact>5)this.engagementCount++;this.lastContact=m.time;}
  }
  heal(kind,actual){if(actual>0)this.healing[kind]=(this.healing[kind]||0)+actual;}
  healUse(){this.healing.uses++;if(this.currentSiege)this.currentSiege.healsUsed++;}
  retreatStart(m,u){if(this.currentRetreat)return;this.currentRetreat={start:m.time,hpPercent:u.hp/Math.max(1,u.maxHp)};}
  reengage(m,u){if(!this.currentRetreat)return;this.retreats.push({...this.currentRetreat,end:m.time,duration:m.time-this.currentRetreat.start,reengageHpPercent:u.hp/Math.max(1,u.maxHp)});this.currentRetreat=null;}
  trollState(m,troll,controller,dt){
    const state=controller?.retreating?(controller?.brain?.state||'disengage').toUpperCase():(controller?.brain?.state||'human').toUpperCase();
    this.stateSeconds[state]=(this.stateSeconds[state]||0)+dt;
    if(state!==this.previousState){if(this.stateTransitions.length<1000)this.stateTransitions.push({time:round(m.time,1),from:this.previousState,to:state,target:controller?.brain?.targetId||null});this.previousState=state;}
    const siegeNow=state==='SIEGE'||state==='BREACH';
    if(siegeNow&&!this.currentSiege){const target=m.entity(controller?.brain?.targetId);this.currentSiege={id:this.nextSiegeId++,start:m.time,startHp:troll.hp,startMaxHp:troll.maxHp,startGoldGenerated:troll.stats.goldGenerated||0,targetId:target?.id||null,targetKind:target?.kind||target?.role||null,targetTier:target?.tier||0,targetStartHp:target?.hp||null,targetMaxHp:target?.maxHp||null,sectorId:this.sectorId(m,troll),damageDealt:0,structureDamage:0,hpDamage:0,valueDestroyed:0,economicDamage:0,killProgress:0,elvesKilled:0,healsUsed:0,breachStacksReached:target?.breachStacks||0,structuresDestroyed:{}};}
    if(siegeNow&&this.currentSiege){const target=m.entity(this.currentSiege.targetId);this.currentSiege.breachStacksReached=Math.max(this.currentSiege.breachStacksReached||0,target?.breachStacks||0);}
    else if(!siegeNow&&this.currentSiege)this.finishSiege(m,troll,state);
  }
  finishSiege(m,troll,outcomeState='END'){
    const siege=this.currentSiege;if(!siege)return;const duration=Math.max(.01,m.time-siege.start),hpLoss=Math.max(0,siege.startHp-troll.hp),hpLossPercent=hpLoss/Math.max(1,siege.startMaxHp)*100,numerator=siege.valueDestroyed+siege.killProgress*80+siege.structureDamage/100,cooldownCost=siege.healsUsed*10,denominator=Math.max(1,hpLossPercent+cooldownCost+duration*.5),siegeEfficiency=siege.valueDestroyed/Math.max(1,duration+hpLossPercent+cooldownCost),successful=siege.valueDestroyed>0||siege.elvesKilled>0;
    this.sieges.push({...siege,end:m.time,duration:round(duration),endHp:troll.hp,hpLost:round(hpLoss),hpLoss:round(hpLoss),hpLossPercent:round(hpLossPercent),goldEarned:round((troll.stats.goldGenerated||0)-siege.startGoldGenerated),cooldownCost:round(cooldownCost),tradeScore:round(numerator/denominator,3),siegeEfficiency:round(siegeEfficiency,4),successful,reasonEnded:outcomeState,outcomeState});this.currentSiege=null;
  }
  sampleSectors(m,troll,controller,dt){
    const sector=this.sector(m,troll);if(!sector)return;if(sector.id!==this.lastSectorId){sector.visits++;this.lastSectorId=sector.id;}sector.secondsVisited+=dt;sector.lastVisitedAt=m.time;
    for(const observed of controller?.discovered?.values?.()||[]){const row=this.sector(m,observed);if(!row)continue;row.lastEnemySeenAt=Math.max(row.lastEnemySeenAt??-Infinity,observed.seenAt||m.time);if(observed.kind)row.knownStructureIds.add(observed.id);if(observed.role==='elf')row.knownElfIds.add(observed.id);if(observed.baseId)this.discoveredBases.add(observed.baseId);}
  }
  economySnapshot(m,time){
    const elves=m.units.filter(u=>u.role==='elf'),troll=m.units.find(u=>u.role==='troll'),structures=m.structures.filter(s=>s.hp>0&&s.progress>=1),wisps=m.wisps.filter(w=>w.alive),elfGoldIncome=sum(structures.map(s=>income(s))),elfWoodIncome=sum(wisps.map(w=>wispIncome(w))),generatedGold=sum(elves.map(u=>u.stats.goldGenerated||0)),generatedWood=sum(elves.map(u=>u.stats.woodGenerated||0)),spentGold=sum(elves.map(u=>u.stats.goldSpent||0)),spentWood=sum(elves.map(u=>u.stats.woodSpent||0)),refundedGold=sum(elves.map(u=>u.stats.goldRefunded||0)),refundedWood=sum(elves.map(u=>u.stats.woodRefunded||0)),netGold=Math.max(0,spentGold-refundedGold),netWood=Math.max(0,spentWood-refundedWood),availableGold=generatedGold+elves.length*B.elf.gold,availableWood=generatedWood+elves.length*B.elf.wood;
    const trollStats=troll?m.trollStats(troll):null,elfPower=sum(structures.map(s=>s.hp))+sum(structures.filter(s=>s.kind==='tower').map(s=>towerDamage(s.tier)*towerProfile(s).damage))*20+elfGoldIncome*100,trollPower=troll?troll.hp+trollStats.damage/trollStats.interval*trollStats.siege*35+trollStats.armor*50:0,totalElfInvestment=netGold+netWood,totalTrollInvestment=troll?.stats.goldSpent||0,highestStructureLevel=Math.max(0,...structures.map(s=>s.tier||1)),highestTrollUpgrade=troll?Math.max(0,...Object.values(troll.levels||{})):0;
    return {time,matchTime:round(m.time,1),snowball:{elfPower:round(elfPower),trollPower:round(trollPower),powerRatio:round(trollPower/Math.max(1,elfPower),4),elfIncomePerSecond:round(elfGoldIncome+elfWoodIncome),trollIncomePerSecond:round((troll?.stats.goldGenerated||0)/Math.max(1,time)),totalElfInvestment:round(totalElfInvestment),totalTrollInvestment:round(totalTrollInvestment),highestStructureLevel,highestTrollUpgrade,elfLegendary:structures.some(s=>s.legendary),trollLegendary:!!troll&&m.legendarySword(troll),activeElves:elves.filter(u=>u.alive).length},elves:{generatedGold:round(generatedGold),generatedWood:round(generatedWood),spentGold:round(spentGold),spentWood:round(spentWood),refundedGold:round(refundedGold),refundedWood:round(refundedWood),netSpentGold:round(netGold),netSpentWood:round(netWood),storedGold:round(sum(elves.map(u=>u.gold||0))),storedWood:round(sum(elves.map(u=>u.wood||0))),spendByPurpose:ledgerTotal(elves,'spendByPurpose'),spendByAction:actionTotal(elves),upgrades:sum(elves.map(u=>u.stats.upgrades||0)),structuresBuilt:sum(elves.map(u=>u.stats.structuresBuilt||0)),goldIncomePerSecond:round(elfGoldIncome),woodIncomePerSecond:round(elfWoodIncome),liveStructures:Object.fromEntries(['core','wall','tower','mine','workshop'].map(kind=>[kind,structures.filter(s=>s.kind===kind).length])),tierSum:sum(structures.map(s=>s.tier||1)),economicEfficiency:round((netGold+netWood)/Math.max(1,availableGold+availableWood),3),goldUtilization:round(netGold/Math.max(1,availableGold),3),woodUtilization:round(netWood/Math.max(1,availableWood),3),players:elves.map(u=>{const playerNetGold=Math.max(0,(u.stats.goldSpent||0)-(u.stats.goldRefunded||0)),playerNetWood=Math.max(0,(u.stats.woodSpent||0)-(u.stats.woodRefunded||0));return {id:u.id,alive:u.alive,profile:m.controllers.get(u.id)?.elfProfile||'human',generatedGold:round(u.stats.goldGenerated||0),generatedWood:round(u.stats.woodGenerated||0),spentGold:round(u.stats.goldSpent||0),spentWood:round(u.stats.woodSpent||0),storedGold:round(u.gold||0),storedWood:round(u.wood||0),goldUtilization:round(playerNetGold/Math.max(1,(u.stats.goldGenerated||0)+B.elf.gold),3),woodUtilization:round(playerNetWood/Math.max(1,(u.stats.woodGenerated||0)+B.elf.wood),3),spendByPurpose:copyLedger(u.stats.spendByPurpose),spendByAction:copyLedger(u.stats.spendByAction)};})},troll:troll?{generatedGold:round(troll.stats.goldGenerated||0),spentGold:round(troll.stats.goldSpent||0),storedGold:round(troll.gold||0),upgrades:troll.stats.upgrades||0,damage:round(troll.stats.damage||0),structuresDestroyed:troll.stats.structuresDestroyed||0}:null};
  }
  pressureSample(m,activeElapsed=Math.max(0,m.time-m.preparation)){
    const economy=this.economySnapshot(m,activeElapsed),current={time:activeElapsed,structuresDestroyed:sum(Object.values(this.destroyed)),buildingDamage:this.dealtToBuildings,elfKills:this.eliminations.filter(e=>e.role==='elf').length,basesDiscovered:this.discoveredBases.size,towerDamage:this.received.tower,elfIncome:economy.elves.goldIncomePerSecond+economy.elves.woodIncomePerSecond,retreatSeconds:this.retreatSeconds,legendaryProgress:m.structures.filter(s=>s.owner&&s.tier>=B.legendary.tier&&s.hp>0).length};
    this.pressureBaseline??={time:0,structuresDestroyed:0,buildingDamage:0,elfKills:0,basesDiscovered:0,towerDamage:0,elfIncome:0,retreatSeconds:0,legendaryProgress:0};
    const d=Object.fromEntries(Object.keys(current).filter(k=>k!=='time').map(k=>[k,current[k]-this.pressureBaseline[k]])),trollPressure=d.structuresDestroyed*30+d.buildingDamage*.02+d.elfKills*60+d.basesDiscovered*10,elfPressure=d.towerDamage*.02+Math.max(0,d.elfIncome)*8+d.retreatSeconds*.5+Math.max(0,d.legendaryProgress)*35,previous=this.pressureWindows.at(-1);
    this.pressureWindows.push({start:this.pressureBaseline.time,end:m.time,components:d,trollPressure:round(trollPressure),elfPressure:round(elfPressure),pressureGap:round(trollPressure-elfPressure),trollMomentum:round(trollPressure-(previous?.trollPressure||0)),elfMomentum:round(elfPressure-(previous?.elfPressure||0))});this.pressureBaseline=current;
  }
  updateMatchState(m,troll){
    const activeElapsed=Math.max(0,m.time-m.preparation),economy=this.economySnapshot(m,m.time),stats=m.trollStats(troll),structures=m.structures.filter(s=>s.hp>0&&s.progress>=1),towers=structures.filter(s=>s.kind==='tower'),elfPower=sum(structures.map(s=>s.hp))+sum(towers.map(s=>towerDamage(s.tier)*towerProfile(s).damage))*20+economy.elves.goldIncomePerSecond*100,trollPower=troll.hp+stats.damage/stats.interval*stats.siege*35+stats.armor*50,latest=this.pressureWindows.at(-1)||{elfPressure:0,trollPressure:0};
    this.matchState={phase:phaseFor(activeElapsed),elapsedTime:round(activeElapsed,1),elfPower:round(elfPower),trollPower:round(trollPower),elfPressure:latest.elfPressure,trollPressure:latest.trollPressure,elfEconomy:round(economy.elves.goldIncomePerSecond+economy.elves.woodIncomePerSecond),trollEconomy:round((troll.stats.goldGenerated||0)/Math.max(1,activeElapsed)*60),activeElfCount:m.units.filter(u=>u.role==='elf'&&u.alive).length,mapControl:{claimedBases:m.elfBasesClaimed.size,discoveredBases:this.discoveredBases.size,visitedSectors:[...this.sectors.values()].filter(s=>s.visits>0).length,totalSectors:36},volatility:round(Math.abs(latest.trollMomentum||0)+Math.abs(latest.elfMomentum||0))};
  }
  step(m,dt){
    const troll=m.units.find(u=>u.role==='troll');if(!troll)return;for(const[id,hit]of this.hits)if(m.time-hit.time>2)this.hits.delete(id);
    const towers=[...this.hits.values()].filter(h=>h.kind==='tower').length;this.peakTowers=Math.max(this.peakTowers,towers);this.peakAttackers=Math.max(this.peakAttackers,this.hits.size);this.towersSeconds+=towers*dt;
    const controller=m.controllers.get(troll.id),active=m.state==='MATCH_ACTIVE',activeElapsed=Math.max(0,m.time-m.preparation),inCombat=m.time-this.lastContact<=5,retreating=!!controller?.retreating;if(active&&inCombat)this.combatSeconds+=dt;if(active&&retreating)this.retreatSeconds+=dt;if(active&&!inCombat&&!retreating&&Math.hypot(troll.input?.x||0,troll.input?.z||0)>.1)this.movingWithoutCombatSeconds+=dt;
    if(active){this.trollState(m,troll,controller,dt);this.sampleSectors(m,troll,controller,dt);const live=m.structures.filter(s=>s.hp>0&&s.progress>=1);if(this.progressionMilestones.firstLegendaryStructureAt===null&&live.some(s=>s.legendary))this.progressionMilestones.firstLegendaryStructureAt=round(activeElapsed,1);if(this.progressionMilestones.firstLegendaryTowerAt===null&&live.some(s=>s.kind==='tower'&&s.legendary))this.progressionMilestones.firstLegendaryTowerAt=round(activeElapsed,1);if(this.progressionMilestones.firstEpicStructureAt===null&&live.some(s=>s.epic))this.progressionMilestones.firstEpicStructureAt=round(activeElapsed,1);if(this.progressionMilestones.trollLegendarySwordAt===null&&m.legendarySword(troll))this.progressionMilestones.trollLegendarySwordAt=round(activeElapsed,1);}
    while(this.nextCheckpoint<this.checkpointTimes.length&&activeElapsed>=this.checkpointTimes[this.nextCheckpoint])this.economyCheckpoints.push(this.economySnapshot(m,this.checkpointTimes[this.nextCheckpoint++]));
    while(activeElapsed>=this.nextPressureAt){this.pressureSample(m,this.nextPressureAt);this.nextPressureAt+=60;}
    if(m.time>=this.nextSample||!troll.alive){this.nextSample=m.time+5;this.updateMatchState(m,troll);if(this.matchStateTimeline.length<1000)this.matchStateTimeline.push({...this.matchState});if(this.detailed){const stats=m.trollStats(troll);this.timeline.push({time:round(m.time,1),hp:Math.round(troll.hp),maxHp:troll.maxHp,x:round(troll.x,1),z:round(troll.z,1),state:controller?.brain?.state||'human',target:controller?.brain?.targetId||null,risk:controller?.brain?.riskScore??null,towers,received:{...this.received},damage:this.dealt,armor:stats.armor,combatRegen:stats.combatRegen,restRegen:stats.restRegen,movement:stats.movement,levels:{...troll.levels},economy:m.units.map(u=>({id:u.id,gold:Math.floor(u.gold),wood:Math.floor(u.wood),goldGenerated:Math.round(u.stats.goldGenerated),woodGenerated:Math.round(u.stats.woodGenerated)}))});}}
  }
  result(m){
    const troll=m.units.find(u=>u.role==='troll'),activeElapsed=Math.max(0,m.time-m.preparation);if(this.currentSiege&&troll)this.finishSiege(m,troll,'MATCH_END');if(this.pressureBaseline?.time!==activeElapsed)this.pressureSample(m,activeElapsed);if(!this.matchState&&troll)this.updateMatchState(m,troll);
    const duration=Math.max(1,m.time),received=sum(Object.values(this.received)),retreats=[...this.retreats];if(this.currentRetreat)retreats.push({...this.currentRetreat,end:m.time,duration:m.time-this.currentRetreat.start,reengageHpPercent:null});const avg=key=>retreats.length?sum(retreats.map(r=>r[key]??0))/retreats.length:0;
    const sectors=[...this.sectors.values()].map(s=>{const age=s.lastVisitedAt===null?Infinity:m.time-s.lastVisitedAt;return {...s,secondsVisited:round(s.secondsVisited),damageTaken:round(s.damageTaken),damageDealt:round(s.damageDealt),confidence:s.lastVisitedAt===null?0:round(confidenceFor(age),3),knownStructureIds:[...s.knownStructureIds],knownElfIds:[...s.knownElfIds]};}),successful=this.sieges.filter(s=>s.successful);
    const live=m.structures.filter(s=>s.hp>0&&s.progress>=1),kinds=['core','wall','tower','mine','workshop'],progression={milestones:{...this.progressionMilestones},final:{trollLevels:{...troll.levels},trollLevelSum:sum(Object.values(troll.levels||{})),trollLegendarySword:m.legendarySword(troll),highestStructureTier:Object.fromEntries(kinds.map(kind=>[kind,Math.max(0,...live.filter(s=>s.kind===kind).map(s=>s.tier||1))])),legendaryStructures:live.filter(s=>s.legendary).length,epicStructures:live.filter(s=>s.epic).length}};
    return {schema:5,received:{...this.received},dealt:this.dealt,dealtToBuildings:this.dealtToBuildings,combatSeconds:this.combatSeconds,retreatSeconds:this.retreatSeconds,movingWithoutCombatSeconds:this.movingWithoutCombatSeconds,combatTimePercent:this.combatSeconds/duration*100,retreatTimePercent:this.retreatSeconds/duration*100,movingWithoutCombatPercent:this.movingWithoutCombatSeconds/duration*100,averageRetreatDuration:avg('duration'),averageRetreatHpPercent:avg('hpPercent')*100,averageReengageHpPercent:avg('reengageHpPercent')*100,retreats,healing:{...this.healing},receivedDps:received/duration,dealtDps:this.dealt/duration,damagePerMinute:this.dealt/duration*60,buildingDamagePerMinute:this.dealtToBuildings/duration*60,combatReceivedDps:(received-this.received.hunger)/Math.max(1,this.combatSeconds),combatDealtDps:this.dealt/Math.max(1,this.combatSeconds),engagementCount:this.engagementCount,averageEngagementSeconds:this.combatSeconds/Math.max(1,this.engagementCount),peakSimultaneousTowers:this.peakTowers,peakSimultaneousAttackers:this.peakAttackers,averageSimultaneousTowers:this.towersSeconds/duration,death:this.death,trollSurvivalSeconds:this.death?.time??m.time,survivalCensored:!this.death,timeToElfDefeat:['army-eliminated','all-elf-bases-destroyed'].includes(m.endReason)?m.time:null,structuresDestroyed:{...this.destroyed},eliminations:this.eliminations,towerDiagnostics:[...this.towerDiagnostics.values()].map(row=>({...row,seconds:Object.fromEntries(Object.entries(row.seconds).map(([key,value])=>[key,round(value)])),closestDistance:row.closestDistance===null?null:round(row.closestDistance)})),timeline:this.timeline,v2:{observational:true,matchState:this.matchState,matchStateTimeline:this.matchStateTimeline,stateSeconds:Object.fromEntries(Object.entries(this.stateSeconds).map(([key,value])=>[key,round(value)])),stateTransitions:this.stateTransitions,sectors,sieges:this.sieges,siegeSummary:{count:this.sieges.length,successful:successful.length,failed:this.sieges.length-successful.length,successRate:this.sieges.length?round(successful.length/this.sieges.length*100,1):0,averageSeconds:this.sieges.length?round(sum(this.sieges.map(s=>s.duration))/this.sieges.length):0,averageHpLossPercent:this.sieges.length?round(sum(this.sieges.map(s=>s.hpLossPercent))/this.sieges.length):0,averageTradeScore:this.sieges.length?round(sum(this.sieges.map(s=>s.tradeScore))/this.sieges.length,3):0,averageSiegeEfficiency:this.sieges.length?round(sum(this.sieges.map(s=>s.siegeEfficiency||0))/this.sieges.length,4):0},economyCheckpoints:this.economyCheckpoints,pressureWindows:this.pressureWindows,progression,formulaVersion:'v2.13-restricted-breach-1'}};
  }
}
