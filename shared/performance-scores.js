const clamp=value=>Math.max(0,Math.min(100,Math.round(Number(value)||0)));
const ratio=(value,target)=>clamp((Number(value)||0)/Math.max(1,target)*100);

// Analytical feedback only. These scores never influence MMR or visible rating.
export function performanceScores(player={},match={}){
  const duration=Math.max(60,Number(match.duration)||60),minutes=duration/60,role=player.role;
  if(role==='troll')return {
    combat:ratio((player.damage||0)/minutes,450),
    economy:ratio((player.goldGenerated||0)/minutes,220),
    defense:ratio((player.healing||0)/minutes,100),
    tech:ratio(player.upgrades||0,12),
    efficiency:ratio((player.structuresDestroyed||0)*350+(player.kills||0)*700,4000),
    pressure:ratio((player.damage||0)+(player.structuresDestroyed||0)*500,18000)
  };
  return {
    combat:ratio((player.damage||0)/minutes,260),
    economy:ratio(((player.goldGenerated||0)+(player.woodGenerated||0))/minutes,400),
    defense:ratio((player.healing||0)+(player.stuns||0)*500,2500),
    tech:ratio((player.upgrades||0)+(player.technologyCards||0)*3,18),
    efficiency:ratio((player.damage||0)/Math.max(1,player.goldSpent||1),1.5),
    pressure:ratio((player.damage||0)+(player.structuresBuilt||0)*160,9000)
  };
}
