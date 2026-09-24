import { BALANCE as B, STATES, distance, upgradeCost } from './config.js';

// Pure rules used by both the authoritative command and its UI preview.
export function upgradeStatus(u,s,time,state){
  const cost=s?.kind&&Object.hasOwn(B.structures,s.kind)?upgradeCost(s):null;
  const reasons=[];
  const block=(code,message)=>reasons.push({code,message});
  if(![STATES.PREP,STATES.ACTIVE].includes(state))block('match','A partida não está ativa.');
  if(!u?.alive)block('player','Você foi eliminado.');
  if(!cost||u?.role!=='elf'||s.owner!==u?.id)block('owner','Selecione uma estrutura sua.');
  if(cost){
    if(s.hp<=0)block('destroyed','Estrutura destruída.');
    if(u&&distance(u,s)>B.interactRange)block('distance',`Aproxime-se: ${distance(u,s).toFixed(1)} m / alcance ${B.interactRange.toFixed(1)} m.`);
    if(s.progress<1)block('construction','Conclua a construção primeiro.');
    if(s.upgrading>0)block('upgrading',`Melhoria em andamento: ${Math.ceil(s.upgrading)}s.`);
    if(s.tier===3&&time<B.finalAge)block('time',`Nível 4 disponível após ${Math.floor(B.finalAge/60)}:${String(B.finalAge%60).padStart(2,'0')} · faltam ${Math.ceil(B.finalAge-time)}s.`);
    if(!s.upgrading&&(u?.gold??0)<cost.gold)block('gold',`Ouro insuficiente: ${Math.floor(u?.gold||0)} / ${cost.gold}.`);
    if(!s.upgrading&&(u?.wood??0)<cost.wood)block('wood',`Madeira insuficiente: ${Math.floor(u?.wood||0)} / ${cost.wood}.`);
  }
  return {allowed:reasons.length===0,cost,reasons};
}
