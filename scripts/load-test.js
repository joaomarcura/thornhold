import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';

const validSpeed=value=>[1,2,4,6,8,16].includes(Number(value))?Number(value):1;
const mature=process.argv.includes('--mature'),roomCount=Math.max(2,Number(process.env.LOAD_ROOMS)||(mature?4:8)),clientsPerRoom=Math.max(1,Math.min(8,Number(process.env.LOAD_CLIENTS_PER_ROOM)||6)),durationSeconds=Math.max(3,Number(process.env.LOAD_SECONDS)||10),speed=validSpeed(process.env.LOAD_SPEED||1),warmupSpeed=validSpeed(process.env.LOAD_WARMUP_SPEED||(mature?16:speed)),p95LimitMs=Math.max(1,Number(process.env.LOAD_P95_LIMIT_MS)||25),warmupSeconds=Math.max(0,Number(process.env.LOAD_WARMUP_SECONDS)||(mature?30:2));

async function connect(port,index){
  const socket=new WebSocket(`ws://127.0.0.1:${port}`),queue=[],waiters=[],traffic={messages:0,bytes:0,snapshots:0};
  socket.on('message',raw=>{traffic.messages++;traffic.bytes+=raw.length;const message=JSON.parse(raw);if(message.type==='snapshot'||message.type==='snapshotDelta')traffic.snapshots++;queue.push(message);for(const wake of [...waiters])wake();});
  const send=(type,data={})=>socket.send(JSON.stringify({type,...data}));
  const wait=(type,predicate=()=>true,timeout=5000)=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{waiters.splice(waiters.indexOf(check),1);reject(new Error(`Sala ${index}: timeout aguardando ${type}`));},timeout);
    function check(){const at=queue.findIndex(message=>message.type===type&&predicate(message));if(at<0)return;clearTimeout(timer);const i=waiters.indexOf(check);if(i>=0)waiters.splice(i,1);resolve(queue.splice(at,1)[0]);}
    waiters.push(check);check();
  });
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});send('hello',{name:`Carga ${index+1}`});await wait('hello');
  return {socket,send,wait,traffic,resetTraffic(){traffic.messages=0;traffic.bytes=0;traffic.snapshots=0;}};
}

process.env.MAX_ROOMS=String(Math.max(roomCount,Number(process.env.MAX_ROOMS)||0));
process.env.MAX_CONNECTIONS=String(Math.max(roomCount*clientsPerRoom+8,Number(process.env.MAX_CONNECTIONS)||0));
process.env.MAX_CONNECTIONS_PER_IP=String(Math.max(roomCount*clientsPerRoom+8,Number(process.env.MAX_CONNECTIONS_PER_IP)||0));
const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false,devMode:true}),clients=[],roomHosts=[];
try{
  for(let i=0;i<roomCount;i++){
    const host=await connect(app.port,clients.length);clients.push(host);roomHosts.push(host);
    host.send('create',{name:`Load room ${i+1}`,role:'troll',fillBots:true,settings:{mode:'custom',local:false,private:true,elfSlots:5,seed:`LOAD-${i+1}`}});const created=await host.wait('lobby'),roomClients=[host];
    for(let j=1;j<clientsPerRoom;j++){const guest=await connect(app.port,clients.length);clients.push(guest);roomClients.push(guest);guest.send('join',{code:created.room.id});await guest.wait('lobby');}
    for(const client of roomClients)client.send('ready',{ready:true});
    await host.wait('lobby',message=>message.room.errors.length===0&&message.room.members.every(member=>member.ready));host.send('start');
    await Promise.all(roomClients.map(async client=>{await client.wait('map');await client.wait('snapshot');}));host.send('dev',{command:'speed',speed:warmupSpeed});await host.wait('dev',message=>message.speed===warmupSpeed);
  }
  if(warmupSeconds)await new Promise(resolve=>setTimeout(resolve,warmupSeconds*1000));
  if(speed!==warmupSpeed)await Promise.all(roomHosts.map(async host=>{host.send('dev',{command:'speed',speed});await host.wait('dev',message=>message.speed===speed);}));
  for(const client of clients)client.resetTraffic();app.resetMetrics();
  await new Promise(resolve=>setTimeout(resolve,durationSeconds*1000));
  const metrics=app.metrics(),traffic=clients.reduce((total,client)=>({messages:total.messages+client.traffic.messages,bytes:total.bytes+client.traffic.bytes,snapshots:total.snapshots+client.traffic.snapshots}),{messages:0,bytes:0,snapshots:0});
  const matchTimes=[...app.sessions.rooms.values()].map(room=>Math.round(room.match?.time||0)),report={rooms:roomCount,clientsPerRoom,connections:clients.length,durationSeconds,warmupSeconds,warmupSpeed,simulationSpeed:speed,simulatedMatchSeconds:{min:Math.min(...matchTimes),max:Math.max(...matchTimes)},p95LimitMs,traffic,bytesPerSecond:Math.round(traffic.bytes/durationSeconds),metrics};
  console.log(JSON.stringify(report,null,2));
  if(metrics.tick.p95Ms>=p95LimitMs)throw new Error(`Tick p95 ${metrics.tick.p95Ms}ms excedeu meta de ${p95LimitMs}ms`);
  if(metrics.tick.overruns/Math.max(1,metrics.tick.count)>.01)throw new Error(`${metrics.tick.overruns} ticks excederam o orçamento de ${metrics.tick.budgetMs}ms`);
  if(metrics.websocket.droppedMessages>0)throw new Error(`${metrics.websocket.droppedMessages} mensagens WebSocket descartadas`);
  if(traffic.snapshots<roomCount*durationSeconds*5)throw new Error('Cadência de snapshots abaixo do esperado.');
}finally{
  for(const client of clients)client.socket.terminate();await app.close();
}
