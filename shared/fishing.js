import { distance, STATES } from './config.js';
import { recordSpend } from './economy.js';
import { randomFor } from './map.js';
import { fishingLocation } from './coast.js';

// Game seconds, advanced only by Match.step. Fishing never changes combat,
// mining income or AI random streams. Building a Workshop unlocks the starter rod.
export const FISHING = Object.freeze({range:3.6,castSeconds:.7,biteWindow:1.8,inventoryLimit:60});
export const ROD_UPGRADES=Object.freeze([{gold:125,wood:15},{gold:250,wood:25},{gold:500,wood:40},{gold:1000,wood:65}]);
export function rodStats(level=1){level=Math.max(1,Math.min(5,Math.floor(level)||1));return {level,biteWindow:FISHING.biteWindow+.15*(level-1),reelMultiplier:.9**(level-1),nextCost:ROD_UPGRADES[level-1]||null};}
export const FISHING_GEAR=Object.freeze({rod:{name:'Vara',levelKey:'rodLevel'},bait:{name:'Isca',levelKey:'baitLevel'},reel:{name:'Molinete',levelKey:'reelLevel'}});
const gearLevel=n=>Math.max(1,Math.min(5,Math.floor(n)||1));
export function fishingEquipment(u){const rod=rodStats(u?.rodLevel),bait=gearLevel(u?.baitLevel),reel=gearLevel(u?.reelLevel);return {rod,bait:{level:bait,nextCost:ROD_UPGRADES[bait-1]||null,waitMultiplier:.9**(bait-1)},reel:{level:reel,nextCost:ROD_UPGRADES[reel-1]||null,reelMultiplier:.85**(reel-1)},biteWindow:rod.biteWindow+.18*(reel-1),reelMultiplier:rod.reelMultiplier*.85**(reel-1)};}
export function rodUnlocked(match,u){return !!u?.rodUnlocked||match.structures.some(s=>s.kind==='fishery'&&s.hp>0&&s.progress>=1&&(s.owner===u?.id||u?.partyId&&match.unit(s.owner)?.partyId===u.partyId&&match.unit(s.owner)?.alive));}
export function fishSaleValue(species,rarity,rating,shiny=false){const minimum={epic:1000,legendary:10000,mythic:50000}[rarity.id]||0;return Math.max(1,Math.round((minimum?minimum*(1+rating/200):species.value*rarity.multiplier*(.65+rating/100))*(shiny?2:1)));}
export function sortFish(fish){const rank=new Map(FISH_RARITIES.map((r,i)=>[r.id,i]));return [...fish].sort((a,b)=>(rank.get(b.rarity)||0)-(rank.get(a.rarity)||0)||Number(b.shiny)-Number(a.shiny)||b.rating-a.rating||String(a.id||a.species).localeCompare(String(b.id||b.species)));}
export const FISH_SPECIES = Object.freeze([
  {id:'sardine',name:'Sardinha Prateada',minCm:9,maxCm:28,maxKg:.22,maxAge:5,value:6,color:0xb4d5d5,shape:[1,.22,.18]},
  {id:'mullet',name:'Tainha Âmbar',minCm:18,maxCm:65,maxKg:3.1,maxAge:12,value:12,color:0xcba263,shape:[1,.3,.25]},
  {id:'bass',name:'Robalo da Névoa',minCm:20,maxCm:95,maxKg:9,maxAge:16,value:18,color:0x759fa9,shape:[1,.3,.22]},
  {id:'snapper',name:'Pargo Lunar',minCm:16,maxCm:75,maxKg:5,maxAge:14,value:24,color:0xc999b6,shape:[1,.42,.23]},
  {id:'grouper',name:'Garoupa de Coral',minCm:24,maxCm:120,maxKg:24,maxAge:28,value:30,color:0x9e9071,shape:[1,.48,.35]}
]);
export const FISH_RARITIES = Object.freeze([
  {id:'common',name:'Comum',weight:6200,multiplier:1,color:'#b4c2bd'},
  {id:'uncommon',name:'Incomum',weight:2600,multiplier:1.3,color:'#78cba0'},
  {id:'rare',name:'Raro',weight:900,multiplier:1.8,color:'#7fb9ef'},
  {id:'epic',name:'Épico',weight:240,multiplier:3,color:'#b796ef'},
  {id:'legendary',name:'Lendário',weight:55,multiplier:5,color:'#e4c274'},
  {id:'mythic',name:'Mítico',weight:5,multiplier:8,color:'#ef99b0'}
]);

