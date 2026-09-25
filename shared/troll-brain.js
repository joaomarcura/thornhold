import { BALANCE as B, distance, mitigation, trollCost, towerDamage, towerProfile } from './config.js';
import { ITEMS, BUILDS } from './equipment.js';
import { combatRisk } from './combat-risk.js';
import { lineOfSight, pathfind, toCell, walkable, index } from './map.js';
import { StrategicMap } from './strategic-map.js';

export const TROLL_STATES=Object.freeze(['explore','hunt','probe','siege','chase','reposition','disengage','recover','rotate']);

// Decisions use own state, visible opponents and dated observations only.
export class TrollBrain {
  constructor(){this.state='explore';this.targetId=null;this.committedUntil=0;this.avoid=[];this.safePoint=null;this.lastHp=null;this.lastTime=0;this.damageRate=0;this.engagedAt=0;this.recoveryUntil=0;this.reengageAfter=0;this.lastReceived=0;this.strategicMap=new StrategicMap();this.probedBases=new Map();this.probe=null;this.siege=null;this.siegeDecision=null;}
  phase(m){const elapsed=Math.max(0,m.time-m.preparation);return elapsed<180?'hunt':elapsed<420?'pressure':elapsed<720?'siege':'endgame';}
  targetScore(m,u,target,known,stats){
    const phase=this.phase(m),weights={hunt:{economy:.7,kill:1.5,siege:.7,denial:.7,vulnerability:1.2},pressure:{economy:1.1,kill:1.25,siege:1.1,denial:1,vulnerability:1.3},siege:{economy:1.4,kill:1,siege:1.3,denial:1.2,vulnerability:1.25},endgame:{economy:1.15,kill:1.4,siege:1.25,denial:1.6,vulnerability:1.35}}[phase];
    const d=Math.max(.01,distance(u,target)),reach=stats.range+(target.kind?B.structures[target.kind].radius:0)-.35,approach={x:target.x+(u.x-target.x)/d*Math.min(d,reach),z:target.z+(u.z-target.z)/d*Math.min(d,reach)},danger=combatRisk(m,u,known,approach,target),hpRatio=target.hp/Math.max(1,target.maxHp),economicValue=target.kind==='mine'?70+(target.tier||1)*8:target.kind==='core'?65+(target.tier||1)*10:target.role==='wisp'?25:0,easyKill=target.role==='elf'&&!target.ghost&&(d<8||target.hp<stats.damage*2),killValue=target.role==='elf'&&!target.ghost?(easyKill?150:45):target.ghost?5:0,siegeValue={tower:200,wall:160,core:130,mine:65,workshop:45}[target.kind]||0,progressionDenial=(target.tier||0)*7+(target.legendary?100:0)+(target.kind==='tower'?danger.dps*5:0),vulnerability=(1-hpRatio)*100+100/(1+danger.killSeconds),opportunity=1/(1+danger.riskScore*2+danger.killSeconds/25),sector=this.strategicMap.report(m,u).find(s=>s.id===this.strategicMap.idAt(m,target)),failurePenalty=sector?.failedSieges||0,travelCost=d/Math.max(1,stats.movement),numerator=economicValue*weights.economy+killValue*weights.kill+siegeValue*weights.siege+progressionDenial*weights.denial+vulnerability*weights.vulnerability;
    return {score:numerator*opportunity/(1+travelCost*.05+failurePenalty*.4),danger,opportunity,economicValue,killValue,siegeValue,progressionDenial,vulnerability,phase};
  }
  beginSiege(m,u,target,evaluation){
    if(this.siege?.targetId===target.id)return;
    if(this.siege)this.finishSiegeMemory(m,u,false);
    const sectorId=this.strategicMap.idAt(m,target),failures=this.strategicMap.report(m,u).find(s=>s.id===sectorId)?.failedSieges||0;
    this.siege={targetId:target.id,sectorId,point:{x:target.x,z:target.z},start:m.time,startHp:u.hp,startMaxHp:u.maxHp,targetStartHp:target.hp,targetMaxHp:target.maxHp||target.hp,minCommitUntil:m.time+4,maxDuration:Math.min(40,18+failures*4),maxHpLoss:Math.min(.42,.22+failures*.04),targetValueRequired:Math.max(.2,.45-failures*.05),previousFailures:failures,healsAtStart:m.telemetry.healing.uses,evaluation};
  }
  finishSiegeMemory(m,u,successful){if(!this.siege)return;this.strategicMap.recordSiege(m,this.siege.point,successful);this.siege=null;this.siegeDecision=null;}
  evaluateSiege(m,u){
    const siege=this.siege;if(!siege)return null;const target=m.entity(siege.targetId);
    if(!target||target.hp<=0){this.finishSiegeMemory(m,u,true);return null;}
    const duration=Math.max(0,m.time-siege.start),hpLoss=Math.max(0,siege.startHp-u.hp),hpLossPercent=hpLoss/Math.max(1,siege.startMaxHp),objectiveProgress=Math.max(0,Math.min(1,(siege.targetStartHp-target.hp)/Math.max(1,siege.targetStartHp))),stats=m.trollStats(u),hit=stats.damage*stats.siege*((u.cooldowns.heavy||0)<=m.time?stats.heavy:1),objectiveCompletionProbability=Math.max(objectiveProgress,target.hp<=hit?1:Math.min(.95,objectiveProgress+u.hp/Math.max(1,u.maxHp)*.25)),healsUsed=Math.max(0,m.telemetry.healing.uses-siege.healsAtStart),benefit=objectiveProgress*(1+(siege.evaluation?.economicValue||0)/200)+(target.hp<=0?1:0),cost=Math.max(.1,hpLossPercent+duration/60+healsUsed*.15),tradeScore=benefit/cost,nearCompletion=target.hp/Math.max(1,target.maxHp)<=.15||target.hp<=hit,budgetExceeded=hpLossPercent>=siege.maxHpLoss||duration>=siege.maxDuration,shouldExit=budgetExceeded&&!nearCompletion&&tradeScore<siege.targetValueRequired;
    this.siegeDecision={targetId:target.id,duration:+duration.toFixed(2),hpLossPercent:+(hpLossPercent*100).toFixed(2),objectiveProgress:+objectiveProgress.toFixed(3),objectiveCompletionProbability:+objectiveCompletionProbability.toFixed(3),tradeScore:+tradeScore.toFixed(3),withinCommitment:m.time<siege.minCommitUntil,budgetExceeded,nearCompletion,shouldExit};return this.siegeDecision;
  }
  tick(c,m,u){
    if(m.state!=='MATCH_ACTIVE'){c.stop(u);return;}
    const now=m.time,visible=m.visibleEnemies(u),elapsed=Math.max(.1,now-this.lastTime);this.strategicMap.update(m,u,visible);
    if(c.navigationFailure){
      const failed=c.navigationFailure==='point'?null:visible.find(e=>e.id===c.navigationFailure)||c.discovered.get(c.navigationFailure);
      if(failed)this.avoid.push({id:failed.id,x:failed.x,z:failed.z,until:now+12});
      if(this.targetId===c.navigationFailure)this.targetId=null;
      this.safePoint=null;c.navigationFailure=null;
    }
    const received=u.stats.damageReceived||0;this.damageRate=this.damageRate*.55+Math.max(0,received-this.lastReceived)/elapsed*.45;this.lastReceived=received;
    this.lastHp=u.hp;this.lastTime=now;
    for(const e of visible)c.discovered.set(e.id,{id:e.id,x:e.x,z:e.z,kind:e.kind,role:e.role,hp:e.hp,maxHp:e.maxHp,tier:e.tier,branch:e.branch,progress:e.progress,disabledUntil:e.disabledUntil,baseId:e.baseId,seenAt:now});
    for(const[id,e]of c.discovered)if((m.canSee(u,e)&&!visible.some(a=>a.id===id))||now-e.seenAt>(e.role?8:100))c.discovered.delete(id);
    this.avoid=this.avoid.filter(a=>a.until>now);
    const knownTowers=[...c.discovered.values()].filter(e=>e.kind==='tower'&&e.progress===1);
    const threatened=now-u.lastHit<3,stats=m.trollStats(u),legendaryAssault=m.legendarySword(u)&&now>B.finalAge;
    const risk=p=>knownTowers.reduce((d,t)=>{
      const branch=towerProfile(t);
      if(t.disabledUntil>now||distance(p,t)>B.structures.tower.range+branch.range||!lineOfSight(m.map,t,p,B.structures.tower.muzzleHeight,B.structures.tower.targetHeight))return d;
      return d+towerDamage(t.tier)*branch.damage/(B.structures.tower.interval*branch.interval)*mitigation(stats.armor*(1-branch.armorPierce));
    },0);
    const known=[...c.discovered.values()],localRisk=combatRisk(m,u,known);
    const dps=Math.max(this.damageRate,localRisk.dps);this.riskScore=localRisk;
    const needsProjection=threatened&&knownTowers.length&&(u.hp/u.maxHp<.65||u.hp/Math.max(1,dps)<12);
    let escapePlan=null;if(needsProjection){const cached=this.escapePlanCache;if(cached&&now-cached.at<1.5&&distance(u,cached.origin)<4)escapePlan=cached.plan;else{escapePlan=this.planEscape(c,m,u,knownTowers);this.escapePlanCache={at:now,origin:{x:u.x,z:u.z},plan:escapePlan};}}
    this.projectedEscapeHp=escapePlan?(u.hp-escapePlan.damage)/Math.max(1,u.maxHp):1;
    this.purchase(m,u,threatened,knownTowers);
    const avoided=e=>this.avoid.some(a=>a.id?a.id===e.id:distance(a,e)<16);
    const candidates=visible.filter(e=>!m.wallBlocks(u,e)&&!avoided(e)),evaluations=new Map(candidates.map(e=>[e.id,this.targetScore(m,u,e,known,stats)])),score=e=>evaluations.get(e.id)?.score||0;
    candidates.sort((a,b)=>score(b)-score(a));this.candidateEvaluations=candidates.slice(0,8).map(e=>({id:e.id,...evaluations.get(e.id)}));
    let target=candidates[0];
    const current=candidates.find(e=>e.id===this.targetId);
    if(current&&now<this.committedUntil&&(!target||score(current)>=score(target)*.8))target=current;
    const inRange=target&&distance(u,target)<=stats.range+(target.kind?B.structures[target.kind].radius:0);
    // A cheap worker is not worth ignoring lethal tower fire. Account for the real heavy cooldown.
    const targetRisk=target?combatRisk(m,u,known,u,target):localRisk;
    const finishing=inRange&&targetRisk.killSeconds+targetRisk.escapeSeconds+2<u.hp/Math.max(1,dps)&&targetRisk.killSeconds<3;
    const survival=u.hp/Math.max(1,dps),health=u.hp/u.maxHp;
    // After several successful retreats in the late game, stop replaying the
    // same safe loop. The Troll still preserves itself at truly critical HP,
    // but commits through ordinary pressure to force a result.
    const hardened=now>B.finalAge&&c.metrics.retreatAttempts>=5,lastStand=now>B.finalAge&&c.metrics.retreatAttempts>=10,decisiveAssault=legendaryAssault||hardened;
    const emergencyHealth=hardened&&!legendaryAssault ? .12 : .22,emergencySeconds=hardened&&!legendaryAssault?2.5:4;
    const emergency=!lastStand&&threatened&&(health<=emergencyHealth||survival<emergencySeconds);
    const overextended=threatened&&((survival<5.5&&!finishing)||(u.exposure>17&&survival<18&&!finishing));
    const predictiveEscape=!lastStand&&!decisiveAssault&&threatened&&localRisk.towers>0&&this.projectedEscapeHp<.25&&!finishing;
    // Long inactivity changes only the bot's priorities. It must never alter
    // health: a human Troll may wait, scout or return to the Sanctuary safely.
    const idlePressure=now>B.idlePressureAge-10&&now-u.lastAttack>B.idlePressureGrace-10;
    const healingAvailable=(u.healCharges||0)>0&&!(u.cooldowns.heal>now)&&u.hp<u.maxHp*.92;
    if(threatened&&health<.55&&healingAvailable)m.act(u.id,{type:'heal'});
    const sustainedByHeal=(u.healingUntil||0)>now&&health>.24,siegeDecision=this.evaluateSiege(m,u),commitmentProtected=siegeDecision?.withinCommitment&&!emergency,ordinaryRetreat=predictiveEscape||(!sustainedByHeal&&!decisiveAssault&&(overextended||(health<c.profile.retreat&&!finishing&&(threatened||(!idlePressure&&now>this.reengageAfter)))))||siegeDecision?.shouldExit;
    if(!c.retreating&&(emergency||(!commitmentProtected&&ordinaryRetreat))){
      if(siegeDecision?.shouldExit&&this.siege)this.avoid.push({id:null,x:this.siege.point.x,z:this.siege.point.z,until:now+20});
      if(this.siege)this.finishSiegeMemory(m,u,false);
      c.retreating=true;c.metrics.retreatAttempts++;this.state='disengage';this.safePoint=escapePlan?.point||null;this.recoveryUntil=0;m.telemetry.retreatStart(m,u);
      this.targetId=null;c.exploreTarget=null;
    }
    if(c.retreating){
      const recovering=!threatened&&risk(u)<1;
      const atSanctuary=distance(u,m.map.trollSpawn)<=B.troll.sanctuaryRadius-1;
      const returnToSanctuary=recovering&&health<.3&&!idlePressure&&!atSanctuary;
      if(returnToSanctuary){this.state='recover';this.safePoint=m.map.trollSpawn;this.recoveryUntil=0;c.go(m,u,this.safePoint,B.troll.sanctuaryRadius-1);return;}
      // Count the recovery window only after the Troll actually reaches
      // safety. Previously most of the 18 seconds elapsed while it was still
      // escaping tower fire, forcing it to reengage at critically low HP.
      if(recovering&&!this.recoveryUntil)this.recoveryUntil=now+18;
      else if(!recovering)this.recoveryUntil=0;
      const recoveredEnough=health>=.58||(this.recoveryUntil&&now>=this.recoveryUntil&&health>=.45);
      if(recovering&&(recoveredEnough||idlePressure)){
        c.retreating=false;this.safePoint=null;this.state='rotate';c.exploreTarget=null;c.metrics.retreatSuccesses++;this.reengageAfter=now+6;m.telemetry.reengage(m,u);
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
      const probeKey=target.kind?(target.baseId||target.id):null,probeFresh=probeKey&&(this.probedBases.get(probeKey)||-Infinity)>now-90;
      if(target.kind&&!probeFresh){
        if(distance(u,target)>12){this.state='hunt';c.go(m,u,target,10);return;}
        if(!this.probe||this.probe.key!==probeKey)this.probe={key:probeKey,targetId:target.id,start:now,until:now+3,startDamage:u.stats.damageReceived||0};
        this.state='probe';const probeReach=Math.max(10,stats.range+(B.structures[target.kind]?.radius||0)+5);c.go(m,u,target,probeReach);
        if(now<this.probe.until)return;
        const measuredDps=Math.max(0,(u.stats.damageReceived||0)-this.probe.startDamage)/Math.max(.1,now-this.probe.start),evaluation=evaluations.get(target.id),unsafe=measuredDps>u.maxHp*.055||evaluation?.danger.riskScore>1.05;
        this.probedBases.set(probeKey,now);this.probe=null;
        if(unsafe){this.avoid.push({id:null,x:target.x,z:target.z,until:now+25});this.strategicMap.recordSiege(m,target,false);this.targetId=null;this.state='rotate';c.exploreTarget=null;c.stop(u);return;}
      }
      this.targetEvaluation={id:target.id,...evaluations.get(target.id)};this.state=['elf','wisp'].includes(target.role)?'chase':'siege';
      if(this.state==='siege')this.beginSiege(m,u,target,evaluations.get(target.id));else if(this.siege)this.finishSiegeMemory(m,u,false);
      const reach=stats.range+(target.kind?B.structures[target.kind].radius:0)-.35;
      if(c.go(m,u,target,reach)){
        u.yaw=Math.atan2(target.x-u.x,target.z-u.z);
        if(threatened&&visible.some(e=>e.kind==='tower'&&distance(u,e)<B.troll.roarRange)&&!(u.cooldowns.roar>now))m.act(u.id,{type:'roar'});
        m.act(u.id,{type:'attack',heavy:!(u.cooldowns.heavy>now)});
      }else if(target.role==='elf'&&distance(u,target)>8&&distance(u,target)<18&&dps<10){if(!(u.cooldowns.dash>now)&&Math.hypot(u.input.x,u.input.z)>.5)m.act(u.id,{type:'dash'});}
      return;
    }
    this.targetId=null;this.probe=null;this.state=this.avoid.length?'rotate':'explore';
    const memories=[...c.discovered.values()].filter(e=>!avoided(e)).sort((a,b)=>distance(u,a)-distance(u,b));
    if(memories.length){this.state='hunt';c.go(m,u,memories[0],3);return;}
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
      let damage=0,length=0;
      for(let j=1;j<points.length;j++){const a=points[j-1],b=points[j],segment=distance(a,b),mid={x:(a.x+b.x)/2,z:(a.z+b.z)/2};length+=segment;damage+=combatRisk(m,u,knownTowers,mid).dps*segment/Math.max(.1,speed);}
      const endpointDps=combatRisk(m,u,knownTowers,p).dps;if(endpointDps<1)plans.push({point:p,damage,length,score:damage+length*.2+(p.sanctuary&&u.hp/u.maxHp<.45?-12:0)});
    }
    plans.sort((a,b)=>a.score-b.score);return plans[0]||null;
  }
  purchase(m,u,threatened,towers){
    const legendaryProgress=(u.levels.damage||0)+(u.levels.siege||0),pursuingLegendary=legendaryProgress<B.legendary.swordLevels&&legendaryProgress>=2;
    if(!pursuingLegendary&&!u.pendingStrike&&m.time-u.lastHit>=5&&m.time-u.lastAttack>=5&&Object.values(u.levels).reduce((a,b)=>a+b,0)>=2){
      this.build??=Object.values(BUILDS)[[...m.map.seed].reduce((n,c)=>n+c.charCodeAt(0),0)%3];
      const item=this.build.items.find(id=>!u.inventory.includes(id)&&u.gold>=ITEMS[id].cost);
      if(item){m.act(u.id,{type:'buyItem',item});return;}
    }
    const injured=u.hp/u.maxHp<.6,armored=towers.some(t=>t.branch==='pierce');
    const weights={damage:5,speed:3.7,siege:4.5,health:injured?13:3,armor:threatened&&!armored?9:3,regen:u.hp<u.maxHp*.85?10:4,movement:this.state==='chase'?6:1.5,utility:towers.length>1?4:1};
    if(u.slowUntil>m.time)weights.movement+=3;
    if(pursuingLegendary){const legendaryOptions=['damage','siege'].filter(k=>u.levels[k]<(B.upgrades[k].max??B.maxTier)&&u.gold>=trollCost(k,u.levels[k])).sort((a,b)=>u.levels[a]-u.levels[b]||trollCost(a,u.levels[a])-trollCost(b,u.levels[b]));if(legendaryOptions[0])m.act(u.id,{type:'buy',key:legendaryOptions[0]});return;}
    const options=Object.keys(weights).filter(k=>u.levels[k]<(B.upgrades[k].max??B.maxTier)&&u.gold>=trollCost(k,u.levels[k]));
    options.sort((a,b)=>weights[b]/(1+u.levels[b]*1.2)-weights[a]/(1+u.levels[a]*1.2));
    if(options[0])m.act(u.id,{type:'buy',key:options[0]});
  }
}
