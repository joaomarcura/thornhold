import * as T from 'three';
import { heightAt, walkable, toCell } from '../shared/map.js';
import { riverSectionAt, riverProfileAt } from '../shared/scenery.js';
import { coastalField } from '../shared/coast.js';

const box=new T.BoxGeometry(1,1,1),stone=new T.IcosahedronGeometry(1,0),shrubGeometry=new Map();
box.userData.shared=stone.userData.shared=true;
// A small presentation-only clearance prevents the deck and the unexcavated
// riverbank from sharing the same depth. Navigation/collision stay at heightAt.
const deckClearance=.025;
function combined(parts){
  const positions=[],normals=[];
  for(const {geometry,position=[0,0,0],scale=[1,1,1],rotation=[0,0,0]} of parts){
    const g=geometry.index?geometry.toNonIndexed():geometry.clone(),matrix=new T.Matrix4().compose(new T.Vector3(...position),new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(...scale));g.applyMatrix4(matrix);
    positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);g.dispose();
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.computeBoundingSphere();g.userData.shared=true;return g;
}
export function bushGeometry(kind){
  if(shrubGeometry.has(kind))return shrubGeometry.get(kind);
  const parts=[];
  if(kind==='fern'){
    const leaf=new T.ConeGeometry(1,1,3);
    for(let i=0;i<7;i++){const a=i/7*Math.PI*2;parts.push({geometry:leaf,position:[Math.cos(a)*.38,.45,Math.sin(a)*.38],scale:[.24,1.2,.1],rotation:[Math.sin(a)*.75,a,-Math.cos(a)*.75]});}
    const geometry=combined(parts);leaf.dispose();shrubGeometry.set(kind,geometry);
  }else if(kind==='reeds'){
    const reed=new T.CylinderGeometry(.035,.055,1,3,1,true);
    for(let i=0;i<5;i++){const a=i/5*Math.PI*2,h=1.3+(i%3)*.22;parts.push({geometry:reed,position:[Math.cos(a)*.34,h/2,Math.sin(a)*.34],scale:[1,h,1],rotation:[0,a,(i%2?1:-1)*.08]});parts.push({geometry:stone,position:[Math.cos(a)*.34,h-.07,Math.sin(a)*.34],scale:[.065,.18,.065]});}
    const geometry=combined(parts);reed.dispose();shrubGeometry.set(kind,geometry);
  }else{
    for(let i=0;i<4;i++){const a=i/3*Math.PI*2;parts.push({geometry:stone,position:[Math.cos(a)*.4,i===3?1:.6,Math.sin(a)*.4],scale:[i===3?.55:.68,i===3?.4:.6,.6]});}
    shrubGeometry.set(kind,combined(parts));
  }
  return shrubGeometry.get(kind);
}
function instances(parent,geometry,material,parts,{shadows=false}={}){
  if(!parts.length)return null;
  const mesh=new T.InstancedMesh(geometry,material,parts.length),dummy=new T.Object3D();
  for(let i=0;i<parts.length;i++){
    const p=parts[i];dummy.position.set(...p.position);dummy.scale.set(...p.scale);dummy.rotation.set(...(p.rotation||[0,0,0]));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);if(p.color)mesh.setColorAt(i,new T.Color(p.color));
  }
  mesh.instanceMatrix.setUsage(T.StaticDrawUsage);mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.castShadow=shadows;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function waterMesh(map,river){
  const positions=[],colors=[],indices=[],color=new T.Color();
  for(let i=0;i<river.points.length;i++){
    const p=river.points[i],section=riverSectionAt(river,p.x),y=heightAt(map,p.x,p.z)-.9;
    for(const side of [-1,0,1]){positions.push(p.x,y,p.z+side*section.width/2);color.setHex(side?0x527e73:0x225d6a);colors.push(color.r,color.g,color.b);}
    if(i){const a=(i-1)*3,b=i*3;for(let j=0;j<2;j++)indices.push(a+j,b+j+1,b+j,a+j,a+j+1,b+j+1);}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
  const mesh=new T.Mesh(g,new T.MeshStandardMaterial({vertexColors:true,roughness:.34,metalness:.12}));mesh.name='Água · '+river.name;mesh.receiveShadow=true;return mesh;
}
export function bridgeEdges(map,bridge){
  const cells=new Set(bridge.cells.map(p=>{const c=toCell(map,p);return `${c.x}:${c.z}`;})),edges=[];
  for(const p of bridge.cells){const c=toCell(map,p);
    for(const side of [-1,1]){
      if(cells.has(`${c.x+side}:${c.z}`)||walkable(map,c.x+side,c.z))continue;
      const x=p.x+side*(map.cell/2-.08),fromZ=p.z-map.cell/2,toZ=p.z+map.cell/2;
      edges.push({cell:p,from:{x,y:heightAt(map,x,fromZ),z:fromZ},to:{x,y:heightAt(map,x,toZ),z:toZ}});
    }
  }
  return edges;
}
function createOcean(map,root){
  if(!map.ocean)return;
  const {level,margin}=map.ocean,size=(map.size-1)*map.cell,geometry=new T.PlaneGeometry(size+margin*2,size+margin*2);
  geometry.rotateX(-Math.PI/2);geometry.computeBoundingSphere();
  // Opaque, unlit water: no reflection pass, transparency sorting, simulation,
  // shadow pass or per-frame allocations. Existing fog hides the outer edge.
  const ocean=new T.Mesh(geometry,new T.MeshBasicMaterial({color:0x366c73}));ocean.position.set(size/2,level,size/2);ocean.name='Mar · horizonte';root.add(ocean);
  const marks=[],quay=[],anchors=[],palms=[],flowers=[];
  for(const base of map.bases){
    const coast=base.coast;if(!coast)continue;
    const sideways={x:coast.axis==='z'?1:0,z:coast.axis==='x'?1:0};
    for(let side=-coast.halfWidth;side<=coast.halfWidth;side+=map.cell){
      const x=base.x+coast.dx*coast.edge+sideways.x*side,z=base.z+coast.dz*coast.edge+sideways.z*side;
      // Low quay stones make the existing non-traversable coast boundary
      // visible instead of removing the forest and leaving an invisible wall.
      const c=toCell(map,{x:x-coast.dx*.2,z:z-coast.dz*.2});if(!walkable(map,c.x,c.z))continue;
      quay.push({position:[x,heightAt(map,x,z)+.2,z],scale:[.55,.4,.55],rotation:[0,side*.3,0]});
    }
    for(let i=0;i<3;i++){
      const distance=coast.edge+(coast.rampLength||0)+map.cell*(3+i*2),x=base.x+coast.dx*distance,z=base.z+coast.dz*distance;
      marks.push({position:[x,level+.035,z],scale:[coast.axis==='z'?coast.halfWidth*1.3:.055,.012,coast.axis==='x'?coast.halfWidth*1.3:.055]});
    }
  }
  for(const spot of map.fishingSpots||[]){
    // Small slatted deck on existing walkable sand, not a new ocean route.
    const y=heightAt(map,spot.x,spot.z);
    for(let i=0;i<7;i++){const shift=(i-3)*.38;
      anchors.push({position:[spot.x+(spot.facing.x?shift:0),y+.025,spot.z+(spot.facing.z?shift:0)],scale:[spot.facing.x?.35:2.25,.05,spot.facing.z?.35:2.25]});
    }
    for(const side of [-1,1])anchors.push({position:[spot.x+(spot.facing.z?side*1.02:0),y+.2,spot.z+(spot.facing.x?side*1.02:0)],scale:[.12,.4,.12]});
    for(const side of [-1,1]){const x=spot.x+(spot.facing.z?side*3.5:0)-spot.facing.x,z=spot.z+(spot.facing.x?side*3.5:0)-spot.facing.z,c=toCell(map,{x,z});
      if(walkable(map,c.x,c.z)&&map.trees.every(t=>Math.hypot(t.x-x,t.z-z)>1.5))palms.push({position:[x,heightAt(map,x,z),z],scale:[1,1,1],rotation:[0,side*.7,0]});
    }
  }
  for(const base of map.bases)for(let i=0;i<10;i++){const a=i*2.39996,x=base.x+Math.cos(a)*(3+i%3),z=base.z+Math.sin(a)*(3+i%3),cell=toCell(map,{x,z});if(walkable(map,cell.x,cell.z)&&map.trees.every(t=>Math.hypot(t.x-x,t.z-z)>1.2))flowers.push({position:[x,heightAt(map,x,z)+.15,z],scale:[.12,.17,.12],color:[0xe0bb78,0xce9cbc,0xbab8e7][i%3]});}
  const foam=instances(root,box,new T.MeshBasicMaterial({color:0x7fb2ae}),marks);if(foam){foam.name='Mar · espuma estática';foam.receiveShadow=false;}
  const stones=instances(root,stone,new T.MeshStandardMaterial({color:0x9b9e8c,roughness:1}),quay);if(stones)stones.name='Costa · limite da praia';
  const landing=instances(root,box,new T.MeshStandardMaterial({color:0x907251,roughness:1}),anchors);if(landing)landing.name='Praia · locais de pesca';
  const positions=[],indices=[],extent=(map.size-1)*map.cell;
  for(const base of map.bases){const c=base.coast;if(!c)continue;const start=c.edge+map.cell*1.5,end=start+c.rampLength,coordinate=c.axis==='x'?base.x:base.z,boundary=c.sign>0?extent-coordinate:coordinate,from=Math.max(start,boundary);if(from>=end)continue;
    const width=c.halfWidth+map.cell,offset=positions.length/3;
    for(let i=0;i<=8;i++)for(const side of [-width,width]){const along=from+(end-from)*i/8,x=base.x+c.dx*along+(c.axis==='z'?side:0),z=base.z+c.dz*along+(c.axis==='x'?side:0),p=(along-start)/c.rampLength;positions.push(x,base.height+(level-.12-base.height)*p,z);}
    for(let i=0;i<8;i++){const a=offset+i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
  }
  if(positions.length){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();const bank=new T.Mesh(g,new T.MeshStandardMaterial({color:0xb7a17a,roughness:1,side:T.DoubleSide}));bank.name='Praia · rampas até o mar';root.add(bank);}
  const trunk=instances(root,palmGeometry(false),new T.MeshStandardMaterial({color:0x8d7354,roughness:1}),palms);if(trunk)trunk.name='Praia · coqueiros troncos';
  const leaves=instances(root,palmGeometry(true),new T.MeshStandardMaterial({color:0x638354,roughness:1,side:T.DoubleSide}),palms);if(leaves)leaves.name='Praia · coqueiros folhas';
  const blooms=instances(root,stone,new T.MeshStandardMaterial({color:0xffffff,roughness:1}),flowers);if(blooms)blooms.name='Clareira · flores';
}
const palmGeometries=new Map();
function palmGeometry(leaves){if(palmGeometries.has(leaves))return palmGeometries.get(leaves);const parts=[],source=leaves?new T.ConeGeometry(1,1,3):new T.CylinderGeometry(.09,.17,1,7);
  if(leaves)for(let i=0;i<7;i++){const a=i/7*Math.PI*2;parts.push({geometry:source,position:[Math.cos(a)*.8,3.3,Math.sin(a)*.8],scale:[.3,2.2,.065],rotation:[Math.sin(a)*1.27,a,-Math.cos(a)*1.27]});}
  else for(let i=0;i<4;i++)parts.push({geometry:source,position:[i*i*.025,.43+i*.8,0],scale:[1-i*.08,.86,1-i*.08],rotation:[0,0,-.06*i]});
  const result=combined(parts);source.dispose();palmGeometries.set(leaves,result);return result;
}
export function createEnvironment(map,coast=coastalField(map)){
  const root=new T.Group();root.name='Rios, pontes e vegetação';
  createOcean(map,root);
  const timber=[],supports=[],ripples=[],bankStones=[];
  const timberPart=(x,y,z,sx,sy,sz)=>timber.push({position:[x,y,z],scale:[sx,sy,sz]});
  for(const river of map.rivers||[]){
    if(!river.points)continue;
    root.add(waterMesh(map,river));
    for(let i=3;i<river.points.length-3;i+=2){
      const p=river.points[i],section=riverSectionAt(river,p.x),y=heightAt(map,p.x,p.z);
      // A few static current marks, not per-frame particles or transparent layers.
      if(i%4===3)ripples.push({position:[p.x,y-.884,p.z+Math.sin(i)*section.width*.22],scale:[1.4,.012,.06],rotation:[0,.13*Math.cos(i),0]});
      for(const side of [-1,1]){const z=p.z+side*(section.width/2+.6),bed=heightAt(map,p.x,z)-(riverProfileAt(map,p.x,z)?.depth||0);bankStones.push({position:[p.x,bed+.15,z],scale:[.28+(i%3)*.08,.25,.32],rotation:[0,i,0]});}
    }
  }
  for(const bridge of map.bridges||[]){
    if(!bridge.cells)continue;
    // Four planks per traversable cell, with only 2.5 cm of visual clearance.
    // Bank/entry tiles can be dry: their ground must not be coplanar with wood.
    for(const p of bridge.cells)for(let i=0;i<4;i++){
      const z=p.z+((i+.5)/4-.5)*map.cell,y=heightAt(map,p.x,z);
      timberPart(p.x,y-.12+deckClearance,z,map.cell-.018,.24,map.cell/4-.02);
    }
    const posts=new Map();
    for(const {from:a,to:b} of bridgeEdges(map,bridge)){
      posts.set(`${a.x.toFixed(3)}:${a.z.toFixed(3)}`,a);posts.set(`${b.x.toFixed(3)}:${b.z.toFixed(3)}`,b);
      for(const h of [.48,1])timber.push({position:[a.x,(a.y+b.y)/2+h,(a.z+b.z)/2],scale:[.12,.12,Math.hypot(b.z-a.z,b.y-a.y)],rotation:[-Math.atan2(b.y-a.y,b.z-a.z),0,0]});
    }
    let postIndex=0;
    for(const {x,y,z} of posts.values()){
      timberPart(x,y+.6,z,.17,1.2,.17);
      const depth=riverProfileAt(map,x,z)?.depth||0,bottom=y-depth-.25,top=y-.23;
      if(postIndex++%3===0&&depth>.3)supports.push({position:[x,(bottom+top)/2,z],scale:[.45,top-bottom,.5]});
    }
  }
  const bridgeTimber=instances(root,box,new T.MeshStandardMaterial({color:0x83603e,roughness:.95}),timber,{shadows:true});
  if(bridgeTimber)bridgeTimber.name='Pontes · madeira';
  instances(root,box,new T.MeshStandardMaterial({color:0x66736c,roughness:1}),supports);
  instances(root,stone,new T.MeshStandardMaterial({color:0x6d8378,roughness:1}),bankStones);
  instances(root,box,new T.MeshStandardMaterial({color:0x8caea4,roughness:.6}),ripples);
  const chunks=new Map();
  for(const p of map.bushes||[]){if(coast.zones[Math.round(p.z/map.cell)*map.size+Math.round(p.x/map.cell)])continue;const key=p.kind+':'+Math.floor(p.x/48)+':'+Math.floor(p.z/48),list=chunks.get(key)||[];list.push(p);chunks.set(key,list);}
  const shades={round:0x51734a,fern:0x396755,berry:0x668555,reeds:0x8a9563},foliageMaterials=new Map(),berries=[];
  for(const list of chunks.values()){
    const kind=list[0].kind;if(!foliageMaterials.has(kind))foliageMaterials.set(kind,new T.MeshStandardMaterial({color:shades[kind],roughness:1,side:kind==='fern'?T.DoubleSide:T.FrontSide}));
    const parts=list.map(p=>({position:[p.x,heightAt(map,p.x,p.z),p.z],scale:[p.scale,p.scale,p.scale],rotation:[0,p.rotation,0]}));instances(root,bushGeometry(kind),foliageMaterials.get(kind),parts);
    for(const p of list)if(kind==='berry')for(let i=0;i<3;i++)berries.push({position:[p.x+Math.cos(p.rotation+i*2)*.48*p.scale,heightAt(map,p.x,p.z)+.85*p.scale,p.z+Math.sin(p.rotation+i*2)*.48*p.scale],scale:[.08,.08,.08]});
  }
  instances(root,stone,new T.MeshStandardMaterial({color:0xc29477,roughness:1}),berries);
  root.userData.bushCount=map.bushes?.length||0;root.userData.bridgeCount=map.bridges?.length||0;
  return root;
}
