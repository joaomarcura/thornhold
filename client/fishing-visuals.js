import * as T from 'three';
import { FISH_SPECIES, FISH_RARITIES } from '../shared/fishing.js';

const clamp=v=>Math.max(0,Math.min(1,v));
// Both presentations sample the same server phase/timestamps. No local capture
// timer, combat rule or input prediction decides whether a fish is caught.
export function fishingPose(f,time,reduced=false){
  if(!f)return {x:0,y:0,z:0,bend:0};
  if(f.phase==='cast'){const p=clamp((time-f.startedAt)/Math.max(.01,f.castUntil-f.startedAt)),arc=Math.sin(p*Math.PI);return {x:-.7*arc,y:.08*arc,z:.08*arc,bend:.05*arc};}
  const fight=f.phase==='reel',pulse=reduced?0:Math.sin((time-(f.hookedAt||f.startedAt))*8);
  return {x:fight?-.24+pulse*.045:-.08,y:0,z:fight?pulse*.025:0,bend:fight?.2+pulse*.06:f.phase==='bite'?.12:.02};
}

const geometry={detail:new T.SphereGeometry(1,6,4),body:new T.SphereGeometry(1,16,10),tail:new T.ConeGeometry(1,1,4),fin:new T.ConeGeometry(1,1,3)};
for(const g of Object.values(geometry))g.userData.shared=true;
const materials=new Map();
function material(color,overlay=false){const key=`${color}:${overlay}`;if(!materials.has(key)){const m=new T.MeshBasicMaterial({color,fog:!overlay,depthTest:!overlay,depthWrite:!overlay});m.userData.shared=true;materials.set(key,m);}return materials.get(key);}
export function createFishModel(fish={species:'bass',rarity:'common'},overlay=false){
  const species=FISH_SPECIES.find(s=>s.id===fish.species)||FISH_SPECIES[2],rarity=FISH_RARITIES.find(r=>r.id===fish.rarity)||FISH_RARITIES[0],root=new T.Group(),color=fish.shiny?0xece2a3:species.color;
  const body=new T.Mesh(geometry.body,material(color,overlay));body.scale.set(.5,species.shape[1]/2,species.shape[2]/2);root.add(body);
  const belly=new T.Mesh(geometry.body,material(fish.shiny?0xffedb9:0xd8dfd1,overlay));belly.position.y=-species.shape[1]*.15;belly.scale.set(.43,species.shape[1]*.29,species.shape[2]*.46);root.add(belly);
  const tail=new T.Mesh(geometry.tail,material(color,overlay));tail.position.x=-.57;tail.rotation.z=-Math.PI/2;tail.scale.set(species.shape[1]*.85,.25,.04);root.add(tail);
  const fin=new T.Mesh(geometry.fin,material(rarity.color,overlay));fin.position.set(-.08,species.shape[1]*.43,0);fin.rotation.z=-.2;fin.scale.set(.2,.12,.035);root.add(fin);
  for(const side of [-1,1]){
    const eye=new T.Mesh(geometry.detail,material(0xe1cf8a,overlay));eye.position.set(.35,.035,side*species.shape[2]*.37);eye.scale.set(.035,.035,.018);root.add(eye);
    const pupil=new T.Mesh(geometry.detail,material(0x162728,overlay));pupil.position.copy(eye.position);pupil.position.z+=side*.015;pupil.scale.set(.018,.018,.01);root.add(pupil);
    const pectoral=new T.Mesh(geometry.fin,material(color,overlay));pectoral.position.set(.09,-.03,side*species.shape[2]*.43);pectoral.rotation.set(side*.7,0,-.6);pectoral.scale.set(.08,.15,.018);root.add(pectoral);
    const gill=new T.Mesh(geometry.detail,material(0x647978,overlay));gill.position.set(.25,0,side*species.shape[2]*.43);gill.scale.set(.012,species.shape[1]*.26,.01);root.add(gill);
  }
  const mouth=new T.Mesh(geometry.detail,material(0x647978,overlay));mouth.position.x=.475;mouth.scale.set(.018,.015,species.shape[2]*.17);root.add(mouth);
  // Merge the detailed static silhouette once into one draw call. Cached per
  // species/rarity/variant; no geometry or material is created inside update.
  const cacheKey=`${species.id}:${rarity.id}:${!!fish.shiny}`;
  let combined=fishGeometry.get(cacheKey);if(!combined){const positions=[],normals=[],colors=[];
    for(const mesh of root.children){mesh.updateMatrix();const source=mesh.geometry.toNonIndexed();source.applyMatrix4(mesh.matrix);
      positions.push(...source.attributes.position.array);normals.push(...source.attributes.normal.array);
      for(let i=0;i<source.attributes.position.count;i++)colors.push(mesh.material.color.r,mesh.material.color.g,mesh.material.color.b);source.dispose();
    }
    combined=new T.BufferGeometry();combined.setAttribute('position',new T.Float32BufferAttribute(positions,3));combined.setAttribute('normal',new T.Float32BufferAttribute(normals,3));combined.setAttribute('color',new T.Float32BufferAttribute(colors,3));combined.computeBoundingSphere();combined.userData.shared=true;fishGeometry.set(cacheKey,combined);
  }
  root.clear();const fishMesh=new T.Mesh(combined,fishMaterial(overlay));root.add(fishMesh);
  root.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;if(overlay)o.renderOrder=55;}});return root;
}
const fishGeometry=new Map(),fishMaterials=new Map();
function fishMaterial(overlay){if(!fishMaterials.has(overlay)){const m=overlay?new T.MeshBasicMaterial({vertexColors:true,fog:false,depthTest:false,depthWrite:false}):new T.MeshStandardMaterial({vertexColors:true,roughness:.55,metalness:.12});m.userData.shared=true;fishMaterials.set(overlay,m);}return fishMaterials.get(overlay);}
export function fishingReelPoint(water,landing,p,groundAt,result={}){
  p=clamp(p);result.x=water.x+(landing.x-water.x)*p;result.z=water.z+(landing.z-water.z)*p;
  const lift=clamp((p-.8)/.2),smooth=lift*lift*(3-2*lift);
  result.y=Math.max(water.y+.12+(landing.y-water.y-.12)*smooth,groundAt(result.x,result.z)+.38);
  return result;
}
// Small visual body only: damped tension/drag + gravity/contact. The server
// remains the sole authority for hook/catch timing, inventory and rewards.
export function stepFishingBody(body,target,dt,groundAt){
  dt=Math.max(0,Math.min(1/15,dt));const response=1-Math.exp(-dt*18);
  body.x+=(target.x-body.x)*response;body.z+=(target.z-body.z)*response;
  body.vy=(body.vy||0)*Math.exp(-dt*10)+(target.y-body.y)*90*dt-2*dt;
  body.y+=body.vy*dt;const floor=groundAt(body.x,body.z)+.38;
  if(body.y<floor){body.y=floor;body.vy=Math.max(0,body.vy);}
  // Tension limits vertical overshoot rather than launching the fish skyward.
  body.y=Math.min(body.y,Math.max(floor,target.y+.12));return body;
}
const release=root=>root.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry&&!o.geometry.userData.shared)o.geometry.dispose();if(o.material&&!o.material.userData.shared)o.material.dispose();});

