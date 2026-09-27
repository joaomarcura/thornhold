import { BALANCE as B, scaled, trollHealth } from './config.js';
import { cardEffects } from './cards.js';

export const EQUIPMENT_SLOTS={weapon:'Arma',helmet:'Capacete',armor:'Armadura',boots:'Botas'};
export const ITEM_LINES={siege:{name:'Cerco',color:'#d19a5b'},hunter:{name:'Caçador',color:'#6ec6a4'},sustain:{name:'Sustentação',color:'#9b8be0'}};
export const ITEM_RARITIES=[
  {id:'common',name:'Comum',color:'#a9b4aa',power:1},
  {id:'uncommon',name:'Incomum',color:'#70ba82',power:1.18},
  {id:'rare',name:'Raro',color:'#55a8dc',power:1.38},
  {id:'legendary',name:'Lendário',color:'#e4ab4e',power:1.62},
  {id:'epic',name:'Épico',color:'#bd75e5',power:1.9}
];
export const ITEMS={
  maul:{name:'Machado Quebra-Muralha',slot:'weapon',line:'siege',art:'axe',cost:220,description:'Uma lâmina brutal feita para abrir portões e concluir golpes pesados.',siege:1.45,heavy:1.15},
  claws:{name:'Escopeta do Predador',slot:'weapon',line:'hunter',art:'shotgun',cost:210,description:'Disparos curtos e rápidos para manter pressão sobre Elfos expostos.',interval:.82},
  edge:{name:'Cajado Hemático',slot:'weapon',line:'sustain',art:'staff',cost:240,description:'Canaliza energia vital e permite controlar o combate a uma distância segura.',range:.8,damage:1.08},

  totem:{name:'Elmo do Silêncio',slot:'helmet',line:'siege',art:'helmet',cost:200,description:'Amplifica o Rugido para criar uma janela segura contra torres.',roar:1.25},
  hunt:{name:'Visor da Caçada',slot:'helmet',line:'hunter',art:'visor',cost:180,description:'Marca a abertura criada pela esquiva e fortalece o primeiro golpe.',opening:.35},
  amber:{name:'Coroa de Âmbar Vivo',slot:'helmet',line:'sustain',art:'crown',cost:230,description:'Converte dano em vida durante duelos e cercos prolongados.',drain:.08,drainCap:.02,structureDrain:.015},

  carapace:{name:'Couraça de Pedra',slot:'armor',line:'siege',art:'armor',cost:190,description:'Placas pesadas para permanecer sob fogo durante a ruptura.',armor:4},
  moss:{name:'Manto de Musgo Vivo',slot:'armor',line:'sustain',art:'moss',cost:200,description:'Acelera a recuperação e reduz o tempo até a regeneração começar.',regen:1.45,regenDelay:-1},
  heartplate:{name:'Peitoral do Predador',slot:'armor',line:'hunter',art:'heart',cost:240,description:'Expande a reserva de vida para sustentar perseguições agressivas.',health:1.15},

  mantle:{name:'Botas do Vendaval',slot:'boots',line:'hunter',art:'boots',cost:200,description:'Aumenta mobilidade e reduz o intervalo entre esquivas.',movement:1.1,dashCooldown:.75},
  warboots:{name:'Grevas de Demolição',slot:'boots',line:'siege',art:'greaves',cost:220,description:'Permitem avançar sob pressão sem perder velocidade.',movement:1.05,armor:1.5},
  rootboots:{name:'Passos Enraizados',slot:'boots',line:'sustain',art:'roots',cost:225,description:'Mantém movimento e recuperação durante combates prolongados.',movement:1.05,regen:1.2}
};
export const BUILDS={
  siege:{name:'Cerco',description:'Abra a entrada durante o silêncio das torres.',items:['maul','totem','carapace','warboots']},
  hunter:{name:'Caçador',description:'Esquive, acerte e reposicione rapidamente.',items:['claws','hunt','heartplate','mantle']},
  sustain:{name:'Sustentação',description:'Controle a distância e recupere-se entre investidas.',items:['edge','amber','moss','rootboots']}
};
const MULTIPLIERS=new Set(['damage','interval','regen','siege','movement','health','heavy','dashCooldown']);
const EFFECT_LABELS={
  damage:{label:'Dano',format:v=>`+${Math.round((v-1)*100)}%`},
  interval:{label:'Velocidade de ataque',format:v=>`+${Math.round((1/v-1)*100)}%`},
  armor:{label:'Armadura',format:v=>`+${v.toFixed(1).replace('.0','')}`},
  regen:{label:'Regeneração',format:v=>`+${Math.round((v-1)*100)}%`},
  regenDelay:{label:'Início da regeneração',format:v=>`${Math.abs(v).toFixed(1).replace('.0','')}s mais cedo`},
  siege:{label:'Dano contra estruturas',format:v=>`+${Math.round((v-1)*100)}%`},
  movement:{label:'Velocidade de movimento',format:v=>`+${Math.round((v-1)*100)}%`},
  health:{label:'Vida máxima',format:v=>`+${Math.round((v-1)*100)}%`},
  range:{label:'Alcance',format:v=>`+${v.toFixed(1)}m`},
  heavy:{label:'Ataque pesado',format:v=>`+${Math.round((v-1)*100)}%`},
  dashCooldown:{label:'Recarga da esquiva',format:v=>`-${Math.round((1-v)*100)}%`},
  roar:{label:'Silêncio do Rugido',format:v=>`+${v.toFixed(1)}s`},
  opening:{label:'Dano no primeiro golpe',format:v=>`+${Math.round(v*100)}%`},
  drain:{label:'Roubo de vida',format:v=>`+${Math.round(v*100)}%`},
  drainCap:{label:'Limite por golpe',format:v=>`${Math.round(v*100)}% da vida`},
  structureDrain:{label:'Roubo de vida estrutural',format:v=>`+${(v*100).toFixed(1)}%`}
};
export function itemLevel(u,id){return Math.max(1,Math.min(ITEM_RARITIES.length,u?.itemLevels?.[id]||1));}
export function itemRarity(level){return ITEM_RARITIES[Math.max(0,Math.min(ITEM_RARITIES.length-1,level-1))];}
export function itemUpgradeCost(id,level){const item=ITEMS[id];if(!item||level>=ITEM_RARITIES.length)return Infinity;return Math.round(item.cost*[.72,1.08,1.62,2.4][level-1]/5)*5;}
export function evolvedItem(id,level=1){
  const item=ITEMS[id],power=itemRarity(level).power,out={...item};if(!item)return null;
  for(const [key,value] of Object.entries(item))if(typeof value==='number'&&!['cost'].includes(key))out[key]=MULTIPLIERS.has(key)?(value>=1?1+(value-1)*power:Math.max(.3,1-(1-value)*power)):value*power;
  return out;
}
export function itemEffects(id,level=1){
  const item=evolvedItem(id,level);if(!item)return [];
  return Object.entries(EFFECT_LABELS).filter(([key])=>Number.isFinite(item[key])).map(([key,definition])=>({key,label:definition.label,value:item[key],display:definition.format(item[key])}));
}
export function combatStats(u){
  const l=u.levels,equipped=Object.values(u.equipment||{}).map(id=>evolvedItem(id,itemLevel(u,id))).filter(Boolean);
  const cards=cardEffects(u.cards);
  const product=key=>equipped.reduce((v,item)=>v*(item[key]??1),1);
  const sum=key=>equipped.reduce((v,item)=>v+(item[key]??0),0);
  const utility=4*(1-Math.exp(-l.utility/4));
  const baseInterval=l.speed<=4?B.troll.interval*B.troll.speedFactor**l.speed:.32+(B.troll.interval*B.troll.speedFactor**4-.32)*.9**(l.speed-4);
  return {
    damage:scaled(B.troll.damage*B.troll.damageGrowth**Math.min(4,l.damage),B.progression.trollDamageGrowth,l.damage-4)*product('damage'),
    interval:Math.max(.25,baseInterval*product('interval')*(cards.frenzy?Math.pow(1-cards.frenzy,Math.min(2,u.combo||0)):1)),
    armor:Math.max(0,B.troll.armor+B.troll.armorPerLevel*(Math.min(4,l.armor)+Math.log2(1+Math.max(0,l.armor-4)))+sum('armor')+cards.armor),
    combatRegen:((B.troll.combatRegenRate+B.troll.combatRegenPerLevel*Math.min(B.troll.regenLevelCap,l.regen))*product('regen'))+cards.combatRegen,
    restRegen:((B.troll.restRegenRate+B.troll.restRegenPerLevel*Math.min(B.troll.regenLevelCap,l.regen))*product('regen'))+cards.restRegen,
    regenDelay:Math.max(1.5,B.troll.regenDelay+sum('regenDelay')+cards.regenDelay),
    siege:(1+B.troll.siegeFoundationPerLevel*Math.min(4,l.siege)+B.troll.siegePerLevel*Math.max(0,l.siege-4))*product('siege')*cards.siege,
    movement:B.troll.speed*(1+.4*(1-Math.exp(-l.movement/5)))*product('movement')*cards.movement,
    maxHp:trollHealth(l.health)*product('health')*cards.health,
    range:B.troll.range+sum('range'),heavy:B.troll.heavy*product('heavy'),
    dashCooldown:B.troll.dashCooldown/(1+utility*.1)*product('dashCooldown'),
    roarDuration:B.troll.roarDuration+utility+sum('roar')+cards.roar,
    opening:B.combat.openingBonus+sum('opening')+cards.opening,drain:sum('drain')+cards.drain+(l.lifesteal||0)*.005,
    drainCap:Math.max(.01,...equipped.map(item=>item.drainCap||0)),
    structureDrain:sum('structureDrain')+cards.structureDrain,structureDrainCap:B.troll.structureDrainCap,
    heavyCooldown:B.troll.heavyCooldown*cards.heavyCooldown,heavyStructure:cards.heavyStructure,
    structureHeal:cards.structureHeal,stunResistance:cards.stunResistance,
    executeThreshold:B.legendary.executeThreshold+cards.executeThreshold,objectiveGold:cards.objectiveGold
  };
}
export function upgradePreview(u,key){
  const a=combatStats(u),b=combatStats({...u,levels:{...u.levels,[key]:u.levels[key]+1}});
  const fields={damage:['damage','dano'],speed:['interval','s entre golpes'],movement:['movement','m/s'],lifesteal:['drain','roubo de vida'],health:['maxHp','vida'],armor:['armor','armadura'],regen:['restRegen','× vida máxima/s fora de combate'],siege:['siege','× contra estruturas'],utility:['roarDuration','s de silêncio']};
  const [field,label]=fields[key];if(key==='lifesteal')return `${(a[field]*100).toFixed(1)}% → ${(b[field]*100).toFixed(1)}% ${label}`;if(key==='regen')return `${(a[field]*100).toFixed(2)}% → ${(b[field]*100).toFixed(2)}% vida/s fora de combate`;return `${a[field].toFixed(2)} → ${b[field].toFixed(2)} ${label}`;
}
