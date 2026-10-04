import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, baseZone, heightAt, flatGround, pathfind, toCell, index, lineOfSight, walkable } from '../shared/map.js';
import { Match } from '../shared/simulation.js';
import { BALANCE, STATES, distance } from '../shared/config.js';
import { TacticalMap } from '../client/tactical-map.js';

test('Refúgios variam em espaço, madeira e altura; núcleos e portões permanecem planos',()=>{
  for(const size of ['compact','large'])for(let seed=0;seed<20;seed++){
    const map=generateMap('terrain-'+seed,size);
    assert.equal(map.version,6);assert.equal(map.bases.length,12);assert.ok(new Set(map.bases.map(b=>b.rx*b.rz)).size>=3);
    assert.equal(new Set(map.bases.map(b=>b.wood)).size,3);
    assert.ok(map.trees.every(t=>t.amount===BALANCE.economy.treeStock));
    assert.ok(map.bases.some(b=>b.height<0)&&map.bases.some(b=>b.height>0));
    for(const b of map.bases){assert.ok(flatGround(map,b.x,b.z,4.5),`core ${seed} ${b.id}`);assert.ok(flatGround(map,b.gate.x,b.gate.z,1.55),`gate ${seed} ${b.id}`);assert.ok(Math.abs(heightAt(map,b.x,b.z)-b.height)<.001);assert.equal(map.trees.filter(t=>t.baseId===b.id).length,b.capacity);}
    for(const d of map.decor){const c=toCell(map,d);assert.equal(map.grid[index(map,c.x,c.z)],1,'Cenário sólido não invade o corredor');}
  }
});

test('Protótipos de mapa preservam bases válidas e produzem topologias distintas',()=>{
  const maps=['woodland','deepForest','crossroads'].map(style=>generateMap('MAP-PROTOTYPE','compact',style));
  assert.deepEqual(maps.map(map=>map.style),['woodland','deepForest','crossroads']);
  for(const map of maps){assert.equal(map.bases.length,12);assert.ok(map.validation.every(row=>row.valid));for(const base of map.bases)assert.ok(pathfind(map,map.trollSpawn,base).length);}
  const walkableCount=map=>map.grid.filter(cell=>cell===0).length;
  assert.ok(walkableCount(maps[1])<walkableCount(maps[0]));assert.ok(walkableCount(maps[2])>walkableCount(maps[0]));
});

test('Mapa co-op organiza fortalezas de duas entradas sem invalidar barricadas',()=>{
  const map=generateMap('COOP-COMPOUNDS','large','woodland',{coop:true});
  assert.equal(map.coop,true);assert.equal(map.coopCompounds.length,4);assert.equal(map.coopTunnels.length,4);
  const assigned=new Set();
  for(const compound of map.coopCompounds){
    assert.equal(compound.baseIds.length,2);assert.equal(compound.entrances.length,2);assert.ok(compound.tunnelId);
    const tunnel=map.coopTunnels.find(candidate=>candidate.id===compound.tunnelId),bases=compound.baseIds.map(id=>map.bases.find(base=>base.id===id));
    const blockedEntrances=new Set(compound.entrances.map(entrance=>index(map,entrance.cx,entrance.cz)));
    assert.ok(tunnel&&tunnel.path.length>2);assert.ok(pathfind(map,bases[0],bases[1],blockedEntrances).length,'Aliados precisam atravessar o túnel mesmo com as duas entradas externas fechadas');
    for(const point of tunnel.path){const cell=toCell(map,point);assert.ok(walkable(map,cell.x,cell.z),'O túnel precisa ser fisicamente transitável');}
    for(const baseId of compound.baseIds){
      assert.equal(assigned.has(baseId),false);assigned.add(baseId);
      const base=map.bases.find(candidate=>candidate.id===baseId),validation=map.validation.find(row=>row.base===baseId);
      assert.equal(base.compoundId,compound.id);assert.equal(base.partnerBaseId,compound.baseIds.find(id=>id!==baseId));
      assert.ok(validation.valid&&validation.openings===2&&validation.gateIsCutVertex);
    }
  }
  assert.equal(assigned.size,8);
  assert.equal(map.rivers.length,1);assert.ok(map.bridges.length>0&&map.bridges.length<20);
  for(const bridge of map.bridges){const cell=toCell(map,bridge);assert.ok(walkable(map,cell.x,cell.z));}
  const standard=generateMap('COOP-COMPOUNDS','large');assert.equal(standard.coop,false);assert.equal(standard.coopCompounds.length,0);assert.equal(standard.coopTunnels.length,0);assert.ok(standard.bases.every(base=>!base.compoundId));
  assert.equal(standard.rivers.length,1);assert.ok(standard.bridges.length>0);
});

test('V3.1 amplia lateralmente as bases e organiza Core, Industrial e Frontline sem mover o portão',()=>{
  const legacyUsable=(rx,rz)=>{let cells=1;for(let z=-rz+1;z<rz;z++)for(let x=-rx+1;x<rx;x++)if(!(Math.abs(x)>rx-3&&Math.abs(z)>rz-3))cells++;return cells;};
  for(const size of ['compact','large'])for(let seed=0;seed<20;seed++){
    const map=generateMap(`expanded-${seed}`,size);
    for(const b of map.bases){
      const {legacyRx,legacyRz,lateralExpansion}=b.zones;
      assert.equal(lateralExpansion,2);
      if(b.gate.axis==='x'){assert.equal(b.rx,legacyRx);assert.equal(b.rz,legacyRz+2);assert.equal(Math.abs(b.gate.cx-b.cx),legacyRx);}
      else{assert.equal(b.rx,legacyRx+2);assert.equal(b.rz,legacyRz);assert.equal(Math.abs(b.gate.cz-b.cz),legacyRz);}
      const gain=b.usableCells/legacyUsable(legacyRx,legacyRz)-1;assert.ok(gain>=.28&&gain<=.55,`${b.profile} ganhou ${(gain*100).toFixed(1)}%`);
      const zones={core:0,industrial:0,frontline:0};
      for(let z=b.cz-b.rz+1;z<b.cz+b.rz;z++)for(let x=b.cx-b.rx+1;x<b.cx+b.rx;x++)if(walkable(map,x,z))zones[baseZone(map,b,{x:x*map.cell,z:z*map.cell})]++;
      assert.ok(zones.core>=16&&zones.industrial>=24&&zones.frontline>=16,`${b.id}: ${JSON.stringify(zones)}`);
    }
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
