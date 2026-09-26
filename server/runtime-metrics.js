import { performance } from 'node:perf_hooks';

const percentile=(sorted,p)=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))]:0;
const round=value=>Math.round(value*100)/100;

export class RuntimeMetrics {
  constructor({tickBudgetMs=50,maxSamples=1200}={}){
    this.startedAt=Date.now();this.tickBudgetMs=tickBudgetMs;this.maxSamples=maxSamples;this.tickSamples=[];
    this.tickCount=0;this.tickOverruns=0;this.inboundMessages=0;this.outboundMessages=0;this.inboundBytes=0;this.outboundBytes=0;this.droppedMessages=0;this.connectionsAccepted=0;
  }
  now(){return performance.now();}
  recordTick(durationMs){this.tickCount++;if(durationMs>this.tickBudgetMs)this.tickOverruns++;this.tickSamples.push(durationMs);if(this.tickSamples.length>this.maxSamples)this.tickSamples.splice(0,this.tickSamples.length-this.maxSamples);}
  recordInbound(bytes){this.inboundMessages++;this.inboundBytes+=bytes;}
  recordOutbound(bytes){this.outboundMessages++;this.outboundBytes+=bytes;}
  recordDrop(){this.droppedMessages++;}
  recordConnection(){this.connectionsAccepted++;}
  snapshot({rooms=0,clients=0,connections=0,bufferedBytes=0}={}){
    const sorted=[...this.tickSamples].sort((a,b)=>a-b),sum=this.tickSamples.reduce((n,v)=>n+v,0),memory=process.memoryUsage();
    return {
      at:new Date().toISOString(),uptimeSeconds:round((Date.now()-this.startedAt)/1000),rooms,clients,connections,
      tick:{budgetMs:this.tickBudgetMs,count:this.tickCount,samples:this.tickSamples.length,meanMs:round(this.tickSamples.length?sum/this.tickSamples.length:0),p50Ms:round(percentile(sorted,.5)),p95Ms:round(percentile(sorted,.95)),p99Ms:round(percentile(sorted,.99)),maxMs:round(sorted.at(-1)||0),overruns:this.tickOverruns},
      websocket:{connectionsAccepted:this.connectionsAccepted,inboundMessages:this.inboundMessages,outboundMessages:this.outboundMessages,inboundBytes:this.inboundBytes,outboundBytes:this.outboundBytes,droppedMessages:this.droppedMessages,bufferedBytes},
      memory:{rssBytes:memory.rss,heapUsedBytes:memory.heapUsed,heapTotalBytes:memory.heapTotal}
    };
  }
}