export function fishSpecimen(seed,id,caughtAt=0){
  const rng=randomFor(seed),species=FISH_SPECIES[Math.floor(rng()*FISH_SPECIES.length)];
  let roll=rng()*10000;const rarity=FISH_RARITIES.find(r=>{roll-=r.weight;return roll<0;})||FISH_RARITIES[0];
  // Rating is a within-species size/condition percentile, independent of rarity.
  const percentile=rng(),condition=rng(),lengthCm=species.minCm+(species.maxCm-species.minCm)*percentile,
    weightKg=species.maxKg*(lengthCm/species.maxCm)**3*(.92+condition*.16),
    ageYears=.25+(species.maxAge-.25)*percentile**1.45,rating=Math.round(percentile*85+condition*15),shiny=rng()<.01;
  return {id,species:species.id,rarity:rarity.id,shiny,lengthCm:+lengthCm.toFixed(1),weightKg:+weightKg.toFixed(3),ageYears:+ageYears.toFixed(1),rating,
    saleValue:fishSaleValue(species,rarity,rating,shiny),caughtAt};
}

export function fishingStatus(match,u,{facing=true}={}){
  if(u?.role!=='elf'||!u.alive||u.ghost)return {available:false,reason:'Pesca disponível apenas para Elfos vivos.'};
  if(!rodUnlocked(match,u))return {available:false,reason:'Construa e conclua sua Oficina de Pesca para liberar a vara (5).'};
  if(![STATES.PREP,STATES.ACTIVE].includes(match.state))return {available:false,reason:'A partida terminou.'};
  if((u.stunnedUntil||0)>match.time)return {available:false,reason:'Aguarde o fim do atordoamento.'};
  if((u.fishInventory?.length||0)>=FISHING.inventoryLimit)return {available:false,reason:'Inventário de peixes cheio (60).'};
  const spot=fishingLocation(match.map,u);
  if(!spot)return {available:false,reason:'Aproxime-se da costa da sua praia (mapa M).'};
  const core=match.structures.find(s=>s.baseId===spot.baseId&&s.kind==='core'&&s.hp>0&&s.progress>=1),owner=core&&match.unit(core.owner);
  if(!owner?.alive||(owner.id!==u.id&&(!u.partyId||owner.partyId!==u.partyId)))return {available:false,reason:'Pesque na praia de uma base sua ou do parceiro co-op.'};
  if(Math.hypot(u.input?.x||0,u.input?.z||0)>.05)return {available:false,reason:'Pare para lançar a linha.'};
  const dx=spot.castPoint.x-u.x,dz=spot.castPoint.z-u.z;
  if(facing&&(Math.sin(u.yaw)*dx+Math.cos(u.yaw)*dz)/Math.max(1,Math.hypot(dx,dz))<.25)return {available:false,reason:'Olhe na direção do mar para lançar a linha.'};
  return {available:true,spotId:spot.id,reason:'Clique esquerdo lança a linha; mova-se para cancelar.'};
}

export function cancelFishing(match,u,reason='cancelled'){
  if(!u?.fishing)return false;
  match.emit('fishing-cancel',{unit:u.id,x:u.x,z:u.z,reason});u.fishing=null;
  if(u.action==='fish'){u.action='idle';u.actionUntil=match.time;}
  u.stats.fishingCancelled=(u.stats.fishingCancelled||0)+1;return true;
}

