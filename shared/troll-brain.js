import { BALANCE as B, distance, income, trollCost } from './config.js';
import { ITEMS, BUILDS } from './equipment.js';
import { combatRisk, evaluateThreatAt } from './combat-risk.js';
import { pathfind, toCell, walkable, index } from './map.js';
import { StrategicMap } from './strategic-map.js';

export const TROLL_STATES=Object.freeze(['explore','hunt','probe','siege','breach','chase','reposition','disengage','recover','rotate','finisher']);

// Decisions use own state, visible opponents and dated observations only.
export class TrollBrain {
  constructor(){this.state='explore';this.targetId=null;this.committedUntil=0;this.avoid=[];this.safePoint=null;this.lastHp=null;this.lastTime=0;this.damageRate=0;this.engagedAt=0;this.recoveryUntil=0;this.reengageAfter=0;this.lastReceived=0;this.strategicMap=new StrategicMap();this.probedBases=new Map();this.probe=null;this.siege=null;this.siegeDecision=null;this.reposition=null;this.repositionReadyAt=0;this.strategy=null;this.failedSieges=0;this.failedChases=0;this.strategyChanges=0;this.chase=null;this.observedIds=new Set();this.discoveredBases=new Set();this.targetFailures=new Map();this.blockedBases=new Map();this.navigationBlockedTargets=new Map();this.retreatStartHpRatio=null;this.safeSince=null;this.hpTrend=0;this.mode='standard';this.lastProgressValue=0;this.lastProgressAt=null;this.stagnationEvents=0;this.lastStagnationAt=-Infinity;this.director=null;this.adaptation={until:0,modifiers:{}};}
  phase(m){const elapsed=Math.max(0,m.time-m.preparation);return elapsed<180?'hunt':elapsed<420?'pressure':elapsed<720?'siege':'endgame';}
  powerValue(u){return Object.values(u.levels||{}).reduce((sum,level)=>sum+level,0)+(u.inventory?.length||0)*2;}
  finisherMode(m){const active=m.units.filter(unit=>unit.role==='elf'&&unit.alive).length,allKnown=m.elfBasesClaimed.size>0&&[...m.elfBasesClaimed].every(id=>this.discoveredBases.has(id));return active<=2&&allKnown;}
  targetFailure(id){return this.targetFailures.get(id)||{failures:0,lastPower:0,suppressedUntil:0,tradeScores:[],fortified:false,siegeLevel:0,equipmentCount:0,targetHpRatio:1,knownTowers:0,legendary:false};}
  knownTowerCount(m,baseId){return [...this.strategicMap.observations.values()].filter(o=>o.kind==='tower'&&o.baseId===baseId&&o.hp>0&&m.time-o.seenAt<180).length;}
  recordTargetOutcome(m,u,id,successful,tradeScore=0){
    if(!id)return;const row=this.targetFailure(id);
    if(successful){this.targetFailures.delete(id);return;}
    const target=m.entity(id);row.failures++;row.lastPower=this.powerValue(u);row.suppressedUntil=m.time+600;row.siegeLevel=u.levels.siege||0;row.equipmentCount=u.inventory?.length||0;row.legendary=m.legendarySword(u);row.targetHpRatio=target?target.hp/Math.max(1,target.maxHp):row.targetHpRatio;row.knownTowers=this.knownTowerCount(m,target?.baseId);row.tradeScores=[...row.tradeScores.slice(-1),tradeScore];if(row.tradeScores.length>=2&&row.tradeScores.every(score=>score<.5))row.fortified=true;this.targetFailures.set(id,row);
  }
  targetSuppressed(m,u,target){const row=this.targetFailure(target.id),changed=this.powerValue(u)>=row.lastPower+3||(u.levels.siege||0)>row.siegeLevel||(u.inventory?.length||0)>row.equipmentCount||(m.legendarySword(u)&&!row.legendary)||(target.hp/Math.max(1,target.maxHp))<row.targetHpRatio-.2||this.knownTowerCount(m,target.baseId)<row.knownTowers;return row.failures>=3&&!changed&&m.time<row.suppressedUntil;}
  knownEconomy(m,known){return known.filter(e=>['core','mine'].includes(e.kind)&&e.progress===1).reduce((total,e)=>total+income(e)*Math.exp(-Math.max(0,m.time-(e.seenAt||m.time))/120),0);}
  updateDirector(c,m,u,visible){
    this.lastProgressAt??=m.time;
    for(const entity of visible)this.observedIds.add(entity.id);
    const progress=(u.stats.damage||0)+(u.stats.structuresDestroyed||0)*100+(u.stats.kills||0)*200+this.observedIds.size*20;
    if(progress>this.lastProgressValue+.01){this.lastProgressValue=progress;this.lastProgressAt=m.time;}
    const stagnantFor=Math.max(0,m.time-this.lastProgressAt),stagnant=stagnantFor>=90;
    if(stagnant&&m.time-this.lastStagnationAt>=60){
      this.lastStagnationAt=m.time;this.stagnationEvents++;if(this.strategy!=='raider'){this.strategy='raider';this.strategyChanges++;}
      const target=m.entity(this.targetId);if(target)this.avoid.push({id:null,x:target.x,z:target.z,until:m.time+20});
      this.targetId=null;this.probe=null;c.exploreTarget=null;
    }
    this.mode=this.finisherMode(m)?'finisher':'standard';
    this.director={phase:this.phase(m),mode:this.mode,stagnant,stagnantFor:+stagnantFor.toFixed(1),strategy:this.strategy,failedSieges:this.failedSieges,failedChases:this.failedChases,stagnationEvents:this.stagnationEvents};
  }
  chaseBudget(m,u,target,evaluation){
    const d=distance(u,target),easy=target.role==='elf'&&!target.ghost&&(target.hp<m.trollStats(u).damage*2||d<8),danger=evaluation?.danger;
    return target.ghost?4:easy?20:(danger?.towers>0||d>12?9:15);
  }
  targetScore(m,u,target,known,stats){
    const phase=this.phase(m),weights={hunt:{economy:.7,kill:1.5,siege:.7,denial:.7,vulnerability:1.2},pressure:{economy:1.1,kill:1.25,siege:1.1,denial:1,vulnerability:1.3},siege:{economy:1.4,kill:1,siege:1.3,denial:1.2,vulnerability:1.25},endgame:{economy:1.15,kill:1.4,siege:1.25,denial:1.6,vulnerability:1.35}}[phase],strategyWeights={hunter:{economy:.8,kill:1.45,siege:.85},siegebreaker:{economy:.9,kill:.8,siege:1.4},raider:{economy:1.45,kill:.9,siege:.9},adaptive:{economy:1,kill:1,siege:1}}[this.strategy||'adaptive'];
    const d=Math.max(.01,distance(u,target)),reach=stats.range+(target.kind?B.structures[target.kind].radius:0)-.35,approach={x:target.x+(u.x-target.x)/d*Math.min(d,reach),z:target.z+(u.z-target.z)/d*Math.min(d,reach)},danger=evaluateThreatAt(m,u,known,{position:approach,target,path:[u,approach]}),hpRatio=target.hp/Math.max(1,target.maxHp),economicValue=target.kind==='mine'?70+(target.tier||1)*8:target.kind==='core'?65+(target.tier||1)*10:target.role==='wisp'?25:0,easyKill=target.role==='elf'&&!target.ghost&&(d<8||target.hp<stats.damage*2),killValue=target.role==='elf'&&!target.ghost?(easyKill?150:45):target.ghost?5:0,siegeValue={tower:200,wall:160,core:130,mine:65,workshop:45}[target.kind]||0,progressionDenial=(target.tier||0)*7+(target.legendary?100:0)+(target.kind==='tower'?danger.dps*5:0),vulnerability=(1-hpRatio)*100+100/(1+danger.killSeconds),opportunity=1/(1+danger.riskScore*2+danger.killSeconds/25),sector=this.strategicMap.report(m,u).find(s=>s.id===this.strategicMap.idAt(m,target)),failurePenalty=sector?.failedSieges||0,travelCost=d/Math.max(1,stats.movement),opportunityCost=this.knownEconomy(m,known)*travelCost;
    const strategicNumerator=economicValue*weights.economy*strategyWeights.economy+killValue*weights.kill*strategyWeights.kill+siegeValue*weights.siege*strategyWeights.siege+progressionDenial*weights.denial+vulnerability*weights.vulnerability;
    return {score:strategicNumerator*opportunity/(1+travelCost*.05+failurePenalty*.4+opportunityCost*.002),danger,opportunity,economicValue,killValue,siegeValue,progressionDenial,vulnerability,travelCost,opportunityCost,phase,strategy:this.strategy};
  }
  beginSiege(m,u,target,evaluation){
    if(this.siege?.targetId===target.id)return;
    if(this.siege)this.finishSiegeMemory(m,u,false);
    const sectorId=this.strategicMap.idAt(m,target),failures=this.strategicMap.report(m,u).find(s=>s.id===sectorId)?.failedSieges||0;
    this.siege={targetId:target.id,sectorId,point:{x:target.x,z:target.z},start:m.time,startHp:u.hp,startMaxHp:u.maxHp,targetStartHp:target.hp,targetMaxHp:target.maxHp||target.hp,minCommitUntil:m.time+4,maxDuration:Math.min(40,18+failures*4),maxHpLoss:Math.min(.42,.22+failures*.04),targetValueRequired:Math.max(.2,.45-failures*.05),previousFailures:failures,healsAtStart:m.telemetry.healing.uses,evaluation};
  }
  finishSiegeMemory(m,u,successful){
    if(!this.siege)return;const siege=this.siege,tradeScore=this.siegeDecision?.tradeScore||0;this.strategicMap.recordSiege(m,siege.point,successful);this.recordTargetOutcome(m,u,siege.targetId,successful,tradeScore);
    if(successful)this.failedSieges=Math.max(0,this.failedSieges-1);else{this.failedSieges++;if(this.failedSieges%5===0){const strategies=['hunter','raider','siegebreaker'];this.strategy=strategies[(strategies.indexOf(this.strategy)+1+strategies.length)%strategies.length];this.strategyChanges++;}}
    this.siege=null;this.siegeDecision=null;
  }
  evaluateSiege(m,u){
    const siege=this.siege;if(!siege)return null;const target=m.entity(siege.targetId);
    if(!target||target.hp<=0){this.finishSiegeMemory(m,u,true);return null;}
    const duration=Math.max(0,m.time-siege.start),hpLoss=Math.max(0,siege.startHp-u.hp),hpLossPercent=hpLoss/Math.max(1,siege.startMaxHp),objectiveProgress=Math.max(0,Math.min(1,(siege.targetStartHp-target.hp)/Math.max(1,siege.targetStartHp))),stats=m.trollStats(u),hit=stats.damage*stats.siege*((u.cooldowns.heavy||0)<=m.time?stats.heavy:1),objectiveCompletionProbability=Math.max(objectiveProgress,target.hp<=hit?1:Math.min(.95,objectiveProgress+u.hp/Math.max(1,u.maxHp)*.25)),healsUsed=Math.max(0,m.telemetry.healing.uses-siege.healsAtStart),benefit=objectiveProgress*(1+(siege.evaluation?.economicValue||0)/200)+(target.hp<=0?1:0),cost=Math.max(.1,hpLossPercent+duration/60+healsUsed*.15),tradeScore=benefit/cost,nearCompletion=target.hp/Math.max(1,target.maxHp)<=.15||target.hp<=hit,budgetExceeded=hpLossPercent>=siege.maxHpLoss||duration>=siege.maxDuration,shouldExit=budgetExceeded&&!nearCompletion&&tradeScore<siege.targetValueRequired;
    this.siegeDecision={targetId:target.id,duration:+duration.toFixed(2),hpLossPercent:+(hpLossPercent*100).toFixed(2),objectiveProgress:+objectiveProgress.toFixed(3),objectiveCompletionProbability:+objectiveCompletionProbability.toFixed(3),tradeScore:+tradeScore.toFixed(3),withinCommitment:m.time<siege.minCommitUntil,budgetExceeded,nearCompletion,shouldExit};return this.siegeDecision;
  }
  tick(c,m,u){
    if(m.state!=='MATCH_ACTIVE'){c.stop(u);return;}
    const now=m.time,visible=m.visibleEnemies(u),elapsed=Math.max(.1,now-this.lastTime);this.strategicMap.update(m,u,visible);this.strategy??=['hunter','siegebreaker','raider'][[...m.map.seed].reduce((n,ch)=>n+ch.charCodeAt(0),0)%3];
    if(c.navigationFailure){
      const failed=c.navigationFailure==='point'?null:visible.find(e=>e.id===c.navigationFailure)||c.discovered.get(c.navigationFailure);
      if(failed){this.avoid.push({id:failed.id,x:failed.x,z:failed.z,until:now+12});this.recordTargetOutcome(m,u,failed.id,false,0);this.navigationBlockedTargets.set(failed.id,{until:now+90,destroyed:u.stats.structuresDestroyed||0});const wall=failed.kind!=='wall'&&failed.baseId?[...c.discovered.values()].find(entity=>entity.kind==='wall'&&entity.baseId===failed.baseId&&entity.hp>0):null;if(failed.kind!=='wall'&&failed.baseId)this.blockedBases.set(failed.baseId,{wallId:wall?.id||null,until:now+(wall?300:30),destroyed:u.stats.structuresDestroyed||0});}
      if(this.targetId===c.navigationFailure)this.targetId=null;
      this.safePoint=null;c.navigationFailure=null;
    }
    const received=u.stats.damageReceived||0;this.damageRate=this.damageRate*.55+Math.max(0,received-this.lastReceived)/elapsed*.45;this.lastReceived=received;this.hpTrend=(u.hp-(this.lastHp??u.hp))/elapsed;
    this.lastHp=u.hp;this.lastTime=now;
    for(const e of visible){c.discovered.set(e.id,{id:e.id,x:e.x,z:e.z,kind:e.kind,role:e.role,hp:e.hp,maxHp:e.maxHp,tier:e.tier,branch:e.branch,progress:e.progress,disabledUntil:e.disabledUntil,baseId:e.baseId,seenAt:now});if(e.baseId)this.discoveredBases.add(e.baseId);}
    for(const[id,e]of c.discovered)if((m.canSee(u,e)&&!visible.some(a=>a.id===id))||now-e.seenAt>(e.role?8:100))c.discovered.delete(id);
    for(const[baseId,block]of this.blockedBases)if(now>=block.until||(u.stats.structuresDestroyed||0)>block.destroyed||(block.wallId&&!c.discovered.has(block.wallId)))this.blockedBases.delete(baseId);
    for(const[id,block]of this.navigationBlockedTargets)if(now>=block.until||(u.stats.structuresDestroyed||0)>block.destroyed||!c.discovered.has(id))this.navigationBlockedTargets.delete(id);
    this.updateDirector(c,m,u,visible);
    this.avoid=this.avoid.filter(a=>a.until>now);
    const knownTowers=[...c.discovered.values()].filter(e=>e.kind==='tower'&&e.progress===1);
    const threatened=now-u.lastHit<3,stats=m.trollStats(u),legendaryAssault=m.legendarySword(u)&&now>B.finalAge;
    const risk=p=>evaluateThreatAt(m,u,[...c.discovered.values()],{position:p}).dps;
    const known=[...c.discovered.values()],localRisk=combatRisk(m,u,known);
    const dps=Math.max(this.damageRate,localRisk.dps);this.riskScore=localRisk;
    const needsProjection=threatened&&knownTowers.length&&(u.hp/u.maxHp<.65||u.hp/Math.max(1,dps)<12);
    let escapePlan=null;if(needsProjection){const cached=this.escapePlanCache;if(cached&&now-cached.at<1.5&&distance(u,cached.origin)<4)escapePlan=cached.plan;else{escapePlan=this.planEscape(c,m,u,knownTowers);this.escapePlanCache={at:now,origin:{x:u.x,z:u.z},plan:escapePlan};}}
    this.projectedEscapeHp=escapePlan?(u.hp-escapePlan.damage)/Math.max(1,u.maxHp):1;
    this.purchase(m,u,threatened,knownTowers);
    const finisher=this.mode==='finisher',avoided=e=>!finisher&&this.avoid.some(a=>a.id?a.id===e.id:distance(a,e)<16),dependencyBlocked=e=>this.navigationBlockedTargets.has(e.id)||(e.kind!=='wall'&&e.baseId&&this.blockedBases.has(e.baseId)),rawCandidates=visible.filter(e=>!dependencyBlocked(e)&&!m.wallBlocks(u,e)&&!avoided(e)),evaluations=new Map(rawCandidates.map(e=>[e.id,this.targetScore(m,u,e,known,stats)])),score=e=>evaluations.get(e.id)?.score||0,available=rawCandidates.filter(e=>!this.targetSuppressed(m,u,e));
    const candidates=available.length?available:finisher?rawCandidates.filter(e=>e.kind==='wall'):[];
    candidates.sort((a,b)=>score(b)-score(a));this.candidateEvaluations=rawCandidates.sort((a,b)=>score(b)-score(a)).slice(0,8).map(e=>({id:e.id,suppressed:this.targetSuppressed(m,u,e),fortified:this.targetFailure(e.id).fortified,...evaluations.get(e.id)}));
    let target=candidates[0];
    const current=candidates.find(e=>e.id===this.targetId);
    if(this.chase&&current)this.chase.lastSeen={x:current.x,z:current.z};
    if(current&&now<this.committedUntil&&(!target||score(current)>=score(target)*.8))target=current;
    if(this.chase&&this.chase.targetId===this.targetId&&now-this.chase.startedAt>=this.chase.budget){
      const escaped=this.chase.lastSeen,failed=(u.stats.kills||0)<=this.chase.killsAtStart;if(failed)this.failedChases++;if(failed&&escaped)this.avoid.push({id:this.chase.targetId,x:escaped.x,z:escaped.z,until:now+8});if(failed&&this.failedChases%3===0&&this.strategy!=='raider'){this.strategy='raider';this.strategyChanges++;}
      this.chase=null;this.targetId=null;target=candidates.find(e=>!this.avoid.some(a=>a.id===e.id))||null;c.exploreTarget=null;
    }
    const inRange=target&&distance(u,target)<=stats.range+(target.kind?B.structures[target.kind].radius:0);
    // A cheap worker is not worth ignoring lethal tower fire. Account for the real heavy cooldown.
    const targetRisk=target?evaluateThreatAt(m,u,known,{position:u,target,path:[u,target]}):localRisk;
    const finishing=inRange&&targetRisk.killSeconds+targetRisk.escapeSeconds+2<u.hp/Math.max(1,dps)&&targetRisk.killSeconds<3;
    const survival=u.hp/Math.max(1,dps),health=u.hp/u.maxHp;
    const emergency=threatened&&(health<=.24||survival<3.5),overextended=threatened&&((survival<7&&!finishing)||(u.exposure>B.troll.exposureGrace+5&&survival<20&&!finishing)),predictiveEscape=!legendaryAssault&&threatened&&localRisk.towers>0&&this.projectedEscapeHp<.2&&!finishing;
    // Long inactivity changes only the bot's priorities. It must never alter
    // health: a human Troll may wait, scout or return to the Sanctuary safely.
    const idlePressure=now>B.idlePressureAge-10&&now-u.lastAttack>B.idlePressureGrace-10;
    const healingAvailable=(u.healCharges||0)>0&&!(u.cooldowns.heal>now)&&u.hp<u.maxHp*.92;
    if(threatened&&health<.55&&healingAvailable)m.act(u.id,{type:'heal'});
    const sustainedByHeal=(u.healingUntil||0)>now&&health>.24,siegeDecision=this.evaluateSiege(m,u),commitmentProtected=siegeDecision?.withinCommitment&&!emergency,deathRisk=Math.max(0,(8-survival)/8)+Math.max(0,.35-health)*2,escapeDifficulty=escapePlan?Math.max(0,escapePlan.damage/Math.max(1,u.hp)):.15,negativeTrade=siegeDecision?Math.max(0,.45-siegeDecision.tradeScore):0,objectiveHope=siegeDecision?.objectiveCompletionProbability||0,availableSustain=healingAvailable ? .25 : 0,retreatNeed=deathRisk+escapeDifficulty+negativeTrade-objectiveHope*.55-availableSustain;this.retreatNeed={score:+retreatNeed.toFixed(3),deathRisk:+deathRisk.toFixed(3),escapeDifficulty:+escapeDifficulty.toFixed(3),negativeTrade:+negativeTrade.toFixed(3),objectiveHope:+objectiveHope.toFixed(3),availableSustain};
    if(this.reposition){
      if(emergency){this.reposition=null;}else if(now<this.reposition.until&&(threatened||risk(u)>1)){this.state='reposition';c.go(m,u,this.reposition.point,1.5);return;}else{this.avoid.push({id:null,x:this.reposition.origin.x,z:this.reposition.origin.z,until:now+6});this.reposition=null;this.repositionReadyAt=now+8;this.safePoint=null;this.state='rotate';c.exploreTarget=null;}
    }
    if(siegeDecision?.shouldExit&&!threatened&&!commitmentProtected){if(this.siege)this.avoid.push({id:null,x:this.siege.point.x,z:this.siege.point.z,until:now+20});if(this.siege)this.finishSiegeMemory(m,u,false);this.targetId=null;this.state='rotate';c.exploreTarget=null;c.stop(u);return;}
    // During a siege, its adaptive HP/time budget owns ordinary tactical
    // exits. Raw low trade immediately after the four-second commitment was
    // causing a repeatable 4.2 s attack/reposition loop before the budget had
    // any chance to work.
    const tacticalExit=siegeDecision?(overextended||siegeDecision.shouldExit):(overextended||retreatNeed>.45),repositionNeeded=now>=this.repositionReadyAt&&!commitmentProtected&&!emergency&&(localRisk.towers>0||this.damageRate>0)&&!finishing&&tacticalExit,fullDisengage=emergency||predictiveEscape||(!commitmentProtected&&retreatNeed>1.05);
    if(!c.retreating&&repositionNeeded&&!fullDisengage){
      if(siegeDecision?.shouldExit&&this.siege)this.avoid.push({id:null,x:this.siege.point.x,z:this.siege.point.z,until:now+20});if(this.siege)this.finishSiegeMemory(m,u,false);this.reposition={point:escapePlan?.point||this.planEscape(c,m,u,knownTowers)?.point||m.map.trollSpawn,origin:{x:u.x,z:u.z},until:now+4,resumeTarget:this.targetId};this.state='reposition';this.targetId=null;c.go(m,u,this.reposition.point,1.5);return;
    }
    if(!c.retreating&&fullDisengage){
      if(siegeDecision?.shouldExit&&this.siege)this.avoid.push({id:null,x:this.siege.point.x,z:this.siege.point.z,until:now+20});
      if(this.siege)this.finishSiegeMemory(m,u,false);
      c.retreating=true;c.metrics.retreatAttempts++;this.state='disengage';this.safePoint=escapePlan?.point||null;this.recoveryUntil=0;this.retreatStartHpRatio=health;this.safeSince=null;m.telemetry.retreatStart(m,u);
      this.targetId=null;c.exploreTarget=null;
    }
    if(c.retreating){
      const recovering=!threatened&&risk(u)<1;
      if(recovering)this.safeSince??=now;else this.safeSince=null;
      if(recovering&&health<.5&&healingAvailable)m.act(u.id,{type:'heal'});
      const atSanctuary=distance(u,m.map.trollSpawn)<=B.troll.sanctuaryRadius-1;
      const sanctuaryTravel=distance(u,m.map.trollSpawn)/Math.max(1,stats.movement*B.movement.sprint),returnToSanctuary=recovering&&health<.38&&!idlePressure&&!atSanctuary&&sanctuaryTravel<10;
      if(returnToSanctuary){this.state='recover';this.safePoint=m.map.trollSpawn;this.recoveryUntil=0;c.go(m,u,this.safePoint,B.troll.sanctuaryRadius-1);return;}
      // Count the recovery window only after the Troll actually reaches
      // safety. Previously most of the 18 seconds elapsed while it was still
      // escaping tower fire, forcing it to reengage at critically low HP.
      if(recovering&&!this.recoveryUntil)this.recoveryUntil=now+18;
      else if(!recovering)this.recoveryUntil=0;
      const requiredHp=this.retreatStartHpRatio<.2?.55:Math.min(.7,Math.max(.48,(this.retreatStartHpRatio||0)+.2)),safeFor=this.safeSince===null?0:now-this.safeSince,recoveredEnough=safeFor>=3&&this.hpTrend>=-.01&&health>=requiredHp;
      if(recovering&&recoveredEnough){
        c.retreating=false;this.safePoint=null;this.state='rotate';c.exploreTarget=null;c.metrics.retreatSuccesses++;this.reengageAfter=now+6;this.retreatStartHpRatio=null;this.safeSince=null;m.telemetry.reengage(m,u);
      }else{
        if(recovering){this.state='recover';c.stop(u);return;}
        this.state='disengage';
        if(!this.safePoint||risk(this.safePoint)>2||distance(u,this.safePoint)<2)this.safePoint=this.planEscape(c,m,u,knownTowers)?.point||m.map.trollSpawn;
        // AIController.follow is the single movement application point for a tick.
        c.go(m,u,this.safePoint,1.2);
        if(threatened&&Math.hypot(u.input.x,u.input.z)>.5&&!(u.cooldowns.dash>now))m.act(u.id,{type:'dash'});
        if(visible.some(e=>e.kind==='tower'&&distance(u,e)<B.troll.roarRange)&&!(u.cooldowns.roar>now))m.act(u.id,{type:'roar'});
        return;
      }
    }
    if(target&&!avoided(target)){
      if(this.targetId!==target.id){if(this.targetId)c.metrics.targetChanges++;this.targetId=target.id;this.committedUntil=now+4;this.engagedAt=now;}
      const failure=this.targetFailure(target.id),meaningfulAlternative=candidates.some(entity=>entity.id!==target.id&&!this.targetSuppressed(m,u,entity)&&score(entity)>=score(target)*.6),committedBreach=m.settings.breachEnabled&&finisher&&target.kind==='wall'&&failure.fortified&&!meaningfulAlternative;
      const probeKey=target.kind?(target.baseId||target.id):null,probeFresh=probeKey&&(this.probedBases.get(probeKey)||-Infinity)>now-90;
      // A fortified final wall has already supplied enough evidence through
      // repeated failed engagements. Re-probing it under tower fire can be
      // interrupted before completion forever, so FINISHER commits to BREACH.
      if(target.kind&&!probeFresh&&!committedBreach){
        if(distance(u,target)>12){this.state='hunt';c.go(m,u,target,10);return;}
        if(!this.probe||this.probe.key!==probeKey)this.probe={key:probeKey,targetId:target.id,start:now,until:now+3,startDamage:u.stats.damageReceived||0};
        this.state='probe';const probeReach=Math.max(10,stats.range+(B.structures[target.kind]?.radius||0)+5);c.go(m,u,target,probeReach);
        if(now<this.probe.until)return;
        const measuredDps=Math.max(0,(u.stats.damageReceived||0)-this.probe.startDamage)/Math.max(.1,now-this.probe.start),evaluation=evaluations.get(target.id),unsafe=measuredDps>u.maxHp*.055||evaluation?.danger.riskScore>1.05;
        this.probedBases.set(probeKey,now);this.probe=null;
        if(unsafe){this.avoid.push({id:null,x:target.x,z:target.z,until:now+25});this.strategicMap.recordSiege(m,target,false);this.recordTargetOutcome(m,u,target.id,false,0);this.targetId=null;this.state='rotate';c.exploreTarget=null;c.stop(u);return;}
      }
      this.targetEvaluation={id:target.id,...evaluations.get(target.id)};this.state=['elf','wisp'].includes(target.role)?'chase':committedBreach?'breach':'siege';
      if(['siege','breach'].includes(this.state)){this.chase=null;this.beginSiege(m,u,target,evaluations.get(target.id));}else{if(!this.chase||this.chase.targetId!==target.id)this.chase={targetId:target.id,startedAt:now,budget:this.chaseBudget(m,u,target,evaluations.get(target.id)),knownEconomy:+this.knownEconomy(m,known).toFixed(2),killsAtStart:u.stats.kills||0,lastSeen:{x:target.x,z:target.z}};if(this.siege)this.finishSiegeMemory(m,u,false);}
      const reach=stats.range+(target.kind?B.structures[target.kind].radius:0)-.35;
      if(c.go(m,u,target,reach)){
        u.yaw=Math.atan2(target.x-u.x,target.z-u.z);
        if(threatened&&visible.some(e=>e.kind==='tower'&&distance(u,e)<B.troll.roarRange)&&!(u.cooldowns.roar>now))m.act(u.id,{type:'roar'});
        m.act(u.id,{type:'attack',heavy:!(u.cooldowns.heavy>now)});
      }else if(target.role==='elf'&&distance(u,target)>8&&distance(u,target)<18&&dps<10){if(!(u.cooldowns.dash>now)&&Math.hypot(u.input.x,u.input.z)>.5)m.act(u.id,{type:'dash'});}
      return;
    }
    this.targetId=null;this.probe=null;this.state=this.avoid.length?'rotate':'explore';
    const memories=[...c.discovered.values()].filter(e=>!avoided(e)&&(!this.targetSuppressed(m,u,e)||finisher)).sort((a,b)=>distance(u,a)-distance(u,b));
    if(memories.length){this.state='hunt';c.go(m,u,memories[0],3);return;}
    if(finisher){const persistent=[...this.strategicMap.observations.values()].filter(e=>e.kind&&e.hp>0).sort((a,b)=>b.seenAt-a.seenAt||distance(u,a)-distance(u,b));if(persistent[0]){this.state='finisher';c.go(m,u,persistent[0],8);return;}}
    c.explore(m,u);
  }
  planEscape(c,m,u,knownTowers){
    const blocked=c.navigationBlocks(m,u),obstacles=[...c.discovered.values()].filter(e=>e.kind),stats=m.trollStats(u),speed=stats.movement*B.movement.sprint*(u.slowUntil>m.time?B.branches.frost.slow:1),options=[];
    for(const radius of [12,22,32])for(let i=0;i<12;i++)options.push({x:u.x+Math.sin(i*Math.PI/6)*radius,z:u.z+Math.cos(i*Math.PI/6)*radius});
    options.push({...m.map.trollSpawn,sanctuary:true});
    const plans=[];
    for(const p of options){
      const cell=toCell(m.map,p),clear=[[0,0],[B.movement.trollRadius,0],[-B.movement.trollRadius,0],[0,B.movement.trollRadius],[0,-B.movement.trollRadius]].every(([dx,dz])=>{const edge=toCell(m.map,{x:p.x+dx,z:p.z+dz});return walkable(m.map,edge.x,edge.z);})&&!obstacles.some(s=>distance(p,s)<B.structures[s.kind].radius+B.movement.trollRadius);
      if(!clear||blocked.has(index(m.map,cell.x,cell.z)))continue;
      const route=pathfind(m.map,u,p,blocked),start=toCell(m.map,u);if(!route.length&&(start.x!==cell.x||start.z!==cell.z))continue;
      const points=[u,...route];if(!route.length||distance(route.at(-1),p)>.05)points.push(p);
      const threat=evaluateThreatAt(m,u,knownTowers,{position:p,path:points}),length=points.slice(1).reduce((sum,point,i)=>sum+distance(points[i],point),0),damage=threat.pathDamage;
      if(threat.dps<1)plans.push({point:p,damage,length,score:damage+length*.2+(p.sanctuary&&u.hp/u.maxHp<.45?-12:0)});
    }
    plans.sort((a,b)=>a.score-b.score);return plans[0]||null;
  }
  purchase(m,u,threatened,towers){
    if(!u.pendingStrike&&m.time-u.lastHit>=5&&m.time-u.lastAttack>=5&&Object.values(u.levels).reduce((a,b)=>a+b,0)>=2){
      this.build??=Object.values(BUILDS)[[...m.map.seed].reduce((n,c)=>n+c.charCodeAt(0),0)%3];
      const item=this.build.items.find(id=>!u.inventory.includes(id)&&u.gold>=ITEMS[id].cost);
      if(item){m.act(u.id,{type:'buyItem',item});return;}
    }
    const injured=u.hp/u.maxHp<.6,armored=towers.some(t=>t.branch==='pierce'),obstacle=this.siege?m.entity(this.siege.targetId):m.entity(this.targetId),failure=obstacle?this.targetFailure(obstacle.id):null,obstacleRisk=this.targetEvaluation?.danger,wallTtk=obstacle?.kind==='wall'?(obstacleRisk?.killSeconds||Infinity):0;
    this.build??=Object.values(BUILDS)[[...m.map.seed].reduce((n,c)=>n+c.charCodeAt(0),0)%3];
    const archetype=this.build.name==='Cerco'?{damage:1.18,siege:1.45,armor:1.15,utility:1.12}:this.build.name==='Caçador'?{damage:1.2,speed:1.35,movement:1.45,utility:1.1}:{health:1.35,regen:1.45,armor:1.2,utility:1.12};
    const weights={damage:5,speed:3.7,siege:4.5,health:injured?13:3,armor:threatened&&!armored?9:3,regen:u.hp<u.maxHp*.85?10:4,movement:this.state==='chase'?6:1.5,utility:towers.length>1?4:1};
    for(const[key,multiplier]of Object.entries(archetype))weights[key]*=multiplier;
    const retreats=m.controllers.get(u.id)?.metrics?.retreatAttempts||0,negativeSieges=(failure?.tradeScores||[]).filter(score=>score<.5).length;
    if(m.settings.adaptiveBuildEnabled&&m.time>=this.adaptation.until){const modifiers={};if(this.failedSieges>=2||negativeSieges>=2||wallTtk>45)modifiers.siege=1.35;if((obstacleRisk?.dps||0)>u.maxHp*.025||retreats>=3){modifiers.armor=1.25;modifiers.health=1.25;modifiers.regen=1.25;}if(this.failedChases>=2)modifiers.movement=1.3;this.adaptation={until:m.time+50,modifiers};}
    for(const[key,multiplier]of Object.entries(m.settings.adaptiveBuildEnabled?this.adaptation.modifiers:{}))weights[key]*=Math.min(1.35,multiplier);
    if(u.slowUntil>m.time)weights.movement+=3;
    const options=Object.keys(weights).filter(k=>u.levels[k]<(B.upgrades[k].max??B.maxTier)&&u.gold>=trollCost(k,u.levels[k]));
    options.sort((a,b)=>weights[b]/(1+u.levels[b]*1.2)-weights[a]/(1+u.levels[a]*1.2));
    if(options[0])m.act(u.id,{type:'buy',key:options[0]});
  }
}
