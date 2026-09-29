import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../shared/simulation.js';
import { generateMap, index, pathfind, toCell, traversable, walkable, world } from '../shared/map.js';

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

function referencePathfind(map,from,to,blocked=new Set()){
  const a=toCell(map,from),b=toCell(map,to),start=index(map,a.x,a.z),goal=index(map,b.x,b.z);if(!walkable(map,b.x,b.z)||blocked.has(goal))return [];
  const open=[start],parent=new Map(),g=new Map([[start,0]]),closed=new Set(),heuristic=k=>Math.abs(k%map.size-b.x)+Math.abs(Math.floor(k/map.size)-b.z);
  while(open.length){let best=0;for(let i=1;i<open.length;i++)if(g.get(open[i])+heuristic(open[i])<g.get(open[best])+heuristic(open[best]))best=i;const k=open.splice(best,1)[0];if(k===goal){const result=[];let n=k;while(n!==start){result.push(world(map,n%map.size,Math.floor(n/map.size)));n=parent.get(n);}return result.reverse();}closed.add(k);const x=k%map.size,z=Math.floor(k/map.size);for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,nz=z+dz,n=index(map,nx,nz);if(!traversable(map,x,z,nx,nz)||closed.has(n)||blocked.has(n))continue;const score=g.get(k)+1;if(score<(g.get(n)??Infinity)){parent.set(n,k);g.set(n,score);if(!open.includes(n))open.push(n);}}}return [];
}

test('Pathfinding otimizado preserva exatamente as rotas determinísticas anteriores',()=>{
  for(const seed of ['PATH-EQUIVALENCE-A','PATH-EQUIVALENCE-B','PATH-EQUIVALENCE-C']){
    const map=generateMap(seed),points=[map.trollSpawn,map.elfSpawn,...map.bases.flatMap(base=>[base.outside,{x:base.x,z:base.z}])];
    for(let i=0;i<points.length;i+=2){const from=points[i],to=points[(i*5+7)%points.length],blocked=new Set(i%4===0?[index(map,map.bases[i%map.bases.length].gate.cx,map.bases[i%map.bases.length].gate.cz)]:[]);assert.deepEqual(pathfind(map,from,to,blocked),referencePathfind(map,from,to,blocked),`${seed}:${i}`);}
  }
});
