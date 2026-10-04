// Frame intervals stay unclamped for truthful FPS/stall measurements. Animation
// delta is clamped separately. Fixed storage avoids shift/allocations per frame.
export class FrameMetrics{
  constructor(size=180){this.samples=new Float64Array(size);this.count=0;this.cursor=0;this.referenceMs=Infinity;}
  reset(){this.count=0;this.cursor=0;this.referenceMs=Infinity;}
  record(ms){if(!Number.isFinite(ms)||ms<=0)return;this.samples[this.cursor]=ms;this.cursor=(this.cursor+1)%this.samples.length;this.count=Math.min(this.samples.length,this.count+1);}
  summary(){if(!this.count)return {fps:0,p95:0,median:0,referenceMs:0,stalls:0};
    const sorted=Array.from(this.samples.subarray(0,this.count)).sort((a,b)=>a-b),at=p=>sorted[Math.floor((sorted.length-1)*p)],mean=sorted.reduce((s,v)=>s+v,0)/sorted.length;
    this.referenceMs=Math.min(this.referenceMs,Math.max(1000/144,at(.1)));
    return {fps:Math.round(1000/mean),p95:at(.95),median:at(.5),referenceMs:this.referenceMs,stalls:sorted.filter(ms=>ms>50).length};
  }
}
export function resolutionStep(stats,ratio,max){
  // A 60 Hz display is not a GPU overload. Only lower quality when sustained
  // intervals deteriorate relative to the observed foreground cadence.
  if(stats.median>stats.referenceMs*1.18&&stats.p95>stats.referenceMs*1.5)return Math.max(.65,ratio-.1);
  if(stats.p95<stats.referenceMs*1.08)return Math.min(max,ratio+.05);
  return ratio;
}
