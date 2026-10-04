import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Vector3 } from 'three';
import { generateMap, randomFor, heightAt, toCell, walkable, index } from '../shared/map.js';
import { populateScenery, riverProfileAt } from '../shared/scenery.js';
import { terrainMesh } from '../client/terrain.js';
import { createEnvironment, bushGeometry, bridgeEdges } from '../client/environment.js';
import { MouseLook } from '../client/mouse-look.js';
import { DEFAULT_BINDINGS } from '../client/preferences.js';

test('river scenery is deterministic, covers solo/co-op and does not change authoritative gameplay',()=>{
  for(const coop of [false,true])for(const size of ['compact','large'])for(const style of ['woodland','deepForest','crossroads']){
    const map=generateMap('ENVIRONMENT-'+style,size,style,{coop}),again=generateMap(map.seed,size,style,{coop});
    assert.deepEqual(map,again);
    const before=structuredClone({grid:map.grid,heights:map.heights,bases:map.bases,trees:map.trees,tunnels:map.coopTunnels});
    populateScenery(map,randomFor);
    assert.deepEqual({grid:map.grid,heights:map.heights,bases:map.bases,trees:map.trees,tunnels:map.coopTunnels},before);
    assert.equal(map.rivers.length,1);assert.ok(map.bridges.length>0&&map.bridges.length<20);assert.ok(map.validation.every(v=>v.valid));
    for(const bridge of map.bridges){assert.ok(walkable(map,...Object.values(toCell(map,bridge))));for(const p of bridge.cells){const c=toCell(map,p);assert.ok(walkable(map,c.x,c.z));}}
  }
  const a=generateMap('SCENERY-A'),b=generateMap('SCENERY-B');assert.notDeepEqual(a.rivers[0].points,b.rivers[0].points);
});

test('every excavated road tile is covered by a real bridge deck, while resources and bases stay dry',()=>{
  const map=generateMap('THORNHOLD'),deckCells=new Set(map.bridges.flatMap(b=>b.cells.map(p=>{const c=toCell(map,p);return index(map,c.x,c.z);}))); 
  for(let z=0;z<map.size;z++)for(let x=0;x<map.size;x++)if(walkable(map,x,z)&&riverProfileAt(map,x*map.cell,z*map.cell))assert.ok(deckCells.has(index(map,x,z)));
  for(const base of map.bases)for(const p of [base,base.gate])assert.equal(riverProfileAt(map,p.x,p.z),null);
  for(const tree of map.trees)assert.equal(riverProfileAt(map,tree.x,tree.z),null);
  const terrain=terrainMesh(map),position=terrain.geometry.attributes.position;
  const river=map.rivers[0],p=river.points[Math.floor(river.points.length/2)],c=toCell(map,p),k=index(map,c.x,c.z);
  assert.ok(position.getY(k)<heightAt(map,c.x*map.cell,c.z*map.cell)-1,'A water rectangle is not enough: the bed is actually excavated');
  terrain.geometry.dispose();terrain.material.dispose();
});

test('four different shrubs are shared static geometry; scenery batches stay bounded without extra lights',()=>{
  const map=generateMap('THORNHOLD'),environment=createEnvironment(map),variants=['round','fern','berry','reeds'];
  assert.ok(map.bushes.length>0&&map.bushes.length<=180);
  for(const p of map.bushes){assert.ok(variants.includes(p.kind));const c=toCell(map,p);assert.equal(walkable(map,c.x,c.z),false);assert.equal(riverProfileAt(map,p.x,p.z),null);}
  for(const kind of variants){assert.equal(bushGeometry(kind),bushGeometry(kind));assert.ok(bushGeometry(kind).attributes.position.count<400);}
  const meshes=[];environment.traverse(o=>{assert.ok(!o.isLight);if(o.isMesh){meshes.push(o);assert.ok(o.geometry.boundingSphere||o.isInstancedMesh||o.name.startsWith('Água'));if(o.isInstancedMesh)assert.equal(o.instanceMatrix.usage,35044);}});
  assert.ok(meshes.length<100,`Draw batches: ${meshes.length}`);assert.equal(meshes.filter(m=>m.castShadow).length,1,'Only combined bridge timber casts a new shadow');
  assert.ok(meshes.find(m=>m.name.startsWith('Água')));assert.equal(environment.userData.bridgeCount,map.bridges.length);
  const materials=new Set();environment.traverse(o=>{if(o.geometry&&!o.geometry.userData.shared)o.geometry.dispose();if(o.material)materials.add(o.material);});for(const m of materials)m.dispose();
});

