import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { BALANCE as B, STATES } from '../shared/config.js';
import { FixedStepClock, matchClockRate } from '../shared/match-clock.js';
import { advanceMatch } from '../server/index.js';
import { building, StructureModelCache, setStructureLevel, WorldRenderer } from '../client/renderer.js';
import { CostMetrics, GpuTimer, compilePresentation } from '../client/render-metrics.js';
import { ActionAnimationController } from '../client/action-animation.js';
import { Match } from '../shared/simulation.js';

const slots=()=>[{id:'t',role:'troll',occupant:{type:'bot',name:'Troll',difficulty:'normal'}},...Array.from({length:5},(_,i)=>({id:'e'+i,role:'elf',occupant:{type:'bot',name:'Elf',difficulty:'normal'}}))];

test('1.25 clock accumulates exact fixed steps including DEV multipliers',()=>{
  const clock=new FixedStepClock();assert.deepEqual(Array.from({length:4},()=>clock.steps(matchClockRate())),[1,1,1,2]);
  for(const speed of [1,2,4,6,8,16]){const calls=[],m={state:STATES.ACTIVE,step:dt=>calls.push(dt)};for(let i=0;i<80;i++)advanceMatch(m,speed);assert.equal(calls.length,80*B.gameSpeed*speed);assert.ok(calls.every(dt=>dt===.05));assert.ok(Math.abs(m.realElapsed-4)<1e-8);}
});

test('60 game minutes finish in 48 wall minutes without enlarged physics steps',()=>{
  const m={state:STATES.ACTIVE,time:0,step(dt){this.time+=dt;if(this.time>=3600-1e-7)this.state=STATES.END;}};
  for(let i=0;i<57600;i++)advanceMatch(m);
  assert.equal(m.state,STATES.END);assert.ok(Math.abs(m.time-3600)<1e-6);assert.ok(Math.abs(m.realElapsed-2880)<1e-6);
});

test('timer jitter and bounded catch-up retain all clock steps',()=>{
  const m={state:STATES.ACTIVE,time:0,step(dt){assert.equal(dt,.05);this.time+=dt;}};
  advanceMatch(m,1,.6);assert.equal(m.time,.25);
  advanceMatch(m,1,0);advanceMatch(m,1,0);
  assert.ok(Math.abs(m.time-.75)<1e-8);assert.equal(m.realElapsed,.6);
  for(const seconds of [.045,.064,.048,.083])advanceMatch(m,1,seconds);
  assert.ok(Math.abs(m.time-m.realElapsed*B.gameSpeed)<.05);
  assert.equal(matchClockRate(Infinity),B.gameSpeed);
});

test('snapshot exposes authoritative effective speed',()=>{
  const m=new Match({seed:'THORNHOLD',elfSlots:5},slots());advanceMatch(m,8);const s=m.snapshot(null);
  assert.equal(s.gameSpeed,1.25);assert.equal(s.clockRate,10);assert.equal(s.devSpeed,1);assert.equal(s.realElapsed,.05);
});

test('normal 1x5 gameplay is identical after the same game time at the faster pace',()=>{
  const baseline=new Match({seed:'THORNHOLD',elfSlots:5},slots()),accelerated=new Match({seed:'THORNHOLD',elfSlots:5},slots());
  for(let i=0;i<800;i++)baseline.step(.05);
  for(let i=0;i<640;i++)advanceMatch(accelerated);
  const a=baseline.snapshot(null),b=accelerated.snapshot(null);delete a.realElapsed;delete b.realElapsed;
  assert.deepEqual(b,a);assert.ok(Math.abs(accelerated.realElapsed-32)<1e-8);
});

test('human input expiry remains a real-time safety timeout at 1.25x',()=>{
  const roster=slots();roster[1].occupant.type='human';
  const m=new Match({seed:'THORNHOLD',elfSlots:5},roster),u=m.unit('e0');m.input(u.id,{x:1,z:0});
  for(let i=0;i<7;i++)advanceMatch(m);
  assert.equal(u.input.x,1);assert.ok(m.time>.35);
  for(let i=0;i<2;i++)advanceMatch(m);
  assert.equal(u.input.x,0);
});

test('a slow frame does not slow the shared animation clock',()=>{
  let effectDelta;
  const renderer={viewerId:null,lastTime:1000,elapsed:0,realElapsed:0,clockRate:1.25,reducedMotion:()=>true,updatePerformanceMetrics(){},isMenu:true,menuFocus:new T.Vector3(),camera:new T.PerspectiveCamera(),menuTroll:{userData:{body:{position:{}}}},updateRecallEffects(dt){effectDelta=dt;},celebrations:[],particles:[],projectiles:[],nextShadowUpdateAt:Infinity,costs:new CostMetrics(),gpuTimer:{beginFrame(){},end(){}},renderer:{render(){}},performance:{}};
  WorldRenderer.prototype.render.call(renderer,1100,null,null);
  assert.equal(renderer.realElapsed,.1);assert.equal(renderer.elapsed,.125);
  assert.equal(effectDelta,.125);
});

