import { BALANCE as B, TROLL_UPGRADE_BRANCHES, trollBranchPoints, trollCost, trollUpgradeStatus } from '../shared/config.js';
import { ITEMS, EQUIPMENT_SLOTS, ITEM_LINES, ITEM_RARITIES, BUILDS, combatStats, itemEffects, itemLevel, itemRarity, itemUpgradeCost, upgradePreview } from '../shared/equipment.js';
import { icon } from './icons.js';
import { resource } from './resources.js';

const STAT_VIEW=[
  ['damage','Dano',v=>v.toFixed(1),1],
  ['interval','Ataques/s',v=>(1/v).toFixed(2),-1],
  ['maxHp','Vida',v=>Math.round(v),1],
  ['armor','Armadura',v=>v.toFixed(1),1],
  ['movement','Movimento',v=>`${v.toFixed(1)}m/s`,1],
  ['range','Alcance',v=>`${v.toFixed(1)}m`,1],
  ['siege','Cerco',v=>`${v.toFixed(2)}×`,1],
  ['drain','Roubo de vida',v=>`${(v*100).toFixed(1)}%`,1],
  ['combatRegen','Regen. em combate',v=>`${(v*100).toFixed(2)}%/s`,1],
  ['restRegen','Regen. fora de combate',v=>`${(v*100).toFixed(2)}%/s`,1],
  ['opening','Primeiro golpe',v=>`+${(v*100).toFixed(0)}%`,1],
  ['dashCooldown','Recarga da esquiva',v=>`${v.toFixed(1)}s`,-1]
];

function rarityTrack(level){
  return `<div class="rarity-track" aria-label="Progressão de raridade">${ITEM_RARITIES.map((rarity,index)=>`<i class="rarity-${rarity.id} ${index<level?'reached':''}" title="${rarity.name}"></i>`).join('')}</div>`;
}

function effectsMarkup(id,level,compact=false){
  return `<div class="item-effects ${compact?'compact':''}">${itemEffects(id,level).map(effect=>`<span><b>${effect.display}</b> ${effect.label}</span>`).join('')}</div>`;
}

function characterStatsMarkup(stats){
  return STAT_VIEW.map(([key,label,format])=>`<div><span>${label}</span><b>${format(stats[key])}</b></div>`).join('');
}

function equippedSlotMarkup(u,slot,activeSlot){
  const id=u.equipment?.[slot],item=ITEMS[id];
  if(!item)return `<button class="loadout-slot empty ${slot===activeSlot?'selected':''}" data-do="shop-slot" data-slot="${slot}"><span>${icon(slot==='weapon'?'sword':slot,'loadout-icon')}</span><small>${EQUIPMENT_SLOTS[slot]}</small><b>Vazio</b></button>`;
  const level=itemLevel(u,id),rarity=itemRarity(level);
  return `<button class="loadout-slot rarity-${rarity.id} ${slot===activeSlot?'selected':''}" data-do="shop-slot" data-slot="${slot}" style="--rarity:${rarity.color}"><span>${icon(item.art,'loadout-icon')}</span><small>${EQUIPMENT_SLOTS[slot]} · ${rarity.name} ${level}</small><b>${item.name}</b>${effectsMarkup(id,level,true)}<em>Equipado</em></button>`;
}

const GROWTH_ICONS={damage:'sword',speed:'dash',movement:'boots',lifesteal:'health',health:'heart',armor:'armor',regen:'moss',siege:'axe',utility:'roar'};

function growthMarkup(u,totalLevels,legendary){
  const branches=Object.entries(TROLL_UPGRADE_BRANCHES).map(([branchId,branch])=>{
    const points=trollBranchPoints(u.levels,branchId),nodes=branch.keys.map((key,index)=>{
      const d=B.upgrades[key],level=u.levels[key]||0,cost=trollCost(key,level),status=trollUpgradeStatus(u.levels,key),capped=status.code==='max';
      return `<div class="growth-step ${level?'active':''} ${capped?'complete':''}">${index?'<i class="growth-connector" aria-hidden="true"></i>':''}<button class="growth-node" data-do="buy" data-key="${key}" data-level="${level}" data-cost="${capped?'max':cost}" title="${d.description}" ${!status.allowed||u.gold<cost?'disabled':''}><span class="growth-node-icon">${icon(GROWTH_ICONS[key]||'relic')}</span><small>ETAPA ${index+1}</small><b>${d.name}</b><em>Nível ${level}/20 · ${status.band.name}</em><span>${capped?'Nível máximo':upgradePreview(u,key)}</span><strong>${capped?'MÁXIMO':resource('gold',cost)}</strong></button></div>`;
    }).join('');
    return `<section class="growth-path branch-${branchId}"><header><div><span>${branch.name}</span><small>${branch.description}</small></div><b>${points} PONTOS</b></header><div class="growth-lane">${nodes}</div></section>`;
  }).join('');
  return `<div class="growth-summary"><span>Pontos investidos <b>${totalLevels}</b></span><span>Dano Físico + Dano Estrutural <b>${u.levels.damage+u.levels.siege}/${B.legendary.swordLevels}</b></span><span>${legendary?'Espada Lendária ativa':'Próximo objetivo: Espada Lendária'}</span></div><div class="growth-intro"><div><b>ÁRVORE DE CRESCIMENTO</b><span>Escolha um caminho e fortaleça cada atributo até o nível 20.</span></div><small>${legendary?'⚔ ESPADA LENDÁRIA ATIVA · executa estruturas abaixo de 15% HP.':'Os caminhos mostram uma progressão recomendada; cada atributo continua livre para compra.'}</small></div><div class="growth-tree sequential">${branches}</div><p class="shop-note">Predador inclui Roubo de Vida real. Equipamentos evoluem separadamente de Comum até Épico.</p>`;
}

