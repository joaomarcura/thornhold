import { BALANCE as B, distance, mitigation, trollCost, towerDamage } from './config.js';
import { ITEMS, BUILDS } from './equipment.js';
import { lineOfSight, pathfind, toCell, walkable, index } from './map.js';

// Decisions use own state, visible opponents and dated observations only.
export class TrollBrain {
  constructor(){this.state='scout';this.targetId=null;this.committedUntil=0;this.avoid=[];this.safePoint=null;this.lastHp=null;this.lastTime=0;this.damageRate=0;this.engagedAt=0;this.recoveryUntil=0;}
  tick(c,m,u){
    if(m.state!=='MATCH_ACTIVE'){c.stop(u);return;}
    const now=m.time,visible=m.visibleEnemies(u),elapsed=Math.max(.1,now-this.lastTime);
    this.damageRate=this.damageRate*.55+Math.max(0,(this.lastHp??u.hp)-u.hp)/elapsed*.45;
    this.lastHp=u.hp;this.lastTime=now;
    for(const e of visible)c.discovered.set(e.id,{id:e.id,x:e.x,z:e.z,kind:e.kind,role:e.role,hp:e.hp,maxHp:e.maxHp,tier:e.tier,branch:e.branch,progress:e.progress,disabledUntil:e.disabledUntil,seenAt:now});
    for(const[id,e]of c.discovered)if((m.canSee(u,e)&&!visible.some(a=>a.id===id))||now-e.seenAt>(e.role?8:100))c.discovered.delete(id);
    this.avoid=this.avoid.filter(a=>a.until>now);
    const knownTowers=[...c.discovered.values()].filter(e=>e.kind==='tower'&&e.progress===1);
    const threatened=now-u.lastHit<3,stats=m.trollStats(u);
    const risk=p=>knownTowers.reduce((d,t)=>{
      const branch=B.branches[t.branch]||B.branches.power;
      if(t.disabledUntil>now||distance(p,t)>B.structures.tower.range+branch.range||!lineOfSight(m.map,p,t))return d;
      return d+towerDamage(t.tier)*branch.damage/(B.structures.tower.interval*branch.interval)*mitigation(stats.armor*(1-branch.armorPierce));
    },0);
    const dps=Math.max(this.damageRate,risk(u))*(1+Math.max(0,u.exposure-B.troll.exposureGrace)*B.troll.exposureRate);
    this.purchase(m,u,threatened,knownTowers);
    const candidates=visible.filter(e=>!m.wallBlocks(u,e));
    const score=e=>{
      const killTime=e.hp/(stats.damage/stats.interval*(e.kind?stats.siege:1)*1.2);
      return distance(u,e)+Math.min(45,killTime)*.55+risk(e)*.12+(e.role==='elf'?-38:e.kind==='tower'?-12:e.kind==='core'?-6:0)+(this.avoid.some(a=>distance(a,e)<16)?95:0);
    };
    candidates.sort((a,b)=>score(a)-score(b));
    let target=candidates[0];
    const current=candidates.find(e=>e.id===this.targetId);
    if(current&&now<this.committedUntil&&(!target||score(current)<score(target)+18))target=current;
    const inRange=target&&distance(u,target)<=stats.range+(target.kind?B.structures[target.kind].radius:0);
    // A cheap worker is not worth ignoring lethal tower fire. Account for the real heavy cooldown.
    const finishing=inRange&&target.role==='elf'&&target.hp<=stats.damage*(u.cooldowns.heavy>now?1:stats.heavy);
    const survival=u.hp/Math.max(1,dps),health=u.hp/u.maxHp;
    const overextended=threatened&&((survival<5.5&&!finishing)||(u.exposure>17&&survival<18&&!finishing));
    if(!c.retreating&&(health<c.profile.retreat||overextended)){
      c.retreating=true;this.state='retreat';this.safePoint=null;this.recoveryUntil=now+36;
      // Keep a failed siege excluded beyond recovery so the hunter searches another branch.
      if(target)this.avoid.push({x:target.x,z:target.z,until:now+100});
      this.targetId=null;c.exploreTarget=null;
    }
    if(c.retreating){
      const recovering=!threatened&&risk(u)<1;
      const hungerSoon=now>B.hungerAge-10&&now-u.lastAttack>B.hungerGrace-10;
      if(recovering&&(health>.76||(now>this.recoveryUntil&&health>.5)||hungerSoon)){
        c.retreating=false;this.safePoint=null;this.state='rotate';c.exploreTarget=null;
      }else{
        if(recovering){this.state='recover';c.stop(u);return;}
        this.state='retreat';
        if(!this.safePoint||risk(this.safePoint)>2||distance(u,this.safePoint)<2){
          const options=[],blocked=c.navigationBlocks(m,u);
          for(const radius of [12,22,32])for(let i=0;i<12;i++){
            const p={x:u.x+Math.sin(i*Math.PI/6)*radius,z:u.z+Math.cos(i*Math.PI/6)*radius};
            const cell=toCell(m.map,p);
            if(walkable(m.map,cell.x,cell.z)&&!blocked.has(index(m.map,cell.x,cell.z)))options.push({...p,score:risk(p)*8+radius});
          }
          options.sort((a,b)=>a.score-b.score);
          this.safePoint=options.find(p=>pathfind(m.map,u,p,c.navigationBlocks(m,u)).length)||m.map.trollSpawn;
        }
        c.go(m,u,this.safePoint,1.2);c.follow(m,u);
        if(threatened&&Math.hypot(u.input.x,u.input.z)>.5&&!(u.cooldowns.dash>now))m.act(u.id,{type:'dash'});
        if(visible.some(e=>e.kind==='tower'&&distance(u,e)<B.troll.roarRange)&&!(u.cooldowns.roar>now))m.act(u.id,{type:'roar'});
        return;
      }
    }
    if(target&&!this.avoid.some(a=>distance(a,target)<16)){
      if(this.targetId!==target.id){this.targetId=target.id;this.committedUntil=now+4;this.engagedAt=now;}
      this.state=target.role==='elf'?'pursue':'siege';
      const reach=stats.range+(target.kind?B.structures[target.kind].radius:0)-.35;
      if(c.go(m,u,target,reach)){
        u.yaw=Math.atan2(target.x-u.x,target.z-u.z);
        if(threatened&&visible.some(e=>e.kind==='tower'&&distance(u,e)<B.troll.roarRange)&&!(u.cooldowns.roar>now))m.act(u.id,{type:'roar'});
        m.act(u.id,{type:'attack',heavy:!(u.cooldowns.heavy>now)});
      }else if(target.role==='elf'&&distance(u,target)>8&&distance(u,target)<18&&dps<10){c.follow(m,u);if(!(u.cooldowns.dash>now))m.act(u.id,{type:'dash'});}
      return;
    }
    this.targetId=null;this.state=this.avoid.length?'rotate':'scout';
    const memories=[...c.discovered.values()].filter(e=>!this.avoid.some(a=>distance(a,e)<16)).sort((a,b)=>distance(u,a)-distance(u,b));
    if(memories.length){c.go(m,u,memories[0],3);return;}
    c.explore(m,u);
  }
  purchase(m,u,threatened,towers){
    if(!u.pendingStrike&&m.time-u.lastHit>=5&&m.time-u.lastAttack>=5&&Object.values(u.levels).reduce((a,b)=>a+b,0)>=2){
      this.build??=Object.values(BUILDS)[[...m.map.seed].reduce((n,c)=>n+c.charCodeAt(0),0)%3];
      const item=this.build.items.find(id=>!u.inventory.includes(id)&&u.gold>=ITEMS[id].cost);
      if(item){m.act(u.id,{type:'buyItem',item});return;}
    }
    const injured=u.hp/u.maxHp<.6,armored=towers.some(t=>t.branch==='pierce');
    const weights={damage:5,speed:3.7,siege:4.5,health:injured?13:3,armor:threatened&&!armored?9:3,regen:u.hp<u.maxHp*.85?10:4,movement:this.state==='pursue'?6:1.5,utility:towers.length>1?4:1};
    if(u.slowUntil>m.time)weights.movement+=3;
    const options=Object.keys(weights).filter(k=>(u.levels[k]<3||m.time>B.finalAge)&&u.gold>=trollCost(k,u.levels[k]));
    options.sort((a,b)=>weights[b]/(1+u.levels[b]*1.2)-weights[a]/(1+u.levels[a]*1.2));
    if(options[0])m.act(u.id,{type:'buy',key:options[0]});
  }
}
