import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../shared/simulation.js';
import { TROLL_CARDS, cardEffects, cardOffer, xpForTrollLevel } from '../shared/cards.js';
import { STATES } from '../shared/config.js';

const slots=bot=>[
  {id:'t',role:'troll',occupant:{type:bot?'bot':'human',difficulty:'normal',name:'Troll'}},
  ...Array.from({length:5},(_,i)=>({id:`e${i}`,role:'elf',occupant:{type:'bot',difficulty:'normal',name:`Elfo ${i}`}}))
];

test('V3 oferece três cartas úteis e reproduzíveis nos marcos do Troll',()=>{
  const first=cardOffer('CARD-SEED',1,[]),again=cardOffer('CARD-SEED',1,[]);
  assert.deepEqual(first,again);assert.equal(first.length,3);assert.equal(new Set(first).size,3);
  assert.ok(first.every(id=>TROLL_CARDS[id]?.description));
});

test('XP é separado de Gold, sobe Troll Level e enfileira escolhas perdidas',()=>{
  const m=new Match({seed:'CARD-XP',preparation:0},slots(false)),t=m.unit('t'),gold=t.gold;
  m.grantTrollXp(t,xpForTrollLevel(1)+xpForTrollLevel(2)+1,'test');
  assert.equal(t.gold,gold);assert.equal(t.trollLevel,3);assert.equal(t.cardOfferLevel,1);assert.deepEqual(t.pendingCardLevels,[3]);
  const first=t.cardOffer[0];assert.equal(m.act(t.id,{type:'selectCard',card:first}),null);assert.ok(t.cards.includes(first));assert.equal(t.cardOfferLevel,3);assert.equal(t.cardOffer.length,3);
});

test('Cards modificam atributos reais sem consumir Gold',()=>{
  const m=new Match({seed:'CARD-STATS'},slots(false)),t=m.unit('t'),gold=t.gold,before=m.trollStats(t);
  t.cardOffer=['titanBlood'];m.selectTrollCard(t,'titanBlood');const after=m.trollStats(t);
  assert.equal(t.gold,gold);assert.ok(after.maxHp>before.maxHp);assert.ok(after.armor>before.armor);
  assert.equal(cardEffects(['siegebreaker']).heavyStructure,.4);
});

test('Nenhuma carta pode zerar ou bloquear o movimento do Troll',()=>{
  for(const id of Object.keys(TROLL_CARDS)){
    const m=new Match({seed:`MOVE-${id}`,preparation:0},slots(false)),t=m.unit('t');
    t.cardOffer=[id];assert.equal(m.selectTrollCard(t,id),null);assert.ok(m.trollStats(t).movement>0,id);
    m.state=STATES.ACTIVE;const before={x:t.x,z:t.z};m.input(t.id,{x:1,z:0});m.step(.1);
    assert.ok(Math.hypot(t.x-before.x,t.z-before.z)>0,`${id} bloqueou o movimento`);
  }
});

test('Troll bot escolhe uma carta sem pausar a simulação',()=>{
  const m=new Match({seed:'CARD-BOT'},slots(true)),t=m.unit('t');assert.equal(t.cards.length,0);
  m.step(.1);assert.equal(t.cards.length,1);assert.equal(t.cardOffer.length,0);
  assert.equal(t.stats.cardChoices[0].level,1);
});

test('Carta de nível fica enfileirada durante combate e libera após cinco segundos seguros',()=>{
  const m=new Match({seed:'CARD-SAFE',preparation:0},slots(false)),t=m.unit('t');
  assert.equal(m.selectTrollCard(t,t.cardOffer[0]),null);m.state=STATES.ACTIVE;m.time=100;t.lastHit=100;t.lastAttack=99;
  m.grantTrollXp(t,xpForTrollLevel(1)+xpForTrollLevel(2)+1,'test');const choice=t.cardOffer[0];
  assert.ok(choice);assert.deepEqual(m.snapshot(t.id).units.find(u=>u.id===t.id).cardOffer,[]);assert.match(m.act(t.id,{type:'selectCard',card:choice}),/fora de combate/);
  m.time=104.99;assert.deepEqual(m.snapshot(t.id).units.find(u=>u.id===t.id).cardOffer,[]);
  m.time=105.01;assert.deepEqual(m.snapshot(t.id).units.find(u=>u.id===t.id).cardOffer,t.cardOffer);assert.equal(m.act(t.id,{type:'selectCard',card:choice}),null);
});
