import * as T from 'three';
import { BALANCE as B, distance, towerProfile } from '../shared/config.js';
import { generateMap, randomFor, toCell, walkable, heightAt } from '../shared/map.js';
import { terrainMesh, groundRing } from './terrain.js';
import { playerColor } from '../shared/player-identity.js';
import { firstPersonBlend, initialCameraZoom } from './camera-mode.js';
import { FirstPersonViewmodel } from './viewmodel.js';
import { createHeldItem } from './held-item.js';
import { ActionAnimationController } from './action-animation.js';
import { structureVisualProgress, structureVisualSignature, structureVisualTier } from './structure-visuals.js';

const palette={ground:0x364f46,path:0x68705a,stone:0x536568,bark:0x4b4035,leaf:0x345f53,gold:0xeac481,teal:0x80d3bd,troll:0x7f9990,elf:0xa8dbbd};
export const FOLLOW_CAMERA_HEIGHT=Math.sin(.58)*13*.8;
export const followCameraOffset=(yaw,zoom)=>({x:Math.sin(yaw)*Math.cos(.58)*zoom,y:FOLLOW_CAMERA_HEIGHT,z:-Math.cos(yaw)*Math.cos(.58)*zoom});
export const spectatorFlightDelta=(yaw,{forward=0,side=0,vertical=0}={},distance=1)=>({
  x:(-Math.sin(yaw)*forward-Math.cos(yaw)*side)*distance,
  y:vertical*distance,
  z:(Math.cos(yaw)*forward-Math.sin(yaw)*side)*distance
});
export const BUILD_CAMERA_DISTANCE=6.5;
export const BUILD_CAMERA_HEIGHT=8.5;
export const BUILD_CAMERA_BACK=7.5;
export function boundedConstructionPoint(origin,point,yaw,range=B.construction.range){
  const limit=Math.max(.5,range-.5),fallback=Math.min(BUILD_CAMERA_DISTANCE,limit);
  let x=point?.x,z=point?.z;
  if(!Number.isFinite(x)||!Number.isFinite(z)){x=origin.x-Math.sin(yaw)*fallback;z=origin.z+Math.cos(yaw)*fallback;}
  const dx=x-origin.x,dz=z-origin.z,d=Math.hypot(dx,dz);
  if(d>limit){x=origin.x+dx/d*limit;z=origin.z+dz/d*limit;}
  return{x,z};
}
const pointSegmentDistance=(p,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/length)),x=a.x+dx*t,z=a.z+dz*t;return Math.hypot(p.x-x,p.z-z);};
const distanceToTrails=(map,p)=>{let best=Infinity;for(const points of map.trails||[])for(let i=1;i<points.length;i++)best=Math.min(best,pointSegmentDistance(p,points[i-1],points[i]));return best;};
const mat=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.86,flatShading:true,...extra});
const geo={box:new T.BoxGeometry(1,1,1),sphere:new T.IcosahedronGeometry(1,0),cylinder:new T.CylinderGeometry(1,1,1,7),cone:new T.ConeGeometry(1,1,7),torus:new T.TorusGeometry(1,.1,5,16)};
const IDLE_COMBAT=Object.freeze({active:false}),WORK_ANIMATION_KINDS=new Set(['gather','gatherSpecial','repair']);
const setWispOrbit=(target,angle,reduced)=>target.set(Math.cos(angle)*1.7,2.05+(reduced?0:Math.sin(angle*2)*.22),Math.sin(angle)*1.7);
function spatialChunks(items,size=32){const chunks=new Map();for(const item of items){const key=Math.floor(item.x/size)+':'+Math.floor(item.z/size),chunk=chunks.get(key)||[];chunk.push(item);chunks.set(key,chunk);}return chunks.values();}
const sharedGeometries=new Set(Object.values(geo)),materials=new Map();function material(c){if(!materials.has(c)){const value=mat(c);value.userData.shared=true;materials.set(c,value);}return materials.get(c);}
function part(g,shape,color,x,y,z,sx,sy,sz){const mesh=new T.Mesh(geo[shape],material(color));mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);g.add(mesh);return mesh;}
function group(parent,x=0,y=0,z=0){const g=new T.Group();g.position.set(x,y,z);parent?.add(g);return g;}
function disposeModel(g){g?.traverse(o=>{if(o.geometry&&!sharedGeometries.has(o.geometry)&&!o.geometry.userData?.shared)o.geometry.dispose();const list=Array.isArray(o.material)?o.material:[o.material];for(const value of list)if(value&&!value.userData?.shared)value.dispose();});}
function materialSignature(value){return [value.type,value.color?.getHex(),value.emissive?.getHex(),value.emissiveIntensity,value.roughness,value.metalness,value.transparent,value.opacity,value.side,value.depthWrite,value.blending].join('/');}
function mergedGeometry(meshes){
  const geometries=meshes.map(mesh=>{mesh.updateMatrix();const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();geometry.applyMatrix4(mesh.matrix);return geometry;}),names=['position','normal','uv'].filter(name=>geometries.every(geometry=>geometry.getAttribute(name))),merged=new T.BufferGeometry();
  for(const name of names){const sample=geometries[0].getAttribute(name),length=geometries.reduce((sum,geometry)=>sum+geometry.getAttribute(name).array.length,0),array=new sample.array.constructor(length);let offset=0;for(const geometry of geometries){const source=geometry.getAttribute(name).array;array.set(source,offset);offset+=source.length;}merged.setAttribute(name,new T.BufferAttribute(array,sample.itemSize,sample.normalized));}
  for(const geometry of geometries)geometry.dispose();merged.computeBoundingBox();merged.computeBoundingSphere();return merged;
}
function optimizeStructureModel(model){
  const buckets=new Map();for(const mesh of model.userData.buildMeshes){const key=[mesh.userData.buildPhase,mesh.castShadow?1:0,mesh.receiveShadow?1:0,materialSignature(mesh.material)].join('|'),bucket=buckets.get(key)||[];bucket.push(mesh);buckets.set(key,bucket);}
  const optimized=[];for(const meshes of buckets.values()){
    if(meshes.length===1){optimized.push(meshes[0]);continue;}
    const first=meshes[0],combined=new T.Mesh(mergedGeometry(meshes),first.material);combined.userData.buildPhase=first.userData.buildPhase;combined.castShadow=first.castShadow;combined.receiveShadow=first.receiveShadow;model.add(combined);optimized.push(combined);
    for(const mesh of meshes){model.remove(mesh);if(mesh!==first&&!mesh.material.userData?.shared)mesh.material.dispose();}
  }
  model.userData.buildMeshes=optimized;model.userData.optimizedParts=optimized.length;return model;
}
export function character(role,equipment={},identity=null,itemLevels={}){
  const g=group(),troll=role==='troll',skin=troll?palette.troll:palette.elf;
  const body=group(g);g.userData.body=body;
  part(body,'sphere',skin,0,troll?2:1,0,troll?1.05:.4,troll?1.3:.65,troll?.67:.28);
  part(body,'sphere',troll?0x3a5458:0x235653,0,troll?1.25:.67,.02,troll?.8:.47,troll?.45:.48,troll?.55:.35);
  const head=group(body,0,troll?3.1:1.83,.06);part(head,'sphere',skin,0,0,0,troll?.68:.31,troll?.64:.35,troll?.55:.28);
  if(troll){
    for(const sign of [-1,1]){const horn=part(head,'cone',0xd8d0ac,sign*.58,.4,0,.2,.7,.2);horn.rotation.z=-sign*.65;part(head,'sphere',0x213a39,sign*.22,.12,.5,.18,.08,.08);part(head,'sphere',0xedd692,sign*.23,.08,.58,.065,.04,.055);part(head,'cone',0xded4b6,sign*.3,-.4,.38,.09,.34,.1);}
    part(head,'box',0x68857d,0,-.28,.3,.64,.34,.52);part(head,'box',0x3d5551,0,-.45,.42,.45,.2,.38);
    for(const sign of [-1,1]){part(head,'cone',0xe3d6b1,sign*.24,-.43,.7,.075,.25,.075);part(head,'box',0x49645f,sign*.28,.18,.5,.26,.1,.15);}
    part(body,'sphere',0x5a7775,-.85,2.5,0,.62,.61,.62);part(body,'sphere',0x8d7760,.85,2.5,0,.62,.61,.62);
    part(body,'box',0x3c504a,0,1.52,-.52,1.18,.35,.18);for(const sign of [-1,1])part(body,'cone',0x334943,sign*.52,1.42,-.68,.13,.42,.13).rotation.z=sign*.18;
  }else{
    part(head,'cone',0x386757,0,.34,-.03,.46,.6,.4);
    for(const sign of [-1,1]){const ear=part(head,'cone',skin,sign*.35,.01,0,.11,.36,.14);ear.rotation.z=-sign*1.1;part(head,'sphere',0x122c2c,sign*.12,.02,.25,.025,.035,.035);}
    part(body,'box',0x326d63,0,1,-.26,.58,.87,.12);
  }
  if(identity)part(body,'box',identity.hex,0,troll?1.75:1.02,troll?.48:-.34,troll?1.45:.7,troll?.16:.14,troll?.12:.16);
  const arms=[];for(const sign of [-1,1]){const arm=group(body,sign*(troll?1.03:.45),troll?2.4:1.3,0);part(arm,'sphere',skin,0,-(troll?.5:.25),0,troll?.38:.12,troll?.75:.4,troll?.37:.14);arms.push(arm);}
  const weaponMount=group(arms[1],0,troll?-1.03:-.53,.15),heldItems={};
  if(troll){heldItems.weapon=createHeldItem(role,equipment,'',itemLevels?.[equipment.weapon]||1);weaponMount.add(heldItems.weapon);}
  else{
    heldItems.hammer=createHeldItem(role,equipment,'work');heldItems.axe=createHeldItem(role,equipment,'gather');heldItems.axe.visible=false;weaponMount.add(heldItems.hammer,heldItems.axe);
  }
  if(troll){
    if(['carapace','siegeplate'].includes(equipment.armor))for(const sign of [-1,1]){part(body,'box',equipment.armor==='siegeplate'?0x655e58:0x7f8173,sign*.9,2.6,0,.85,.6,.8);part(body,'cone',0xb4a77e,sign*1.02,2.92,0,.15,.42,.15).rotation.z=-sign*.7;}
    if(['moss','barkhide'].includes(equipment.armor))for(const sign of [-1,1])part(body,'sphere',equipment.armor==='barkhide'?0x796347:0x67996c,sign*.85,2.65,0,.65,.45,.6);
    if(equipment.armor==='heartplate')part(body,'box',0x765757,0,2.1,.6,1.45,1.25,.18);
    if(equipment.helmet){const helmetColors={amber:0xe9aa58,hunt:0x88cfe6,totem:0xc8b4e5,horned:0x7f8173,seer:0x73b0a5};const color=helmetColors[equipment.helmet]||0xc8b4e5;part(head,'sphere',color,0,.18,-.04,.76,.42,.62);part(head,'box',color,0,.46,.08,.72,.18,.5);part(body,'sphere',color,0,1.35,.63,.22,.32,.18);}
  }
  const legs=[];for(const sign of [-1,1]){const leg=group(g,sign*(troll?.43:.19),troll?1.1:.65,0);part(leg,'sphere',troll?0x50655e:0x465852,0,troll?-.5:-.3,0,troll?.37:.15,troll?.67:.38,troll?.36:.17);part(leg,'box',0x293b37,0,troll?-1:-.58,.1,troll?.65:.29,.2,troll?.75:.4);legs.push(leg);}
  if(troll&&equipment.boots)for(const leg of legs)part(leg,'box',equipment.boots==='mantle'?0x345e75:equipment.boots==='shadowboots'?0x403853:equipment.boots==='rootboots'?0x65523d:0x756b58,0,-.98,.12,.72,.42,.82);
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=false;}});g.userData={body,arms,legs,role,weaponMount,heldItems};return g;
}

