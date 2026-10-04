import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../shared/simulation.js';
import { FISHING, FISH_SPECIES, FISH_RARITIES, fishSpecimen, castLine, hookFish, stepFishing, fishingStatus, rodStats, fishingEquipment, upgradeFishingGear, rodUnlocked, equipRod, fishSaleValue, upgradeRod, sellFish, fishingWorkshopStatus, sortFish } from '../shared/fishing.js';
import { BALANCE as B, upgradeCost } from '../shared/config.js';
import { buildingShortcut } from '../shared/building-shortcuts.js';
import { fishingLocation } from '../shared/coast.js';
import { walkable, toCell } from '../shared/map.js';
import { fishingGallery } from '../client/fishing-profile.js';
import { PlatformDatabase } from '../server/database.js';
import { AuthService } from '../server/auth.js';
import { FishingCollection } from '../server/fishing-collection.js';
import { FirstPersonViewmodel } from '../client/viewmodel.js';
import { createHeldItem, bendRod } from '../client/held-item.js';
import { FishingVisuals, createFishModel, fishingPose, fishingReelPoint, stepFishingBody } from '../client/fishing-visuals.js';
import { workshopMarkup } from '../client/fishing-workshop.js';
import { selectionMarkup } from '../client/selection.js';
import { toolSlots } from '../client/fishing-ui.js';
import { BUILDING_HOTKEYS } from '../shared/building-shortcuts.js';
import { DEFAULT_BINDINGS, binding } from '../client/preferences.js';
import { normalizeFishCollection } from '../client/fishing-ui.js';
import { PerspectiveCamera, Group } from 'three';
import { createSnapshotDelta, applySnapshotDelta } from '../shared/snapshot-delta.js';
import { createGameServer } from '../server/index.js';
import { WebSocket } from 'ws';

function fixture(){
  const slots=[{id:'t0',role:'troll',occupant:{type:'human',name:'Troll'}},...Array.from({length:5},(_,i)=>({id:'e'+i,role:'elf',occupant:{type:'human',name:'Elf '+i,partyId:i<2?'duo':null}}))];
  const match=new Match({seed:'FISHING',coop:true},slots),unit=match.unit('e0'),spot=match.map.fishingSpots[0];
  match.structures.push({id:'core',kind:'core',owner:unit.id,baseId:spot.baseId,x:match.map.bases[0].x,z:match.map.bases[0].z,hp:100,maxHp:100,progress:1,tier:1});
  unit.x=spot.x;unit.z=spot.z;unit.yaw=Math.atan2(spot.castPoint.x-unit.x,spot.castPoint.z-unit.z);workshop(match,unit);return {match,unit,spot};
}
function catchOne(match,unit){assert.equal(castLine(match,unit),null);match.time=unit.fishing.biteAt;stepFishing(match);assert.equal(unit.fishing.phase,'bite');assert.equal(hookFish(match,unit),null);match.time=unit.fishing.reelUntil;stepFishing(match);return unit.fishInventory.at(-1);}
function workshop(match,u){const previous=match.structures.find(s=>s.id==='fishery');if(previous)return previous;const s={id:'fishery',kind:'fishery',owner:u.id,baseId:match.structures[0].baseId,x:u.x,z:u.z,hp:250,maxHp:250,progress:1,tier:1};match.structures.push(s);return s;}

test('every walkable cell along the owned coastal strip supports fishing, not just the marker',()=>{
  const {match,unit}=fixture(),base=match.map.bases[0],c=base.coast;let eligible=0,farFromMarker=0;
  for(let across=-c.halfWidth;across<=c.halfWidth;across+=1)for(let along=c.beachStart;along<c.edge;along+=1){
    unit.x=base.x+c.dx*along+(c.axis==='z'?across:0);unit.z=base.z+c.dz*along+(c.axis==='x'?across:0);
    const cell=toCell(match.map,unit);if(!walkable(match.map,cell.x,cell.z))continue;
    assert.ok(fishingLocation(match.map,unit));assert.equal(fishingStatus(match,unit,{facing:false}).available,true);eligible++;
    if(Math.hypot(unit.x-match.map.fishingSpots[0].x,unit.z-match.map.fishingSpots[0].z)>FISHING.range)farFromMarker++;
  }
  assert.ok(eligible>20);assert.ok(farFromMarker>10);
  unit.x=base.x;unit.z=base.z;assert.equal(fishingLocation(match.map,unit),null);
});

