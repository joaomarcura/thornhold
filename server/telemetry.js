import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';

const line=value=>JSON.stringify(value)+'\n';

export function createTelemetrySink({enabled=true,mode=process.env.TELEMETRY_MODE||((process.env.NODE_ENV==='production')?'stdout':'file'),provider=process.env.TELEMETRY_PROVIDER||'generic',directory,environment=process.env.DEPLOY_ENV||'local',output=console.log}={}){
  const selected=enabled===false?'off':mode;
  const persist=async(record,filename)=>{
    if(selected==='off')return;
    if(selected==='stdout'){output(JSON.stringify(record));return;}
    if(selected!=='file')throw new Error(`TELEMETRY_MODE inválido: ${selected}`);
    await mkdir(directory,{recursive:true});await appendFile(path.join(directory,filename),line(record));
  };
  return {
    mode:selected,
    writeMatch(result){return persist({...result,type:'match_result',schemaVersion:1,environment,at:new Date().toISOString()},'matches.jsonl');},
    writeRuntime(metrics){
      const record={type:'runtime_metrics',schemaVersion:1,environment,...metrics};
      if(provider==='aws')Object.assign(record,{
        _aws:{Timestamp:Date.now(),CloudWatchMetrics:[{Namespace:'Thornhold',Dimensions:[['Environment']],Metrics:[
          {Name:'TickP95Ms',Unit:'Milliseconds'},{Name:'TickMaxMs',Unit:'Milliseconds'},{Name:'TickOverruns',Unit:'Count'},
          {Name:'WsOutboundBytes',Unit:'Bytes'},{Name:'WsDroppedMessages',Unit:'Count'},{Name:'ActiveRooms',Unit:'Count'},{Name:'ActiveConnections',Unit:'Count'}
        ]}]},Environment:environment,TickP95Ms:metrics.tick.p95Ms,TickMaxMs:metrics.tick.maxMs,TickOverruns:metrics.tick.overruns,
        WsOutboundBytes:metrics.websocket.outboundBytes,WsDroppedMessages:metrics.websocket.droppedMessages,ActiveRooms:metrics.rooms,ActiveConnections:metrics.connections
      });
      return persist(record,'runtime.jsonl');
    }
  };
}
