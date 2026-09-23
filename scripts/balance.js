import { writeFile, mkdir } from 'node:fs/promises';
import { BALANCE as B, mitigation, structureHP, income, upgradeCost, trollCost, towerDamage } from '../shared/config.js';
import { combatStats } from '../shared/equipment.js';
const rows=[];
for(const [tier,level] of [[1,0],[2,1],[3,2],[4,3],[4,4],[6,6],[10,10]]){
  const stats=combatStats({levels:Object.fromEntries(Object.keys(B.upgrades).map(key=>[key,level]))});
  const trollDamage=stats.damage,interval=stats.interval,siege=stats.siege*(tier>=4&&level>=3?B.troll.finalSiege:1);
  // Sustained light-attack baseline, two Balista towers, no repair, exposure or heavy/roar abilities.
  const wall=structureHP('wall',tier),dps=trollDamage*siege/interval,towerDps=2*towerDamage(tier)*B.branches.power.damage/B.structures.tower.interval*mitigation(stats.armor),hp=stats.maxHp;
  const current={kind:'core',tier},next={kind:'core',tier:tier+1};
  rows.push({tier,trollLevel:level,finalSiegeApplied:tier>=4&&level>=3,wallHP:Math.round(wall),trollDPS:+dps.toFixed(1),timeToBreakWall:+(wall/dps).toFixed(1),twoTowerDPS:+towerDps.toFixed(1),timeToKillTroll:+(hp/towerDps).toFixed(1),income:+income(current).toFixed(2),economicPaybackSeconds:+(upgradeCost(current).gold/(income(next)-income(current))).toFixed(1),trollDamageUpgrade:trollCost('damage',level)});
}
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/balance.json',JSON.stringify({assumptions:'Referência contínua: ataques leves, duas Balistas, sem itens, combo, reparos, golpe pesado, rugido ou exposição. Tier 4 em diante após o desbloqueio inclui bônus de cerco. Níveis explícitos até 10, sem limite de progressão; não pressupõe que os lados alcancem esses níveis juntos. Payback marginal em ouro após a obra; madeira e tempo de melhoria são custos adicionais. Combate discreto real em combat-audit.json.',rows},null,2));console.table(rows);