test('fish reel respects terrain elevations across the entire route including cliffs',()=>{
  const ground=(x,z)=>x>3&&x<7?4:1,point={};
  for(let i=0;i<=100;i++){const p=fishingReelPoint({x:0,y:-1,z:0},{x:10,y:2.3,z:0},i/100,ground,point);assert.equal(p,point);assert.ok(p.y>=ground(p.x,p.z)+.38);}
});

test('starter rod is unlocked only by a completed owned/co-op Workshop and stays unlocked after its loss',()=>{
  const {match,unit}=fixture(),s=match.structures.find(s=>s.kind==='fishery');s.progress=.9;
  assert.equal(rodUnlocked(match,unit),false);assert.match(equipRod(match,unit),/Oficina/);assert.match(castLine(match,unit),/Oficina/);
  s.progress=1;s.owner='e3';assert.equal(rodUnlocked(match,unit),false);s.owner='e1';assert.equal(rodUnlocked(match,unit),true);
  stepFishing(match);s.hp=0;assert.equal(rodUnlocked(match,unit),true);assert.equal(equipRod(match,unit),null);assert.equal(unit.rodEquipped,true);
  const fresh=fixture();fresh.match.structures=[];assert.equal(rodUnlocked(fresh.match,fresh.unit),false);
});

test('sale works with rod equipped and leaves it equipped; failed sales do not alter tool/fishing state',()=>{
  const {match,unit}=fixture(),fish=catchOne(match,unit),gold=unit.gold;assert.equal(unit.rodEquipped,true);
  castLine(match,unit);const active=unit.fishing;assert.match(match.act(unit.id,{type:'sellFish',ids:['foreign']}),/inventário/);assert.equal(unit.fishing,active);assert.equal(unit.rodEquipped,true);
  assert.equal(match.act(unit.id,{type:'sellFish',ids:[fish.id]}),null);assert.equal(unit.rodEquipped,true);assert.equal(unit.fishing,null);assert.equal(unit.gold,gold+fish.saleValue);
  assert.doesNotMatch(workshopMarkup({...match.snapshot(unit.id).units.find(u=>u.id===unit.id),fishInventory:[fish]}),/data-do="sell-fish"[^>]*disabled/);
});

test('bait and reel shorten waiting/reeling without consuming different fish RNG or boosting rarity',()=>{
  const before=fixture(),after=fixture();after.unit.gold=10000;after.unit.wood=1000;
  for(const key of ['bait','reel'])for(let i=0;i<4;i++)assert.equal(upgradeFishingGear(after.match,after.unit,key),null);
  assert.match(upgradeFishingGear(after.match,after.unit,'reel'),/máximo/);assert.match(upgradeFishingGear(after.match,after.unit,'unknown'),/inválido/);
  castLine(before.match,before.unit);castLine(after.match,after.unit);assert.deepEqual(before.unit.fishing.fish,after.unit.fishing.fish);
  assert.ok(after.unit.fishing.biteAt<before.unit.fishing.biteAt);assert.ok(after.unit.fishing.reelSeconds<before.unit.fishing.reelSeconds);assert.ok(fishingEquipment(after.unit).biteWindow>fishingEquipment(before.unit).biteWindow);
  const level=after.unit.rodLevel;after.unit.gold=0;assert.notEqual(upgradeFishingGear(after.match,after.unit,'rod'),null);assert.equal(after.unit.rodLevel,level);
});

test('rare fish sale floors are authoritative; shiny adds value, not a seventh rarity',()=>{
  for(const [id,min] of [['epic',1000],['legendary',10000],['mythic',50000]])for(const species of FISH_SPECIES)for(const rating of [0,50,100]){
    const rarity=FISH_RARITIES.find(r=>r.id===id),price=fishSaleValue(species,rarity,rating);assert.ok(price>=min);assert.equal(fishSaleValue(species,rarity,rating,true),price*2);
  }
});

test('tool inventory replaces P; building keys retain Tower 3 and Workshop has no building upgrade',()=>{
  assert.equal(DEFAULT_BINDINGS.rod,'Digit1');assert.equal(binding('rod'),'Digit1');assert.deepEqual(BUILDING_HOTKEYS,{core:6,wall:2,tower:3,mine:4,fishery:5});
  assert.match(toolSlots({rodUnlocked:false}),/data-tool="rod"[^>]*disabled/);assert.match(toolSlots({rodUnlocked:true,rodEquipped:true}),/EQUIPADA/);
  const {match,unit}=fixture(),snapshot=match.snapshot(unit.id),s=match.structures.find(s=>s.kind==='fishery');const markup=selectionMarkup(s,{u:snapshot.units.find(u=>u.id===unit.id),snapshot,map:match.map});assert.doesNotMatch(markup,/data-do="upgrade"|Próxima melhoria/);
  const shop=workshopMarkup(snapshot.units.find(u=>u.id===unit.id));for(const key of ['rod','bait','reel'])assert.match(shop,new RegExp('data-key="'+key+'"'));
});

