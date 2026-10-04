import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, baseAt, heightAt, toCell, index, flood, pathfind, walkable } from '../shared/map.js';
import { populateCoast, coastalField, coastalBankHeight } from '../shared/coast.js';
import { terrainMesh } from '../client/terrain.js';
import { createEnvironment } from '../client/environment.js';
import { WorldRenderer } from '../client/renderer.js';
import { Group } from 'three';
import { createSky } from '../client/sky.js';

const gameplay=map=>({grid:map.grid,heights:map.heights,trees:map.trees,trails:map.trails,tunnels:map.coopTunnels,bases:map.bases.map(({coast,...base})=>base)});
function dispose(root){const materials=new Set();root.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry&&!o.geometry.userData.shared)o.geometry.dispose();if(o.material)materials.add(o.material);});for(const material of materials)material.dispose();}

test('coastal bases are deterministic and preserve original navigation, gates, resources and co-op tunnels',()=>{
  for(const coop of [false,true])for(const size of ['compact','large'])for(const style of ['woodland','deepForest','crossroads']){
    const map=generateMap('COAST-'+style,size,style,{coop}),before=generateMap(map.seed,size,style,{coop,coast:false});
    assert.deepEqual(gameplay(map),gameplay(before));const coast=structuredClone({ocean:map.ocean,spots:map.fishingSpots});populateCoast(map);assert.deepEqual({ocean:map.ocean,spots:map.fishingSpots},coast);
    assert.equal(map.fishingSpots.length,12);assert.ok(map.validation.every(row=>row.valid));
    for(const base of map.bases){
      assert.equal(base.coast.sign,-base.gate.sign);const spot=map.fishingSpots.find(p=>p.baseId===base.id);assert.equal(baseAt(map,spot)?.id,base.id);
      assert.ok(map.trees.every(tree=>Math.hypot(tree.x-spot.x,tree.z-spot.z)>=2.6));assert.ok(pathfind(map,base,spot).length);
      assert.ok(map.ocean.level<heightAt(map,spot.x,spot.z));
      const compound=map.coopCompounds.find(c=>c.id===base.compoundId),blocked=new Set((compound?.entrances||[base.gate]).map(g=>index(map,g.cx,g.cz)));
      assert.equal(flood(map,toCell(map,map.trollSpawn),blocked).has(index(map,...Object.values(toCell(map,spot)))),false,'The sea must not provide a third entrance');
    }
  }
});

test('coastal terrain leaves every traversable triangle at the authoritative elevation, including beach edges',()=>{
  for(const coop of [false,true]){
    const map=generateMap('COAST-HEIGHTS','large','woodland',{coop}),field=coastalField(map),mesh=terrainMesh(map,field),position=mesh.geometry.attributes.position;
    let beaches=0,water=0;
    for(let z=0;z<map.size;z++)for(let x=0;x<map.size;x++){
      const k=index(map,x,z);if(field.zones[k]===1)beaches++;if(field.zones[k]===3){water++;assert.equal(walkable(map,x,z),false);assert.ok(position.getY(k)<map.ocean.level);}
      if(!walkable(map,x,z))continue;
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&z+dz>=0&&x+dx<map.size&&z+dz<map.size){const n=index(map,x+dx,z+dz);assert.ok(Math.abs(field.heights[n]-map.heights[n])<1e-6,'Coast must not displace any ground triangle used by movement');}
    }
    assert.ok(beaches>100&&water>100);dispose(mesh);
  }
});

test('the ocean adds at most eight static batches including palms and flowers, with no lights, reflection passes or new shadow casters',()=>{
  const map=generateMap('THORNHOLD'),before=generateMap('THORNHOLD','compact','woodland',{coast:false}),scene=createEnvironment(map),baseline=createEnvironment(before);
  const ocean=scene.getObjectByName('Mar · horizonte');assert.ok(ocean?.isMesh);assert.equal(ocean.material.transparent,false);assert.equal(ocean.receiveShadow,false);assert.equal(ocean.castShadow,false);assert.equal(ocean.geometry.attributes.position.count,4);
  scene.traverse(o=>assert.ok(!o.isLight));
  assert.ok(scene.children.length<=baseline.children.length+8);assert.equal(scene.children.filter(o=>o.castShadow).length,baseline.children.filter(o=>o.castShadow).length);
  for(const o of scene.children.filter(o=>o.name.startsWith('Mar ·')||o.name.startsWith('Costa ·')||o.name.startsWith('Praia ·'))){assert.equal(o.castShadow,false);if(o.isInstancedMesh)assert.equal(o.instanceMatrix.usage,35044);}
  dispose(scene);dispose(baseline);
});

test('reloading a coastal map releases its instance buffers instead of retaining them on the GPU',()=>{
  const scene=createEnvironment(generateMap('COAST-DISPOSE')),parent=new Group(),meshes=[];let disposed=0;
  parent.add(scene);scene.traverse(o=>{if(o.isInstancedMesh){meshes.push(o);o.addEventListener('dispose',()=>disposed++);}});
  WorldRenderer.prototype.clearGroup.call({},parent);assert.equal(parent.children.length,0);assert.ok(meshes.length>0);assert.equal(disposed,meshes.length);
});

test('sand bank descends to ocean outside the collision perimeter without changing co-op travel',()=>{
  const map=generateMap('COAST-RAMP','large','woodland',{coop:true}),field=coastalField(map);let slopes=0;
  for(const base of map.bases){const c=base.coast;let previous=base.height;
    for(let along=c.edge+map.cell*2;along<c.edge+map.cell*1.5+c.rampLength;along+=map.cell){const x=base.x+c.dx*along,z=base.z+c.dz*along,height=coastalBankHeight(map,x,z);assert.ok(height<=previous+.01);previous=height;slopes++;}
  }assert.ok(slopes>50);
});

test('sky reuses one static texture/mesh with no new lights or shadow/reflection passes',()=>{
  const sky=createSky(),other=createSky();assert.equal(sky.geometry,other.geometry);assert.equal(sky.material.map,other.material.map);assert.equal(sky.castShadow,false);assert.equal(sky.receiveShadow,false);assert.equal(sky.material.depthWrite,false);assert.equal(sky.material.fog,false);assert.equal(sky.material.map.image.data.length,512*256*4);sky.traverse(o=>assert.ok(!o.isLight));dispose(sky);dispose(other);
});
