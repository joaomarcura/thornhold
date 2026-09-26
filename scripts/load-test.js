import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';

const roomCount=Math.max(2,Number(process.env.LOAD_ROOMS)||8),durationSeconds=Math.max(3,Number(process.env.LOAD_SECONDS)||10),speed=[1,2,4,8].includes(Number(process.env.LOAD_SPEED))?Number(process.env.LOAD_SPEED):1,p95LimitMs=Math.max(1,Number(process.env.LOAD_P95_LIMIT_MS)||25);

async function connect(port,index){
  const socket=new WebSocket(`ws://127.0.0.1:${port}`),queue=[],waiters=[],traffic={messages:0,bytes:0,snapshots:0};
  socket.on('message',raw=>{traffic.messages++;traffic.bytes+=raw.length;const message=JSON.parse(raw);if(message.type==='snapshot')traffic.snapshots++;queue.push(message);for(const wake of [...waiters])wake();});
  const send=(type,data={})=>socket.send(JSON.stringify({type,...data}));
  const wait=(type,predicate=()=>true,timeout=5000)=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{waiters.splice(waiters.indexOf(check),1);reject(new Error(`Sala ${index}: timeout aguardando ${type}`));},timeout);
    function check(){const at=queue.findIndex(message=>message.type===type&&predicate(message));if(at<0)return;clearTimeout(timer);const i=waiters.indexOf(check);if(i>=0)waiters.splice(i,1);resolve(queue.splice(at,1)[0]);}
    waiters.push(check);check();
  });
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});send('hello',{name:`Carga ${index+1}`});await wait('hello');
  return {socket,send,wait,traffic};
}

const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false,devMode:true}),clients=[];
try{
  for(let i=0;i<roomCount;i++){
    const client=await connect(app.port,i);clients.push(client);
    client.send('create',{name:`Load room ${i+1}`,role:'observer',fillBots:true,settings:{mode:'custom',local:true,private:true,elfSlots:5,seed:`LOAD-${i+1}`}});await client.wait('lobby');
    client.send('ready',{ready:true});await client.wait('lobby',message=>message.room.errors.length===0);client.send('start');await client.wait('map');await client.wait('snapshot');client.send('dev',{command:'speed',speed});await client.wait('dev',message=>message.speed===speed);
  }
  await new Promise(resolve=>setTimeout(resolve,durationSeconds*1000));
  const metrics=app.metrics(),traffic=clients.reduce((total,client)=>({messages:total.messages+client.traffic.messages,bytes:total.bytes+client.traffic.bytes,snapshots:total.snapshots+client.traffic.snapshots}),{messages:0,bytes:0,snapshots:0});
  const report={rooms:roomCount,connections:clients.length,durationSeconds,simulationSpeed:speed,p95LimitMs,traffic,bytesPerSecond:Math.round(traffic.bytes/durationSeconds),metrics};
  console.log(JSON.stringify(report,null,2));
  if(metrics.tick.p95Ms>=p95LimitMs)throw new Error(`Tick p95 ${metrics.tick.p95Ms}ms excedeu meta de ${p95LimitMs}ms`);
  if(metrics.tick.overruns/Math.max(1,metrics.tick.count)>.01)throw new Error(`${metrics.tick.overruns} ticks excederam o orçamento de ${metrics.tick.budgetMs}ms`);
  if(metrics.websocket.droppedMessages>0)throw new Error(`${metrics.websocket.droppedMessages} mensagens WebSocket descartadas`);
  if(traffic.snapshots<roomCount*durationSeconds*5)throw new Error('Cadência de snapshots abaixo do esperado.');
}finally{
  for(const client of clients)client.socket.terminate();await app.close();
}
