import { BALANCE as B, distance } from './config.js';

export const SPECIAL_RESOURCES=Object.freeze({
  ancientWood:{name:'Madeira Ancestral',short:'Ancestral'},
  crystal:{name:'Cristal',short:'Cristal'},
  mana:{name:'Mana',short:'Mana'}
});

export const ELF_TECH_MILESTONES=Object.freeze([8,12,16]);
export const ELF_TECH_CARDS=Object.freeze({
  8:[
    {id:'efficient-production',name:'Produção eficiente',description:'+8% na produção de ouro e madeira.',effects:{production:.08}},
    {id:'wisp-network',name:'Rede de Wisps',description:'+15% na produção dos Wisps comuns.',effects:{wisp:.15}},
    {id:'prepared-casting',name:'Preparação especializada',description:'+3s na duração da habilidade da especialização.',effects:{abilityDuration:3}}
  ],
  12:[
    {id:'signature-mastery',name:'Domínio da especialização',description:'+12% na potência da estrutura exclusiva.',effects:{signaturePower:.12}},
    {id:'external-logistics',name:'Logística externa',description:'+25% na coleta dos Wisps especiais.',effects:{specialWisp:.25}},
    {id:'rapid-command',name:'Comando rápido',description:'-15% na recarga da habilidade da especialização.',effects:{abilityCooldown:.15}}
  ],
  16:[
    {id:'prosperous-kingdom',name:'Reino próspero',description:'+12% de produção e +10% na estrutura exclusiva.',effects:{production:.12,signaturePower:.1}},
    {id:'living-ramparts',name:'Muralhas vivas',description:'Estruturas recebem 8% menos dano.',effects:{structureReduction:.08}},
    {id:'perfect-synchrony',name:'Sincronia perfeita',description:'+4s de duração e -10% de recarga da habilidade.',effects:{abilityDuration:4,abilityCooldown:.1}}
  ]
});

export const technologyCost=milestone=>({resource:[30,50,80][ELF_TECH_MILESTONES.indexOf(milestone)]||0});
export function technologyEffects(u){
  const effects={production:0,wisp:0,abilityDuration:0,signaturePower:0,specialWisp:0,abilityCooldown:0,structureReduction:0};
  for(const id of u?.elfTechCards||[])for(const cards of Object.values(ELF_TECH_CARDS)){const card=cards.find(entry=>entry.id===id);if(card)for(const[key,value]of Object.entries(card.effects))effects[key]=(effects[key]||0)+value;}
  return effects;
}
export function pendingTechnology(match,u){
  if(!u?.elfSpecialization)return null;
  const core=match.structures.find(s=>s.owner===u.id&&s.kind==='core'&&s.hp>0&&s.progress>=1);if(!core)return null;
  return ELF_TECH_MILESTONES.find(milestone=>core.tier>=milestone&&!ELF_TECH_CARDS[milestone].some(card=>(u.elfTechCards||[]).includes(card.id)))||null;
}
export function chooseTechnology(match,u,id){
  const milestone=pendingTechnology(match,u),cards=milestone&&ELF_TECH_CARDS[milestone],card=cards?.find(entry=>entry.id===id);
  if(!milestone||!card)return 'Nenhuma tecnologia disponível neste Núcleo.';
  const core=match.structures.find(s=>s.owner===u.id&&s.kind==='core'&&s.hp>0&&s.progress>=1);if(distance(u,core)>B.interactRange)return 'Aproxime-se do seu Núcleo para pesquisar.';
  const resource=specialization(u.elfSpecialization).resource,cost=technologyCost(milestone).resource;
  if((u.specialResources[resource]||0)<cost)return `${SPECIAL_RESOURCES[resource].name} insuficiente: ${Math.floor(u.specialResources[resource]||0)} / ${cost}.`;
  u.specialResources[resource]-=cost;u.elfTechCards.push(card.id);u.stats.technologyCards=(u.stats.technologyCards||0)+1;
  match.emit('elf-technology',{unit:u.id,entity:core.id,x:core.x,z:core.z,card:card.id,milestone,resource,cost});return null;
}

export function specialization(key){return B.elfProgression.specializations[key]||null;}
export function specializationLevel(match,u){
  const core=match.structures.find(s=>s.owner===u.id&&s.kind==='core'&&s.hp>0&&s.progress>=1);
  return core?Math.max(0,[5,10,15,20].filter(t=>core.tier>=t).length):0;
}
export function chooseSpecialization(match,u,key){
  if(u.role!=='elf'||!specialization(key))return 'Especialização inválida.';
  if(u.elfSpecialization)return 'Sua especialização é permanente nesta partida.';
  const core=match.structures.find(s=>s.owner===u.id&&s.kind==='core'&&s.hp>0&&s.progress>=1);
  if(!core||core.tier<B.elfProgression.unlockTier)return `Núcleo nível ${B.elfProgression.unlockTier} necessário.`;
  if(distance(u,core)>B.interactRange)return 'Aproxime-se do seu Núcleo para escolher.';
  u.elfSpecialization=key;u.stats.specialization=key;
  match.emit('specialization',{unit:u.id,entity:core.id,x:core.x,z:core.z,key});return null;
}