export function equipRod(match,u){
  if(u?.role!=='elf'||!u.alive)return 'Apenas Elfos vivos podem equipar a vara.';
  if(!u.rodEquipped&&!rodUnlocked(match,u))return 'Conclua sua Oficina de Pesca para liberar a vara.';
  cancelFishing(match,u,'unequip');u.rodEquipped=!u.rodEquipped;return null;
}

export function castLine(match,u){
  if(u.fishing)return 'A linha já está na água. Aguarde a boia afundar.';
  const status=fishingStatus(match,u);if(!status.available)return status.reason;
  const spot=fishingLocation(match.map,u),sequence=(u.fishingSequence||0)+1,gear=fishingEquipment(u);
  u.fishingSequence=sequence;u.rodEquipped=true;
  const seed=`${match.map.seed}:fishing:${u.id}:${sequence}`,rng=randomFor(seed+':timing'),castUntil=match.time+FISHING.castSeconds,biteAt=castUntil+(3.5+rng()*4)*gear.bait.waitMultiplier;
  u.fishing={phase:'cast',spotId:spot.id,startedAt:match.time,castUntil,biteAt,hookUntil:biteAt+gear.biteWindow,reelSeconds:(2.6+rng()*2.2)*gear.reelMultiplier,
    x:u.x,z:u.z,water:{...spot.castPoint},fish:fishSpecimen(seed,`${u.id}:fish:${sequence}`)};
  u.action='fish';u.actionUntil=u.fishing.hookUntil;
  u.stats.fishingCasts=(u.stats.fishingCasts||0)+1;
  match.emit('fishing-cast',{unit:u.id,x:u.x,z:u.z,spotId:spot.id});return null;
}

export function hookFish(match,u){
  const f=u.fishing;if(!f)return 'Lance a linha antes de fisgar.';
  if(f.phase==='reel')return null;
  if(match.time<f.biteAt)return 'Aguarde a boia afundar e o som da fisgada.';
  if(match.time>f.hookUntil){cancelFishing(match,u,'missed');return 'O peixe escapou. Lance novamente.';}
  if(!fishingStatus(match,u,{facing:false}).available){cancelFishing(match,u,'unavailable');return 'A pesca foi interrompida.';}
  f.phase='reel';f.hookedAt=match.time;f.reelUntil=match.time+f.reelSeconds;u.actionUntil=f.reelUntil;
  match.emit('fishing-hook',{unit:u.id,x:u.x,z:u.z});return null;
}

export function stepFishing(match){
  for(const u of match.units){if(u.role==='elf'&&!u.rodUnlocked&&rodUnlocked(match,u))u.rodUnlocked=true;const f=u.fishing;if(!f)continue;
    if(!u.alive||u.ghost||(u.stunnedUntil||0)>match.time||Math.hypot(u.input?.x||0,u.input?.z||0)>.05||distance(u,f)>.1||u.lastHit>=f.startedAt){cancelFishing(match,u,'interrupted');continue;}
    if(!fishingStatus(match,u,{facing:false}).available){cancelFishing(match,u,'unavailable');continue;}
    if(f.phase==='cast'&&match.time>=f.castUntil)f.phase='wait';
    if(f.phase==='wait'&&match.time>=f.biteAt){f.phase='bite';match.emit('fishing-bite',{unit:u.id,x:u.x,z:u.z});}
    if(f.phase==='bite'&&match.time>f.hookUntil){cancelFishing(match,u,'missed');continue;}
    if(f.phase==='reel'&&match.time>=f.reelUntil){
      const fish={...f.fish,caughtAt:match.time};u.fishInventory??=[];u.fishInventory.push(fish);
      u.fishCollection??=[];const key=`${fish.species}:${fish.rarity}:${fish.shiny?'shiny':'normal'}`,previous=u.fishCollection.find(p=>p.key===key);
      if(previous){previous.count++;if(fish.rating>previous.best.rating)previous.best=fish;}else u.fishCollection.push({key,count:1,best:fish});
      u.stats.fishCaught=(u.stats.fishCaught||0)+1;u.stats.fishingValue=(u.stats.fishingValue||0)+fish.saleValue;
      u.fishing=null;u.action='idle';u.actionUntil=match.time;
      match.emit('fish-caught',{unit:u.id,x:u.x,z:u.z,fish});
      match.onFishCaught?.(u,fish);
    }
  }
}

