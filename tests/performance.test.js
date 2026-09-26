import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../shared/simulation.js';

const botLobby=()=>[
  {id:'t',role:'troll',occupant:{type:'bot',name:'Troll',difficulty:'normal'}},
  ...Array.from({length:5},(_,index)=>({id:`e${index}`,role:'elf',occupant:{type:'bot',name:`Elfo ${index}`,difficulty:'normal'}}))
];

test('Snapshot 1x5 respeita orçamento de rede e não expõe estado interno',()=>{
  const match=new Match({seed:'SNAPSHOT-BUDGET',difficulty:'normal',mapSize:'compact'},botLobby());
  for(let tick=0;tick<6000;tick++)match.step(.05);
  for(let index=0;index<100;index++)match.emit('impact',{unit:'t',x:index,z:index});

  const snapshot=match.snapshot(null);
  const bytes=Buffer.byteLength(JSON.stringify(snapshot));
  assert.ok(bytes<55_000,`snapshot do observador excedeu 55 KB: ${bytes}`);
  assert.ok(snapshot.events.length<=32);
  assert.ok(snapshot.structures.every(structure=>!Object.hasOwn(structure,'bounty')&&!Object.hasOwn(structure,'productionPulse')));
  assert.ok(snapshot.wisps.every(wisp=>!Object.hasOwn(wisp,'productionPulse')));
});