export function signatureAllowed(u,kind){
  const spec=specialization(u?.elfSpecialization);return !!spec&&spec.structure===kind;
}

export function productionBreakdown(match,owner,producer){
  const technology=technologyEffects(owner),base=1+technology.production+(producer?.role==='wisp'?technology.wisp:0);
  if(owner?.elfSpecialization!=='industrial')return {multiplier:base,base,withoutOverdrive:base,refinery:null,overdrive:false};
  const refinery=match.structures.find(s=>s.owner===owner.id&&s.kind==='refinery'&&s.hp>0&&s.progress>=1&&distance(s,producer)<=B.structures.refinery.aura);
  if(!refinery)return {multiplier:base,base,withoutOverdrive:base,refinery:null,overdrive:false};
  const withoutOverdrive=base*(1+B.elfProgression.specializations.industrial.productionPerTier*refinery.tier*(1+technology.signaturePower)),overdrive=refinery.overdriveUntil>match.time;
  return {multiplier:withoutOverdrive*(overdrive?1.2:1),base,withoutOverdrive,refinery,overdrive};
}
export const productionMultiplier=(match,owner,producer)=>productionBreakdown(match,owner,producer).multiplier;

export function abilityStatus(match,u){
  const spec=specialization(u?.elfSpecialization),readyAt=u?.cooldowns?.elfSpecialization||0;
  if(!spec)return {available:false,reason:'Escolha uma especialização no Núcleo nível 5.',readyAt};
  if(readyAt>match.time)return {available:false,reason:`${spec.ability} recarregando por ${Math.ceil(readyAt-match.time)}s.`,readyAt,key:u.elfSpecialization};
  const signature=match.structures.filter(s=>s.owner===u.id&&s.kind===spec.structure&&s.hp>0&&s.progress>=1).sort((a,b)=>distance(a,u)-distance(b,u))[0];
  if(!signature)return {available:false,reason:`Construa ${B.structures[spec.structure].name} para usar ${spec.ability}.`,readyAt,key:u.elfSpecialization};
  return {available:true,reason:`Ativar ${spec.ability}.`,readyAt:match.time,key:u.elfSpecialization,signature:signature.id};
}

export function useSpecializationAbility(match,u){
  const status=abilityStatus(match,u);if(!status.available)return status.reason;
  const technology=technologyEffects(u),s=match.structures.find(e=>e.id===status.signature),level=specializationLevel(match,u),duration=B.elfProgression.abilityDuration+Math.max(0,level-1)*2+technology.abilityDuration;
  u.cooldowns.elfSpecialization=match.time+B.elfProgression.abilityCooldown*(1-technology.abilityCooldown);
  if(u.elfSpecialization==='industrial')s.overdriveUntil=match.time+duration;
  if(u.elfSpecialization==='fortress')for(const structure of match.structures.filter(e=>e.owner===u.id&&e.hp>0&&e.baseId===s.baseId))structure.fortifiedUntil=match.time+duration;
  if(u.elfSpecialization==='arcane'){
    s.overchargedUntil=match.time+duration;
    match.reveals.push({id:'reveal-'+match.nextId++,unit:u.id,x:s.x,z:s.z,radius:B.elfProgression.specializations.arcane.revealRadius,time:match.time,until:match.time+duration});
  }
  u.stats.specializationAbilities=(u.stats.specializationAbilities||0)+1;
  match.emit('elf-specialization-ability',{unit:u.id,entity:s.id,x:s.x,z:s.z,key:u.elfSpecialization,duration,level});return null;
}

export function stepElfProgression(match,dt){
  for(const bastion of match.structures.filter(s=>s.kind==='bastion'&&s.hp>0&&s.progress>=1)){
    const owner=match.unit(bastion.owner);if(!owner?.alive)continue;
    const rate=B.elfProgression.specializations.fortress.regenPerTier*bastion.tier*(1+technologyEffects(owner).signaturePower);
    for(const s of match.structures.filter(e=>e.owner===owner.id&&e.hp>0&&e.hp<e.maxHp&&distance(e,bastion)<=B.structures.bastion.aura)){
      const before=s.hp;s.hp=Math.min(s.maxHp,s.hp+s.maxHp*rate*dt);owner.stats.specializationImpact.bastionHealing+=s.hp-before;
    }
  }
}