test('bridge railings follow deck footprints, never floating across an L-shaped water gap or blocking a road entry',()=>{
  const map=generateMap('THORNHOLD');let edges=0;
  for(const bridge of map.bridges)for(const edge of bridgeEdges(map,bridge)){
    edges++;assert.ok(bridge.cells.includes(edge.cell));
    assert.ok(Math.abs(edge.from.x-edge.cell.x)<map.cell/2,'Rail must stand inside its plank footprint');
    assert.ok(Math.abs(edge.to.z-edge.from.z-map.cell)<1e-9);const c=toCell(map,edge.cell),side=Math.sign(edge.from.x-edge.cell.x);
    assert.equal(walkable(map,c.x+side,c.z),false,'No rail across a navigable entry');
  }
  assert.ok(edges>0);
});

test('bridge planks stay separated from dry bank terrain without changing collision or adding draw batches',()=>{
  for(const coop of [false,true])for(const seed of ['THORNHOLD','BRIDGE-BANKS']){
    const map=generateMap(seed,'compact','woodland',{coop}),before=structuredClone({grid:map.grid,heights:map.heights}),terrain=terrainMesh(map),environment=createEnvironment(map);
    const position=terrain.geometry.attributes.position,matrix=new Matrix4(),point=new Vector3(),timber=environment.getObjectByName('Pontes · madeira');
    const renderedGround=(x,z)=>{
      const fx=x/map.cell,fz=z/map.cell,ix=Math.floor(fx),iz=Math.floor(fz),u=fx-ix,v=fz-iz,h=(dx,dz)=>position.getY(index(map,ix+dx,iz+dz));
      return u>=v?h(0,0)*(1-u)+h(1,0)*(u-v)+h(1,1)*v:h(0,0)*(1-v)+h(0,1)*(v-u)+h(1,1)*u;
    };
    assert.ok(timber?.isInstancedMesh);let part=0,dryBankSamples=0;
    for(const bridge of map.bridges){
      for(const p of bridge.cells)for(let plank=0;plank<4;plank++){
        timber.getMatrixAt(part++,matrix);
        for(const x of [-.5,0,.5])for(const z of [-.5,0,.5]){
          point.set(x,.5,z).applyMatrix4(matrix);
          const ground=renderedGround(point.x,point.z),clearance=point.y-ground;
          assert.ok(clearance>=.02,`${seed} co-op=${coop}: deck intersects ground at ${point.x},${point.z}: ${clearance}`);
          if(Math.abs(ground-heightAt(map,point.x,point.z))<1e-6)dryBankSamples++;
        }
      }
      // Timber instance order is per bridge: planks, rails, then unique posts.
      const edges=bridgeEdges(map,bridge),posts=new Set(edges.flatMap(e=>[e.from,e.to]).map(p=>`${p.x.toFixed(3)}:${p.z.toFixed(3)}`));
      part+=edges.length*2+posts.size;
    }
    assert.ok(dryBankSamples>0,'Regression must exercise unexcavated/coplanar entry tiles');assert.equal(part,timber.count);
    assert.deepEqual({grid:map.grid,heights:map.heights},before);
    assert.equal(environment.children.filter(mesh=>mesh.castShadow).length,1,'Keep bridge timber in one static batch');
    terrain.geometry.dispose();terrain.material.dispose();const materials=new Set();
    environment.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry&&!o.geometry.userData.shared)o.geometry.dispose();if(o.material)materials.add(o.material);});for(const material of materials)material.dispose();
  }
});

test('Z frees the cursor; a deliberate capture resumes it, including delayed pointer-lock requests',async()=>{
  assert.equal(DEFAULT_BINDINGS.cursor,'KeyZ');assert.equal(Object.values(DEFAULT_BINDINGS).filter(code=>code==='KeyZ').length,1);
  const previous=globalThis.document,doc=new EventTarget();doc.pointerLockElement=null;globalThis.document=doc;
  const changes=[],world={aiming:false,yaw:0,pitch:0};let complete=null;
  doc.exitPointerLock=()=>{doc.pointerLockElement=null;doc.dispatchEvent(new Event('pointerlockchange'));};
  const canvas={requestPointerLock(){return new Promise(resolve=>{complete=()=>{doc.pointerLockElement=canvas;doc.dispatchEvent(new Event('pointerlockchange'));resolve();};});}};
  try{
    const mouse=new MouseLook(canvas,world,locked=>changes.push(locked),error=>assert.fail(error));
    const first=mouse.capture();complete();await first;assert.equal(mouse.locked,true);
    mouse.releaseForUI();assert.equal(mouse.freeCursor,true);assert.equal(mouse.locked,false);assert.equal(world.aiming,false);assert.equal(mouse.move({movementX:50,movementY:40}),false);
    const second=mouse.capture();complete();await second;assert.equal(mouse.freeCursor,false);assert.equal(mouse.locked,true);assert.equal(world.aiming,true);
    mouse.release();const delayed=mouse.capture();mouse.releaseForUI();complete();await delayed;assert.equal(mouse.freeCursor,true);assert.equal(mouse.locked,false,'A pending request must not steal the mouse back from the UI');
    mouse.reset();assert.equal(mouse.freeCursor,false);assert.ok(changes.includes(false)&&changes.includes(true));
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
