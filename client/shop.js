import { BALANCE as B, trollCost } from '../shared/config.js';
import { ITEMS, EQUIPMENT_SLOTS, BUILDS, upgradePreview } from '../shared/equipment.js';
import { icon } from './icons.js';

export function shopMarkup(u,time,tab='gear',build='siege'){
  const equipped=Object.values(u.equipment||{}),recommended=BUILDS[build];
  const busy=time-u.lastHit<5||(u.lastAttack>0&&time-u.lastAttack<5)||(u.cooldowns.attack||0)>time;
  const header=`<button class="modal-close" data-do="shop" aria-label="Fechar loja">${icon('close')} <kbd>B</kbd></button><div class="eyebrow">ARSENAL DO BOSQUE</div><h2>Arsenal <span>${icon('gold')} ${Math.floor(u.gold).toLocaleString('pt-BR')}</span></h2><div class="shop-tabs" role="tablist" aria-label="Loja do Troll"><button role="tab" aria-selected="${tab==='gear'}" data-do="shop-tab" data-tab="gear">Equipamentos</button><button role="tab" aria-selected="${tab==='levels'}" data-do="shop-tab" data-tab="levels">Atributos ∞</button></div>`;
  if(tab==='levels')return header+`<p>Sem nível máximo. Custos crescentes; velocidade e cooldown têm ganhos decrescentes.</p><div class="attribute-grid">${Object.entries(B.upgrades).map(([key,d])=>{
    const level=u.levels[key],cost=trollCost(key,level),locked=level===3&&time<B.finalAge;
    return `<button class="shop-item" data-do="buy" data-key="${key}" ${locked||u.gold<cost?'disabled':''}><span><b>${d.name} <small>Nv. ${level} → ${level+1}</small></b><small>${upgradePreview(u,key)}</small></span><strong>${locked?'EM '+Math.ceil(B.finalAge-time)+'s':cost.toLocaleString('pt-BR')+' ◇'}</strong></button>`;
  }).join('')}</div><p class="shop-note">O marco de cerco libera nível 4. Depois, a evolução continua sem teto de nível.</p>`;
  return header+`<div class="build-choices" aria-label="Sugestões de build">${Object.entries(BUILDS).map(([id,b])=>`<button data-do="shop-build" data-build="${id}" aria-pressed="${id===build}">${b.name}</button>`).join('')}</div><p class="build-description">${recommended.description}</p><div class="equipment-grid">${Object.entries(EQUIPMENT_SLOTS).map(([slot,label])=>`<section><h3>${label}<small>${ITEMS[u.equipment[slot]]?.name||'Espaço livre'}</small></h3>${Object.entries(ITEMS).filter(([,item])=>item.slot===slot).map(([id,item])=>{
    const owned=u.inventory.includes(id),active=equipped.includes(id),suggested=recommended.items.includes(id);
    return `<article class="item-card ${active?'equipped':''} ${suggested?'recommended':''}"><div class="item-title"><div class="item-art item-${id}">${icon({maul:'heavy',claws:'sword',edge:'sword',carapace:'armor',mantle:'dash',moss:'leaf',totem:'roar',hunt:'target',amber:'relic'}[id])}</div><b>${item.name}</b>${suggested?'<span title="Faz parte da build selecionada">◆</span>':''}</div><p>${item.description}</p><button data-do="${owned?'equip-item':'buy-item'}" data-item="${id}" ${active||busy||(!owned&&u.gold<item.cost)?'disabled':''}>${active?'✓ Equipado':owned?'Equipar':`${item.cost} ◇ · Comprar`}</button></article>`;
  }).join('')}</section>`).join('')}</div><p class="shop-note">${busy?'Em combate · aguarde 5s sem causar ou receber dano.':'3 espaços · misture as builds. Itens comprados ficam na coleção.'}</p>`;
}
