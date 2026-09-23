import { BALANCE as B, distance, income, upgradeCost, wispCost, wispUpgradeCost, wispIncome } from '../shared/config.js';
import { baseAt } from '../shared/map.js';
import { icon } from './icons.js';

const number=n=>Math.floor(n||0).toLocaleString('pt-BR');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const price=c=>`${number(c.gold)} ◇ <span>${number(c.wood)} ♧</span>`;
const meter=(value,label)=>`<div class="job-meter"><span>${label}</span><i><b style="width:${Math.max(0,Math.min(100,value*100))}%"></b></i></div>`;
export function freeTrees(snapshot,map,core){return snapshot.trees.filter(t=>t.amount>0&&distance(t,core)<=B.wisps.range&&(baseAt(map,t)?.id===core.baseId||t.rich)&&!snapshot.wisps.some(w=>w.treeId===t.id));}
function cancel(e,u,time,near=true){return e.owner===u?.id&&e.refund?`<button class="cancel-job" data-do="cancel-job" data-id="${e.id}" ${!near||time-e.lastHit<5?'disabled':''} title="Recupera 75% do investimento ainda não executado. Bloqueado por 5 s após dano.">Cancelar ${e.role==='wisp'&&e.readyAt>time?'formação':e.progress<1?'obra':'melhoria'} <span>+${price(e.refund)}</span></button>`:'';}
function header(name,type,symbol){return `<div class="selection-heading"><div class="selection-emblem">${icon(symbol)}</div><div><small>${type}</small><h3>${name}</h3></div><button class="panel-close" data-do="deselect" aria-label="Fechar seleção" title="Esc ou botão direito">${icon('close')}</button></div>`;}
export function selectionMarkup(e,{u,snapshot,map}){
  const own=e.owner===u?.id,near=!!u&&distance(e,u)<=B.interactRange,time=snapshot.time;
  if(e.amount!==undefined){
    const w=snapshot.wisps.find(w=>w.treeId===e.id);
    return header('Árvore de seiva',e.rich?'BOSQUE EXTERNO':'CLAREIRA','leaf')+`<div class="selection-stats"><b>${number(e.amount)} <small>madeira</small></b>${e.rich?'<span>Wisp +60%</span>':''}</div>`+(w?`<button class="command-primary" data-do="select-wisp" data-id="${w.id}">${icon('wisp')} Wisp Nv. ${w.level}<span>+${w.income.toFixed(1)}/s</span></button>`:e.amount>0?`<button class="command-primary" data-do="gather" ${!near||u?.role!=='elf'?'disabled':''}>${icon('wood')} Coletar <kbd>E</kbd></button><small class="context-note">${near?'Segure E para continuar.':'Aproxime-se para coletar.'}</small>`:`<p>Rebrote ${Math.max(0,Math.ceil((e.regrowAt||time+35)-time))}s · aguarda espaço livre.</p>`);
  }
  if(e.role==='wisp')return wispMarkup(e,{u,snapshot,map});
  if(!e.kind)return header(escape(e.name),e.role==='troll'?'TROLL':'ELFO',e.role==='troll'?'heavy':'leaf')+`<p>${number(e.hp)} / ${number(e.maxHp)} vida</p>${u?.role==='elf'&&e.role==='elf'&&e.id!==u.id?'<button class="command-secondary" data-do="transfer">Enviar 25 ouro + 10 madeira</button>':''}`;
  const cost=upgradeCost(e),ready=e.progress===1,locked=e.tier===3&&time<B.finalAge;
  let html=header(B.structures[e.kind].name,`${own?'SUA BASE':u?.role==='troll'?'INIMIGO':'ALIADO'} · NV. ${e.tier}`,e.kind);
  html+=`<div class="selection-stats"><b>${number(e.hp)} <small>/ ${number(e.maxHp)} HP</small></b>${income(e)?`<span>+${income(e).toFixed(1)} ◇/s</span>`:''}</div><div class="target-health"><i style="width:${e.hp/e.maxHp*100}%"></i></div>`;
  if(!ready){html+=meter(e.progress,`Construindo · ${Math.floor(e.progress*100)}%`)+`<small class="context-note">${near?'Permaneça perto para concluir.':'Aproxime-se para continuar a obra.'}</small>${u?.role==='elf'?'<button class="command-secondary" data-do="assist">Ajudar <kbd>E</kbd></button>':''}`;}
  else if(u?.role==='elf'){
    if(e.hp<e.maxHp)html+=`<button class="command-secondary" data-do="repair" ${near?'':'disabled'}>Reparar <span>3 ◇ · 1 ♧ <kbd>R</kbd></span></button>`;
    if(own){
      if(e.upgrading)html+=meter(1-e.upgrading/e.upgradeDuration,`Evoluindo · ${Math.ceil(e.upgrading)}s`);
      else html+=`<button class="command-primary" data-do="upgrade" ${!near||locked||u.gold<cost.gold||u.wood<cost.wood?'disabled':''}>${icon('upgrade')} Nível ${e.tier+1}<span>${locked?Math.ceil(B.finalAge-time)+'s':price(cost)} <kbd>U</kbd></span></button>`;
      if(e.kind==='tower')html+=`<label class="branch-label">ESPECIALIZAÇÃO<select id="branch">${Object.entries(B.branches).map(([k,v])=>`<option value="${k}" ${k===e.branch?'selected':''}>${v.name} · ${v.description}</option>`).join('')}</select></label>`;
      if(!near)html+='<small class="context-note">Aproxime-se para gerenciar.</small>';
    }
  }
  html+=cancel(e,u,time,near);
  if(own&&e.kind==='core'&&ready)html+=coreWisps(e,{u,snapshot,map});
  if(e.kind==='workshop')html+=`<p class="context-note">Coleta +${e.tier*30}% · reparo +${e.tier*20}%.</p>`;
  return html;
}
function coreWisps(core,{u,snapshot,map}){
  const workers=snapshot.wisps.filter(w=>w.owner===u.id),cost=wispCost(workers.length),near=distance(u,core)<=B.interactRange,training=workers.find(w=>w.readyAt>snapshot.time),trees=freeTrees(snapshot,map,core);
  return `<section class="wisp-management"><div class="section-caption"><span>${icon('wisp')} Wisps <b>${workers.length}</b></span><strong>+${(u.woodIncome||0).toFixed(1)} ♧/s</strong></div><button class="command-primary" data-do="train-wisp" data-core="${core.id}" ${!near||training||!trees.length||u.gold<cost.gold||u.wood<cost.wood?'disabled':''}>${training?'Formando · '+Math.ceil(training.readyAt-snapshot.time)+'s':'Formar Wisp'}<span>${price(cost)} <kbd>T</kbd></span></button>${training?cancel(training,u,snapshot.time,near):''}<small class="context-note">${trees.length} árvores livres${!trees.length?' · evolua os atuais':''}</small><div class="wisp-roster">${workers.map(w=>{const c=wispUpgradeCost(w.level),busy=w.readyAt>snapshot.time||w.upgradingUntil>snapshot.time;return `<div class="wisp-row"><button data-do="select-wisp" data-id="${w.id}" title="Selecionar Wisp">${icon('wisp')}<span><b>Nv. ${w.level}</b><small>${busy?'◷ '+Math.ceil(Math.max(w.readyAt,w.upgradingUntil)-snapshot.time)+'s':`+${w.income.toFixed(1)} ♧/s`}${w.rich?' · exterior':''}</small></span></button><button class="wisp-upgrade" data-do="upgrade-wisp" data-id="${w.id}" aria-label="Evoluir Wisp ${w.id}" title="Evoluir: ${number(c.gold)} ouro + ${number(c.wood)} madeira" ${!near||busy||u.gold<c.gold||u.wood<c.wood?'disabled':''}>${icon('upgrade')}</button></div>`;}).join('')}</div></section>`;
}
function wispMarkup(w,{u,snapshot,map}){
  const own=w.owner===u?.id,core=snapshot.structures.find(s=>s.kind==='core'&&s.owner===u?.id),cost=wispUpgradeCost(w.level),near=core&&u&&distance(core,u)<=B.interactRange;
  const time=snapshot.time,busy=w.readyAt>time||w.upgradingUntil>time,trees=core?freeTrees(snapshot,map,core):[];
  let html=header('Wisp da seiva',`NÍVEL ${w.level} · ${w.rich?'BOSQUE EXTERNO':'CLAREIRA'}`,'wisp')+`<div class="selection-stats"><b>+${w.income.toFixed(1)} <small>madeira/s</small></b><span>${number(w.hp)} HP</span></div>`;
  if(busy)html+=meter(1-(Math.max(w.readyAt,w.upgradingUntil)-time)/(w.readyAt>time?B.wisps.trainSeconds:B.wisps.seconds),`${w.readyAt>time?'Vinculando':'Evoluindo'} · ${Math.ceil(Math.max(w.readyAt,w.upgradingUntil)-time)}s`);
  else html+=`<small class="context-note">${w.income?'Colhendo sem consumir a árvore.':'Sem núcleo ativo no alcance.'}</small>`;
  html+=`<button class="command-secondary" data-do="locate" data-id="${w.id}">${icon('target')} Localizar na árvore</button>`;
  if(own){html+=`<button class="command-primary" data-do="upgrade-wisp" data-id="${w.id}" ${!near||busy||u.gold<cost.gold||u.wood<cost.wood?'disabled':''}>Evoluir <span>${price(cost)} <kbd>U</kbd></span></button>${cancel(w,u,time,near)}<small class="context-note">Próximo: +${wispIncome({...w,level:w.level+1}).toFixed(1)} madeira/s${!near?' · gerencie no núcleo':''}</small><button class="command-secondary" data-do="relocate-wisp" data-id="${w.id}" ${!near||busy||!trees.length?'disabled':''}>Trocar de árvore <span>${B.wisps.trainSeconds}s</span></button><details class="advanced-tree"><summary>Escolher pela lista</summary><select id="wisp-tree" aria-label="Árvore de destino">${trees.map(t=>`<option value="${t.id}">${t.rich?'Externa +60%':'Clareira'} · ${Math.round(distance(core,t))}m · ${t.id.replace('tree','#')}</option>`).join('')}</select><button class="command-secondary" data-do="assign-wisp" data-id="${w.id}" ${!near||busy||!trees.length?'disabled':''}>Vincular árvore selecionada</button></details><button class="back-to-core" data-do="core">← Núcleo <kbd>N</kbd></button>`;}
  return html;
}
