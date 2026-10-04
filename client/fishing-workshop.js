import { fishingEquipment, sortFish, FISHING_GEAR } from '../shared/fishing.js';
import { fishCard } from './fishing-ui.js';
import { updatePanel } from './panel.js';
export class FishingWorkshopUI{
  constructor(parent){parent.insertAdjacentHTML('beforeend','<aside id="fishing-workshop" class="fish-inventory fishing-workshop" aria-label="Oficina de Pesca" hidden></aside>');this.panel=parent.querySelector('#fishing-workshop');this.key='';this.panel.addEventListener('pointerdown',e=>e.stopPropagation());}
  toggle(){this.panel.hidden=!this.panel.hidden;this.key='';return !this.panel.hidden;}
  close(){this.panel.hidden=true;}
  update(u){if(!u?.alive||u.ghost)this.close();if(this.panel.hidden)return;
    const gear=u.fishingEquipment||fishingEquipment({rodLevel:u.rod?.level}),fish=sortFish(u.fishInventory||[]),status=u.fishingWorkshop,affordable=Object.keys(FISHING_GEAR).map(k=>{const cost=gear[k].nextCost;return !!cost&&u.gold>=cost.gold&&u.wood>=cost.wood;}),key=JSON.stringify([gear,fish.map(f=>f.id),affordable,status]);
    // Passive income only changes this text, not the entire fish-sale list.
    const gold=this.panel.querySelector('[data-workshop-gold]'),amount=String(Math.floor(u.gold));if(gold&&gold.textContent!==amount)gold.textContent=amount;if(key===this.key)return;this.key=key;
    updatePanel(this.panel,workshopMarkup(u,gear,fish));
  }
}
export function workshopMarkup(u,gear=u.fishingEquipment||fishingEquipment(u),fish=sortFish(u.fishInventory||[])){
  const available=!!u.fishingWorkshop?.available,descriptions={rod:'Maior controle da fisgada e recolhimento mais rápido.',bait:'Menos tempo até a boia afundar.',reel:'Recolhimento mais rápido e mais tempo para reagir.'};
  const upgrades=Object.entries(FISHING_GEAR).map(([key,def])=>{const item=gear[key],cost=item.nextCost;return `<section class="rod-upgrade"><h4>${def.name} <small>${item.level}/5</small></h4><p>${descriptions[key]}</p><button data-do="upgrade-fishing-gear" data-key="${key}" ${!available||!cost||u.gold<cost.gold||u.wood<cost.wood?'disabled':''}>${cost?`${cost.gold} ouro · ${cost.wood} madeira`:'Nível máximo'}</button></section>`;}).join('');
  return `<header><div><small>OFICINA COSTEIRA · <span data-workshop-gold>${Math.floor(u.gold)}</span> OURO</small><h3>Pesca e comércio</h3></div><button data-do="fishing-workshop" aria-label="Fechar Oficina de Pesca">×</button></header><p class="fish-note">${u.fishingWorkshop?.reason||'Aproxime-se da Oficina.'} Venda com a vara equipada. Só seus recursos são gastos.</p><div class="fishing-gear-grid">${upgrades}</div><p class="fish-note">Recolhimento: ${Math.round((1-gear.reelMultiplier)*100)}% mais rápido · reação: ${gear.biteWindow.toFixed(2)}s. Raridades e Shiny mantêm as mesmas chances.</p><div class="fish-tabs"><b>Venda · ${fish.length} peixes</b><button data-do="sell-fish" data-id="all" ${!available||!fish.length?'disabled':''}>Vender todos · ${fish.reduce((n,f)=>n+f.saleValue,0)} ouro</button></div><div class="fish-list">${fish.length?fish.map(f=>`<section>${fishCard(f)}<button data-do="sell-fish" data-id="${f.id}" ${available?'':'disabled'}>Vender · ${f.saleValue} ouro</button></section>`).join(''):'<p class="fish-empty">Pesque na costa e traga suas capturas para vender.</p>'}</div>`;
}
