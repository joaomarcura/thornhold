import { BALANCE as B, distance, wispCost, wispIncome, wispUpgradeCost, elfPath } from './config.js';
import { baseAt } from './map.js';
import { recordSpend } from './economy.js';
import { productionBreakdown, technologyEffects } from './elf-progression.js';

export function availableTrees(m,u,core){
  return m.trees.filter(t=>t.amount>0&&distance(t,core)<=B.wisps.range&&
    (baseAt(m.map,t)?.id===core.baseId||(t.rich&&m.teamSee(u,t)))&&
    !m.wisps.some(w=>w.alive&&w.treeId===t.id))
    .sort((a,b)=>distance(a,core)-distance(b,core)||a.id.localeCompare(b.id));
}
export function commandWisp(m,u,cmd){
  if(u.role!=='elf')return 'Apenas Elfos cultivam Wisps.';
  if(cmd.type==='trainSpecialWisp')return 'Cristais são coletados manualmente; Wisps especiais foram removidos.';
  if(cmd.type==='trainWisp'){
    const core=m.structures.find(s=>s.id===cmd.target&&s.kind==='core'&&s.owner===u.id&&s.hp>0&&s.progress===1);
    if(!core||distance(core,u)>B.interactRange||!m.canSee(u,core))return 'Aproxime-se do seu núcleo concluído.';
    if(m.wisps.some(w=>w.alive&&w.owner===u.id&&w.readyAt>m.time))return 'Um Wisp já está sendo formado.';
    const trees=availableTrees(m,u,core),tree=trees[0];
    if(!tree)return 'Nenhuma árvore livre no alcance do núcleo. Evolua seus Wisps ou aguarde o rebrote.';
    const cost=wispCost(m.wisps.filter(w=>w.owner===u.id&&w.alive).length);
    if(u.gold<cost.gold||u.wood<cost.wood)return 'Recursos insuficientes para formar Wisp.';
    u.gold-=cost.gold;u.wood-=cost.wood;recordSpend(u,cost,'economy','training');
    const w={id:'w'+m.nextId++,role:'wisp',name:'Wisp',owner:u.id,treeId:tree.id,rich:tree.rich,x:tree.x,z:tree.z,
      level:1,hp:B.wisps.hp,maxHp:B.wisps.hp,alive:true,readyAt:m.time+B.wisps.trainSeconds,upgradingUntil:0,lastHit:-100,bounty:cost.gold*.3};
    w.job={type:'train',...cost,duration:B.wisps.trainSeconds,until:w.readyAt};m.wisps.push(w);m.wispById?.set(w.id,w);m.emit('wisp-trained',{entity:w.id,unit:u.id,x:w.x,z:w.z});return;
  }
  if(cmd.type==='upgradeAllWisps'){
    const core=m.structures.find(s=>s.id===cmd.target&&s.kind==='core'&&s.owner===u.id&&s.hp>0&&s.progress===1);
    if(!core||distance(core,u)>B.interactRange||!m.canSee(u,core))return 'Gerencie Wisps perto do seu núcleo.';
    const eligible=m.wisps.filter(w=>w.alive&&!w.specialNodeId&&w.owner===u.id&&w.level<B.maxTier&&w.readyAt<=m.time&&w.upgradingUntil<=m.time).sort((a,b)=>a.id.localeCompare(b.id));
    let upgraded=0;
    for(const w of eligible){
      const cost=wispUpgradeCost(w.level);if(u.gold<cost.gold||u.wood<cost.wood)continue;
      u.gold-=cost.gold;u.wood-=cost.wood;recordSpend(u,cost,'economy','upgrade');w.upgradingUntil=m.time+B.wisps.seconds;w.job={type:'wisp-upgrade',...cost,duration:B.wisps.seconds,until:w.upgradingUntil};upgraded++;
      m.emit('upgrade',{unit:u.id,entity:w.id,x:w.x,z:w.z});
    }
    if(!upgraded)return 'Nenhum Wisp elegível pôde ser evoluído com os recursos atuais.';
    u.stats.upgrades+=upgraded;m.stats.upgrades+=upgraded;return;
  }
  const w=m.wisps.find(w=>w.id===cmd.target&&w.alive&&w.owner===u.id);
  if(!w)return 'Selecione um Wisp seu.';
  const core=m.structures.find(s=>s.owner===u.id&&s.kind==='core'&&s.hp>0&&s.progress===1);
  if(!core||distance(core,u)>B.interactRange||!m.canSee(u,core))return 'Gerencie Wisps perto do seu núcleo.';
  if(w.readyAt>m.time||w.upgradingUntil>m.time)return 'O Wisp está em formação ou evoluindo.';
  if(cmd.type==='upgradeWisp'){
    if(w.specialNodeId)return 'Wisps especiais evoluem pela progressão Industrial.';
    if(w.level>=B.maxTier)return 'Wisp no nível Épico máximo.';
    const cost=wispUpgradeCost(w.level);if(u.gold<cost.gold||u.wood<cost.wood)return 'Recursos insuficientes para evoluir Wisp.';
    u.gold-=cost.gold;u.wood-=cost.wood;recordSpend(u,cost,'economy','upgrade');w.upgradingUntil=m.time+B.wisps.seconds;w.job={type:'wisp-upgrade',...cost,duration:B.wisps.seconds,until:w.upgradingUntil};u.stats.upgrades++;m.stats.upgrades++;
    m.emit('upgrade',{unit:u.id,entity:w.id,x:w.x,z:w.z});return;
  }
}
export function wispActive(m,w){
  if(w.specialNodeId)return w.alive&&w.readyAt<=m.time&&m.unit(w.owner)?.alive&&m.specialNodes.some(n=>n.id===w.specialNodeId&&n.amount>0);
  return w.alive&&w.readyAt<=m.time&&m.unit(w.owner)?.alive&&m.trees.some(t=>t.id===w.treeId&&t.amount>0)&&
    m.structures.some(s=>s.kind==='core'&&s.owner===w.owner&&s.hp>0&&s.progress===1&&distance(s,w)<=B.wisps.range);
}
export function stepWisps(m,dt){
  for(const tree of m.trees)if(tree.amount<=0){
    tree.regrowAt??=m.time+B.wisps.regrowSeconds;
    if(tree.regrowAt<=m.time&&!m.structures.some(s=>s.hp>0&&distance(s,tree)<B.structures[s.kind].radius+.55)){
      tree.amount=B.economy.treeStock;delete tree.regrowAt;
    }
  }
  for(const w of m.wisps){
    if(!w.alive)continue;
    const owner=m.unit(w.owner);
    if(!owner?.alive){w.alive=false;continue;}
    if(w.job&&w.job.until<=m.time)delete w.job;
    if(w.upgradingUntil&&w.upgradingUntil<=m.time){w.upgradingUntil=0;w.level++;w.maxHp+=5;w.hp=Math.min(w.maxHp,w.hp+5);m.emit('complete',{entity:w.id,x:w.x,z:w.z});}
    if(w.specialResource||w.specialNodeId){w.alive=false;continue;}
    if(wispActive(m,w)){
      const pathMultiplier=elfPath(owner.elfPath)?.wood||1,breakdown=productionBreakdown(m,owner,w),baseRate=wispIncome(w)*pathMultiplier,rate=baseRate*breakdown.multiplier,amount=rate*dt;owner.wood+=amount;owner.stats.woodGenerated=(owner.stats.woodGenerated||0)+amount;owner.stats.wispWoodGenerated=(owner.stats.wispWoodGenerated||0)+amount;owner.stats.specializationImpact.refineryBonusWood+=baseRate*(breakdown.withoutOverdrive-breakdown.base)*dt;owner.stats.specializationImpact.overdriveBonusWood+=baseRate*(breakdown.multiplier-breakdown.withoutOverdrive)*dt;w.productionPulse=(w.productionPulse||0)+amount;
      if((w.productionPulseAt??m.time)<=m.time){m.emit('resource',{unit:owner.id,entity:w.id,x:w.x,z:w.z,resource:'wood',amount:w.productionPulse,rate:rate*60});w.productionPulse=0;w.productionPulseAt=m.time+1;}
    }
  }
}