export class FishingVisuals{
  constructor(parent,camera){this.parent=parent;this.camera=camera;this.rigs=new Map();this.origin=new T.Vector3();this.end=new T.Vector3();this.offset=new T.Vector3();this.splashDummy=new T.Object3D();this.capture=null;}
  reset(){for(const rig of this.rigs.values()){this.parent.remove(rig.root);release(rig.root);}this.rigs.clear();if(this.capture){this.camera.remove(this.capture.root);release(this.capture.root);this.capture=null;}}
  showCatch(fish,time){if(this.capture){this.camera.remove(this.capture.root);release(this.capture.root);}const root=createFishModel(fish,true);root.scale.setScalar(.65);root.position.set(0,.07,-1.35);this.camera.add(root);this.capture={root,time};}
  rig(id){let rig=this.rigs.get(id);if(rig)return rig;
    const root=new T.Group(),bobber=new T.Mesh(new T.SphereGeometry(.075,6,4),material(0xeaba77)),ring=new T.Mesh(new T.RingGeometry(.11,.14,12),material(0xc6dcce));ring.rotation.x=-Math.PI/2;
    const lineGeometry=new T.BufferGeometry();lineGeometry.setAttribute('position',new T.BufferAttribute(new Float32Array(9),3).setUsage(T.DynamicDrawUsage));
    const line=new T.Line(lineGeometry,new T.LineBasicMaterial({color:0xdce3c7,fog:true}));line.frustumCulled=false;
    const fish=createFishModel();fish.scale.setScalar(.5);const droplets=new T.InstancedMesh(geometry.detail,material(0xb4d2ca),6);droplets.frustumCulled=false;droplets.instanceMatrix.setUsage(T.DynamicDrawUsage);droplets.visible=false;root.add(bobber,ring,line,fish,droplets);this.parent.add(root);rig={root,bobber,ring,line,fish,droplets,body:new T.Vector3(),lastTime:null,splashAt:null};this.rigs.set(id,rig);return rig;
  }
  update(time,entities,{viewerId,firstPerson=false,viewmodel,reduced=false,inView=()=>true,groundAt=()=>-Infinity}={}){
    for(const [id,rig]of this.rigs)if(!entities.get(id)?.userData.entity?.fishing){this.parent.remove(rig.root);release(rig.root);this.rigs.delete(id);}
    for(const [id,entity]of entities){const f=entity.userData.entity?.fishing;if(!f)continue;
      const visible=id===viewerId||inView(entity.position);if(!visible){const old=this.rigs.get(id);if(old)old.root.visible=false;continue;}
      const rig=this.rig(id);rig.root.visible=true;
      const rod=id===viewerId&&firstPerson?viewmodel?.rig.userData.rod:entity.userData.heldItems?.rod;
      this.origin.copy(rod?.userData.tip||this.offset.set(0,1.5,0));if(rod){rod.updateWorldMatrix(true,false);rod.localToWorld(this.origin);}else this.origin.copy(entity.position).y+=1.5;
      this.origin.y=Math.max(this.origin.y,groundAt(this.origin.x,this.origin.z)+.12);
      this.end.set(f.water.x,f.water.y+.06,f.water.z);
      if(f.phase==='cast'){const p=clamp((time-f.startedAt)/Math.max(.01,f.castUntil-f.startedAt));this.end.lerpVectors(this.origin,this.end,p);this.end.y=Math.max(this.end.y+Math.sin(p*Math.PI)*2,groundAt(this.end.x,this.end.z)+.15);}
      if(f.phase==='reel'){const p=clamp((time-f.hookedAt)/Math.max(.01,f.reelUntil-f.hookedAt));this.offset.copy(entity.position).y+=1.3;fishingReelPoint(f.water,this.offset,p,groundAt,this.end);if(!reduced){this.end.x+=Math.sin(time*7)*.12*(1-p);this.end.z+=Math.cos(time*5)*.1*(1-p);}if(rig.hookedAt!==f.hookedAt||rig.lastTime===null||time-rig.lastTime>.4){rig.body.copy(this.end);rig.body.vy=0;rig.hookedAt=f.hookedAt;rig.splashAt=null;}else stepFishingBody(rig.body,this.end,time-rig.lastTime,groundAt);this.end.copy(rig.body);this.end.y=Math.max(this.end.y,f.water.y+.08,groundAt(this.end.x,this.end.z)+.38);if(rig.splashAt===null&&p>.03)rig.splashAt=time;}
      else if(f.phase==='bite')this.end.y-=.11+(reduced?0:Math.sin(time*15)*.045);
      else if(f.phase==='wait'&&!reduced)this.end.y+=Math.sin(time*2.8)*.035;
      rig.lastTime=time;rig.bobber.position.copy(this.end);rig.bobber.visible=f.phase!=='reel';const splashAge=time-(rig.splashAt??-100),splash=splashAge<.65&&f.phase==='reel';rig.ring.position.set(splash?f.water.x:this.end.x,f.water.y+.02,splash?f.water.z:this.end.z);rig.ring.visible=splash||f.phase==='wait'||f.phase==='bite';rig.ring.scale.setScalar(splash?1+splashAge*8:f.phase==='bite'?1.6:1);
      rig.droplets.visible=splash&&!reduced;if(rig.droplets.visible){for(let i=0;i<6;i++){const a=i*Math.PI/3,r=splashAge*(.6+i%2*.4);this.splashDummy.position.set(f.water.x+Math.cos(a)*r,f.water.y+.08+Math.max(0,splashAge*(1.7+i%2*.4)-3.5*splashAge*splashAge),f.water.z+Math.sin(a)*r);this.splashDummy.scale.set(.04,.06,.04);this.splashDummy.updateMatrix();rig.droplets.setMatrixAt(i,this.splashDummy.matrix);}rig.droplets.instanceMatrix.needsUpdate=true;}
      rig.fish.visible=f.phase==='reel';rig.fish.position.copy(this.end);rig.fish.rotation.set(0,Math.atan2(entity.position.x-f.water.x,entity.position.z-f.water.z)-Math.PI/2,reduced?0:Math.sin(time*9)*.1);
      const mx=(this.origin.x+this.end.x)/2,mz=(this.origin.z+this.end.z)/2,my=Math.max((this.origin.y+this.end.y)/2-(f.phase==='reel'?.01:.15),groundAt(mx,mz)+.1);const points=rig.line.geometry.attributes.position;points.setXYZ(0,this.origin.x,this.origin.y,this.origin.z);points.setXYZ(1,mx,my,mz);points.setXYZ(2,this.end.x,this.end.y,this.end.z);points.needsUpdate=true;
    }
    if(this.capture){const age=time-this.capture.time,viewer=entities.get(viewerId)?.userData.entity;if(age>=3.5||viewer&&(!viewer.alive||viewer.ghost||['walk','repair','attack','stun'].includes(viewer.action)||viewer.fishing)){this.camera.remove(this.capture.root);release(this.capture.root);this.capture=null;}else{const p=clamp(age/.25);this.capture.root.scale.setScalar(.65*(.85+.15*p));this.capture.root.rotation.y=reduced?0:age*.9;this.capture.root.rotation.z=reduced?0:Math.sin(age*3)*.035;}}
  }
}
