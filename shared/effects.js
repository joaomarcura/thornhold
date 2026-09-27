import { BALANCE as B, STATES } from './config.js';
import { combatStats } from './equipment.js';

// Absolute server times let every client display the same remaining duration.
export function unitEffects(u, time, state, preparation) {
  if (!u.alive) return [];
  const effects=[];
  const add=(id,label,kind,until,detail)=>effects.push({id,label,kind,until,detail});
  if(u.slowUntil>time)add('frost','Lentidão','debuff',u.slowUntil,'Movimento −35%');
  if(u.stunnedUntil>time)add('stunned','Atordoado','debuff',u.stunnedUntil,'Movimento e habilidades bloqueados');
  if(u.dashUntil>time)add('dash','Esquiva','buff',u.dashUntil,'Movimento acelerado');
  if(u.role!=='troll')return effects;
  const stats=combatStats(u);
  if(state===STATES.PREP){add('seal','Selo de preparação','debuff',preparation,'Explore o Santuário · a barreira ainda impede a caçada');return effects;}
  if(u.recallUntil>time)add('recall-channel','Retorno ao Santuário','buff',u.recallUntil,'Canalizando · dano, movimento ou habilidade interrompe');
  if(u.recallSpeedUntil>time)add('recall-speed','Ímpeto do Santuário','buff',u.recallSpeedUntil,'Movimento +20%');
  if(time-u.lastHit<stats.regenDelay)add('regen-delay','Regeneração plena bloqueada','debuff',u.lastHit+stats.regenDelay,'Sustentação de combate permanece ativa');
  if(u.healingUntil>time)add('consumable-heal','Cura ancestral','buff',u.healingUntil,'20% da vida máxima em 6s');
  if(u.inSanctuary&&u.hp<u.maxHp&&time-u.lastHit>=stats.regenDelay)add('sanctuary','Santuário ancestral','buff',null,`+${(B.troll.sanctuaryRegenRate*u.maxHp).toFixed(1)} vida/s`);
  if(u.hp<u.maxHp){const resting=time-u.lastHit>=stats.regenDelay,rate=(resting?stats.restRegen:stats.combatRegen)*u.maxHp;add(resting?'regen':'combat-regen',resting?'Regenerando':'Sustentação','buff',null,`+${rate.toFixed(1)} vida/s`);}
  if(u.openingUntil>time)add('opening','Abertura da esquiva','buff',u.openingUntil,`Próximo acerto +${Math.round(stats.opening*100)}% dano`);
  if(u.exposure>B.troll.exposureGrace){const linger=Math.max(0,2-(time-u.lastHit));add('exposure','Exposição','debuff',time+linger+(u.exposure+linger-B.troll.exposureGrace)/2,`+${Math.round((u.exposure-B.troll.exposureGrace)*B.troll.exposureRate*100)}% dano · prazo sem novos acertos`);}
  return effects;
}

export function structureEffects(s,time){
  const effects=[];
  if(s.disabledUntil>time)effects.push({id:'silenced',label:'Rugido · desativada',kind:'debuff',until:s.disabledUntil,detail:'Torre não pode disparar'});
  if(s.kind==='wall'&&s.passiveRegenerating)effects.push({id:'wall-recovery',label:'Barricada se recompondo',kind:'buff',until:null,detail:`+${(s.maxHp*B.wallRecovery.rate).toFixed(1)} vida/s · após 8s sem dano`});
  if(s.kind==='wall'&&(s.breachStacks||0)>0)effects.push({id:'breach-pressure',label:`Pressão de cerco ×${s.breachStacks}`,kind:'debuff',until:s.breachDecayAt||null,detail:`Dano recebido +${Math.round(s.breachStacks*B.breachMomentum.damagePerStack*100)}% · reparo −${Math.round(s.breachStacks*B.breachMomentum.repairPenaltyPerStack*100)}%`});
  return effects;
}
