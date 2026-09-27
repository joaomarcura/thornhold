import { STATES, BALANCE as B, distance, mineEconomy, upgradeCost, wispCost, wispUpgradeCost, placementRadius } from './config.js';
import { pathfind, toCell, index, lineOfSight, walkable, baseAt, baseZone, randomFor } from './map.js';
import { TrollBrain } from './troll-brain.js';
import { availableTrees } from './wisps.js';
import { requiredBarricadeTier, upgradeStatus } from './upgrade-rules.js';
import { ELF_TECH_CARDS, pendingTechnology, specialization, technologyCost } from './elf-progression.js';

const shuffled=(values,rng)=>{const result=[...values];for(let i=result.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;};

// Keep seed variation without sending an entire Elf team through the same
// opening corridor. Farthest-point ordering distributes the first refuges
// around the map; the seeded first pick keeps consecutive matches different.
export function distributedRefuges(map,seed=map.seed){
  const remaining=[...map.bases],chosen=[],rng=randomFor(`${seed}:distributed-refuges-v2`);
  if(!remaining.length)return chosen;
  chosen.push(remaining.splice(Math.floor(rng()*remaining.length),1)[0]);
  while(remaining.length){
    const scored=remaining.map((base,i)=>({base,i,score:Math.min(...chosen.map(other=>distance(base,other)))+rng()*.001})).sort((a,b)=>b.score-a.score);
    chosen.push(remaining.splice(scored[0].i,1)[0]);
  }
  return chosen;
}

// Controllers only choose intentions. Every cost, hit, cooldown and collision goes through Match.
export class AIController {
  constructor(difficulty='normal'){this.profile=B.difficulty[difficulty]||B.difficulty.normal;this.difficulty=difficulty;this.nextThink=0;this.route=[];this.destination=null;this.routeAt=-100;this.explored=new Set();this.exploreTarget=null;this.exploreAt=0;this.discovered=new Map();this.retreating=false;this.navigationFailure=null;this.lastNavigationEntity=null;this.lastNavigationAt=-Infinity;this.metrics={idle:0,attacking:0,defending:0,retreating:0,failedNavigation:0,failedExploration:0,pathRecalculations:0,retreatAttempts:0,retreatSuccesses:0,targetChanges:0,stuckNavigation:0,navigationFailureReasons:{stuck:0,noRoute:0},navigationFailureSamples:[]};}
  recordNavigationFailure(match,target,reason){this.metrics.navigationFailureReasons[reason]=(this.metrics.navigationFailureReasons[reason]||0)+1;if(this.metrics.navigationFailureSamples.length<100){const entity=target.entityId?match.entity(target.entityId)||this.discovered.get(target.entityId):null;this.metrics.navigationFailureSamples.push({time:+match.time.toFixed(1),reason,state:this.brain?.state||null,targetId:target.entityId||null,targetKind:entity?.kind||entity?.role||null,baseId:entity?.baseId||null});}}
  tick(match,u,dt){
    if(match.time>=this.nextThink){const think=u.role==='elf'?Math.max(.7,this.profile.think):this.profile.think;this.nextThink=match.time+think;if(u.ghost)this.ghost(match,u);else if(u.role==='elf')this.elf(match,u);else this.troll(match,u);}
    // Brain decisions only update the intention. Apply movement once per tick;
    // calling follow both inside the brain and here caused route churn during retreat.
    if(this.destination)this.follow(match,u,dt);else u.input={x:0,z:0};
    // Once a target is chosen, hold the attack like a human holding the mouse.
    // Difficulty still controls when the bot reconsiders its target or retreat.
    if(u.role==='troll'&&!this.retreating&&['siege','breach','chase'].includes(this.brain?.state)){
      const target=match.entity(this.brain.targetId),stats=match.trollStats(u);
      if(target?.hp>0&&match.canSee(u,target)&&!match.wallBlocks(u,target)&&distance(u,target)<=stats.range+(target.kind?B.structures[target.kind].radius:0)-.1){
        u.yaw=Math.atan2(target.x-u.x,target.z-u.z);match.act(u.id,{type:'attack',heavy:!(u.cooldowns.heavy>match.time)});
      }
    }
    if(u.role==='troll'){
      const state=this.brain?.state||'idle';
      const bucket=['chase','siege','breach'].includes(state)?'attacking':['disengage','recover'].includes(state)?'retreating':['rotate','explore','hunt','probe','reposition'].includes(state)?'defending':'idle';
      this.metrics[bucket]+=dt;
    }
  }
  stop(u){this.destination=null;this.route=[];u.input={x:0,z:0};}
  reachablePoint(match,u,p){const blocked=this.navigationBlocks(match,u),start=toCell(match.map,u),goal=toCell(match.map,p);if(blocked.has(index(match.map,goal.x,goal.z)))return false;return (start.x===goal.x&&start.z===goal.z)||pathfind(match.map,u,p,blocked).length>0;}
  navigationBlocks(match,u,ignoreId=null){
    if(u.role!=='troll')return match.blockedCells(u.role);
    return new Set([...this.discovered.values()].filter(e=>e.kind&&e.id!==ignoreId).map(e=>{const p=toCell(match.map,e);return index(match.map,p.x,p.z);}));
  }
  go(match,u,target,reach=2){
    if(distance(u,target)<=reach&&lineOfSight(match.map,u,target)){this.stop(u);return true;}
    const changed=!this.destination||this.destination.entityId!==(target.id||null)||distance(this.destination,target)>1||this.destination.reach!==reach;
    this.destination={x:target.x,z:target.z,reach,entityId:target.id||null};if(changed){this.routeAt=-100;this.progressProbe=null;}return false;
  }
  follow(match,u,dt=1/B.tick){
    const target=this.destination;if(!target)return;
    if(distance(u,target)<=target.reach&&lineOfSight(match.map,u,target)){this.stop(u);return;}
    if(this.progressProbe&&match.time-this.progressProbe.time>=3){
      if(distance(u,this.progressProbe)<.3&&this.route.length){this.metrics.stuckNavigation++;this.recordNavigationFailure(match,target,'stuck');this.route=[];this.routeAt=-100;this.navigationFailure=target.entityId||'point';this.navigationFailureTarget={...target};this.stop(u);this.progressProbe=null;return;}
      this.progressProbe=null;
    }
    this.progressProbe??={x:u.x,z:u.z,time:match.time};
    if(!this.route.length||match.time-this.routeAt>1.5){
      const blocked=this.navigationBlocks(match,u,target.entityId),goal=toCell(match.map,target);
      const candidates=target.entityId?[]:[target];
      // A reachable cell is only useful if the action actually works there.
      // Previously endpoints up to two cells OUTSIDE attack range were accepted.
      const cells=Math.ceil(target.reach/match.map.cell)+1;
      for(let dx=-cells;dx<=cells;dx++)for(let dz=-cells;dz<=cells;dz++)candidates.push({x:(goal.x+dx)*match.map.cell,z:(goal.z+dz)*match.map.cell});
      const radius=u.role==='troll'?B.movement.trollRadius:B.movement.elfRadius;
      const obstacles=u.role==='troll'?[...this.discovered.values()].filter(e=>e.kind):match.structures.filter(s=>s.hp>0);
      const options=candidates.filter(p=>distance(p,target)<=target.reach&&lineOfSight(match.map,p,target)&&
        [[radius,0],[-radius,0],[0,radius],[0,-radius]].every(([dx,dz])=>{const c=toCell(match.map,{x:p.x+dx,z:p.z+dz});return walkable(match.map,c.x,c.z);})&&
        !obstacles.some(s=>!(s.kind==='wall'&&u.role==='elf')&&distance(p,s)<B.structures[s.kind].radius+radius)
      ).sort((a,b)=>distance(u,a)-distance(u,b));
      this.metrics.pathRecalculations++;this.route=[];for(const p of options){const c=toCell(match.map,p);if(blocked.has(index(match.map,c.x,c.z)))continue;const route=pathfind(match.map,u,p,blocked),start=toCell(match.map,u);
        if(!route.length&&(start.x!==c.x||start.z!==c.z||!lineOfSight(match.map,u,p)))continue;
        if(!route.length||distance(route.at(-1),p)>.05)route.push(p);
        this.route=route;break;
      }
      this.routeAt=match.time;
    }
    while(this.route.length>1&&distance(u,this.route[0])<.35)this.route.shift();
    const next=this.route[0];if(!next){
      // Exploration/frontier points can be inside the same walkable cell while
      // terrain LOS is blocked by the cell edge. They are already reached for
      // navigation purposes; keep the brain from oscillating on that point.
      if(!target.entityId&&distance(u,target)<=target.reach&&lineOfSight(match.map,u,target)){this.stop(u);return;}
      if(target.entityId){if(this.lastNavigationEntity!==target.entityId||match.time-this.lastNavigationAt>15){this.metrics.failedNavigation++;this.recordNavigationFailure(match,target,'noRoute');}this.lastNavigationEntity=target.entityId;this.lastNavigationAt=match.time;}else this.metrics.failedExploration++;this.navigationFailure=target.entityId||'point';this.navigationFailureTarget={...target};this.destination=null;this.route=[];this.routeAt=-100;u.input={x:0,z:0};return;
    }
    const traveling=u.role==='troll'&&!this.retreating&&['explore','hunt','rotate'].includes(this.brain?.state),travelFactor=traveling?B.troll.travelSpeed:1;
    const sprint=u.role==='elf'?B.movement.elfSprint:B.movement.sprint,d=distance(u,next),speed=(u.role==='elf'?B.elf.speed:match.trollStats(u).movement)*sprint*(u.dashUntil>match.time?B.troll.dashSpeed:1)*travelFactor,divisor=Math.max(.001,d,speed*dt);u.input={x:(next.x-u.x)/divisor,z:(next.z-u.z)/divisor,sprint:u.role==='elf'||this.retreating||['reposition','chase'].includes(this.brain?.state),travel:traveling};u.yaw=Math.atan2(u.input.x,u.input.z);
  }
  actNear(match,u,target,cmd,reach=B.interactRange){
    if(cmd.type==='build'&&cmd.kind!=='wall'&&distance(u,target)<B.structures[cmd.kind].radius+.5){
      const blocked=this.navigationBlocks(match,u),start=toCell(match.map,u),choices=[[2.2,0],[-2.2,0],[0,2.2],[0,-2.2]].map(([x,z])=>({x:target.x+x,z:target.z+z})).filter(p=>{
        if(!match.positionValid(u,p.x,p.z))return false;const cell=toCell(match.map,p);if(blocked.has(index(match.map,cell.x,cell.z)))return false;
        return (start.x===cell.x&&start.z===cell.z)||pathfind(match.map,u,p,blocked).length>0;
      });
      if(choices[0]){this.go(match,u,choices[0],.2);return 'moving';}
      this.elfAvoid??=[];this.elfAvoid.push({x:target.x,z:target.z,until:match.time+20});this.stop(u);return 'no-position';
    }
    if(this.go(match,u,target,reach)){u.yaw=Math.atan2(target.x-u.x,target.z-u.z);return match.act(u.id,cmd);}return 'moving';
  }
  ghost(match,u){
    const wall=match.structures.filter(s=>s.kind==='wall'&&s.hp>0&&s.progress>=1&&s.hp<s.maxHp).sort((a,b)=>distance(u,a)-distance(u,b))[0];
    if(wall){this.actNear(match,u,wall,{type:'repair',target:wall.id});return;}
    if(!(u.cooldowns.ghostReveal>match.time)){match.act(u.id,{type:'ghostReveal'});this.stop(u);return;}
    const ally=match.units.filter(a=>a.role==='elf'&&a.alive).sort((a,b)=>distance(u,a)-distance(u,b))[0];if(ally)this.go(match,u,ally,4);else this.stop(u);
  }
  elfEscapePoint(match,u,base,threat=null){
    const cached=this.elfEvade?.baseId===base.id?this.elfEvade.destination:null;
    if(cached&&(!threat||distance(cached,threat)>=B.elf.evacuationThreatRange))return cached;
    // Refuges have a single gate. Once the Troll is inside, another corner of
    // the same refuge is a trap, so continue through the gate toward the
    // nearest reachable refuge trail.
    const alternatives=match.map.bases.filter(candidate=>candidate.id!==base.id)
      .sort((a,b)=>threat?distance(b.outside,threat)-distance(a.outside,threat):distance(base.ramp.to,a.outside)-distance(base.ramp.to,b.outside));
    const destination=alternatives.map(candidate=>candidate.outside)
      .find(point=>(!threat||distance(point,threat)>=B.elf.evacuationThreatRange)&&this.reachablePoint(match,u,point))||base.ramp.to||base.outside;
    const first=!this.elfEvade||this.elfEvade.baseId!==base.id;
    this.elfEvade={...(first?{startedAt:match.time,minimumUntil:match.time+B.elf.evacuationMinSeconds,lastThreatAt:match.time}:this.elfEvade),baseId:base.id,destination:{x:destination.x,z:destination.z}};
    if(first)this.metrics.evacuations=(this.metrics.evacuations||0)+1;
    return this.elfEvade.destination;
  }
  elf(match,u){
    if(this.navigationFailure){
      this.elfAvoid??=[];this.elfAvoidEntities??=new Map();const failed=this.navigationFailureTarget;if(failed)this.elfAvoid.push({x:failed.x,z:failed.z,until:match.time+20});if(failed?.entityId)this.elfAvoidEntities.set(failed.entityId,match.time+20);
      this.elfAvoid=this.elfAvoid.filter(p=>p.until>match.time);this.navigationFailure=null;this.navigationFailureTarget=null;
    }
    if(!this.elfProfile){
      const profiles=['economy','balanced','defense'],elves=match.units.filter(a=>a.role==='elf'),elfIndex=Math.max(0,elves.findIndex(a=>a.id===u.id));
      const strategyRng=randomFor(`${match.map.seed}:elf-strategies`),shift=Math.floor(strategyRng()*profiles.length),buildRng=randomFor(`${match.map.seed}:elf-build:${u.id}`);
      this.elfProfile=profiles[(shift+elfIndex)%profiles.length];
      const personalities={economy:['Faelar · Mercador','Lúmen · Cultivador','Nym · Provedor'],balanced:['Aerin · Estrategista','Elyra · Guardiã','Cael · Versátil'],defense:['Thalia · Sentinela','Orin · Bastião','Maelis · Muralha']};
      // Profiles repeat every three seats in a 1x5 lobby. Use the profile
      // occurrence rather than the absolute seat so repeated profiles still
      // receive distinct, readable names on the scoreboard.
      if(u.controller==='bot')u.name=personalities[this.elfProfile][Math.floor(elfIndex/profiles.length)%personalities[this.elfProfile].length];
      // Keep both towers on the flanks so the Core-to-gate lane stays open.
      this.buildPlan={towerDepths:shuffled([2,3,4],buildRng),towerSides:shuffled([-2,2],buildRng),utilityOffset:Math.floor(buildRng()*8),utilityDirection:buildRng()<.5?-1:1};
      this.metrics.strategy=this.elfProfile;this.metrics.personalityName=u.name;this.metrics.buildPlan={...this.buildPlan};
    }
    const strategy={economy:{mineRatio:1,towerBase:1,towerGrowth:.25,towerTierOffset:-1,wispTarget:4},balanced:{mineRatio:.75,towerBase:1,towerGrowth:.5,towerTierOffset:0,wispTarget:3},defense:{mineRatio:.5,towerBase:2,towerGrowth:.75,towerTierOffset:1,wispTarget:2}}[this.elfProfile];
    // Troll spawn is a public landmark. Bots still inside its immediate area at
    // the end of preparation must clear it before the seal opens instead of
    // waiting for the first live threat update and fleeing one decision late.
    const preparationRemaining=match.preparation-match.time;
    if(match.state===STATES.PREP&&preparationRemaining<=B.elf.preparationClearSeconds&&distance(u,match.map.trollSpawn)<B.elf.preparationTrollClearRadius){
      const destination=[...match.map.bases].sort((a,b)=>distance(b.outside,match.map.trollSpawn)-distance(a.outside,match.map.trollSpawn)).map(base=>base.outside).find(point=>distance(point,match.map.trollSpawn)>=B.elf.preparationTrollClearRadius&&this.reachablePoint(match,u,point));
      if(destination){this.metrics.preparationEvacuations=(this.metrics.preparationEvacuations||0)+1;this.go(match,u,destination,2);return;}
    }
    const avoidedEntity=e=>(this.elfAvoidEntities?.get(e.id)||0)>match.time;
    const own=match.structures.filter(s=>s.owner===u.id&&s.hp>0),core=own.find(s=>s.kind==='core');
    if(own.some(s=>s.progress<1&&!avoidedEntity(s))){const work=own.find(s=>s.progress<1&&!avoidedEntity(s));this.actNear(match,u,work,{type:'assist',target:work.id});return;}
    let base=match.map.bases.find(b=>b.id===u.baseId);
    if(!core){
      const elves=match.units.filter(a=>a.role==='elf'),offset=elves.findIndex(a=>a.id===u.id);
      const claimed=new Set(match.structures.filter(s=>s.kind==='core'&&s.hp>0).map(s=>s.baseId));
      if(!this.refuges){this.refuges=distributedRefuges(match.map);this.metrics.refugeOrder=this.refuges.map(refuge=>refuge.id);}
      const ordered=Array.from({length:this.refuges.length},(_,i)=>this.refuges[(offset+i)%this.refuges.length]),previousBaseId=u.displacedBaseId||null;
      const visibleThreat=match.visibleEnemies(u).find(e=>e.role==='troll'),rememberedThreat=(u.relocationThreat?.until||0)>match.time?u.relocationThreat:null,relocationThreat=visibleThreat||rememberedThreat;
      let candidates=ordered.filter(b=>!claimed.has(b.id)&&(match.reclaimUntil.get(b.id)||0)<=match.time&&b.id!==previousBaseId);
      if(!candidates.length)candidates=ordered.filter(b=>!claimed.has(b.id)&&(match.reclaimUntil.get(b.id)||0)<=match.time);
      const current=candidates.find(b=>b.id===this.relocationBaseId&&(!relocationThreat||distance(b,relocationThreat)>=B.elf.evacuationThreatRange));
      if(current)base=current;else{
        if(relocationThreat)candidates.sort((a,b)=>(distance(b,relocationThreat)-distance(u,b)*.15)-(distance(a,relocationThreat)-distance(u,a)*.15));
        base=candidates[0];this.relocationBaseId=base?.id||null;
      }
      if(!base){this.stop(u);return;}
      this.metrics.relocationTarget=base.id;this.metrics.relocationAvoidedBase=previousBaseId;
      const p={x:base.x,z:base.z};
      const approaches=[[4.4,0],[-4.4,0],[0,4.4],[0,-4.4]].map(([x,z])=>({x:p.x+x,z:p.z+z})).filter(a=>baseAt(match.map,a)?.id===base.id&&match.positionValid(u,a.x,a.z)&&this.reachablePoint(match,u,a)).sort((a,b)=>distance(u,a)-distance(u,b));
      // Reach the interior before laying a foundation, then stand off its footprint.
      if(!lineOfSight(match.map,u,p)||distance(u,p)>6){if(approaches[0])this.go(match,u,approaches[0],.5);else this.stop(u);return;}
      if(distance(u,p)<2.1){if(approaches[0])this.go(match,u,approaches[0],.5);else this.stop(u);return;}
      if(!match.freeRelocation(u)&&(u.gold<B.structures.core.gold||u.wood<B.structures.core.wood)){this.gather(match,u,base);return;}
      match.act(u.id,{type:'build',kind:'core',...p});this.stop(u);return;
    }
    this.relocationBaseId=null;
    base=match.map.bases.find(b=>b.id===core.baseId);
    if(!u.elfSpecialization&&core.tier>=B.elfProgression.unlockTier){
      const preferred={economy:'industrial',defense:'fortress',balanced:'arcane'}[this.elfProfile],resourceFit={ancientWood:'industrial',crystal:'fortress',mana:'arcane'}[base.localResource],counts=Object.fromEntries(Object.keys(B.elfProgression.specializations).map(key=>[key,match.units.filter(a=>a.role==='elf'&&a.elfSpecialization===key).length]));
      const rng=randomFor(`${match.map.seed}:specialization:${u.id}`),choice=Object.keys(B.elfProgression.specializations).map(key=>({key,score:(key===preferred?3:0)+(key===resourceFit?2:0)-counts[key]*.8+rng()})).sort((a,b)=>b.score-a.score)[0].key;
      if(distance(u,core)<=B.interactRange){match.act(u.id,{type:'chooseElfSpecialization',key:choice});const label=B.elfProgression.specializations[choice].name,personality={economy:'Economista',balanced:'Adaptável',defense:'Guardião'}[this.elfProfile];u.name=`${label} — ${personality}`;this.stop(u);return;}
      this.go(match,u,core,B.interactRange*.7);return;
    }
    const wall=own.find(s=>s.kind==='wall'),towers=own.filter(s=>s.kind==='tower'),mines=own.filter(s=>s.kind==='mine'),workshop=own.find(s=>s.kind==='workshop');
    const threat=match.visibleEnemies(u).find(e=>e.role==='troll');
    const response={economy:{range:14,repairFloor:.45,reserve:0},balanced:{range:20,repairFloor:.6,reserve:0},defense:{range:28,repairFloor:.75,reserve:120}}[this.elfProfile];
    const approaching=threat&&(distance(threat,base.gate)<=response.range||(wall&&match.time-wall.lastHit<5));
    if(approaching)this.elfThreatUntil=match.time+6;
    const defenseMode=approaching||(this.elfThreatUntil||0)>match.time;
    const stun=match.elfStunStatus(u);
    const trollInside=threat&&baseAt(match.map,threat)?.id===base.id;
    const evade=this.elfEvade?.baseId===base.id?this.elfEvade:null;
    const threatNear=!!threat&&(distance(threat,u)<B.elf.evacuationThreatRange||distance(threat,base.gate)<B.elf.evacuationThreatRange);
    if(trollInside||evade&&threatNear){
      const destination=this.elfEscapePoint(match,u,base,threat);this.elfEvade.minimumUntil=Math.max(this.elfEvade.minimumUntil||0,match.time+B.elf.evacuationMinSeconds);this.elfEvade.lastThreatAt=match.time;this.elfEvade.clearSince=null;
      if(stun.available)match.act(u.id,{type:'elfStun'});
      this.go(match,u,destination,2);return;
    }
    if(evade){
      const outside=baseAt(match.map,u)?.id!==base.id||distance(u,base.gate)>=B.elf.evacuationDistance;
      const breachActive=(match.breachUntil.get(base.id)||0)>match.time;
      if(!threatNear&&outside)evade.clearSince??=match.time;else evade.clearSince=null;
      const clearFor=evade.clearSince===null?0:match.time-evade.clearSince,safeToReturn=outside&&!breachActive&&match.time>=(evade.minimumUntil||0)&&clearFor>=B.elf.evacuationClearSeconds;
      if(!safeToReturn){this.metrics.evacuationHolds=(this.metrics.evacuationHolds||0)+1;this.go(match,u,evade.destination,2);return;}
      this.metrics.evacuationReturns=(this.metrics.evacuationReturns||0)+1;this.metrics.evacuationLastSeconds=match.time-(evade.startedAt||match.time);this.elfEvade=null;
    }
    const gateDistance=distance(base,base.gate),ix=(base.x-base.gate.x)/gateDistance*match.map.cell,iz=(base.z-base.gate.z)/gateDistance*match.map.cell;
    const towerPositions=[];for(const depth of this.buildPlan.towerDepths)for(const side of this.buildPlan.towerSides)towerPositions.push({x:base.gate.x+ix*depth+side*iz,z:base.gate.z+iz*depth-side*ix});
    const avoidedPoint=p=>this.elfAvoid?.some(a=>a.until>match.time&&distance(a,p)<3);
    const towerPosition=towerPositions.find(p=>!avoidedPoint(p)&&baseAt(match.map,p)?.id===base.id&&baseZone(match.map,base,p)==='frontline'&&match.positionValid(u,p.x,p.z)&&!match.structures.some(s=>s.hp>0&&distance(s,p)<placementRadius(s.kind)+placementRadius('tower')+B.construction.placementGap)&&!match.trees.some(t=>t.amount>0&&distance(t,p)<B.structures.tower.radius+.55));
    const buildTower=()=>{const p=towerPosition;if(p)return this.actNear(match,u,p,{type:'build',kind:'tower',...p});return 'no-position';};
    const utilityPositions=[];for(const radius of [4.4,6.6,8.8,11])for(let step=0;step<8;step++){const i=(this.buildPlan.utilityOffset+this.buildPlan.utilityDirection*step+8)%8;utilityPositions.push({x:base.x+Math.sin(i*Math.PI/4)*radius,z:base.z+Math.cos(i*Math.PI/4)*radius});}
    const buildUtility=kind=>{const def=B.structures[kind],p=utilityPositions.find(p=>!avoidedPoint(p)&&baseAt(match.map,p)?.id===base.id&&baseZone(match.map,base,p)==='industrial'&&match.positionValid(u,p.x,p.z)&&!match.structures.some(s=>s.hp>0&&distance(s,p)<placementRadius(s.kind)+placementRadius(kind)+B.construction.placementGap)&&!match.trees.some(t=>t.amount>0&&distance(t,p)<def.radius+.55));if(p)return this.actNear(match,u,p,{type:'build',kind,...p});return 'no-position';};
    const upgrade=s=>this.actNear(match,u,s,{type:'upgrade',target:s.id});
    // Distance is an execution requirement, not a strategic blocker. Treat a
    // sole distance reason as a valid plan so actNear can walk to the target.
    const affordable=s=>{if(!s||avoidedEntity(s)||s.upgrading)return false;const status=upgradeStatus(u,s,match.time,match.state,match.structures);return status.allowed||status.reasons.every(reason=>reason.code==='distance');};
    // Proximity maintenance is bot-only. It no longer consumes the complete
    // strategic decision, allowing a nearby bot to repair and then improve a
    // tower during the same defensive cycle.
    const maintenanceRange=10;
    if(wall&&!avoidedEntity(wall)&&wall.hp<wall.maxHp&&distance(u,wall)<=maintenanceRange)match.repair(u,wall.id,maintenanceRange);
    if(defenseMode&&wall&&!avoidedEntity(wall)&&wall.hp/wall.maxHp<response.repairFloor&&distance(u,wall)>B.interactRange){this.go(match,u,wall,B.interactRange);return;}
    if(u.wood<45){this.gather(match,u,base);return;}
    const desiredPath=this.elfProfile==='economy'?'economy':this.elfProfile==='defense'?'defense':'technology';
    if(!defenseMode&&workshop?.tier>=B.elfIncremental.essenceUnlockTier&&!u.elfPath&&u.essence>=B.elfIncremental.pathCost){this.actNear(match,u,workshop,{type:'chooseElfPath',target:workshop.id,path:desiredPath});return;}
    // The first defensive tower is the bot's opening combat insurance. Building
    // the wall first leaves no reaction window when the Troll arrives early.
    if((!threat||(defenseMode&&wall&&wall.hp/wall.maxHp>=response.repairFloor))&&!towers.length&&u.gold>=B.structures.tower.gold&&u.wood>=B.structures.tower.wood){if(buildTower()!=='no-position')return;}
    if(!wall){
      if((match.breachUntil.get(base.id)||0)>match.time||(threat&&distance(threat,base.gate)<B.construction.enemyClearance)){
        // Survive the breach instead of repeatedly issuing a rejected rebuild.
        const choices=[[-7,-7],[-7,7],[7,-7],[7,7]].map(([x,z])=>({x:base.x+x,z:base.z+z})).filter(p=>match.positionValid(u,p.x,p.z)&&this.reachablePoint(match,u,p));
        choices.sort((a,b)=>distance(b,threat||base.gate)-distance(a,threat||base.gate));if(choices[0])this.go(match,u,choices[0],1);return;
      }
      if(u.gold>=B.structures.wall.gold&&u.wood>=B.structures.wall.wood)this.actNear(match,u,base.gate,{type:'build',kind:'wall',x:base.gate.x,z:base.gate.z});else this.gather(match,u,base);return;
    }
    // Tier 2 is the minimum viable gate for every bot opening. Waiting for
    // Core 2 plus a Mine left the first refuge discovered with a tier-1 wall,
    // and an incoming Troll could then keep the bot trapped in a repair loop.
    // Repair still wins at critical health; otherwise commit the affordable
    // upgrade before ordinary siege maintenance.
    if(wall.tier<2&&!wall.upgrading&&affordable(wall)){upgrade(wall);return;}
    const urgentTower=towers.slice().sort((a,b)=>a.tier-b.tier).find(s=>s.tier<2&&affordable(s));
    if(defenseMode&&urgentTower&&wall.hp/wall.maxHp>=response.repairFloor){upgrade(urgentTower);return;}
    const mineRules=mineEconomy(core.tier),desiredMines=Math.min(mineRules.capacity,Math.max(1,Math.ceil(mineRules.capacity*strategy.mineRatio)));
    // Every profile establishes income before multiplying defences. The profile
    // controls how far it pushes that economy, not whether it understands it.
    if(this.elfProfile==='defense'&&urgentTower){upgrade(urgentTower);return;}
    if(!defenseMode&&core.tier===1&&affordable(core)&&u.gold-upgradeCost(core).gold>=response.reserve){upgrade(core);return;}
    // A defensive reserve starts only after the first Mine exists. Holding the
    // reserve before minimum income could strand a defender with strong towers
    // but no way to finance the rest of the match.
    if(!defenseMode&&core.tier>=2&&!mines.length&&u.gold>=mineRules.cost.gold&&u.wood>=mineRules.cost.wood){if(buildUtility('mine')!=='no-position')return;}
    const wisps=match.wisps.filter(w=>w.owner===u.id&&w.alive),training=wisps.some(w=>w.readyAt>match.time),hire=wispCost(wisps.length);
    if(!defenseMode&&!training&&towers.length&&wisps.length<Math.min(strategy.wispTarget,core.tier+1)&&u.gold>=hire.gold+35+response.reserve&&u.wood>=hire.wood&&availableTrees(match,u,core).length){this.actNear(match,u,core,{type:'trainWisp',target:core.id});return;}
    if(!defenseMode&&core.tier>=2&&mines.length<desiredMines&&u.gold>=mineRules.cost.gold+response.reserve&&u.wood>=mineRules.cost.wood){if(buildUtility('mine')!=='no-position')return;}
    const requiredWall=Math.max(2,requiredBarricadeTier(core.tier+1));
    if(!defenseMode&&wall.tier<requiredWall&&affordable(wall)){upgrade(wall);return;}
    if(!defenseMode&&affordable(core)&&u.gold-upgradeCost(core).gold>=response.reserve){upgrade(core);return;}
    if(affordable(wall)&&defenseMode){upgrade(wall);return;}
    const desiredTowers=Math.min(B.construction.limits.tower,Math.max(1,Math.floor(strategy.towerBase+core.tier*strategy.towerGrowth)));
    if(towers.length<desiredTowers&&(!defenseMode||wall.hp/wall.maxHp>=response.repairFloor)&&u.gold>=B.structures.tower.gold+35+(defenseMode?0:response.reserve)&&u.wood>=B.structures.tower.wood){if(buildTower()!=='no-position')return;}
    const towerTierCeiling=Math.max(1,core.tier+strategy.towerTierOffset),tower=towers.sort((a,b)=>a.tier-b.tier).find(s=>s.tier<towerTierCeiling&&affordable(s));if(tower){upgrade(tower);return;}
    if(!own.some(s=>s.kind==='workshop')&&core.tier>=3&&u.gold>300&&u.wood>=B.structures.workshop.wood){if(buildUtility('workshop')!=='no-position')return;}
    const signature=u.elfSpecialization&&B.elfProgression.specializations[u.elfSpecialization].structure;
    if(signature&&!own.some(s=>s.kind===signature)&&core.tier>=B.elfProgression.unlockTier&&u.gold>=B.structures[signature].gold&&u.wood>=B.structures[signature].wood){if(buildUtility(signature)!=='no-position')return;}
    const techMilestone=pendingTechnology(match,u),techResource=specialization(u.elfSpecialization)?.resource,specialWisps=wisps.filter(w=>w.specialNodeId);
    if(!threat&&techMilestone){
      const preference={economy:0,defense:1,balanced:2}[this.elfProfile],card=ELF_TECH_CARDS[techMilestone][preference],cost=technologyCost(techMilestone).resource;
      if((u.specialResources[techResource]||0)>=cost){this.actNear(match,u,core,{type:'chooseElfTechnology',key:card.id});return;}
      const node=match.specialNodes.filter(n=>n.resource===techResource&&n.amount>0&&!match.wisps.some(w=>w.alive&&w.specialNodeId===n.id)&&match.teamSee(u,n)).sort((a,b)=>Number(!a.local)-Number(!b.local)||distance(a,core)-distance(b,core))[0];
      if(!specialWisps.length&&node&&u.gold>=B.elfProgression.specialWisp.gold&&u.wood>=B.elfProgression.specialWisp.wood){this.actNear(match,u,core,{type:'trainSpecialWisp',target:node.id});return;}
    }
    const ability=match.units.find(a=>a.id===u.id)?.elfSpecialization&&match.structures.find(s=>s.owner===u.id&&s.kind===signature&&s.hp>0&&s.progress>=1);
    if(threat&&ability&&!(u.cooldowns.elfSpecialization>match.time)){match.act(u.id,{type:'elfSpecializationAbility'});return;}
    const worker=wisps.filter(w=>w.readyAt<=match.time&&!w.upgradingUntil&&w.level<core.tier+1).sort((a,b)=>a.level-b.level).find(w=>u.gold>=wispUpgradeCost(w.level).gold&&u.wood>=wispUpgradeCost(w.level).wood);
    if(worker&&!defenseMode){this.actNear(match,u,core,{type:'upgradeWisp',target:worker.id});return;}
    const utility=own.find(s=>['mine','workshop'].includes(s.kind)&&s.tier<core.tier&&affordable(s));if(utility&&!defenseMode){upgrade(utility);return;}
    const reserve=Math.max(120,...own.map(s=>upgradeCost(s).wood*2));
    if(u.wood>reserve&&wisps.length){this.stop(u);return;}
    this.gather(match,u,base);
  }
  gather(match,u,base){const occupied=new Set(match.wisps.filter(w=>w.alive).map(w=>w.treeId));let target=null,best=Infinity;for(const tree of match.trees){if(tree.amount<=0||(this.elfAvoidEntities?.get(tree.id)||0)>match.time||occupied.has(tree.id)||(baseAt(match.map,tree)?.id!==base.id&&!match.canSee(u,tree)))continue;const d=distance(u,tree);if(d<best){best=d;target=tree;}}if(target)this.actNear(match,u,target,{type:'gather',target:target.id});else this.stop(u);}
  troll(match,u){this.brain??=new TrollBrain();this.brain.tick(this,match,u);}
  explore(match,u){
    const map=match.map,c=toCell(map,u),key=index(map,c.x,c.z),radius=Math.ceil(B.vision.troll/map.cell);
    // Refuges are public landmarks. Live matches receive a server-generated
    // route variant so consecutive rounds start on another side and reverse
    // direction; direct simulations remain deterministic for the same seed.
    if(!this.searchBases){
      const rng=randomFor(`${map.seed}:troll-patrol:${match.settings.routeVariant||'seed-default'}`),center={x:(map.size-1)*map.cell/2,z:(map.size-1)*map.cell/2};
      let ring=[...map.bases].sort((a,b)=>Math.atan2(a.z-center.z,a.x-center.x)-Math.atan2(b.z-center.z,b.x-center.x));
      const direction=match.settings.trollPatrolDirection??(rng()<.5?-1:1);if(direction<0)ring.reverse();
      const requested=match.settings.trollPatrolStart,start=Number.isInteger(requested)?((requested%ring.length)+ring.length)%ring.length:Math.floor(rng()*ring.length);
      this.searchBases=[...ring.slice(start),...ring.slice(0,start)];this.searchBaseIndex=0;
      this.metrics.patrolOrder=this.searchBases.map(base=>base.id);this.metrics.patrolStart=this.searchBases[0]?.id||null;this.metrics.patrolDirection=direction<0?'counterclockwise':'clockwise';this.metrics.routeVariant=match.settings.routeVariant||null;
    }
    if(!this.searchStarted){this.searchStarted=true;const landmark=this.searchBases[this.searchBaseIndex++].outside;this.go(match,u,landmark,3);return;}
    // Discover navigation cells by actual line of sight. No base registry or hidden entity positions.
    if(this.lastExploreCell!==key){
      this.lastExploreCell=key;
      for(let z=Math.max(0,c.z-radius);z<=Math.min(map.size-1,c.z+radius);z++)for(let x=Math.max(0,c.x-radius);x<=Math.min(map.size-1,c.x+radius);x++){
        const k=index(map,x,z);if(this.explored.has(k))continue;const p={x:x*map.cell,z:z*map.cell};if(distance(u,p)<=B.vision.troll&&lineOfSight(map,u,p))this.explored.add(k);
      }
    }
    if(this.exploreTarget&&match.time-this.exploreAt<16){if(!this.go(match,u,this.exploreTarget,.8))return;this.exploreTarget=null;}
    if(this.searchBaseIndex<this.searchBases.length){const landmark=this.searchBases[this.searchBaseIndex].outside;if(!this.go(match,u,landmark,3)){return;}this.searchBaseIndex++;return;}
    const blocked=this.navigationBlocks(match,u),queue=[c],seen=new Set([key]);let head=0,target=null;
    while(head<queue.length&&!target){const p=queue[head++];for(const[dx,dz]of[[1,0],[0,1],[-1,0],[0,-1]]){
      const x=p.x+dx,z=p.z+dz,k=index(map,x,z);if(!walkable(map,x,z)||blocked.has(k))continue;
      if(!this.explored.has(k)){const frontier={x:x*map.cell,z:z*map.cell};if(!this.brain?.avoid.some(a=>distance(a,frontier)<24)){target=frontier;break;}continue;}
      if(!seen.has(k)){seen.add(k);queue.push({x,z});}
    }}
    this.exploreTarget=target;this.exploreAt=match.time;
    if(target){this.go(match,u,target,.8);return;}
    // Once every frontier cell has been seen, keep revisiting the public
    // refuge landmarks. Enemy observations intentionally expire, so stopping
    // here could strand the Troll forever while a surviving Elf continued to
    // grow in a previously visited base.
    if(this.searchBases?.length){const shift=1+((this.searchCycle||0)%Math.max(1,this.searchBases.length-1));this.searchCycle=(this.searchCycle||0)+1;this.searchBases=[...this.searchBases.slice(shift),...this.searchBases.slice(0,shift)];this.searchBaseIndex=1;this.metrics.patrolCycles=(this.metrics.patrolCycles||0)+1;this.go(match,u,this.searchBases[0].outside,3);return;}
    this.stop(u);
  }
}
