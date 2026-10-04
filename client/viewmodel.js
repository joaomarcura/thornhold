import * as T from 'three';
import { cosmetic } from '../shared/cosmetics.js';
import { createHeldItem, heldItemKey, bendRod } from './held-item.js';
import { fishingPose } from './fishing-visuals.js';

const skinMaterial=color=>new T.MeshStandardMaterial({color,roughness:.78,depthTest:false,depthWrite:false});
const mix=(a,b,t)=>a+(b-a)*t;

export class FirstPersonViewmodel{
  constructor(camera){
    this.root=new T.Group();this.root.position.set(.28,-.38,-.7);this.root.visible=false;camera.add(this.root);
    this.rig=new T.Group();this.root.add(this.rig);this.signature='';this.recoil=0;this.cameraKick={pitch:0,yaw:0,roll:0};
    this.light=new T.PointLight(0xffe0a0,.7,4);this.light.position.set(.2,.2,.2);this.root.add(this.light);
    this.trail=new T.Mesh(new T.RingGeometry(.3,.92,24,1,-1.15,1.65),new T.MeshBasicMaterial({color:0xffd36a,transparent:true,opacity:0,side:T.DoubleSide,depthTest:false,depthWrite:false,blending:T.AdditiveBlending}));
    this.trail.position.set(-.38,.2,-.58);this.trail.rotation.set(0,0,-.35);this.trail.renderOrder=60;this.trail.visible=false;this.root.add(this.trail);
  }
  rebuild(entity,tool=''){
    const key=heldItemKey(entity?.role,entity?.equipment,tool),level=entity?.itemLevels?.[key]||1,signature=`${entity?.role||''}:${entity?.skinId||''}:${key}:${level}`;if(signature===this.signature)return;this.signature=signature;
    while(this.rig.children.length){const child=this.rig.children[0];child.traverse?.(o=>{if(o.geometry&&!o.geometry.userData?.shared)o.geometry.dispose();if(o.material&&!o.material.userData?.shared)o.material.dispose();});this.rig.remove(child);}
    const troll=entity?.role==='troll',skin=cosmetic(entity?.role,entity?.skinId).body,arm=new T.Mesh(new T.CylinderGeometry(troll?.11:.075,troll?.15:.1,troll?.85:.66,7),skinMaterial(skin));
    arm.position.set(.08,-.1,.05);arm.rotation.set(.2,0,-.28);arm.renderOrder=50;this.rig.add(arm);
    const grip=new T.Group();grip.position.set(-.02,.02,-.24);grip.rotation.set(0,0,-.55);grip.scale.setScalar(troll?1.08:1.02);this.rig.add(grip);
    const item=createHeldItem(entity?.role,entity?.equipment,tool,level);item.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.userData.shared=false;o.material.depthTest=false;o.material.depthWrite=false;o.renderOrder=51;}});grip.add(item);
    this.rig.userData.rod=key==='elfRod'?item:null;if(key==='elfRod'){grip.rotation.set(-1.02,0,-.18);grip.scale.setScalar(.78);}
    this.rig.userData.itemKey=key;
  }
  impact(strength=.08){this.recoil=Math.max(this.recoil,strength);}
  update(time,dt,{entity,blend=0,moving=false,sprinting=false,reducedMotion=false,tool='',animation=null,fishingTime=time}){
    const fishing=entity?.rodEquipped&&!entity?.ghost, timeline=fishing?{active:false,stage:'idle',windup:0,strike:0,recover:1}:animation?.timeline||{active:false,stage:'idle',windup:0,strike:0,recover:1},kind=animation?.kind||'light',activeTool=fishing?'fishing':timeline.active&&['gather','gatherSpecial'].includes(kind)?'gather':tool;
    this.rebuild(entity,activeTool);this.root.visible=blend>.02&&!!entity?.alive;if(!this.root.visible)return;
    const heavy=kind==='heavy',gather=['gather','gatherSpecial'].includes(kind),repair=kind==='repair';
    const windupPose=heavy?{x:-1.2,y:.12,z:.28,px:-.16,py:.22,pz:.12}:gather?{x:-.88,y:.24,z:.78,px:.14,py:.12,pz:.1}:repair?{x:-1.34,y:-.16,z:.32,px:-.12,py:.3,pz:.05}:{x:-.55,y:.3,z:.62,px:.12,py:.08,pz:.08};
    const impactPose=heavy?{x:1.58,y:-.24,z:-.72,px:-.58,py:-.28,pz:-.4}:gather?{x:1.16,y:-.48,z:-1.08,px:-.62,py:-.12,pz:-.34}:repair?{x:1.28,y:.12,z:-.42,px:-.42,py:-.32,pz:-.3}:{x:.9,y:-.5,z:-.9,px:-.48,py:-.08,pz:-.3};
    let pose={x:0,y:0,z:0,px:0,py:0,pz:0};
    if(timeline.stage==='windup')for(const key of Object.keys(pose))pose[key]=windupPose[key]*timeline.windup;
    else if(timeline.stage==='impact')for(const key of Object.keys(pose))pose[key]=mix(windupPose[key],impactPose[key],timeline.strike);
    else if(timeline.stage==='recovery')for(const key of Object.keys(pose))pose[key]=impactPose[key]*(1-timeline.recover);
    if(fishing){const f=fishingPose(entity.fishing,fishingTime,reducedMotion);pose={x:f.x,y:f.y,z:f.z,px:0,py:0,pz:0};bendRod(this.rig.userData.rod,f.bend);}
    const pace=sprinting?13:8.5,bob=reducedMotion?0:moving?Math.sin(time*pace)*(sprinting?.018:.012):Math.sin(time*2)*.008,sway=reducedMotion?0:moving?Math.cos(time*pace*.5)*(sprinting?.018:.01):0;
    this.recoil=Math.max(0,this.recoil-dt*.9);this.root.position.set(.3+sway,-.42+bob,-.72+this.recoil);this.root.rotation.set(0,0,-sway*2);this.root.scale.setScalar(Math.max(.01,blend));
    this.rig.position.set(pose.px,pose.py,pose.pz);this.rig.rotation.set(pose.x,pose.y,pose.z);
    const contact=timeline.stage==='impact'?timeline.strike:timeline.stage==='recovery'?Math.max(0,1-timeline.recover):0;
    this.trail.visible=contact>0.02&&!reducedMotion;this.trail.material.opacity=contact*(heavy ? 0.4 : repair ? .3 : gather ? 0.34 : 0.28);this.trail.material.color.setHex(repair?0xe9d18b:gather?0x9fffd0:heavy?0xffd36a:0xe8f5db);this.trail.position.x=-0.38+pose.px*0.25;this.trail.rotation.z=-0.5+pose.z*0.45;this.trail.scale.setScalar(heavy ? 1.15 : repair ? .9 : gather ? 0.96 : 0.86);
    this.cameraKick.pitch=reducedMotion?0:(timeline.stage==='windup' ? 0.012*timeline.windup : -0.026*contact)*(heavy?1.45:repair ? .7 : 1);
    this.cameraKick.yaw=reducedMotion?0:-0.018*contact*(gather||repair ? 0.65 : 1);
    this.cameraKick.roll=reducedMotion?0:(timeline.stage==='windup' ? 0.018*timeline.windup : -0.045*contact)*(heavy?1.35:repair ? .8 : 1);
  }
}
