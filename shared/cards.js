import { randomFor } from './map.js';

export const TROLL_CARD_LEVELS=Object.freeze([1,3,5,7,10,13,16,20]);

export const TROLL_CARDS=Object.freeze({
  bloodlust:{name:'Sede de Sangue',rarity:'rare',description:'+8% de roubo de vida contra unidades; +1,5% contra estruturas.',effects:{drain:.08,structureDrain:.015},ai:{hunter:10,sustain:9}},
  battleRegen:{name:'Regeneração de Batalha',rarity:'rare',description:'Recupera +0,20% da vida máxima por segundo durante combate.',effects:{combatRegen:.002},ai:{juggernaut:10,sustain:10,siegebreaker:7}},
  thickHide:{name:'Couro Espesso',rarity:'common',description:'+5 de Armadura.',effects:{armor:5},ai:{juggernaut:10,siegebreaker:6}},
  frenzy:{name:'Frenesi',rarity:'rare',description:'Cada golpe consecutivo acelera os ataques em 7%, até 14%.',effects:{frenzy:.07},ai:{hunter:10,siegebreaker:6}},
  siegebreaker:{name:'Quebra-Muralhas',rarity:'rare',description:'Golpes pesados causam +40% de dano contra estruturas.',effects:{heavyStructure:.4},ai:{siegebreaker:10}},
  predator:{name:'Predador',rarity:'common',description:'O primeiro golpe após a Esquiva recebe +30% de dano adicional.',effects:{opening:.3},ai:{hunter:10}},
  secondWind:{name:'Segundo Fôlego',rarity:'common',description:'Regeneração fora de combate começa 1,5s antes e ganha +0,15% da vida/s.',effects:{regenDelay:-1.5,restRegen:.0015},ai:{sustain:10,juggernaut:7}},
  devour:{name:'Devorar',rarity:'rare',description:'Destruir uma estrutura recupera 5% da vida máxima.',effects:{structureHeal:.05},ai:{siegebreaker:10,sustain:8}},
  colossusHeart:{name:'Coração Colossal',rarity:'common',description:'+12% de vida máxima.',effects:{health:1.12},ai:{juggernaut:10}},
  longStride:{name:'Passos do Caçador',rarity:'common',description:'+10% de velocidade de movimento.',effects:{movement:1.1},ai:{hunter:9}},
  stonebreaker:{name:'Punhos de Pedra',rarity:'common',description:'+22% de dano de cerco.',effects:{siege:1.22},ai:{siegebreaker:9}},
  warCry:{name:'Rugido de Guerra',rarity:'common',description:'O Rugido desativa torres por mais 1,5s.',effects:{roar:1.5},ai:{siegebreaker:8,juggernaut:6}},
  relentless:{name:'Implacável',rarity:'rare',description:'Golpe Pesado recarrega 25% mais rápido.',effects:{heavyCooldown:.75},ai:{siegebreaker:9,hunter:7}},
  unyielding:{name:'Inabalável',rarity:'rare',description:'Atordoamentos contra o Troll duram 35% menos.',effects:{stunResistance:.35},ai:{juggernaut:9}},
  executioner:{name:'Executor',rarity:'legendary',description:'A Espada Lendária executa estruturas abaixo de 22% da vida.',effects:{executeThreshold:.07},ai:{siegebreaker:10}},
  scavenger:{name:'Saqueador',rarity:'common',description:'+20% de ouro por objetivos; não altera ouro de dano.',effects:{objectiveGold:1.2},ai:{hunter:7,siegebreaker:7}},
  titanBlood:{name:'Sangue de Titã',rarity:'legendary',description:'+18% de vida máxima e +3 de Armadura.',effects:{health:1.18,armor:3},ai:{juggernaut:10}},
  cataclysm:{name:'Cataclismo',rarity:'legendary',description:'+15% de cerco e Golpe Pesado +60% contra estruturas.',effects:{siege:1.15,heavyStructure:.6},ai:{siegebreaker:10}}
});

const rarityWeight={common:70,rare:25,legendary:5};
export const xpForTrollLevel=level=>level>=20?Infinity:Math.round(140*Math.pow(level,1.45));
export const cardById=id=>TROLL_CARDS[id]||null;

export function cardEffects(cards=[]){
  const result={armor:0,health:1,movement:1,siege:1,combatRegen:0,restRegen:0,regenDelay:0,drain:0,structureDrain:0,opening:0,roar:0,frenzy:0,heavyStructure:0,heavyCooldown:1,structureHeal:0,stunResistance:0,executeThreshold:0,objectiveGold:1};
  for(const id of cards){const effects=TROLL_CARDS[id]?.effects||{};for(const[key,value]of Object.entries(effects)){
    if(['health','movement','siege','heavyCooldown','objectiveGold'].includes(key))result[key]*=value;else result[key]+=value;
  }}
  return result;
}

export function cardOffer(seed,level,owned=[]){
  const rng=randomFor(`${seed}:troll-cards:${level}`),pool=Object.entries(TROLL_CARDS).filter(([id])=>!owned.includes(id)),offer=[];
  while(offer.length<3&&pool.length){
    const weighted=pool.map(([,card])=>rarityWeight[card.rarity]??1),total=weighted.reduce((a,b)=>a+b,0);let roll=rng()*total,index=0;
    for(;index<pool.length-1&&roll>=weighted[index];index++)roll-=weighted[index];
    offer.push(pool.splice(index,1)[0][0]);
  }
  return offer;
}

export function chooseBotCard(offer,archetype='hunter',seed='THORNHOLD'){
  const rng=randomFor(`${seed}:bot-card:${offer.join(':')}`);
  return offer.map(id=>({id,score:(TROLL_CARDS[id]?.ai?.[archetype]||5)+rng()})).sort((a,b)=>b.score-a.score)[0]?.id;
}
