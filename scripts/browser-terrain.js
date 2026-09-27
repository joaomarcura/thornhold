import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createGameServer } from '../server/index.js';
import { pathfind, heightAt } from '../shared/map.js';
import { distance } from '../shared/config.js';

// Isolated server/browser. Test-only instrumentation is injected into the response, never shipped.
const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false});
const browser=process.argv[2]?await chromium.connectOverCDP(process.argv[2]):await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-webgl','--use-angle=swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[],report={ramps:[]};
page.on('pageerror',e=>errors.push(e.message));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,message,timeout=8000){const end=Date.now()+timeout;while(Date.now()<end){if(fn())return;await sleep(50);}throw Error(message);}
try{
  await page.route('**/client/main.js',async route=>route.fulfill({contentType:'text/javascript',body:await readFile('client/main.js','utf8')+'\nwindow.__terrainTest={world,getSnapshot:()=>snapshot,getTactical:()=>tactical};'}));
  await page.goto(`http://127.0.0.1:${app.port}`);await page.getByText('Servidor conectado',{exact:false}).waitFor();await page.screenshot({path:'artifacts/terrain-menu.png'});
  await page.getByRole('button',{name:'Jogar contra bots',exact:false}).click();await page.locator('[name=elves]').selectOption('1');await page.getByRole('button',{name:'Criar partida local →'}).click();
  await page.locator('[data-setting=seed]').fill('TERRAIN-BROWSER');await page.locator('[data-setting=seed]').blur();await page.locator('[data-setting=preparation]').selectOption('75');await page.getByRole('button',{name:'Marcar como pronto'}).click();await page.getByRole('button',{name:'Iniciar expedição →'}).click();await page.locator('#role-name').filter({hasText:'GUARDIÃO'}).waitFor();
  const m=[...app.sessions.rooms.values()][0].match,u=m.unit('e0');m.controllers.clear();m.preparation=3600;
  report.hiddenRefugesAtSpawn=await page.evaluate(()=>window.__terrainTest.getTactical().seenBases.size===0);assert.ok(report.hiddenRefugesAtSpawn);
  await page.screenshot({path:'artifacts/terrain-spawn.png'});
  async function walk(target){
    await page.evaluate(()=>{window.__terrainTest.world.yaw=Math.PI;});await sleep(100);
    const route=pathfind(m.map,u,target,m.blockedCells('elf'));assert.ok(route.length||distance(u,target)<1);let keys=[];
    for(const p of route){const deadline=Date.now()+3000;while(distance(u,p)>.32&&Date.now()<deadline){const next=[],dx=p.x-u.x,dz=p.z-u.z;if(Math.abs(dx)>.16)next.push(dx>0?'KeyD':'KeyA');if(Math.abs(dz)>.16)next.push(dz>0?'KeyS':'KeyW');for(const key of keys)if(!next.includes(key))await page.keyboard.up(key);for(const key of next)if(!keys.includes(key))await page.keyboard.down(key);keys=next;await sleep(40);}assert.ok(distance(u,p)<.7,`blocked ${u.x},${u.z} -> ${p.x},${p.z}`);}
    for(const key of keys)await page.keyboard.up(key);await sleep(400);
    const ground=await page.evaluate(id=>{const w=window.__terrainTest.world,g=w.entities.get(id);return {x:g.position.x,y:g.position.y,z:g.position.z};},u.id);
    assert.ok(Math.abs(ground.y-heightAt(m.map,ground.x,ground.z))<.002,'Renderer shares authoritative height');
  }
  async function build(kind,p){
    const slot=['core','wall','tower','mine','workshop'].indexOf(kind)+1;assert.ok(slot>0);
    await page.evaluate(({p,u})=>{window.__terrainTest.world.yaw=Math.atan2(-(p.x-u.x),p.z-u.z);},{p,u:{x:u.x,z:u.z}});await page.keyboard.press(`Digit${slot}`);await sleep(350);
    assert.match(await page.locator('#build-hint').textContent(),/Clique para construir/);await page.keyboard.press('Enter');
    await until(()=>m.structures.some(s=>s.kind===kind&&s.progress===1),'Build failed '+kind);if(await page.locator('#selection-panel').isVisible())await page.keyboard.press('Escape');
    const s=m.structures.find(s=>s.kind===kind);assert.ok(s);if(kind==='wall')assert.ok(distance(s,p)<.1);return s;
  }
  for(const base of [m.map.bases[1],m.map.bases[2]]){
    m.structures=[];m.wisps=[];u.baseId=null;u.gold=10000;u.wood=10000;Object.assign(u,base.ramp.to);await sleep(650);
    const before=heightAt(m.map,u.x,u.z);await walk({x:base.x+4.4,z:base.z});await build('core',base);
    const dx=base.x-base.gate.x,dz=base.z-base.gate.z,d=Math.hypot(dx,dz);
    await walk({x:base.gate.x+dx/d*4.4,z:base.gate.z+dz/d*4.4});await build('wall',base.gate);
    const candidates=[];for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++){const p={x:base.x+x*m.map.cell,z:base.z+z*m.map.cell};if(!m.placement(u,'tower',p.x,p.z))candidates.push(p);}assert.ok(candidates.length);await build('tower',candidates.sort((a,b)=>distance(a,u)-distance(b,u))[0]);
    report.ramps.push({base:base.name,from:before,to:base.height,walked:true,core:true,wall:true,tower:true});
    await page.screenshot({path:`artifacts/terrain-${base.height>0?'plateau':'lowland'}.png`});
    await walk(base.ramp.to);assert.ok(Math.abs(heightAt(m.map,u.x,u.z)-before)<.2);
  }
  await page.keyboard.press('KeyM');await sleep(200);await page.screenshot({path:'artifacts/terrain-explored-map.png'});await page.keyboard.press('KeyM');
  // A labelled diagnostic overview, separate from player-facing fog and camera.
  report.geometry=await page.evaluate(async()=>{
    const {heightAt}=await import('/shared/map.js'),T=await import('three'),w=window.__terrainTest.world;let maxError=0;
    for(const b of w.map.bases){for(const p of [b,b.gate,b.ramp.to]){const r=new T.Raycaster(new T.Vector3(p.x,100,p.z),new T.Vector3(0,-1,0));const hit=r.intersectObject(w.ground)[0];maxError=Math.max(maxError,Math.abs(hit.point.y-heightAt(w.map,p.x,p.z)));}}
    w.snapshot=null;w.isMenu=false;w.scene.fog.density=.002;document.querySelector('#hud').hidden=true;document.querySelector('#labels').hidden=true;
    const mid=(w.map.size-1)*w.map.cell/2;w.camera.position.set(mid,265,mid+110);w.camera.lookAt(mid,0,mid);w.camera.updateMatrixWorld();w.renderer.render(w.scene,w.camera);
    return {maxRaycastHeightError:maxError,triangles:w.ground.geometry.index.count/3,refuges:w.map.bases.length};
  });
  assert.ok(report.geometry.maxRaycastHeightError<.0001);await page.screenshot({path:'artifacts/terrain-overview.png'});
  report.errors=errors;assert.deepEqual(errors,[]);await writeFile('artifacts/browser-terrain.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(e){await page.screenshot({path:'artifacts/terrain-browser-failure.png'});throw e;}
finally{await context.close();await browser.close();await app.close();}
