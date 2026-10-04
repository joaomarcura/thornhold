import { BALANCE as B, mineEconomy, distance } from './config.js';
import { upgradeStatus } from './upgrade-rules.js';
export const BUILDING_KEYS=Object.freeze(['core','wall','tower','mine']);
export const BUILDING_HOTKEYS=Object.freeze({core:6,wall:2,tower:3,mine:4,fishery:5});
export function buildingShortcut(u,kind,snapshot,{selected=null,build=false}={}){
  const def=B.structures[kind];if(!def||def.available===false)return {allowed:false,reasons:[{message:'Construção indisponível.'}]};
  const owned=snapshot.structures.filter(s=>s.owner===u?.id&&s.kind===kind&&s.hp>0).sort((a,b)=>Number(b.id===selected)-Number(a.id===selected)||Number(b.baseId===u?.baseId)-Number(a.baseId===u?.baseId)||a.tier-b.tier||distance(u,a)-distance(u,b)||a.id.localeCompare(b.id));
  if(owned.length&&!build){const target=owned[0],status=upgradeStatus(u,target,snapshot.time,snapshot.state,snapshot.structures,{remote:true});return {mode:'upgrade',target,...status};}
  const core=snapshot.structures.find(s=>s.kind==='core'&&s.baseId===u?.baseId),free=kind==='core'&&(u?.relocationVouchers||0)>0&&u.relocationUntil>snapshot.time,cost=free?{gold:0,wood:0}:kind==='mine'?mineEconomy(core?.tier).cost:{gold:def.gold,wood:def.wood},reasons=[];
  if(!u?.alive||u.ghost||u.role!=='elf')reasons.push({message:'Construção exclusiva de Elfos vivos.'});
  if((u?.gold||0)<cost.gold)reasons.push({message:'Ouro insuficiente.'});if((u?.wood||0)<cost.wood)reasons.push({message:'Madeira insuficiente.'});
  return {mode:'build',cost,reasons,allowed:!reasons.length};
}