test('visual fish follows water then shore rather than a skyward parabola, with damped floor contact',()=>{
  const ground=x=>x>6?(x-6)*.15:-1,water={x:0,y:0,z:0},landing={x:10,y:2,z:0},body={x:0,y:.1,z:0,vy:0};
  for(let i=0;i<=100;i++){const target=fishingReelPoint(water,landing,i/100,ground);assert.ok(target.y<=2.12);if(i<60)assert.ok(target.y<.4);stepFishingBody(body,target,1/144,ground);assert.ok(body.y>=ground(body.x,body.z)+.38);assert.ok(Number.isFinite(body.y));}
  assert.equal(fishingReelPoint(water,landing,1,ground).y,2);
});

test('Workshop sales are paid once, server-priced, owner-only and preserve collection',()=>{
  const {match,unit}=fixture(),fish=catchOne(match,unit),gold=unit.gold,other=match.unit('e1');workshop(match,unit);
  assert.equal(sellFish(match,unit,[fish.id,fish.id]),'Seleção de peixes inválida.');assert.match(sellFish(match,unit,['foreign']),/inventário/);
  other.x=unit.x;other.z=unit.z;assert.equal(fishingWorkshopStatus(match,other).available,true);assert.match(sellFish(match,other,[fish.id]),/inventário/);
  assert.equal(sellFish(match,unit,[fish.id]),null);assert.equal(unit.gold,gold+fish.saleValue);assert.equal(unit.stats.goldFromFishing,fish.saleValue);
  assert.equal(unit.fishInventory.length,0);assert.equal(unit.fishCollection.length,1);assert.match(sellFish(match,unit,[fish.id]),/inventário/);assert.equal(unit.gold,gold+fish.saleValue);
  catchOne(match,unit);catchOne(match,unit);assert.equal(sellFish(match,unit,'all'),null);assert.equal(unit.stats.fishSold,3);assert.equal(sellFish(match,unit,'all')===null,false);
});

test('Workshop rejects out-of-range, destroyed, unfinished, unrelated or dead users',()=>{
  const {match,unit}=fixture();catchOne(match,unit);const s=workshop(match,unit),gold=unit.gold;
  for(const mutate of [()=>s.x+=20,()=>s.hp=0,()=>s.progress=.9,()=>s.owner='e3',()=>unit.alive=false]){
    Object.assign(s,{x:unit.x,hp:250,progress:1,owner:unit.id});unit.alive=true;mutate();
    assert.equal(fishingWorkshopStatus(match,unit).available,false);assert.notEqual(sellFish(match,unit,'all'),null);assert.equal(unit.gold,gold);
  }
});

test('rod upgrades consume normal costs, cap at 5, improve timing without changing fish odds',()=>{
  const {match,unit}=fixture();workshop(match,unit);unit.gold=10000;unit.wood=1000;
  let gold=unit.gold,wood=unit.wood;for(let i=1;i<5;i++){const cost=rodStats(i).nextCost;assert.equal(upgradeRod(match,unit),null);gold-=cost.gold;wood-=cost.wood;assert.equal(unit.rodLevel,i+1);assert.equal(unit.gold,gold);assert.equal(unit.wood,wood);}
  assert.match(upgradeRod(match,unit),/máximo/);assert.equal(unit.stats.spendByAction['upgrade-rod'].gold,1875);
  const normal=fixture(),improved=fixture();improved.unit.rodLevel=5;castLine(normal.match,normal.unit);castLine(improved.match,improved.unit);
  assert.deepEqual(normal.unit.fishing.fish,improved.unit.fishing.fish);assert.ok(improved.unit.fishing.hookUntil-improved.unit.fishing.biteAt>normal.unit.fishing.hookUntil-normal.unit.fishing.biteAt);
  assert.ok(improved.unit.fishing.reelSeconds<normal.unit.fishing.reelSeconds);
  unit.gold=0;unit.rodLevel=1;assert.match(upgradeRod(match,unit),/requer/);assert.equal(unit.rodLevel,1);
});