// No unseen fish, random timing or fish inventory is exposed to other players.
export function fishingPresentation(u){const f=u.fishing;return f?{phase:f.phase,spotId:f.spotId,startedAt:f.startedAt,castUntil:f.castUntil,
  biteAt:f.phase==='bite'?f.biteAt:null,hookUntil:f.phase==='bite'?f.hookUntil:null,hookedAt:f.hookedAt||null,reelUntil:f.reelUntil||null,water:{...f.water}}:null;}

export function fishingWorkshopStatus(match,u){
  if(u?.role!=='elf'||!u.alive||u.ghost)return {available:false,reason:'Oficina disponível para Elfos vivos.'};
  const workshop=match.structures.find(s=>s.kind==='fishery'&&s.hp>0&&s.progress>=1&&distance(u,s)<=5&&(s.owner===u.id||(u.partyId&&match.unit(s.owner)?.partyId===u.partyId&&match.unit(s.owner)?.alive)));
  return workshop?{available:true,id:workshop.id,reason:'G abre a Oficina de Pesca.'}:{available:false,reason:'Aproxime-se de uma Oficina de Pesca sua ou co-op (5 m).'};
}
export function sellFish(match,u,ids){
  const status=fishingWorkshopStatus(match,u);if(!status.available)return status.reason;
  if(ids!=='all'&&(!Array.isArray(ids)||!ids.length||ids.length>FISHING.inventoryLimit||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length))return 'Seleção de peixes inválida.';
  const chosen=ids==='all'?[...(u.fishInventory||[])]:ids.map(id=>u.fishInventory?.find(f=>f.id===id));
  if(!chosen.length||chosen.some(f=>!f))return 'Peixe não está mais no seu inventário.';
  cancelFishing(match,u,'sale');
  const sold=new Set(chosen.map(f=>f.id)),amount=chosen.reduce((sum,f)=>sum+f.saleValue,0);
  u.fishInventory=u.fishInventory.filter(f=>!sold.has(f.id));u.gold+=amount;u.stats.goldGenerated+=amount;u.stats.produced+=amount;
  u.stats.fishSold=(u.stats.fishSold||0)+chosen.length;u.stats.goldFromFishing=(u.stats.goldFromFishing||0)+amount;
  match.emit('fish-sold',{unit:u.id,x:u.x,z:u.z,amount,count:chosen.length});return null;
}
export function upgradeRod(match,u){
  return upgradeFishingGear(match,u,'rod');
}
export function upgradeFishingGear(match,u,key){
  const status=fishingWorkshopStatus(match,u);if(!status.available)return status.reason;
  const def=FISHING_GEAR[key];if(!def)return 'Equipamento de pesca inválido.';
  const level=gearLevel(u[def.levelKey]),cost=ROD_UPGRADES[level-1];if(!cost)return `${def.name} no nível máximo (5).`;
  if(u.gold<cost.gold||u.wood<cost.wood)return `${def.name} requer ${cost.gold} ouro e ${cost.wood} madeira.`;
  cancelFishing(match,u,'equipment-upgrade');u.gold-=cost.gold;u.wood-=cost.wood;recordSpend(u,cost,'economy','upgrade-'+key);u[def.levelKey]=level+1;
  match.emit(key==='rod'?'rod-upgraded':'fishing-gear-upgraded',{unit:u.id,x:u.x,z:u.z,key,level:level+1});return null;
}
