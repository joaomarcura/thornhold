import { BALANCE as B, STATES } from './config.js';
import { combatStats } from './equipment.js';

// Absolute server times let every client display the same remaining duration.
export function unitEffects(u, time, state, preparation) {
  if (!u.alive) return [];
  const effects=[];
  const add=(id,label,kind,until,detail)=>effects.push({id,label,kind,until,detail});
  if(u.slowUntil>time)add('frost','Lentidão','debuff',u.slowUntil,'Movimento −35%');
  if(u.dashUntil>time)add('dash','Esquiva','buff',u.dashUntil,'Movimento acelerado');
  if(u.role!=='troll')return effects;
  const stats=combatStats(u);
  if(state===STATES.PREP){add('seal','Selo de preparação','debuff',preparation,'Aguarde a libertação');return effects;}
  const hunger=time>B.hungerAge&&time-u.lastAttack>B.hungerGrace;
  if(hunger)add('hunger','Fome','debuff',null,'Cause dano para encerrar');
  else if(time-u.lastHit<stats.regenDelay)add('regen-delay','Regeneração bloqueada','debuff',u.lastHit+stats.regenDelay,'Evite receber dano');
  else if(u.hp<u.maxHp)add('regen','Regenerando','buff',null,`+${stats.regen.toFixed(1)} vida/s`);
  if(u.openingUntil>time)add('opening','Abertura da esquiva','buff',u.openingUntil,`Próximo acerto +${Math.round(stats.opening*100)}% dano`);
  if(u.exposure>B.troll.exposureGrace){const linger=Math.max(0,2-(time-u.lastHit));add('exposure','Exposição','debuff',time+linger+(u.exposure+linger-B.troll.exposureGrace)/2,`+${Math.round((u.exposure-B.troll.exposureGrace)*B.troll.exposureRate*100)}% dano · prazo sem novos acertos`);}
  return effects;
}

export function structureEffects(s,time){
  return s.disabledUntil>time?[{id:'silenced',label:'Rugido · desativada',kind:'debuff',until:s.disabledUntil,detail:'Torre não pode disparar'}]:[];
}
