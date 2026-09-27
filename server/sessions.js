import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Match } from '../shared/simulation.js';
import { BALANCE, STATES, DEFAULT_SETTINGS, MATCH_MODES } from '../shared/config.js';

export const cleanText=(value,fallback,max=32)=>typeof value==='string'?value.trim().replace(/[\u0000-\u001f<>]/g,'').slice(0,max)||fallback:fallback;
const reject=message=>{throw new Error(message);};
export class SessionService {
  constructor(){this.rooms=new Map();this.clients=new Map();this.rankedQueue={troll:[],elf:[]};this.parties=new Map();}
  addClient(id,name='Viajante'){const c={id,name:cleanText(name,'Viajante',22),roomId:null,partyId:null,connected:true};this.clients.set(id,c);return c;}
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
    if(this.queued(client))reject('Cancele a fila ranqueada primeiro.');
    let code;do{code=randomBytes(4).toString('hex').slice(0,6).toUpperCase();}while(this.rooms.has(code));
    const settings=this.settings(input.settings),observer=input.role==='observer';if(settings.mode==='ranked'&&!input.matchmade)reject('Use a fila ranqueada para iniciar este modo.');if(observer&&!settings.local)reject('A simulação somente com bots está disponível em partidas locais.');if(observer&&!input.fillBots)reject('A simulação observada precisa preencher todos os slots com bots.');const salt=randomBytes(16).toString('hex');if(settings.mode==='ranked')settings.seed='RANK-'+randomBytes(8).toString('hex').toUpperCase();
    const room={id:code,name:cleanText(input.name,`${client.name} · Clareira`),hostId:client.id,state:STATES.LOBBY,settings,members:new Map([[client.id,{...client,ready:false,connected:true}]]),slots:[{id:'t0',role:'troll',closed:false,occupant:null},...Array.from({length:BALANCE.maxElves},(_,i)=>({id:'e'+i,role:'elf',closed:i>=settings.elfSlots,occupant:null}))],match:null,matchmade:input.matchmade===true,surrenderVotes:new Set(),matchSequence:0,patrolOffset:randomBytes(1)[0]%12,patrolDirection:randomBytes(1)[0]%2?1:-1,created:Date.now(),updated:Date.now(),salt,password:input.password?scryptSync(String(input.password).slice(0,64),salt,32):null};
    client.roomId=code;if(!observer)room.slots.find(s=>s.role===(input.role==='troll'?'troll':'elf')).occupant={type:'human',clientId:client.id,name:client.name};this.rooms.set(code,room);
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
    if(this.queued(client))reject('Cancele a fila ranqueada primeiro.');
    const room=this.rooms.get(String(input.code||'').trim().toUpperCase());if(!room)reject('Código não encontrado neste servidor.');this.editable(room);
    if(room.settings.local)reject('Esta sala é local. Crie uma sala privada para jogar em rede.');
    if(room.members.size>=room.settings.elfSlots+1)reject('A sala está cheia.');
    if(room.password&&!timingSafeEqual(room.password,scryptSync(String(input.password||'').slice(0,64),room.salt,32)))reject('Senha incorreta.');
    room.members.set(client.id,{...client,ready:false,connected:true});client.roomId=room.id;room.emptySince=null;if(!room.members.get(room.hostId)?.connected)room.hostId=client.id;
    const slot=room.slots.find(s=>!s.closed&&!s.occupant&&(!input.role||s.role===input.role));if(slot)slot.occupant={type:'human',clientId:client.id,name:client.name};this.invalidate(room);return room;
  }
  addBot(room,id,rankedFill=false){if(room.settings.mode==='ranked'&&!rankedFill)reject('Bots ranqueados só podem ser adicionados pelo preenchimento de teste.');const s=room.slots.find(s=>s.id===id);if(!s||s.closed||s.occupant)reject('O slot precisa estar aberto e vazio.');s.occupant={type:'bot',name:s.role==='troll'?'Grum · Troll':'Guardião '+(Number(s.id.slice(1))+1),difficulty:room.settings.difficulty};}
  changeSlot(room,client,input){
    this.editable(room);if(room.settings.mode==='ranked')reject('Os papéis são definidos pela fila ranqueada.');const s=room.slots.find(s=>s.id===input.slot);if(!s)reject('Slot inválido.');
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
  observe(room,client){this.editable(room);if(room.settings.mode==='ranked')reject('Observadores não são permitidos no ranqueado.');for(const s of room.slots)if(s.occupant?.clientId===client.id)s.occupant=null;this.invalidate(room);}
  configure(room,client,input){
    this.requireHost(room,client);this.editable(room);if(input.mode==='ranked'&&room.settings.mode!=='ranked')reject('Use a fila ranqueada para iniciar este modo.');const settings=this.settings(input,room.settings);if(settings.mode==='ranked'&&room.settings.mode!=='ranked')settings.seed='RANK-'+randomBytes(8).toString('hex').toUpperCase();
    if(room.slots.some(s=>s.role==='elf'&&Number(s.id.slice(1))>=settings.elfSlots&&s.occupant?.type==='human'))reject('Mova os jogadores antes de reduzir os slots.');
    if(room.members.size>settings.elfSlots+1)reject('O limite não pode ser menor que a quantidade de humanos na sala.');
    for(const s of room.slots.filter(s=>s.role==='elf')){if(Number(s.id.slice(1))>=settings.elfSlots){s.closed=true;s.occupant=null;}else if(Number(s.id.slice(1))>=room.settings.elfSlots)s.closed=false;}
    room.settings=settings;this.invalidate(room);
  }
  startErrors(room){const errors=[],ranked=room.settings.mode==='ranked';if(room.slots.filter(s=>s.role==='troll'&&s.occupant).length!==1)errors.push('Escolha um Troll.');if(!room.slots.some(s=>s.role==='elf'&&s.occupant))errors.push('Adicione pelo menos um Elfo.');if(ranked&&(room.slots.filter(s=>s.role==='elf'&&s.occupant).length!==5||room.members.size<1||[...room.members.keys()].some(id=>!room.slots.some(s=>s.occupant?.clientId===id))||(!room.rankedBotFill&&room.slots.some(s=>s.occupant?.type==='bot'))))errors.push('Ranqueada exige 1 Troll e 5 Elfos; bots só entram pelo preenchimento de teste.');if([...room.members.values()].some(m=>m.connected&&!m.ready))errors.push('Todos os humanos precisam estar prontos.');return errors;}
  start(room,client){
    this.requireHost(room,client);this.editable(room);const errors=this.startErrors(room);if(errors.length)reject(errors.join(' '));
    const sequence=room.matchSequence||0,start=(room.patrolOffset+sequence*5)%12,direction=sequence%2?-(room.patrolDirection||1):(room.patrolDirection||1),routeVariant=`${room.id}-${sequence+1}-${start}-${direction>0?'CW':'CCW'}`;
    const match=new Match({...room.settings,routeVariant,trollPatrolStart:start,trollPatrolDirection:direction},room.slots);room.matchSequence=sequence+1;
    room.state=STATES.LOADING;room.match=match;room.logged=false;room.updated=Date.now();return match;
  }
  returnToLobby(room,client){this.requireHost(room,client);if(room.state!==STATES.END)reject('A revanche fica disponível no resultado.');room.state=STATES.RETURN;room.match=null;room.surrenderVotes.clear();if(room.settings.mode==='ranked')room.settings.seed='RANK-'+randomBytes(8).toString('hex').toUpperCase();for(const m of room.members.values())if(!m.connected){const slot=room.slots.find(s=>s.occupant?.clientId===m.id);if(slot)slot.occupant=room.settings.takeover?{type:'bot',name:m.name+' · IA',difficulty:room.settings.difficulty}:null;room.members.delete(m.id);const c=this.clients.get(m.id);if(c)c.roomId=null;}room.state=STATES.LOBBY;this.invalidate(room);}
  createParty(client){if(this.room(client))reject('Saia da sala atual primeiro.');this.leaveParty(client);let id;do{id=randomBytes(3).toString('hex').toUpperCase();}while(this.parties.has(id));this.parties.set(id,{id,leaderId:client.id,members:[client.id]});client.partyId=id;return this.partyStatus(client);}
  joinParty(client,code){if(this.room(client))reject('Saia da sala atual primeiro.');const party=this.parties.get(String(code||'').trim().toUpperCase());if(!party)reject('Grupo não encontrado.');if(party.members.length>=5)reject('O grupo já possui 5 Elfos.');if(this.queued(client))reject('Cancele a fila primeiro.');this.leaveParty(client);party.members.push(client.id);client.partyId=party.id;return this.partyStatus(client);}
  leaveParty(client){const party=this.parties.get(client.partyId);if(!party){client.partyId=null;return;}this.dequeueRanked(client);party.members=party.members.filter(id=>id!==client.id);client.partyId=null;if(!party.members.length)this.parties.delete(party.id);else if(party.leaderId===client.id)party.leaderId=party.members[0];}
  partyStatus(client){const party=this.parties.get(client.partyId);return party?{id:party.id,leaderId:party.leaderId,members:party.members.map(id=>{const c=this.clients.get(id);return {id,name:c?.name||'Elfo',connected:!!c?.connected};})}:null;}
  queued(client){return [...this.rankedQueue.troll,...this.rankedQueue.elf].find(entry=>entry.members.includes(client.id));}
  dequeueRanked(client){for(const role of ['troll','elf'])this.rankedQueue[role]=this.rankedQueue[role].filter(entry=>!entry.members.includes(client.id));}
  queueStatus(client){const entry=this.queued(client);return {queued:!!entry,role:entry?.role||null,players:{troll:this.rankedQueue.troll.reduce((n,e)=>n+e.members.length,0),elf:this.rankedQueue.elf.reduce((n,e)=>n+e.members.length,0)},party:this.partyStatus(client)};}
  queueRanked(client,role,fillBots=false){
    if(this.room(client))reject('Saia da sala atual primeiro.');if(!['troll','elf'].includes(role))reject('Papel ranqueado inválido.');if(this.queued(client))reject('Você já está na fila.');
    const party=this.parties.get(client.partyId);if(role==='troll'&&party?.members.length>1)reject('O Troll entra sozinho na fila.');
    if(party&&party.leaderId!==client.id)reject('Apenas o líder pode colocar o grupo na fila.');
    const members=party?.members||[client.id];if(role==='elf'&&members.some(id=>{const c=this.clients.get(id);return !c?.connected||this.room(c)||this.queued(c);}))reject('Todos os Elfos do grupo precisam estar online e fora de salas.');
    const entry={id:randomBytes(8).toString('hex'),role,members:[...members],queuedAt:Date.now()};this.rankedQueue[role].push(entry);return fillBots?this.matchRankedBots(entry):this.matchRanked();
  }
  rankedElfGroups(){
    const groups=this.rankedQueue.elf;let found=null;
    const seek=(at,total,picked)=>{if(found)return;if(total===5){found=picked;return;}if(total>5)return;for(let i=at;i<groups.length;i++)seek(i+1,total+groups[i].members.length,[...picked,groups[i]]);};seek(0,0,[]);return found;
  }
  matchRanked(){
    const trollEntry=this.rankedQueue.troll[0],elfGroups=this.rankedElfGroups();if(!trollEntry||!elfGroups)return null;
    const troll=this.clients.get(trollEntry.members[0]),elves=elfGroups.flatMap(g=>g.members).map(id=>this.clients.get(id));if(!troll?.connected||elves.some(c=>!c?.connected))return null;
    this.rankedQueue.troll.shift();const used=new Set(elfGroups.map(g=>g.id));this.rankedQueue.elf=this.rankedQueue.elf.filter(g=>!used.has(g.id));
    const room=this.create(troll,{name:'Expedição ranqueada',role:'troll',settings:{mode:'ranked',region:'SA'},matchmade:true});for(const elf of elves)this.join(elf,{code:room.id});
    for(const member of room.members.values())member.ready=true;this.start(room,troll);return room;
  }
  matchRankedBots(entry){
    const members=entry.members.map(id=>this.clients.get(id));if(members.some(client=>!client?.connected))return null;
    this.rankedQueue[entry.role]=this.rankedQueue[entry.role].filter(item=>item.id!==entry.id);const host=members[0];
    const room=this.create(host,{name:'Ranqueada · teste com bots',role:entry.role,settings:{mode:'ranked',region:'SA'},matchmade:true});room.rankedBotFill=true;
    for(const member of members.slice(1))this.join(member,{code:room.id,role:'elf'});for(const slot of room.slots)if(!slot.closed&&!slot.occupant)this.addBot(room,slot.id,true);
    for(const member of room.members.values())member.ready=true;this.start(room,host);return room;
  }
  surrenderThreshold(room,role){if(role==='troll')return 1;return Math.max(1,Math.min(4,room.slots.filter(s=>s.role==='elf'&&s.occupant?.type==='human').length));}
  surrender(room,client){
    if(room.settings.mode!=='ranked')reject('Rendição está disponível apenas no ranqueado.');if(room.state!==STATES.ACTIVE||!room.match)reject('A partida ainda não permite rendição.');if(room.match.time<600)reject('A rendição fica disponível após 10 minutos.');
    const slot=room.slots.find(s=>s.occupant?.clientId===client.id);if(!slot)reject('Observadores não podem votar.');room.surrenderVotes.add(client.id);
    const votes=[...room.surrenderVotes].filter(id=>room.slots.find(s=>s.occupant?.clientId===id)?.role===slot.role).length,needed=this.surrenderThreshold(room,slot.role);
    if(votes>=needed)room.match.surrender(slot.role);return {role:slot.role,votes,needed,ended:room.match.state===STATES.END};
  }
  disconnect(client,explicit=false){
    this.dequeueRanked(client);const room=this.room(client);if(!room){if(explicit)client.roomId=null;return;}
    const member=room.members.get(client.id);if(member){member.connected=false;member.ready=false;}
    const slot=room.slots.find(s=>s.occupant?.clientId===client.id);
    if(room.match&&slot){const u=room.match.unit(slot.id);if(u){u.input={x:0,z:0};if(room.settings.takeover)room.match.setController(slot.id,'bot',room.settings.difficulty);}}
    if(room.state===STATES.LOBBY||explicit){if(slot){slot.occupant=room.match?{type:'bot',name:client.name+' · IA',difficulty:room.settings.difficulty}:null;}room.members.delete(client.id);client.roomId=null;}
    if(room.hostId===client.id){const next=[...room.members.values()].find(m=>m.connected);if(next)room.hostId=next.id;}
    if(![...room.members.values()].some(m=>m.connected))room.emptySince=Date.now();room.updated=Date.now();
  }
  resume(client){const room=this.room(client);if(!room)return;const m=room.members.get(client.id);if(m)m.connected=true;room.emptySince=null;const s=room.slots.find(s=>s.occupant?.clientId===client.id);if(room.match&&s)room.match.setController(s.id,'human');if(!room.members.get(room.hostId)?.connected)room.hostId=client.id;}
  publicRoom(room){return {id:room.id,name:room.name,state:room.state,mode:room.settings.mode,region:room.settings.region,players:[...room.members.values()].filter(m=>m.connected).length,capacity:room.settings.elfSlots+1,bots:room.slots.filter(s=>s.occupant?.type==='bot').length,password:!!room.password};}
  list(){return [...this.rooms.values()].filter(r=>r.settings.mode!=='ranked'&&!r.settings.private&&!r.settings.local&&[...r.members.values()].some(m=>m.connected)).map(r=>this.publicRoom(r));}
  serialize(room){const votes={troll:0,elf:0};for(const id of room.surrenderVotes){const role=room.slots.find(s=>s.occupant?.clientId===id)?.role;if(role)votes[role]++;}return {id:room.id,name:room.name,hostId:room.hostId,state:room.state,settings:room.settings,matchmade:room.matchmade,rankedBotFill:!!room.rankedBotFill,members:[...room.members.values()].map(({id,name,ready,connected})=>({id,name,ready,connected})),slots:room.slots.map(s=>({...s,occupant:s.occupant?{...s.occupant,ready:s.occupant.type==='bot'||!!room.members.get(s.occupant.clientId)?.ready}:null})),surrender:{available:(room.match?.time||0)>=600,votes,needed:{troll:1,elf:this.surrenderThreshold(room,'elf')}},errors:this.startErrors(room)};}
}