test('remote paid upgrades keep fishing active while retaining ownership and progression gates',()=>{
  const {match,unit}=fixture();unit.gold=10000;unit.wood=10000;const wall={id:'wall',kind:'wall',owner:unit.id,baseId:match.structures[0].baseId,x:unit.x+20,z:unit.z,hp:100,maxHp:100,progress:1,tier:1,upgrading:0,branch:'power'};match.structures.push(wall);
  castLine(match,unit);const fishing=unit.fishing,cost=upgradeCost(wall,unit.elfPath,unit.elfSpecialization),gold=unit.gold;
  assert.equal(match.act(unit.id,{type:'upgrade',target:wall.id,remote:true}),undefined);assert.equal(unit.fishing,fishing);assert.equal(unit.rodEquipped,true);assert.equal(unit.gold,gold-cost.gold);assert.ok(wall.upgrading>0);
  wall.upgrading=0;wall.owner='e1';assert.notEqual(match.act(unit.id,{type:'upgrade',target:wall.id,remote:true}),null);
  wall.owner=unit.id;wall.tier=10;assert.match(match.act(unit.id,{type:'upgrade',target:wall.id,remote:true}),/especialização/);
  wall.tier=1;unit.gold=0;assert.match(match.act(unit.id,{type:'upgrade',target:wall.id,remote:true}),/Ouro/);
  unit.gold=10000;unit.stunnedUntil=match.time+3;assert.match(match.act(unit.id,{type:'upgrade',target:wall.id,remote:true}),/Atordoado/);
});

test('2/3/4/6 shortcuts build absent Tower, upgrades owned buildings and Shift explicitly builds another',()=>{
  const {match,unit}=fixture();unit.gold=10000;unit.wood=10000;let snapshot=match.snapshot(unit.id);
  assert.equal(buildingShortcut(unit,'tower',snapshot).mode,'build');assert.equal(buildingShortcut(unit,'tower',snapshot).allowed,true);
  match.structures.push({id:'tower',kind:'tower',tier:1,owner:unit.id,baseId:match.structures[0].baseId,x:unit.x,z:unit.z,hp:100,maxHp:100,progress:1,upgrading:0});
  snapshot=match.snapshot(unit.id);assert.equal(buildingShortcut(unit,'tower',snapshot).mode,'upgrade');assert.equal(buildingShortcut(unit,'tower',snapshot,{build:true}).mode,'build');
  unit.gold=0;assert.equal(buildingShortcut(unit,'tower',snapshot).allowed,false);
  unit.gold=10000;unit.wood=0;assert.equal(buildingShortcut(unit,'wall',snapshot).allowed,false);
  unit.wood=10000;assert.equal(buildingShortcut(unit,'wall',snapshot).allowed,true);
});

test('rarity ordering is immutable and profile gallery is paginated, visual-only and has explicit errors',()=>{
  const a=fishSpecimen('x','a'),fish=[{...a,id:'common',rarity:'common',rating:100},{...a,id:'mythic',rarity:'mythic',rating:1},{...a,id:'epic',rarity:'epic',rating:55}];
  assert.deepEqual(sortFish(fish).map(f=>f.id),['mythic','epic','common']);assert.equal(fish[0].id,'common');
  const html=fishingGallery({items:sortFish(fish),page:2,pageSize:12,total:30});assert.match(html,/Página 2 de 3/);assert.match(html,/Registros visuais/);assert.ok(html.indexOf('Mítico')<html.indexOf('Épico'));assert.match(fishingGallery(null,{error:'x'}),/Tentar novamente/);
});

test('individual account catches persist after sale/death, sorted by rarity with isolated pagination',async()=>{
  const db=new PlatformDatabase({filename:':memory:'}),auth=new AuthService(db);
  try{const {user}=await auth.register({username:'history_fisher',email:'history@test.test',displayName:'Fisher',password:'StrongPass123'}),collection=new FishingCollection(db),f=fishSpecimen('x','x');
    for(let i=0;i<30;i++)collection.record(user.id,'catch:'+i,{...f,id:'f'+i,rarity:i===0?'mythic':i===1?'legendary':'common',rating:i});
    const page=collection.catches(user.id,{page:1,pageSize:12});assert.equal(page.total,30);assert.equal(page.items.length,12);assert.equal(page.items[0].rarity,'mythic');assert.equal(page.items[1].rarity,'legendary');assert.ok(page.items[0].capturedAt);
    const last=collection.catches(user.id,{page:999,pageSize:12});assert.equal(last.page,3);assert.equal(last.items.length,6);assert.equal(collection.catches('other').total,0);assert.equal(collection.record(user.id,'catch:0',f),false);assert.equal(collection.catches(user.id).total,30);
  }finally{db.close();}
});

