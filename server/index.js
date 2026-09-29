import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { WebSocketServer, WebSocket } from 'ws';
import { SessionService, cleanText } from './sessions.js';
import { BALANCE, STATES } from '../shared/config.js';
import { RuntimeMetrics } from './runtime-metrics.js';
import { createTelemetrySink } from './telemetry.js';
import { RELEASE } from '../shared/version.js';
import { createSnapshotDelta } from '../shared/snapshot-delta.js';
import { PlatformDatabase } from './database.js';
import { AuthService, clearSessionCookie, parseCookies, sessionCookie } from './auth.js';
import { PlatformService } from './platform.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const buildHash=process.env.BUILD_SHA||process.env.GITHUB_SHA||'local';
export function advanceMatch(match,speed=1){
  const steps=Math.max(1,Math.round(Number(speed)||1)),dt=1/BALANCE.tick;
  for(let i=0;i<steps&&[STATES.PREP,STATES.ACTIVE].includes(match.state);i++)match.step(dt);
}
export async function createGameServer({port=Number(process.env.PORT)||3000,host=process.env.HOST||'0.0.0.0',telemetry=true,telemetryMode,devMode=process.env.THORNHOLD_DEV==='1',databasePath}={}){
  const sessions=new SessionService(),connections=new Map(),tokens=new Map(),controlDiagnostics=new Map();let draining=false,drainPromise=null,closingPromise=null;
  const platformDatabase=new PlatformDatabase(databasePath?{filename:databasePath}:telemetry===false?{filename:':memory:'}:{}),auth=new AuthService(platformDatabase),platform=new PlatformService(platformDatabase,{devMode});
  const limits={maxRooms:Math.max(1,Number(process.env.MAX_ROOMS)||8),maxConnections:Math.max(1,Number(process.env.MAX_CONNECTIONS)||64),maxConnectionsPerIp:Math.max(1,Number(process.env.MAX_CONNECTIONS_PER_IP)||24)},connectionsByIp=new Map();
  const runtimeMetrics=new RuntimeMetrics({tickBudgetMs:1000/BALANCE.tick});
  const telemetrySink=createTelemetrySink({enabled:telemetry,mode:telemetryMode,directory:path.join(root,'telemetry')});
  const persistRoomResult=(room,{reason='manual-exit',clientId=null,playerName=null}={})=>{
    if(!room?.match||room.logged)return room?.resultRecord||null;
    room.match.release=RELEASE;room.match.buildHash=buildHash;
    const completed=room.match.state===STATES.END,endedAt=new Date().toISOString(),baseResult=room.match.result();
    const result={
      ...baseResult,
      release:RELEASE,buildHash,
      ...(!completed?{winner:null,endReason:reason,finalState:{...baseResult.finalState,winner:null,endReason:reason}}:{}),
      completed,
      abandoned:!completed,
      termination:{type:completed?'completed':reason,clientId,playerName,at:endedAt}
    };
    room.logged=true;room.resultRecord=result;
    telemetrySink.writeMatch(result).catch(error=>console.error('Telemetry:',error.message));
    if(completed)try{result.platform=platform.recordMatch(room,result);}catch(error){console.error(JSON.stringify({event:'RANK_PROCESSING_FAILED',roomId:room.id,message:error.message}));}
    return result;
  };
  const metricsSnapshot=()=>runtimeMetrics.snapshot({rooms:sessions.rooms.size,clients:sessions.clients.size,connections:connections.size,bufferedBytes:[...wss.clients].reduce((n,ws)=>n+(ws.bufferedAmount||0),0)});
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.png':'image/png'};
  const staticCache=new Map(),production=process.env.NODE_ENV==='production';
  const apiJson=(res,status,payload,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',...headers});res.end(JSON.stringify(payload));};
  const readJson=async req=>{let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>32768)throw Object.assign(new Error('Payload muito grande.'),{status:413});chunks.push(chunk);}try{return chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{};}catch{throw Object.assign(new Error('JSON inválido.'),{status:400});}};
  const authUser=req=>auth.authenticate(parseCookies(req.headers.cookie).thornhold_session);
  const authAttempts=new Map(),authAllowed=ip=>{const timestamp=Date.now();if(authAttempts.size>10000)for(const[key,value]of authAttempts)if(timestamp-value.start>60000)authAttempts.delete(key);const row=authAttempts.get(ip)||{start:timestamp,count:0};if(timestamp-row.start>60000){row.start=timestamp;row.count=0;}row.count++;authAttempts.set(ip,row);return row.count<=12;};
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/health'){const metrics=metricsSnapshot();res.writeHead(draining?503:200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ok:!draining,draining,game:'thornhold',rooms:metrics.rooms,clients:metrics.connections,tickP95Ms:metrics.tick.p95Ms,tickOverruns:metrics.tick.overruns}));return;}
      if(url.pathname==='/metrics'){
        const token=process.env.METRICS_TOKEN,authorized=token?req.headers.authorization===`Bearer ${token}`:process.env.NODE_ENV!=='production';
        if(!authorized){res.writeHead(401,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'unauthorized'}));return;}
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(metricsSnapshot()));return;
      }
      if(url.pathname==='/debug/controls'){
        if(!devMode){res.writeHead(404);res.end('Not found');return;}
        const rooms=[...sessions.rooms.values()].map(room=>({id:room.id,state:room.state,time:room.match?.time||0,devSpeed:room.devSpeed||1,humans:room.slots.filter(slot=>slot.occupant?.type==='human').map(slot=>{const unit=room.match?.unit(slot.id);return {clientId:slot.occupant.clientId,slotId:slot.id,role:slot.role,input:unit?.input||null,position:unit?{x:unit.x,z:unit.z}:null,events:controlDiagnostics.get(slot.occupant.clientId)||[]};})}));
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({release:RELEASE,rooms}));return;
      }
      if(url.pathname.startsWith('/api/')){
        const forwarded=process.env.TRUST_PROXY==='1'?String(req.headers['x-forwarded-for']||'').split(',')[0].trim():'',ip=forwarded||req.socket.remoteAddress||'unknown';
        if(['POST','PUT','PATCH','DELETE'].includes(req.method)&&req.headers.origin){let valid=false;try{valid=new URL(req.headers.origin).host===req.headers.host;}catch{}if(!valid){apiJson(res,403,{error:'Origem não autorizada.'});return;}}
        if(req.method==='POST'&&['/api/auth/register','/api/auth/login'].includes(url.pathname)&&!authAllowed(ip)){apiJson(res,429,{error:'Muitas tentativas. Aguarde um minuto.'});return;}
        if(req.method==='POST'&&url.pathname==='/api/auth/register'){const session=await auth.register(await readJson(req));apiJson(res,201,{user:session.user},{'Set-Cookie':sessionCookie(session.token)});return;}
        if(req.method==='POST'&&url.pathname==='/api/auth/login'){const body=await readJson(req),session=await auth.login(body.identifier,body.password);apiJson(res,200,{user:session.user},{'Set-Cookie':sessionCookie(session.token)});return;}
        if(req.method==='POST'&&url.pathname==='/api/auth/logout'){const token=parseCookies(req.headers.cookie).thornhold_session;auth.logout(token);apiJson(res,200,{ok:true},{'Set-Cookie':clearSessionCookie()});return;}
        const user=authUser(req);
        if(req.method==='GET'&&url.pathname==='/api/auth/session'){apiJson(res,200,{user});return;}
        if(req.method==='GET'&&url.pathname==='/api/leaderboard'){apiJson(res,200,platform.leaderboard({page:url.searchParams.get('page'),pageSize:url.searchParams.get('pageSize'),role:url.searchParams.get('role')||'overall',players:url.searchParams.get('players')||'all',season:url.searchParams.get('season')||undefined}));return;}
        if(req.method==='GET'&&url.pathname==='/api/seasons'){apiJson(res,200,{items:platform.seasons()});return;}
        if(req.method==='GET'&&url.pathname.startsWith('/api/players/')&&url.pathname.endsWith('/profile')){const encoded=url.pathname.slice('/api/players/'.length,-'/profile'.length),data=platform.publicProfile(decodeURIComponent(encoded),{page:url.searchParams.get('page'),pageSize:url.searchParams.get('pageSize')});apiJson(res,data?200:404,data||{error:'Jogador não encontrado.'});return;}
        if(!user){apiJson(res,401,{error:'Autenticação necessária.'});return;}
        if(req.method==='PATCH'&&url.pathname==='/api/profile'){apiJson(res,200,{user:auth.updateProfile(user.id,await readJson(req))});return;}
        if(req.method==='GET'&&url.pathname==='/api/profile'){apiJson(res,200,platform.profile(user.id,{debug:devMode}));return;}
        if(req.method==='GET'&&url.pathname==='/api/ranked'){apiJson(res,200,platform.ranked(user.id,{debug:devMode}));return;}
        if(req.method==='GET'&&url.pathname==='/api/matches'){apiJson(res,200,platform.history(user.id,{page:url.searchParams.get('page'),pageSize:url.searchParams.get('pageSize'),role:url.searchParams.get('role')||'all',result:url.searchParams.get('result')||'all',matchType:url.searchParams.get('matchType')||'all'}));return;}
        if(req.method==='GET'&&url.pathname.startsWith('/api/matches/')){const details=platform.matchDetails(url.pathname.slice('/api/matches/'.length),user.id);apiJson(res,details?200:404,details||{error:'Partida não encontrada.'});return;}
        if(req.method==='GET'&&url.pathname==='/api/ranked/debug'){const data=platform.debugSummary();apiJson(res,data?200:404,data||{error:'Disponível apenas em desenvolvimento.'});return;}
        apiJson(res,404,{error:'Endpoint não encontrado.'});return;
      }
      let pathname=decodeURIComponent(url.pathname);if(pathname==='/')pathname='/client/index.html';
      if(!/^\/(client|shared|vendor)\//.test(pathname)){res.writeHead(404);res.end('Not found');return;}
      if(pathname.startsWith('/vendor/')){if(!['/vendor/three.module.js','/vendor/three.core.js'].includes(pathname)){res.writeHead(404);res.end();return;}pathname=pathname.replace('/vendor/','/node_modules/three/build/');}
      const filename=path.resolve(root,'.'+pathname);const allowedRoots=['client','shared','node_modules/three/build'].map(p=>path.join(root,p)+path.sep);if(!allowedRoots.some(prefix=>filename.startsWith(prefix))){res.writeHead(403);res.end();return;}
      let data=staticCache.get(filename);if(!data||!production){const raw=await readFile(filename);data={raw,gzip:raw.length>1024?gzipSync(raw,{level:6}):null};if(production)staticCache.set(filename,data);}const compressed=!!data.gzip&&String(req.headers['accept-encoding']||'').includes('gzip'),body=compressed?data.gzip:data.raw;res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Content-Length':body.length,'Cache-Control':production?'public, max-age=300':'no-cache','Vary':'Accept-Encoding',...(compressed?{'Content-Encoding':'gzip'}:{}),'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' data: https:; media-src 'self' blob:; object-src 'none'; base-uri 'none'"});res.end(body);
    }catch(error){if(req.url?.startsWith('/api/')){apiJson(res,error.status||500,{error:error.status?error.message:'Erro interno.'});if(!error.status)console.error(error);return;}res.writeHead(404);res.end('Not found');}
  });
  const wss=new WebSocketServer({server,maxPayload:16384,perMessageDeflate:{threshold:1024,clientNoContextTakeover:true,serverNoContextTakeover:true}});
  const send=(ws,type,data={})=>{if(ws?.readyState!==WebSocket.OPEN)return false;if(ws.bufferedAmount>=1_000_000){runtimeMetrics.recordDrop();return false;}const payload=JSON.stringify({type,...data});runtimeMetrics.recordOutbound(Buffer.byteLength(payload));ws.send(payload);return true;};
  const broadcast=(room,type,data)=>{for(const m of room.members.values())send(connections.get(m.id),type,data);};
  const lobby=room=>broadcast(room,'lobby',{room:sessions.serialize(room)});
  const queueState=client=>send(connections.get(client.id),'queue',sessions.queueStatus(client));
  const broadcastQueue=()=>{for(const client of sessions.clients.values())if(client.connected&&!sessions.room(client))queueState(client);};
  const sendSnapshot=(ws,room,viewerId,snapshotCache=null)=>{
    if(ws?.readyState!==WebSocket.OPEN)return false;
    if(ws.bufferedAmount>=1_000_000){runtimeMetrics.recordDrop();ws.thornholdSnapshot=null;return false;}
    const cacheKey=viewerId??'observer';let prepared=snapshotCache?.get(cacheKey),buildMs=0;
    if(!prepared){const buildStarted=runtimeMetrics.now();prepared=room.match.snapshot(viewerId);buildMs=runtimeMetrics.now()-buildStarted;snapshotCache?.set(cacheKey,prepared);}
    const cursor=ws?.thornholdEventId||0,snapshot={...prepared,events:prepared.events.filter(event=>event.id>cursor)};
    const full=!ws.thornholdSnapshot,seq=(ws.thornholdSnapshotSeq||0)+1;
    const message=full?{type:'snapshot',snapshot,seq}:{type:'snapshotDelta',delta:createSnapshotDelta(ws.thornholdSnapshot,snapshot,seq)};
    const serializeStarted=runtimeMetrics.now(),payload=JSON.stringify(message),serializeMs=runtimeMetrics.now()-serializeStarted,bytes=Buffer.byteLength(payload);
    runtimeMetrics.recordSnapshot({bytes,buildMs,serializeMs,full});runtimeMetrics.recordOutbound(bytes);ws.send(payload);
    ws.thornholdSnapshot=snapshot;ws.thornholdSnapshotSeq=seq;if(snapshot.events.length)ws.thornholdEventId=snapshot.events.at(-1).id;return true;
  };
  const sendMatch=(ws,room,client)=>{if(!ws)return;const slot=room.slots.find(s=>s.occupant?.clientId===client.id);room.match.devSpeed=room.devSpeed||1;room.match.debugTowers=devMode;ws.thornholdEventId=0;ws.thornholdSnapshot=null;ws.thornholdSnapshotSeq=0;send(ws,'map',{map:room.match.map,viewerId:slot?.id||null});sendSnapshot(ws,room,slot?.id||null);if(room.state===STATES.END)send(ws,'result',{result:room.match.result()});};
  const launchMatch=room=>{room.devSpeed=1;room.match.release=RELEASE;room.match.buildHash=buildHash;broadcast(room,'phase',{state:STATES.LOADING});for(const member of room.members.values())sendMatch(connections.get(member.id),room,member);room.state=room.match.state;lobby(room);};
  wss.on('connection',(ws,req)=>{
    if(draining){ws.close(1012,'Servidor em atualização');return;}
    const origin=req.headers.origin;if(origin){try{const originHost=new URL(origin).host;if(originHost!==req.headers.host){ws.close(1008,'Origin mismatch');return;}}catch{ws.close(1008);return;}}
    const forwarded=process.env.TRUST_PROXY==='1'?String(req.headers['x-forwarded-for']||'').split(',')[0].trim():'',ip=forwarded||req.socket.remoteAddress||'unknown',ipConnections=connectionsByIp.get(ip)||0;
    if(wss.clients.size>limits.maxConnections||ipConnections>=limits.maxConnectionsPerIp){ws.close(1013,'Servidor ocupado');return;}
    connectionsByIp.set(ip,ipConnections+1);ws.thornholdIp=ip;
    runtimeMetrics.recordConnection();
    let client=null,count=0,windowAt=Date.now();const account=auth.authenticate(parseCookies(req.headers.cookie).thornhold_session);ws.isAlive=true;
    ws.on('pong',()=>ws.isAlive=true);
    ws.on('message',raw=>{
      try{
        runtimeMetrics.recordInbound(raw.length||Buffer.byteLength(raw));
        if(Date.now()-windowAt>=1000){count=0;windowAt=Date.now();}if(++count>100){send(ws,'error',{message:'Muitos comandos. Aguarde um instante.'});return;}
        const msg=JSON.parse(raw.toString());if(!msg||typeof msg.type!=='string')return;
        if(!client){
          if(msg.type!=='hello')return;
          const existing=typeof msg.token==='string'?tokens.get(msg.token):null,existingClient=existing?sessions.clients.get(existing):null,accountMatches=(existingClient?.userId||null)===(account?.id||null);
          if(existingClient&&accountMatches){client=existingClient;connections.get(client.id)?.close(4001,'Session resumed');}
          else{client=sessions.addClient(randomBytes(12).toString('hex'),msg.name,account);client.token=randomBytes(32).toString('hex');tokens.set(client.token,client.id);}
          client.connected=true;connections.set(client.id,ws);sessions.resume(client);send(ws,'hello',{id:client.id,token:client.token,name:client.name,roomId:client.roomId,devMode,release:RELEASE});const room=sessions.room(client);if(room){room.devSpeed??=1;lobby(room);if(room.match)sendMatch(ws,room,client);}else queueState(client);return;
        }
        let room=sessions.room(client);
        if(draining&&['create','quick','rankedQueue'].includes(msg.type))throw new Error('Servidor em atualização. Tente novamente em instantes.');
        if(msg.type==='ping'){send(ws,'pong',{sent:msg.sent,now:Date.now()});return;}
        if(msg.type==='clientDebug'){
          if(!devMode)return;const room=sessions.room(client),slot=room?.slots.find(s=>s.occupant?.clientId===client.id),unit=slot&&room?.match?.unit(slot.id),entry={at:new Date().toISOString(),event:String(msg.event||'unknown').slice(0,40),code:typeof msg.code==='string'?msg.code.slice(0,24):null,pointerLocked:msg.pointerLocked===true,pointerPending:msg.pointerPending===true,modal:typeof msg.modal==='string'?msg.modal.slice(0,24):null,keys:Array.isArray(msg.keys)?msg.keys.filter(k=>typeof k==='string').slice(0,12):[],suppressedKeys:Array.isArray(msg.suppressedKeys)?msg.suppressedKeys.filter(k=>typeof k==='string').slice(0,12):[],mapOpen:msg.mapOpen===true,focusedAway:msg.focusedAway===true,shopOpen:msg.shopOpen===true,serverInput:unit?.input||null,position:unit?{x:+unit.x.toFixed(2),z:+unit.z.toFixed(2)}:null,matchTime:room?.match?+room.match.time.toFixed(2):null};const events=controlDiagnostics.get(client.id)||[];events.push(entry);if(events.length>30)events.shift();controlDiagnostics.set(client.id,events);console.log(JSON.stringify({type:'control-debug',clientId:client.id,slotId:slot?.id||null,...entry}));return;
        }
        if(msg.type==='list'){send(ws,'rooms',{rooms:sessions.list()});return;}
        if(msg.type==='name'){if(!client.userId)client.name=cleanText(msg.name,'Viajante',22);return;}
        if(msg.type==='create'){if(sessions.rooms.size>=limits.maxRooms)throw new Error('Limite temporário de salas atingido.');room=sessions.create(client,msg);room.devSpeed=1;lobby(room);return;}
        if(msg.type==='join'){room=sessions.join(client,msg);room.devSpeed??=1;lobby(room);return;}
        if(msg.type==='quick'){
          if(room)throw new Error('Saia da sala atual primeiro.');
          const candidate=[...sessions.rooms.values()].filter(r=>r.settings.mode==='normal'&&!r.settings.private&&!r.settings.local&&!r.password&&r.state===STATES.LOBBY&&r.settings.region===(msg.region||'SA')&&r.members.size<r.settings.elfSlots+1).sort((a,b)=>b.members.size-a.members.size)[0];
          if(!candidate&&sessions.rooms.size>=limits.maxRooms)throw new Error('Limite temporário de salas atingido.');room=candidate?sessions.join(client,{code:candidate.id}):sessions.create(client,{name:'Expedição pública',settings:{mode:'normal',private:false,region:msg.region||'SA'},fillBots:true});lobby(room);return;
        }
        if(msg.type==='partyCreate'){sessions.createParty(client);broadcastQueue();return;}
        if(msg.type==='partyJoin'){sessions.joinParty(client,msg.code);broadcastQueue();return;}
        if(msg.type==='partyLeave'){sessions.leaveParty(client);broadcastQueue();return;}
        if(msg.type==='rankedCancel'){sessions.dequeueRanked(client);broadcastQueue();return;}
        if(msg.type==='rankedQueue'){
          if(sessions.rooms.size>=limits.maxRooms)throw new Error('Limite temporário de salas atingido.');
          const matched=sessions.queueRanked(client,msg.role,msg.fillBots===true);broadcastQueue();if(matched)launchMatch(matched);return;
        }
        if(!room)throw new Error('Entre em uma sala primeiro.');
        switch(msg.type){
          case 'leave':{
            const actor={clientId:client.id,playerName:client.name};sessions.disconnect(client,true);
            if(room.match&&![...room.members.values()].some(member=>member.connected))persistRoomResult(room,{reason:'manual-exit',...actor});
            send(ws,'left');queueState(client);lobby(room);break;
          }
          case 'ready':sessions.editable(room);room.members.get(client.id).ready=msg.ready===true;lobby(room);break;
          case 'slot':sessions.changeSlot(room,client,msg);lobby(room);break;
          case 'observe':sessions.observe(room,client);lobby(room);break;
          case 'settings':sessions.configure(room,client,msg.settings||{});lobby(room);break;
          case 'start':sessions.start(room,client);launchMatch(room);break;
          case 'return':sessions.returnToLobby(room,client);broadcast(room,'phase',{state:STATES.RETURN});lobby(room);break;
          case 'surrender':{const status=sessions.surrender(room,client);broadcast(room,'surrender',{status});lobby(room);break;}
          case 'input':case 'action':{
            if(!room.match)return;const slot=room.slots.find(s=>s.occupant?.clientId===client.id);if(!slot)return;
            if(msg.type==='input')room.match.input(slot.id,msg);else{const error=room.match.act(slot.id,msg.command||{});if(error)send(ws,'actionError',{message:error});}break;
          }
          case 'dev':{
            if(!devMode)throw new Error('Modo dev desativado neste servidor.');
            if(!room.match)throw new Error('A partida ainda não começou.');
            const slot=room.slots.find(s=>s.occupant?.clientId===client.id);
            room.devSpeed??=1;
            if(msg.command==='grant'){
              let targetId=slot?.id;
              if(!targetId){sessions.requireHost(room,client);if(!room.settings.local)throw new Error('Observadores só podem alterar bots em partidas locais.');const target=room.match.unit(String(msg.target||''));if(!target||target.controller!=='bot')throw new Error('Selecione um bot válido.');targetId=target.id;}
              const error=room.match.devGrant(targetId,{gold:msg.gold,wood:msg.wood,essence:msg.essence});if(error)throw new Error(error);
              send(ws,'dev',{speed:room.devSpeed,target:targetId,granted:{gold:Number(msg.gold)||0,wood:Number(msg.wood)||0,essence:Number(msg.essence)||0}});
            }else if(msg.command==='speed'){
              if(!slot)sessions.requireHost(room,client);
              const speed=Number(msg.speed);if(![1,2,4,6,8,16].includes(speed))throw new Error('Velocidade dev inválida.');
              room.devSpeed=speed;room.match.devSpeed=speed;const history=room.match.devSpeedHistory??=[];if(history.at(-1)?.speed!==speed)history.push({time:+room.match.time.toFixed(2),speed});room.match.devSpeedHistory=history;broadcast(room,'dev',{speed});
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
    ws.on('close',()=>{if(ws.thornholdIp){const remaining=(connectionsByIp.get(ws.thornholdIp)||1)-1;if(remaining>0)connectionsByIp.set(ws.thornholdIp,remaining);else connectionsByIp.delete(ws.thornholdIp);}if(client&&connections.get(client.id)===ws){connections.delete(client.id);client.connected=false;const room=sessions.room(client);sessions.disconnect(client);if(room)lobby(room);else broadcastQueue();}});
    ws.on('error',()=>{});
  });
  let ticks=0;
  const interval=setInterval(()=>{const tickStarted=runtimeMetrics.now();
    for(const room of sessions.rooms.values()){
      if(room.emptySince&&Date.now()-room.emptySince>120000){if(room.match&&!room.logged)persistRoomResult(room,{reason:'disconnect-timeout'});sessions.rooms.delete(room.id);for(const m of room.members.values()){const c=sessions.clients.get(m.id);if(c)c.roomId=null;}continue;}
      if(!room.match)continue;const roomStarted=runtimeMetrics.now();room.devSpeed??=1;room.match.devSpeed=room.devSpeed;room.match.debugTowers=devMode;advanceMatch(room.match,room.devSpeed);room.state=room.match.state;
      if(ticks%Math.max(1,Math.round(BALANCE.tick/BALANCE.snapshot))===0){const snapshotCache=new Map(),viewerByClient=new Map(room.slots.filter(slot=>slot.occupant?.clientId).map(slot=>[slot.occupant.clientId,slot.id]));for(const m of room.members.values())sendSnapshot(connections.get(m.id),room,viewerByClient.get(m.id)||null,snapshotCache);}
      if(room.state===STATES.END&&!room.logged){const result=persistRoomResult(room);if(result)broadcast(room,'result',{result});}
      runtimeMetrics.recordRoomTick(room.id,runtimeMetrics.now()-roomStarted,{state:room.state,connections:room.members.size,units:room.match.units.length,structures:room.match.structures.filter(s=>s.hp>0).length,wisps:room.match.wisps.filter(w=>w.alive).length});
    }ticks++;runtimeMetrics.recordTick(runtimeMetrics.now()-tickStarted);
  },1000/BALANCE.tick);
  const metricsIntervalMs=Math.max(1000,Number(process.env.METRICS_INTERVAL_MS)||60000);
  const metricsInterval=setInterval(()=>telemetrySink.writeRuntime(metricsSnapshot()).catch(error=>console.error('Runtime metrics:',error.message)),metricsIntervalMs);
  const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.isAlive){ws.terminate();continue;}ws.isAlive=false;ws.ping();}},30000);
  await new Promise(resolve=>server.listen(port,host,resolve));
  const close=()=>closingPromise||(closingPromise=(async()=>{clearInterval(interval);clearInterval(heartbeat);clearInterval(metricsInterval);for(const ws of wss.clients)ws.terminate();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));platformDatabase.close();})());
  const drain=({graceMs=Math.min(30000,Math.max(0,Number(process.env.SHUTDOWN_GRACE_MS)||10000))}={})=>drainPromise||(drainPromise=(async()=>{draining=true;for(const ws of wss.clients)send(ws,'error',{message:'Servidor em atualização. A conexão será reiniciada em instantes.'});if(graceMs)await new Promise(resolve=>setTimeout(resolve,graceMs));return close();})());
  return {server,wss,sessions,limits,metrics:metricsSnapshot,resetMetrics:()=>runtimeMetrics.reset(),platformDatabase,auth,platform,get draining(){return draining;},port:server.address().port,close,drain};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=await createGameServer();console.log(`THORNHOLD · http://localhost:${app.port} · Servidor autoritativo a ${BALANCE.tick} Hz`);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.drain();process.exit(0);});
}
