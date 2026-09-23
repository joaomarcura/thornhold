import { BALANCE as B, distance } from './config.js';

// Only unfinished investments can be cancelled. Already spent work is not refunded.
export function jobRefund(entity,time){
  const job=entity.job;if(!job)return null;
  const remaining=job.type==='build'?1-entity.progress:job.type==='upgrade'?entity.upgrading/job.duration:(job.until-time)/job.duration;
  const fraction=Math.max(0,Math.min(1,remaining));
  return fraction>0?{gold:Math.floor(job.gold*.75*fraction),wood:Math.floor(job.wood*.75*fraction)}:null;
}
export function cancelJob(m,u,id){
  const e=m.entity(id),refund=e&&jobRefund(e,m.time);
  if(u.role!=='elf'||!e||e.owner!==u.id||!refund||e.hp<=0||e.alive===false)return 'Selecione uma obra ou formação sua em andamento.';
  if(m.time-e.lastHit<5)return 'Aguarde 5 s sem dano para cancelar.';
  const core=m.structures.find(s=>s.kind==='core'&&s.owner===u.id&&s.hp>0&&s.progress===1);
  const anchor=e.role==='wisp'?core:e;
  if(!anchor||distance(u,anchor)>B.interactRange||!m.canSee(u,anchor))return 'Aproxime-se para cancelar.';
  const type=e.job.type;
  if(type==='build'){e.hp=0;if(e.kind==='core')u.baseId=null;}
  else if(type==='train')e.alive=false;
  else if(type==='upgrade')e.upgrading=0;
  else if(type==='wisp-upgrade')e.upgradingUntil=0;
  else return 'Esta ação já foi concluída.';
  delete e.job;u.gold+=refund.gold;u.wood+=refund.wood;u.action='idle';u.actionUntil=m.time;
  m.emit('cancel',{unit:u.id,entity:e.id,x:e.x,z:e.z,...refund});
}
