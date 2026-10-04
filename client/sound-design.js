// Bounded, deterministic physical-style transients. Buffers are generated once
// per sample rate/variant and reused, not synthesized on every impact.
export const PHYSICAL_SOUNDS=new Set(['gather','repair','impact','damage','swing','destroy','shot','beam','legendary-tower','legendary-execute','fishing-cast','fishing-bite','fishing-hook','fish-caught']);
export function soundSamples(type,rate=48000,variant=0){
  const duration=type==='destroy'?.6:type==='swing'?.32:.28,samples=new Float32Array(Math.ceil(rate*duration));
  let seed=(variant+1)*9173,typeSeed=0;for(const ch of type)typeSeed+=ch.charCodeAt(0);seed+=typeSeed;
  let smooth=0;
  for(let i=0;i<samples.length;i++){
    const t=i/rate;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1;smooth+=.14*(noise-smooth);
    const decay=Math.exp(-t*(type==='destroy'?10:24)),attack=Math.min(1,t/.0015),frequency=(type==='gather'?145:type==='repair'?370:type==='shot'?720:type==='beam'?1100:84)*(1+variant*.035);
    const body=Math.sin(2*Math.PI*frequency*t)*Math.exp(-t*17),ring=Math.sin(2*Math.PI*frequency*2.73*t)*Math.exp(-t*35);
    const fishing=type.startsWith('fishing-')||type==='fish-caught',plop=Math.sin(2*Math.PI*(type==='fishing-bite'?620:340)*t*Math.exp(-t*4))*Math.exp(-t*16);
    const value=fishing?(plop*.5+smooth*.2+noise*.04)*attack:type==='swing'?smooth*Math.sin(Math.PI*t/duration)**2*1.4:type==='gather'?(smooth*.6+noise*.17+body*.35)*attack*decay:type==='repair'?(noise*.16+body*.24+ring*.35)*attack*decay:type==='destroy'?(smooth*.8+body*.28)*attack*decay:(noise*.24+smooth*.38+body*.4+ring*.12)*attack*decay;
    samples[i]=Math.max(-.9,Math.min(.9,value));
  }
  return samples;
}
