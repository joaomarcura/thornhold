import { BALANCE as B, distance, upgradeCost, wispCost, wispUpgradeCost } from './config.js';
import { pathfind, toCell, index, lineOfSight, walkable, baseAt, randomFor } from './map.js';
import { TrollBrain } from './troll-brain.js';
import { availableTrees } from './wisps.js';

// Controllers only choose intentions. Every cost, hit, cooldown and collision goes through Match.
export class AIController {
  constructor(difficulty='normal'){this.profile=B.difficulty[difficulty]||B.difficulty.normal;this.difficulty=difficulty;this.nextThink=0;this.route=[];this.destination=null;this.routeAt=-100;this.explored=new Set();this.exploreTarget=null;this.exploreAt=0;this.discovered=new Map();this.retreating=false;this.navigationFailure=null;this.lastNavigationEntity=null;this.lastNavigationAt=-Infinity;this.metrics={idle:0,attacking:0,defending:0,retreating:0,failedNavigation:0,failedExploration:0,pathRecalculations:0,retreatAttempts:0,retreatSuccesses:0,targetChanges:0,stuckNavigation:0};}
  tick(match,u,dt){
    if(match.time>=this.nextThink){this.nextThink=match.time+this.profile.think;if(u.ghost)this.ghost(match,u);else if(u.role==='elf')this.elf(match,u);else this.troll(match,u);}
    // Brain decisions only update the intention. Apply movement once per tick;
    // calling follow both inside the brain and here caused route churn during retreat.
    if(this.destination)this.follow(match,u,dt);else u.input={x:0,z:0};
    // Once a target is chosen, hold the attack like a human holding the mouse.
    // Difficulty still controls when the bot reconsiders its target or retreat.
    if(u.role==='troll'&&!this.retreating&&['siege','pursue'].includes(this.brain?.state)){
      const target=match.entity(this.brain.targetId),stats=match.trollStats(u);
      if(target?.hp>0&&match.canSee(u,target)&&!match.wallBlocks(u,target)&&distance(u,target)<=stats.range+(target.kind?B.structures[target.kind].radius:0)-.1){
        u.yaw=Math.atan2(target.x-u.x,target.z-u.z);match.act(u.id,{type:'attack',heavy:!(u.cooldowns.heavy>match.time)});
      }
    }
    if(u.role==='troll'){
      const state=this.retreating?'retreat':this.brain?.state||'idle';
      this.metrics[state==='pursue'||state==='siege'?'attacking':state==='retreat'||state==='recover'?'retreating':state==='rotate'||state==='scout'?'defending':'idle']+=dt;
    }
  }
  stop(u){this.destination=null;this.route=[];u.input={x:0,z:0};}
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
      if(distance(u,this.progressProbe)<.3&&this.route.length){this.metrics.stuckNavigation++;this.route=[];this.routeAt=-100;this.navigationFailure=target.entityId||'point';this.stop(u);this.progressProbe=null;return;}
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
      if(target.entityId){if(this.lastNavigationEntity!==target.entityId||match.time-this.lastNavigationAt>15)this.metrics.failedNavigation++;this.lastNavigationEntity=target.entityId;this.lastNavigationAt=match.time;}else this.metrics.failedExploration++;this.navigationFailure=target.entityId||'point';this.destination=null;this.route=[];this.routeAt=-100;u.input={x:0,z:0};return;
    }
    const d=distance(u,next),speed=(u.role==='elf'?B.elf.speed:match.trollStats(u).movement)*B.movement.sprint*(u.dashUntil>match.time?B.troll.dashSpeed:1),divisor=Math.max(.001,d,speed*dt);u.input={x:(next.x-u.x)/divisor,z:(next.z-u.z)/divisor,sprint:u.role==='elf'||this.retreating};u.yaw=Math.atan2(u.input.x,u.input.z);
  }
  actNear(match,u,target,cmd,reach=5){
    if(cmd.type==='build'&&cmd.kind!=='wall'&&distance(u,target)<B.structures[cmd.kind].radius+.5){
      const choices=[[2.2,0],[-2.2,0],[0,2.2],[0,-2.2]].map(([x,z])=>({x:target.x+x,z:target.z+z})).filter(p=>match.positionValid(u,p.x,p.z));
      if(choices[0])this.go(match,u,choices[0],.2);return 'moving';
    }
    if(this.go(match,u,target,reach)){u.yaw=Math.atan2(target.x-u.x,target.z-u.z);return match.act(u.id,cmd);}return 'moving';
  }
  ghost(match,u){
    const wall=match.structures.filter(s=>s.kind==='wall'&&s.hp>0&&s.progress>=1&&s.hp<s.maxHp).sort((a,b)=>distance(u,a)-distance(u,b))[0];
    if(wall){this.actNear(match,u,wall,{type:'repair',target:wall.id});return;}
    if(!(u.cooldowns.ghostReveal>match.time)){match.act(u.id,{type:'ghostReveal'});this.stop(u);return;}
    const ally=match.units.filter(a=>a.role==='elf'&&a.alive).sort((a,b)=>distance(u,a)-distance(u,b))[0];if(ally)this.go(match,u,ally,4);else this.stop(u);
  }
  elf(match,u){
    const own=match.structures.filter(s=>s.owner===u.id&&s.hp>0),core=own.find(s=>s.kind==='core');
    if(own.some(s=>s.progress<1)){const work=own.find(s=>s.progress<1);this.actNear(match,u,work,{type:'assist',target:work.id});return;}
    let base=match.map.bases.find(b=>b.id===u.baseId);
    if(!core){
      const elves=match.units.filter(a=>a.role==='elf'),offset=elves.findIndex(a=>a.id===u.id);
      const claimed=new Set(match.structures.filter(s=>s.kind==='core'&&s.hp>0).map(s=>s.baseId));
      if(!this.refuges){const rng=randomFor(match.map.seed+'refuges');this.refuges=[...match.map.bases];for(let i=this.refuges.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[this.refuges[i],this.refuges[j]]=[this.refuges[j],this.refuges[i]];}}
      base=Array.from({length:this.refuges.length},(_,i)=>this.refuges[(offset+i)%this.refuges.length]).find(b=>!claimed.has(b.id));if(!base)return;
      const p={x:base.x,z:base.z};
      // Reach the interior before laying a foundation, then stand off its footprint.
      if(!lineOfSight(match.map,u,p)||distance(u,p)>6){this.go(match,u,{x:p.x+4.4,z:p.z},.5);return;}
      if(distance(u,p)<2.1){this.go(match,u,{x:p.x+4.4,z:p.z},.5);return;}
      if(!match.freeRelocation(u)&&(u.gold<B.structures.core.gold||u.wood<B.structures.core.wood)){this.gather(match,u,base);return;}
      match.act(u.id,{type:'build',kind:'core',...p});this.stop(u);return;
    }
    base=match.map.bases.find(b=>b.id===core.baseId);
    const wall=own.find(s=>s.kind==='wall'),towers=own.filter(s=>s.kind==='tower');
    const threat=match.visibleEnemies(u).find(e=>e.role==='troll');
    const stun=match.elfStunStatus(u);
    if(threat&&stun.available){
      match.act(u.id,{type:'elfStun'});
      // Use the three-second opening for a short lateral reposition inside the
      // refuge. Running to a far corner made bots abandon repairs and concede.
      const dx=u.x-threat.x,dz=u.z-threat.z,n=Math.max(.001,Math.hypot(dx,dz)),away={x:dx/n,z:dz/n},side={x:-away.z,z:away.x};
      const choices=[[away.x*6,away.z*6],[away.x*4+side.x*4,away.z*4+side.z*4],[away.x*4-side.x*4,away.z*4-side.z*4]]
        .map(([x,z])=>({x:u.x+x,z:u.z+z})).filter(p=>baseAt(match.map,p)?.id===base.id&&match.positionValid(u,p.x,p.z));
      choices.sort((a,b)=>distance(b,threat)-distance(a,threat));if(choices[0])this.go(match,u,choices[0],.8);return;
    }
    const gateDistance=distance(base,base.gate),ix=(base.x-base.gate.x)/gateDistance*match.map.cell,iz=(base.z-base.gate.z)/gateDistance*match.map.cell;
    const towerPositions=[];for(const depth of [2,3,4])for(const side of [-1,1,-2,2])towerPositions.push({x:base.gate.x+ix*depth+side*iz,z:base.gate.z+iz*depth-side*ix});
    const towerPosition=towerPositions.find(p=>baseAt(match.map,p)?.id===base.id&&match.positionValid(u,p.x,p.z)&&!match.structures.some(s=>s.hp>0&&distance(s,p)<B.structures[s.kind].radius+B.structures.tower.radius+.3)&&!match.trees.some(t=>t.amount>0&&distance(t,p)<B.structures.tower.radius+.55));
    const buildTower=()=>{const p=towerPosition;if(p)return this.actNear(match,u,p,{type:'build',kind:'tower',...p});return 'no-position';};
    if(wall&&wall.hp/wall.maxHp<this.profile.repair){this.actNear(match,u,wall,{type:'repair',target:wall.id});return;}
    if(u.wood<45){this.gather(match,u,base);return;}
    // The first defensive tower is the bot's opening combat insurance. Building
    // the wall first leaves no reaction window when the Troll arrives early.
    if(!towers.length&&u.gold>=B.structures.tower.gold&&u.wood>=B.structures.tower.wood){if(buildTower()!=='no-position')return;}
    if(!wall){
      if((match.breachUntil.get(base.id)||0)>match.time||(threat&&distance(threat,base.gate)<B.construction.enemyClearance)){
        // Survive the breach instead of repeatedly issuing a rejected rebuild.
        const choices=[[-7,-7],[-7,7],[7,-7],[7,7]].map(([x,z])=>({x:base.x+x,z:base.z+z})).filter(p=>match.positionValid(u,p.x,p.z));
        choices.sort((a,b)=>distance(b,threat||base.gate)-distance(a,threat||base.gate));if(choices[0])this.go(match,u,choices[0],1);return;
      }
      if(u.gold>=B.structures.wall.gold&&u.wood>=B.structures.wall.wood)this.actNear(match,u,base.gate,{type:'build',kind:'wall',x:base.gate.x,z:base.gate.z});else this.gather(match,u,base);return;
    }
    if(threat&&wall.hp<wall.maxHp*.95){this.actNear(match,u,wall,{type:'repair',target:wall.id});return;}
    const wisps=match.wisps.filter(w=>w.owner===u.id&&w.alive),training=wisps.some(w=>w.readyAt>match.time),hire=wispCost(wisps.length);
    if(!threat&&!training&&towers.length&&wisps.length<Math.min(4,core.tier+1)&&u.gold>=hire.gold+35&&u.wood>=hire.wood&&availableTrees(match,u,core).length){this.actNear(match,u,core,{type:'trainWisp',target:core.id});return;}
    const upgrade=s=>this.actNear(match,u,s,{type:'upgrade',target:s.id,branch:s.kind==='tower'?(this.difficulty==='hard'?'pierce':towers.indexOf(s)%2?'frost':'power'):undefined});
    const affordable=s=>s&&!s.upgrading&&(s.tier<3||match.time>B.finalAge)&&u.gold>=upgradeCost(s).gold&&u.wood>=upgradeCost(s).wood;
    if(core.tier<=wall.tier&&affordable(core)&&!threat){upgrade(core);return;}
    if(affordable(wall)&&(threat||wall.tier<core.tier)){upgrade(wall);return;}
    if(towers.length<Math.min(B.construction.limits.tower,core.tier+1)&&u.gold>=B.structures.tower.gold+35){if(buildTower()!=='no-position')return;}
    const tower=towers.sort((a,b)=>a.tier-b.tier).find(affordable);if(tower){upgrade(tower);return;}
    if(affordable(core)){upgrade(core);return;}
    if(!own.some(s=>s.kind==='mine')&&core.tier>=2&&u.gold>200){const p={x:base.x+4.4,z:base.z+4.4};this.actNear(match,u,p,{type:'build',kind:'mine',...p});return;}
    if(!own.some(s=>s.kind==='workshop')&&core.tier>=3&&u.gold>300){const p={x:base.x-4.4,z:base.z+4.4};this.actNear(match,u,p,{type:'build',kind:'workshop',...p});return;}
    const worker=wisps.filter(w=>w.readyAt<=match.time&&!w.upgradingUntil&&w.level<core.tier+1).sort((a,b)=>a.level-b.level).find(w=>u.gold>=wispUpgradeCost(w.level).gold&&u.wood>=wispUpgradeCost(w.level).wood);
    if(worker&&!threat){this.actNear(match,u,core,{type:'upgradeWisp',target:worker.id});return;}
    const utility=own.find(s=>['mine','workshop'].includes(s.kind)&&s.tier<core.tier&&affordable(s));if(utility&&!threat){upgrade(utility);return;}
    const reserve=Math.max(120,...own.map(s=>upgradeCost(s).wood*2));
    if(u.wood>reserve&&wisps.length){this.go(match,u,{x:base.x+4.4,z:base.z},1);return;}
    this.gather(match,u,base);
  }
  gather(match,u,base){const trees=match.trees.filter(t=>t.amount>0&&!match.wisps.some(w=>w.alive&&w.treeId===t.id)&&(baseAt(match.map,t)?.id===base.id||match.canSee(u,t))).sort((a,b)=>distance(u,a)-distance(u,b));const t=trees[0];if(t)this.actNear(match,u,t,{type:'gather',target:t.id});else this.stop(u);}
  troll(match,u){this.brain??=new TrollBrain();this.brain.tick(this,match,u);}
  explore(match,u){
    const map=match.map,c=toCell(map,u),key=index(map,c.x,c.z),radius=Math.ceil(B.vision.troll/map.cell);
    // The central release point is shared map knowledge, not hidden enemy
    // information. Check it once before committing to the full frontier scan;
    // this prevents the Troll from spending the whole match circling empty
    // woodland after the Elves have already left for their refuges.
    if(!this.searchStarted){this.searchStarted=true;this.go(match,u,map.elfSpawn,3);return;}
    // Discover navigation cells by actual line of sight. No base registry or hidden entity positions.
    if(this.lastExploreCell!==key){
      this.lastExploreCell=key;
      for(let z=Math.max(0,c.z-radius);z<=Math.min(map.size-1,c.z+radius);z++)for(let x=Math.max(0,c.x-radius);x<=Math.min(map.size-1,c.x+radius);x++){
        const k=index(map,x,z);if(this.explored.has(k))continue;const p={x:x*map.cell,z:z*map.cell};if(distance(u,p)<=B.vision.troll&&lineOfSight(map,u,p))this.explored.add(k);
      }
    }
    if(this.exploreTarget&&match.time-this.exploreAt<16){if(!this.go(match,u,this.exploreTarget,.8))return;this.exploreTarget=null;}
    // Refuges are strategic landmarks, not hidden entity observations. Patrol
    // their outside ramps in a deterministic order so the Troll eventually
    // finds every defended base instead of spending the whole match on local
    // frontier expansion.
    if(!this.searchBases){this.searchBases=[...map.bases].sort((a,b)=>distance(u,a.outside)-distance(u,b.outside));this.searchBaseIndex=0;}
    if(this.searchBaseIndex<this.searchBases.length){const landmark=this.searchBases[this.searchBaseIndex].outside;if(!this.go(match,u,landmark,3)){return;}this.searchBaseIndex++;return;}
    const blocked=this.navigationBlocks(match,u),queue=[c],seen=new Set([key]);let head=0,target=null;
    while(head<queue.length&&!target){const p=queue[head++];for(const[dx,dz]of[[1,0],[0,1],[-1,0],[0,-1]]){
      const x=p.x+dx,z=p.z+dz,k=index(map,x,z);if(!walkable(map,x,z)||blocked.has(k))continue;
      if(!this.explored.has(k)){const frontier={x:x*map.cell,z:z*map.cell};if(!this.brain?.avoid.some(a=>distance(a,frontier)<24)){target=frontier;break;}continue;}
      if(!seen.has(k)){seen.add(k);queue.push({x,z});}
    }}
    this.exploreTarget=target;this.exploreAt=match.time;if(target)this.go(match,u,target,.8);else this.stop(u);
  }
}
