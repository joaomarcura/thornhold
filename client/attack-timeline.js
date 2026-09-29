const clamp=value=>Math.max(0,Math.min(1,value));
const ease=value=>{value=clamp(value);return value*value*(3-2*value);};

export function attackRecovery(kind){return kind==='heavy'?.42:kind==='gather'||kind==='gatherSpecial'?.3:.26;}

export function attackTimeline(age,windup,kind='light'){
  const recovery=attackRecovery(kind),duration=windup+recovery;
  if(age<0||age>=duration)return{active:false,stage:'idle',windup:0,strike:0,recover:1,duration,impactAt:windup};
  if(age<windup)return{active:true,stage:'windup',windup:ease(age/Math.max(.001,windup)),strike:0,recover:0,duration,impactAt:windup};
  const after=age-windup,contact=Math.min(.12,recovery*.35);
  if(after<contact)return{active:true,stage:'impact',windup:1,strike:ease(after/Math.max(.001,contact)),recover:0,duration,impactAt:windup};
  return{active:true,stage:'recovery',windup:1,strike:1,recover:ease((after-contact)/Math.max(.001,recovery-contact)),duration,impactAt:windup};
}
