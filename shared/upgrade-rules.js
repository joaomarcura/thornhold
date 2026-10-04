import { BALANCE as B, STATES, distance, upgradeCost } from './config.js';
import { SPECIAL_RESOURCES } from './elf-progression.js';

// A refuge advances as one defensive unit. Upgrading the Core to N requires
// the gate at N-1, so the economy can never run eight tiers ahead of its entry.
// This deliberately applies to rebuilt refuges as well as opening bases.
export const requiredBarricadeTier=targetCoreTier=>{
  const target=Math.max(1,Math.floor(targetCoreTier||1));
  return Math.max(1,target-1);
};

export const strategicBarricadeTier=(coreTier,trollLevel,profile='balanced',difficulty='normal')=>{
  const core=Math.max(1,Math.floor(coreTier||1)),level=Math.max(1,Math.floor(trollLevel||1));
  const personality={economy:.6,balanced:.7,defense:.75}[profile]??.7,difficultyOffset=difficulty==='hard'?.05:difficulty==='easy'?-.05:0;
  const minimum=requiredBarricadeTier(Math.min(B.maxStructureTier,core+1)),adaptive=Math.floor(level*(personality+difficultyOffset));
  return Math.max(2,Math.min(B.maxStructureTier,Math.max(minimum,Math.min(core,adaptive))));
};

export const requiredEpicWallTier=targetTowerTier=>targetTowerTier>=20?14:targetTowerTier>=17?12:targetTowerTier>=13?11:9;

// Pure rules used by both the authoritative command and its UI preview.
export function upgradeStatus(u,s,time,state,structures=[],{remote=false}={}){
  const cost=s?.kind&&Object.hasOwn(B.structures,s.kind)?upgradeCost(s,u?.elfPath,u?.elfSpecialization):null;
  const reasons=[];
  const block=(code,message)=>reasons.push({code,message});
  if(![STATES.PREP,STATES.ACTIVE].includes(state))block('match','A partida não está ativa.');
  if(!u?.alive)block('player','Você foi eliminado.');
  if(!cost||u?.role!=='elf'||s.owner!==u?.id)block('owner','Selecione uma estrutura sua.');
  if(cost){
    if(B.structures[s.kind].available===false)block('removed','Esta construção foi removida da nova progressão.');
    if(s.kind==='fishery')block('workshop','Evolua a vara dentro da Oficina, não o prédio.');
    if(s.tier>=10&&!s.specialization&&['core','wall','tower','mine'].includes(s.kind))block('specialization','Escolha uma especialização por 10 cristais antes de avançar além do nível 10.');
    if(s.hp<=0)block('destroyed','Estrutura destruída.');
    if(!remote&&u&&distance(u,s)>B.interactRange)block('distance',`Aproxime-se: ${distance(u,s).toFixed(1)} m / alcance ${B.interactRange.toFixed(1)} m.`);
    if(s.progress<1)block('construction','Conclua a construção primeiro.');
    if(s.upgrading>0)block('upgrading',`Melhoria em andamento: ${Math.ceil(s.upgrading)}s.`);
    if(s.tier>=B.maxStructureTier)block('maximum','Estrutura no nível máximo.');
    if(s.kind==='core'){
      const required=requiredBarricadeTier(s.tier+1),wall=structures.find(a=>a.kind==='wall'&&a.owner===u?.id&&a.baseId===s.baseId&&a.progress>=1&&a.hp>0);
      if(!wall||wall.tier<required)block('barricade',`Barricada nível ${required} necessária — atual: ${wall?`nível ${wall.tier}`:'não construída'}.`);
    }
    if(!s.upgrading&&(u?.gold??0)<cost.gold)block('gold',`Ouro insuficiente: ${Math.floor(u?.gold||0)} / ${cost.gold}.`);
    if(!s.upgrading&&(u?.wood??0)<cost.wood)block('wood',`Madeira insuficiente: ${Math.floor(u?.wood||0)} / ${cost.wood}.`);
    if(!s.upgrading&&cost.specialResource&&(u?.specialResources?.[cost.specialResource]??0)<cost.specialAmount){const info=SPECIAL_RESOURCES[cost.specialResource];block('special-resource',`${info?.name||cost.specialResource} insuficiente: ${Math.floor(u?.specialResources?.[cost.specialResource]||0)} / ${cost.specialAmount}.`);}
  }
  return {allowed:reasons.length===0,cost,reasons};
}
