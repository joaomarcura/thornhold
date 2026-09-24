import http from 'node:http';
import { readFile, mkdir, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { SessionService, cleanText } from './sessions.js';
import { BALANCE, STATES } from '../shared/config.js';

const root=fileURLToPath(new URL('../',import.meta.url));
export async function createGameServer({port=Number(process.env.PORT)||3000,host=process.env.HOST||'0.0.0.0',telemetry=true,devMode=process.env.THORNHOLD_DEV==='1'}={}){
  const sessions=new SessionService(),connections=new Map(),tokens=new Map();
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.png':'image/png'};
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,game:'thornhold',rooms:sessions.rooms.size,clients:connections.size}));return;}
      let pathname=decodeURIComponent(url.pathname);if(pathname==='/')pathname='/client/index.html';
      if(!/^\/(client|shared|vendor)\//.test(pathname)){res.writeHead(404);res.end('Not found');return;}
      if(pathname.startsWith('/vendor/')){if(!['/vendor/three.module.js','/vendor/three.core.js'].includes(pathname)){res.writeHead(404);res.end();return;}pathname=pathname.replace('/vendor/','/node_modules/three/build/');}
      const filename=path.resolve(root,'.'+pathname);const allowedRoots=['client','shared','node_modules/three/build'].map(p=>path.join(root,p)+path.sep);if(!allowedRoots.some(prefix=>filename.startsWith(prefix))){res.writeHead(403);res.end();return;}
      const data=await readFile(filename);res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' data:; media-src 'self' blob:; object-src 'none'; base-uri 'none'"});res.end(data);
    }catch{res.writeHead(404);res.end('Not found');}
  });
  const wss=new WebSocketServer({server,maxPayload:16384});
  const send=(ws,type,data={})=>{if(ws?.readyState===WebSocket.OPEN&&ws.bufferedAmount<1_000_000)ws.send(JSON.stringify({type,...data}));};
  const broadcast=(room,type,data)=>{for(const m of room.members.values())send(connections.get(m.id),type,data);};
  const lobby=room=>broadcast(room,'lobby',{room:sessions.serialize(room)});
  const sendMatch=(ws,room,client)=>{const slot=room.slots.find(s=>s.occupant?.clientId===client.id);room.match.devSpeed=room.devSpeed||1;room.match.debugTowers=devMode;send(ws,'map',{map:room.match.map,viewerId:slot?.id||null});send(ws,'snapshot',{snapshot:room.match.snapshot(slot?.id||null)});if(room.state===STATES.END)send(ws,'result',{result:room.match.result()});};
  wss.on('connection',(ws,req)=>{
    const origin=req.headers.origin;if(origin){try{const originHost=new URL(origin).host;if(originHost!==req.headers.host){ws.close(1008,'Origin mismatch');return;}}catch{ws.close(1008);return;}}
    let client=null,count=0,windowAt=Date.now();ws.isAlive=true;
    ws.on('pong',()=>ws.isAlive=true);
    ws.on('message',raw=>{
      try{
        if(Date.now()-windowAt>=1000){count=0;windowAt=Date.now();}if(++count>100){send(ws,'error',{message:'Muitos comandos. Aguarde um instante.'});return;}
        const msg=JSON.parse(raw.toString());if(!msg||typeof msg.type!=='string')return;
        if(!client){
          if(msg.type!=='hello')return;
          const existing=typeof msg.token==='string'?tokens.get(msg.token):null;
          if(existing){client=sessions.clients.get(existing);connections.get(client.id)?.close(4001,'Session resumed');}
          else{client=sessions.addClient(randomBytes(12).toString('hex'),msg.name);client.token=randomBytes(32).toString('hex');tokens.set(client.token,client.id);}
          client.connected=true;connections.set(client.id,ws);sessions.resume(client);send(ws,'hello',{id:client.id,token:client.token,name:client.name,roomId:client.roomId,devMode});const room=sessions.room(client);if(room){room.devSpeed??=1;lobby(room);if(room.match)sendMatch(ws,room,client);}return;
        }
        let room=sessions.room(client);
        if(msg.type==='ping'){send(ws,'pong',{sent:msg.sent,now:Date.now()});return;}
        if(msg.type==='list'){send(ws,'rooms',{rooms:sessions.list()});return;}
        if(msg.type==='name'){client.name=cleanText(msg.name,'Viajante',22);return;}
        if(msg.type==='create'){room=sessions.create(client,msg);room.devSpeed=1;lobby(room);return;}
        if(msg.type==='join'){room=sessions.join(client,msg);room.devSpeed??=1;lobby(room);return;}
        if(msg.type==='quick'){
          if(room)throw new Error('Saia da sala atual primeiro.');
          const candidate=[...sessions.rooms.values()].filter(r=>r.settings.mode==='normal'&&!r.settings.private&&!r.settings.local&&!r.password&&r.state===STATES.LOBBY&&r.settings.region===(msg.region||'SA')&&r.members.size<r.settings.elfSlots+1).sort((a,b)=>b.members.size-a.members.size)[0];
          room=candidate?sessions.join(client,{code:candidate.id}):sessions.create(client,{name:'Expedição pública',settings:{mode:'normal',private:false,region:msg.region||'SA'},fillBots:true});lobby(room);return;
        }
        if(!room)throw new Error('Entre em uma sala primeiro.');
        switch(msg.type){
          case 'leave':sessions.disconnect(client,true);send(ws,'left');lobby(room);break;
          case 'ready':sessions.editable(room);room.members.get(client.id).ready=msg.ready===true;lobby(room);break;
          case 'slot':sessions.changeSlot(room,client,msg);lobby(room);break;
          case 'observe':sessions.observe(room,client);lobby(room);break;
          case 'settings':sessions.configure(room,client,msg.settings||{});lobby(room);break;
          case 'start':sessions.start(room,client);broadcast(room,'phase',{state:STATES.LOADING});for(const m of room.members.values())sendMatch(connections.get(m.id),room,m);room.state=room.match.state;lobby(room);break;
          case 'return':sessions.returnToLobby(room,client);broadcast(room,'phase',{state:STATES.RETURN});lobby(room);break;
          case 'input':case 'action':{
            if(!room.match)return;const slot=room.slots.find(s=>s.occupant?.clientId===client.id);if(!slot)return;
            if(msg.type==='input')room.match.input(slot.id,msg);else{const error=room.match.act(slot.id,msg.command||{});if(error)send(ws,'actionError',{message:error});}break;
          }
          case 'dev':{
            if(!devMode)throw new Error('Modo dev desativado neste servidor.');
            if(!room.match)throw new Error('A partida ainda não começou.');
            const slot=room.slots.find(s=>s.occupant?.clientId===client.id);if(!slot)throw new Error('Você não controla um personagem.');
            room.devSpeed??=1;
            if(msg.command==='grant'){
              const error=room.match.devGrant(slot.id,{gold:msg.gold,wood:msg.wood});if(error)throw new Error(error);
              send(ws,'dev',{speed:room.devSpeed,granted:{gold:Number(msg.gold)||0,wood:Number(msg.wood)||0}});
            }else if(msg.command==='speed'){
              const speed=Number(msg.speed);if(![1,2,4,8].includes(speed))throw new Error('Velocidade dev inválida.');
              room.devSpeed=speed;room.match.devSpeed=speed;broadcast(room,'dev',{speed});
            }else throw new Error('Comando dev desconhecido.');
            break;
          }
          default:throw new Error('Mensagem desconhecida.');
        }
      }catch(error){
        const message=error instanceof SyntaxError?'Mensagem inválida.':error.message;send(ws,'error',{message});
        if(message==='Saia da sala atual primeiro.'&&client){const active=sessions.room(client);if(active){lobby(active);if(active.match)sendMatch(ws,active,client);}}
      }
    });
    ws.on('close',()=>{if(client&&connections.get(client.id)===ws){connections.delete(client.id);client.connected=false;const room=sessions.room(client);sessions.disconnect(client);if(room)lobby(room);}});
    ws.on('error',()=>{});
  });
  let ticks=0;
  const interval=setInterval(()=>{
    for(const room of sessions.rooms.values()){
      if(room.emptySince&&Date.now()-room.emptySince>120000){sessions.rooms.delete(room.id);for(const m of room.members.values()){const c=sessions.clients.get(m.id);if(c)c.roomId=null;}continue;}
      if(!room.match)continue;room.devSpeed??=1;room.match.devSpeed=room.devSpeed;room.match.debugTowers=devMode;room.match.step(1/BALANCE.tick*room.devSpeed);room.state=room.match.state;
      if(ticks%2===0)for(const m of room.members.values()){const slot=room.slots.find(s=>s.occupant?.clientId===m.id);send(connections.get(m.id),'snapshot',{snapshot:room.match.snapshot(slot?.id||null)});}
      if(room.state===STATES.END&&!room.logged){room.logged=true;const result=room.match.result();broadcast(room,'result',{result});if(telemetry)mkdir(path.join(root,'telemetry'),{recursive:true}).then(()=>appendFile(path.join(root,'telemetry','matches.jsonl'),JSON.stringify({...result,at:new Date().toISOString()})+'\n')).catch(error=>console.error('Telemetry:',error.message));}
    }ticks++;
  },1000/BALANCE.tick);
  const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.isAlive){ws.terminate();continue;}ws.isAlive=false;ws.ping();}},30000);
  await new Promise(resolve=>server.listen(port,host,resolve));
  return {server,wss,sessions,port:server.address().port,close:async()=>{clearInterval(interval);clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=await createGameServer();console.log(`THORNHOLD · http://localhost:${app.port} · Servidor autoritativo a ${BALANCE.tick} Hz`);
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});
}