test('one scaffold mesh for every kind/era, hidden when completed',()=>{
  for(const kind of ['core','wall','tower','mine'])for(const level of [1,6,11,16,21,30]){const g=building(kind,level),rig=g.userData.constructionRig;let meshes=0;rig.traverse(o=>meshes+=!!o.isMesh);assert.equal(meshes,1);assert.equal(rig.visible,false);assert.equal(g.userData.upgradeRing,null);}
});

test('ordinary levels reveal modules without allocating/replacing geometry',()=>{
  const cache=new StructureModelCache(),g=cache.create('tower',1),meshIds=g.userData.buildMeshes.map(m=>m.uuid),geometryIds=g.userData.buildMeshes.map(m=>m.geometry.uuid),counts=[];
  for(const level of [1,2,3,4,5]){setStructureLevel(g,level);counts.push(g.userData.buildMeshes.filter(m=>m.visible).length);assert.equal(g.userData.structureLevel,level);assert.deepEqual(g.userData.buildMeshes.map(m=>m.uuid),meshIds);assert.deepEqual(g.userData.buildMeshes.map(m=>m.geometry.uuid),geometryIds);}
  assert.equal(new Set(counts).size,5);assert.equal(cache.misses,1);
});

test('cached rebuilds share geometry but not transforms/progress and preserve five eras',()=>{
  const cache=new StructureModelCache(),a=cache.create('wall',6),b=cache.create('wall',9);
  assert.equal(cache.hits,1);assert.notEqual(a.uuid,b.uuid);assert.equal(a.userData.buildMeshes[0].geometry,b.userData.buildMeshes[0].geometry);assert.notEqual(a.userData.constructionRig,b.userData.constructionRig);
  a.userData.constructionRig.scale.y=.2;assert.equal(b.userData.constructionRig.scale.y,1);assert.equal(new Set([1,6,11,16,21].map(level=>cache.create('wall',level).userData.visualTier)).size,5);
  const limited=new StructureModelCache(2);for(const level of [1,6,11,16,21])limited.create('core',level);assert.equal(limited.models.size,2);
});

test('precompile awaits compileAsync with actual target scene and camera',async()=>{
  const objects=new T.Group(),camera=new T.PerspectiveCamera(),scene=new T.Scene();let ready=false;
  const renderer={async compileAsync(a,b,c){assert.equal(a,objects);assert.equal(b,camera);assert.equal(c,scene);await Promise.resolve();ready=true;}};
  await compilePresentation(renderer,objects,camera,scene);assert.equal(ready,true);
});

test('CPU stages retain independent bounded percentiles',()=>{
  const c=new CostMetrics(3);for(const v of [1,2,3,4])c.record('hudCpu',v);c.record('snapshotCpu',8);c.record('sceneCpu',2);c.record('shadowCpu',1);
  assert.deepEqual(c.summary().hudCpu,{p50:3,p95:3,max:4,samples:3});assert.equal(c.summary().snapshotCpu.p95,8);assert.equal(c.summary().sceneCpu.p95,2);
});

test('GPU timing polls asynchronously, separates passes and discards disjoint',()=>{
  const costs=new CostMetrics(),extension={TIME_ELAPSED_EXT:1,GPU_DISJOINT_EXT:2},gl={QUERY_RESULT_AVAILABLE:3,QUERY_RESULT:4,ready:false,disjoint:false,deleted:0,getExtension:()=>extension,createQuery:()=>({}),beginQuery(){},endQuery(){},getParameter(){return this.disjoint;},getQueryParameter(q,p){return p===3?this.ready:2e6;},deleteQuery(){this.deleted++;}},gpu=new GpuTimer(gl,costs);
  for(let i=0;i<12;i++)gpu.beginFrame();assert.equal(gpu.begin('shadowGpu'),true);assert.equal(gpu.begin('sceneGpu'),false);gpu.end();assert.equal(gpu.begin('sceneGpu'),true);gpu.end();gpu.poll();assert.equal(gpu.pending.length,2);assert.deepEqual(costs.summary(),{});
  gl.ready=true;gpu.poll();assert.equal(costs.summary().shadowGpu.p95,2);assert.equal(costs.summary().sceneGpu.p95,2);assert.equal(gl.deleted,2);
  gpu.begin('sceneGpu');gpu.end();gl.disjoint=true;gpu.poll();assert.equal(gpu.pending.length,0);assert.equal(gl.deleted,3);
  assert.equal(costs.summary().sceneGpu,undefined);assert.equal(costs.summary().shadowGpu,undefined);
  const unavailable=new GpuTimer({...gl,getExtension:()=>null},costs);assert.equal(unavailable.begin('sceneGpu'),false);
});

test('first/third person read identical game-clock light and heavy timing',()=>{
  for(const kind of ['light','heavy']){const a=new ActionAnimationController(),b=new ActionAnimationController(),windup=kind==='heavy'?.32:.1,event={type:'attack-animation',phase:'started',unit:'t',kind,attackId:1,startedAt:10,windup,recovery:.4};
    a.consume(event,0,10,'firstPerson');b.consume(event,0,10,'thirdPerson');const gameNow=windup/1.25*matchClockRate();assert.deepEqual(a.get('t',gameNow).timeline,b.get('t',gameNow).timeline);assert.ok(Math.abs(gameNow-windup)<1e-9);
  }
});
