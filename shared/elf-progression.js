import { BALANCE as B } from './config.js';
import { constructionEffects, constructionSpecialization, specializationStrength } from './structure-specializations.js';

// Retained solely to decode historical matches. New matches have one resource.
export const SPECIAL_RESOURCES=Object.freeze({crystal:{name:'Cristal',short:'Cristal'},ancientWood:{name:'Madeira Ancestral',short:'Ancestral'},mana:{name:'Mana',short:'Mana'}});
export const ELF_TECH_MILESTONES=Object.freeze([8,12,16]);
export const ELF_TECH_CARDS=Object.freeze({
  8:[
    {id:'efficient-production',name:'Produção eficiente',description:'+8% na produção de ouro e madeira.',effects:{production:.08}},
    {id:'wisp-network',name:'Rede de Wisps',description:'+15% na produção dos Wisps comuns.',effects:{wisp:.15}},
    {id:'prepared-casting',name:'Preparação especializada',description:'+3s na duração da habilidade da especialização.',effects:{abilityDuration:3}}
  ],
  12:[
    {id:'signature-mastery',name:'Domínio da especialização',description:'+12% na potência da habilidade ou estrutura especializada.',effects:{signaturePower:.12}},
    {id:'external-logistics',name:'Logística externa',description:'+25% na coleta dos Wisps especiais.',effects:{specialWisp:.25}},
    {id:'rapid-command',name:'Comando rápido',description:'-15% na recarga da habilidade da especialização.',effects:{abilityCooldown:.15}}
  ],
  16:[
    {id:'prosperous-kingdom',name:'Reino próspero',description:'+12% de produção e +10% na habilidade ou estrutura especializada.',effects:{production:.12,signaturePower:.1}},
    {id:'living-ramparts',name:'Muralhas vivas',description:'Estruturas recebem 8% menos dano.',effects:{structureReduction:.08}},
    {id:'perfect-synchrony',name:'Sincronia perfeita',description:'+4s de duração e -10% de recarga da habilidade.',effects:{abilityDuration:4,abilityCooldown:.1}}
  ]
});


export const technologyCost=()=>({resource:0});
export const technologyEffects=()=>({production:0,wisp:0,abilityDuration:0,signaturePower:0,specialWisp:0,abilityCooldown:0,structureReduction:0});
export const pendingTechnology=()=>null;
export const chooseTechnology=()=> 'Tecnologias globais foram substituídas pelas especializações de cada construção.';
export const specialization=key=>B.elfProgression.specializations[key]||null;
const ownedCore=(match,u)=>match.structures.find(s=>s.owner===u?.id&&s.kind==='core'&&s.hp>0&&s.progress>=1);
export const specializationLevel=(match,u)=>{const core=ownedCore(match,u);return core?.specialization?(core.tier>=30?3:core.tier>=20?2:1):0;};
export function chooseSpecialization(match,u,key){
  return match.specializeStructure(u,ownedCore(match,u)?.id,key);
}
export const signatureAllowed=()=>false;
export function productionBreakdown(match,owner,producer){
  const baseId=producer?.baseId||owner?.baseId,core=match.structures.find(s=>s.owner===owner?.id&&s.baseId===baseId&&s.kind==='core'&&s.hp>0&&s.progress>=1);
  const kingdom=match.elfEpicProject?.ownerId===owner?.id&&match.elfEpicProject?.baseId===baseId&&!!match.elfEpicProject?.completedAt;
  // income(core) already includes its own production bonus. Other producers
  // share the Industrial aura only once, without stacking multiple Cores.
  const aura=producer?.kind==='core'?0:constructionEffects(core).production||0;
  const base=(core?.tier>=B.epic.tier?B.epic.coreProduction:1)*(kingdom?B.epic.kingdomProduction:1)*(1+aura);
  const overdrive=!!core&&core.overdriveUntil>match.time;
  return {multiplier:base*(overdrive?1+.2*specializationStrength(core):1),base,withoutOverdrive:base,refinery:null,overdrive};
}
export const productionMultiplier=(match,owner,producer)=>productionBreakdown(match,owner,producer).multiplier;
export function abilityStatus(match,u){
  const core=ownedCore(match,u),spec=constructionSpecialization(core),readyAt=u?.cooldowns?.elfSpecialization||0;
  if(!u?.alive||!spec)return {available:false,reason:'Especialize seu Núcleo no nível 10 por 10 cristais.',readyAt};
  if(readyAt>match.time)return {available:false,reason:`${spec.ability} recarregando por ${Math.ceil(readyAt-match.time)}s.`,readyAt,key:spec.id};
  return {available:true,reason:`Ativar ${spec.ability}.`,readyAt:match.time,key:spec.id,signature:core.id};
}
export function useSpecializationAbility(match,u){
  const status=abilityStatus(match,u);if(!status.available)return status.reason;
  const core=ownedCore(match,u),strength=specializationStrength(core),duration=B.elfProgression.abilityDuration+4*(strength-1);
  u.cooldowns.elfSpecialization=match.time+B.elfProgression.abilityCooldown*(1-(constructionEffects(core).abilityCooldown||0));
  if(core.specialization==='industrial')core.overdriveUntil=match.time+duration;
  if(core.specialization==='fortress')for(const s of match.structures)if(s.owner===u.id&&s.hp>0&&s.baseId===core.baseId)s.fortifiedUntil=match.time+duration;
  if(core.specialization==='arcane'){
    for(const s of match.structures)if(s.owner===u.id&&s.kind==='tower'&&s.hp>0&&s.baseId===core.baseId)s.overchargedUntil=match.time+duration;
    match.reveals.push({id:'reveal-'+match.nextId++,unit:u.id,x:core.x,z:core.z,radius:B.elfProgression.specializations.arcane.revealRadius,time:match.time,until:match.time+duration});
  }
  u.stats.specializationAbilities=(u.stats.specializationAbilities||0)+1;
  match.emit('elf-specialization-ability',{unit:u.id,entity:core.id,x:core.x,z:core.z,key:core.specialization,duration,level:specializationLevel(match,u)});return null;
}
export function stepElfProgression(){} // No separate signature structures.
