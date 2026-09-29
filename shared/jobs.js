import { BALANCE as B, distance, upgradeCost } from './config.js';
import { recordRefund } from './economy.js';

export function jobRefund(entity,time){
  const job=entity.job;if(!job)return null;
  // Committed upgrades cannot be cancelled. Construction and training retain
  // their partial, 75% refund so unfinished placement mistakes remain recoverable.
  if(job.type==='upgrade'||job.type==='wisp-upgrade')return null;
  const remaining=job.type==='build'?1-entity.progress:(job.until-time)/job.duration;
  const fraction=Math.max(0,Math.min(1,remaining));
  return fraction>0?{gold:Math.floor(job.gold*.75*fraction),wood:Math.floor(job.wood*.75*fraction)}:null;
}
export function demolitionRefund(entity){
  if(!entity?.kind||entity.progress<1||entity.hp<=0)return null;
  const construction=entity.constructionCost||B.structures[entity.kind],cost=entity.investmentCost?{...entity.investmentCost}:{gold:construction.gold||0,wood:construction.wood||0,essence:0};
  if(!entity.investmentCost)for(let tier=1;tier<(entity.tier||1);tier++){const upgrade=upgradeCost({...entity,tier});cost.gold+=upgrade.gold;cost.wood+=upgrade.wood;cost.essence=(cost.essence||0)+(upgrade.essence||0);}
  const specialEntries=Object.entries(cost.specialResources||{}).filter(([,value])=>value>0),special=specialEntries.length===1?{specialResource:specialEntries[0][0],specialAmount:Math.floor(specialEntries[0][1]*.75)}:{};
  return {gold:Math.floor((cost.gold||0)*.75),wood:Math.floor((cost.wood||0)*.75),...(cost.essence?{essence:Math.floor(cost.essence*.75)}:{}),...special};
}
export function cancelJob(m,u,id){
  const e=m.entity(id);
  if(e?.job&&['upgrade','wisp-upgrade'].includes(e.job.type))return 'Upgrades iniciados não podem ser cancelados.';
  const refund=e&&jobRefund(e,m.time);
  if(u.role!=='elf'||!e||e.owner!==u.id||!refund||e.hp<=0||e.alive===false)return 'Selecione uma obra ou formação sua em andamento.';
  if(m.time-e.lastHit<5)return 'Aguarde 5 s sem dano para cancelar.';
  const core=m.structures.find(s=>s.kind==='core'&&s.owner===u.id&&s.hp>0&&s.progress===1);
  const anchor=e.role==='wisp'?core:e;
  if(!anchor||distance(u,anchor)>B.interactRange||!m.canSee(u,anchor))return 'Aproxime-se para cancelar.';
  const type=e.job.type;
  if(type==='build'){e.hp=0;if(e.kind==='core'){u.baseId=null;u.coreFoundations=Math.max(0,(u.coreFoundations||1)-1);u.stats.coreFoundations=Math.max(0,(u.stats.coreFoundations||1)-1);if(e.job.relocation){u.relocationVouchers=(u.relocationVouchers||0)+1;u.stats.relocations=Math.max(0,(u.stats.relocations||1)-1);u.relocationUntil=Math.max(m.time,e.job.relocationUntil||0);}}}
  else if(type==='train')e.alive=false;
  else return 'Upgrades iniciados não podem ser cancelados.';
  delete e.job;u.gold+=refund.gold;u.wood+=refund.wood;recordRefund(u,refund);u.action='idle';u.actionUntil=m.time;
  m.emit('cancel',{unit:u.id,entity:e.id,x:e.x,z:e.z,...refund});
}
