import { BALANCE as B, STATES, distance, upgradeCost } from './config.js';

export const requiredBarricadeTier=targetCoreTier=>Math.max(1,Math.floor(targetCoreTier/2));

// Pure rules used by both the authoritative command and its UI preview.
export function upgradeStatus(u,s,time,state,structures=[]){
  const cost=s?.kind&&Object.hasOwn(B.structures,s.kind)?upgradeCost(s,u?.elfPath):null;
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
    if(s.tier>=B.maxTier)block('maximum','Estrutura no nível Épico máximo.');
    if(s.kind==='core'){
      const required=requiredBarricadeTier(s.tier+1),wall=structures.find(a=>a.kind==='wall'&&a.owner===u?.id&&a.baseId===s.baseId&&a.progress>=1&&a.hp>0);
      if(!wall||wall.tier<required)block('barricade',`Barricada nível ${required} necessária — atual: ${wall?`nível ${wall.tier}`:'não construída'}.`);
    }
    if(!s.upgrading&&(u?.gold??0)<cost.gold)block('gold',`Ouro insuficiente: ${Math.floor(u?.gold||0)} / ${cost.gold}.`);
    if(!s.upgrading&&(u?.wood??0)<cost.wood)block('wood',`Madeira insuficiente: ${Math.floor(u?.wood||0)} / ${cost.wood}.`);
    if(!s.upgrading&&(u?.essence??0)<(cost.essence||0))block('essence',`Essência insuficiente: ${Math.floor(u?.essence||0)} / ${cost.essence}.`);
  }
  return {allowed:reasons.length===0,cost,reasons};
}
