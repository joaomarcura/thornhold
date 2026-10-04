import { FISH_SPECIES, FISH_RARITIES, sortFish } from '../shared/fishing.js';
import { binding, keyLabel } from './preferences.js';

const storageKey='thornhold-fish-collection-v1',safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const speciesOf=fish=>FISH_SPECIES.find(s=>s.id===fish.species)||FISH_SPECIES[0],rarityOf=fish=>FISH_RARITIES.find(r=>r.id===fish.rarity)||FISH_RARITIES[0];
export function normalizeFishCollection(value){
  if(!Array.isArray(value))return [];
  const keys=new Set();return value.filter(row=>{
    const fish=row?.best;if(!fish||!Number.isSafeInteger(row.count)||row.count<1||!FISH_SPECIES.some(s=>s.id===fish.species)||!FISH_RARITIES.some(r=>r.id===fish.rarity))return false;
    if(!['lengthCm','weightKg','ageYears','rating','saleValue'].every(key=>Number.isFinite(fish[key])&&fish[key]>=0)||fish.rating>100||typeof fish.shiny!=='boolean')return false;
    const key=`${fish.species}:${fish.rarity}:${fish.shiny?'shiny':'normal'}`;if(keys.has(key))return false;keys.add(key);return true;
  }).slice(0,60).map(row=>({key:`${row.best.species}:${row.best.rarity}:${row.best.shiny?'shiny':'normal'}`,count:row.count,best:row.best}));
}
export function fishIllustration(fish){const species=speciesOf(fish),color=fish.shiny?'#eee2a0':'#'+species.color.toString(16).padStart(6,'0'),h=species.shape[1]*62,r=rarityOf(fish).color,spots=['grouper','snapper'].includes(species.id)?'<path d="M48 29h2m8 5h2m11-7h2m-9 12h2m14-4h2" stroke="#263f3b" stroke-width="2" stroke-linecap="round"/>':'<path d="M40 32Q64 22 89 31" fill="none" stroke="#e5f0d1" stroke-width="1" opacity=".6"/>';
  return `<svg class="fish-illustration" viewBox="0 0 120 64" aria-hidden="true"><ellipse cx="64" cy="54" rx="38" ry="3" fill="#071d1c" opacity=".3"/><path fill="${color}" stroke="#25443a" stroke-width=".8" d="M40 32L13 13Q20 31 13 51Z"/><path d="M17 22l21 10-21 11" fill="none" stroke="#d0dfab" opacity=".5"/><path d="M49 ${32-h*.65}L57 ${23-h}L70 ${32-h*.75}" fill="${r}"/><ellipse cx="67" cy="32" rx="34" ry="${h}" fill="${color}"/><path d="M36 34Q66 ${32+h*1.7} 97 34Q69 ${32+h*.9} 36 34Z" fill="#e0e8c9" opacity=".75"/>${spots}<path d="M72 ${32-h*.7}Q63 32 74 ${32+h*.7}" fill="none" stroke="#38514b" stroke-width="1.3"/><path d="M67 35l-12 12 20-7Z" fill="${r}" opacity=".8"/><circle cx="87" cy="${30-h*.1}" r="4" fill="#e8d996"/><circle cx="88" cy="${30-h*.1}" r="2.1" fill="#122926"/><circle cx="89" cy="${29-h*.1}" r=".8" fill="#fff"/><path d="M97 34h5" stroke="#354b43" stroke-width="1.3"/>${fish.shiny?'<path d="M106 7v12m-6-6h12M29 9v8m-4-4h8" stroke="#ffedac" stroke-width="2"/>':''}</svg>`;
}
function fishDetails(fish){return `<span>${fish.lengthCm.toFixed(1)} cm · ${fish.weightKg.toFixed(3)} kg · ${fish.ageYears.toFixed(1)} anos</span><b>Rating ${fish.rating}/100</b><small>Valor estimado: ${fish.saleValue} ouro</small>`;}
export function fishCard(fish,count){const rarity=rarityOf(fish);return `<article class="fish-card" style="--fish-rarity:${rarity.color}">${fishIllustration(fish)}<div><small>${rarity.name}${fish.shiny?' · SHINY':''}${count?' · '+count+' capturas':''}</small><h4>${speciesOf(fish).name}</h4>${fishDetails(fish)}</div></article>`;}