test('visual collection rejects malformed stored rows and derives safe unique keys',()=>{
  const fish=fishSpecimen('collection','fish');
  const row={key:'ignored',count:2,best:fish};
  assert.deepEqual(normalizeFishCollection({}),[]);
  const rows=normalizeFishCollection([null,row,row,{...row,count:'<img>'},{...row,best:{...fish,weightKg:'bad'}},{...row,best:{...fish,rating:101}},{...row,best:{...fish,species:'unknown'}}]);
  assert.equal(rows.length,1);assert.equal(rows[0].key,`${fish.species}:${fish.rarity}:${fish.shiny?'shiny':'normal'}`);assert.equal(rows[0].count,2);
});

test('fishing is deterministic, server-authoritative, one-click reel and does not award gold',()=>{
  const {match,unit}=fixture(),gold=unit.gold,generated=unit.stats.goldGenerated;
  assert.equal(castLine(match,unit),null);assert.equal(castLine(match,unit),'A linha já está na água. Aguarde a boia afundar.');
  assert.match(hookFish(match,unit),/Aguarde/);const fish=unit.fishing.fish;
  match.time=unit.fishing.biteAt;stepFishing(match);assert.equal(unit.fishing.phase,'bite');assert.equal(hookFish(match,unit),null);
  const until=unit.fishing.reelUntil;assert.equal(hookFish(match,unit),null);assert.equal(unit.fishing.reelUntil,until);
  match.time=until;stepFishing(match);stepFishing(match);assert.equal(unit.fishInventory.length,1);assert.equal(unit.fishInventory[0].id,fish.id);
  assert.equal(unit.fishCollection.length,1);assert.equal(unit.stats.fishCaught,1);assert.equal(unit.gold,gold);assert.equal(unit.stats.goldGenerated,generated);
});

test('movement, damage, stun, missed bite and other actions interrupt fishing; looking around does not',()=>{
  for(const cause of ['move','hit','stun','miss','action']){const {match,unit}=fixture();assert.equal(castLine(match,unit),null);
    if(cause==='move')match.input(unit.id,{x:1,z:0});
    if(cause==='hit')unit.lastHit=match.time;
    if(cause==='stun')unit.stunnedUntil=match.time+3;
    if(cause==='miss')match.time=unit.fishing.hookUntil+.01;
    if(cause==='action')match.act(unit.id,{type:'elfStun'});
    stepFishing(match);assert.equal(unit.fishing,null,cause);assert.equal(unit.fishInventory.length,0);
  }
  const {match,unit}=fixture();castLine(match,unit);unit.yaw+=Math.PI;match.time=unit.fishing.biteAt;stepFishing(match);assert.equal(hookFish(match,unit),null);
});

test('only living Elves with a completed owned/co-op coastal core can fish; bounded inventory',()=>{
  const {match,unit,spot}=fixture(),partner=match.unit('e1'),enemy=match.unit('e2');
  for(const other of [partner,enemy,match.unit('t0')]){other.x=spot.x;other.z=spot.z;other.yaw=unit.yaw;}
  assert.equal(fishingStatus(match,partner).available,true);assert.equal(fishingStatus(match,enemy).available,false);assert.equal(fishingStatus(match,match.unit('t0')).available,false);
  unit.fishInventory=Array(FISHING.inventoryLimit).fill({});assert.match(castLine(match,unit),/cheio/);unit.fishInventory=[];
  match.structures[0].progress=.9;assert.equal(fishingStatus(match,unit).available,false);match.structures[0].progress=1;unit.ghost=true;assert.equal(fishingStatus(match,unit).available,false);
});

test('death removes sale inventory, preserves visual records and does not carry inventory into a new match',()=>{
  const {match,unit}=fixture();catchOne(match,unit);assert.equal(unit.fishCollection.length,1);
  match.eliminateElf(unit,match.unit('t0'));assert.equal(unit.fishInventory.length,0);assert.equal(unit.stats.fishLost,1);assert.equal(unit.fishCollection.length,1);
  assert.equal(fixture().unit.fishInventory.length,0);
});