const loadoutPreviews=new WeakMap();
export function mountTrollLoadoutPreview(canvas,equipment={},itemLevels={}){
  if(!canvas)return;
  let preview=loadoutPreviews.get(canvas);
  if(!preview){
    const renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'}),scene=new T.Scene(),camera=new T.PerspectiveCamera(27,1,.1,50);
    renderer.setPixelRatio(Math.min(2,globalThis.devicePixelRatio||1));renderer.outputColorSpace=T.SRGBColorSpace;
    scene.add(new T.HemisphereLight(0xdcebd8,0x182522,2.5));const key=new T.DirectionalLight(0xf0d68e,3.2);key.position.set(-4,7,6);scene.add(key);const rim=new T.DirectionalLight(0x6ebfa8,2);rim.position.set(5,3,-4);scene.add(rim);
    camera.position.set(6.8,4.2,10);camera.lookAt(0,1.65,0);preview={renderer,scene,camera,model:null};loadoutPreviews.set(canvas,preview);
  }
  if(preview.model){preview.scene.remove(preview.model);disposeModel(preview.model);}
  preview.model=character('troll',equipment,null,itemLevels);preview.model.rotation.y=-.42;preview.scene.add(preview.model);
  const width=Math.max(120,canvas.clientWidth||160),height=Math.max(190,canvas.clientHeight||250);preview.camera.aspect=width/height;preview.camera.updateProjectionMatrix();preview.renderer.setSize(width,height,false);preview.renderer.render(preview.scene,preview.camera);
}
export function building(kind,level=1,branch='power',identity=null,legendary=false,epic=false){
  const progression=structureVisualProgress(level),visual=progression.tier,tier=visual.id,g=group(),owner=identity?.hex||visual.accent;
  const {primary,secondary,trim,accent}=visual,wood=0x6b5135,dark=0x1b292b;
  const glow=(shape,color,x,y,z,sx,sy,sz)=>{const mesh=part(g,shape,color,x,y,z,sx,sy,sz);mesh.material=mat(color,{emissive:color,emissiveIntensity:tier===5?1.8:1.05,roughness:.28,metalness:visual.metalness});return mesh;};
  const crystal=(x,y,z,scale=.25,color=accent)=>glow('sphere',color,x,y,z,scale,scale*1.65,scale);
  const cap=(x,y,z,scale=.5,color=trim)=>part(g,'cone',color,x,y,z,scale,scale*1.25,scale);
  const ring=(x,y,z,scale,color=accent)=>{const mesh=part(g,'torus',color,x,y,z,scale,scale,scale);mesh.rotation.x=Math.PI/2;return mesh;};

  if(kind==='wall'){
    if(tier===1){for(let i=-2;i<=2;i++){part(g,'cylinder',wood,i*.52,1.18,0,.25,2.35,.25);cap(i*.52,2.57,0,.28,0xb99c68);}part(g,'box',0x4c3928,0,.7,.18,2.65,.18,.28);}
    if(tier===2){part(g,'box',primary,0,1.12,0,2.35,2.24,.78);for(const sign of [-1,1]){part(g,'cylinder',secondary,sign*1.08,1.45,0,.34,2.9,.34);cap(sign*1.08,3.05,0,.38,trim);}part(g,'box',owner,0,1.45,.44,2.05,.16,.1);}
    if(tier===3){part(g,'box',primary,0,1.25,0,2.5,2.5,.9);for(const sign of [-1,0,1]){part(g,'box',secondary,sign*.84,1.45,.48,.15,2.25,.12);cap(sign*.84,2.9,.08,.22,trim);}for(const sign of [-1,1])part(g,'box',trim,sign*1.08,2.6,0,.42,.35,.92);}
    if(tier===4){part(g,'box',primary,0,1.35,0,2.65,2.7,1);for(const sign of [-1,1]){part(g,'cylinder',secondary,sign*1.15,1.75,0,.45,3.5,.45);cap(sign*1.15,3.7,0,.5,trim);crystal(sign*.72,2.25,.57,.16,owner);}part(g,'box',trim,0,2.62,.52,2.65,.2,.12);}
    if(tier===5){part(g,'box',primary,0,1.55,0,2.85,3.1,1.05);for(const sign of [-1,1]){part(g,'cylinder',secondary,sign*1.3,2.05,0,.5,4.1,.5);crystal(sign*1.3,4.35,0,.3);part(g,'box',trim,sign*.68,2.85,.57,.08,2.1,.1);}ring(0,2.05,.59,.55,owner);part(g,'box',trim,0,3.02,.52,2.9,.2,.12);}
  }else if(kind==='core'){
    part(g,'cylinder',primary,0,.18,0,1.75+ tier*.08,.36,1.75+tier*.08);
    if(tier===1){part(g,'box',secondary,0,1,0,2.2,1.65,2.1);cap(0,2.45,0,2.05,owner);part(g,'box',wood,0,.72,1.08,.54,1.25,.1);}
    if(tier===2){part(g,'box',secondary,0,1.15,0,2.35,1.9,2.25);cap(0,2.72,0,2.2,owner);for(const sign of [-1,1]){part(g,'cylinder',primary,sign*1.25,1.3,-.45,.48,2.6,.48);cap(sign*1.25,2.9,-.45,.62,trim);}crystal(0,3.35,0,.2);}
    if(tier===3){part(g,'box',secondary,0,1.35,0,2.5,2.2,2.35);for(const sign of [-1,1]){part(g,'cylinder',primary,sign*1.3,1.65,-.55,.55,3.3,.55);cap(sign*1.3,3.55,-.55,.68,trim);}part(g,'box',primary,0,2.65,0,1.2,.9,1.1);crystal(0,3.75,0,.28);}
    if(tier===4){part(g,'box',secondary,0,1.45,0,2.65,2.4,2.5);for(let i=0;i<3;i++){const a=i/3*Math.PI*2;part(g,'cylinder',primary,Math.sin(a)*1.4,1.8,Math.cos(a)*1.2,.52,3.6,.52);cap(Math.sin(a)*1.4,3.82,Math.cos(a)*1.2,.66,trim);}ring(0,3.2,0,.8,owner);crystal(0,4.05,0,.34);}
    if(tier===5){part(g,'cylinder',secondary,0,1.6,0,1.5,2.85,1.5);for(let i=0;i<4;i++){const a=i/4*Math.PI*2,x=Math.sin(a)*1.55,z=Math.cos(a)*1.55;part(g,'cylinder',primary,x,1.95,z,.48,3.9,.48);crystal(x,4.18,z,.27);}ring(0,2.55,0,1.25,trim);ring(0,3.42,0,.85,owner);crystal(0,4.65,0,.42);}
  }else if(kind==='tower'){
    part(g,'cylinder',primary,0,.2,0,1.18+.06*tier,.4,1.18+.06*tier);
    if(tier===1){for(const sign of [-1,1])part(g,'cylinder',wood,sign*.48,1.8,0,.18,3.35,.18);part(g,'box',wood,0,3.15,0,1.55,.28,1.35);cap(0,4.02,0,1.3,owner);}
    if(tier===2){part(g,'cylinder',primary,0,1.9,0,.72,3.5,.82);part(g,'cylinder',secondary,0,3.52,0,1.05,.35,1.05);for(let i=0;i<6;i++){const a=i/6*Math.PI*2;part(g,'box',trim,Math.sin(a)*.83,3.82,Math.cos(a)*.83,.25,.45,.25);}crystal(0,4.42,0,.24,owner);}
    if(tier===3){part(g,'cylinder',primary,0,2.05,0,.78,3.85,.9);part(g,'box',secondary,0,3.72,0,1.55,.4,1.35);for(const sign of [-1,1]){part(g,'box',trim,sign*.58,4.15,0,.18,1.1,.85);part(g,'cylinder',dark,sign*.58,4.08,.55,.1,1.4,.1).rotation.x=Math.PI/2;}crystal(0,4.55,0,.2);}
    if(tier===4){part(g,'cylinder',primary,0,2.2,0,.8,4.2,.94);for(const sign of [-1,1]){part(g,'cylinder',secondary,sign*.65,3.6,0,.28,2.15,.28);crystal(sign*.65,4.95,0,.2,owner);}ring(0,4.18,0,.82,trim);crystal(0,5.2,0,.32);}
    if(tier===5){part(g,'cylinder',primary,0,2.4,0,.84,4.6,.98);for(let i=0;i<3;i++){const a=i/3*Math.PI*2,x=Math.sin(a)*.78,z=Math.cos(a)*.78;part(g,'cylinder',secondary,x,3.95,z,.22,2.1,.22);crystal(x,5.18,z,.18);}ring(0,4.15,0,1.08,trim);ring(0,4.7,0,.72,owner);crystal(0,5.65,0,.4);}
  }else if(kind==='mine'){
    part(g,'sphere',primary,0,.65,0,1.55,1.15,1.3);part(g,'box',dark,0,.58,1.22,.82,1.02,.06);
    if(tier===1){for(const sign of [-1,1])part(g,'cylinder',wood,sign*.58,.8,1.27,.12,1.6,.12);part(g,'box',wood,0,1.52,1.27,1.35,.14,.18);}
    if(tier===2){for(const sign of [-1,1])part(g,'cylinder',secondary,sign*.7,.85,1.24,.2,1.7,.2);part(g,'box',trim,0,1.65,1.22,1.65,.18,.2);part(g,'box',wood,-1.05,.35,.5,.75,.36,.9);}
    if(tier===3){part(g,'box',secondary,0,1.65,-.35,1.7,.45,1.35);for(const sign of [-1,1])part(g,'cylinder',trim,sign*.75,1.1,1.18,.13,2.2,.13);ring(-1.05,.38,.35,.38,trim);}
    if(tier===4){part(g,'cylinder',secondary,-.9,1.55,-.45,.38,2.6,.38);part(g,'cylinder',trim,.75,1.2,-.35,.55,1.8,.55);for(const sign of [-1,1])crystal(sign*.72,.42,.9,.2,owner);ring(0,1.52,1.23,.5,trim);}
    if(tier===5){for(const sign of [-1,1]){part(g,'cylinder',secondary,sign*.9,1.6,-.35,.32,2.9,.32);crystal(sign*.9,3.25,-.35,.24);}ring(0,1.55,1.22,.62,trim);crystal(0,2.05,.2,.38);part(g,'box',trim,0,.18,1.9,2.4,.08,.55);}
  }else if(kind==='workshop'){
    part(g,'box',primary,0,.22,0,1.8,.44,1.65);
    if(tier===1){part(g,'box',secondary,0,1.05,0,1.75,1.45,1.55);cap(0,2.15,0,1.6,owner);part(g,'cylinder',wood,.95,1.6,-.45,.18,2.5,.18);}
    if(tier===2){part(g,'box',secondary,0,1.18,0,1.95,1.75,1.75);cap(0,2.55,0,1.8,owner);part(g,'cylinder',primary,1.05,1.75,-.45,.24,2.8,.24);part(g,'sphere',trim,-.72,.62,1,.68,.68,.14);}
    if(tier===3){part(g,'box',secondary,0,1.25,0,2.05,1.9,1.85);part(g,'box',primary,0,2.25,0,1.6,.3,1.45);for(const sign of [-1,1])ring(sign*.85,1.05,1.02,.36,trim);part(g,'cylinder',trim,1.15,1.8,-.55,.24,3,.24);}
    if(tier===4){part(g,'box',secondary,0,1.35,0,2.2,2.1,2);for(const sign of [-1,1]){part(g,'cylinder',primary,sign*1.02,1.85,-.62,.28,3.15,.28);crystal(sign*1.02,3.62,-.62,.18);}ring(0,2.35,1.02,.72,trim);crystal(0,3.18,0,.3,owner);}
    if(tier===5){part(g,'cylinder',secondary,0,1.45,0,1.8,2.5,1.8);for(let i=0;i<4;i++){const a=i/4*Math.PI*2;part(g,'cylinder',primary,Math.sin(a)*1.45,1.55,Math.cos(a)*1.45,.25,2.7,.25);}ring(0,2.25,0,1.3,trim);ring(0,2.85,0,.85,owner);crystal(0,3.72,0,.42);}
  }else if(kind==='refinery'){
    part(g,'cylinder',primary,0,.3,0,1.45+.05*tier,.6,1.45+.05*tier);
    if(tier===1){part(g,'cylinder',0xc08b48,0,1.35,0,1.05,2.1,1.05);part(g,'cylinder',wood,.85,1.95,-.25,.22,2.2,.22);cap(0,2.58,0,1.08,trim);}
    if(tier===2){for(const sign of [-1,1]){part(g,'cylinder',secondary,sign*.62,1.25,0,.62,2.1,.62);part(g,'cylinder',trim,sign*.62,2.35,0,.68,.18,.68);}part(g,'box',0xc08b48,0,1.25,.55,.42,1.9,.42);}
    if(tier===3){part(g,'cylinder',secondary,0,1.5,0,1.05,2.55,1.05);for(const sign of [-1,1]){part(g,'cylinder',primary,sign*1.05,1.55,-.3,.28,2.85,.28);ring(sign*1.05,2.65,-.3,.34,trim);}ring(0,1.65,0,1.12,accent);}
    if(tier===4){part(g,'cylinder',secondary,0,1.65,0,1.12,2.85,1.12);for(let i=0;i<3;i++){const a=i/3*Math.PI*2,x=Math.sin(a)*1.18,z=Math.cos(a)*1.18;part(g,'cylinder',primary,x,1.5,z,.3,2.7,.3);crystal(x,3.02,z,.18,0xf0c26d);}ring(0,2.35,0,1.22,trim);}
    if(tier===5){part(g,'cylinder',secondary,0,1.8,0,.88,3.15,.88);for(const y of [1.2,2.15,3.05])ring(0,y,0,1.35-y*.08,y===3.05?owner:trim);for(let i=0;i<4;i++){const a=i/4*Math.PI*2;crystal(Math.sin(a)*1.35,2.15,Math.cos(a)*1.35,.24,0xf0c26d);}crystal(0,3.75,0,.38,owner);}
  }else if(kind==='bastion'){
    part(g,'cylinder',primary,0,.38,0,1.55+.06*tier,.76,1.55+.06*tier);
    if(tier===1){for(let i=0;i<6;i++){const a=i/6*Math.PI*2;part(g,'box',secondary,Math.sin(a)*1.05,1.25,Math.cos(a)*1.05,.42,1.8,.42).rotation.y=a;}crystal(0,2.25,0,.36,0xb8d8c7);}
    if(tier===2){part(g,'cylinder',secondary,0,1.15,0,1.18,1.5,1.18);for(let i=0;i<4;i++){const a=i/4*Math.PI*2;part(g,'box',primary,Math.sin(a)*1.35,1.25,Math.cos(a)*1.35,.55,2.15,.68).rotation.y=a;}cap(0,2.45,0,1.05,trim);}
    if(tier===3){part(g,'cylinder',secondary,0,1.3,0,1.22,1.85,1.22);for(let i=0;i<6;i++){const a=i/6*Math.PI*2;part(g,'box',trim,Math.sin(a)*1.35,1.6,Math.cos(a)*1.35,.22,2.45,.58).rotation.y=a;}ring(0,2.2,0,1.28,accent);crystal(0,2.85,0,.34);}
    if(tier===4){part(g,'cylinder',secondary,0,1.45,0,1.28,2.15,1.28);for(let i=0;i<4;i++){const a=i/4*Math.PI*2,x=Math.sin(a)*1.48,z=Math.cos(a)*1.48;part(g,'box',primary,x,1.45,z,.58,2.5,.78).rotation.y=a;crystal(x,2.92,z,.19,owner);}ring(0,2.42,0,1.4,trim);}
    if(tier===5){part(g,'cylinder',secondary,0,1.55,0,1.05,2.35,1.05);for(let i=0;i<6;i++){const a=i/6*Math.PI*2,x=Math.sin(a)*1.55,z=Math.cos(a)*1.55;part(g,'box',primary,x,1.55,z,.42,2.65,.62).rotation.y=a;crystal(x,3.08,z,.22);}ring(0,1.55,0,1.62,owner);ring(0,2.62,0,1.2,trim);crystal(0,3.32,0,.44,0xb8d8c7);}
  }else if(kind==='arcaneTower'){
    part(g,'cylinder',primary,0,.3,0,1.25+.05*tier,.6,1.25+.05*tier);
    if(tier===1){part(g,'cylinder',0x756b8d,0,1.85,0,.62,3.25,.78);cap(0,3.72,0,.72,trim);crystal(0,4.18,0,.48,0xb78aff);}
    if(tier===2){part(g,'cylinder',0x756b8d,0,2.05,0,.7,3.65,.84);for(const sign of [-1,1]){part(g,'cylinder',secondary,sign*.72,2.5,0,.2,2.2,.2);crystal(sign*.72,3.82,0,.18,0x78d8e6);}crystal(0,4.45,0,.54,0xb78aff);}
    if(tier===3){part(g,'cylinder',0x756b8d,0,2.15,0,.72,3.85,.86);for(let i=0;i<3;i++){const a=i/3*Math.PI*2;part(g,'box',secondary,Math.sin(a)*.92,3.15,Math.cos(a)*.92,.2,2.15,.28).rotation.y=a;crystal(Math.sin(a)*.98,4.35,Math.cos(a)*.98,.2,0x78d8e6);}ring(0,3.55,0,.9,accent);crystal(0,4.82,0,.58,0xb78aff);}
    if(tier===4){part(g,'cylinder',0x756b8d,0,2.3,0,.76,4.15,.9);for(let i=0;i<4;i++){const a=i/4*Math.PI*2,x=Math.sin(a),z=Math.cos(a);part(g,'cylinder',secondary,x,3.45,z,.18,2.5,.18);crystal(x,4.85,z,.2,owner);}ring(0,3.72,0,1.05,trim);crystal(0,5.25,0,.64,0xb78aff);}
    if(tier===5){part(g,'cylinder',0x756b8d,0,2.45,0,.62,4.45,.78);for(let i=0;i<4;i++){const a=i/4*Math.PI*2,x=Math.sin(a)*1.15,z=Math.cos(a)*1.15;part(g,'box',secondary,x,3.45,z,.18,2.65,.26).rotation.y=a;crystal(x,4.98,z,.24,0x78d8e6);}ring(0,3.25,0,1.28,owner);ring(0,4.25,0,.92,trim);crystal(0,5.65,0,.72,0xb78aff);}
  }
  // Every level leaves a visible mark inside its architectural era. These
  // modules intentionally change the outline, not only the material color.
  const details=Math.min(tier===5?9:4,progression.step),detailColor=tier<=2?trim:accent;
  for(let i=0;i<details;i++){
    const a=i/Math.max(1,details)*Math.PI*2,sign=i%2?1:-1;
    if(kind==='core'){
      const x=Math.sin(a)*(1.72+.08*tier),z=Math.cos(a)*(1.52+.06*tier),pod=part(g,tier<=2?'cylinder':'box',i%2?primary:secondary,x,.62+i*.12,z,.24+.025*tier,1.05+i*.08,.24+.025*tier);pod.rotation.y=a;cap(x,1.38+i*.2,z,.28+.03*tier,detailColor);
    }else if(kind==='wall'){
      const x=-1.12+i*(2.24/Math.max(1,details-1));part(g,tier<=2?'cone':'box',detailColor,x,3.02+(tier-1)*.2,.05,.16,.48+.08*tier,.2).rotation.z=sign*.08;part(g,'box',secondary,x,1.25,.58,.12,1.65,.1);
    }else if(kind==='tower'){
      const y=1.25+i*.72;part(g,'box',detailColor,sign*(.72+.04*tier),y,0,.28,.18,.7).rotation.z=sign*.12;if(i%2===0)ring(0,y+.28,0,.72+.04*tier,detailColor);
    }else if(kind==='mine'){
      const x=sign*(.72+(i%3)*.25),z=.45-i*.32;if(i%2===0)crystal(x,.35+(i%2)*.15,z,.16+.025*tier,detailColor);else{const wheel=ring(x,.34,z,.28,detailColor);wheel.rotation.y=Math.PI/2;part(g,'box',secondary,x,.55,z,.58,.24,.52);}
    }else if(kind==='workshop'){
      const x=sign*(.72+(i%2)*.25);if(i%2===0){part(g,'cylinder',primary,x,2.1+i*.16,-.55,.16,2.2+i*.18,.16);cap(x,3.35+i*.25,-.55,.22,detailColor);}else ring(x,.82,1.02,.3+.03*tier,detailColor);
    }else if(kind==='refinery'){
      const x=Math.sin(a)*1.05,z=Math.cos(a)*1.05;part(g,'cylinder',detailColor,x,.78+i*.15,z,.18,1.25+i*.2,.18);if(i%2===0)crystal(x,1.55+i*.25,z,.12,0xf0c26d);
    }else if(kind==='bastion'){
      const x=Math.sin(a)*1.35,z=Math.cos(a)*1.35;part(g,'box',detailColor,x,.7+i*.1,z,.28,1.35+i*.15,.42).rotation.y=a;
    }else if(kind==='arcaneTower'){
      const x=Math.sin(a)*(1.05+i*.04),z=Math.cos(a)*(1.05+i*.04);crystal(x,2.3+i*.3,z,.14+.015*tier,detailColor);
    }
  }
  if(identity)part(g,'sphere',identity.hex,0,kind==='tower'?tier===5?5.95:5.25:kind==='wall'?tier===5?3.75:3.05:3.2,0,.14,.14,.14);
  if(legendary&&tier<4){for(const sign of [-1,1])crystal(sign*.72,kind==='tower'?4.5:kind==='wall'?2.45:3,.55,.11,palette.gold);}
  if(epic&&tier<5)crystal(0,kind==='tower'?5.55:kind==='wall'?3.35:4,0,.26,0xaa79ff);
  // Construction/upgrade rig. It is hidden for complete idle structures and
  // animated by WorldRenderer from authoritative progress fields.
  const constructionRig=group(g),rigRadius=kind==='wall'?1.65:kind==='tower'||kind==='arcaneTower'?1.28:2.05,rigHeight=kind==='tower'||kind==='arcaneTower'?5.5:kind==='wall'?3.6:4.25;
  constructionRig.userData.constructionOverlay=true;
  for(const signX of [-1,1])for(const signZ of [-1,1]){part(constructionRig,'cylinder',0x8e714b,signX*rigRadius,.5*rigHeight,signZ*(kind==='wall'?.52:rigRadius*.72),.075,rigHeight,.075);for(let y=.65;y<rigHeight;y+=1.05)part(constructionRig,'box',0xc29b61,signX*rigRadius,y,signZ*(kind==='wall'?.52:rigRadius*.72),kind==='wall'?.16:.22,.08,kind==='wall'?1.25:rigRadius*1.45);}
  const upgradeRing=part(constructionRig,'torus',accent,0,.16,0,kind==='wall'?1.35:1.05,kind==='wall'?1.35:1.05,kind==='wall'?1.35:1.05);upgradeRing.rotation.x=Math.PI/2;upgradeRing.material=mat(accent,{emissive:accent,emissiveIntensity:1.3,transparent:true,opacity:.72,roughness:.25});upgradeRing.userData.upgradeRing=true;
  for(const child of constructionRig.children)child.userData.constructionOverlay=true;constructionRig.visible=false;
  const buildMeshes=g.children.filter(child=>child!==constructionRig&&child.isMesh),maxY=Math.max(1,...buildMeshes.map(mesh=>mesh.position.y));for(const mesh of buildMeshes)mesh.userData.buildPhase=Math.max(0,Math.min(3,Math.floor(mesh.position.y/maxY*4)));
  g.userData.visualTier=tier;g.userData.visualTierName=visual.name;g.userData.structureLevel=level;g.userData.levelStep=progression.step;g.userData.constructionRig=constructionRig;g.userData.upgradeRing=upgradeRing;g.userData.buildMeshes=buildMeshes;
  const shadowMeshes=[];g.traverse(o=>{if(o.isMesh)shadowMeshes.push(o);});shadowMeshes.forEach((mesh,index)=>{mesh.castShadow=index<6;mesh.receiveShadow=index<9;});return g;
}
let glowTexture;
const wispLight=new T.MeshBasicMaterial({color:0xc7ffe7,toneMapped:false});
const wispTrail=new T.MeshBasicMaterial({color:0x67d9b5,transparent:true,opacity:.7,depthWrite:false,toneMapped:false});
wispLight.userData.shared=true;wispTrail.userData.shared=true;
function wispModel(){
  if(!glowTexture){const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d'),glow=ctx.createRadialGradient(32,32,0,32,32,32);glow.addColorStop(0,'#eaffef');glow.addColorStop(.2,'#7effce');glow.addColorStop(1,'#42b99500');ctx.fillStyle=glow;ctx.fillRect(0,0,64,64);glowTexture=new T.CanvasTexture(canvas);}
  const g=group(),spirit=group(g),orb=new T.Mesh(geo.sphere,wispLight);orb.scale.set(.24,.34,.24);spirit.add(orb);
  const glow=new T.Sprite(new T.SpriteMaterial({map:glowTexture,color:0xa8ffe0,transparent:true,opacity:.8,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}));glow.scale.setScalar(1.6);glow.raycast=()=>{};spirit.add(glow);
  const tail=[];for(let i=0;i<8;i++){const mote=new T.Mesh(geo.sphere,wispTrail);mote.scale.setScalar(.13*(1-i/10));mote.raycast=()=>{};g.add(mote);tail.push(mote);}
  const ring=new T.Mesh(new T.RingGeometry(1.55,1.61,48),new T.MeshBasicMaterial({color:0x7ceac2,transparent:true,opacity:.4,depthWrite:false,side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.06;ring.raycast=()=>{};g.add(ring);
  g.userData.spirit=spirit;g.userData.orb=orb;g.userData.tail=tail;g.userData.glow=glow;g.userData.ring=ring;return g;
}

export class WorldRenderer {
  constructor(canvas){
    this.canvas=canvas;this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.targetFps=144;this.targetFrameMs=1000/this.targetFps;this.maxPixelRatio=Math.min(devicePixelRatio,1.25);this.pixelRatio=this.maxPixelRatio;this.renderer.setPixelRatio(this.pixelRatio);this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.shadowMap.autoUpdate=false;this.nextShadowUpdateAt=0;this.shadowUpdateInterval=1/20;this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.22;
    this.scene=new T.Scene();this.scene.background=new T.Color(0x233e41);this.scene.fog=new T.FogExp2(0x233e41,.012);
    this.camera=new T.PerspectiveCamera(58,innerWidth/innerHeight,.06,400);this.scene.add(this.camera,new T.HemisphereLight(0xdce8c9,0x253c41,2.6));this.viewmodel=new FirstPersonViewmodel(this.camera);this.animations=new ActionAnimationController();
    this.sun=new T.DirectionalLight(0xffe3ad,3.4);this.sun.position.set(25,60,-15);this.sun.castShadow=true;this.sun.shadow.mapSize.set(1024,1024);Object.assign(this.sun.shadow.camera,{left:-30,right:30,top:30,bottom:-30,near:1,far:150});this.sun.shadow.bias=-.0005;this.scene.add(this.sun,this.sun.target);
    this.terrain=group(this.scene);this.dynamic=group(this.scene);this.effects=group(this.scene);this.entities=new Map();this.treeMeshes=new Map();this.treeStateById=new Map();this.activeTreeImpacts=new Set();this.specialNodeMeshes=new Map();this.visibleTreeIds=new Set();this.towerDebugRings=new Map();this.recallEffects=new Map();this.celebrations=[];this.particles=[];this.projectiles=[];this.effectPool=new Map();this.ray=new T.Raycaster();this.pointer=new T.Vector2();this.plane=new T.Plane(new T.Vector3(0,1,0),0);this.frustum=new T.Frustum();this.projectionScreenMatrix=new T.Matrix4();this.yaw=0;this.pitch=.2;this.preferredCamera='first';this.zoom=initialCameraZoom(this.preferredCamera);this.firstPersonAmount=1;this.target=new T.Vector3();this.freePosition=new T.Vector3();this.freeCamera=false;this.projectVector=new T.Vector3();this.worldVector=new T.Vector3();this.cameraPosition=new T.Vector3();this.cameraAim=new T.Vector3();this.cameraDirection=new T.Vector3();this.cameraScratch=new T.Vector3();this.buildAim=new T.Vector3();this.treeLodDummy=new T.Object3D();this.treeLodColor=new T.Color();this.nextTreeLodAt=0;this.motionQuery=matchMedia('(prefers-reduced-motion: reduce)');this.isMenu=true;this.eventId=0;this.lastTime=0;this.elapsed=0;this.buildMode=false;this.buildKind=null;this.buildCameraBlend=0;this.frameSamples=[];this.resolutionCheckAt=0;this.longTasks=0;this.performance={fps:60,frameP95Ms:0,drawCalls:0,triangles:0,pixelRatio:this.pixelRatio,longTasks:0};
    if(globalThis.PerformanceObserver)try{this.longTaskObserver=new PerformanceObserver(list=>this.longTasks+=list.getEntries().length);this.longTaskObserver.observe({type:'longtask',buffered:true});}catch{}
    this.selection=new T.Mesh(new T.RingGeometry(1.2,1.28,40),new T.MeshBasicMaterial({color:palette.gold,side:T.DoubleSide,transparent:true,opacity:.8}));this.selection.rotation.x=-Math.PI/2;this.selection.position.y=.08;this.selection.visible=false;this.contextTarget=null;this.scene.add(this.selection);
    this.range=new T.Mesh(new T.RingGeometry(16.92,17,80),new T.MeshBasicMaterial({color:palette.teal,side:T.DoubleSide,transparent:true,opacity:.25}));this.range.rotation.x=-Math.PI/2;this.range.visible=false;this.scene.add(this.range);this.buildRange=new T.Mesh(new T.RingGeometry(6.42,6.5,80),new T.MeshBasicMaterial({color:palette.teal,side:T.DoubleSide,transparent:true,opacity:.22}));this.buildRange.rotation.x=-Math.PI/2;this.buildRange.visible=false;this.scene.add(this.buildRange);
    this.resize();addEventListener('resize',()=>this.resize());this.menuScene();
  }
  resize(){this.renderer.setSize(innerWidth,innerHeight);this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();}
  clearGroup(g){g.traverse(o=>{if(o.userData.disposeGeometry)o.geometry?.dispose();if(o.userData.disposeMaterial)o.material?.dispose();});while(g.children.length){const child=g.children[0];disposeModel(child);g.remove(child);}}
  loadMap(map){
    this.map=map;this.baseById=new Map(map.bases.map(base=>[base.id,base]));const atmosphere=map.style==='deepForest'?{color:0x142e2b,fog:.019}:map.style==='crossroads'?{color:0x38504b,fog:.008}:{color:0x233e41,fog:.012};this.scene.background.setHex(atmosphere.color);this.scene.fog.color.setHex(atmosphere.color);this.scene.fog.density=atmosphere.fog;this.clearGroup(this.terrain);this.clearGroup(this.dynamic);this.clearGroup(this.effects);for(const ring of this.towerDebugRings.values())this.scene.remove(ring);this.towerDebugRings.clear();this.recallEffects.clear();this.celebrations=[];this.entities.clear();this.treeMeshes.clear();this.treeStateById.clear();this.activeTreeImpacts.clear();this.specialNodeMeshes.clear();this.decorForest=[];this.particles=[];this.projectiles=[];this.effectPool.clear();this.animations.reset();this.eventId=0;this.rangeKey=null;this.nextTreeLodAt=0;this.ghost&&this.scene.remove(this.ghost);this.ghost=null;
    this.ground=terrainMesh(map);this.terrain.add(this.ground);
    const rng=randomFor(map.seed+'visual'),dummy=new T.Object3D(),rockCells=[];
    for(let z=0;z<map.size;z++)for(let x=0;x<map.size;x++)if(!walkable(map,x,z))rockCells.push({x:x*map.cell,z:z*map.cell});
    for(const chunk of spatialChunks(rockCells)){const rocks=new T.InstancedMesh(geo.sphere,material(palette.stone),chunk.length);
      chunk.forEach((p,i)=>{const h=1.4+rng()*1.2;dummy.position.set(p.x,heightAt(map,p.x,p.z)+h*.38,p.z);dummy.scale.set(map.cell*.5,h*.65,map.cell*.5);dummy.rotation.set(0,0,0);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);rocks.setColorAt(i,new T.Color().setHSL(.31+rng()*.08,.13,.23+rng()*.1));});rocks.instanceMatrix.setUsage(T.StaticDrawUsage);rocks.computeBoundingSphere();rocks.castShadow=true;rocks.receiveShadow=true;this.terrain.add(rocks);}
    const groundDetails=[];for(let z=2;z<map.size-2&&groundDetails.length<420;z+=2)for(let x=2;x<map.size-2&&groundDetails.length<420;x+=2){if(!walkable(map,x,z)||rng()>(map.style==='deepForest'?.22:map.style==='crossroads'?.08:.14))continue;const p={x:x*map.cell+(rng()-.5)*1.1,z:z*map.cell+(rng()-.5)*1.1};if(distanceToTrails(map,p)<2.1||map.bases.some(b=>Math.abs(x-b.cx)<b.rx&&Math.abs(z-b.cz)<b.rz))continue;groundDetails.push({...p,flower:rng()<.16,scale:.55+rng()*.7,rotation:rng()*6.28});}
    const grassDetails=groundDetails.filter(p=>!p.flower),flowerDetails=groundDetails.filter(p=>p.flower),grass=new T.InstancedMesh(geo.cone,material(map.style==='deepForest'?0x294f42:0x4f7354),grassDetails.length),flowers=new T.InstancedMesh(geo.sphere,material(map.style==='crossroads'?0xe0c282:0x9fc7a0),flowerDetails.length);
    grassDetails.forEach((p,i)=>{dummy.position.set(p.x,heightAt(map,p.x,p.z)+.18*p.scale,p.z);dummy.scale.set(.08*p.scale,.36*p.scale,.08*p.scale);dummy.rotation.set(0,p.rotation,0);dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);});
    flowerDetails.forEach((p,i)=>{dummy.position.set(p.x,heightAt(map,p.x,p.z)+.16*p.scale,p.z);dummy.scale.set(.1*p.scale,.16*p.scale,.1*p.scale);dummy.rotation.set(0,p.rotation,0);dummy.updateMatrix();flowers.setMatrixAt(i,dummy.matrix);});grass.receiveShadow=true;this.terrain.add(grass,flowers);
    for(const b of map.bases){
      const gate=new T.Mesh(geo.box,material(0xaaa675));gate.position.set(b.gate.x,heightAt(map,b.gate.x,b.gate.z)+.03,b.gate.z);gate.scale.set(b.gate.axis==='x'?3.4:2.1,.06,b.gate.axis==='x'?2.1:3.4);gate.receiveShadow=true;this.terrain.add(gate);
      for(const sign of [-1,1]){const x=b.gate.x+(b.gate.axis==='x'?0:sign*1.65),z=b.gate.z+(b.gate.axis==='x'?sign*1.65:0),lamp=group(this.terrain,x,heightAt(map,x,z),z);part(lamp,'cylinder',0x838873,0,1.1,0,.17,2.2,.17);part(lamp,'sphere',0xffdaa0,0,2.3,0,.27,.4,.27);}
    }
    const trees=map.decor.filter(d=>d.kind==='tree'),trunkMaterial=material(palette.bark).clone(),leafMaterial=material(palette.leaf).clone();this.decorForestMaterials=[trunkMaterial,leafMaterial];
    for(const chunk of spatialChunks(trees)){const trunks=new T.InstancedMesh(geo.cylinder,trunkMaterial,chunk.length),leaves=new T.InstancedMesh(geo.cone,leafMaterial,chunk.length*2);
      chunk.forEach((p,i)=>{const y=heightAt(map,p.x,p.z);dummy.position.set(p.x,y+2*p.scale,p.z);dummy.scale.set(.26*p.scale,4*p.scale,.26*p.scale);dummy.rotation.set(0,p.rotation,0);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);for(let j=0;j<2;j++){dummy.position.y=y+(3.8+j*1.7)*p.scale;dummy.scale.set((1.6-j*.35)*p.scale,3.7*p.scale,(1.6-j*.35)*p.scale);dummy.updateMatrix();leaves.setMatrixAt(i*2+j,dummy.matrix);leaves.setColorAt(i*2+j,new T.Color().setHSL(.37+rng()*.07,.25,.18+rng()*.1));}});trunks.instanceMatrix.setUsage(T.StaticDrawUsage);leaves.instanceMatrix.setUsage(T.StaticDrawUsage);trunks.computeBoundingSphere();leaves.computeBoundingSphere();trunks.castShadow=true;leaves.castShadow=true;leaves.receiveShadow=true;this.terrain.add(trunks,leaves);}
    for(const t of map.trees){const g=group(this.terrain,t.x,heightAt(map,t.x,t.z),t.z);part(g,'cylinder',palette.bark,0,1.5,0,.26,3,.26);part(g,'cone',t.rich?0x6b8870:0x55836a,0,3,0,1.65,3.7,1.65);part(g,'cone',t.rich?0x879365:0x66947c,0,4.2,0,1.13,2.7,1.13);g.visible=false;this.treeMeshes.set(t.id,g);}
    const treeCapacity=map.trees.length,farTrunks=new T.InstancedMesh(geo.cylinder,material(palette.bark),treeCapacity),farLowerLeaves=new T.InstancedMesh(geo.cone,material(0xffffff),treeCapacity),farUpperLeaves=new T.InstancedMesh(geo.cone,material(0xffffff),treeCapacity);this.farTreeMeshes=[farTrunks,farLowerLeaves,farUpperLeaves];
    for(const mesh of this.farTreeMeshes){mesh.count=0;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=true;this.terrain.add(mesh);}farLowerLeaves.receiveShadow=true;farUpperLeaves.receiveShadow=true;
    for(const n of map.specialNodes||[]){
      const g=group(this.terrain,n.x,heightAt(map,n.x,n.z),n.z),color={ancientWood:0xd3a66d,crystal:0x7fe0dd,mana:0xb58cff}[n.resource];
      part(g,'cylinder',0x4b5149,0,.2,0,1.45,.4,1.45);
      const luminous=mesh=>{mesh.material=mesh.material.clone();mesh.material.emissive=new T.Color(color);mesh.material.emissiveIntensity=.42;return mesh;};
      if(n.resource==='ancientWood'){luminous(part(g,'cylinder',color,0,1.25,0,.6,2.3,.72));luminous(part(g,'sphere',0x7bad68,0,2.55,0,1.25,1.3,1.25));}
      else for(let i=0;i<6;i++){const a=i/6*Math.PI*2,shard=luminous(part(g,'cone',color,Math.sin(a)*.68,1.05+Math.abs(i-2.5)*.1,Math.cos(a)*.68,.4,2,.4));shard.rotation.z=(i-2.5)*.1;}
      const beacon=new T.Mesh(new T.RingGeometry(1.7,1.9,40),new T.MeshBasicMaterial({color,transparent:true,opacity:.72,side:T.DoubleSide,depthWrite:false}));beacon.rotation.x=-Math.PI/2;beacon.position.y=.08;g.add(beacon);g.userData.beacon=beacon;
      this.specialNodeMeshes.set(n.id,g);
    }
    // Landmarks remain inside the safe spawn plaza and never suggest a blocked route.
    for(const [poiIndex,p] of map.pois.entries()){const g=group(this.terrain,p.x,heightAt(map,p.x,p.z),p.z);if(poiIndex%2===0){for(let i=0;i<5;i++){const a=i/5*Math.PI*2;part(g,'box',0x718078,Math.cos(a)*1.35,.55,Math.sin(a)*1.35,.28,1.1,.42).rotation.y=-a;}part(g,'torus',0x9cdcca,0,.16,0,.9,.9,.9).rotation.x=Math.PI/2;const beacon=part(g,'sphere',0x8bdfcf,0,1.45,0,.24,.5,.24);beacon.material=mat(0x8bdfcf,{emissive:0x5fb5a5,emissiveIntensity:1.2});}else{part(g,'cylinder',0x60746d,0,.16,0,1.5,.32,1.5);for(let i=0;i<6;i++){const a=i/6*Math.PI*2;part(g,'sphere',0x91b9a6,Math.cos(a)*1.05,.35,Math.sin(a)*1.05,.3,.24,.3);}const pool=part(g,'cylinder',0x72c5bc,0,.27,0,.82,.12,.82);pool.material=mat(0x72c5bc,{emissive:0x3a8f88,emissiveIntensity:.65,roughness:.25});}}
    const cage=group(this.terrain,map.trollSpawn.x,heightAt(map,map.trollSpawn.x,map.trollSpawn.z),map.trollSpawn.z);for(let i=0;i<8;i++){const a=i/8*Math.PI*2;part(cage,'sphere',0x747e6c,Math.cos(a)*4,.6,Math.sin(a)*4,.75,.8,.75);}this.cage=cage;
    if(map.trollShop){
      const shop=group(this.terrain,map.trollShop.x,heightAt(map,map.trollShop.x,map.trollShop.z),map.trollShop.z);shop.name='Forja Ancestral';
      part(shop,'cylinder',0x293a38,0,.25,0,1.25,.5,1.25);
      part(shop,'box',0x735842,0,.85,0,1.75,1.2,1.15);
      part(shop,'box',0xd8b76f,0,1.55,0,1.95,.18,1.35);
      part(shop,'sphere',0xf3b75f,0,1.05,.62,.36,.36,.22);
      for(const side of [-1,1])part(shop,'cylinder',0x8fb8a7,side*.82,1.9,0,.08,.8,.08);
      this.trollShop=shop;
    }
    this.sanctuary=new T.Mesh(new T.RingGeometry(B.troll.sanctuaryRadius-.18,B.troll.sanctuaryRadius,64),new T.MeshBasicMaterial({color:0x72cbb4,transparent:true,opacity:.34,side:T.DoubleSide,depthWrite:false}));this.sanctuary.rotation.x=-Math.PI/2;this.sanctuary.position.y=.08;cage.add(this.sanctuary);
    this.seal=new T.Mesh(new T.CylinderGeometry(4,4,5,40,1,true),new T.MeshBasicMaterial({color:0xaaccc7,transparent:true,opacity:.12,side:T.DoubleSide,depthWrite:false}));this.seal.position.y=2.5;cage.add(this.seal);
    this.target.set(map.elfSpawn.x,heightAt(map,map.elfSpawn.x,map.elfSpawn.z)+1,map.elfSpawn.z);
  }
  menuScene(){
    this.loadMap(generateMap('THORNHOLD'));this.isMenu=true;const b=this.map.bases[5];
    const c=building('core',2);c.position.set(b.x,0,b.z);this.dynamic.add(c);
    const tower=building('tower',2);tower.position.set(b.x+4.4,0,b.z-6);this.dynamic.add(tower);
    const t=character('troll');t.position.set(b.gate.x-3,0,b.gate.z-8);t.rotation.y=.65;this.dynamic.add(t);this.menuTroll=t;
    const elf=character('elf');elf.position.set(b.x-3,0,b.z-5);elf.rotation.y=-2;this.dynamic.add(elf);
    const wall=building('wall',2);wall.position.set(b.gate.x,0,b.gate.z);if(b.gate.axis==='x')wall.rotation.y=Math.PI/2;this.dynamic.add(wall);
    for(const g of this.dynamic.children)g.position.y=heightAt(this.map,g.position.x,g.position.z);
    this.menuFocus=new T.Vector3(b.x-1,heightAt(this.map,b.x,b.z)+1,b.z);this.camera.position.set(b.x-22,19,b.gate.z-27);this.camera.lookAt(this.menuFocus);
  }
  start(map){this.isMenu=false;this.loadMap(map);this.yaw=Math.PI;this.pitch=.2;this.zoom=initialCameraZoom(this.preferredCamera);this.firstPersonAmount=firstPersonBlend(this.zoom);this.followId=null;this.focusPoint=null;this.freeCamera=false;this.aiming=false;this.buildMode=false;this.buildKind=null;this.buildCameraBlend=0;}
  setPreferredCamera(mode){this.preferredCamera=mode==='third'?'third':'first';this.zoom=initialCameraZoom(this.preferredCamera);}
  setZoom(value){this.zoom=Math.max(0,Math.min(23,value));this.preferredCamera=firstPersonBlend(this.zoom)>.5?'first':'third';}
  isFirstPerson(){return this.firstPersonAmount>.78&&!this.focusPoint&&!this.freeCamera;}
  setSpectatorFree(active){
    const next=!!active;if(next===this.freeCamera)return;
    this.freeCamera=next;this.focusPoint=null;
    if(next)this.freePosition.copy(this.camera.position);
  }
  moveSpectator(input,dt){
    if(!this.freeCamera||!this.map)return;
    const speed=(input.fast?34:15)*Math.min(.05,Math.max(0,dt)),delta=spectatorFlightDelta(this.yaw,input,speed),limit=(this.map.size-1)*this.map.cell;
    this.freePosition.x=T.MathUtils.clamp(this.freePosition.x+delta.x,0,limit);
    this.freePosition.z=T.MathUtils.clamp(this.freePosition.z+delta.z,0,limit);
    const floor=heightAt(this.map,this.freePosition.x,this.freePosition.z)+1.2;
    this.freePosition.y=T.MathUtils.clamp(this.freePosition.y+delta.y,floor,70);
  }
  updateTreeLod(force=false){
    if(!this.farTreeMeshes||!this.map||!this.snapshot||(!force&&this.elapsed<this.nextTreeLodAt))return;this.nextTreeLodAt=this.elapsed+.2;
    const [trunks,lowerLeaves,upperLeaves]=this.farTreeMeshes,dummy=this.treeLodDummy,origin=this.camera.position,nearDistanceSq=38*38;let farCount=0;
    for(const [id,g] of this.treeMeshes){const tree=this.treeStateById.get(id),available=!!tree&&tree.amount>0&&this.visibleTreeIds.has(id),near=available&&(this.activeTreeImpacts.has(g)||(g.position.x-origin.x)**2+(g.position.z-origin.z)**2<=nearDistanceSq);g.visible=near;if(!available||near)continue;
      const y=heightAt(this.map,tree.x,tree.z);dummy.position.set(tree.x,y+1.5,tree.z);dummy.scale.set(.26,3,.26);dummy.rotation.set(0,0,0);dummy.updateMatrix();trunks.setMatrixAt(farCount,dummy.matrix);
      dummy.position.y=y+3;dummy.scale.set(1.65,3.7,1.65);dummy.updateMatrix();lowerLeaves.setMatrixAt(farCount,dummy.matrix);lowerLeaves.setColorAt(farCount,this.treeLodColor.setHex(tree.rich?0x6b8870:0x55836a));
      dummy.position.y=y+4.2;dummy.scale.set(1.13,2.7,1.13);dummy.updateMatrix();upperLeaves.setMatrixAt(farCount,dummy.matrix);upperLeaves.setColorAt(farCount,this.treeLodColor.setHex(tree.rich?0x879365:0x66947c));farCount++;
    }
    for(const mesh of this.farTreeMeshes){mesh.count=farCount;mesh.instanceMatrix.needsUpdate=true;}if(lowerLeaves.instanceColor)lowerLeaves.instanceColor.needsUpdate=true;if(upperLeaves.instanceColor)upperLeaves.instanceColor.needsUpdate=true;
  }
  update(snapshot){
    this.snapshot=snapshot;const all=[...snapshot.units,...snapshot.structures,...(snapshot.wisps||[])],ids=new Set(all.map(e=>e.id));let structureRebuildBudget=2;
    for(const[id,g]of this.entities)if(!ids.has(id)){this.dynamic.remove(g);disposeModel(g);this.entities.delete(id);}
    for(const e of all){let g=this.entities.get(e.id);const signature=e.kind?structureVisualSignature(e.kind,e.tier,e.branch,e.legendary,e.epic):e.role+JSON.stringify(e.equipment||{})+JSON.stringify(e.itemLevels||{})+(e.ghost?'-ghost':''),mayRebuild=!g||!e.kind||structureRebuildBudget>0;
      if((!g||g.userData.signature!==signature)&&mayRebuild){if(g){this.dynamic.remove(g);disposeModel(g);}g=e.kind?optimizeStructureModel(building(e.kind,e.tier,e.branch,e.owner?playerColor(e.owner):null,e.legendary,e.epic)):e.role==='wisp'?wispModel():character(e.role,e.equipment,playerColor(e.id),e.itemLevels);if(e.kind)structureRebuildBudget--;g.userData.signature=signature;g.position.set(e.x,heightAt(this.map,e.x,e.z),e.z);if(e.kind){const scars=group(g);for(const sign of [-1,1]){part(scars,'sphere',0x333b35,sign*.65,.14,.85,.55,.23,.48);part(scars,'box',0x313e38,sign*.4,1,.55,.09,1.3,.12).rotation.z=sign*.35;}scars.visible=false;g.userData.scars=scars;}this.dynamic.add(g);this.entities.set(e.id,g);}
      g.userData.entity=e;(g.userData.target??=new T.Vector3()).set(e.x,heightAt(this.map,e.x,e.z),e.z);if(e.kind==='wall'){const b=this.baseById.get(e.baseId);if(b)g.rotation.y=b.gate.axis==='x'?Math.PI/2:0;}else if(e.kind)g.rotation.y=e.rotation||0;
      if(e.ghost&&!g.userData.ghostStyled){g.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.52;o.material.depthWrite=false;}});g.userData.ghostStyled=true;}
      g.visible=e.alive!==false||e.ghost;if(e.kind){const constructing=e.progress<1,upgrading=e.upgrading>0,stage=Math.min(4,Math.floor(e.progress*4)),upgradeProgress=upgrading?1-e.upgrading/Math.max(.001,e.upgradeDuration||e.upgrading):0;if(g.userData.constructionStage!==undefined&&stage>g.userData.constructionStage)g.userData.stagePulseUntil=this.elapsed+.28;g.userData.constructionStage=stage;g.userData.constructionProgress=e.progress;g.userData.upgradeProgress=upgradeProgress;g.userData.constructionRig.visible=constructing||upgrading;g.userData.constructionRig.scale.y=constructing?.22+e.progress*.78:1;g.userData.buildMeshes.forEach(mesh=>mesh.visible=!constructing||mesh.userData.buildPhase<=Math.min(3,Math.floor(e.progress*4)));g.userData.scars.visible=e.progress>=1&&e.hp/e.maxHp<.55;g.rotation.z=e.progress>=1&&e.hp/e.maxHp<.25?.055:0;}
    }
    const occupied=new Set((snapshot.wisps||[]).map(w=>w.treeId));this.visibleTreeIds=new Set(snapshot.trees.map(t=>t.id));this.treeStateById=new Map(snapshot.trees.map(t=>[t.id,t]));
    for(const t of snapshot.trees){const g=this.treeMeshes.get(t.id);if(!g)continue;g.userData.entity={...t,kind:'tree'};
      for(const leaf of g.children.slice(1)){if(!leaf.userData.ownMaterial){leaf.material=leaf.material.clone();leaf.material.transparent=true;leaf.material.depthWrite=false;leaf.userData.ownMaterial=true;}leaf.material.opacity=occupied.has(t.id)?.38:1;}
    }
    const nodeById=new Map((snapshot.specialNodes||[]).map(n=>[n.id,n]));for(const [id,g] of this.specialNodeMeshes){const n=nodeById.get(id);g.visible=!!n&&n.amount>0;if(n)g.userData.entity={...n,kind:'specialNode'};}
    for(const e of snapshot.events){if(e.id>this.eventId){this.effect(e);this.eventId=Math.max(this.eventId,e.id);}}
    if(this.seal)this.seal.visible=snapshot.state==='PREPARATION';
  }
  effect(e){
    if(e.type==='recall-start')this.startRecall(e);
    if(e.type==='recall-cancel')this.endRecall(e.unit,false,e);
    if(e.type==='recall-complete')this.endRecall(e.unit,true,e);
    if(e.type==='attack-animation'){
      this.animations.consume(e,this.elapsed,this.snapshot?.time,this.isFirstPerson()?'firstPerson':'thirdPerson');
      if(e.phase==='impact'&&e.unit===this.viewerId){this.viewmodel.impact(e.heavy?.12:.055);if(!this.reducedMotion()){this.shakeUntil=this.elapsed+(e.heavy?.18:.1);this.shakeStrength=e.heavy?.08:.025;}}
    }
    if(e.type==='dash'||e.type==='death')this.animations.cancel(e.unit||e.entity,e.type);
    if(e.type==='stun')this.animations.cancel(e.target,e.type);
    if(e.type==='impact'){
      const target=this.entities.get(e.entity);if(target)target.userData.hitUntil=this.elapsed+.14;
      if(e.unit===this.viewerId&&e.broken&&!this.reducedMotion())this.shakeStrength=.15;
    }
    if(e.type==='shot')this.launchProjectile(e,e.branch==='frost'?0x87d7ee:e.legendary?0xffd06f:0xf2d09a,e.legendary?.24:.16,e.legendary?30:24);
    if(e.type==='beam')this.launchProjectile(e,0xe8fff0,.2*Math.min(2,e.ramp||1),44);
    if(e.type==='gather'){
      const worker=this.entities.get(e.unit),tree=this.treeMeshes.get(e.entity);this.animations.confirmWork(e.unit,'gather',e.entity,this.elapsed);if(tree){tree.userData.gatherImpact={at:this.elapsed,side:worker?Math.sign(tree.position.x-worker.position.x)||1:1};this.activeTreeImpacts.add(tree);}if(e.unit===this.viewerId)this.viewmodel.impact(.035);
      if(!this.reducedMotion())for(let i=0;i<6;i++){const leaf=i>3,m=this.acquireEffect(leaf?'sphere':'box',leaf?0x638b69:0x8d6744);m.scale.set(leaf?.07:.055,leaf?.045:.025,leaf?.07:.13);m.position.set(e.x+(Math.random()-.5)*.35,heightAt(this.map,e.x,e.z)+.8+Math.random()*1.5,e.z+(Math.random()-.5)*.35);this.particles.push({mesh:m,velocity:new T.Vector3((Math.random()-.5)*2.8,1.3+Math.random()*2.2,(Math.random()-.5)*2.8),age:.42+Math.random()*.18});}
    }
    if(e.type==='repair'){this.animations.confirmWork(e.unit,'repair',e.entity,this.elapsed,.28);const target=this.entities.get(e.entity);if(target)target.userData.hitUntil=this.elapsed+.1;if(e.unit===this.viewerId)this.viewmodel.impact(.045);}
    if(e.type==='construction-complete'||(e.type==='complete'&&e.upgraded))this.structureCelebration(e,e.type==='complete');
    if(['damage','destroy','wisp-death','repair','complete','roar','build','impact'].includes(e.type)){
      const color=e.type==='damage'?0xe8b37b:e.type==='repair'?0x91e4c9:e.type==='gather'?0xb3c892:0xe8d697;
      const rubble=e.type==='destroy'&&e.kind==='wall';
      for(let i=0;i<(this.reducedMotion()?0:rubble?24:e.type==='destroy'?15:5);i++){const m=this.acquireEffect(rubble?'box':'sphere',rubble?0x9a8667:color);m.scale.setScalar((rubble?.16:.05)+Math.random()*(rubble?.25:.08));m.position.set(e.x,heightAt(this.map,e.x,e.z)+1.4,e.z);this.particles.push({mesh:m,velocity:new T.Vector3((Math.random()-.5)*(rubble?8:4),2+Math.random()*3,(Math.random()-.5)*(rubble?8:4)),age:0});}
    }
  }
  structureCelebration(e,upgraded=false){
    const color=e.advanced?0xb99cff:e.epic?0xaa79ff:e.legendary?0xffd06f:upgraded?0x91e4c9:0xe8d697,root=group(this.effects,e.x,heightAt(this.map,e.x,e.z)+.12,e.z),material=new T.MeshBasicMaterial({color,transparent:true,opacity:.9,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending});
    const rings=[];for(let i=0;i<2;i++){const ring=new T.Mesh(new T.RingGeometry(.72+i*.18,.82+i*.18,40),material.clone());ring.rotation.x=-Math.PI/2;ring.position.y=i*.18;root.add(ring);rings.push(ring);}
    const crown=[];for(let i=0;i<6;i++){const a=i/6*Math.PI*2,beam=new T.Mesh(new T.BoxGeometry(.06,1,.06),material.clone());beam.position.set(Math.sin(a)*.8,.55,Math.cos(a)*.8);beam.rotation.z=(i%2?.12:-.12);root.add(beam);crown.push(beam);}
    this.celebrations.push({root,rings,crown,start:this.elapsed,duration:upgraded?1.25:.9});
    if(!this.reducedMotion())for(let i=0;i<(upgraded?18:10);i++){const mesh=this.acquireEffect(i%3?'sphere':'box',color),angle=i/(upgraded?18:10)*Math.PI*2;mesh.scale.setScalar(.045+(i%4)*.018);mesh.position.set(e.x,heightAt(this.map,e.x,e.z)+.35,e.z);this.particles.push({mesh,velocity:new T.Vector3(Math.sin(angle)*(1.3+Math.random()*1.8),1.6+Math.random()*2.4,Math.cos(angle)*(1.3+Math.random()*1.8)),age:.12+Math.random()*.15});}
  }
  startRecall(e){
    this.endRecall(e.unit,false,null,true);
    const root=group(this.effects,e.x,heightAt(this.map,e.x,e.z)+.06,e.z),color=0x9beed5,material=new T.MeshBasicMaterial({color,transparent:true,opacity:.72,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending});
    const inner=new T.Mesh(new T.RingGeometry(.82,.92,32),material.clone()),outer=new T.Mesh(new T.RingGeometry(1.55,1.66,48),material.clone());inner.rotation.x=outer.rotation.x=-Math.PI/2;root.add(inner,outer);
    const runes=[];for(let i=0;i<8;i++){const a=i/8*Math.PI*2,rune=new T.Mesh(new T.BoxGeometry(.13,.025,.38),material.clone());rune.position.set(Math.sin(a)*1.24,.025,Math.cos(a)*1.24);rune.rotation.y=a;runes.push(rune);root.add(rune);}
    const beams=[];for(let i=0;i<4;i++){const a=i/4*Math.PI*2,beam=new T.Mesh(new T.CylinderGeometry(.025,.07,1,5),material.clone());beam.position.set(Math.sin(a)*.62,.5,Math.cos(a)*.62);beams.push(beam);root.add(beam);}
    const light=new T.PointLight(color,0,5);light.position.y=1.2;root.add(light);
    this.recallEffects.set(e.unit,{root,inner,outer,runes,beams,light,start:this.elapsed,duration:Math.max(.4,(e.until-(this.snapshot?.time||0))||B.troll.recallChannel),ending:0,completed:false});
  }
  endRecall(unit,completed,e,quiet=false){
    const effect=this.recallEffects.get(unit);if(effect){effect.ending=this.elapsed;effect.completed=completed;}
    if(quiet||!e||this.reducedMotion())return;
    const color=completed?0xbfffe8:0xe39a7d,count=completed?18:7;
    for(let i=0;i<count;i++){const mesh=this.acquireEffect('sphere',color),angle=i/count*Math.PI*2;mesh.scale.setScalar(.045+(i%3)*.02);mesh.position.set(e.x,heightAt(this.map,e.x,e.z)+.25,e.z);this.particles.push({mesh,velocity:new T.Vector3(Math.sin(angle)*(1.5+Math.random()*2),completed?2.2+Math.random()*2:.8,Math.cos(angle)*(1.5+Math.random()*2)),age:completed?.08:.45});}
  }
  updateRecallEffects(dt,reduced){
    for(const [unit,effect] of this.recallEffects){
      const age=this.elapsed-effect.start,progress=Math.min(1,age/effect.duration),ending=effect.ending?Math.min(1,(this.elapsed-effect.ending)/.38):0,opacity=effect.ending?1-ending:.45+.4*Math.sin(progress*Math.PI);
      effect.root.visible=opacity>.02;effect.inner.material.opacity=opacity;effect.outer.material.opacity=opacity*.75;effect.inner.scale.setScalar(.65+progress*.65);effect.outer.scale.setScalar(1.12-progress*.25);effect.inner.rotation.z+=dt*(reduced?0:.8);effect.outer.rotation.z-=dt*(reduced?0:.45);effect.light.intensity=opacity*(1.2+progress*2.2);
      effect.runes.forEach((rune,i)=>{rune.material.opacity=opacity*(.5+.5*Math.sin(age*5+i));rune.position.y=.03+progress*.35;});
      effect.beams.forEach((beam,i)=>{beam.material.opacity=opacity*.45;beam.scale.y=.5+progress*2.8;beam.position.y=beam.scale.y*.5;beam.rotation.y=age*(reduced?0:.7)+i;});
      const entity=this.entities.get(unit);if(entity&&!effect.ending){effect.root.position.x=entity.position.x;effect.root.position.z=entity.position.z;effect.root.position.y=heightAt(this.map,entity.position.x,entity.position.z)+.06;}
      if(ending>=1){this.effects.remove(effect.root);disposeModel(effect.root);this.recallEffects.delete(unit);}
    }
  }
  launchProjectile(e,color,size,speed){
    if(this.projectiles.length>72){const old=this.projectiles.shift();this.releaseEffect(old.mesh);if(old.trail)this.releaseEffect(old.trail);}
    const mesh=this.acquireEffect('sphere',color);mesh.scale.setScalar(size);mesh.position.set(e.x,heightAt(this.map,e.x,e.z)+4.5,e.z);
    const end=new T.Vector3(e.tx,heightAt(this.map,e.tx,e.tz)+2,e.tz),distance=mesh.position.distanceTo(end),trail=this.acquireEffect('sphere',color);trail.scale.set(size*.55,size*.55,Math.max(.25,size*4));
    this.projectiles.push({mesh,trail,start:mesh.position.clone(),end,age:0,duration:Math.max(.11,Math.min(.6,distance/speed))});
  }
  acquireEffect(shape,color){const key=`${shape}:${color}`,pool=this.effectPool.get(key)||[],mesh=pool.pop()||new T.Mesh(geo[shape],material(color));this.effectPool.set(key,pool);mesh.userData.poolKey=key;mesh.visible=true;mesh.rotation.set(0,0,0);this.effects.add(mesh);return mesh;}
  releaseEffect(mesh){this.effects.remove(mesh);mesh.visible=false;const pool=this.effectPool.get(mesh.userData.poolKey)||[];if(pool.length<128)pool.push(mesh);this.effectPool.set(mesh.userData.poolKey,pool);}
  previewSwing(id,heavy){
    const g=this.entities.get(id);if(!g)return;const u=g.userData.entity;
    if(this.elapsed<(g.userData.previewNext||0)||(heavy&&u.cooldowns?.heavy>this.snapshot.time))return;
    if(u.cooldowns?.attack>this.snapshot.time+B.combat.buffer)return;
    g.userData.previewNext=this.elapsed+(u.combat?.interval||1)*(heavy?B.troll.heavyRecovery:1);
    const windup=heavy?B.combat.heavyWindup:B.combat.lightWindup;this.animations.predict(id,heavy?'heavy':'light',this.elapsed,{windup});
  }
  previewWork(id,type,target){
    const g=this.entities.get(id);if(!g||this.elapsed<(g.userData.workPreviewNext||0))return;g.userData.workPreviewNext=this.elapsed+.32;this.animations.predict(id,type,this.elapsed,{windup:type==='repair' ? .28 : .2,target});
  }
  groundPoint(clientX,clientY){this.pointer.set(clientX/innerWidth*2-1,-clientY/innerHeight*2+1);this.ray.setFromCamera(this.pointer,this.camera);return this.ground?this.ray.intersectObject(this.ground,false)[0]?.point||null:null;}
  constructionPoint(origin){const p=boundedConstructionPoint(origin,this.groundPoint(innerWidth/2,innerHeight/2),this.yaw);return{x:p.x,y:heightAt(this.map,p.x,p.z),z:p.z};}
  pick(clientX,clientY,ignoreId){this.pointer.set(clientX/innerWidth*2-1,-clientY/innerHeight*2+1);this.ray.setFromCamera(this.pointer,this.camera);const visibleTrees=[...this.treeMeshes.values()].filter(g=>g.visible&&this.visibleTreeIds.has(g.userData.entity?.id)),visibleNodes=[...this.specialNodeMeshes.values()].filter(g=>g.visible);const hits=this.ray.intersectObjects([...this.entities.values()].filter(g=>g.visible&&g.userData.entity.id!==ignoreId).concat(visibleTrees,visibleNodes),true);for(const hit of hits){let o=hit.object;while(o){if(o.userData.entity)return o.userData.entity;o=o.parent;}}return null;}
  entityPoint(e){const g=this.entities.get(e.id);if(e.role==='wisp'&&g?.userData.spirit){const v=g.userData.spirit.getWorldPosition(this.worldVector);return this.project(v.x,v.y+.55,v.z);}return this.project(e.x,heightAt(this.map,e.x,e.z)+(e.kind==='tower'?6:e.kind?3.6:e.role==='troll'?4.4:2.6),e.z);}
  ghostAt(kind,p,valid,rotation=0){
    if(!p){if(this.ghost)this.ghost.visible=false;return;}
    if(!this.ghost||this.ghost.userData.kind!==kind){if(this.ghost){this.ghost.traverse(o=>{if(o.isMesh)o.material.dispose();});this.scene.remove(this.ghost);}this.ghost=building(kind);this.ghost.userData.kind=kind;this.ghost.traverse(o=>{if(o.isMesh){o.material=new T.MeshBasicMaterial({color:0x87e4c1,transparent:true,opacity:.35,depthWrite:false});o.castShadow=false;}});this.scene.add(this.ghost);}
    this.ghost.visible=true;this.ghost.position.set(p.x,heightAt(this.map,p.x,p.z)+.04,p.z);this.ghost.rotation.y=rotation;this.ghost.traverse(o=>{if(o.isMesh)o.material.color.setHex(valid?0x87e4c1:0xe7826e);});
    this.selection.position.set(p.x,heightAt(this.map,p.x,p.z)+.07,p.z);this.selection.visible=true;
  }
  setConstructionRange(u,visible){this.buildRange.visible=!!visible&&!!u;if(this.buildRange.visible){groundRing(this.buildRange,this.map,u.x,u.z,B.construction.range);this.buildRange.material.color.setHex(0x80d3bd);}}
  setBuildMode(active,kind=null){this.buildMode=!!active;this.buildKind=active?kind:null;}
  setContextTarget(id){this.contextTarget=id||null;}
  setCombatDebug(enabled,snapshot){
    const towers=enabled?(snapshot?.structures||[]).filter(s=>s.kind==='tower'):[];const keep=new Set(towers.map(s=>s.id));
    for(const[id,ring]of this.towerDebugRings)if(!keep.has(id)){this.scene.remove(ring);this.towerDebugRings.delete(id);}
    for(const tower of towers){let ring=this.towerDebugRings.get(tower.id);if(!ring){ring=new T.Mesh(new T.RingGeometry(16.92,17,64),new T.MeshBasicMaterial({color:0x75e0b0,side:T.DoubleSide,transparent:true,opacity:.2,depthWrite:false}));ring.rotation.x=-Math.PI/2;this.towerDebugRings.set(tower.id,ring);this.scene.add(ring);}const radius=B.structures.tower.range+towerProfile(tower).range;groundRing(ring,this.map,tower.x,tower.z,radius);const status=snapshot.debugTowers?.find(s=>s.id===tower.id);ring.material.color.setHex(status?.valid?0x79e2a8:0xe98775);ring.material.opacity=status?.valid?.34:.2;}
  }
  setAnimationDebug(enabled){this.animations.setDebug(enabled);if(enabled)globalThis.__thornholdAnimationDebug=this.animations.debugEntries;else delete globalThis.__thornholdAnimationDebug;}
  animationDebug(){return this.animations.debugEntries.slice(-5);}
  reducedMotion(){return this.motionQuery.matches||document.body.classList.contains('reduce-motion');}
  inAnimationView(position,margin=10){for(const plane of this.frustum.planes)if(plane.distanceToPoint(position)<-margin)return false;return true;}
  updateAdaptiveResolution(dt){
    this.frameSamples.push(dt*1000);if(this.frameSamples.length>180)this.frameSamples.shift();
    if(this.elapsed<this.resolutionCheckAt||this.frameSamples.length<60)return;this.resolutionCheckAt=this.elapsed+2;
    const sorted=[...this.frameSamples].sort((a,b)=>a-b),p95=sorted[Math.floor((sorted.length-1)*.95)]||16.7,average=this.frameSamples.reduce((n,v)=>n+v,0)/this.frameSamples.length;
    const slowThreshold=Math.max(7.8,this.targetFrameMs*1.15),fastThreshold=Math.max(7.1,this.targetFrameMs*1.04);
    let next=this.pixelRatio;if(p95>slowThreshold)next=Math.max(.65,next-.1);else if(p95<fastThreshold)next=Math.min(this.maxPixelRatio,next+.05);
    if(Math.abs(next-this.pixelRatio)>.001){this.pixelRatio=next;this.renderer.setPixelRatio(next);this.resize();}
    this.performance={fps:Math.round(1000/Math.max(1,average)),targetFps:this.targetFps,frameP95Ms:+p95.toFixed(2),drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,pixelRatio:+this.pixelRatio.toFixed(2),longTasks:this.longTasks};
  }
  render(time,viewerId,selected){
    this.viewerId=viewerId;
    const dt=Math.min(.05,(time-this.lastTime)/1000||.016),reduced=this.reducedMotion();this.lastTime=time;this.elapsed+=dt;this.updateAdaptiveResolution(dt);
    if(this.isMenu){const f=this.menuFocus,t=reduced?0:this.elapsed*.04;this.camera.position.set(f.x-23+Math.sin(t)*2,f.y+24,f.z-29+Math.cos(t)*2);this.camera.lookAt(f);this.menuTroll.userData.body.position.y=reduced?0:Math.sin(this.elapsed*1.6)*.06;}
    else if(this.snapshot){
      this.updateTreeLod();
      this.camera.updateMatrixWorld();this.projectionScreenMatrix.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.projectionScreenMatrix);
      for(const g of this.entities.values()){
        const e=g.userData.entity;if(!e.kind){g.position.lerp(g.userData.target,1-Math.exp(-dt*16));g.position.y=heightAt(this.map,g.position.x,g.position.z);}
        if(!this.inAnimationView(g.position))continue;
        if(e.role==='wisp'){
          const phase=(reduced?0:this.elapsed*.95)+e.x*.3,active=e.income>0,forming=e.readyAt>this.snapshot.time;
          setWispOrbit(g.userData.spirit.position,phase,reduced);g.userData.orb.rotation.y=this.elapsed;
          g.userData.spirit.scale.setScalar(forming?.65:1);g.userData.glow.material.opacity=active?.8:.35;g.userData.ring.material.opacity=e.id===selected?.85:.25;
          g.userData.tail.forEach((p,i)=>{setWispOrbit(p.position,phase-(i+1)*.14,reduced);p.visible=active&&!reduced;});continue;
        }
        if(e.kind){if(g.userData.hitUntil>this.elapsed)g.rotation.z=Math.sin(this.elapsed*85)*.035;const pulse=g.userData.stagePulseUntil>this.elapsed?1+Math.sin((g.userData.stagePulseUntil-this.elapsed)*28)*.035:1;g.scale.x=pulse;g.scale.z=pulse;const rig=g.userData.constructionRig;if(rig?.visible){rig.rotation.y+=dt*(g.userData.upgradeProgress>0?.42:.08);const ring=g.userData.upgradeRing;if(ring){ring.rotation.z+=dt*(g.userData.upgradeProgress>0?2.4:.55);ring.scale.setScalar(g.userData.upgradeProgress>0?.75+g.userData.upgradeProgress*.55:1);}if(!reduced&&this.elapsed>(g.userData.nextBuildSpark||0)){g.userData.nextBuildSpark=this.elapsed+.28;const spark=this.acquireEffect('sphere',g.userData.upgradeProgress>0?0x8ee6cd:0xe5c17c);spark.scale.setScalar(.045);spark.position.set(g.position.x+(Math.random()-.5)*1.8,g.position.y+.4+Math.random()*2.5,g.position.z+(Math.random()-.5)*1.8);this.particles.push({mesh:spark,velocity:new T.Vector3((Math.random()-.5)*.7,.5+Math.random(),(Math.random()-.5)*.7),age:.45});}}continue;}
        let delta=(e.yaw-g.rotation.y+Math.PI*3)%(Math.PI*2)-Math.PI;g.rotation.y+=delta*Math.min(1,dt*16);
        const moving=e.action==='walk'||g.position.distanceTo(g.userData.target)>.06,sprinting=moving&&e.sprinting===true,work=e.action==='gather'||e.action==='repair'||e.action==='build',healing=e.action==='heal',animation=this.animations.get(e.id,this.elapsed),combat=animation?.timeline||IDLE_COMBAT,strike=!!combat.active&&!WORK_ANIMATION_KINDS.has(animation?.kind),workActive=!!combat.active&&WORK_ANIMATION_KINDS.has(animation?.kind);
        const windupArc=animation?.kind==='heavy'?-2.15:-1.75,impactArc=animation?.kind==='heavy'?1.15:.88;
        const arc=!strike?0:combat.stage==='windup'?windupArc*combat.windup:combat.stage==='impact'?windupArc+(impactArc-windupArc)*combat.strike:impactArc*(1-combat.recover);
        const workArc=!workActive?0:combat.stage==='windup'?-1.15*combat.windup:combat.stage==='impact'?-1.15+2.35*combat.strike:1.2*(1-combat.recover);
        const pace=sprinting?14:9,supportArm=animation?.kind==='heavy' ? 0.48 : 0.22;g.userData.legs.forEach((l,i)=>l.rotation.x=moving?Math.sin(this.elapsed*pace+i*Math.PI)*(sprinting?.72:.5):0);
        g.userData.arms.forEach((a,i)=>a.rotation.x=strike?(i===1?arc:supportArm):workActive?(i===1?workArc:-workArc*.22):healing?-1.25+Math.sin(this.elapsed*8+i)*.12:work?(i===1?-1.1:.15):moving?Math.sin(this.elapsed*pace+i*Math.PI+Math.PI)*(sprinting?.58:.4):0);
        if(g.userData.heldItems?.axe){const gathering=workActive;g.userData.heldItems.axe.visible=gathering;g.userData.heldItems.hammer.visible=!gathering;}
        if(workActive){const target=this.treeMeshes.get(animation.target)||this.entities.get(animation.target)||this.specialNodeMeshes.get(animation.target);if(target){const desired=Math.atan2(target.position.x-g.position.x,target.position.z-g.position.z);g.rotation.y+=(desired-g.rotation.y)*Math.min(1,dt*18);}}
        g.userData.body.rotation.z=strike?-arc*.08:workActive?-workArc*.06:0;g.userData.body.rotation.x=sprinting?-.18:workActive?.11:0;g.userData.body.position.y=Math.sin(this.elapsed*(moving?(sprinting?24:18):2))*(moving?(sprinting?.09:.06):.025);
        if(sprinting&&!reduced&&this.elapsed>(g.userData.nextRunDust||0)){g.userData.nextRunDust=this.elapsed+.14;const dust=this.acquireEffect('sphere',0xb4aa83);dust.scale.set(.12,.05,.12);dust.position.copy(g.position);dust.position.y+=.08;this.particles.push({mesh:dust,velocity:new T.Vector3((Math.random()-.5)*.5,.15,(Math.random()-.5)*.5),age:.58});}
      }
      for(const tree of this.activeTreeImpacts){const hit=tree.userData.gatherImpact,age=this.elapsed-hit.at;if(age>=.42){tree.rotation.set(0,0,0);tree.userData.gatherImpact=null;this.activeTreeImpacts.delete(tree);continue;}const amount=Math.sin(age/.42*Math.PI)*.065*(hit.side||1);tree.rotation.z=amount;tree.rotation.x=amount*.35;}
      if(this.freeCamera){this.viewmodel.root.visible=false;
        const floor=heightAt(this.map,this.freePosition.x,this.freePosition.z)+1.2;this.freePosition.y=Math.max(this.freePosition.y,floor);this.camera.position.copy(this.freePosition);this.target.copy(this.freePosition);
        const horizontal=Math.cos(this.pitch),aim=this.cameraAim.copy(this.freePosition).add(this.cameraDirection.set(-Math.sin(this.yaw)*horizontal,-Math.sin(this.pitch),Math.cos(this.yaw)*horizontal).multiplyScalar(12));this.camera.lookAt(aim);
      }else{
      let me=this.entities.get(viewerId);if(!me||(!me.userData.entity.alive&&!me.userData.entity.ghost)){me=this.entities.get(this.followId);if(!me)for(const candidate of this.entities.values())if(!candidate.userData.entity.kind&&candidate.userData.entity.alive){me=candidate;break;}}
      if(this.focusPoint)this.target.lerp(this.cameraScratch.set(this.focusPoint.x,heightAt(this.map,this.focusPoint.x,this.focusPoint.z)+1.25,this.focusPoint.z),Math.min(1,dt*9));
      else if(me)this.target.lerp(this.cameraScratch.copy(me.position).setY(me.position.y+(me.userData.entity.role==='troll'?2:1.25)),Math.min(1,dt*9));
      const pitch=this.focusPoint?1.1:this.pitch,zoom=this.focusPoint?30:this.zoom,followOffset=followCameraOffset(this.yaw,zoom),fpTarget=this.focusPoint?0:firstPersonBlend(zoom);
      this.firstPersonAmount+=(fpTarget-this.firstPersonAmount)*(1-Math.exp(-dt*10));
      const horizontal=Math.cos(pitch)*zoom,offset=this.cameraDirection.set(this.focusPoint?Math.sin(this.yaw)*horizontal:followOffset.x,this.focusPoint?Math.sin(pitch)*zoom:followOffset.y,this.focusPoint?-Math.cos(this.yaw)*horizontal:followOffset.z),position=this.cameraPosition.copy(this.target).add(offset);
      if(this.aiming&&!this.focusPoint)position.add(this.cameraScratch.set(-Math.cos(this.yaw)*1.7,0,-Math.sin(this.yaw)*1.7));
      const buildCameraTarget=this.buildMode&&!this.focusPoint&&this.firstPersonAmount<.5?1:0;
      this.buildCameraBlend+=(buildCameraTarget-this.buildCameraBlend)*(1-Math.exp(-dt*12));
      for(const [i,material] of (this.decorForestMaterials||[]).entries()){
        const fading=this.buildCameraBlend>.005;
        material.opacity=T.MathUtils.lerp(1,i?.3:.18,this.buildCameraBlend);material.depthWrite=!fading;
        if(material.transparent!==fading){material.transparent=fading;material.needsUpdate=true;}
      }
      const cameraHeight=T.MathUtils.lerp(FOLLOW_CAMERA_HEIGHT,BUILD_CAMERA_HEIGHT,this.buildCameraBlend);
      if(this.buildCameraBlend>.001){
        const buildPosition=this.cameraScratch.copy(this.target).add(this.cameraDirection.set(Math.sin(this.yaw)*BUILD_CAMERA_BACK,BUILD_CAMERA_HEIGHT,-Math.cos(this.yaw)*BUILD_CAMERA_BACK));
        position.lerp(buildPosition,this.buildCameraBlend);
      }
      // Sample the same solid cells as movement; avoid raycasting thousands of forest instances.
      const direction=this.cameraDirection.copy(position).sub(this.target).normalize(),distanceToCamera=position.distanceTo(this.target);
      if(!this.focusPoint&&this.firstPersonAmount<.95)for(let d=1.5;d<distanceToCamera;d+=.4){const p=this.worldVector.copy(this.target).addScaledVector(direction,d),c=toCell(this.map,p),floor=heightAt(this.map,p.x,p.z)+(walkable(this.map,c.x,c.z)?.5:4.2);if(p.y<floor){position.copy(this.target).addScaledVector(direction,Math.max(2,d-.5));break;}}
      if(me&&this.firstPersonAmount>.001){const eye=this.cameraScratch.copy(me.position);eye.y+=me.userData.entity.role==='troll'?3.55:2.05;position.lerp(eye,this.firstPersonAmount);}
      if(this.focusPoint)position.y=Math.max(position.y,heightAt(this.map,position.x,position.z)+.8);else if(this.firstPersonAmount<.001)position.y=this.target.y+cameraHeight;
      this.camera.position.lerp(position,Math.min(1,dt*12));
      if(this.focusPoint)this.camera.position.y=Math.max(this.camera.position.y,heightAt(this.map,this.camera.position.x,this.camera.position.z)+.6);else if(this.firstPersonAmount<.001)this.camera.position.y=this.target.y+cameraHeight;
      if(me&&this.firstPersonAmount>.02&&!reduced){const moving=me.userData.entity.action==='walk'||me.position.distanceTo(me.userData.target)>.06,sprinting=moving&&me.userData.entity.sprinting,pace=sprinting?13:8.5,amplitude=moving?(sprinting?.085:.052):.008;this.camera.position.y+=Math.sin(this.elapsed*pace)*amplitude*this.firstPersonAmount;this.camera.position.x+=Math.cos(this.elapsed*pace*.5)*amplitude*.38*this.firstPersonAmount;}
      const aim=this.cameraAim.copy(this.target);if(this.firstPersonAmount>.001&&!this.focusPoint){const horizontalAim=Math.cos(this.pitch);aim.copy(this.camera.position).add(this.cameraDirection.set(-Math.sin(this.yaw)*horizontalAim,-Math.sin(this.pitch),Math.cos(this.yaw)*horizontalAim).multiplyScalar(20));}else if(this.aiming&&!this.focusPoint)aim.add(this.cameraDirection.set(-Math.sin(this.yaw)*5,0,Math.cos(this.yaw)*5));
      if(this.buildCameraBlend>.001&&me){
        const origin=me.userData.entity,point=boundedConstructionPoint(origin,null,this.yaw);
        this.buildAim.set(point.x,heightAt(this.map,point.x,point.z)+.05,point.z);aim.lerp(this.buildAim,this.buildCameraBlend);
      }
      this.camera.lookAt(aim);
      if(!reduced&&this.shakeUntil>this.elapsed&&!this.focusPoint)this.camera.position.x+=Math.sin(this.elapsed*110)*this.shakeStrength;
      if(me){const entity=me.userData.entity,moving=entity.action==='walk'||me.position.distanceTo(me.userData.target)>.06,animation=this.animations.get(entity.id,this.elapsed);me.visible=this.firstPersonAmount<.96||entity.ghost;this.viewmodel.update(this.elapsed,dt,{entity,blend:this.firstPersonAmount,moving,sprinting:entity.sprinting,reducedMotion:reduced,tool:this.buildMode?'build':entity.action==='gather'?'gather':'work',animation});if(this.firstPersonAmount>.02){const kick=this.viewmodel.cameraKick;this.camera.rotateX(kick.pitch*this.firstPersonAmount);this.camera.rotateY(kick.yaw*this.firstPersonAmount);this.camera.rotateZ(kick.roll*this.firstPersonAmount);}}else this.viewmodel.root.visible=false;
      }
      const highlighted=this.contextTarget||selected,s=this.entities.get(highlighted)||this.treeMeshes.get(highlighted)||this.specialNodeMeshes.get(highlighted);if(!this.ghost?.visible){this.selection.visible=!!s;if(s)this.selection.position.set(s.position.x,s.position.y+.08,s.position.z);}const selectedMesh=this.entities.get(selected)||this.treeMeshes.get(selected)||this.specialNodeMeshes.get(selected);this.range.visible=!!selectedMesh&&['tower','arcaneTower'].includes(selectedMesh.userData.entity?.kind);if(this.range.visible){const entity=selectedMesh.userData.entity,radius=B.structures[entity.kind].range+(entity.kind==='tower'?towerProfile(entity).range:0),key=entity.id+':'+radius;if(this.rangeKey!==key){groundRing(this.range,this.map,selectedMesh.position.x,selectedMesh.position.z,radius);this.rangeKey=key;}}
    }
    this.updateRecallEffects(dt,reduced);for(let i=this.celebrations.length-1;i>=0;i--){const celebration=this.celebrations[i],progress=Math.min(1,(this.elapsed-celebration.start)/celebration.duration),fade=1-progress;celebration.rings.forEach((ring,j)=>{ring.scale.setScalar(1+progress*(2.2+j*.45));ring.material.opacity=fade*(.9-j*.18);ring.rotation.z+=(j?-.7:.9)*dt;});celebration.crown.forEach((beam,j)=>{beam.position.y=.55+progress*2.1;beam.scale.y=1+progress*1.8;beam.material.opacity=fade*(.75+.2*Math.sin(this.elapsed*7+j));});if(this.elapsed-celebration.start>celebration.duration){this.effects.remove(celebration.root);disposeModel(celebration.root);this.celebrations.splice(i,1);}}
    while(this.particles.length>180){const oldest=this.particles.shift();this.releaseEffect(oldest.mesh);}for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.age+=dt;p.velocity.y-=dt*8;p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.scale.multiplyScalar(.98);if(p.age>1){this.releaseEffect(p.mesh);this.particles.splice(i,1);}}
    for(let i=this.projectiles.length-1;i>=0;i--){const p=this.projectiles[i];p.age+=dt;const t=Math.min(1,p.age/p.duration);p.mesh.position.lerpVectors(p.start,p.end,t);if(p.trail){p.trail.position.lerpVectors(p.start,p.end,Math.max(0,t-.045/p.duration));p.trail.lookAt(p.mesh.position);}if(p.age>p.duration){this.releaseEffect(p.mesh);if(p.trail)this.releaseEffect(p.trail);for(let j=0;j<(reduced?0:4);j++){const m=this.acquireEffect('sphere',p.mesh.material.color.getHex());m.scale.setScalar(.05+Math.random()*.08);m.position.copy(p.end);this.particles.push({mesh:m,velocity:new T.Vector3((Math.random()-.5)*2,1+Math.random()*2,(Math.random()-.5)*2),age:.35});}this.projectiles.splice(i,1);}}
    if(this.elapsed>=this.nextShadowUpdateAt){this.sun.position.set(this.target.x+25,55,this.target.z-20);this.sun.target.position.copy(this.target);this.renderer.shadowMap.needsUpdate=true;this.nextShadowUpdateAt=this.elapsed+this.shadowUpdateInterval;}
    this.renderer.render(this.scene,this.camera);
  }
  project(x,y,z){const v=this.projectVector.set(x,y,z).project(this.camera);return {x:(v.x*.5+.5)*innerWidth,y:(-.5*v.y+.5)*innerHeight,visible:v.z<1&&v.z>0};}
}
