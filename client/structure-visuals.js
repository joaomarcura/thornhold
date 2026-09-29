export const STRUCTURE_VISUAL_TIERS=Object.freeze([
  Object.freeze({id:1,min:1,max:5,name:'Fundação',primary:0x765c3d,secondary:0xb09a6d,trim:0xd4bd83,accent:0x78b99b,metalness:0}),
  Object.freeze({id:2,min:6,max:10,name:'Fortificado',primary:0x737d75,secondary:0x9ba49a,trim:0xd4c28c,accent:0x71c8ad,metalness:.08}),
  Object.freeze({id:3,min:11,max:15,name:'Engenharia',primary:0x596560,secondary:0x7d8a83,trim:0xb5b79f,accent:0x70cbd2,metalness:.32}),
  Object.freeze({id:4,min:16,max:20,name:'Lendário',primary:0x665f50,secondary:0x8e856d,trim:0xe5c574,accent:0x83e0c7,metalness:.52}),
  Object.freeze({id:5,min:21,max:30,name:'Ascendente',primary:0x66727b,secondary:0xaab7bb,trim:0xe7e4cf,accent:0x9eeeff,metalness:.72})
]);

export function structureVisualTier(level=1){
  const safe=Math.max(1,Math.floor(Number(level)||1));
  return STRUCTURE_VISUAL_TIERS.find(tier=>safe<=tier.max)||STRUCTURE_VISUAL_TIERS.at(-1);
}

export function structureVisualProgress(level=1){
  const safe=Math.max(1,Math.floor(Number(level)||1)),tier=structureVisualTier(safe),span=tier.max-tier.min+1,step=Math.max(0,Math.min(span-1,safe-tier.min));
  return {tier,level:safe,step,steps:span,ratio:span<=1?1:step/(span-1)};
}

export const structureVisualSignature=(kind,level,branch='',legendary=false,epic=false)=>{
  const visual=structureVisualTier(level);
  return `${kind}:${Math.max(1,Math.floor(Number(level)||1))}:${visual.id}:${branch}:${legendary?'L':''}:${epic?'E':''}`;
};