test('snapshots never reveal pending fish or inventories to opponents',()=>{
  const {match,unit,spot}=fixture();castLine(match,unit);
  const own=match.snapshot(unit.id).units.find(u=>u.id===unit.id);assert.ok(own.fishing);assert.equal(own.fishing.fish,undefined);assert.equal(own.fishing.biteAt,null);
  match.time=unit.fishing.biteAt;stepFishing(match);hookFish(match,unit);match.time=unit.fishing.reelUntil;stepFishing(match);
  const troll=match.unit('t0');troll.x=spot.x;troll.z=spot.z;
  const enemy=match.snapshot(troll.id),publicUnit=enemy.units.find(u=>u.id===unit.id);assert.ok(publicUnit);assert.equal(publicUnit.fishInventory,undefined);assert.equal(publicUnit.fishCollection,undefined);assert.ok(!enemy.events.some(e=>e.type==='fish-caught'));
});

test('mouse-release housekeeping does not cancel cast/reel; actual work unequips the rod',()=>{
  const {match,unit}=fixture();match.act(unit.id,{type:'castLine'});match.act(unit.id,{type:'cancelCrystal'});assert.ok(unit.fishing);
  match.time=unit.fishing.biteAt;stepFishing(match);match.act(unit.id,{type:'hookFish'});match.act(unit.id,{type:'cancelCrystal'});assert.equal(unit.fishing.phase,'reel');
  match.act(unit.id,{type:'repair',target:'core'});assert.equal(unit.fishing,null);assert.equal(unit.rodEquipped,false);
});

test('inventory/collection are not retransmitted when only a moving unit changes',()=>{
  const {match,unit}=fixture();catchOne(match,unit);const before=match.snapshot(unit.id);unit.x+=.2;
  const delta=createSnapshotDelta(before,match.snapshot(unit.id));const change=delta.collections.units.patch.find(p=>p.id===unit.id);assert.equal(change.set.fishInventory,undefined);assert.equal(change.set.fishCollection,undefined);
});

test('rod, bobber and fish reuse geometry without new shadow casters, lights or per-frame geometry',()=>{
  const parent=new Group(),camera=new PerspectiveCamera(),visual=new FishingVisuals(parent,camera),rod=createHeldItem('elf',{},'fishing'),shaft=rod.userData.shaft.geometry;
  for(let i=0;i<100;i++)bendRod(rod,.2+Math.sin(i)*.04);assert.equal(rod.userData.shaft.geometry,shaft);assert.ok(rod.userData.tip.x>.1);
  const fishA=createFishModel({species:'sardine'}),fishB=createFishModel({species:'grouper'});assert.equal(fishA.children[0].geometry,createFishModel({species:'sardine'}).children[0].geometry);assert.notEqual(fishA.children[0].geometry,fishB.children[0].geometry);assert.equal(fishA.children.length,1);assert.ok(fishA.children[0].geometry.attributes.position.count<4000);
  for(const model of [rod,fishA,fishB])model.traverse(o=>{assert.ok(!o.isLight);if(o.isMesh)assert.equal(o.castShadow,false);});
  const fisher=new Group();fisher.userData.entity={fishing:{phase:'reel',startedAt:0,hookedAt:1,reelUntil:4,water:{x:3,y:0,z:3}}};fisher.userData.heldItems={rod};fisher.add(rod);const entities=new Map([['elf',fisher]]);
  visual.update(2,entities);const rig=visual.rigs.get('elf'),line=rig.line.geometry;for(let i=0;i<100;i++)visual.update(2+i*.01,entities);assert.equal(rig.line.geometry,line);assert.equal(visual.rigs.size,1);let disposed=0;line.addEventListener('dispose',()=>disposed++);visual.reset();assert.equal(parent.children.length,0);assert.equal(disposed,1);
});

test('catch presentation stays centered and clears immediately when moving or repairing',()=>{
  const camera=new PerspectiveCamera(),visual=new FishingVisuals(new Group(),camera),viewer=new Group();viewer.userData.entity={alive:true,action:'idle'};const entities=new Map([['elf',viewer]]);
  for(const action of ['walk','repair']){visual.showCatch(fishSpecimen('PRESENTATION','fish'),10);visual.update(10.1,entities,{viewerId:'elf'});assert.equal(visual.capture.root.position.x,0);assert.equal(visual.capture.root.position.z,-1.35);viewer.userData.entity.action=action;visual.update(10.2,entities,{viewerId:'elf'});assert.equal(visual.capture,null);viewer.userData.entity.action='idle';}
  visual.showCatch(fishSpecimen('PRESENTATION','fish'),10);visual.update(13.6,entities,{viewerId:'elf'});assert.equal(visual.capture,null);visual.reset();
});

