import { BALANCE as B, distance, towerDamage, mitigation, towerProfile } from './config.js';
import { lineOfSight } from './map.js';

export function towerThreatAt(m,u,known,p,{projected=false}={}){
  const stats=m.trollStats(u),towers=known.filter(e=>e.kind==='tower'&&e.hp>0&&e.progress===1&&!(e.disabledUntil>m.time));
  const firing=towers.filter(t=>distance(p,t)<=B.structures.tower.range+towerProfile(t).range&&(projected||lineOfSight(m.map,t,p,B.structures.tower.muzzleHeight,B.structures.tower.targetHeight)));
  const exposure=1+Math.max(0,u.exposure-B.troll.exposureGrace)*B.troll.exposureRate;
  const dps=firing.reduce((n,t)=>{const b=towerProfile(t),certainty=Number.isFinite(t.confidence)?t.confidence:1;return n+towerDamage(t.tier)*b.damage/(B.structures.tower.interval*b.interval)*mitigation(stats.armor*(1-b.armorPierce))*certainty;},0)*exposure;
  return {dps,towers:firing.length,towerIds:firing.map(t=>t.id)};
}

// Single source of truth for candidate selection, active combat, retreat paths
// and strategic sectors. Callers may only pass visible enemies or dated
// observations; this function never reads hidden entities from the registry.
export function evaluateThreatAt(m,u,known,{position=u,target=null,path=[],projected=false}={}){
  const stats=m.trollStats(u),samples=[];
  if(path.length>1)for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],length=Math.max(.001,distance(a,b)),steps=Math.max(1,Math.ceil(length/4));
    for(let step=1;step<=steps;step++){const ratio=step/steps;samples.push({x:a.x+(b.x-a.x)*ratio,z:a.z+(b.z-a.z)*ratio,segment:length/steps});}
  }
  const here=towerThreatAt(m,u,known,position,{projected}),speed=stats.movement*(u.slowUntil>m.time?B.branches.frost.slow:1);
  let pathDamage=0,pathPeakDps=0,pathTowers=0;
  for(const sample of samples){const threat=towerThreatAt(m,u,known,sample,{projected});pathDamage+=threat.dps*sample.segment/Math.max(.1,speed);pathPeakDps=Math.max(pathPeakDps,threat.dps);pathTowers=Math.max(pathTowers,threat.towers);}
  const dps=here.dps,towers=here.towers;
  const threateningTowers=known.filter(t=>t.kind==='tower'&&t.hp>0&&t.progress===1&&distance(position,t)<=B.structures.tower.range+towerProfile(t).range);
  const escapeSeconds=threateningTowers.length?Math.max(...threateningTowers.map(t=>(B.structures.tower.range+towerProfile(t).range-distance(position,t)+2)/speed)):0;
  const nearElves=known.filter(e=>e.role==='elf'&&e.hp>0&&distance(e,position)<12).length;
  const hit=stats.damage*(target?.kind?stats.siege:1),heavyReady=!(u.cooldowns.heavy>m.time);
  const killSeconds=target?Math.max(stats.interval,(target.hp-hit*(heavyReady?stats.heavy:1))/Math.max(1,hit/stats.interval)):0;
  const approachSeconds=samples.reduce((total,s)=>total+s.segment,0)/Math.max(1,speed)||distance(u,position)/Math.max(1,speed);
  // Elves currently repair/build, but have no damaging attack. Count local
  // support pressure separately instead of inventing Elf combat DPS.
  const support=nearElves*.04;
  const roarReady=!(u.cooldowns.roar>m.time)&&threateningTowers.some(t=>distance(u,t)<B.troll.roarRange);
  const exposureSeconds=Math.max(0,killSeconds+escapeSeconds-(roarReady?B.troll.roarDuration:0));
  const riskScore=(pathDamage+Math.max(dps,pathPeakDps)*exposureSeconds)/Math.max(1,u.hp)+support;
  return {riskScore,dps,towers,nearElves,escapeSeconds,killSeconds,approachSeconds,roarReady,heavyReady,pathDamage,pathPeakDps};
}

export function combatRisk(m,u,known,p=u,target=null){
  return evaluateThreatAt(m,u,known,{position:p,target});
}
