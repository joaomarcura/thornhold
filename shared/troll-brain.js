import { BALANCE as B, distance, mitigation, trollCost, towerDamage, towerProfile } from './config.js';
import { ITEMS, BUILDS } from './equipment.js';
import { combatRisk } from './combat-risk.js';
import { lineOfSight, pathfind, toCell, walkable, index } from './map.js';

// Decisions use own state, visible opponents and dated observations only.
export class TrollBrain {
  constructor(){this.state='scout';this.targetId=null;this.committedUntil=0;this.avoid=[];this.safePoint=null;this.lastHp=null;this.lastTime=0;this.damageRate=0;this.engagedAt=0;this.recoveryUntil=0;this.reengageAfter=0;this.lastReceived=0;}
  tick(c,m,u){
    if(m.state!=='MATCH_ACTIVE'){c.stop(u);return;}
    const now=m.time,visible=m.visibleEnemies(u),elapsed=Math.max(.1,now-this.lastTime);
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
    const candidates=visible.filter(e=>!m.wallBlocks(u,e)&&!avoided(e));
    const score=e=>{
      const killTime=e.hp/(stats.damage/stats.interval*(e.kind?stats.siege:1)*1.2);
      // Once structures are visible, the Troll must open the defence instead
      // of endlessly chasing the nearest worker. Towers are the first threat,
      // then the gate, then the economic core; elves only outrank these when
      // they are already an easy kill.
      const breachWindow=e.kind&&m.breachUntil.get(e.baseId)>now;
      const priority=e.kind==='tower'?-72:e.kind==='wall'?(m.brokenBases.has(e.baseId)&&!breachWindow?12:-58):e.kind==='core'?(m.brokenBases.has(e.baseId)&&breachWindow?-105:-50):e.role==='elf'?(distance(u,e)<8||e.hp<stats.damage*2?-80:-18):0;
      const d=Math.max(.01,distance(u,e)),reach=stats.range+(e.kind?B.structures[e.kind].radius:0)-.35;
      const approach={x:e.x+(u.x-e.x)/d*Math.min(d,reach),z:e.z+(u.z-e.z)/d*Math.min(d,reach)};
      const danger=combatRisk(m,u,known,approach,e);
      return distance(u,e)+Math.min(45,killTime)*.55+danger.riskScore*35+priority;
    };
    candidates.sort((a,b)=>score(a)-score(b));
    let target=candidates[0];
    const current=candidates.find(e=>e.id===this.targetId);
    if(current&&now<this.committedUntil&&(!target||score(current)<score(target)+18))target=current;
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
    const sustainedByHeal=(u.healingUntil||0)>now&&health>.24;
    if(!c.retreating&&(emergency||predictiveEscape||(!sustainedByHeal&&!decisiveAssault&&(overextended||(health<c.profile.retreat&&!finishing&&(threatened||(!idlePressure&&now>this.reengageAfter))))))){
      c.retreating=true;c.metrics.retreatAttempts++;this.state='retreat';this.safePoint=escapePlan?.point||null;this.recoveryUntil=0;m.telemetry.retreatStart(m,u);
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
        this.state='retreat';
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
      this.state=target.role==='elf'?'pursue':'siege';
      const reach=stats.range+(target.kind?B.structures[target.kind].radius:0)-.35;
      if(c.go(m,u,target,reach)){
        u.yaw=Math.atan2(target.x-u.x,target.z-u.z);
        if(threatened&&visible.some(e=>e.kind==='tower'&&distance(u,e)<B.troll.roarRange)&&!(u.cooldowns.roar>now))m.act(u.id,{type:'roar'});
        m.act(u.id,{type:'attack',heavy:!(u.cooldowns.heavy>now)});
      }else if(target.role==='elf'&&distance(u,target)>8&&distance(u,target)<18&&dps<10){if(!(u.cooldowns.dash>now)&&Math.hypot(u.input.x,u.input.z)>.5)m.act(u.id,{type:'dash'});}
      return;
    }
    this.targetId=null;this.state=this.avoid.length?'rotate':'scout';
    const memories=[...c.discovered.values()].filter(e=>!avoided(e)).sort((a,b)=>distance(u,a)-distance(u,b));
    if(memories.length){c.go(m,u,memories[0],3);return;}
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
    const weights={damage:5,speed:3.7,siege:4.5,health:injured?13:3,armor:threatened&&!armored?9:3,regen:u.hp<u.maxHp*.85?10:4,movement:this.state==='pursue'?6:1.5,utility:towers.length>1?4:1};
    if(u.slowUntil>m.time)weights.movement+=3;
    if(pursuingLegendary){const legendaryOptions=['damage','siege'].filter(k=>u.levels[k]<(B.upgrades[k].max??B.maxTier)&&u.gold>=trollCost(k,u.levels[k])).sort((a,b)=>u.levels[a]-u.levels[b]||trollCost(a,u.levels[a])-trollCost(b,u.levels[b]));if(legendaryOptions[0])m.act(u.id,{type:'buy',key:legendaryOptions[0]});return;}
    const options=Object.keys(weights).filter(k=>u.levels[k]<(B.upgrades[k].max??B.maxTier)&&u.gold>=trollCost(k,u.levels[k]));
    options.sort((a,b)=>weights[b]/(1+u.levels[b]*1.2)-weights[a]/(1+u.levels[a]*1.2));
    if(options[0])m.act(u.id,{type:'buy',key:options[0]});
  }
}
