export function playerScore(u){
  const s=u.stats||{};
  if(u.role==='troll')return Math.round((s.damage||0)+(s.kills||0)*500+(s.structuresDestroyed||0)*350+(s.upgrades||0)*100);
  return Math.round((s.damage||0)+((s.goldGenerated||0)+(s.woodGenerated||0))*.25+
    (s.kills||0)*500+(s.upgrades||0)*120+(s.structuresBuilt||0)*100+
    (s.healing||0)*.2+(s.stuns||0)*400);
}

export function playerSummary(u){
  return {id:u.id,name:u.name,role:u.role,controller:u.controller,alive:u.alive,
    hp:Math.round(u.hp),maxHp:Math.round(u.maxHp),score:playerScore(u),
    kills:u.stats.kills||0,damage:Math.round(u.stats.damage||0),
    goldGenerated:Math.round(u.stats.goldGenerated||0),woodGenerated:Math.round(u.stats.woodGenerated||0),
    structuresBuilt:u.stats.structuresBuilt||0,structuresDestroyed:u.stats.structuresDestroyed||0,
    upgrades:u.stats.upgrades||0,healing:Math.round(u.stats.healing||0),stuns:u.stats.stuns||0,relocations:u.stats.relocations||0};
}
