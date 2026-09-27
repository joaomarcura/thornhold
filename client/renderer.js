import * as T from 'three';
import { BALANCE as B, distance, towerProfile } from '../shared/config.js';
import { generateMap, randomFor, toCell, walkable, heightAt } from '../shared/map.js';
import { terrainMesh, groundRing } from './terrain.js';
import { playerColor } from '../shared/player-identity.js';

const palette={ground:0x364f46,path:0x68705a,stone:0x536568,bark:0x4b4035,leaf:0x345f53,gold:0xeac481,teal:0x80d3bd,troll:0x7f9990,elf:0xa8dbbd};
export const FOLLOW_CAMERA_HEIGHT=Math.sin(.58)*13*.8;
export const followCameraOffset=(yaw,zoom)=>({x:Math.sin(yaw)*Math.cos(.58)*zoom,y:FOLLOW_CAMERA_HEIGHT,z:-Math.cos(yaw)*Math.cos(.58)*zoom});
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
const mat=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.86,flatShading:true,...extra});
const geo={box:new T.BoxGeometry(1,1,1),sphere:new T.IcosahedronGeometry(1,0),cylinder:new T.CylinderGeometry(1,1,1,7),cone:new T.ConeGeometry(1,1,7)};
const sharedGeometries=new Set(Object.values(geo)),materials=new Map();function material(c){if(!materials.has(c)){const value=mat(c);value.userData.shared=true;materials.set(c,value);}return materials.get(c);}
function part(g,shape,color,x,y,z,sx,sy,sz){const mesh=new T.Mesh(geo[shape],material(color));mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);g.add(mesh);return mesh;}
function group(parent,x=0,y=0,z=0){const g=new T.Group();g.position.set(x,y,z);parent?.add(g);return g;}
function disposeModel(g){g?.traverse(o=>{if(o.geometry&&!sharedGeometries.has(o.geometry))o.geometry.dispose();const list=Array.isArray(o.material)?o.material:[o.material];for(const value of list)if(value&&!value.userData?.shared)value.dispose();});}
export function character(role,equipment={},identity=null){
  const g=group(),troll=role==='troll',skin=troll?palette.troll:palette.elf;
  const body=group(g);g.userData.body=body;
  part(body,'sphere',skin,0,troll?2:1,0,troll?1.05:.4,troll?1.3:.65,troll?.67:.28);
  part(body,'sphere',troll?0x3a5458:0x235653,0,troll?1.25:.67,.02,troll?.8:.47,troll?.45:.48,troll?.55:.35);
  const head=group(body,0,troll?3.1:1.83,.06);part(head,'sphere',skin,0,0,0,troll?.68:.31,troll?.64:.35,troll?.55:.28);
  if(troll){
    for(const sign of [-1,1]){const horn=part(head,'cone',0xd8d0ac,sign*.58,.4,0,.2,.7,.2);horn.rotation.z=-sign*.65;part(head,'sphere',0xedd692,sign*.26,.01,.47,.085,.055,.07);part(head,'cone',0xded4b6,sign*.3,-.4,.38,.09,.34,.1);}
    part(body,'sphere',0x5a7775,-.85,2.5,0,.56,.55,.55);part(body,'sphere',0x8d7760,.85,2.5,0,.56,.55,.55);
  }else{
    part(head,'cone',0x386757,0,.34,-.03,.46,.6,.4);
    for(const sign of [-1,1]){const ear=part(head,'cone',skin,sign*.35,.01,0,.11,.36,.14);ear.rotation.z=-sign*1.1;part(head,'sphere',0x122c2c,sign*.12,.02,.25,.025,.035,.035);}
    part(body,'box',0x326d63,0,1,-.26,.58,.87,.12);
  }
  if(identity)part(body,'box',identity.hex,0,troll?1.75:1.02,troll?.48:-.34,troll?1.45:.7,troll?.16:.14,troll?.12:.16);
  const arms=[];for(const sign of [-1,1]){const arm=group(body,sign*(troll?1.03:.45),troll?2.4:1.3,0);part(arm,'sphere',skin,0,-(troll?.5:.25),0,troll?.38:.12,troll?.75:.4,troll?.37:.14);arms.push(arm);}
  const weapon=group(arms[1],0,troll?-1.03:-.53,.15);
  if(troll&&equipment.weapon==='claws'){
    part(weapon,'box',0x4a4e50,0,.35,.15,.42,.9,.28);for(const x of [-.14,.14])part(weapon,'cylinder',0x98aaa8,x,.9,.18,.09,.95,.09);part(weapon,'box',0x614832,0,-.25,.1,.18,.55,.2);
  }else if(troll&&equipment.weapon==='edge'){
    part(weapon,'cylinder',0x614832,0,.25,.15,.1,2.2,.1);part(weapon,'sphere',0xb96f85,0,1.45,.15,.32,.42,.32);part(weapon,'sphere',0xe3b2c0,0,1.45,.15,.13,.18,.13);
  }else if(troll&&equipment.weapon==='maul'){
    part(weapon,'cylinder',0x614832,0,.15,.15,.11,1.8,.11);part(weapon,'box',0x8f9691,-.22,1.12,.15,.72,.85,.18);const edge=part(weapon,'cone',0xc7cec7,.36,1.12,.15,.62,.82,.2);edge.rotation.z=-Math.PI/2;
  }else{
    part(weapon,'cylinder',0x614832,0,.15,.15,.11,troll?1.6:.65,.11);part(weapon,'box',troll?0x817d73:0xc2b493,0,troll?1:.52,.15,troll?.65:.38,troll?.65:.23,troll?.6:.26);
  }
  if(troll){
    if(['carapace','siegeplate'].includes(equipment.armor))for(const sign of [-1,1])part(body,'box',equipment.armor==='siegeplate'?0x655e58:0x7f8173,sign*.9,2.6,0,.85,.6,.8);
    if(['moss','barkhide'].includes(equipment.armor))for(const sign of [-1,1])part(body,'sphere',equipment.armor==='barkhide'?0x796347:0x67996c,sign*.85,2.65,0,.65,.45,.6);
    if(equipment.armor==='heartplate')part(body,'box',0x765757,0,2.1,.6,1.45,1.25,.18);
    if(equipment.helmet){const helmetColors={amber:0xe9aa58,hunt:0x88cfe6,totem:0xc8b4e5,horned:0x7f8173,seer:0x73b0a5};part(head,'sphere',helmetColors[equipment.helmet]||0xc8b4e5,0,.18,-.04,.76,.42,.62);part(body,'sphere',helmetColors[equipment.helmet]||0xc8b4e5,0,1.35,.63,.22,.32,.18);}
  }
  const legs=[];for(const sign of [-1,1]){const leg=group(g,sign*(troll?.43:.19),troll?1.1:.65,0);part(leg,'sphere',troll?0x50655e:0x465852,0,troll?-.5:-.3,0,troll?.37:.15,troll?.67:.38,troll?.36:.17);part(leg,'box',0x293b37,0,troll?-1:-.58,.1,troll?.65:.29,.2,troll?.75:.4);legs.push(leg);}
  if(troll&&equipment.boots)for(const leg of legs)part(leg,'box',equipment.boots==='mantle'?0x345e75:equipment.boots==='shadowboots'?0x403853:equipment.boots==='rootboots'?0x65523d:0x756b58,0,-.98,.12,.72,.42,.82);
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=false;}});g.userData={body,arms,legs,role};return g;
}

