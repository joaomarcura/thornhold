import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Match } from '../shared/simulation.js';
import { BALANCE, STATES, DEFAULT_SETTINGS, MATCH_MODES } from '../shared/config.js';

export const cleanText=(value,fallback,max=32)=>typeof value==='string'?value.trim().replace(/[\u0000-\u001f<>]/g,'').slice(0,max)||fallback:fallback;
const reject=message=>{throw new Error(message);};
export class SessionService {
  constructor(){this.rooms=new Map();this.clients=new Map();}
  addClient(id,name='Viajante'){const c={id,name:cleanText(name,'Viajante',22),roomId:null,connected:true};this.clients.set(id,c);return c;}
  settings(input={},previous=DEFAULT_SETTINGS){
    const out={...previous},mode=Object.hasOwn(MATCH_MODES,input.mode)?input.mode:out.mode||'custom';out.mode=mode;
    for(const key of ['private','local'])if(typeof input[key]==='boolean')out[key]=input[key];
    if(['SA','NA','EU','AS'].includes(input.region))out.region=input.region;
    if(mode==='custom'){
      for(const key of ['takeover','allowRoles'])if(typeof input[key]==='boolean')out[key]=input[key];
      if(Number.isInteger(input.elfSlots))out.elfSlots=Math.min(BALANCE.maxElves,Math.max(1,input.elfSlots));
      if(Object.hasOwn(BALANCE.difficulty,input.difficulty))out.difficulty=input.difficulty;
      if(['compact','large'].includes(input.mapSize))out.mapSize=input.mapSize;
      if([20,35,50,75].includes(input.preparation))out.preparation=input.preparation;
    }else Object.assign(out,MATCH_MODES[mode].preset);
    if(typeof input.seed==='string'&&mode!=='ranked')out.seed=cleanText(input.seed,'THORNHOLD',40);
    return out;
  }
  create(client,input={}){
    if(this.room(client))reject('Saia da sala atual primeiro.');
    let code;do{code=randomBytes(4).toString('hex').slice(0,6).toUpperCase();}while(this.rooms.has(code));
    const settings=this.settings(input.settings),salt=randomBytes(16).toString('hex');if(settings.mode==='ranked')settings.seed='RANK-'+randomBytes(8).toString('hex').toUpperCase();
    const room={id:code,name:cleanText(input.name,`${client.name} · Clareira`),hostId:client.id,state:STATES.LOBBY,settings,members:new Map([[client.id,{...client,ready:false,connected:true}]]),slots:[{id:'t0',role:'troll',closed:false,occupant:null},...Array.from({length:BALANCE.maxElves},(_,i)=>({id:'e'+i,role:'elf',closed:i>=settings.elfSlots,occupant:null}))],match:null,created:Date.now(),updated:Date.now(),salt,password:input.password?scryptSync(String(input.password).slice(0,64),salt,32):null};
    client.roomId=code;room.slots.find(s=>s.role===(input.role==='troll'?'troll':'elf')).occupant={type:'human',clientId:client.id,name:client.name};this.rooms.set(code,room);
    if(input.fillBots)for(const s of room.slots)if(!s.closed&&!s.occupant)this.addBot(room,s.id);
    return room;
  }
  room(client){
    const room=this.rooms.get(client.roomId);
    if(client.roomId&&(!room||!room.members.has(client.id))){client.roomId=null;return undefined;}
    return room;
  }
  requireHost(room,client){if(room.hostId!==client.id)reject('Apenas o host pode fazer isso.');}
  editable(room){if(room.state!==STATES.LOBBY)reject('A sala está bloqueada durante a partida.');}
  invalidate(room){for(const m of room.members.values())m.ready=false;room.updated=Date.now();}
  join(client,input){
    if(this.room(client))reject('Saia da sala atual primeiro.');
    const room=this.rooms.get(String(input.code||'').trim().toUpperCase());if(!room)reject('Código não encontrado neste servidor.');this.editable(room);
    if(room.settings.local)reject('Esta sala é local. Crie uma sala privada para jogar em rede.');
    if(room.members.size>=room.settings.elfSlots+1)reject('A sala está cheia.');
    if(room.password&&!timingSafeEqual(room.password,scryptSync(String(input.password||'').slice(0,64),room.salt,32)))reject('Senha incorreta.');
    room.members.set(client.id,{...client,ready:false,connected:true});client.roomId=room.id;room.emptySince=null;if(!room.members.get(room.hostId)?.connected)room.hostId=client.id;
    const slot=room.slots.find(s=>!s.closed&&!s.occupant);if(slot)slot.occupant={type:'human',clientId:client.id,name:client.name};this.invalidate(room);return room;
  }
  addBot(room,id){const s=room.slots.find(s=>s.id===id);if(!s||s.closed||s.occupant)reject('O slot precisa estar aberto e vazio.');s.occupant={type:'bot',name:s.role==='troll'?'Grum · Troll':'Guardião '+(Number(s.id.slice(1))+1),difficulty:room.settings.difficulty};}
  changeSlot(room,client,input){
    this.editable(room);const s=room.slots.find(s=>s.id===input.slot);if(!s)reject('Slot inválido.');
    if(input.action==='claim'){
      if(!room.settings.allowRoles&&client.id!==room.hostId)reject('O host desativou a escolha livre.');
      if(s.closed||s.occupant?.type==='human')reject('Slot indisponível.');
      for(const old of room.slots)if(old.occupant?.clientId===client.id)old.occupant=null;
      s.occupant={type:'human',clientId:client.id,name:client.name};
    }else{
      this.requireHost(room,client);
      switch(input.action){
        case 'bot':this.addBot(room,s.id);break;
        case 'remove':if(s.occupant?.type!=='bot')reject('Somente bots podem ser removidos desta forma.');s.occupant=null;break;
        case 'close':if(s.role==='troll'||s.occupant)reject('Esvazie um slot Elfo antes de fechá-lo.');s.closed=true;break;
        case 'open':if(s.role==='elf'&&Number(s.id.slice(1))>=room.settings.elfSlots)reject('Aumente o limite de Elfos nas configurações.');s.closed=false;break;
        case 'difficulty':if(room.settings.mode!=='custom')reject('A dificuldade é fixa neste modo.');if(s.occupant?.type!=='bot'||!Object.hasOwn(BALANCE.difficulty,input.difficulty))reject('Dificuldade inválida.');s.occupant.difficulty=input.difficulty;break;
        case 'move':{
          const member=room.members.get(input.clientId);if(!member||s.closed)reject('Jogador ou slot indisponível.');
          const old=room.slots.find(s=>s.occupant?.clientId===input.clientId),previous=s.occupant;if(old)old.occupant=previous;else if(previous?.type==='human')reject('Mova o jogador atual primeiro.');
          s.occupant={type:'human',clientId:member.id,name:member.name};break;
        }
        default:reject('Operação de slot inválida.');
      }
    }this.invalidate(room);
  }
  observe(room,client){this.editable(room);for(const s of room.slots)if(s.occupant?.clientId===client.id)s.occupant=null;this.invalidate(room);}
  configure(room,client,input){
    this.requireHost(room,client);this.editable(room);const settings=this.settings(input,room.settings);if(settings.mode==='ranked'&&room.settings.mode!=='ranked')settings.seed='RANK-'+randomBytes(8).toString('hex').toUpperCase();
    if(room.slots.some(s=>s.role==='elf'&&Number(s.id.slice(1))>=settings.elfSlots&&s.occupant?.type==='human'))reject('Mova os jogadores antes de reduzir os slots.');
    if(room.members.size>settings.elfSlots+1)reject('O limite não pode ser menor que a quantidade de humanos na sala.');
    for(const s of room.slots.filter(s=>s.role==='elf')){if(Number(s.id.slice(1))>=settings.elfSlots){s.closed=true;s.occupant=null;}else if(Number(s.id.slice(1))>=room.settings.elfSlots)s.closed=false;}
    room.settings=settings;this.invalidate(room);
  }
  startErrors(room){const errors=[];if(room.slots.filter(s=>s.role==='troll'&&s.occupant).length!==1)errors.push('Escolha um Troll.');if(!room.slots.some(s=>s.role==='elf'&&s.occupant))errors.push('Adicione pelo menos um Elfo.');if([...room.members.values()].some(m=>m.connected&&!m.ready))errors.push('Todos os humanos precisam estar prontos.');return errors;}
  start(room,client){this.requireHost(room,client);this.editable(room);const errors=this.startErrors(room);if(errors.length)reject(errors.join(' '));const match=new Match(room.settings,room.slots);room.state=STATES.LOADING;room.match=match;room.logged=false;room.updated=Date.now();return match;}
  returnToLobby(room,client){this.requireHost(room,client);if(room.state!==STATES.END)reject('A revanche fica disponível no resultado.');room.state=STATES.RETURN;room.match=null;for(const m of room.members.values())if(!m.connected){const slot=room.slots.find(s=>s.occupant?.clientId===m.id);if(slot)slot.occupant=room.settings.takeover?{type:'bot',name:m.name+' · IA',difficulty:room.settings.difficulty}:null;room.members.delete(m.id);const c=this.clients.get(m.id);if(c)c.roomId=null;}room.state=STATES.LOBBY;this.invalidate(room);}
  disconnect(client,explicit=false){
    const room=this.room(client);if(!room){if(explicit)client.roomId=null;return;}
    const member=room.members.get(client.id);if(member){member.connected=false;member.ready=false;}
    const slot=room.slots.find(s=>s.occupant?.clientId===client.id);
    if(room.match&&slot){const u=room.match.unit(slot.id);if(u){u.input={x:0,z:0};if(room.settings.takeover)room.match.setController(slot.id,'bot',room.settings.difficulty);}}
    if(room.state===STATES.LOBBY||explicit){if(slot){slot.occupant=room.match?{type:'bot',name:client.name+' · IA',difficulty:room.settings.difficulty}:null;}room.members.delete(client.id);client.roomId=null;}
    if(room.hostId===client.id){const next=[...room.members.values()].find(m=>m.connected);if(next)room.hostId=next.id;}
    if(![...room.members.values()].some(m=>m.connected))room.emptySince=Date.now();room.updated=Date.now();
  }
  resume(client){const room=this.room(client);if(!room)return;const m=room.members.get(client.id);if(m)m.connected=true;room.emptySince=null;const s=room.slots.find(s=>s.occupant?.clientId===client.id);if(room.match&&s)room.match.setController(s.id,'human');if(!room.members.get(room.hostId)?.connected)room.hostId=client.id;}
  publicRoom(room){return {id:room.id,name:room.name,state:room.state,mode:room.settings.mode,region:room.settings.region,players:[...room.members.values()].filter(m=>m.connected).length,capacity:room.settings.elfSlots+1,bots:room.slots.filter(s=>s.occupant?.type==='bot').length,password:!!room.password};}
  list(){return [...this.rooms.values()].filter(r=>!r.settings.private&&!r.settings.local&&[...r.members.values()].some(m=>m.connected)).map(r=>this.publicRoom(r));}
  serialize(room){return {id:room.id,name:room.name,hostId:room.hostId,state:room.state,settings:room.settings,members:[...room.members.values()].map(({id,name,ready,connected})=>({id,name,ready,connected})),slots:room.slots.map(s=>({...s,occupant:s.occupant?{...s.occupant,ready:s.occupant.type==='bot'||!!room.members.get(s.occupant.clientId)?.ready}:null})),errors:this.startErrors(room)};}
}