test('first-person fishing follows authoritative phases across camera changes and isolates world materials',()=>{
  const {unit}=fixture(),camera=new PerspectiveCamera(),viewmodel=new FirstPersonViewmodel(camera),worldItem=createHeldItem('elf',{},'fishing');unit.rodEquipped=true;unit.fishing={phase:'cast',startedAt:10,castUntil:10.7};
  viewmodel.update(10.3,.02,{entity:unit,blend:1,fishingTime:10.3});assert.equal(viewmodel.rig.userData.itemKey,'elfRod');assert.ok(Math.abs(viewmodel.rig.rotation.x-fishingPose(unit.fishing,10.3).x)<1e-9);
  worldItem.traverse(o=>{if(o.isMesh){assert.equal(o.material.depthTest,true);assert.equal(o.material.depthWrite,true);}});
  viewmodel.update(10.3,.02,{entity:unit,blend:0,fishingTime:10.3});assert.equal(viewmodel.root.visible,false);
  unit.fishing={phase:'reel',startedAt:10,hookedAt:12,reelUntil:15};viewmodel.update(13,.02,{entity:unit,blend:1,fishingTime:13});assert.ok(viewmodel.rig.userData.rod.userData.bend>.1);assert.equal(viewmodel.trail.visible,false);
  unit.rodEquipped=false;unit.fishing=null;viewmodel.update(15,.02,{entity:unit,blend:1,tool:'work'});assert.equal(viewmodel.rig.userData.itemKey,'elfHammer');
});

test('five species support all six rarities; coherent sizes/weight/age and independent rating/shiny',()=>{
  const combinations=new Set();let shiny=0;const ratings={common:[],mythic:[]};
  for(let i=0;i<80000;i++){
    const f=fishSpecimen('SPECIMEN-'+i,'f'+i),s=FISH_SPECIES.find(s=>s.id===f.species);
    assert.deepEqual(f,fishSpecimen('SPECIMEN-'+i,'f'+i));assert.ok(f.lengthCm>=s.minCm&&f.lengthCm<=s.maxCm);assert.ok(f.weightKg>0&&f.weightKg<=s.maxKg*1.09);assert.ok(f.ageYears>=.2&&f.ageYears<=s.maxAge);assert.ok(f.rating>=0&&f.rating<=100);assert.ok(f.saleValue>0);
    combinations.add(f.species+':'+f.rarity);if(f.shiny)shiny++;if(ratings[f.rarity])ratings[f.rarity].push(f.rating);
  }
  assert.equal(combinations.size,30);assert.equal(FISH_RARITIES.length,6);assert.ok(shiny>500&&shiny<1200);
  assert.ok(Math.min(...ratings.mythic)<30&&Math.max(...ratings.common)>90);
});

test('account collection persists only visual records, deduplicates catches and keeps best rating',async()=>{
  const db=new PlatformDatabase({filename:':memory:'}),auth=new AuthService(db);
  try{const {user}=await auth.register({username:'fisher',email:'fish@test.test',displayName:'Fisher',password:'StrongPass123'}),collection=new FishingCollection(db),fish=fishSpecimen('collection','one');
    assert.equal(collection.record(user.id,'match:one',fish),true);assert.equal(collection.record(user.id,'match:one',fish),false);
    collection.record(user.id,'match:two',{...fish,id:'two',rating:100});const records=new FishingCollection(db).list(user.id);
    assert.equal(records.length,1);assert.equal(records[0].count,2);assert.equal(records[0].best.rating,100);assert.equal(records[0].inventory,undefined);
    assert.deepEqual(collection.list('other'),[]);
  }finally{db.close();}
});

