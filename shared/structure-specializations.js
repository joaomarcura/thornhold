// Data shared by commands, previews, economy and AI. Bonuses are additive per
// milestone rather than a second exponential progression curve.
export const CRYSTAL_RULES=Object.freeze({initial:100,waves:[900,1800,2700],deposits:10,amount:25,channel:3,interaction:6.5,heartbeat:.6});
export const SPECIALIZATION_MILESTONES=Object.freeze({10:10,20:15,30:20});
export const CONSTRUCTION_SPECIALIZATIONS=Object.freeze({
  core:[
    {id:'industrial',name:'Industrial',description:'Produção da base +15%. Sobrecarga aumenta a produção temporariamente.',color:0xd8ad61,effects:{production:.15},ability:'Sobrecarga'},
    {id:'fortress',name:'Fortaleza',description:'Estruturas da base recebem 10% menos dano. Fortificação protege a base temporariamente.',color:0x87bca4,effects:{baseReduction:.10},ability:'Fortificação'},
    {id:'arcane',name:'Arcano',description:'Recarga da habilidade 15% menor. Pulso Arcano acelera as torres temporariamente.',color:0xa897e7,effects:{abilityCooldown:.15},ability:'Pulso Arcano'}
  ],
  mine:[
    {id:'yield',name:'Extração intensiva',description:'Produção de ouro desta Mina +20%.',color:0xe9c45d,effects:{production:.20}},
    {id:'reserve',name:'Mina fortificada',description:'Produção +10% e vida máxima +25%.',color:0x91b4ab,effects:{production:.10,health:.25}},
    {id:'logistics',name:'Logística de cristais',description:'Produção +10%. Coleta manual de cristal 25% mais rápida; não acumula entre Minas.',color:0x9cd8e7,effects:{production:.10,collectionSpeed:.25}}
  ],
  tower:[
    {id:'power',name:'Balista',description:'Dano +20%.',color:0xe5b66e,effects:{damage:.20}},
    {id:'rapid',name:'Rajada',description:'Cadência +25%, incluindo o feixe Lendário.',color:0x8fceb8,effects:{attackSpeed:.25}},
    {id:'arcane',name:'Torre Arcana',description:'Dano +10%, alcance +2 m e ignora 20% da armadura.',color:0xb493eb,effects:{damage:.10,range:2,armorPierce:.20}}
  ],
  wall:[
    {id:'fortress',name:'Muralha reforçada',description:'Vida máxima +20%.',color:0xc2b184,effects:{health:.20}},
    {id:'restoration',name:'Bastião vivo',description:'Regeneração passiva +35% e reparo recebido +20%.',color:0x82c89b,effects:{regen:.35,repair:.20}},
    {id:'ward',name:'Barreira rúnica',description:'Recebe 15% menos dano.',color:0xa3a4e9,effects:{reduction:.15}}
  ]
});
export const constructionSpecialization=s=>CONSTRUCTION_SPECIALIZATIONS[s?.kind]?.find(option=>option.id===s?.specialization)||null;
export const specializationStrength=s=>s?.tier>=30?1.8:s?.tier>=20?1.4:1;
export function constructionEffects(s){
  const option=constructionSpecialization(s),strength=specializationStrength(s);
  return Object.fromEntries(Object.entries(option?.effects||{}).map(([key,value])=>[key,value*strength]));
}
export const crystalUpgradeCost=(s,target=(s?.tier||0)+1)=>!CONSTRUCTION_SPECIALIZATIONS[s?.kind]?0:target===20?15:target===30?20:0;
export function specializationStatus(u,s,time,range=CRYSTAL_RULES.interaction){
  const options=CONSTRUCTION_SPECIALIZATIONS[s?.kind]||[],reasons=[];
  if(!u?.alive||u.role!=='elf'||s?.owner!==u.id)reasons.push('Somente o proprietário pode especializar.');
  if(!options.length||s?.hp<=0||s?.progress<1)reasons.push('Selecione uma construção concluída.');
  if(s?.tier<10)reasons.push('Nível 10 necessário.');
  if(s?.specialization)reasons.push('Esta construção já possui uma especialização.');
  if(s?.upgrading>0)reasons.push('Aguarde a melhoria em andamento.');
  if(u&&s&&Math.hypot(u.x-s.x,u.z-s.z)>range)reasons.push('Aproxime-se da construção.');
  if((u?.specialResources?.crystal||0)<10)reasons.push('10 cristais necessários.');
  return {allowed:!reasons.length,reasons,cost:10,options};
}
