import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { FirstPersonViewmodel } from '../client/viewmodel.js';
import { ActionAnimationController } from '../client/action-animation.js';
import { heldItemKey } from '../client/held-item.js';
import { attackTimeline } from '../client/attack-timeline.js';
import { character } from '../client/renderer.js';

const state=(role='troll',animation=null)=>({entity:{role,alive:true,equipment:{}},blend:1,moving:false,sprinting:false,reducedMotion:false,tool:'work',animation});

test('first-person heavy attack consumes the shared timeline and moves through a visible arc',()=>{
  const viewmodel=new FirstPersonViewmodel(new T.PerspectiveCamera()),animations=new ActionAnimationController();
  animations.predict('t','heavy',10,{windup:.32});viewmodel.update(10.12,.016,state('troll',animations.get('t',10.12)));
  assert.ok(Math.abs(viewmodel.rig.rotation.x)>.25);assert.ok(Math.abs(viewmodel.rig.rotation.z)>.05);assert.equal(viewmodel.root.scale.x,1);
});

test('elf gathering moves the axe laterally instead of scaling it',()=>{
  const viewmodel=new FirstPersonViewmodel(new T.PerspectiveCamera()),animations=new ActionAnimationController();
  animations.predict('e','gather',4,{windup:.2,target:'tree'});viewmodel.update(4.15,.016,state('elf',animations.get('e',4.15)));
  assert.ok(Math.abs(viewmodel.rig.rotation.x)>.35);assert.ok(Math.abs(viewmodel.rig.rotation.z)>.35);assert.deepEqual(viewmodel.rig.scale.toArray(),[1,1,1]);assert.equal(viewmodel.rig.userData.itemKey,'elfAxe');
});

test('elf repair uses a visible hammer strike and authoritative confirmation',()=>{
  const viewmodel=new FirstPersonViewmodel(new T.PerspectiveCamera()),animations=new ActionAnimationController();
  animations.predict('e','repair',6,{windup:.28,target:'wall'});const windup=animations.get('e',6.18);viewmodel.update(6.18,.016,state('elf',windup));const raised=viewmodel.rig.rotation.x;
  assert.equal(viewmodel.rig.userData.itemKey,'elfHammer');assert.ok(Math.abs(raised)>.35);
  animations.confirmWork('e','repair','wall',6.28,.28);const impact=animations.get('e',6.38);viewmodel.update(6.38,.016,state('elf',impact));
  assert.ok(Math.abs(viewmodel.rig.rotation.x-raised)>.45);assert.equal(impact.impactReceived,true);assert.equal(impact.target,'wall');
});

test('first and third person resolve the same equipped weapon',()=>{
  assert.equal(heldItemKey('troll',{weapon:null}),'club');assert.equal(heldItemKey('troll',{weapon:'maul'}),'maul');assert.equal(heldItemKey('elf',{},'gather'),'elfAxe');
  const troll=character('troll',{weapon:'maul'}),elf=character('elf');assert.equal(troll.userData.heldItems.weapon.userData.heldItemKey,'maul');assert.equal(elf.userData.heldItems.axe.userData.heldItemKey,'elfAxe');
});

test('authoritative impact happens exactly at the configured windup',()=>{
  assert.equal(attackTimeline(.319,.32,'heavy').stage,'windup');assert.equal(attackTimeline(.32,.32,'heavy').stage,'impact');
});

test('server confirmation reconciles without restarting local prediction',()=>{
  const animations=new ActionAnimationController();animations.predict('t','heavy',8,{windup:.32});
  animations.consume({type:'attack-animation',phase:'started',unit:'t',attackId:'attack-1',kind:'heavy',startedAt:20,windup:.32,recovery:.42},8.05,20.05,'firstPerson');
  const current=animations.get('t',8.05);assert.equal(current.startedAt,8);assert.equal(current.attackId,'attack-1');assert.ok(Math.abs(current.age-.05)<1e-9);
});

test('camera changes do not fork or restart the shared animation state',()=>{
  const animations=new ActionAnimationController();animations.predict('t','light',3,{windup:.1});
  animations.consume({type:'attack-animation',phase:'started',unit:'t',attackId:'attack-2',kind:'light',startedAt:12,windup:.1,recovery:.26},3.04,12.04,'thirdPerson');
  const before=animations.get('t',3.06);animations.consume({type:'attack-animation',phase:'impact',unit:'t',attackId:'attack-2',kind:'light',startedAt:12,windup:.1,recovery:.26,hit:false},3.1,12.1,'firstPerson');const after=animations.get('t',3.1);
  assert.equal(after.startedAt,before.startedAt);assert.equal(after.attackId,before.attackId);assert.equal(after.impactReceived,true);
});

test('impact has a visible trail and camera response without allocating per frame',()=>{
  const viewmodel=new FirstPersonViewmodel(new T.PerspectiveCamera()),trail=viewmodel.trail,animations=new ActionAnimationController();animations.predict('t','heavy',2,{windup:.32});
  viewmodel.update(2.37,.016,state('troll',animations.get('t',2.37)));assert.equal(viewmodel.trail,trail);assert.equal(trail.visible,true);assert.ok(trail.material.opacity>0.05);assert.ok(Math.abs(viewmodel.cameraKick.roll)>0.01);
});
