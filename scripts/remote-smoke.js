import { WebSocket } from 'ws';

const base=process.env.REMOTE_URL;
if(!base)throw new Error('Defina REMOTE_URL=https://seu-container-app');
const endpoint=new URL(base);endpoint.protocol=endpoint.protocol==='https:'?'wss:':'ws:';
const socket=new WebSocket(endpoint),queue=[],waiters=[];
socket.on('message',raw=>{const message=JSON.parse(raw);queue.push(message);for(const wake of [...waiters])wake();});
const send=(type,data={})=>socket.send(JSON.stringify({type,...data}));
const wait=(type,predicate=()=>true,timeout=15000)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{waiters.splice(waiters.indexOf(check),1);reject(new Error(`Timeout aguardando ${type}: ${JSON.stringify(queue.slice(-3))}`));},timeout);
  function check(){const at=queue.findIndex(message=>message.type===type&&predicate(message));if(at<0)return;clearTimeout(timer);const index=waiters.indexOf(check);if(index>=0)waiters.splice(index,1);resolve(queue.splice(at,1)[0]);}
  waiters.push(check);check();
});
try{
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  send('hello',{name:'Release smoke'});const hello=await wait('hello');
  send('create',{name:'Release smoke',role:'observer',fillBots:true,settings:{mode:'custom',local:true,private:true,elfSlots:5,seed:'RELEASE-SMOKE'}});const lobby=await wait('lobby');
  send('ready',{ready:true});await wait('lobby',message=>message.room.errors.length===0);send('start');const map=await wait('map'),snapshot=await wait('snapshot',message=>message.snapshot.units.length===6);
  console.log(JSON.stringify({ok:true,server:base,clientId:hello.id,roomId:lobby.room.id,seed:map.map.seed,units:snapshot.snapshot.units.length,state:snapshot.snapshot.state}));
}finally{socket.close();}