test('real 1x5 WS catch, rod upgrade and server-priced sale retain visual-only account history',async()=>{
  const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false}),base=`http://127.0.0.1:${app.port}`;let socket;
  try{
    const session=await app.auth.register({username:'net_fisher',email:'fishing-net@test.test',displayName:'Net Fisher',password:'StrongPass123'}),cookie=`thornhold_session=${session.token}`,queue=[],waiters=[];
    let snapshot=null;socket=new WebSocket(`ws://127.0.0.1:${app.port}`,{headers:{Cookie:cookie}});socket.on('message',raw=>{const msg=JSON.parse(raw);if(msg.type==='snapshot')snapshot=msg.snapshot;if(msg.type==='snapshotDelta'){snapshot=applySnapshotDelta(snapshot,msg.delta);queue.push({type:'snapshot',snapshot});}else queue.push(msg);for(const check of [...waiters])check();});
    const send=(type,data={})=>socket.send(JSON.stringify({type,...data})),wait=(type,predicate=()=>true)=>new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{waiters.splice(waiters.indexOf(check),1);reject(new Error('Fishing WS timeout: '+type));},3000);
      function check(){const i=queue.findIndex(m=>m.type===type&&predicate(m));if(i<0)return;clearTimeout(timer);waiters.splice(waiters.indexOf(check),1);resolve(queue.splice(i,1)[0]);}waiters.push(check);check();
    });
    await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});send('hello',{name:'Net Fisher'});await wait('hello');
    send('create',{role:'elf',fillBots:true,settings:{mode:'custom',elfSlots:5,seed:'NET-FISHING'}});const {room}=await wait('lobby');send('ready',{ready:true});await wait('lobby',m=>m.room.errors.length===0);send('start');const {viewerId}=await wait('map');
    const match=app.sessions.rooms.get(room.id).match;assert.equal(match.units.length,6);for(const unit of match.units)match.setController(unit.id,'human');
    // Isolate the transport fixture at a valid owned shoreline. This is not a
    // balance run or browser gameplay injection; all fishing actions use WS.
    const unit=match.unit(viewerId),spot=match.map.fishingSpots[0],b=match.map.bases[0];match.structures.push({id:'fishing-core',kind:'core',owner:unit.id,baseId:b.id,x:b.x,z:b.z,hp:100,maxHp:100,progress:1,healthProgress:1,tier:1,lastHit:-100,upgrading:0});
    unit.x=spot.x;unit.z=spot.z;workshop(match,unit);unit.yaw=Math.atan2(spot.castPoint.x-spot.x,spot.castPoint.z-spot.z);send('action',{command:{type:'castLine'}});await wait('snapshot',m=>m.snapshot.units.find(u=>u.id===viewerId)?.fishing);
    match.time=unit.fishing.biteAt;await wait('snapshot',m=>m.snapshot.units.find(u=>u.id===viewerId)?.fishing?.phase==='bite');
    send('action',{command:{type:'hookFish'}});await wait('snapshot',m=>m.snapshot.units.find(u=>u.id===viewerId)?.fishing?.phase==='reel');match.time=unit.fishing.reelUntil;
    const caught=await wait('snapshot',m=>m.snapshot.units.find(u=>u.id===viewerId)?.fishInventory?.length===1);assert.equal(caught.snapshot.events.some(e=>e.type==='fish-caught'),true);
    const fish=unit.fishInventory[0],saved=await fetch(base+'/api/fishing/collection',{headers:{Cookie:cookie}});assert.equal(saved.status,200);assert.equal((await saved.json()).collection.length,1);
    const history=await fetch(base+'/api/fishing/catches?page=1&pageSize=12',{headers:{Cookie:cookie}});assert.equal(history.status,200);assert.equal((await history.json()).items[0].id,fish.id);assert.equal((await fetch(base+'/api/fishing/catches')).status,401);
    workshop(match,unit);const beforeRod=unit.gold,generatedBeforeRod=unit.stats.goldGenerated;send('action',{command:{type:'upgradeRod'}});await wait('snapshot',m=>m.snapshot.units.find(u=>u.id===viewerId)?.rod?.level===2);assert.ok(Math.abs(unit.gold-beforeRod+125-(unit.stats.goldGenerated-generatedBeforeRod))<1e-6);
    const beforeSale=unit.gold,generatedBeforeSale=unit.stats.goldGenerated;send('action',{command:{type:'sellFish',ids:[fish.id],saleValue:999999}});await wait('snapshot',m=>m.snapshot.events.some(e=>e.type==='fish-sold'&&e.unit===viewerId)&&m.snapshot.units.find(u=>u.id===viewerId)?.fishInventory?.length===0);assert.ok(Math.abs(unit.gold-beforeSale-(unit.stats.goldGenerated-generatedBeforeSale))<1e-6);assert.equal(unit.stats.goldFromFishing,fish.saleValue);assert.equal(unit.stats.fishSold,1);
    assert.equal((await (await fetch(base+'/api/fishing/catches',{headers:{Cookie:cookie}})).json()).total,1);
    assert.equal((await fetch(base+'/api/fishing/collection')).status,401);assert.notEqual((await fetch(base+'/api/fishing/collection',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({gold:999999})})).status,200);
    assert.equal(match.result().players.find(p=>p.id===viewerId).fishCaught,1);assert.equal(match.result().players.find(p=>p.id===viewerId).fishingValue,fish.saleValue);assert.equal(match.result().players.find(p=>p.id===viewerId).goldFromFishing,fish.saleValue);
  }finally{socket?.terminate();await app.close();}
});