export class FishingUI{
  constructor(parent){
    parent.insertAdjacentHTML('beforeend','<aside id="fish-capture" class="fish-capture" aria-live="polite" hidden></aside><aside id="fish-inventory" class="fish-inventory" aria-label="Peixes e coleção" hidden><header><div><small>DIÁRIO DA PRAIA</small><h3>Peixes e coleção</h3></div><button data-do="fish-inventory" aria-label="Fechar inventário de peixes">×</button></header><div class="fish-tabs"><button data-do="fish-tab" data-tab="inventory">Nesta partida</button><button data-do="fish-tab" data-tab="collection">Coleção visual</button></div><p class="fish-note"></p><div class="fish-list"></div></aside>');
    this.card=parent.querySelector('#fish-capture');this.panel=parent.querySelector('#fish-inventory');this.tab='inventory';this.page=1;this.captureUntil=0;this.key='';this.collection=[];this.authenticated=false;
    try{this.collection=normalizeFishCollection(JSON.parse(localStorage.getItem(storageKey)||'[]'));}catch{}
  }
  async loadCollection(authenticated){this.authenticated=authenticated;
    if(authenticated)try{const res=await fetch('/api/fishing/collection',{credentials:'same-origin'});if(!res.ok)throw new Error();this.collection=normalizeFishCollection((await res.json()).collection);this.error=null;this.key='';}catch{this.error='Não foi possível carregar a coleção da conta. Tente abrir novamente.';this.collection=[];this.key='';}
  }
  showCatch(fish,time){this.captureUntil=time+3.5;this.card.hidden=false;this.card.innerHTML=`<small>CAPTURA CONCLUÍDA · ${rarityOf(fish).name}${fish.shiny?' · SHINY':''}</small><section><h4>${speciesOf(fish).name}</h4>${fishDetails(fish)}</section><footer>I · inventário <span>G · venda na Oficina</span></footer>`;this.card.style.setProperty('--fish-rarity',rarityOf(fish).color);
    if(!this.authenticated){const key=`${fish.species}:${fish.rarity}:${fish.shiny?'shiny':'normal'}`,previous=this.collection.find(row=>row.key===key);if(previous){previous.count++;if(fish.rating>previous.best.rating)previous.best=fish;}else this.collection.push({key,count:1,best:fish});try{localStorage.setItem(storageKey,JSON.stringify(this.collection));}catch{}}
  }
  update(unit,time){if(time>this.captureUntil||!unit?.alive||unit?.ghost||unit.action==='walk'||unit.fishing||unit.action==='repair')this.card.hidden=true;if(!unit?.alive||unit?.ghost)this.close();
    if(this.panel.hidden)return;
    const fish=sortFish(unit?.fishInventory||[]),rows=sortFish(this.collection.map(r=>({...r.best,count:r.count}))),items=this.tab==='inventory'?fish:rows,pages=Math.max(1,Math.ceil(items.length/12));this.page=Math.min(this.page,pages);
    const key=this.page+':'+this.tab+':'+fish.map(f=>f.id).join(',')+':'+this.collection.map(c=>c.key+c.count).join(',')+':'+this.error+':'+unit.rodEquipped+':'+unit.rodUnlocked;if(key===this.key)return;this.key=key;
    this.panel.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===this.tab));
    this.panel.querySelector('.fish-note').textContent=this.tab==='inventory'?`${fish.length}/60 peixes · Perdidos ao morrer. Venda na Oficina (G). Mais raros primeiro.`:this.authenticated?'Coleção da conta · Mais raros primeiro. Todas as capturas estão no Perfil → Peixes.':'Coleção salva neste navegador · Apenas registros visuais permanecem entre partidas.';
    this.panel.querySelector('.fish-list').innerHTML=toolSlots(unit)+(this.tab==='collection'&&this.error?`<p class="fish-empty">${safe(this.error)}</p>`:items.length?items.slice((this.page-1)*12,this.page*12).map(f=>fishCard(f,f.count)).join(''):`<p class="fish-empty">Sua primeira captura espera na costa.<br>Construa um Núcleo e uma Oficina (5); encontre a praia no mapa ${safe(keyLabel(binding('map')))}.<br>1 alterna martelo/vara. Clique para lançar e novamente quando a boia afundar.</p>`)+`<div class="fish-pager"><button data-do="fish-page" data-page="${this.page-1}" ${this.page<=1?'disabled':''}>Anterior</button><span>${this.page}/${pages}</span><button data-do="fish-page" data-page="${this.page+1}" ${this.page>=pages?'disabled':''}>Próxima</button></div>`;
  }
  toggle(){this.panel.hidden=!this.panel.hidden;this.key='';return !this.panel.hidden;}
  close(){this.panel.hidden=true;}
  setTab(tab){this.tab=tab==='collection'?'collection':'inventory';this.page=1;this.key='';}
  setPage(page){this.page=Math.max(1,Math.floor(page)||1);this.key='';}
}
export function toolSlots(u){return `<section class="tool-inventory" aria-label="Ferramentas"><b>FERRAMENTAS · 1 ALTERNAR</b><button data-do="select-tool" data-tool="hammer" class="${!u?.rodEquipped?'active':''}">⚒ Martelo ${!u?.rodEquipped?'· EQUIPADO':''}</button><button data-do="select-tool" data-tool="rod" class="${u?.rodEquipped?'active':''}" ${u?.rodUnlocked?'':'disabled'}>♧ Vara ${u?.rodUnlocked?u?.rodEquipped?'· EQUIPADA':'':'· Construa Oficina'}</button></section>`;}
