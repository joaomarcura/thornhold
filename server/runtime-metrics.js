import { performance } from 'node:perf_hooks';

const percentile=(sorted,p)=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))]:0;
const round=value=>Math.round(value*100)/100;

export class RuntimeMetrics {
  constructor({tickBudgetMs=50,maxSamples=1200}={}){
    this.tickBudgetMs=tickBudgetMs;this.maxSamples=maxSamples;this.reset();
  }
  reset(){
    this.startedAt=Date.now();this.tickSamples=[];this.tickCount=0;this.tickOverruns=0;this.inboundMessages=0;this.outboundMessages=0;this.inboundBytes=0;this.outboundBytes=0;this.droppedMessages=0;this.connectionsAccepted=0;
    this.snapshotCount=0;this.fullSnapshots=0;this.deltaSnapshots=0;this.snapshotBytes=0;this.snapshotBuildMs=[];this.snapshotSerializeMs=[];this.roomTicks=new Map();
  }
  now(){return performance.now();}
  recordTick(durationMs){this.tickCount++;if(durationMs>this.tickBudgetMs)this.tickOverruns++;this.tickSamples.push(durationMs);if(this.tickSamples.length>this.maxSamples)this.tickSamples.splice(0,this.tickSamples.length-this.maxSamples);}
  recordInbound(bytes){this.inboundMessages++;this.inboundBytes+=bytes;}
  recordOutbound(bytes){this.outboundMessages++;this.outboundBytes+=bytes;}
  recordDrop(){this.droppedMessages++;}
  recordConnection(){this.connectionsAccepted++;}
  recordSnapshot({bytes=0,buildMs=0,serializeMs=0,full=false}={}){this.snapshotCount++;this.snapshotBytes+=bytes;if(full)this.fullSnapshots++;else this.deltaSnapshots++;this.snapshotBuildMs.push(buildMs);this.snapshotSerializeMs.push(serializeMs);if(this.snapshotBuildMs.length>this.maxSamples)this.snapshotBuildMs.shift();if(this.snapshotSerializeMs.length>this.maxSamples)this.snapshotSerializeMs.shift();}
  recordRoomTick(id,durationMs,state={}){const entry=this.roomTicks.get(id)||{samples:[],state:{}};entry.samples.push(durationMs);if(entry.samples.length>300)entry.samples.shift();entry.state=state;this.roomTicks.set(id,entry);}
  snapshot({rooms=0,clients=0,connections=0,bufferedBytes=0}={}){
    const sorted=[...this.tickSamples].sort((a,b)=>a-b),sum=this.tickSamples.reduce((n,v)=>n+v,0),memory=process.memoryUsage(),build=[...this.snapshotBuildMs].sort((a,b)=>a-b),serialize=[...this.snapshotSerializeMs].sort((a,b)=>a-b);
    return {
      at:new Date().toISOString(),uptimeSeconds:round((Date.now()-this.startedAt)/1000),rooms,clients,connections,
      tick:{budgetMs:this.tickBudgetMs,count:this.tickCount,samples:this.tickSamples.length,meanMs:round(this.tickSamples.length?sum/this.tickSamples.length:0),p50Ms:round(percentile(sorted,.5)),p95Ms:round(percentile(sorted,.95)),p99Ms:round(percentile(sorted,.99)),maxMs:round(sorted.at(-1)||0),overruns:this.tickOverruns},
      websocket:{connectionsAccepted:this.connectionsAccepted,inboundMessages:this.inboundMessages,outboundMessages:this.outboundMessages,inboundBytes:this.inboundBytes,outboundBytes:this.outboundBytes,droppedMessages:this.droppedMessages,bufferedBytes},
      snapshots:{count:this.snapshotCount,full:this.fullSnapshots,delta:this.deltaSnapshots,bytes:this.snapshotBytes,averageBytes:round(this.snapshotCount?this.snapshotBytes/this.snapshotCount:0),buildP95Ms:round(percentile(build,.95)),serializeP95Ms:round(percentile(serialize,.95))},
      roomPerformance:[...this.roomTicks].map(([id,entry])=>{const samples=[...entry.samples].sort((a,b)=>a-b);return{id,p95Ms:round(percentile(samples,.95)),maxMs:round(samples.at(-1)||0),...entry.state};}).sort((a,b)=>b.p95Ms-a.p95Ms).slice(0,20),
      memory:{rssBytes:memory.rss,heapUsedBytes:memory.heapUsed,heapTotalBytes:memory.heapTotal}
    };
  }
}
