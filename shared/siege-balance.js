import { BALANCE as B, elfPath, mitigation, repairPower, towerDamage, towerProfile } from './config.js';

const round=(value,digits=3)=>Number.isFinite(value)?+value.toFixed(digits):0;

export function towerSiegeDps(tower,armor){
  const branch=towerProfile(tower),effectiveArmor=armor*(1-branch.armorPierce);
  if(tower.legendary||tower.tier>=B.legendary.tier){
    const tierFactor=towerDamage(tower.tier)/towerDamage(B.legendary.tier);
    return B.legendary.towerDps*tierFactor*B.legendary.parityRamp*mitigation(effectiveArmor);
  }
  return towerDamage(tower.tier)*branch.damage/(B.structures.tower.interval*branch.interval)*mitigation(effectiveArmor);
}

export function siegeParity(match,troll,wall,{towers=null,assumeRepair=true}={}){
  if(!match||!troll||wall?.kind!=='wall'||wall.hp<=0)return null;
  const stats=match.trollStats(troll),baseTowers=(towers||match.structures.filter(s=>s.kind==='tower'&&s.hp>0&&s.progress>=1&&s.baseId===wall.baseId)),incomingTowerDps=baseTowers.reduce((sum,tower)=>sum+towerSiegeDps(tower,stats.armor),0);
  const lightDps=stats.damage*stats.siege/Math.max(.1,stats.interval),heavyBonus=stats.damage*stats.siege*Math.max(0,stats.heavy-1)/Math.max(.1,stats.heavyCooldown),structureDps=lightDps+heavyBonus;
  let repairDps=0;
  if(assumeRepair&&wall.owner){
    const owner=match.unit(wall.owner),path=elfPath(owner?.elfPath);
    if(owner?.alive)repairDps=repairPower(wall)*(path?.repair||1);
  }
  const netStructureDps=Math.max(1,structureDps-repairDps),breakSeconds=wall.hp/netStructureDps,availableHp=troll.maxHp*(1+((troll.healCharges||0)>0?B.troll.healPercent:0)),survivalSeconds=incomingTowerDps>0?availableHp/incomingTowerDps:999,parity=survivalSeconds/breakSeconds;
  return {parity:round(parity),breakSeconds:round(breakSeconds,1),survivalSeconds:round(survivalSeconds,1),structureDps:round(structureDps,1),repairDps:round(repairDps,1),incomingTowerDps:round(incomingTowerDps,1),towerCount:baseTowers.length,viable:parity>=.45};
}
