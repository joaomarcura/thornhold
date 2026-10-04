import { BALANCE as B, distance, resourceProducer, wispCost, wispUpgradeCost, wispIncome, towerDamage, arcaneTowerDamage, towerProfile, essenceIncome, elfPath } from '../shared/config.js';
import { baseAt } from '../shared/map.js';
import { icon } from './icons.js';
import { resource, resourceCost } from './resources.js';
import { upgradeStatus } from '../shared/upgrade-rules.js';
import { localeCode } from './i18n.js';
import { SPECIAL_RESOURCES } from '../shared/elf-progression.js';
import { constructionSpecialization, constructionEffects, specializationStatus, specializationStrength } from '../shared/structure-specializations.js';

const number=n=>Math.floor(n||0).toLocaleString(localeCode());
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const price=(cost,wallet)=>resourceCost(cost,wallet);
const meter=(value,label)=>`<div class="job-meter"><span>${label}</span><i><b style="width:${Math.max(0,Math.min(100,value*100))}%"></b></i></div>`;
export function freeTrees(snapshot,map,core){return snapshot.trees.filter(t=>t.amount>0&&distance(t,core)<=B.wisps.range&&(baseAt(map,t)?.id===core.baseId||t.rich)&&!snapshot.wisps.some(w=>w.treeId===t.id));}
function cancel(e,u,time,near=true){
  if(e.owner!==u?.id||!e.refund)return '';
  const upgrade=e.upgrading>0||e.upgradingUntil>time,label=e.role==='wisp'&&e.readyAt>time?'formação':e.progress<1?'obra':'melhoria';
  const policy=upgrade?'Reembolso integral da melhoria.':'Recupera 75% do investimento ainda não executado.';
  return `<button class="cancel-job" data-do="cancel-job" data-id="${e.id}" ${!near||time-e.lastHit<5?'disabled':''} title="${policy} Bloqueado por 5 s após dano.">Cancelar ${label} <span>+${price(e.refund)}</span></button>`;
}
function header(name,type,symbol){return `<div class="selection-heading"><div class="selection-emblem">${icon(symbol)}</div><div><small>${type}</small><h3>${name}</h3></div><button class="panel-close" data-do="deselect" aria-label="Fechar seleção" title="Esc ou botão direito">${icon('close')}</button></div>`;}
export function selectionMarkup(e,{u,snapshot,map}){
  const own=e.owner===u?.id,near=!!u&&distance(e,u)<=B.interactRange,time=snapshot.time;
  if(e.resource&&SPECIAL_RESOURCES[e.resource]){
    const channel=u?.crystalChannel?.target===e.id?u.crystalChannel:null;
    return header('Cristal','OBJETIVO EXTERNO','crystal')+`<div class="selection-stats"><b>${number(e.amount)} <small>/ ${number(e.maxAmount)}</small></b><span>ONDA ${(e.wave||0)+1}</span></div><button class="command-primary" data-do="gather-special" ${!near||u?.role!=='elf'||!u?.alive||e.amount<=0?'disabled':''}>${icon('crystal')} Segure o clique para coletar</button><small class="context-note">Canalização de 3s; movimento, dano, stun ou soltar o clique interrompem. O primeiro a concluir recebe o depósito.</small>${channel?meter((time-channel.startedAt)/(channel.until-channel.startedAt),'Coletando cristal') : ''}`;
  }
  if(e.amount!==undefined){
    const w=snapshot.wisps.find(w=>w.treeId===e.id);
    return header('Árvore de seiva',e.rich?'BOSQUE EXTERNO':'CLAREIRA','leaf')+`<div class="selection-stats"><b>${resource('wood',e.amount)}</b>${e.rich?'<span>Wisp +60%</span>':''}</div>`+(w?`<button class="command-primary" data-do="select-wisp" data-id="${w.id}">${icon('wisp')} Wisp Nv. ${w.level}<span>${resource('wood',w.income,{rate:'s',signed:true})}</span></button>`:e.amount>0?`<button class="command-primary" data-do="gather" ${!near||u?.role!=='elf'?'disabled':''}>${icon('wood')} Coletar <kbd>CLIQUE</kbd></button><small class="context-note">${near?'Segure o clique esquerdo para continuar.':'Aproxime-se para coletar.'}</small>`:`<p>Rebrote ${Math.max(0,Math.ceil((e.regrowAt||time+35)-time))}s · aguarda espaço livre.</p>`);
  }
  if(e.role==='wisp')return wispMarkup(e,{u,snapshot,map});
  if(!e.kind){
    let html=header(escape(e.name),e.role==='troll'?`TROLL · NÍVEL ${e.trollLevel||1}`:e.ghost?'ESPÍRITO':'ELFO',e.role==='troll'?'heavy':e.ghost?'wisp':'leaf');
    html+=`<div class="selection-stats"><b>${number(e.hp)} <small>/ ${number(e.maxHp)} HP</small></b><span>${e.alive?'ATIVO':'ELIMINADO'}</span></div><div class="target-health"><i style="width:${e.hp/e.maxHp*100}%"></i></div>`;
    if(e.role==='troll'&&e.combat){const c=e.combat;html+=`<div class="structure-details unit-attributes"><span>Dano físico <b>${c.damage.toFixed(1)} AD</b></span><span>Vel. de ataque <b>${(1/c.interval).toFixed(2)}/s</b></span><span>Movimento <b>${c.movement.toFixed(2)} m/s</b></span><span>Vida máxima <b>${number(c.maxHp)} HP</b></span><span>Armadura <b>${c.armor.toFixed(1)}</b></span><span>Alcance <b>${c.range.toFixed(1)} m</b></span><span>Dano de cerco <b>${c.siege.toFixed(2)}×</b></span><span>Roubo de vida <b>${(c.drain*100).toFixed(1)}%</b></span><span>Regen. em combate <b>${(c.combatRegen*100).toFixed(2)}%/s</b></span><span>Regen. fora de combate <b>${(c.restRegen*100).toFixed(2)}%/s</b></span></div>`;}
    return html;
  }
  const status=upgradeStatus(u,e,time,snapshot.state,snapshot.structures,{remote:true}),cost=status.cost,ready=e.progress===1;
  let html=header(e.epic?`${B.structures[e.kind].name} Épico`:e.legendary?`${B.structures[e.kind].name} Lendário`:B.structures[e.kind].name,`${own?'SUA BASE':u?.role==='troll'?'INIMIGO':'ALIADO'} · NV. ${e.tier}`,e.kind);
  const producer=resourceProducer(e);
  html+=`<div class="selection-stats"><b>${number(e.hp)} <small>/ ${number(e.maxHp)} HP</small></b>${producer?`<span>${resource('gold',producer.amount,{rate:'s',signed:true})}</span>`:''}</div><div class="target-health"><i style="width:${e.hp/e.maxHp*100}%"></i></div>`;
  const def=B.structures[e.kind];
  const tower=towerProfile(e);
  html+=`<div class="structure-details"><span>Nível <b>${e.tier}${e.tier>=B.advanced.tier?' · ASCENDENTE':e.epic?' · ÉPICO':e.legendary?' · LENDÁRIO':''}</b></span><span>Construção <b>${price(e.constructionCost||def)}</b></span>${e.kind==='fishery'?'':`<span>Próxima melhoria <b>${e.tier>=B.maxStructureTier?'MAX':price(cost,u)}</b></span>`}${producer?`<span>Produção <b>${resource('gold',producer.amount,{rate:'s',signed:true})}</b></span><span>Ritmo <b>${resource('gold',producer.perMinute,{rate:'min',signed:true})}</b></span>`:''}${e.kind==='mine'?`<span>Núcleo vinculado <b>Nv. ${e.coreTier||0}</b></span>`:''}${e.kind==='tower'?`<span>Dano <b>${(towerDamage(e.tier)*tower.damage).toFixed(1)}</b></span><span>Alcance <b>${(def.range+tower.range).toFixed(1)} m</b></span><span>Intervalo <b>${(def.interval*tower.interval).toFixed(2)} s</b></span>`:e.kind==='arcaneTower'?`<span>Dano explosivo <b>${arcaneTowerDamage(e.tier).toFixed(1)}</b></span><span>Alcance <b>${def.range.toFixed(1)} m</b></span><span>Recarga <b>${def.interval.toFixed(1)} s</b></span>`:e.kind==='refinery'?'<span>Status <b>Estrutura aposentada</b></span>':e.kind==='bastion'?`<span>Regeneração <b>${(B.elfProgression.specializations.fortress.regenPerTier*e.tier*100).toFixed(3)}%/s</b></span><span>Área <b>${def.aura} m</b></span>`:''}</div>`;
  if(!ready){html+=meter(e.progress,`Construindo · ${Math.floor(e.progress*100)}%`)+`<small class="context-note">${near?'Permaneça perto para concluir.':'Aproxime-se para continuar a obra.'}</small>${u?.role==='elf'?'<button class="command-secondary" data-do="assist">Ajudar <kbd>E</kbd></button>':''}`;}
  else if(u?.role==='elf'){
    if(e.hp<e.maxHp&&(!u.ghost||e.kind==='wall'))html+=`<button class="command-secondary" data-do="repair" ${near?'':'disabled'}>Reparar <span>${e.kind==='wall'?'GRÁTIS':price({gold:3,wood:1})} <kbd>CLIQUE</kbd></span></button>${e.kind==='wall'?`<small class="context-note">${u.ghost?'Espírito: 50% da velocidade-base · ':''}Segure o clique esquerdo · Primeiro reparador: 100% · ajudantes simultâneos: 25%.</small>`:''}`;
  }
  // Keep progression visible even while a foundation is still being built.
  // Hiding the action made a valid Core look as if it had no upgrade path.
  if(u?.role==='elf'&&own&&!u.ghost&&e.kind!=='fishery'){
    if(e.upgrading)html+=meter(1-e.upgrading/e.upgradeDuration,`Evoluindo · ${Math.ceil(e.upgrading)}s`);
    html+=`<button class="command-primary" data-do="upgrade" ${status.allowed?'':'disabled'} aria-describedby="upgrade-reasons" title="${escape(status.allowed?'Melhoria disponível':status.reasons.map(r=>r.message).join(' '))}">${icon('upgrade')} ${e.tier+1===B.epic.tier?'Épico':e.tier+1===B.legendary.tier?'Lendário':'Nível '+(e.tier+1)}<span>${price(cost,u)} <kbd>Q</kbd></span></button>`;
    if(!near)html+='<small class="context-note">Upgrade à distância disponível; reparo e demolição exigem proximidade.</small>';
  }
  if(own&&!u?.ghost&&e.kind!=='fishery')html+=`<small id="upgrade-reasons" class="context-note upgrade-reasons" role="status">${status.reasons.filter(r=>!['gold','wood','essence'].includes(r.code)).map(r=>escape(r.message)).join('<br>')}</small>`;
  if(own&&!u?.ghost&&ready)html+=constructionProgression(e,u,snapshot);
  if(!u?.ghost)html+=cancel(e,u,time,near);
  if(own&&!u?.ghost&&ready&&e.demolitionRefund)html+=`<button class="command-secondary demolition" data-do="demolish" data-id="${e.id}" ${!near||time-e.lastHit<5||e.upgrading?'disabled':''}>Demolir estrutura <span><kbd>Delete</kbd> +${price(e.demolitionRefund)}</span></button><small class="context-note">Atalho: <b>Delete</b> · recupera 75% do valor atual investido, incluindo melhorias${e.kind==='core'?' · demolir o último Núcleo pode encerrar a partida':''}.</small>`;
  if(own&&!u?.ghost&&e.kind==='core'&&ready)html+=coreProgression(e,{u,snapshot,map})+coreWisps(e,{u,snapshot,map});
  if(e.legendary)html+=`<p class="context-note">${e.kind==='tower'?`Raio contínuo · dano cresce até ${B.legendary.maxRamp}× enquanto mantém linha de visão.`:e.kind==='core'?'Produção própria final ×2.':'Vida máxima final ×4.'}</p>`;
  if(e.kind==='workshop')html+='<p class="context-note">Estrutura aposentada. Mantida apenas para compatibilidade com partidas antigas.</p>';
  if(e.kind==='fishery')html+=`<button data-do="fishing-workshop" ${snapshot.units.find(a=>a.id===u?.id)?.fishingWorkshop?.available?'':'disabled'}>G · Abrir Oficina de Pesca</button><p class="context-note">Venda peixes; evolua vara, isca e molinete. O prédio não possui níveis. Sem as antigas tecnologias da Oficina.</p>`;
  return html;
}
function constructionProgression(e,u,snapshot){
  const status=specializationStatus(u,e,snapshot.time,Infinity),option=constructionSpecialization(e);
  if(!status.options.length)return '';
  let html=`<section class="elf-specialization"><div class="section-caption"><span>${icon('crystal')} Especialização desta construção</span><strong>${option?escape(option.name):'NÍVEL 10'}</strong></div>`;
  if(option){
    const effects=constructionEffects(e);
    html+=`<p>${escape(option.description)}</p><small class="context-note">Potência atual ×${specializationStrength(e).toFixed(1)} · evolui para ×1,4 no nível 20 e ×1,8 no 30.</small><div class="structure-details">${Object.entries(effects).map(([key,value])=>`<span>${{production:'Produção',baseReduction:'Proteção da base',abilityCooldown:'Redução de recarga',health:'Vida máxima',collectionSpeed:'Velocidade de coleta',damage:'Dano',attackSpeed:'Cadência',range:'Alcance',armorPierce:'Penetração',regen:'Regeneração',repair:'Reparo recebido',reduction:'Redução de dano'}[key]}<b>+${key==='range'?value.toFixed(1)+' m':Math.round(value*100)+'%'}</b></span>`).join('')}</div>`;
  }else html+=`<div class="specialization-cards">${status.options.map((o,i)=>`<button data-do="choose-specialization" data-id="${e.id}" data-key="${o.id}" ${status.allowed?'':'disabled'}><kbd>${i+1}</kbd><b>${escape(o.name)}</b><small>${escape(o.description)}</small><span>${resource('crystal',10)}</span></button>`).join('')}</div><small class="context-note">${status.reasons.map(escape).join(' ')} Escolha permanente até a destruição.</small>`;
  return html+`<div class="structure-details"><span>Nível 10 · escolha <b>${resource('crystal',10)}</b></span><span>Nível 20 · Épico <b>${resource('crystal',15)}</b></span><span>Nível 30 · Ascendente <b>${resource('crystal',20)}</b></span></div></section>`;
}
function coreProgression(core,{u,snapshot}){
  let html='';
  if(core.specialization){const status=u.specializationAbility,spec=constructionSpecialization(core);html+=`<button class="command-primary" data-do="specialization-ability" ${!status?.available?'disabled':''}>${escape(spec.ability)}<span><kbd>X</kbd> ${status?.readyAt>snapshot.time?Math.ceil(status.readyAt-snapshot.time)+'s':'PRONTO'}</span></button><small class="context-note">Sem custo de cristal · ${escape(status?.reason)}</small>`;}
  const project=snapshot.elfEpicProject?.ownerId===u.id?snapshot.elfEpicProject:null;
  if(project){const entries=[['Núcleo',project.coreId],['Barricada',project.wallId],['Torre',project.towerId],['Mina',project.mineId]],complete=entries.filter(([,id])=>snapshot.structures.some(s=>s.id===id&&s.tier>=20)).length;html+=`<section class="technology-progression epic-project"><div class="section-caption"><span>Projeto Épico</span><strong>${complete}/4</strong></div><p>Blocos de dois níveis, sem abandonar defesa e economia.</p><small>Próximo bloco: ${price({gold:project.resourcePlan?.gold?.required,wood:project.resourcePlan?.wood?.required,specialResource:'crystal',specialAmount:project.resourcePlan?.required})}</small><div class="technology-owned">${entries.map(([name,id])=>`<span><b>${name}</b><small>Nv. ${snapshot.structures.find(s=>s.id===id)?.tier||0}/20</small></span>`).join('')}</div></section>`;}
  return html;
}
function coreWisps(core,{u,snapshot,map}){
  const workers=snapshot.wisps.filter(w=>w.owner===u.id),cost=wispCost(workers.length),near=distance(u,core)<=B.interactRange,training=workers.find(w=>w.readyAt>snapshot.time),trees=freeTrees(snapshot,map,core);
  const eligible=workers.some(w=>w.level<B.maxTier&&w.readyAt<=snapshot.time&&w.upgradingUntil<=snapshot.time&&u.gold>=wispUpgradeCost(w.level).gold&&u.wood>=wispUpgradeCost(w.level).wood);
  const openNodes=(snapshot.specialNodes||[]).filter(n=>n.amount>0&&!snapshot.wisps.some(w=>w.specialNodeId===n.id)).sort((a,b)=>Number(!a.local)-Number(!b.local));
  return `<section class="wisp-management"><div class="section-caption"><span>${icon('wisp')} Wisps <b>${workers.length}</b></span><strong>${resource('wood',u.woodIncome,{rate:'s',signed:true})}</strong></div><button class="command-primary" data-do="train-wisp" data-core="${core.id}" ${!near||training||!trees.length||u.gold<cost.gold||u.wood<cost.wood?'disabled':''}>${training?'Formando · '+Math.ceil(training.readyAt-snapshot.time)+'s':'Formar Wisp automaticamente'}<span>${price(cost,u)} <kbd>T</kbd></span></button>${training?cancel(training,u,snapshot.time,near):''}<small class="context-note"><b>T</b> forma e envia para a árvore livre mais próxima · ${trees.length} disponíveis</small><button class="command-secondary upgrade-all" data-do="upgrade-all-wisps" data-core="${core.id}" ${!near||!eligible?'disabled':''}>Evoluir todos elegíveis uma vez <kbd>Shift+Q</kbd></button><details class="wisp-list"><summary>Lista de Wisps · ${workers.length}</summary><div class="wisp-roster">${workers.map(w=>{const c=wispUpgradeCost(w.level),busy=w.readyAt>snapshot.time||w.upgradingUntil>snapshot.time,capped=w.level>=B.maxTier;return `<div class="wisp-row"><button data-do="select-wisp" data-id="${w.id}" title="Selecionar Wisp">${icon('wisp')}<span><b>${w.specialResource?SPECIAL_RESOURCES[w.specialResource].short:'Nv. '+w.level}${capped?' · ÉPICO':''}</b><small>${busy?'◷ '+Math.ceil(Math.max(w.readyAt,w.upgradingUntil)-snapshot.time)+'s':w.specialResource?(w.income||0).toFixed(1)+'/s':`${resource('wood',w.income,{rate:'s',signed:true})}`}${w.rich?' · exterior':''}</small></span></button>${w.specialResource?'':`<button class="wisp-upgrade" data-do="upgrade-wisp" data-id="${w.id}" ${capped||!near||busy||u.gold<c.gold||u.wood<c.wood?'disabled':''}>${capped?'MAX':price(c,u)+' <kbd>Q</kbd>'}</button>`}</div>`;}).join('')}</div></details></section>`;
}
function wispMarkup(w,{u,snapshot,map}){
  const own=w.owner===u?.id,core=snapshot.structures.find(s=>s.kind==='core'&&s.owner===u?.id),cost=wispUpgradeCost(w.level),near=core&&u&&distance(core,u)<=B.interactRange;
  const time=snapshot.time,busy=w.readyAt>time||w.upgradingUntil>time;
  let html=header('Wisp da seiva',`NÍVEL ${w.level} · ${w.rich?'BOSQUE EXTERNO':'CLAREIRA'}`,'wisp')+`<div class="selection-stats"><b>${resource('wood',w.income,{rate:'s',signed:true})}</b><span>${number(w.hp)} HP</span></div>`;
  if(busy)html+=meter(1-(Math.max(w.readyAt,w.upgradingUntil)-time)/(w.readyAt>time?B.wisps.trainSeconds:B.wisps.seconds),`${w.readyAt>time?'Vinculando':'Evoluindo'} · ${Math.ceil(Math.max(w.readyAt,w.upgradingUntil)-time)}s`);
  else html+=`<small class="context-note">${w.income?'Colhendo sem consumir a árvore.':'Sem núcleo ativo no alcance.'}</small>`;
  html+=`<button class="command-secondary" data-do="locate" data-id="${w.id}">${icon('target')} Localizar na árvore</button>`;
  if(own){const capped=w.level>=B.maxTier;html+=`<button class="command-primary" data-do="upgrade-wisp" data-id="${w.id}" ${capped||!near||busy||u.gold<cost.gold||u.wood<cost.wood?'disabled':''}>${capped?'Nível Épico máximo':'Evoluir'} <span>${capped?'MAX':price(cost,u)+' <kbd>Q</kbd>'}</span></button>${cancel(w,u,time,near)}<small class="context-note">${capped?'Limite de nível 20.':`Próximo: ${resource('wood',wispIncome({...w,level:w.level+1}),{rate:'s',signed:true})}`}${!near?' · gerencie no núcleo':''}</small><button class="back-to-core" data-do="core">← Núcleo <kbd>N</kbd></button>`;}
  return html;
}