const loadoutPreviews=new WeakMap();
export function mountTrollLoadoutPreview(canvas,equipment={}){
  if(!canvas)return;
  let preview=loadoutPreviews.get(canvas);
  if(!preview){
    const renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'}),scene=new T.Scene(),camera=new T.PerspectiveCamera(27,1,.1,50);
    renderer.setPixelRatio(Math.min(2,globalThis.devicePixelRatio||1));renderer.outputColorSpace=T.SRGBColorSpace;
    scene.add(new T.HemisphereLight(0xdcebd8,0x182522,2.5));const key=new T.DirectionalLight(0xf0d68e,3.2);key.position.set(-4,7,6);scene.add(key);const rim=new T.DirectionalLight(0x6ebfa8,2);rim.position.set(5,3,-4);scene.add(rim);
    camera.position.set(6.8,4.2,10);camera.lookAt(0,1.65,0);preview={renderer,scene,camera,model:null};loadoutPreviews.set(canvas,preview);
  }
  if(preview.model){preview.scene.remove(preview.model);disposeModel(preview.model);}
  preview.model=character('troll',equipment);preview.model.rotation.y=-.42;preview.scene.add(preview.model);
  const width=Math.max(120,canvas.clientWidth||160),height=Math.max(190,canvas.clientHeight||250);preview.camera.aspect=width/height;preview.camera.updateProjectionMatrix();preview.renderer.setSize(width,height,false);preview.renderer.render(preview.scene,preview.camera);
}
export function building(kind,tier=1,branch='power',identity=null,legendary=false,epic=false){
  tier=Math.min(B.visualTier,tier);
  const g=group(),wood=0x68573f,stone=0x7c867d,roof=identity?.hex||0x2d766b,trim=0xd2b77a;
  if(kind==='core'){
    part(g,'cylinder',stone,0,.15,0,1.8,.3,1.8);part(g,'box',0xb8b699,0,1,0,2.3,1.6,2.2);part(g,'cone',roof,0,2.35,0,2.15,1.5,2.15).rotation.y=Math.PI/4;
    part(g,'box',wood,0,.75,1.13,.55,1.3,.08);part(g,'box',trim,-.72,1.1,1.14,.42,.5,.1);
    for(let i=1;i<tier;i++){part(g,'cylinder',stone,1.25,1+i*.35,-.7,.52,2+i*.7,.52);part(g,'cone',trim,1.25,2.4+i*.7,-.7,.7,.8,.7);}
    const crystal=part(g,'sphere',palette.teal,0,3.25,0,.18,.45,.18);crystal.material=material(0xa2efd8);
  }else if(kind==='wall'){
    const b=part(g,'box',tier>=3?stone:wood,0,1.05,0,2.15,2.1,.9);for(let i=-1;i<=1;i++){part(g,'cylinder',tier>=2?stone:0x847659,i*.72,1.35,0,.25,2.7,.28);part(g,'cone',trim,i*.72,2.8,0,.26,.6,.3);}
    part(g,'box',identity?.hex||trim,0,.85,.51,2.2,.12,.12);if(tier>1)part(g,'box',trim,0,1.7,.51,2.2,.12,.12);if(tier>2)part(g,'sphere',identity?.hex||palette.teal,0,1.5,.6,.28,.4,.16);g.scale.y=1+(tier-1)*.12;
  }else if(kind==='tower'){
    part(g,'cylinder',stone,0,.18,0,1.2,.36,1.2);part(g,'cylinder',stone,0,1.75,0,.65,3.4,.8);part(g,'cylinder',trim,0,3.25,0,1,.24,1);
    const c=identity?.hex||0xaee0bf;
    part(g,'cone',roof,0,4.05,0,1.3,1.2,1.3);part(g,'sphere',c,0,4.8,0,.24+tier*.06,.45+tier*.06,.24+tier*.06);
    for(let i=0;i<tier;i++)part(g,'box',trim,0,1+i*.65,.65,.2,.3,.12);g.scale.y=1+(tier-1)*.1;
  }else if(kind==='mine'){
    part(g,'sphere',0x586762,0,.65,0,1.5,1.1,1.25);part(g,'box',wood,0,.6,1.05,1.2,1.4,.25);part(g,'box',0x1b292b,0,.5,1.21,.8,.95,.04);for(let i=0;i<4;i++)part(g,'sphere',trim,(i%2-.5)*.8,.3+Math.floor(i/2)*.4,-.7,.38,.35,.4);g.scale.y=1+tier*.1;
  }else{
    part(g,'box',stone,0,.8,0,1.8,1.6,1.8);part(g,'cone',identity?.hex||0x6c8993,0,2,0,1.6,1.1,1.6);part(g,'cylinder',wood,1,1.8,-.5,.25,3,.3);part(g,'sphere',trim,-.7,.6,1,.7,.7,.15);
  }if(identity)part(g,'sphere',identity.hex,0,kind==='tower'?5.05:2.7,0,.16,.16,.16);
  if(legendary){for(const sign of [-1,1])part(g,'sphere',palette.gold,sign*.75,kind==='tower'?4.35:kind==='wall'?2.25:2.85,.55,.12,.12,.12);const glow=part(g,'sphere',identity?.hex||palette.teal,0,kind==='tower'?5.25:kind==='wall'?2.05:3.45,0,.24,.24,.24);glow.material=mat(identity?.hex||palette.teal,{emissive:identity?.hex||palette.teal,emissiveIntensity:1.6,roughness:.35});}
  if(epic){const crown=part(g,'sphere',0xaa79ff,0,kind==='tower'?5.65:kind==='wall'?2.65:3.85,0,.34,.18,.34);crown.material=mat(0xaa79ff,{emissive:0x7849d8,emissiveIntensity:2.1,roughness:.25});}
  const shadowMeshes=[];g.traverse(o=>{if(o.isMesh)shadowMeshes.push(o);});shadowMeshes.forEach((mesh,index)=>{mesh.castShadow=index<4;mesh.receiveShadow=index<6;});return g;
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
    this.canvas=canvas;this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.maxPixelRatio=Math.min(devicePixelRatio,1.25);this.pixelRatio=this.maxPixelRatio;this.renderer.setPixelRatio(this.pixelRatio);this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.22;
    this.scene=new T.Scene();this.scene.background=new T.Color(0x233e41);this.scene.fog=new T.FogExp2(0x233e41,.012);
    this.camera=new T.PerspectiveCamera(52,innerWidth/innerHeight,.1,400);this.scene.add(new T.HemisphereLight(0xdce8c9,0x253c41,2.6));
    this.sun=new T.DirectionalLight(0xffe3ad,3.4);this.sun.position.set(25,60,-15);this.sun.castShadow=true;this.sun.shadow.mapSize.set(1024,1024);Object.assign(this.sun.shadow.camera,{left:-30,right:30,top:30,bottom:-30,near:1,far:150});this.sun.shadow.bias=-.0005;this.scene.add(this.sun,this.sun.target);
    this.terrain=group(this.scene);this.dynamic=group(this.scene);this.effects=group(this.scene);this.entities=new Map();this.treeMeshes=new Map();this.visibleTreeIds=new Set();this.towerDebugRings=new Map();this.particles=[];this.projectiles=[];this.effectPool=new Map();this.ray=new T.Raycaster();this.pointer=new T.Vector2();this.plane=new T.Plane(new T.Vector3(0,1,0),0);this.yaw=0;this.pitch=.55;this.zoom=13;this.target=new T.Vector3();this.projectVector=new T.Vector3();this.worldVector=new T.Vector3();this.motionQuery=matchMedia('(prefers-reduced-motion: reduce)');this.isMenu=true;this.eventId=0;this.lastTime=0;this.elapsed=0;this.buildMode=false;this.buildCameraBlend=0;this.frameSamples=[];this.resolutionCheckAt=0;this.longTasks=0;this.performance={fps:60,frameP95Ms:0,drawCalls:0,triangles:0,pixelRatio:this.pixelRatio,longTasks:0};
    if(globalThis.PerformanceObserver)try{this.longTaskObserver=new PerformanceObserver(list=>this.longTasks+=list.getEntries().length);this.longTaskObserver.observe({type:'longtask',buffered:true});}catch{}
    this.selection=new T.Mesh(new T.RingGeometry(1.2,1.28,40),new T.MeshBasicMaterial({color:palette.gold,side:T.DoubleSide,transparent:true,opacity:.8}));this.selection.rotation.x=-Math.PI/2;this.selection.position.y=.08;this.selection.visible=false;this.contextTarget=null;this.scene.add(this.selection);
    this.range=new T.Mesh(new T.RingGeometry(16.92,17,80),new T.MeshBasicMaterial({color:palette.teal,side:T.DoubleSide,transparent:true,opacity:.25}));this.range.rotation.x=-Math.PI/2;this.range.visible=false;this.scene.add(this.range);this.buildRange=new T.Mesh(new T.RingGeometry(6.42,6.5,80),new T.MeshBasicMaterial({color:palette.teal,side:T.DoubleSide,transparent:true,opacity:.22}));this.buildRange.rotation.x=-Math.PI/2;this.buildRange.visible=false;this.scene.add(this.buildRange);
    this.resize();addEventListener('resize',()=>this.resize());this.menuScene();
  }
  resize(){this.renderer.setSize(innerWidth,innerHeight);this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();}
  clearGroup(g){g.traverse(o=>{if(o.userData.disposeGeometry)o.geometry?.dispose();if(o.userData.disposeMaterial)o.material?.dispose();});while(g.children.length){const child=g.children[0];disposeModel(child);g.remove(child);}}
  loadMap(map){
    this.map=map;this.clearGroup(this.terrain);this.clearGroup(this.dynamic);this.clearGroup(this.effects);for(const ring of this.towerDebugRings.values())this.scene.remove(ring);this.towerDebugRings.clear();this.entities.clear();this.treeMeshes.clear();this.decorForest=[];this.particles=[];this.projectiles=[];this.effectPool.clear();this.eventId=0;this.rangeKey=null;this.ghost&&this.scene.remove(this.ghost);this.ghost=null;
    this.ground=terrainMesh(map);this.terrain.add(this.ground);
    const rng=randomFor(map.seed+'visual'),dummy=new T.Object3D(),rockCells=[];
    for(let z=0;z<map.size;z++)for(let x=0;x<map.size;x++)if(!walkable(map,x,z))rockCells.push({x:x*map.cell,z:z*map.cell});
    const rocks=new T.InstancedMesh(geo.sphere,material(palette.stone),rockCells.length);
    rockCells.forEach((p,i)=>{const h=1.4+rng()*1.2;dummy.position.set(p.x,heightAt(map,p.x,p.z)+h*.38,p.z);dummy.scale.set(map.cell*.5,h*.65,map.cell*.5);dummy.rotation.set(0,0,0);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);rocks.setColorAt(i,new T.Color().setHSL(.31+rng()*.08,.13,.23+rng()*.1));});rocks.castShadow=true;rocks.receiveShadow=true;this.terrain.add(rocks);
    for(const b of map.bases){
      const gate=new T.Mesh(geo.box,material(0xaaa675));gate.position.set(b.gate.x,heightAt(map,b.gate.x,b.gate.z)+.03,b.gate.z);gate.scale.set(b.gate.axis==='x'?3.4:2.1,.06,b.gate.axis==='x'?2.1:3.4);gate.receiveShadow=true;this.terrain.add(gate);
      for(const sign of [-1,1]){const x=b.gate.x+(b.gate.axis==='x'?0:sign*1.65),z=b.gate.z+(b.gate.axis==='x'?sign*1.65:0),lamp=group(this.terrain,x,heightAt(map,x,z),z);part(lamp,'cylinder',0x838873,0,1.1,0,.17,2.2,.17);part(lamp,'sphere',0xffdaa0,0,2.3,0,.27,.4,.27);}
    }
    const trees=map.decor.filter(d=>d.kind==='tree'),trunks=new T.InstancedMesh(geo.cylinder,material(palette.bark).clone(),trees.length),leaves=new T.InstancedMesh(geo.cone,material(palette.leaf).clone(),trees.length*2);this.decorForest=[trunks,leaves];
    trees.forEach((p,i)=>{const y=heightAt(map,p.x,p.z);dummy.position.set(p.x,y+2*p.scale,p.z);dummy.scale.set(.26*p.scale,4*p.scale,.26*p.scale);dummy.rotation.set(0,p.rotation,0);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);for(let j=0;j<2;j++){dummy.position.y=y+(3.8+j*1.7)*p.scale;dummy.scale.set((1.6-j*.35)*p.scale,3.7*p.scale,(1.6-j*.35)*p.scale);dummy.updateMatrix();leaves.setMatrixAt(i*2+j,dummy.matrix);leaves.setColorAt(i*2+j,new T.Color().setHSL(.37+rng()*.07,.25,.18+rng()*.1));}});trunks.castShadow=true;leaves.castShadow=true;leaves.receiveShadow=true;this.terrain.add(trunks,leaves);
    for(const t of map.trees){const g=group(this.terrain,t.x,heightAt(map,t.x,t.z),t.z);part(g,'cylinder',palette.bark,0,1.5,0,.26,3,.26);part(g,'cone',t.rich?0x6b8870:0x55836a,0,3,0,1.65,3.7,1.65);part(g,'cone',t.rich?0x879365:0x66947c,0,4.2,0,1.13,2.7,1.13);this.treeMeshes.set(t.id,g);}
    // Landmarks remain inside the safe spawn plaza and never suggest a blocked route.
    for(const p of map.pois){const g=group(this.terrain,p.x,heightAt(map,p.x,p.z),p.z);for(let i=0;i<3;i++){const a=i/3*Math.PI*2;part(g,'sphere',0x7d9489,Math.cos(a)*1.2,.35,Math.sin(a)*1.2,.45,.4,.45);}part(g,'sphere',0x8bdfcf,0,.4,0,.5,.25,.5);}
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
  start(map){this.isMenu=false;this.loadMap(map);this.yaw=Math.PI;this.pitch=.58;this.zoom=13;this.followId=null;this.focusPoint=null;this.aiming=false;this.buildMode=false;this.buildCameraBlend=0;}
  update(snapshot){
    this.snapshot=snapshot;const all=[...snapshot.units,...snapshot.structures,...(snapshot.wisps||[])],ids=new Set(all.map(e=>e.id));
    for(const[id,g]of this.entities)if(!ids.has(id)){this.dynamic.remove(g);disposeModel(g);this.entities.delete(id);}
    for(const e of all){let g=this.entities.get(e.id);const signature=e.kind?e.kind+Math.min(B.visualTier,e.tier)+e.branch+!!e.legendary+!!e.epic:e.role+JSON.stringify(e.equipment||{})+(e.ghost?'-ghost':'');
      if(!g||g.userData.signature!==signature){if(g){this.dynamic.remove(g);disposeModel(g);}g=e.kind?building(e.kind,e.tier,e.branch,e.owner?playerColor(e.owner):null,e.legendary,e.epic):e.role==='wisp'?wispModel():character(e.role,e.equipment,playerColor(e.id));g.userData.signature=signature;g.position.set(e.x,heightAt(this.map,e.x,e.z),e.z);if(e.kind){const scars=group(g);for(const sign of [-1,1]){part(scars,'sphere',0x333b35,sign*.65,.14,.85,.55,.23,.48);part(scars,'box',0x313e38,sign*.4,1,.55,.09,1.3,.12).rotation.z=sign*.35;}scars.visible=false;g.userData.scars=scars;}this.dynamic.add(g);this.entities.set(e.id,g);}
      g.userData.entity=e;(g.userData.target??=new T.Vector3()).set(e.x,heightAt(this.map,e.x,e.z),e.z);if(e.kind==='wall'){const b=this.map.bases.find(b=>b.id===e.baseId);g.rotation.y=b.gate.axis==='x'?Math.PI/2:0;}else if(e.kind)g.rotation.y=e.rotation||0;
      if(e.ghost&&!g.userData.ghostStyled){g.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.52;o.material.depthWrite=false;}});g.userData.ghostStyled=true;}
      g.visible=e.alive!==false||e.ghost;if(e.kind){g.scale.y=(e.kind==='wall'?1+(Math.min(B.visualTier,e.tier)-1)*.12:1)*(.15+.85*e.progress);g.userData.scars.visible=e.progress>=1&&e.hp/e.maxHp<.55;g.rotation.z=e.progress>=1&&e.hp/e.maxHp<.25?.055:0;}
    }
    const occupied=new Set((snapshot.wisps||[]).map(w=>w.treeId));this.visibleTreeIds=new Set(snapshot.trees.map(t=>t.id));
    for(const t of snapshot.trees){const g=this.treeMeshes.get(t.id);if(!g)continue;g.visible=t.amount>0;g.userData.entity={...t,kind:'tree'};
      for(const leaf of g.children.slice(1)){if(!leaf.userData.ownMaterial){leaf.material=leaf.material.clone();leaf.material.transparent=true;leaf.material.depthWrite=false;leaf.userData.ownMaterial=true;}leaf.material.opacity=occupied.has(t.id)?.38:1;}
    }
    for(const e of snapshot.events){if(e.id>this.eventId){this.effect(e);this.eventId=Math.max(this.eventId,e.id);}}
    if(this.seal)this.seal.visible=snapshot.state==='PREPARATION';
  }
  effect(e){
    if(e.type==='swing'){const g=this.entities.get(e.unit);if(g&&(!g.userData.swing||this.elapsed-g.userData.swing.at>.25))g.userData.swing={at:this.elapsed,windup:e.windup,heavy:e.heavy};}
    if(e.type==='dash'){const g=this.entities.get(e.unit);if(g)g.userData.swing=null;}
    if(e.type==='impact'){
      const target=this.entities.get(e.entity);if(target)target.userData.hitUntil=this.elapsed+.14;
      if(e.unit===this.viewerId&&!this.reducedMotion()){this.shakeUntil=this.elapsed+.12;this.shakeStrength=e.broken?.12:e.heavy?.06:.025;}
    }
    if(e.type==='shot'){const mesh=this.acquireEffect('sphere',e.branch==='frost'?0x87d7ee:0xf2d09a);mesh.scale.setScalar(.13);mesh.position.set(e.x,heightAt(this.map,e.x,e.z)+4.5,e.z);this.projectiles.push({mesh,start:mesh.position.clone(),end:new T.Vector3(e.tx,heightAt(this.map,e.tx,e.tz)+2,e.tz),age:0});}
    if(e.type==='beam'){const mesh=this.acquireEffect('sphere',0xe8fff0);mesh.scale.setScalar(.18*Math.min(2,e.ramp||1));mesh.position.set(e.x,heightAt(this.map,e.x,e.z)+4.8,e.z);this.projectiles.push({mesh,start:mesh.position.clone(),end:new T.Vector3(e.tx,heightAt(this.map,e.tx,e.tz)+2,e.tz),age:.12});}
    if(['damage','destroy','wisp-death','gather','repair','complete','roar','build','impact'].includes(e.type)){
      const color=e.type==='damage'?0xe8b37b:e.type==='repair'?0x91e4c9:e.type==='gather'?0xb3c892:0xe8d697;
      const rubble=e.type==='destroy'&&e.kind==='wall';
      for(let i=0;i<(this.reducedMotion()?0:rubble?24:e.type==='destroy'?15:5);i++){const m=this.acquireEffect(rubble?'box':'sphere',rubble?0x9a8667:color);m.scale.setScalar((rubble?.16:.05)+Math.random()*(rubble?.25:.08));m.position.set(e.x,heightAt(this.map,e.x,e.z)+1.4,e.z);this.particles.push({mesh:m,velocity:new T.Vector3((Math.random()-.5)*(rubble?8:4),2+Math.random()*3,(Math.random()-.5)*(rubble?8:4)),age:0});}
    }
  }
  acquireEffect(shape,color){const key=`${shape}:${color}`,pool=this.effectPool.get(key)||[],mesh=pool.pop()||new T.Mesh(geo[shape],material(color));this.effectPool.set(key,pool);mesh.userData.poolKey=key;mesh.visible=true;mesh.rotation.set(0,0,0);this.effects.add(mesh);return mesh;}
  releaseEffect(mesh){this.effects.remove(mesh);mesh.visible=false;const pool=this.effectPool.get(mesh.userData.poolKey)||[];if(pool.length<128)pool.push(mesh);this.effectPool.set(mesh.userData.poolKey,pool);}
  previewSwing(id,heavy){
    const g=this.entities.get(id);if(!g)return;const u=g.userData.entity;
    if(this.elapsed<(g.userData.previewNext||0)||(heavy&&u.cooldowns?.heavy>this.snapshot.time))return;
    if(u.cooldowns?.attack>this.snapshot.time+B.combat.buffer)return;
    g.userData.previewNext=this.elapsed+(u.combat?.interval||1)*(heavy?B.troll.heavyRecovery:1);
    g.userData.swing={at:this.elapsed,windup:heavy?B.combat.heavyWindup:B.combat.lightWindup,heavy};
  }
  groundPoint(clientX,clientY){this.pointer.set(clientX/innerWidth*2-1,-clientY/innerHeight*2+1);this.ray.setFromCamera(this.pointer,this.camera);return this.ground?this.ray.intersectObject(this.ground,false)[0]?.point||null:null;}
  constructionPoint(origin){const p=boundedConstructionPoint(origin,this.groundPoint(innerWidth/2,innerHeight/2),this.yaw);return{x:p.x,y:heightAt(this.map,p.x,p.z),z:p.z};}
  pick(clientX,clientY,ignoreId){this.pointer.set(clientX/innerWidth*2-1,-clientY/innerHeight*2+1);this.ray.setFromCamera(this.pointer,this.camera);const visibleTrees=[...this.treeMeshes.values()].filter(g=>g.visible&&this.visibleTreeIds.has(g.userData.entity?.id));const hits=this.ray.intersectObjects([...this.entities.values()].filter(g=>g.visible&&g.userData.entity.id!==ignoreId).concat(visibleTrees),true);for(const hit of hits){let o=hit.object;while(o){if(o.userData.entity)return o.userData.entity;o=o.parent;}}return null;}
  entityPoint(e){const g=this.entities.get(e.id);if(e.role==='wisp'&&g?.userData.spirit){const v=g.userData.spirit.getWorldPosition(this.worldVector);return this.project(v.x,v.y+.55,v.z);}return this.project(e.x,heightAt(this.map,e.x,e.z)+(e.kind==='tower'?6:e.kind?3.6:e.role==='troll'?4.4:2.6),e.z);}
  ghostAt(kind,p,valid,rotation=0){
    if(!p){if(this.ghost)this.ghost.visible=false;return;}
    if(!this.ghost||this.ghost.userData.kind!==kind){if(this.ghost){this.ghost.traverse(o=>{if(o.isMesh)o.material.dispose();});this.scene.remove(this.ghost);}this.ghost=building(kind);this.ghost.userData.kind=kind;this.ghost.traverse(o=>{if(o.isMesh){o.material=new T.MeshBasicMaterial({color:0x87e4c1,transparent:true,opacity:.35,depthWrite:false});o.castShadow=false;}});this.scene.add(this.ghost);}
    this.ghost.visible=true;this.ghost.position.set(p.x,heightAt(this.map,p.x,p.z)+.04,p.z);this.ghost.rotation.y=rotation;this.ghost.traverse(o=>{if(o.isMesh)o.material.color.setHex(valid?0x87e4c1:0xe7826e);});
    this.selection.position.set(p.x,heightAt(this.map,p.x,p.z)+.07,p.z);this.selection.visible=true;
  }
  setConstructionRange(u,visible){this.buildRange.visible=!!visible&&!!u;if(this.buildRange.visible){groundRing(this.buildRange,this.map,u.x,u.z,B.construction.range);this.buildRange.material.color.setHex(0x80d3bd);}}
  setBuildMode(active){this.buildMode=!!active;}
  setContextTarget(id){this.contextTarget=id||null;}
  setCombatDebug(enabled,snapshot){
    const towers=enabled?(snapshot?.structures||[]).filter(s=>s.kind==='tower'):[];const keep=new Set(towers.map(s=>s.id));
    for(const[id,ring]of this.towerDebugRings)if(!keep.has(id)){this.scene.remove(ring);this.towerDebugRings.delete(id);}
    for(const tower of towers){let ring=this.towerDebugRings.get(tower.id);if(!ring){ring=new T.Mesh(new T.RingGeometry(16.92,17,64),new T.MeshBasicMaterial({color:0x75e0b0,side:T.DoubleSide,transparent:true,opacity:.2,depthWrite:false}));ring.rotation.x=-Math.PI/2;this.towerDebugRings.set(tower.id,ring);this.scene.add(ring);}const radius=B.structures.tower.range+towerProfile(tower).range;groundRing(ring,this.map,tower.x,tower.z,radius);const status=snapshot.debugTowers?.find(s=>s.id===tower.id);ring.material.color.setHex(status?.valid?0x79e2a8:0xe98775);ring.material.opacity=status?.valid?.34:.2;}
  }
  reducedMotion(){return this.motionQuery.matches||document.body.classList.contains('reduce-motion');}
  updateAdaptiveResolution(dt){
    this.frameSamples.push(dt*1000);if(this.frameSamples.length>180)this.frameSamples.shift();
    if(this.elapsed<this.resolutionCheckAt||this.frameSamples.length<60)return;this.resolutionCheckAt=this.elapsed+2;
    const sorted=[...this.frameSamples].sort((a,b)=>a-b),p95=sorted[Math.floor((sorted.length-1)*.95)]||16.7,average=this.frameSamples.reduce((n,v)=>n+v,0)/this.frameSamples.length;
    let next=this.pixelRatio;if(p95>25)next=Math.max(.75,next-.1);else if(p95<18)next=Math.min(this.maxPixelRatio,next+.05);
    if(Math.abs(next-this.pixelRatio)>.001){this.pixelRatio=next;this.renderer.setPixelRatio(next);this.resize();}
    this.performance={fps:Math.round(1000/Math.max(1,average)),frameP95Ms:+p95.toFixed(2),drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,pixelRatio:+this.pixelRatio.toFixed(2),longTasks:this.longTasks};
  }
  render(time,viewerId,selected){
    this.viewerId=viewerId;
    const dt=Math.min(.05,(time-this.lastTime)/1000||.016),reduced=this.reducedMotion();this.lastTime=time;this.elapsed+=dt;this.updateAdaptiveResolution(dt);
    if(this.isMenu){const f=this.menuFocus,t=reduced?0:this.elapsed*.04;this.camera.position.set(f.x-23+Math.sin(t)*2,f.y+24,f.z-29+Math.cos(t)*2);this.camera.lookAt(f);this.menuTroll.userData.body.position.y=reduced?0:Math.sin(this.elapsed*1.6)*.06;}
    else if(this.snapshot){
      for(const g of this.entities.values()){
        const e=g.userData.entity;g.position.lerp(g.userData.target,1-Math.exp(-dt*16));g.position.y=heightAt(this.map,g.position.x,g.position.z);
        if(e.role==='wisp'){
          const phase=(reduced?0:this.elapsed*.95)+e.x*.3,active=e.income>0,forming=e.readyAt>this.snapshot.time;
          const orbit=(target,a)=>target.set(Math.cos(a)*1.7,2.05+(reduced?0:Math.sin(a*2)*.22),Math.sin(a)*1.7);
          orbit(g.userData.spirit.position,phase);g.userData.orb.rotation.y=this.elapsed;
          g.userData.spirit.scale.setScalar(forming?.65:1);g.userData.glow.material.opacity=active?.8:.35;g.userData.ring.material.opacity=e.id===selected?.85:.25;
          g.userData.tail.forEach((p,i)=>{orbit(p.position,phase-(i+1)*.14);p.visible=active&&!reduced;});continue;
        }
        if(e.kind){if(g.userData.hitUntil>this.elapsed)g.rotation.z=Math.sin(this.elapsed*85)*.035;continue;}
        let delta=(e.yaw-g.rotation.y+Math.PI*3)%(Math.PI*2)-Math.PI;g.rotation.y+=delta*Math.min(1,dt*16);
        const moving=e.action==='walk'||g.position.distanceTo(g.userData.target)>.06,sprinting=moving&&e.sprinting===true,work=['gather','repair','build'].includes(e.action),healing=e.action==='heal',s=g.userData.swing,age=s?this.elapsed-s.at:99;
        const strike=s&&age<s.windup+.22,arc=strike?(age<s.windup?-1.9*age/s.windup:-1.9+2.4*(age-s.windup)/.22):0;
        const pace=sprinting?14:9;g.userData.legs.forEach((l,i)=>l.rotation.x=moving?Math.sin(this.elapsed*pace+i*Math.PI)*(sprinting?.72:.5):0);
        g.userData.arms.forEach((a,i)=>a.rotation.x=strike?(i===1?arc:.25):healing?-1.25+Math.sin(this.elapsed*8+i)*.12:work?(i===1?-1.4+Math.sin(this.elapsed*16)*.9:.2):moving?Math.sin(this.elapsed*pace+i*Math.PI+Math.PI)*(sprinting?.58:.4):0);
        g.userData.body.rotation.z=strike?-arc*.08:0;g.userData.body.rotation.x=sprinting?-.18:0;g.userData.body.position.y=Math.sin(this.elapsed*(moving?(sprinting?24:18):2))*(moving?(sprinting?.09:.06):.025);
        if(sprinting&&!reduced&&this.elapsed>(g.userData.nextRunDust||0)){g.userData.nextRunDust=this.elapsed+.14;const dust=this.acquireEffect('sphere',0xb4aa83);dust.scale.set(.12,.05,.12);dust.position.copy(g.position);dust.position.y+=.08;this.particles.push({mesh:dust,velocity:new T.Vector3((Math.random()-.5)*.5,.15,(Math.random()-.5)*.5),age:.58});}
      }
      let me=this.entities.get(viewerId);if(!me||(!me.userData.entity.alive&&!me.userData.entity.ghost))me=this.entities.get(this.followId)||[...this.entities.values()].find(g=>!g.userData.entity.kind&&g.userData.entity.alive);
      if(this.focusPoint)this.target.lerp(new T.Vector3(this.focusPoint.x,heightAt(this.map,this.focusPoint.x,this.focusPoint.z)+1.25,this.focusPoint.z),Math.min(1,dt*9));
      else if(me)this.target.lerp(me.position.clone().add(new T.Vector3(0,me.userData.entity.role==='troll'?2:1.25,0)),Math.min(1,dt*9));
      const pitch=this.focusPoint?1.1:this.pitch,zoom=this.focusPoint?30:this.zoom,followOffset=followCameraOffset(this.yaw,zoom);
      const horizontal=Math.cos(pitch)*zoom;let position=this.target.clone().add(this.focusPoint?new T.Vector3(Math.sin(this.yaw)*horizontal,Math.sin(pitch)*zoom,-Math.cos(this.yaw)*horizontal):new T.Vector3(followOffset.x,followOffset.y,followOffset.z));
      if(this.aiming&&!this.focusPoint)position.add(new T.Vector3(-Math.cos(this.yaw)*1.7,0,-Math.sin(this.yaw)*1.7));
      const buildCameraTarget=this.buildMode&&!this.focusPoint?1:0;
      this.buildCameraBlend+=(buildCameraTarget-this.buildCameraBlend)*(1-Math.exp(-dt*12));
      for(const [i,forest] of (this.decorForest||[]).entries()){
        const fading=this.buildCameraBlend>.005,material=forest.material;
        material.opacity=T.MathUtils.lerp(1,i?.3:.18,this.buildCameraBlend);material.depthWrite=!fading;
        if(material.transparent!==fading){material.transparent=fading;material.needsUpdate=true;}
      }
      const cameraHeight=T.MathUtils.lerp(FOLLOW_CAMERA_HEIGHT,BUILD_CAMERA_HEIGHT,this.buildCameraBlend);
      if(this.buildCameraBlend>.001){
        const buildPosition=this.target.clone().add(new T.Vector3(Math.sin(this.yaw)*BUILD_CAMERA_BACK,BUILD_CAMERA_HEIGHT,-Math.cos(this.yaw)*BUILD_CAMERA_BACK));
        position.lerp(buildPosition,this.buildCameraBlend);
      }
      // Sample the same solid cells as movement; avoid raycasting thousands of forest instances.
      const direction=position.clone().sub(this.target).normalize(),distanceToCamera=position.distanceTo(this.target);
      if(!this.focusPoint)for(let d=1.5;d<distanceToCamera;d+=.4){const p=this.target.clone().addScaledVector(direction,d),c=toCell(this.map,p),floor=heightAt(this.map,p.x,p.z)+(walkable(this.map,c.x,c.z)?.5:4.2);if(p.y<floor){position=this.target.clone().addScaledVector(direction,Math.max(2,d-.5));break;}}
      if(this.focusPoint)position.y=Math.max(position.y,heightAt(this.map,position.x,position.z)+.8);else position.y=this.target.y+cameraHeight;
      this.camera.position.lerp(position,Math.min(1,dt*12));
      if(this.focusPoint)this.camera.position.y=Math.max(this.camera.position.y,heightAt(this.map,this.camera.position.x,this.camera.position.z)+.6);else this.camera.position.y=this.target.y+cameraHeight;
      const aim=this.target.clone();if(this.aiming&&!this.focusPoint)aim.add(new T.Vector3(-Math.sin(this.yaw)*5,0,Math.cos(this.yaw)*5));
      if(this.buildCameraBlend>.001&&me){
        const origin=me.userData.entity,point=boundedConstructionPoint(origin,null,this.yaw);
        const buildAim=new T.Vector3(point.x,heightAt(this.map,point.x,point.z)+.05,point.z);
        aim.lerp(buildAim,this.buildCameraBlend);
      }
      this.camera.lookAt(aim);
      if(!reduced&&this.shakeUntil>this.elapsed&&!this.focusPoint)this.camera.position.x+=Math.sin(this.elapsed*110)*this.shakeStrength;
      const highlighted=this.contextTarget||selected,s=this.entities.get(highlighted)||this.treeMeshes.get(highlighted);if(!this.ghost?.visible){this.selection.visible=!!s;if(s)this.selection.position.set(s.position.x,s.position.y+.08,s.position.z);}const selectedMesh=this.entities.get(selected)||this.treeMeshes.get(selected);this.range.visible=!!selectedMesh&&selectedMesh.userData.entity?.kind==='tower';if(this.range.visible){const radius=B.structures.tower.range+towerProfile(selectedMesh.userData.entity).range,key=selectedMesh.userData.entity.id+':'+radius;if(this.rangeKey!==key){groundRing(this.range,this.map,selectedMesh.position.x,selectedMesh.position.z,radius);this.rangeKey=key;}}
    }
    this.sun.position.set(this.target.x+25,55,this.target.z-20);this.sun.target.position.copy(this.target);
    for(const p of this.particles){p.age+=dt;p.velocity.y-=dt*8;p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.scale.multiplyScalar(.98);}this.particles=this.particles.filter(p=>{if(p.age>1){this.releaseEffect(p.mesh);return false;}return true;});
    for(const p of this.projectiles){p.age+=dt;p.mesh.position.lerpVectors(p.start,p.end,Math.min(1,p.age/.27));}this.projectiles=this.projectiles.filter(p=>{if(p.age>.27){this.releaseEffect(p.mesh);return false;}return true;});
    this.renderer.render(this.scene,this.camera);
  }
  project(x,y,z){const v=this.projectVector.set(x,y,z).project(this.camera);return {x:(v.x*.5+.5)*innerWidth,y:(-.5*v.y+.5)*innerHeight,visible:v.z<1&&v.z>0};}
}