export function shopMarkup(u,time,tab='gear',build='siege',slot='weapon',selectedItem=null){
  const recommended=BUILDS[build],totalLevels=Object.values(u.levels||{}).reduce((sum,level)=>sum+level,0),legendary=(u.levels.damage||0)+(u.levels.siege||0)>=B.legendary.swordLevels&&totalLevels>=B.legendary.swordTotalLevels;
  const busy=time-u.lastHit<5||(u.lastAttack>0&&time-u.lastAttack<5)||(u.cooldowns.attack||0)>time,stats=u.combat||combatStats(u);
  const header=`<button class="modal-close" data-do="shop" aria-label="Fechar loja">${icon('close')} <kbd>G</kbd></button><div class="shop-title-row"><div><div class="eyebrow">FORJA ANCESTRAL · SANTUÁRIO</div><h2>Arsenal do Troll</h2></div><div class="shop-wallet"><small>Saldo disponível</small>${resource('gold',u.gold)}</div></div><p class="keyboard-note"><b>Mouse liberado:</b> inspecione e evolua · <kbd>G</kbd> / <kbd>Esc</kbd> fechar</p><div class="shop-tabs" role="tablist" aria-label="Loja do Troll"><button role="tab" aria-selected="${tab==='gear'}" data-do="shop-tab" data-tab="gear">Inventário e equipamentos</button><button role="tab" aria-selected="${tab==='levels'}" data-do="shop-tab" data-tab="levels">Árvore de crescimento</button></div>`;
  if(tab==='levels')return header+growthMarkup(u,totalLevels,legendary);

  const activeSlot=EQUIPMENT_SLOTS[slot]?slot:'weapon',slotItems=Object.entries(ITEMS).filter(([,entry])=>entry.slot===activeSlot),fallback=u.equipment?.[activeSlot]||slotItems.find(([id])=>recommended.items.includes(id))?.[0]||slotItems[0]?.[0],selected=ITEMS[selectedItem]?.slot===activeSlot?selectedItem:fallback;
  const item=ITEMS[selected],owned=u.inventory.includes(selected),active=u.equipment[activeSlot]===selected,level=owned?itemLevel(u,selected):1,rarity=itemRarity(level),line=ITEM_LINES[item.line],upgradeCost=itemUpgradeCost(selected,level);
  const missingGold=Math.max(0,item.cost-u.gold),primaryAction=active?'':owned?'equip-item':'buy-item';
  const primary=active?'✓ Equipado':busy?'Em combate · aguarde 5s':owned?'Equipar':missingGold?`Faltam ${resource('gold',missingGold)}`:`${resource('gold',item.cost)} · Comprar`;

  const lineChoices=`<div class="build-choices line-choices" aria-label="Linhas de equipamento">${Object.entries(BUILDS).map(([id,b])=>`<button data-do="shop-build" data-build="${id}" aria-pressed="${id===build}"><b>${b.name}</b><small>${b.description}</small></button>`).join('')}</div>`;
  const loadout=`<section class="character-sheet"><header><span>ATRIBUTOS REAIS</span><b>Nível ${u.trollLevel||1}</b></header><div class="character-stat-list">${characterStatsMarkup(stats)}</div></section><section class="paperdoll"><header><span>LOADOUT</span><small>Selecione um slot</small></header><div class="paperdoll-grid">${equippedSlotMarkup(u,'helmet',activeSlot)}<div class="troll-silhouette"><canvas id="troll-loadout-preview" aria-label="Prévia 3D do Troll equipado"></canvas><span>EQUIPADO</span></div>${equippedSlotMarkup(u,'armor',activeSlot)}${equippedSlotMarkup(u,'weapon',activeSlot)}<div class="paperdoll-spacer"></div>${equippedSlotMarkup(u,'boots',activeSlot)}</div></section>`;
  const catalog=`<section class="equipment-catalog"><header><h3>${EQUIPMENT_SLOTS[activeSlot]}</h3><span>${u.inventory.filter(id=>ITEMS[id]?.slot===activeSlot).length}/3 adquiridos</span></header><div class="equipment-grid">${slotItems.map(([id,candidate])=>{const candidateLevel=u.inventory.includes(id)?itemLevel(u,id):1,candidateRarity=itemRarity(candidateLevel),candidateLine=ITEM_LINES[candidate.line],candidateOwned=u.inventory.includes(id),candidateEquipped=u.equipment[activeSlot]===id,candidateMissing=Math.max(0,candidate.cost-u.gold),candidateAction=candidateOwned?(candidateEquipped?'':'equip-item'):'buy-item',candidateDisabled=!candidateAction||busy||(!candidateOwned&&candidateMissing),candidateLabel=candidateEquipped?'✓ Equipado':busy?'Aguarde 5s':candidateOwned?'Equipar':candidateMissing?`Faltam ${resource('gold',candidateMissing)}`:`Comprar · ${resource('gold',candidate.cost)}`,candidateUpgradeCost=candidateOwned?itemUpgradeCost(id,candidateLevel):Infinity,candidateCanUpgrade=candidateOwned&&candidateLevel<ITEM_RARITIES.length,candidateUpgradeLabel=busy?'Aguarde 5s':u.gold<candidateUpgradeCost?`Faltam ${resource('gold',Math.ceil(candidateUpgradeCost-u.gold))}`:`Evoluir · ${resource('gold',candidateUpgradeCost)}`;return `<article class="item-tile rarity-${candidateRarity.id} ${id===selected?'selected':''} ${candidateEquipped?'equipped':''} ${candidate.line===build?'recommended':''}" style="--rarity:${candidateRarity.color}"><button class="item-inspect" data-do="inspect-item" data-item="${id}" aria-label="Inspecionar ${candidate.name}; ${candidateOwned?'adquirido':`${candidate.cost} ouro`}"><span class="item-visual">${icon(candidate.art,'equipment-hero-icon')}</span><span class="rarity-badge">${candidateRarity.name} · Nv. ${candidateLevel}</span><b>${candidate.name}</b><small class="line-label" style="--line:${candidateLine.color}">${candidateLine.name}</small>${effectsMarkup(id,candidateLevel,true)}<small class="inspect-hint">Ver detalhes →</small></button><div class="catalog-actions"><button class="catalog-action ${!candidateOwned&&candidateMissing?'unaffordable':''}" data-do="${candidateAction}" data-item="${id}" ${candidateDisabled?'disabled':''}>${candidateLabel}</button>${candidateCanUpgrade?`<button class="catalog-action upgrade ${u.gold<candidateUpgradeCost?'unaffordable':''}" data-do="upgrade-item" data-item="${id}" ${busy||u.gold<candidateUpgradeCost?'disabled':''}>${candidateUpgradeLabel}</button>`:''}</div></article>`;}).join('')}</div></section>`;
  const inspector=`<aside class="item-inspector rarity-${rarity.id}" style="--rarity:${rarity.color}"><div class="item-hero"><div class="item-hero-art">${icon(item.art,'equipment-hero-icon')}</div><div><span class="rarity-badge">${rarity.name} · Nv. ${level}</span><h3>${item.name}</h3><small class="line-label" style="--line:${line.color}">${line.name} · ${EQUIPMENT_SLOTS[item.slot]}</small></div></div>${rarityTrack(level)}<p>${item.description}</p><section class="real-attributes"><h4>Atributos do item</h4>${effectsMarkup(selected,level)}</section><div class="purchase-summary"><span>Preço</span><b>${owned?'Adquirido':resource('gold',item.cost)}</b><span>Seu saldo</span><b>${resource('gold',u.gold)}</b></div><div class="item-actions"><button data-do="${primaryAction}" data-item="${selected}" ${!primaryAction||busy||(!owned&&missingGold)?'disabled':''}>${primary}</button>${owned?`<button class="upgrade-item" data-do="upgrade-item" data-item="${selected}" ${busy||level>=ITEM_RARITIES.length||u.gold<upgradeCost?'disabled':''}>${level>=ITEM_RARITIES.length?'ÉPICO · MÁXIMO':u.gold<upgradeCost?`Faltam ${resource('gold',Math.ceil(upgradeCost-u.gold))}`:`${resource('gold',upgradeCost)} · Evoluir para ${itemRarity(level+1).name}`}</button>`:''}</div>${owned&&level<ITEM_RARITIES.length?`<details class="upgrade-preview"><summary>Próxima evolução: ${itemRarity(level+1).name}</summary>${effectsMarkup(selected,level+1)}</details>`:''}</aside>`;

  return header+lineChoices+`<div class="inventory-shell"><div class="loadout-column">${loadout}</div><div class="inventory-column">${catalog}${inspector}</div></div><p class="shop-note">${busy?'Em combate · aguarde 5s sem causar ou receber dano.':'Todos os valores exibidos são os modificadores reais usados pelo servidor. Equipamentos nunca aplicam penalidades.'}</p>`;
}
