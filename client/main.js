import { WorldRenderer } from './renderer.js';
import { MouseLook } from './mouse-look.js';
import { TacticalMap } from './tactical-map.js';
import { shopMarkup } from './shop.js';
import { icon } from './icons.js';
import { resource, resourceCost } from './resources.js';
import { updatePanel } from './panel.js';
import { selectionMarkup, freeTrees } from './selection.js';
import { BALANCE as B, STATES, MATCH_MODES, distance, mineEconomy } from '../shared/config.js';
import { baseAt, toCell, walkable, lineOfSight, heightAt, flatGround } from '../shared/map.js';

const $=s=>document.querySelector(s),app=$('#app'),hud=$('#hud'),canvas=$('#world');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>Math.floor(x||0).toLocaleString('pt-BR'),clock=x=>`${Math.floor(x/60)}:${String(Math.floor(x%60)).padStart(2,'0')}`;
const diffName={easy:'Fácil',normal:'Normal',hard:'Difícil'};
const modeName=Object.fromEntries(Object.entries(MATCH_MODES).map(([key,value])=>[key,value.name]));
let view='menu',modal=null,room=null,rooms=[],snapshot=null,result=null,clientId=null,viewerId=null,ws=null,ping=0,connected=false,devMode=false,devSpeed=1,debugCombat=false,selected=null,buildKind=null,buildPoint=null,buildValid=false,rotation=0,snap=true,keys=new Set(),lastMouse={x:innerWidth/2,y:innerHeight/2},lastHud=0,lastSound=0,toastTimer,selectionKey='',reconnecting=false;
let nickname=localStorage.getItem('thornhold-name')||'Viajante',soundOn=localStorage.getItem('thornhold-sound')!=='off';
const exploredBases=new Set();
let world;
try{world=new WorldRenderer(canvas);}catch(error){app.innerHTML=`<div class="fatal"><h1>Não foi possível abrir o mundo 3D.</h1><p>Ative a aceleração gráfica do navegador e recarregue a página.</p><pre>${escape(error.message)}</pre></div>`;throw error;}
let tactical=null,mapOpen=false,shopTab='gear',shopBuild='siege',impactTimer,assigning=null,awaitingBuild=false;
const suppressedKeys=new Set(),labelNodes=new Map();
let hoverTarget=null,showHints=localStorage.getItem('thornhold-hints')!=='off';
const mouseLook=new MouseLook(canvas,world,()=>{keys.clear();lastMouse={x:innerWidth/2,y:innerHeight/2};syncControls();},toast);
function syncControls(){
  document.body.classList.toggle('mouse-look',mouseLook.locked);
  if($('#cursor-mode')){$('#cursor-mode').textContent=world.focusPoint?'Visão tática · C voltar':mouseLook.locked?'Bolinha do mouse · cursor':mouseLook.started?'Cursor livre · bolinha para jogar':'Clique no cenário para jogar';$('#cursor-mode').classList.toggle('subtle',mouseLook.locked);}
  document.body.classList.toggle('has-selection',!!selected&&!assigning);document.body.classList.toggle('hints-off',!showHints);
  if($('#crosshair'))$('#crosshair').hidden=!mouseLook.locked||!!world.focusPoint||!!modal;
}
function releaseCursor(){stopInput();mouseLook.release();}
function deselect(){selected=null;selectionKey='';if($('#selection-panel'))$('#selection-panel').hidden=true;}
function stopInput(){for(const key of keys)suppressedKeys.add(key);keys.clear();if(snapshot&&(me()?.alive||me()?.ghost))send('input',{x:0,z:0});}
function cancelContext(openMenu=false){
  awaitingBuild=false;stopInput();
  if($('#ping-wheel')&&!$('#ping-wheel').hidden){$('#ping-wheel').hidden=true;return true;}
  if(modal){modal=null;render();return true;}
  if(assigning){assigning=null;$('#targeting-hint').hidden=true;selectionKey='';return true;}
  if(buildKind){cancelBuild();return true;}
  if(mapOpen){toggleMap();return true;}
  if(world.focusPoint){returnCamera();return true;}
  if($('#shop')&&!$('#shop').hidden){$('#shop').hidden=true;return true;}
  if(selected){deselect();return true;}
  if(openMenu&&view==='game'){modal='pause';render();return true;}
  return false;
}
function selectEntity(id){cancelBuild();assigning=null;selected=id;selectionKey='';if($('#targeting-hint'))$('#targeting-hint').hidden=true;}
function toggleMap(){mapOpen=!mapOpen;$('#tactical-panel').hidden=!mapOpen;if(mapOpen){releaseCursor();cancelBuild();assigning=null;deselect();$('#targeting-hint').hidden=true;$('#shop').hidden=true;}syncControls();}
function focusMap(point){releaseCursor();cancelBuild();world.focusPoint={x:point.x,z:point.z};$('#return-camera').hidden=false;syncControls();}
function returnCamera(){world.focusPoint=null;$('#return-camera').hidden=true;syncControls();}
function toggleShop(){const shop=$('#shop');shop.hidden=!shop.hidden;if(!shop.hidden){releaseCursor();cancelBuild();assigning=null;deselect();$('#targeting-hint').hidden=true;mapOpen=false;$('#tactical-panel').hidden=true;updateShop(me());}}
function openCore(){const core=snapshot?.structures.find(s=>s.kind==='core'&&s.owner===viewerId);if(!core){toast('Construa seu núcleo primeiro.');return;}releaseCursor();returnCamera();selectEntity(core.id);mapOpen=false;$('#tactical-panel').hidden=true;renderSelection(core);}
const send=(type,data={})=>{if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type,...data}));else toast('Reconectando ao servidor…');};
const action=command=>send('action',{command});
const me=()=>snapshot?.units.find(u=>u.id===viewerId);
const host=()=>room?.hostId===clientId;
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3600);}
let audio;
function sound(type){if(!soundOn)return;try{audio??=new AudioContext();if(audio.state==='suspended')audio.resume();const osc=audio.createOscillator(),gain=audio.createGain();osc.connect(gain);gain.connect(audio.destination);const t=audio.currentTime;osc.type=['damage','swing','destroy'].includes(type)?'triangle':'sine';const freq={impact:100,'wisp-death':210,'wisp-trained':700,click:420,build:280,gather:640,damage:110,swing:85,repair:520,purchase:740,phase:180,stun:1150,shot:950,beam:1250,'legendary-tower':1450,'legendary-execute':55,death:75,destroy:65,complete:880}[type]||350;osc.frequency.setValueAtTime(freq,t);osc.frequency.exponentialRampToValueAtTime(Math.max(30,freq*.5),t+.16);gain.gain.setValueAtTime(type==='shot'||type==='beam'?.025:.055,t);gain.gain.exponentialRampToValueAtTime(.001,t+.22);osc.start(t);osc.stop(t+.23);}catch{}}
function connect(){
  const protocol=location.protocol==='https:'?'wss':'ws';ws=new WebSocket(`${protocol}://${location.host}`);
  ws.onopen=()=>send('hello',{name:nickname,token:sessionStorage.getItem('thornhold-token')});
  ws.onmessage=event=>{const msg=JSON.parse(event.data);switch(msg.type){
    case 'hello':clientId=msg.id;devMode=msg.devMode===true;sessionStorage.setItem('thornhold-token',msg.token);connected=true;$('#connection').classList.add('online');$('#connection').textContent='Servidor conectado';if(reconnecting&&!msg.roomId&&room){room=null;snapshot=null;result=null;viewerId=null;view='menu';hud.hidden=true;$('#labels').innerHTML='';cancelBuild();world.menuScene();toast('O servidor foi reiniciado ou a sala expirou. Crie uma nova expedição.');}else if(reconnecting)toast('Conexão restabelecida.');if(view==='menu')render();reconnecting=false;break;
    case 'lobby':room=msg.room;if(room.state===STATES.LOBBY){view='lobby';snapshot=null;result=null;viewerId=null;buildKind=null;hud.hidden=true;$('#labels').innerHTML='';if(!world.isMenu)world.menuScene();render();}else if(view==='lobby'){view='game';render();}break;
    case 'rooms':rooms=msg.rooms;if(view==='browser')render();break;
    case 'map':mouseLook.reset();world.start(msg.map);tactical=new TacticalMap(msg.map);mapOpen=false;exploredBases.clear();viewerId=msg.viewerId;view='game';modal=null;selected=null;buildKind=null;assigning=null;awaitingBuild=false;selectionKey='';snapshot=null;keys.clear();render();setupHUD();break;
    case 'snapshot':snapshot=msg.snapshot;devSpeed=snapshot.devSpeed||devSpeed;world.update(snapshot);for(const e of snapshot.events)if(e.id>lastSound){if(distance(me()||world.target,e)<35||e.type==='phase')sound(e.type);if(e.type==='impact'&&e.unit===viewerId)hitFeedback(e);if(['damage','gather','repair','purchase','build','upgrade','complete','destroy','dev-grant','resource','stun'].includes(e.type))floatFeedback(e);if(e.type==='stun')toast(e.unit===viewerId?'Troll atordoado por 3s · fuja!':'O Troll foi atordoado por 3s.');if(e.type==='relocation'&&e.unit===viewerId)toast(`Núcleo destruído · reassentamento gratuito por ${B.elf.relocationSeconds}s!`);if(e.type==='phase')toast(e.text);if(e.type==='resource'&&e.unit===viewerId)toast(`+${num(e.amount)} ${e.resource==='wood'?'madeira':'ouro'} · ${num(e.rate)}/min`);if(e.type==='dev-grant'&&e.unit===viewerId)toast(`Dev: +${num(e.gold)} ouro · +${num(e.wood)} madeira`);if(e.type==='cancel'&&e.unit===viewerId){selectionKey='';toast('Cancelado · recuperou '+num(e.gold)+' ouro e '+num(e.wood)+' madeira.');}if(e.type==='build'&&e.unit===viewerId&&awaitingBuild){awaitingBuild=false;if(!buildKind)selectEntity(e.entity);}if(e.type==='ping')toast(`${snapshot.units.find(u=>u.id===e.unit)?.name||'Aliado'}: ${e.text}`);lastSound=Math.max(lastSound,e.id);}break;
    case 'dev':devSpeed=msg.speed||devSpeed;if(msg.granted)toast(`Dev: +${num(msg.granted.gold)} ouro · +${num(msg.granted.wood)} madeira`);if(modal==='dev')render();break;
    case 'phase':if(msg.state===STATES.LOADING){view='loading';lastSound=0;render();}break;
    case 'result':result=msg.result;view='result';keys.clear();hud.hidden=true;$('#labels').innerHTML='';$('#combat-floats').innerHTML='';clearTimeout(toastTimer);clearTimeout(impactTimer);$('#toast').classList.remove('show');$('#toast').textContent='';if($('#combat-feedback')){$('#combat-feedback').hidden=true;$('#combat-feedback').textContent='';}$('#crosshair')?.classList.remove('confirmed');cancelBuild();modal=null;render();break;
    case 'left':room=null;snapshot=null;result=null;viewerId=null;view='menu';hud.hidden=true;$('#labels').innerHTML='';buildKind=null;keys.clear();world.menuScene();render();break;
    case 'pong':ping=Math.max(1,Date.now()-msg.sent);$('#connection').textContent=`${ping} ms · Servidor conectado`;break;
    case 'error':case 'actionError':awaitingBuild=false;toast(msg.message);break;
  }};
  ws.onclose=e=>{connected=false;$('#connection').classList.remove('online');$('#connection').textContent=e.code===4001?'Sessão aberta em outra janela':'Conexão perdida · tentando novamente';keys.clear();if(e.code!==4001){reconnecting=true;setTimeout(connect,1600);}};
  ws.onerror=()=>{};
}
function logo(){return `<a class="wordmark" href="#" data-do="home"><img src="/client/emblem.svg" alt="">THORNHOLD<span>PLAYTEST 01</span></a>`;}
function header(){return `<header>${logo()}<nav><button class="text-button" data-do="help">Como jogar <kbd>H</kbd></button><button class="icon-button" data-do="sound" aria-label="${soundOn?'Desativar':'Ativar'} áudio">${soundOn?'♪':'♫'}<span>${soundOn?'Som ligado':'Som desligado'}</span></button><span class="server-dot"></span><span class="server-name">${connected?'SERVIDOR ATIVO':'CONECTANDO'}</span></nav></header>`;}
function footer(){return `<footer><span>UMA FLORESTA. DUAS FORMAS DE SOBREVIVER.</span><span>3D · PVP ASSIMÉTRICO <i>◆</i> v0.1.0</span></footer>`;}
function render(){
  if(view!=='game'||modal)releaseCursor();
  document.body.classList.toggle('playing',view==='game');app.className=view==='game'&&!modal?'in-game':'';
  if(view==='game'){app.innerHTML=modal?modalHTML():'';hud.hidden=false;return;}
  let content='';
  if(view==='menu')content=`<main class="main-menu"><div class="eyebrow"><span class="small-line"></span> A ÚLTIMA CLAREIRA</div><h1>Erga seu refúgio.<br><em>Ou derrube todos.</em></h1><p class="intro">O anoitecer pertence ao Troll.<br>A floresta, a quem conseguir defendê-la.</p><div class="player-name"><span>SEU NOME</span><input id="nickname" aria-label="Seu nome" maxlength="22" value="${escape(nickname)}"><span class="edit-mark">✎</span></div><div class="main-actions"><button class="primary large" data-do="solo"><span>Jogar contra bots<small>Seu primeiro refúgio começa aqui</small></span><span class="arrow">↗</span></button><div class="action-pair"><button class="secondary" data-do="private">Criar sala privada <span>＋</span></button><button class="secondary" data-do="join-modal">Entrar com código <span>⌁</span></button></div><button class="online-button" data-do="browse"><span class="dot"></span> Explorar partidas online <span>→</span></button></div><div class="game-loop"><div><b>01</b><span>Explore</span></div><i></i><div><b>02</b><span>Fortifique</span></div><i></i><div><b>03</b><span>Sobreviva</span></div></div></main><aside class="world-caption"><span class="tag">O BOSQUE DESPERTO</span><p>Um gigante.<br>Doze possíveis refúgios.</p><div><span class="dot"></span> MAPA PROCEDURAL · CADA SEED, UMA NOVA CAÇADA</div></aside>`;
  if(view==='lobby')content=lobbyHTML();
  if(view==='browser')content=browserHTML();
  if(view==='loading')content=`<main class="loading"><img src="/client/emblem.svg" alt=""><div class="eyebrow">PREPARANDO A EXPEDIÇÃO</div><h1>A floresta toma forma.</h1><p>Gerando terreno, validando passagens e sincronizando jogadores.</p></main>`;
  if(view==='result')content=resultHTML();
  app.innerHTML=header()+content+footer()+(modal?modalHTML():'');
}
function difficultyOptions(value){return Object.entries(diffName).map(([k,v])=>`<option value="${k}" ${k===value?'selected':''}>${v}</option>`).join('');}
function modeOptions(value,local=false){return Object.entries(MATCH_MODES).filter(([key])=>!local||key==='custom').map(([key,item])=>`<option value="${key}" ${key===value?'selected':''}>${item.name}</option>`).join('');}
function slotHTML(s,index){
  const o=s.occupant,isMe=o?.clientId===clientId,troll=s.role==='troll';
  return `<div class="slot ${o?'occupied':''} ${s.closed?'closed':''} ${isMe?'mine':''}"><div class="slot-avatar ${troll?'troll-avatar':''}">${s.closed?'—':troll?'♜':String(index).padStart(2,'0')}</div><div class="slot-info"><b>${escape(o?.name||(s.closed?'Slot fechado':'Slot disponível'))}${isMe?'<span class="you">VOCÊ</span>':''}</b><span>${o?o.type==='bot'?'IA · MESMAS REGRAS':o.ready?'PRONTO PARA JOGAR':'AGUARDANDO READY':s.closed?'Não entra na partida':troll?'O caçador da floresta':'Convide um amigo ou adicione IA'}</span></div>${o?`<span class="ready-dot ${o.ready?'ready':''}" title="${o.ready?'Pronto':'Não pronto'}"></span>`:''}<div class="slot-actions">${o?.type==='bot'?`${host()?`<select aria-label="Dificuldade de ${escape(o.name)}" data-slot-difficulty="${s.id}" ${room.settings.mode==='custom'?'':'disabled'}>${difficultyOptions(o.difficulty)}</select><button title="Remover bot" aria-label="Remover ${escape(o.name)}" data-do="slot" data-slot="${s.id}" data-action="remove">×</button>`:`<small>${diffName[o.difficulty]}</small>`}`:''}${!s.closed&&(!o||o.type==='bot')&&room.settings.allowRoles?`<button class="small-button" data-do="slot" data-action="claim" data-slot="${s.id}">Ocupar</button>`:''}${host()&&!o&&!s.closed?`<button class="small-button" data-do="slot" data-action="bot" data-slot="${s.id}">+ Bot</button>`:''}${host()&&!o&&!troll?`<button title="${s.closed?'Abrir':'Fechar'} slot" aria-label="${s.closed?'Abrir':'Fechar'} slot ${index}" data-do="slot" data-slot="${s.id}" data-action="${s.closed?'open':'close'}">${s.closed?'+':'−'}</button>`:''}${host()&&!s.closed&&room.members.length>1?`<select class="move-player" aria-label="Mover jogador para ${s.role} ${index}" data-move="${s.id}"><option value="">Mover…</option>${room.members.map(m=>`<option value="${m.id}">${escape(m.name)}</option>`).join('')}</select>`:''}</div></div>`;
}
function lobbyHTML(){
  const mine=room.members.find(m=>m.id===clientId),filled=room.slots.filter(s=>s.occupant).length,locked=room.settings.mode!=='custom';
  return `<main class="lobby-page"><div class="page-heading"><div><button class="back" data-do="leave">← Sair da sala</button><div class="eyebrow">${room.settings.local?'PARTIDA LOCAL':room.settings.private?'EXPEDIÇÃO PRIVADA':'EXPEDIÇÃO PÚBLICA'} · ${modeName[room.settings.mode].toUpperCase()}</div><h1>${escape(room.name)}</h1><p>Escolha seu lado. A floresta fará o resto.</p></div><button class="invite" data-do="copy"><small>CÓDIGO DE CONVITE</small><b>${room.id}</b><span>Copiar link ↗</span></button></div><div class="lobby-layout"><section class="teams"><div class="section-label"><h2><span class="team-symbol">♜</span> O Troll</h2><span>1 CAÇADOR</span></div>${slotHTML(room.slots[0],0)}<div class="versus"><span></span> CONTRA <span></span></div><div class="section-label"><h2><span class="team-symbol elf-symbol">❧</span> Os Elfos</h2><span>${room.settings.elfSlots} ELFOS · 12 REFÚGIOS</span></div><div class="elf-slots">${room.slots.filter(s=>s.role==='elf'&&Number(s.id.slice(1))<room.settings.elfSlots).map((s,i)=>slotHTML(s,i+1)).join('')}</div><div class="bench"><span>${room.members.filter(m=>!room.slots.some(s=>s.occupant?.clientId===m.id)).map(m=>escape(m.name)+' (observador)').join(' · ')||'Bots usam os mesmos personagens, custos e habilidades.'}</span><button class="text-button" data-do="observe">Observar partida</button></div></section><aside class="settings-panel"><div class="section-label"><h2>A expedição</h2><span>◇</span></div><label>MODO<select data-setting="mode" ${host()?'':'disabled'}>${modeOptions(room.settings.mode,room.settings.local)}</select></label><p class="mode-note"><b>${modeName[room.settings.mode]}</b> · ${MATCH_MODES[room.settings.mode].description}${locked?' As regras abaixo estão bloqueadas pelo preset.':''}</p><label>SEED DO MUNDO<input id="seed" data-setting="seed" value="${escape(room.settings.seed)}" maxlength="40" ${host()&&room.settings.mode!=='ranked'?'':'disabled'}></label><div class="setting-grid"><label>ELFOS<select data-setting="elfSlots" ${host()&&!locked?'':'disabled'}>${Array.from({length:8},(_,i)=>`<option value="${i+1}" ${room.settings.elfSlots===i+1?'selected':''}>${i+1} ${i===0?'Elfo':'Elfos'}</option>`).join('')}</select></label><label>MAPA<select data-setting="mapSize" ${host()&&!locked?'':'disabled'}><option value="compact" ${room.settings.mapSize==='compact'?'selected':''}>Compacto</option><option value="large" ${room.settings.mapSize==='large'?'selected':''}>Amplo</option></select></label></div><label>PREPARAÇÃO<select data-setting="preparation" ${host()&&!locked?'':'disabled'}>${[20,35,50,75].map(v=>`<option value="${v}" ${v===room.settings.preparation?'selected':''}>${v}s + ajuste por Elfos</option>`).join('')}</select></label><label>DIFICULDADE PADRÃO<select data-setting="difficulty" ${host()&&!locked?'':'disabled'}>${difficultyOptions(room.settings.difficulty)}</select></label><label class="check"><input type="checkbox" data-setting="takeover" ${room.settings.takeover?'checked':''} ${host()&&!locked?'':'disabled'}> IA assume desconexões</label><label class="check"><input type="checkbox" data-setting="allowRoles" ${room.settings.allowRoles?'checked':''} ${host()&&!locked?'':'disabled'}> Escolha livre de papel</label><div class="rule-note"><span>✦</span><p><b>Uma entrada. Uma chance.</b>Cada clareira é validada pelo servidor para ter uma única passagem terrestre.</p></div><div class="lobby-network"><span class="dot"></span>${ping||'—'} ms · ${room.settings.region} · ${filled} participantes</div></aside></div><div class="lobby-bottom"><div><b>${room.errors.length?'Preparando a partida':'Todos a postos.'}</b><p>${escape(room.errors.join(' ')||'O host já pode iniciar a expedição.')}</p></div><div class="ready-actions"><button class="${mine?.ready?'ready-button':'secondary'}" data-do="ready">${mine?.ready?'✓ Estou pronto':'Marcar como pronto'}</button>${host()?`<button class="primary" data-do="start" ${room.errors.length?'disabled':''}>Iniciar expedição <span>→</span></button>`:'<span class="muted">Aguardando o host</span>'}</div></div></main>`;
}
let browserRegion='all',browserNotFull=true,browserPing=200;
function browserHTML(){
  const list=rooms.filter(r=>(browserRegion==='all'||r.region===browserRegion)&&(!browserNotFull||r.players<r.capacity)&&ping<=browserPing);
  return `<main class="browser-page"><button class="back" data-do="menu">← Voltar ao início</button><div class="page-heading"><div><div class="eyebrow">EXPEDIÇÕES EM REDE</div><h1>Encontre sua clareira.</h1><p>Salas públicas deste servidor. Convites privados entram pelo código.</p></div><button class="primary" data-do="quick">Jogar online · Normal →</button></div><div class="browser-filters"><label>REGIÃO<select id="region-filter"><option value="all">Todas</option>${['SA','NA','EU','AS'].map(v=>`<option ${v===browserRegion?'selected':''}>${v}</option>`).join('')}</select></label><label>PING MÁXIMO<select id="ping-filter">${[100,200,500,9999].map(v=>`<option value="${v}" ${v===browserPing?'selected':''}>${v===9999?'Qualquer':v+' ms'}</option>`).join('')}</select></label><label class="check"><input id="not-full" type="checkbox" ${browserNotFull?'checked':''}> Apenas vagas disponíveis</label><button class="secondary" data-do="refresh">↻ Atualizar</button><button class="secondary" data-do="public">+ Criar sala pública</button></div><div class="room-table"><div class="room-row table-head"><span>SALA</span><span>JOGADORES</span><span>REGIÃO / PING</span><span>ESTADO</span><span></span></div>${list.length?list.map(r=>`<div class="room-row"><b>${escape(r.name)}${r.password?' · 🔒':''}<small><span class="mode-badge mode-${r.mode}">${modeName[r.mode]||'Personalizado'}</span> · ${r.bots} bots</small></b><span>${r.players} / ${r.capacity}</span><span>${r.region} · ${ping||'—'} ms</span><span class="${r.state===STATES.LOBBY?'available':'muted'}">${r.state===STATES.LOBBY?'Aguardando':'Em partida'}</span><button class="small-button" data-do="join-room" data-code="${r.id}" data-password="${r.password}" ${r.state!==STATES.LOBBY||r.players>=r.capacity?'disabled':''}>Entrar →</button></div>`).join(''):`<div class="empty-state"><span>❧</span><h2>A floresta ainda está silenciosa.</h2><p>Crie a primeira sala ou use o modo Normal para preparar uma expedição.</p></div>`}</div><p class="network-note">O ping mede a conexão real com este servidor. Para jogar pela internet, os amigos devem abrir o endereço público do mesmo servidor.</p></main>`;
}
function resultHTML(){
  if(!result)return '';const win=result.winner==='troll',mvp=result.mvp;
  const reason=result.endReason==='army-eliminated'?'O exército dos Elfos foi eliminado.':win?'Todos os núcleos reivindicados foram destruídos.':'O gigante caiu. A floresta terá outro amanhecer.';
  const rows=[...(result.players||[])].sort((a,b)=>b.score-a.score).map((p,i)=>`<tr class="${p.id===mvp?.id?'mvp-row':''}"><td><span>${i+1}</span><b>${p.role==='troll'?'♜':'❧'} ${escape(p.name)}</b>${p.id===mvp?.id?'<em>MVP</em>':''}</td><td>${p.alive?'Sobreviveu':p.ghost?'Espírito':'Eliminado'}</td><td>${num(p.score)}</td><td>${p.kills}</td><td>${num(p.damage)}</td><td>${resource('gold',p.goldGenerated)} ${resource('wood',p.woodGenerated)}</td><td>${p.structuresBuilt}</td><td>${p.upgrades}</td><td>${p.stuns||0}</td></tr>`).join('');
  return `<main class="result-page"><div class="result-emblem">${win?'♜':'❧'}</div><div class="eyebrow">${win?'A FLORESTA SE CURVOU':'A CLAREIRA RESISTIU'}</div><h1>${win?'Vitória do Troll.':'Vitória dos Elfos.'}</h1><p>${reason}</p>${mvp?`<section class="mvp-card"><small>MVP DA PARTIDA</small><b>${mvp.role==='troll'?'♜':'❧'} ${escape(mvp.name)}</b><span>${num(mvp.score)} pontos · ${num(mvp.damage)} dano · ${mvp.kills} eliminações</span></section>`:''}<div class="result-summary"><div><small>DURAÇÃO</small><b>${clock(result.duration)}</b></div><div><small>ELIMINAÇÕES</small><b>${result.kills}</b></div><div><small>BASES ROMPIDAS</small><b>${result.basesDestroyed}</b></div><div><small>MELHORIAS</small><b>${result.upgrades}</b></div></div><div class="result-table-wrap"><table class="result-table"><thead><tr><th>Jogador</th><th>Status</th><th>Pontos</th><th>K</th><th>Dano</th><th>Recursos</th><th>Obras</th><th>Upgrades</th><th>Stuns</th></tr></thead><tbody>${rows}</tbody></table></div><div class="result-details"><span>Dano do Troll <b>${num(result.trollDamage)}</b></span><span>Dano das torres <b>${num(result.towerDamage)}</b></span><span>Ouro produzido <b>${resource('gold',result.produced)}</b></span><span>Maior renda <b>${resource('gold',result.highestIncome,{rate:'s'})}</b></span><span>Madeira produzida <b>${resource('wood',(result.players||[]).reduce((n,p)=>n+(p.woodGenerated||0),0))}</b></span><span>Estruturas destruídas <b>${result.destroyed}</b></span><span>Núcleos destruídos <b>${result.telemetry?.structuresDestroyed?.core||0}</b></span><span>Torres destruídas <b>${result.telemetry?.structuresDestroyed?.tower||0}</b></span><span>Elfos sobreviventes <b>${result.survivors}</b></span></div><p class="score-note">MVP é o maior placar do time vencedor. Pontos consideram dano, eliminações, recursos, construções, melhorias, reparos e stuns.</p><div class="result-actions">${host()?'<button class="primary" data-do="return">Revanche · voltar ao lobby →</button>':'<p>Aguardando o host retornar todos ao lobby.</p>'}<button class="secondary" data-do="leave">Sair</button></div><small class="muted">SEED ${escape(result.seed)} · A sessão permanece conectada para a próxima partida.</small></main>`;
}
function modalHTML(){
  if(modal==='help')return `<div class="modal-backdrop"><section class="modal help-modal" role="dialog" aria-modal="true" aria-label="Como jogar"><button class="modal-close" data-do="close" aria-label="Fechar">×</button><div class="eyebrow">GUIA DE CAMPO</div><h2>Sobreviver é uma escolha.</h2><div class="help-columns"><div><h3>❧ Como Elfo</h3><p>Encontre uma clareira, construa o <b>Núcleo</b> e feche a passagem com uma <b>Barricada</b>. Colete madeira, melhore a renda e posicione torres perto da entrada.</p><p>Clique em uma árvore ou estrutura para selecionar. Use <kbd>E</kbd> para coletar/construir e <kbd>R</kbd> para reparar. Após sua Barricada cair, aproxime-se do Troll e use <kbd>F</kbd> para atordoá-lo por 3 segundos e escapar. Se o Núcleo cair, você terá ${B.elf.relocationSeconds}s para correr até outra clareira e fundar um novo refúgio. Selecione o núcleo para formar e evoluir Wisps: eles colhem madeira automaticamente, um por árvore.</p></div><div><h3>♜ Como Troll</h3><p>Explore depois que o selo cair. Dano efetivo rende ouro. Escolha arma, proteção e relíquia na loja <kbd>B</kbd>; a aba Atributos permite evolução contínua. Torres punem exposição longa: recue e escolha seus alvos.</p><p><kbd>Q</kbd> golpe pesado · <kbd>Espaço</kbd> esquiva · <kbd>F</kbd> rugido, que interrompe torres próximas. Três acertos leves no mesmo alvo fortalecem o terceiro. Esquive para cancelar a preparação e aproveite 1,2 s de abertura.</p></div></div><div class="controls-grid"><span><kbd>W A S D</kbd> Mover</span><span><kbd>Shift</kbd> Correr</span><span><kbd>Mouse</kbd> Girar câmera e mirar</span><span><kbd>Bolinha do mouse</kbd> Liberar / prender cursor</span><span><kbd>M</kbd> Mapa tático</span><span><kbd>C</kbd> Voltar ao personagem</span><span><kbd>Scroll</kbd> Zoom</span><span><kbd>N</kbd> Núcleo / Wisps</span><span><kbd>U</kbd> Evoluir seleção</span><span><kbd>T</kbd> Formar Wisp no núcleo</span><span><kbd>Shift + clique</kbd> Repetir construção</span><span><kbd>Botão direito</kbd> Cancelar / fechar seleção</span><span><kbd>1–5</kbd> Construções</span><span><kbd>R</kbd> Girar projeto</span><span><kbd>G</kbd> Alternar snap</span><span><kbd>Esc</kbd> Cancelar / menu</span><span><kbd>F</kbd> Stun defensivo do Elfo</span><span><kbd>V</kbd> Sinalizar aliados</span><span><kbd>Tab</kbd> Trocar observado</span></div><p class="help-foot">Tier IV é liberado aos ${Math.round(B.finalAge/60*10)/10} minutos. Após ${Math.round(B.hungerAge/60*10)/10} minutos, o Troll perde vida se ficar sem causar dano. A evolução continua sem nível máximo. Custos crescem e ganhos de velocidade diminuem.</p><button class="primary" data-do="close">Entendido. Vamos à floresta.</button></section></div>`;
  if(modal==='pause')return `<div class="modal-backdrop"><section class="modal compact" role="dialog" aria-modal="true" aria-label="Menu da partida"><div class="eyebrow">EXPEDIÇÃO EM ANDAMENTO</div><h2>Menu da partida</h2><p>A partida online continua enquanto este menu está aberto.</p><button class="primary" data-do="close">Continuar</button><button class="secondary" data-do="help">Como jogar</button><label class="check"><input id="hud-hints" type="checkbox" ${showHints?'checked':''}> Dicas de comandos</label><button class="secondary" data-do="leave">Sair da partida</button></section></div>`;
  if(modal==='dev')return `<div class="modal-backdrop"><section class="modal compact dev-modal" role="dialog" aria-modal="true" aria-label="Menu dev"><div class="eyebrow">FERRAMENTAS DE DESENVOLVIMENTO</div><h2>Modo dev</h2><p>Somente disponível quando o servidor foi iniciado com <code>THORNHOLD_DEV=1</code>.</p><div class="dev-section"><span>RECURSOS</span><div class="dev-grid"><button data-do="dev-grant" data-gold="100">+100 ouro</button><button data-do="dev-grant" data-gold="1000">+1.000 ouro</button><button data-do="dev-grant" data-wood="100">+100 madeira</button><button data-do="dev-grant" data-wood="1000">+1.000 madeira</button></div></div><div class="dev-section"><span>VELOCIDADE · ${devSpeed}x</span><div class="dev-grid speed-grid">${[1,2,4,8].map(v=>`<button class="${v===devSpeed?'active':''}" data-do="dev-speed" data-speed="${v}">${v}x</button>`).join('')}</div></div><div class="dev-section"><span>DEBUG · F3</span><button class="debug-toggle ${debugCombat?'active':''}" data-do="debug-combat">${debugCombat?'✓':'○'} Combate: ${debugCombat?'visível':'oculto'} <kbd>F3</kbd></button></div><button class="secondary" data-do="close">Fechar <kbd>F10</kbd></button></section></div>`;
  if(modal==='join')return `<div class="modal-backdrop"><form id="join-form" class="modal compact" role="dialog" aria-modal="true" aria-label="Entrar com código"><button type="button" class="modal-close" data-do="close" aria-label="Fechar">×</button><div class="eyebrow">UMA FLORESTA ENTRE AMIGOS</div><h2>Entre na expedição.</h2><label>CÓDIGO DA SALA<input name="code" value="${escape(new URLSearchParams(location.search).get('room')||'')}" placeholder="X7KD92" required maxlength="6" autocomplete="off" style="text-transform:uppercase" autofocus></label><label>SENHA, SE NECESSÁRIO<input name="password" type="password" autocomplete="current-password" maxlength="64" placeholder="Sala sem senha"></label><button class="primary" type="submit">Entrar na sala →</button><p class="muted">O código é válido no servidor que você está acessando.</p></form></div>`;
  if(modal?.startsWith('create')){const solo=modal==='create-solo',pub=modal==='create-public',defaultMode=solo?'custom':'normal';return `<div class="modal-backdrop"><form id="create-form" class="modal compact" role="dialog" aria-modal="true" aria-label="Criar partida"><button type="button" class="modal-close" data-do="close" aria-label="Fechar">×</button><div class="eyebrow">${solo?'VOCÊ E A FLORESTA':pub?'ABERTA A VIAJANTES':'EXPEDIÇÃO ENTRE AMIGOS'}</div><h2>${solo?'Seu primeiro refúgio.':'Prepare a expedição.'}</h2><label>NOME DA SALA<input name="roomName" value="${escape(solo?'Minha clareira':nickname+' · Expedição')}" maxlength="32" required></label><label>MODO<select name="mode">${modeOptions(defaultMode,solo)}</select></label><p class="mode-note">Normal usa o preset oficial. Personalizado libera todas as regras. Ranqueado prepara as regras competitivas; MMR entra na etapa de filas.</p><div class="setting-grid"><label>SEU PAPEL<select name="role"><option value="elf">Elfo · Construir</option><option value="troll">Troll · Caçar</option></select></label><label>QUANTOS ELFOS<select name="elves">${[1,2,3,4,5,6,7,8].map(n=>`<option value="${n}" ${n===5?'selected':''}>${n} Elfos</option>`).join('')}</select></label></div><label>DIFICULDADE DOS BOTS<select name="difficulty">${difficultyOptions('normal')}</select></label>${!solo?'<label>SENHA OPCIONAL<input name="password" type="password" placeholder="Sem senha" maxlength="64" autocomplete="new-password"></label>':''}<label class="check"><input name="bots" type="checkbox" checked> Preencher espaços com bots</label><button class="primary" type="submit">Criar ${solo?'partida local':'sala'} →</button><p class="muted">No lobby, apenas o modo Personalizado permite alterar as regras.</p></form></div>`;}
  return '';
}
function saveName(){const input=$('#nickname');if(input)nickname=input.value.trim().slice(0,22)||'Viajante';localStorage.setItem('thornhold-name',nickname);send('name',{name:nickname});}
function setupHUD(){
  hud.hidden=false;hud.innerHTML=`<div class="hud-top"><div class="identity"><img src="/client/emblem.svg" alt=""><div><b id="role-name"></b><span id="player-title"></span></div></div><div class="phase-display"><span id="phase-name"></span><b id="match-clock"></b></div><div class="hud-menu-group"><button class="hud-menu" data-do="pause" aria-label="Abrir menu">☰ <kbd>ESC</kbd></button>${devMode?'<button class="hud-menu dev-button" data-do="dev" aria-label="Abrir menu dev">DEV <kbd>F10</kbd></button>':''}</div></div><div class="resource-bar" id="resource-bar"></div><div class="objective" id="objective"></div><div class="attack-alert" id="attack-alert" hidden>⚠ SUA BASE ESTÁ SOB ATAQUE</div><div class="build-hint" id="build-hint" hidden></div><div id="debug-overlay" class="debug-overlay" hidden></div><aside id="selection-panel" class="selection-panel" hidden></aside><aside id="shop" class="shop" hidden></aside><div class="hud-bottom"><div class="health-panel"><div><b id="hp-label"></b><span id="hp-value"></span></div><div class="health-track"><i id="health-fill"></i></div><span id="cooldown-info"></span></div><div id="hotbar" class="hotbar"></div><div class="minimap-wrap"><canvas id="minimap" width="176" height="176" aria-label="Mapa local e visão da equipe"></canvas><span>VISÃO DA EQUIPE</span></div></div><div class="control-hints" id="control-hints"></div><div id="context-action" class="context-action" hidden></div><div id="targeting-hint" class="targeting-hint" hidden></div><div class="hud-shortcuts"><button data-do="core" id="core-shortcut" title="Núcleo e Wisps">${icon('wisp')}<kbd>N</kbd></button><button data-do="map" title="Mapa tático">${icon('target')}<kbd>M</kbd></button><button data-do="help" title="Guia de comandos">?<kbd>H</kbd></button></div>`;
  hud.insertAdjacentHTML('beforeend',`<div id="crosshair" class="crosshair" aria-label="Mira central" hidden><i></i></div><div id="combat-feedback" class="combat-feedback" aria-live="off" hidden></div><div id="combo-meter" class="combo-meter" hidden></div><div id="cursor-mode" class="cursor-mode"></div><div id="status-effects" class="status-effects" aria-live="off"></div><aside id="live-scoreboard" class="live-scoreboard" aria-label="Placar ao vivo"></aside><div id="team-alerts" class="team-alerts" aria-label="Alertas da equipe"></div><button id="return-camera" class="return-camera" data-do="return-camera" hidden>Observando região · voltar ao personagem <kbd>C</kbd></button><section id="tactical-panel" class="tactical-panel" aria-label="Mapa tático" hidden><div class="map-heading"><div><span class="eyebrow">VISÃO COMPARTILHADA</span><h3>Mapa da expedição</h3></div><button data-do="map" aria-label="Fechar mapa">× <kbd>M</kbd></button></div><canvas id="tactical-map" width="520" height="520" aria-label="Clique para observar uma região; Shift e clique sinaliza perigo"></canvas><div class="map-legend"><span>● Você</span><span>● Aliado</span><span>◆ Troll</span><span>◌ Última visão · 12s</span></div><p>Clique: observar · Shift + clique: perigo<br>Botão direito: pedir ajuda · <kbd>C</kbd> voltar</p><div class="ping-actions"><button data-do="ping-here" data-kind="danger">! Perigo</button><button data-do="ping-here" data-kind="help">+ Ajuda</button><button data-do="ping-here" data-kind="look">◎ Atenção</button></div></section>`);
  hud.insertAdjacentHTML('beforeend',`<section id="ping-wheel" class="ping-wheel" hidden aria-label="Roda de comunicação"><b>COMUNICAÇÃO</b><button data-do="ping-here" data-kind="danger">! Perigo</button><button data-do="ping-here" data-kind="help">+ Ajuda</button><button data-do="ping-here" data-kind="attack">⚔ Atacar</button><button data-do="ping-here" data-kind="defend">⌂ Defender</button><button data-do="ping-here" data-kind="gold">◇ Ouro</button><button data-do="ping-here" data-kind="wood">♧ Madeira</button></section>`);
  $('#minimap').setAttribute('role','button');$('#minimap').tabIndex=0;$('#minimap').setAttribute('aria-label','Mapa: clique para observar; M amplia');
  $('.minimap-wrap>span').outerHTML='<button class="map-expand" data-do="map">AMPLIAR MAPA <kbd>M</kbd></button>';
  for(const id of ['minimap','tactical-map']){
    const c=$('#'+id);
    c.addEventListener('click',event=>{if(!snapshot)return;const p=tactical.point(c,event);if(event.shiftKey)action({type:'ping',kind:'danger',...p});else focusMap(p);});
    c.addEventListener('contextmenu',event=>{event.preventDefault();if(snapshot)action({type:'ping',kind:'help',...tactical.point(c,event)});});
    c.addEventListener('keydown',event=>{if(event.code==='Enter'){event.preventDefault();toggleMap();}});
  }
  selectionKey='';syncControls();
}
const remaining=(u,key)=>u.cooldowns[key]>snapshot.time?Math.ceil(u.cooldowns[key]-snapshot.time)+'s':'pronto';
function updateTacticalHUD(u){
  const target=snapshot.structures.find(s=>s.id===selected),effects=[...(u?.effects||[]),...(target?.effects||[]).map(e=>({...e,label:B.structures[target.kind].name+' · '+e.label}))];
  if(u?.role==='elf'){
    const disabled=snapshot.structures.filter(s=>s.owner===u.id&&s.id!==target?.id&&s.kind==='tower'&&s.effects?.length);
    if(disabled.length)effects.push({id:'silenced-allies',kind:'debuff',label:`${disabled.length} ${disabled.length===1?'torre desativada':'torres desativadas'}`,until:Math.max(...disabled.map(s=>s.disabledUntil)),detail:'Rugido do Troll · disparos interrompidos'});
  }
  $('#status-effects').innerHTML=effects.map(e=>`<div class="effect ${e.kind}" title="${escape(e.detail)}"><span>${e.kind==='debuff'?'▼':'✦'} ${escape(e.label)}</span><b>${e.until?Math.max(.1,e.until-snapshot.time).toFixed(1)+'s':'ATIVO'}</b><small>${escape(e.detail)}</small></div>`).join('');
  const owners=new Set();const alerts=(snapshot.alerts||[]).filter(a=>a.owner!==viewerId).filter(a=>{if(owners.has(a.owner))return false;owners.add(a.owner);return true;}).slice(0,3);
  const html=alerts.map(a=>`<button data-do="focus-alert" data-id="${escape(a.id)}"><b>⚠ ${escape(snapshot.units.find(u=>u.id===a.owner)?.name||'Aliado')} sob ataque</b><span>Clique para observar a região →</span></button>`).join('');
  if($('#team-alerts').innerHTML!==html)$('#team-alerts').innerHTML=html;
  if(u?.role==='elf'){const b=$('#hotbar [data-do="elf-stun"]'),status=snapshot.elfStun;if(b&&status){b.disabled=!status.available;b.title=status.reason;b.classList.toggle('ready',status.available);b.classList.toggle('cooling',status.readyAt>snapshot.time);let timer=b.querySelector('.skill-timer');if(!timer){timer=document.createElement('small');timer.className='skill-timer';b.append(timer);}timer.textContent=status.readyAt>snapshot.time?Math.ceil(status.readyAt-snapshot.time)+'s':'3s';}}
  if(u?.ghost){const b=$('#hotbar [data-do="ghost-reveal"]'),readyAt=u.cooldowns.ghostReveal||0;if(b){b.classList.toggle('cooling',readyAt>snapshot.time);let timer=b.querySelector('.skill-timer');if(!timer){timer=document.createElement('small');timer.className='skill-timer';b.append(timer);}timer.textContent=readyAt>snapshot.time?Math.ceil(readyAt-snapshot.time)+'s':'pronto';}}
  if(u?.role==='troll')for(const[key,task]of [['heavy','heavy'],['dash','dash'],['roar','roar']]){const b=$(`#hotbar [data-do="${task}"]`);if(b){let timer=b.querySelector('.skill-timer');if(!timer){timer=document.createElement('small');timer.className='skill-timer';b.append(timer);}timer.textContent=remaining(u,key);b.classList.toggle('cooling',u.cooldowns[key]>snapshot.time);}}
}
function updateHUD(){
  if(!snapshot||view!=='game')return;
  world.setCombatDebug(devMode&&debugCombat,snapshot);const debug=$('#debug-overlay');if(debug){const rows=(snapshot.debugTowers||[]).map(t=>`<div><b>${escape(t.id)}</b> · ${escape(t.target||'sem alvo')} · ${t.distance?.toFixed(1)||'—'} / ${t.maxRange?.toFixed(1)||'—'}m · ${escape(t.reason)}</div>`).join('');debug.hidden=!devMode||!debugCombat;debug.innerHTML=`<strong>COMBATE · TORRES</strong>${rows||'<div>Sem torres na partida</div>'}`;}
  const u=me(),ghost=!!u?.ghost,elf=u?.role==='elf',observer=!u||(!u.alive&&!ghost),prep=snapshot.state===STATES.PREP;
  $('#role-name').textContent=!u?'OBSERVADOR':ghost?'ESPÍRITO DA CLAREIRA':elf?'GUARDIÃO DA CLAREIRA':'TROLL DO BOSQUE';$('#player-title').textContent=u?.name||'Todos os bots · Tab para alternar';
  $('#phase-name').textContent=prep?'O SELO CAI EM':snapshot.time>B.hungerAge?'A ÚLTIMA CAÇADA':snapshot.time>B.finalAge?'ERA DO CERCO':'A CAÇADA COMEÇOU';$('#match-clock').textContent=clock(prep?Math.max(0,snapshot.preparation-snapshot.time):snapshot.time);
  $('#resource-bar').innerHTML=u?`<span class="gold" title="Ouro · +${(u.income||0).toFixed(1)}/s"><b>${resource('gold',u.gold)}</b>${elf?`<small>+${(u.income||0).toFixed(1)}/s</small>`:''}</span>${elf?`<button class="wood" data-do="core" title="Madeira · N abre o núcleo"><b>${resource('wood',u.wood)}</b><small>+${(u.woodIncome||0).toFixed(1)}/s</small></button>`:''}`:'<span>Observando</span>';
  $('#core-shortcut').hidden=!elf||ghost;
  const own=snapshot.structures.filter(s=>s.owner===viewerId),core=own.find(s=>s.kind==='core'),wall=own.find(s=>s.kind==='wall'),nearBase=world.map.bases.find(b=>distance(b,u||world.target)<13);
  const relocating=elf&&!core&&(u.relocationUntil||0)>snapshot.time;
  $('#objective').textContent=observer?'Observando a expedição. Pressione Tab para trocar de personagem.':ghost?'ESPÍRITO · F revela a área por 10s · R repara Barricadas a 50% · evite o Troll.':elf?!core?relocating?`REASSENTAMENTO GRÁTIS · ${Math.ceil(u.relocationUntil-snapshot.time)}s · Corra para outra clareira e construa um novo Núcleo.`:nearBase?`${nearBase.name} · ${nearBase.profile}, ${nearBase.capacity} árvores, ${nearBase.height>0?'+':''}${nearBase.height} m · Pressione 1 e coloque seu núcleo na clareira.`:'Explore uma clareira pelas trilhas. Depois, pressione 1 para construir o núcleo.':!wall?'Proteja a única entrada: pressione 2 e clique no portão iluminado.':`Núcleo T${core.tier} · Barricada T${wall.tier} · ${own.filter(s=>s.kind==='tower').length} torres. Selecione o núcleo para formar Wisps e automatizar madeira.`:prep?'O selo contém sua força. Os Elfos estão preparando seus refúgios.':'Procure atividade nas clareiras. Ataque para ganhar ouro; B abre suas melhorias.';
  const attacked=(snapshot.alerts||[]).filter(a=>a.owner===viewerId);$('#attack-alert').hidden=!elf||!attacked.length;$('#attack-alert').onclick=()=>{if(attacked[0])focusMap(attacked[0]);};
  $('#hp-label').textContent=observer?'EXPEDIÇÃO':ghost?'ESSÊNCIA':elf?'VITALIDADE':'FORÇA ANCESTRAL';$('#hp-value').textContent=u?`${num(u.hp)} / ${num(u.maxHp)}`:'';$('#health-fill').style.width=u?`${u.hp/u.maxHp*100}%`:'100%';
  $('#cooldown-info').textContent=observer?'Tab · trocar personagem':u.name;
  $('#objective').hidden=!relocating&&(!!selected||!!buildKind||!!assigning||!showHints||(!observer&&elf&&!!core&&!!wall)||(!elf&&!prep&&snapshot.time>snapshot.preparation+20));
  $('#combo-meter').hidden=elf||observer||!u?.combo;$('#combo-meter').textContent=u?.combo?'COMBO '+u.combo+'/3 · terceiro acerto +25%':'';
  const hotbarKey=(observer?'observer':ghost?'ghost':elf?'elf':'troll')+buildKind+(relocating?'-relocating':'');
  if($('#hotbar').dataset.key!==hotbarKey){$('#hotbar').dataset.key=hotbarKey;$('#hotbar').innerHTML=observer?'<button data-do="spectate"><kbd>TAB</kbd><span>Próximo</span></button>':ghost?`<button data-do="ghost-reveal" title="Revela inimigos e terreno em ${B.ghost.revealRadius}m por ${B.ghost.revealDuration}s"><kbd>F</kbd><b>${icon('reveal')}</b><span>Revelar</span><small>60s</small></button><button data-do="repair"><kbd>R</kbd><b>${icon('wall')}</b><span>Reparar</span><small>50%</small></button>`:elf?Object.entries(B.structures).map(([k,d],i)=>{const free=k==='core'&&relocating,mine=k==='mine';return `<button class="${buildKind===k?'active':''}" data-do="build" data-kind="${k}" title="${free?'Voucher de reassentamento: sem custo':mine?'Custo, vagas e produção escalam com o Núcleo':`${d.name}: ${d.gold} ouro, ${d.wood} madeira`}"><kbd>${i+1}</kbd><b>${icon(k)}</b><span>${d.name}</span><small>${free?'GRÁTIS':mine?'NÚCLEO':resourceCost(d)}</small></button>`;}).join('')+`<button data-do="elf-stun" title="Disponível após sua Barricada ser rompida"><kbd>F</kbd><b>${icon('stun')}</b><span>Atordoar</span><small>3s</small></button>`:`<button data-do="light"><kbd>CLIQUE</kbd><b>${icon('sword')}</b><span>Golpe</span></button><button data-do="heavy"><kbd>Q</kbd><b>${icon('heavy')}</b><span>Pesado</span></button><button data-do="dash"><kbd>ESPAÇO</kbd><b>${icon('dash')}</b><span>Esquiva</span></button><button data-do="roar"><kbd>F</kbd><b>${icon('roar')}</b><span>Rugido</span></button><button data-do="shop"><kbd>B</kbd><b>${icon('gold')}</b><span>Melhorias</span></button>`;}
  $('#control-hints').innerHTML=!$('#shop').hidden?'<kbd>B / ESC</kbd> fechar arsenal · A partida continua':buildKind?'<kbd>CLIQUE</kbd> construir · <kbd>SHIFT</kbd> repetir · <kbd>ESC / DIREITO</kbd> cancelar':assigning?'<kbd>CLIQUE</kbd> escolher árvore · <kbd>ESC / RMB</kbd> cancelar':`<kbd>WASD</kbd> mover · <kbd>SHIFT</kbd> correr${elf?' · <kbd>E</kbd> coletar · <kbd>R</kbd> reparar':''} · <kbd>M</kbd> mapa`;
  const selectedEntity=[...snapshot.structures,...snapshot.trees,...snapshot.units,...(snapshot.wisps||[])].find(e=>e.id===selected);if(selected&&!selectedEntity)deselect();const key=selectedEntity?selectionMarkup(selectedEntity,{u,snapshot,map:world.map}):'';
  if(key!==selectionKey){selectionKey=key;renderSelection(selectedEntity,key);}
  if(!$('#shop').hidden)updateShop(u);
  updateLiveScoreboard();
  tactical.update(snapshot,u);tactical.draw($('#minimap'),world.target);if(mapOpen)tactical.draw($('#tactical-map'),world.target);
  updateTacticalHUD(u);syncControls();
  updateContextAction(u);
  const labelEntities=[...snapshot.units.filter(a=>(a.alive||a.ghost)&&a.id!==viewerId),...snapshot.structures.filter(e=>e.id===selected||e.id===hoverTarget?.id||e.hp<e.maxHp||e.progress<1||e.upgrading),...(snapshot.wisps||[])];
  const labels=labelEntities.map(e=>{
    const p=world.entityPoint(e);if(!p.visible||p.x<0||p.x>innerWidth||p.y<0||p.y>innerHeight||distance(e,world.target)>34)return '';
    if(e.role==='wisp')return `<button class="wisp-label ${e.id===selected?'selected':''}" data-do="select-wisp" data-id="${e.id}" style="left:${p.x}px;top:${p.y}px" aria-label="Wisp nível ${e.level}, ${e.income.toFixed(1)} madeira por segundo">${icon('wisp')}<span>${e.readyAt>snapshot.time?'◷ '+Math.ceil(e.readyAt-snapshot.time)+'s':e.upgradingUntil>snapshot.time?'↑ '+Math.ceil(e.upgradingUntil-snapshot.time)+'s':e.income>0?'+'+e.income.toFixed(1)+'/s':'Pausado'}</span></button>`;
    return `<div data-label="${e.id}" class="world-label ${e.role==='troll'?'troll-label':''} ${e.id===selected?'selected':''}" style="left:${p.x}px;top:${p.y}px"><span>${escape(e.kind?B.structures[e.kind].name+' · '+e.tier:e.name)}</span><i><b style="width:${e.hp/e.maxHp*100}%"></b></i>${e.progress<1?'<small>'+Math.floor(e.progress*100)+'%</small>':''}${e.effects?.some(f=>f.id==='silenced')?'<small>DESATIVADA '+Math.ceil(e.effects.find(f=>f.id==='silenced').until-snapshot.time)+'s</small>':''}${e.effects?.some(f=>f.id==='stunned')?'<small>⚡ ATORDOADO '+Math.max(.1,e.effects.find(f=>f.id==='stunned').until-snapshot.time).toFixed(1)+'s</small>':''}</div>`;
  });
  if(assigning){const core=snapshot.structures.find(s=>s.kind==='core'&&s.owner===viewerId);if(core)for(const tree of freeTrees(snapshot,world.map,core)){const p=world.project(tree.x,heightAt(world.map,tree.x,tree.z)+2.6,tree.z);if(p.visible&&distance(tree,world.target)<34)labels.push(`<button class="tree-choice" data-do="target-tree" data-id="${tree.id}" style="left:${p.x}px;top:${p.y}px" aria-label="Vincular à árvore ${tree.id}">${icon('leaf')}${tree.rich?'+60%':'Vincular'}</button>`);}}
  syncWorldLabels(labels);
}
function syncWorldLabels(labels){
  const seen=new Set(),root=$('#labels'),template=document.createElement('template');
  for(const html of labels){
    if(!html)continue;template.innerHTML=html;const fresh=template.content.firstElementChild;
    const id=(fresh.dataset.label||fresh.dataset.id)+'/'+(fresh.dataset.do||'label');seen.add(id);let node=labelNodes.get(id);
    if(!node){node=fresh;labelNodes.set(id,node);}else{
      const held=node.matches(':hover,:focus-within');
      for(const attr of fresh.attributes)if(attr.name!=='style'||!held)node.setAttribute(attr.name,attr.value);
      if(node.innerHTML!==fresh.innerHTML)node.innerHTML=fresh.innerHTML;
    }
    if(node.parentElement!==root)root.append(node);
  }
  for(const[id,node]of labelNodes)if(!seen.has(id)){node.remove();labelNodes.delete(id);}
}
function retainPanel(panel,html){
  const scroll=panel.scrollTop,focus=panel.contains(document.activeElement)?document.activeElement:null;
  const identity=focus?.dataset,values=[...panel.querySelectorAll('select')].map(el=>[el.id,el.value]);
  const expanded=panel.querySelector('details')?.open;updatePanel(panel,html);panel.scrollTop=scroll;
  for(const[id,value]of values){const el=panel.querySelector('#'+id);if(el&&[...el.options].some(o=>o.value===value))el.value=value;}
  if(expanded&&panel.querySelector('details'))panel.querySelector('details').open=true;
  if(identity?.do){const target=[...panel.querySelectorAll('[data-do]')].find(el=>Object.entries(identity).every(([key,value])=>el.dataset[key]===value));target?.focus({preventScroll:true});}
}
function renderSelection(e,markup){
  const panel=$('#selection-panel');panel.hidden=!e||!!assigning;if(!e||assigning)return;
  retainPanel(panel,markup??selectionMarkup(e,{u:me(),snapshot,map:world.map}));
}
function updateShop(u){if(!u||u.role!=='troll')return;const shop=$('#shop'),key=JSON.stringify([shopTab,shopBuild,u.levels,u.equipment,u.inventory,Math.floor(u.gold),Math.floor(snapshot.time)]);if(shop.dataset.key===key)return;shop.dataset.key=key;retainPanel(shop,shopMarkup(u,snapshot.time,shopTab,shopBuild));}
function updateLiveScoreboard(){
  const panel=$('#live-scoreboard');if(!panel)return;
  const rows=(snapshot.scoreboard||[]).map((p,i)=>`<div class="${p.id===viewerId?'self':''} ${p.alive?'':'eliminated'}"><span>${i+1}</span><b>${p.role==='troll'?'♜':'❧'} ${escape(p.name)}</b><small>${p.kills} K · ${num(p.damage)} DMG</small><strong>${num(p.score)}</strong></div>`).join('');
  panel.innerHTML=`<header><span>PLACAR AO VIVO</span><small>PONTOS</small></header>${rows}`;
}
function hitFeedback(e){
  const el=$('#combat-feedback');if(!el)return;clearTimeout(impactTimer);el.hidden=false;el.className=e.broken?'combat-feedback breach':'combat-feedback';
  el.textContent=e.broken?'ENTRADA ROMPIDA':`${e.heavy?'PESADO · ':e.finisher?'COMBO · ':e.opening?'ABERTURA · ':''}${num(e.amount)}`;
  $('#crosshair')?.classList.add('confirmed');impactTimer=setTimeout(()=>{el.hidden=true;$('#crosshair')?.classList.remove('confirmed');},e.broken?1700:550);
}
function floatFeedback(e){
  const root=$('#combat-floats');if(!root||!Number.isFinite(e.x)||!Number.isFinite(e.z))return;
  const p=world.project(e.x,1.8,e.z);if(!p.visible)return;
  const el=document.createElement('div');el.className='combat-float';
  if(e.type==='damage'){el.textContent=`${e.entity===viewerId?'−':'+'}${num(e.amount)}`;if(e.entity===viewerId)el.classList.add('received');}
  else if(e.type==='gather')el.innerHTML=resource('wood',e.amount,{signed:true});
  else if(e.type==='repair')el.textContent=`+${num(e.amount)} HP`;
  else if(e.type==='purchase'||e.type==='build'||e.type==='upgrade')el.textContent='− recurso';
  else if(e.type==='dev-grant')el.innerHTML=resourceCost(e);
  else if(e.type==='resource')el.innerHTML=resource(e.resource,e.amount,{signed:true});
  else if(e.type==='stun'){el.textContent='ATORDOADO · 3s';el.classList.add('stun');}
  else if(e.type==='destroy')el.textContent='DESTRUÍDA';
  else if(e.type==='complete')el.textContent='CONCLUÍDA';
  el.style.left=p.x+'px';el.style.top=p.y+'px';root.append(el);setTimeout(()=>el.remove(),950);
}
function confirmBuild(repeat=false){if(!buildKind||!buildValid||awaitingBuild)return;awaitingBuild=true;action({type:'build',kind:buildKind,...buildPoint,rotation});if(!repeat)cancelBuild();}
function relocateWisp(id){assigning=id;releaseCursor();cancelBuild();mapOpen=false;$('#tactical-panel').hidden=true;$('#selection-panel').hidden=true;$('#targeting-hint').hidden=false;$('#targeting-hint').innerHTML='Escolha uma árvore livre <span>6s para vincular · Esc cancela</span>';selectionKey='';}
function assignTree(id){if(!assigning)return;action({type:'assignWisp',target:assigning,tree:id});assigning=null;$('#targeting-hint').hidden=true;selectionKey='';}
function quickAction(task){const button=$('#selection-panel [data-do="'+task+'"]');if(button&&!button.disabled)button.click();}
function contextEntity(explicit=false){
  const u=me();if(!u)return null;const all=[...snapshot.structures,...snapshot.trees,...snapshot.wisps];
  const inRange=e=>distance(e,u)<B.interactRange&&lineOfSight(world.map,u,e);
  const chosen=all.find(e=>e.id===selected);if(chosen&&(explicit||inRange(chosen)))return chosen;
  const hovered=all.find(e=>e.id===hoverTarget?.id);if(hovered&&inRange(hovered))return hovered;
  return all.filter(e=>inRange(e)&&(e.amount>0&&!snapshot.wisps.some(w=>w.treeId===e.id)||e.kind==='core'&&e.owner===u.id||e.kind&&e.progress<1)).sort((a,b)=>distance(a,u)-distance(b,u))[0];
}
function updateContextAction(u){
  const panel=$('#context-action');panel.hidden=true;hoverTarget=null;
  if((!u?.alive&&!u?.ghost)||u.role!=='elf'||selected||buildKind||assigning||mapOpen||world.focusPoint||modal)return;
  hoverTarget=world.pick(lastMouse.x,lastMouse.y,viewerId);const e=contextEntity();if(!e||distance(e,u)>B.interactRange||!lineOfSight(world.map,u,e))return;
  const linked=e.amount!==undefined&&snapshot.wisps.some(w=>w.treeId===e.id);
  const text=e.role==='wisp'||linked?'Gerenciar Wisp':e.amount>0?'Coletar madeira':e.progress<1?'Ajudar construção':e.kind==='core'?'Gerenciar núcleo':e.hp<e.maxHp?'Reparar':null;if(!text)return;
  panel.hidden=false;panel.innerHTML='<kbd>E</kbd> '+text+(e.amount>0&&!linked?'<small>segure para continuar</small>':'');
}
function chooseBuild(kind){if(world.focusPoint)returnCamera();if(mapOpen)toggleMap();const u=me();if(!u?.alive||u.role!=='elf')return;assigning=null;$('#targeting-hint').hidden=true;stopInput();buildKind=buildKind===kind?null:kind;rotation=0;selected=null;$('#selection-panel').hidden=true;if(!buildKind)world.ghostAt(null,null);updateBuildPreview();}
function updateBuildPreview(){
  if(!buildKind||!snapshot){world.ghostAt(null,null);world.setConstructionRange(me(),false);if($('#build-hint'))$('#build-hint').hidden=true;return;}
  const p=world.groundPoint(lastMouse.x,lastMouse.y),u=me();if(!p||!u)return;
  world.setConstructionRange(u,true);
  buildPoint={x:p.x,z:p.z};if(snap){buildPoint.x=Math.round(p.x/world.map.cell)*world.map.cell;buildPoint.z=Math.round(p.z/world.map.cell)*world.map.cell;}
  let b=baseAt(world.map,buildPoint);
  if(buildKind==='wall'){b=[...world.map.bases].sort((a,b)=>distance(a.gate,p)-distance(b.gate,p))[0];if(distance(b.gate,p)<7){buildPoint={x:b.gate.x,z:b.gate.z};rotation=b.gate.axis==='x'?Math.PI/2:0;}}
  const def=B.structures[buildKind],cell=toCell(world.map,buildPoint),core=snapshot.structures.find(s=>s.kind==='core'&&s.baseId===b?.id),cost=buildKind==='mine'?mineEconomy(core?.tier).cost:def;
  let reason='Clique para construir';buildValid=true;const invalid=text=>{buildValid=false;reason=text;};const buildDistance=distance(u,buildPoint);
  if(buildDistance>B.interactRange)invalid(`Fora do alcance do Elfo · ${buildDistance.toFixed(1)} m / ${B.interactRange.toFixed(1)} m`);
  else if(!b||!walkable(world.map,cell.x,cell.z)||!lineOfSight(world.map,u,buildPoint))invalid('Terreno bloqueado ou sem linha de visão');
  else if(!flatGround(world.map,buildPoint.x,buildPoint.z,def.radius))invalid('Escolha uma área plana para a fundação');
  else if([[def.radius,0],[-def.radius,0],[0,def.radius],[0,-def.radius],[def.radius*.7,def.radius*.7],[-def.radius*.7,def.radius*.7],[def.radius*.7,-def.radius*.7],[-def.radius*.7,-def.radius*.7]].some(([x,z])=>{const edge=toCell(world.map,{x:buildPoint.x+x,z:buildPoint.z+z});return !walkable(world.map,edge.x,edge.z);}))invalid('A fundação colide com a rocha');
  else if(buildKind==='wall'&&distance(b.gate,buildPoint)>.45)invalid('Use a passagem iluminada');
  else if(buildKind==='wall'&&(snapshot.breaches?.[b.id]||0)>snapshot.time)invalid('Entrada rompida: reconstrução em '+Math.ceil(snapshot.breaches[b.id]-snapshot.time)+'s');
  else if(buildKind==='core'&&(core||snapshot.structures.some(s=>s.kind==='core'&&s.owner===u.id)))invalid('A clareira ou seu núcleo já está ocupado');
  else if(buildKind==='core'&&(snapshot.reclaims?.[b.id]||0)>snapshot.time)invalid('Clareira em colapso: aguarde '+Math.ceil(snapshot.reclaims[b.id]-snapshot.time)+'s');
  else if(buildKind!=='core'&&!core)invalid('Esta clareira precisa de um núcleo ativo');
  else if(buildKind!=='core'&&!snapshot.units.some(a=>a.id===core.owner&&a.alive))invalid('O proprietário desta clareira foi eliminado');
  else if(buildKind==='mine'&&snapshot.structures.filter(s=>s.baseId===b.id&&s.kind==='mine').length>=mineEconomy(core?.tier).capacity)invalid(`Núcleo nível ${(core?.tier||1)+1} necessário para outra Mina`);
  else if(!(buildKind==='core'&&(u.relocationVouchers||0)>0&&(u.relocationUntil||0)>snapshot.time)&&(u.gold<cost.gold||u.wood<cost.wood))invalid('Recursos insuficientes');
  else if(buildKind!=='wall'&&distance(buildPoint,b.gate)<B.construction.gateClearance)invalid('Mantenha a entrada livre');
  else if(distance(u,buildPoint)<def.radius+.45&&buildKind!=='wall')invalid('Afaste-se da fundação');
  else if(snapshot.units.some(a=>a.alive&&a.role==='troll'&&distance(a,buildPoint)<B.construction.enemyClearance))invalid('O Troll está perto demais');
  else if(snapshot.units.some(a=>a.alive&&a.id!==u.id&&distance(a,buildPoint)<def.radius+.7))invalid('Um personagem ocupa o local');
  else if(snapshot.structures.filter(s=>s.baseId===b.id&&s.kind===buildKind).length>=B.construction.limits[buildKind])invalid('Limite desta estrutura nesta clareira atingido');
  else if(snapshot.structures.some(s=>distance(s,buildPoint)<B.structures[s.kind].radius+def.radius+.3)||snapshot.trees.some(t=>t.amount>0&&distance(t,buildPoint)<def.radius+.55))invalid('Espaço ocupado');
  world.ghostAt(buildKind,buildPoint,buildValid,rotation);const hint=$('#build-hint');hint.hidden=false;hint.classList.toggle('invalid',!buildValid);hint.innerHTML=`<b>${buildValid?'✓ VÁLIDO':'✕ NÃO PODE CONSTRUIR'}</b> <span>${reason}</span><small>${def.name} · ${resourceCost(cost)} · ${buildDistance.toFixed(1)} m / ${B.interactRange.toFixed(1)} m · Enter confirmar · Shift girar · Esc cancelar</small>`;
}
function cancelBuild(){buildKind=null;world.ghostAt(null,null);world.setConstructionRange(me(),false);if($('#build-hint'))$('#build-hint').hidden=true;}
function interact(type){
  if(!snapshot||world.focusPoint||assigning||buildKind)return;const e=contextEntity(!!type),u=me();if(!e||!u||u.role!=='elf')return;
  if(distance(e,u)>B.interactRange||!lineOfSight(world.map,u,e)){toast('Aproxime-se do alvo.');keys.delete('KeyE');keys.delete('KeyR');return;}
  if(!type){const linked=snapshot.wisps.find(w=>w.treeId===e.id);if(e.role==='wisp'||linked){selectEntity((linked||e).id);releaseCursor();return;}if(e.kind==='core'&&e.progress===1){openCore();return;}}
  const task=type||(e.amount!==undefined?'gather':e.progress<1?'assist':'repair');if(task==='repair'&&e.hp>=e.maxHp)return;action({type:task,target:e.id});
}
function spectate(){const options=snapshot?.units.filter(u=>u.alive)||[],current=options.findIndex(u=>u.id===world.followId);world.followId=options[(current+1)%options.length]?.id;returnCamera();}
function strike(heavy=false){const u=me();if(!u?.alive||u.role!=='troll'||world.focusPoint||mapOpen||snapshot.state===STATES.PREP)return;const target=world.groundPoint(lastMouse.x,lastMouse.y),yaw=mouseLook.locked?-world.yaw:target?Math.atan2(target.x-u.x,target.z-u.z):-world.yaw;world.previewSwing(u.id,heavy);action({type:'attack',heavy,yaw});}

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-do]');if(!button||button.disabled)return;sound('click');const task=button.dataset.do;
  switch(task){
    case 'home':event.preventDefault();if(!room){view='menu';modal=null;render();}break;
    case 'menu':view='menu';render();break;
    case 'solo':saveName();modal='create-solo';render();break;
    case 'private':saveName();modal='create-private';render();break;
    case 'public':modal='create-public';render();break;
    case 'join-modal':saveName();modal='join';render();break;
    case 'browse':saveName();view='browser';send('list');render();break;
    case 'refresh':send('list');break;
    case 'quick':send('quick',{region:browserRegion==='all'?'SA':browserRegion});break;
    case 'join-room':if(button.dataset.password==='true'){modal='join';render();$('#join-form [name=code]').value=button.dataset.code;}else send('join',{code:button.dataset.code});break;
    case 'close':modal=null;render();break;
    case 'help':modal='help';keys.clear();render();break;
    case 'sound':soundOn=!soundOn;localStorage.setItem('thornhold-sound',soundOn?'on':'off');render();break;
    case 'leave':modal=null;send('leave');break;
    case 'slot':send('slot',{slot:button.dataset.slot,action:button.dataset.action});break;
    case 'observe':send('observe');break;
    case 'ready':send('ready',{ready:!room.members.find(m=>m.id===clientId)?.ready});break;
    case 'start':send('start');break;
    case 'return':send('return');break;
    case 'copy':try{await navigator.clipboard.writeText(`${location.origin}/?room=${room.id}`);toast('Link de convite copiado. O amigo deve conseguir acessar este servidor.');}catch{toast('Código da sala: '+room.id);}break;
    case 'pause':modal='pause';keys.clear();render();break;
    case 'dev':if(devMode&&view==='game'){modal='dev';keys.clear();render();}break;
    case 'dev-grant':if(devMode)send('dev',{command:'grant',gold:Number(button.dataset.gold)||0,wood:Number(button.dataset.wood)||0});break;
    case 'dev-speed':if(devMode)send('dev',{command:'speed',speed:Number(button.dataset.speed)});break;
    case 'debug-combat':if(devMode){debugCombat=!debugCombat;render();}break;
    case 'build':chooseBuild(button.dataset.kind);break;
    case 'gather':interact('gather');break;
    case 'repair':interact('repair');break;
    case 'assist':interact('assist');break;
    case 'upgrade':action({type:'upgrade',target:selected,branch:$('#branch')?.value});break;
    case 'shop':toggleShop();break;
    case 'shop-tab':shopTab=button.dataset.tab;updateShop(me());break;
    case 'shop-build':shopBuild=button.dataset.build;updateShop(me());break;
    case 'buy-item':action({type:'buyItem',item:button.dataset.item});break;
    case 'equip-item':action({type:'equipItem',item:button.dataset.item});break;
    case 'train-wisp':action({type:'trainWisp',target:button.dataset.core});break;
    case 'core':openCore();break;
    case 'upgrade-wisp':action({type:'upgradeWisp',target:button.dataset.id});break;
    case 'cancel-job':action({type:'cancelJob',target:button.dataset.id});break;
    case 'deselect':deselect();break;
    case 'locate':{const target=snapshot.wisps.find(w=>w.id===button.dataset.id);if(target)focusMap(target);break;}
    case 'relocate-wisp':relocateWisp(button.dataset.id);break;
    case 'target-tree':assignTree(button.dataset.id);break;
    case 'assign-wisp':action({type:'assignWisp',target:button.dataset.id,tree:$('#wisp-tree')?.value});break;
    case 'select-wisp':selectEntity(button.dataset.id);releaseCursor();break;
    case 'map':toggleMap();break;
    case 'return-camera':returnCamera();break;
    case 'focus-alert':{const alert=(snapshot.alerts||[]).find(a=>a.id===button.dataset.id);if(alert)focusMap(alert);break;}
    case 'ping-here':action({type:'ping',kind:button.dataset.kind,...(world.focusPoint||{})});if($('#ping-wheel'))$('#ping-wheel').hidden=true;break;
    case 'buy':action({type:'buy',key:button.dataset.key});break;
    case 'light':strike();break;
    case 'heavy':strike(true);break;
    case 'dash':action({type:'dash'});break;
    case 'roar':action({type:'roar'});break;
    case 'elf-stun':action({type:'elfStun'});break;
    case 'ghost-reveal':action({type:'ghostReveal'});break;
    case 'spectate':spectate();break;
  }
});
document.addEventListener('submit',event=>{
  event.preventDefault();const form=event.target,data=new FormData(form);
  if(form.id==='join-form'){send('join',{code:data.get('code'),password:data.get('password')});modal=null;}
  if(form.id==='create-form'){const local=modal==='create-solo';send('create',{name:data.get('roomName'),role:data.get('role'),password:data.get('password')||'',fillBots:data.has('bots'),settings:{mode:data.get('mode'),local,private:modal!=='create-public',elfSlots:Number(data.get('elves')),difficulty:data.get('difficulty')}});modal=null;}
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.id==='hud-hints'){showHints=el.checked;localStorage.setItem('thornhold-hints',showHints?'on':'off');syncControls();}
  if(el.dataset.setting)send('settings',{settings:{[el.dataset.setting]:el.type==='checkbox'?el.checked:['elfSlots','preparation'].includes(el.dataset.setting)?Number(el.value):el.value}});
  if(el.dataset.slotDifficulty)send('slot',{slot:el.dataset.slotDifficulty,action:'difficulty',difficulty:el.value});
  if(el.dataset.move&&el.value)send('slot',{slot:el.dataset.move,action:'move',clientId:el.value});
  if(el.id==='region-filter'){browserRegion=el.value;render();}if(el.id==='ping-filter'){browserPing=Number(el.value);render();}if(el.id==='not-full'){browserNotFull=el.checked;render();}
});
addEventListener('keydown',e=>{
  if(e.code==='Escape'){e.preventDefault();e.target.blur?.();cancelContext(true);return;}
  if(suppressedKeys.has(e.code))return;
  if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
  if(e.code==='KeyH'&&!e.repeat){modal=modal==='help'?null:'help';keys.clear();render();return;}
  if(e.code==='F10'&&!e.repeat&&devMode&&view==='game'){modal=modal==='dev'?null:'dev';keys.clear();render();return;}
  if(e.code==='F3'&&!e.repeat&&devMode&&view==='game'){debugCombat=!debugCombat;toast(`Debug de combate ${debugCombat?'ativado':'desativado'}.`);return;}
  if(view!=='game'||modal)return;
  if(e.code==='KeyM'&&!e.repeat){toggleMap();return;}
  if(e.code==='KeyC'&&!e.repeat){returnCamera();return;}
  if(e.code==='KeyB'&&!e.repeat&&me()?.role==='troll'){toggleShop();return;}
  if(e.code==='KeyN'&&!e.repeat&&me()?.role==='elf'){openCore();return;}
  if(e.code==='KeyV'&&!e.repeat){const wheel=$('#ping-wheel');if(wheel){wheel.hidden=!wheel.hidden;if(!wheel.hidden)releaseCursor();}return;}
  if(e.code==='Tab'){if(!me()||(!me().alive&&!me().ghost)){e.preventDefault();spectate();}else if(mouseLook.locked){e.preventDefault();releaseCursor();$('#hotbar button')?.focus();}return;}
  if(e.code==='Space'&&e.target.closest('button'))return;
  if(['Space','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();
  if(mapOpen||world.focusPoint||!$('#shop').hidden)return;
  if(e.code==='KeyU'&&!e.repeat){e.preventDefault();quickAction(snapshot.wisps.some(w=>w.id===selected)?'upgrade-wisp':'upgrade');return;}
  if(e.code==='KeyT'&&!e.repeat){e.preventDefault();quickAction('train-wisp');return;}
  if(e.code==='Space'&&e.target.closest('button'))return;
  keys.add(e.code);if(e.repeat)return;
  const kinds=Object.keys(B.structures);if(/^Digit[1-5]$/.test(e.code))chooseBuild(kinds[Number(e.code.slice(-1))-1]);
  if(e.code==='Enter'&&buildKind&&buildValid){e.preventDefault();confirmBuild(e.shiftKey);}
  if(e.code==='KeyR'){if(buildKind)rotation+=Math.PI/2;else if(me()?.role==='elf')interact('repair');}
  if(e.code==='KeyG'&&buildKind)snap=!snap;
  if(e.code==='KeyE')interact();if(e.code==='KeyQ')strike(true);if(e.code==='Space'&&me()?.role==='troll')action({type:'dash'});if(e.code==='KeyF')action({type:me()?.ghost?'ghostReveal':me()?.role==='elf'?'elfStun':'roar'});
});
addEventListener('keyup',e=>{keys.delete(e.code);suppressedKeys.delete(e.code);});addEventListener('blur',()=>{keys.clear();suppressedKeys.clear();releaseCursor();});
// Prevent native auto-scroll before the middle click toggles cursor control.
addEventListener('pointerdown',e=>{
  if(view!=='game'||e.button!==1)return;e.preventDefault();
  if(modal)return;
  if(mouseLook.locked)releaseCursor();else{if(mapOpen)toggleMap();if(world.focusPoint)returnCamera();$('#shop').hidden=true;mouseLook.capture();}
},true);
addEventListener('auxclick',e=>{if(view==='game'&&e.button===1)e.preventDefault();});
document.addEventListener('contextmenu',e=>{if(view!=='game'||e.target.closest('#minimap,#tactical-map'))return;e.preventDefault();cancelContext(false);});
canvas.addEventListener('pointerdown',e=>{
  if(view!=='game'||modal||mapOpen||world.focusPoint)return;
  if(e.button!==0)return;
  if(!mouseLook.locked&&!mouseLook.started&&!buildKind&&!assigning){mouseLook.capture();return;}
  if(assigning){const target=world.pick(lastMouse.x,lastMouse.y,viewerId);if(target?.amount!==undefined)assignTree(target.id);return;}
  if(buildKind){if(buildValid)confirmBuild(e.shiftKey);else toast($('#build-hint span').textContent);}
  else{const target=world.pick(lastMouse.x,lastMouse.y,viewerId);selectEntity(target?.id||null);if(me()?.role==='troll'){keys.add('Mouse0');strike();}}
});
addEventListener('pointerup',e=>{if(e.button===0)keys.delete('Mouse0');});
addEventListener('pointermove',e=>{
  if(mouseLook.move(e)){lastMouse={x:innerWidth/2,y:innerHeight/2};return;}
  lastMouse={x:e.clientX,y:e.clientY};
});
canvas.addEventListener('wheel',e=>{if(view==='game'){e.preventDefault();world.zoom=Math.max(5,Math.min(23,world.zoom+e.deltaY*.01));}},{passive:false});
setInterval(()=>{
  if(!snapshot||view!=='game')return;const u=me();if(!u?.alive&&!u?.ghost)return;let x=0,z=0;
  const playing=!modal&&!mapOpen&&!world.focusPoint&&!assigning&&$('#shop').hidden;
  if(playing){const forward=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),side=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);x=-Math.sin(world.yaw)*forward-Math.cos(world.yaw)*side;z=Math.cos(world.yaw)*forward-Math.sin(world.yaw)*side;}
  send('input',{x,z,sprint:keys.has('ShiftLeft')||keys.has('ShiftRight'),...(mouseLook.locked?{yaw:-world.yaw}:{})});
  if(playing&&keys.has('KeyE')&&Math.floor(performance.now()/50)%8===0)interact();if(playing&&keys.has('KeyR')&&!buildKind&&Math.floor(performance.now()/50)%12===0)interact('repair');
  if(playing&&keys.has('Mouse0'))strike();
},50);
setInterval(()=>{if(connected){send('ping',{sent:Date.now()});if(view==='browser')send('list');}},3000);
function frame(t){world.render(t,viewerId,selected);if(t-lastHud>160){updateHUD();lastHud=t;}if(buildKind)updateBuildPreview();requestAnimationFrame(frame);}
render();connect();requestAnimationFrame(frame);
if(new URLSearchParams(location.search).has('room')){modal='join';render();}
