import { BALANCE as B, scaled, trollHealth } from './config.js';

export const EQUIPMENT_SLOTS={weapon:'Arma',body:'Proteção',relic:'Relíquia'};
export const ITEMS={
  maul:{name:'Marreta de cerco',slot:'weapon',cost:220,description:'+45% cerco e pesado +15%. Golpes 15% mais lentos; dano base −10%.',siege:1.45,heavy:1.15,interval:1.15,damage:.9},
  claws:{name:'Garras da caça',slot:'weapon',cost:210,description:'Golpes 18% mais rápidos; dano −10% e cerco −15%.',interval:.82,damage:.9,siege:.85},
  edge:{name:'Lâmina longa',slot:'weapon',cost:240,description:'+0,8 m de alcance e +8% dano. Favorece controlar distância.',range:.8,damage:1.08},
  carapace:{name:'Couraça de pedra',slot:'body',cost:190,description:'+4 armadura; movimento −8%.',armor:4,movement:.92},
  mantle:{name:'Manto do vento',slot:'body',cost:200,description:'+10% movimento; esquiva recarrega 25% antes; vida −10%.',movement:1.1,dashCooldown:.75,health:.9},
  moss:{name:'Musgo vivo',slot:'body',cost:200,description:'+45% regeneração; começa 1 s antes; armadura −2.',regen:1.45,regenDelay:-1,armor:-2},
  totem:{name:'Totem do silêncio',slot:'relic',cost:200,description:'Rugido dura +1,25 s. Crie uma janela de cerco.',roar:1.25},
  hunt:{name:'Selo da caça',slot:'relic',cost:180,description:'Primeiro acerto em 1,2 s após esquivar: +35% dano adicional.',opening:.35},
  amber:{name:'Âmbar vital',slot:'relic',cost:230,description:'Cura 4% do dano real a unidades; 1,5% a estruturas. Até 1% da vida por golpe.',drain:.04}
};
export const BUILDS={
  siege:{name:'Cerco',description:'Abra a entrada durante o silêncio das torres.',items:['maul','carapace','totem']},
  hunter:{name:'Caçador',description:'Esquive, acerte e reposicione; sacrifique resistência.',items:['claws','mantle','hunt']},
  sustain:{name:'Sustentação',description:'Controle a distância e recupere-se entre investidas.',items:['edge','moss','amber']}
};
export function combatStats(u){
  const l=u.levels,equipped=Object.values(u.equipment||{}).map(id=>ITEMS[id]).filter(Boolean);
  const product=key=>equipped.reduce((v,item)=>v*(item[key]??1),1);
  const sum=key=>equipped.reduce((v,item)=>v+(item[key]??0),0);
  const utility=4*(1-Math.exp(-l.utility/4));
  const baseInterval=l.speed<=4?B.troll.interval*B.troll.speedFactor**l.speed:.32+(B.troll.interval*B.troll.speedFactor**4-.32)*.9**(l.speed-4);
  return {
    damage:scaled(B.troll.damage*B.troll.damageGrowth**Math.min(4,l.damage),B.progression.trollDamageGrowth,l.damage-4)*product('damage'),
    interval:Math.max(.25,baseInterval*product('interval')),
    armor:Math.max(0,B.troll.armor+3*(Math.min(4,l.armor)+Math.log2(1+Math.max(0,l.armor-4)))+sum('armor')),
    regen:(B.troll.regen+B.troll.regenPerLevel*l.regen)*product('regen'),
    regenDelay:Math.max(3,B.troll.regenDelay+sum('regenDelay')),
    siege:(1+B.troll.siegePerLevel*l.siege)*product('siege'),
    movement:B.troll.speed*(1+.4*(1-Math.exp(-l.movement/5)))*product('movement'),
    maxHp:trollHealth(l.health)*product('health'),
    range:B.troll.range+sum('range'),heavy:B.troll.heavy*product('heavy'),
    dashCooldown:B.troll.dashCooldown/(1+utility*.1)*product('dashCooldown'),
    roarDuration:B.troll.roarDuration+utility+sum('roar'),
    opening:B.combat.openingBonus+sum('opening'),drain:sum('drain')
  };
}
export function upgradePreview(u,key){
  const a=combatStats(u),b=combatStats({...u,levels:{...u.levels,[key]:u.levels[key]+1}});
  const fields={damage:['damage','dano'],speed:['interval','s entre golpes'],health:['maxHp','vida'],armor:['armor','armadura'],regen:['regen','vida/s'],movement:['movement','m/s'],siege:['siege','× contra estruturas'],utility:['roarDuration','s de silêncio']};
  const [field,label]=fields[key];return `${a[field].toFixed(2)} → ${b[field].toFixed(2)} ${label}`;
}
