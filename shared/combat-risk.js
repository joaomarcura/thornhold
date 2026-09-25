import { BALANCE as B, distance, towerDamage, mitigation, towerProfile } from './config.js';
import { lineOfSight } from './map.js';

// Only pass visible opponents or the bot's dated observations, never the world registry.
export function combatRisk(m,u,known,p=u,target=null){
  const stats=m.trollStats(u),towers=known.filter(e=>e.kind==='tower'&&e.hp>0&&e.progress===1&&!(e.disabledUntil>m.time));
  const firing=towers.filter(t=>distance(p,t)<=B.structures.tower.range+towerProfile(t).range&&lineOfSight(m.map,t,p,B.structures.tower.muzzleHeight,B.structures.tower.targetHeight));
  const exposure=1+Math.max(0,u.exposure-B.troll.exposureGrace)*B.troll.exposureRate;
  const dps=firing.reduce((n,t)=>{const b=towerProfile(t);return n+towerDamage(t.tier)*b.damage/(B.structures.tower.interval*b.interval)*mitigation(stats.armor*(1-b.armorPierce));},0)*exposure;
  const speed=stats.movement*(u.slowUntil>m.time?B.branches.frost.slow:1);
  const escapeSeconds=firing.length?Math.max(...firing.map(t=>(B.structures.tower.range+towerProfile(t).range-distance(p,t)+2)/speed)):0;
  const nearElves=known.filter(e=>e.role==='elf'&&e.hp>0&&distance(e,p)<12).length;
  const hit=stats.damage*(target?.kind?stats.siege:1),heavyReady=!(u.cooldowns.heavy>m.time);
  const killSeconds=target?Math.max(stats.interval,(target.hp-hit*(heavyReady?stats.heavy:1))/Math.max(1,hit/stats.interval)):0;
  const approachSeconds=distance(u,p)/Math.max(1,speed);
  // Elves currently repair/build, but have no damaging attack. Count local
  // support pressure separately instead of inventing Elf combat DPS.
  const support=nearElves*.04;
  const roarReady=!(u.cooldowns.roar>m.time)&&firing.some(t=>distance(u,t)<B.troll.roarRange);
  const riskScore=dps*Math.max(0,approachSeconds+killSeconds+escapeSeconds-(roarReady?B.troll.roarDuration:0))/Math.max(1,u.hp)+support;
  return {riskScore,dps,towers:firing.length,nearElves,escapeSeconds,killSeconds,approachSeconds,roarReady,heavyReady};
}
