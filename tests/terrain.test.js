import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, heightAt, flatGround, pathfind, toCell, index, lineOfSight } from '../shared/map.js';
import { Match } from '../shared/simulation.js';
import { STATES, distance } from '../shared/config.js';
import { TacticalMap } from '../client/tactical-map.js';

test('Refúgios variam em espaço, madeira e altura; núcleos e portões permanecem planos',()=>{
  for(const size of ['compact','large'])for(let seed=0;seed<20;seed++){
    const map=generateMap('terrain-'+seed,size);
    assert.equal(map.bases.length,12);assert.equal(new Set(map.bases.map(b=>b.rx*b.rz)).size,3);
    assert.equal(new Set(map.bases.map(b=>b.wood)).size,3);
    assert.ok(map.bases.some(b=>b.height<0)&&map.bases.some(b=>b.height>0));
    for(const b of map.bases){assert.ok(flatGround(map,b.x,b.z,4.5),`core ${seed} ${b.id}`);assert.ok(flatGround(map,b.gate.x,b.gate.z,1.55),`gate ${seed} ${b.id}`);assert.ok(Math.abs(heightAt(map,b.x,b.z)-b.height)<.001);assert.equal(map.trees.filter(t=>t.baseId===b.id).length,b.capacity);}
    for(const d of map.decor){const c=toCell(map,d);assert.equal(map.grid[index(map,c.x,c.z)],1,'Cenário sólido não invade o corredor');}
  }
});

test('Elfo e Troll atravessam fisicamente todas as rampas, nos dois sentidos, sem teleporte',()=>{
  for(const size of ['compact','large'])for(const seed of ['RAMP-CHECK','THORNHOLD','seed-12'])for(const role of ['elf','troll']){
    const m=new Match({seed,mapSize:size},[{id:'walker',role,occupant:{type:'human',name:'Walker'}}]);m.state=STATES.ACTIVE;
    const u=m.unit('walker'),speed=role==='elf'?6.2:m.trollStats(u).movement;
    for(const base of m.map.bases){Object.assign(u,m.map.trollSpawn);const route=pathfind(m.map,u,base);assert.ok(route.length);
      const both=[...route,...route.slice(0,-1).reverse(),m.map.trollSpawn];
      for(const p of both){let steps=0;while(distance(u,p)>.06&&steps++<120){const d=distance(u,p);u.input={x:(p.x-u.x)/d,z:(p.z-u.z)/d};m.movement(u,Math.min(.025,d/(speed*2)));}assert.ok(distance(u,p)<.1,`${role} ${seed} ${base.id}: ${u.x},${u.z} -> ${p.x},${p.z}`);}
    }
  }
});

test('Declive artificial não permite atravessar penhasco ou construir fundação inclinada',()=>{
  const m=new Match({},[{id:'e',role:'elf',occupant:{type:'human',name:'Elf'}}]),u=m.unit('e'),b=m.map.bases[0];
  Object.assign(u,{x:b.x+4.4,z:b.z});assert.equal(m.placement(u,'core',b.x,b.z),null);
  m.map.heights[index(m.map,b.cx,b.cz)]+=6;
  assert.equal(flatGround(m.map,b.x,b.z,1.55),false);
  assert.ok(m.placement(u,'core',b.x,b.z));
  Object.assign(u,{x:b.x+2.2,z:b.z});assert.equal(m.positionValid(u,u.x-.25,u.z),false);
});

test('Mapa revela trilhas e portões somente com visão real, preservando a memória do terreno',()=>{
  const map=generateMap('FOG-TERRAIN'),tactical=new TacticalMap(map),u={id:'t',role:'troll',alive:true,...map.trollSpawn};
  tactical.update({time:1,units:[u],structures:[]},u);
  assert.equal(tactical.seenBases.size,0);assert.ok(tactical.explored.some(Boolean));
  const b=map.bases[0],k=index(map,b.cx,b.cz);assert.equal(tactical.explored[k],0);assert.equal(lineOfSight(map,u,b),false);
  Object.assign(u,{x:b.x,z:b.z});tactical.update({time:2,units:[u],structures:[]},u);assert.ok(tactical.seenBases.has(b.id));assert.equal(tactical.explored[k],1);
  Object.assign(u,map.trollSpawn);tactical.update({time:3,units:[u],structures:[]},u);assert.equal(tactical.explored[k],1);assert.equal(tactical.visible[k],0);
});
