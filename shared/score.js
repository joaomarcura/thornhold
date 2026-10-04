export function playerScore(u){
  const s=u.stats||{};
  if(u.role==='troll')return Math.round((s.damage||0)+(s.kills||0)*500+(s.ghostsDestroyed||0)*100+(s.structuresDestroyed||0)*350+(s.upgrades||0)*100);
  return Math.round((s.damage||0)+((s.goldGenerated||0)+(s.woodGenerated||0))*.25+(s.essenceGenerated||0)*3+
    (s.kills||0)*500+(s.upgrades||0)*120+(s.structuresBuilt||0)*100+
    (s.healing||0)*.2+(s.stuns||0)*400);
}

export function teamScores(units=[]){
  return units.reduce((scores,u)=>{
    if(u.role==='troll'||u.role==='elf')scores[u.role]+=playerScore(u);
    return scores;
  },{troll:0,elf:0});
}

export function playerSummary(u){
  return {id:u.id,name:u.name,role:u.role,controller:u.controller,alive:u.alive,ghost:u.ghost,observer:u.observer,
    ...(u.role==='troll'?{trollLevel:u.trollLevel||1}:{}),
    hp:Math.round(u.hp),maxHp:Math.round(u.maxHp),score:playerScore(u),
    kills:u.stats.kills||0,damage:Math.round(u.stats.damage||0),
    goldGenerated:Math.round(u.stats.goldGenerated||0),woodGenerated:Math.round(u.stats.woodGenerated||0),essenceGenerated:Math.round(u.stats.essenceGenerated||0),elfPath:u.elfPath||null,
    structuresBuilt:u.stats.structuresBuilt||0,structuresDestroyed:u.stats.structuresDestroyed||0,
    fishingCasts:u.stats.fishingCasts||0,fishCaught:u.stats.fishCaught||0,fishLost:u.stats.fishLost||0,fishingCancelled:u.stats.fishingCancelled||0,fishingValue:u.stats.fishingValue||0,fishSold:u.stats.fishSold||0,goldFromFishing:u.stats.goldFromFishing||0,rodLevel:u.rodLevel||1,
    upgrades:u.stats.upgrades||0,technologyCards:u.stats.technologyCards||0,healing:Math.round(u.stats.healing||0),stuns:u.stats.stuns||0,relocations:u.stats.relocations||0,reveals:u.stats.reveals||0,ghostsDestroyed:u.stats.ghostsDestroyed||0};
}
