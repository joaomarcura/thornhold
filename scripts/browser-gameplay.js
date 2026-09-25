import { chromium } from '@playwright/test';
import { PerspectiveCamera,Vector3 } from 'three';
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { createGameServer } from '../server/index.js';
import { pathfind } from '../shared/map.js';
import { distance } from '../shared/config.js';

const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false}),channel=process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined);
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader'],...(channel?{channel}:{})}),context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await mkdir('artifacts',{recursive:true});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,message,timeout=7000){const end=Date.now()+timeout;while(Date.now()<end){if(fn())return;await sleep(50);}throw new Error(message);}
try{
  await page.goto(`http://127.0.0.1:${app.port}`);await page.getByText('Servidor conectado',{exact:false}).waitFor();await page.getByRole('button',{name:'Jogar contra bots',exact:false}).click();await page.locator('[name=elves]').selectOption('5');await page.getByRole('button',{name:'Criar partida local →'}).click();
  await page.locator('[data-setting=seed]').fill('BROWSER-PLAY');await page.locator('[data-setting=seed]').blur();await page.locator('[data-setting=preparation]').selectOption('75');await page.getByRole('button',{name:'Marcar como pronto'}).click();await page.getByRole('button',{name:'Iniciar expedição →'}).click();await page.locator('#role-name').filter({hasText:'GUARDIÃO'}).waitFor();
  const room=[...app.sessions.rooms.values()][0],m=room.match,u=m.unit('e0'),base=m.map.bases[0];
  async function moveTo(target){
    if(await page.locator('#build-hint').isVisible())await page.keyboard.press('Escape');if(await page.locator('#selection-panel').isVisible())await page.locator('[data-do=deselect]').click();if(await page.getByRole('button',{name:'Continuar',exact:true}).isVisible())await page.getByRole('button',{name:'Continuar',exact:true}).click();
    const route=pathfind(m.map,u,target,m.blockedCells('elf'));assert.ok(route.length||distance(u,target)<1,'Rota disponível');let active=[];
    for(const p of route){const end=Date.now()+3000;while(distance(u,p)>.4&&Date.now()<end){const dx=p.x-u.x,dz=p.z-u.z,next=[];if(Math.abs(dx)>.22)next.push(dx>0?'KeyD':'KeyA');if(Math.abs(dz)>.22)next.push(dz>0?'KeyS':'KeyW');for(const key of active)if(!next.includes(key))await page.keyboard.up(key);for(const key of next)if(!active.includes(key))await page.keyboard.down(key);active=next;await sleep(65);}if(distance(u,p)>1)throw new Error(`Movimento bloqueado em ${JSON.stringify(p)}; unidade ${u.x},${u.z}`);}
    for(const key of active)await page.keyboard.up(key);await sleep(300);
  }
  function screen(p){const camera=new PerspectiveCamera(52,1440/900,.1,400),target=new Vector3(u.x,1.25,u.z);camera.position.copy(target).add(new Vector3(0,Math.sin(.58)*13,Math.cos(.58)*13));camera.lookAt(target);camera.updateMatrixWorld();const v=new Vector3(p.x,.02,p.z).project(camera);return {x:(v.x*.5+.5)*1440,y:(-.5*v.y+.5)*900};}
  async function place(kind,p){await page.locator(`[data-do=build][data-kind=${kind}]`).click();const pixel=screen(p);await page.mouse.move(pixel.x,pixel.y);await sleep(200);const hint=await page.locator('#build-hint').textContent();assert.ok(hint.includes('Clique para construir'),hint);await page.keyboard.press('Enter');await until(()=>m.structures.some(s=>s.kind===kind),'Construção não chegou ao servidor: '+kind);await page.locator('#build-hint').waitFor({state:'hidden'});const s=m.structures.find(s=>s.kind===kind);await until(()=>s.progress===1,'Obra não foi concluída');if(await page.locator('#selection-panel').isVisible())await page.locator('[data-do=deselect]').click();return s;}
  await moveTo({x:base.x+4.4,z:base.z});const core=await place('core',base);assert.ok(u.gold<150);
  const tree=m.trees.find(t=>distance(t,base)<12);await moveTo({x:tree.x+2.2,z:tree.z});
  const wood=u.wood;for(let i=0;i<6;i++){await page.keyboard.press('KeyR');await sleep(700);}assert.ok(u.wood>wood,'Coleta pela tecla R');
  const inward={x:base.x-base.gate.x,z:base.z-base.gate.z},n=Math.hypot(inward.x,inward.z);await moveTo({x:base.gate.x+inward.x/n*4.4,z:base.gate.z+inward.z/n*4.4});const wall=await place('wall',base.gate);assert.equal(wall.hp,wall.maxHp);
  await until(()=>u.gold>=70,'Renda do Núcleo não financiou a primeira Torre após o selo',60000);
  const candidates=[];for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++){const p={x:base.x+x*2.2,z:base.z+z*2.2};if(!m.placement(u,'tower',p.x,p.z))candidates.push(p);}const point=candidates.sort((a,b)=>distance(a,base.gate)-distance(b,base.gate))[0];assert.ok(point,'Terreno válido para torre');const tower=await place('tower',point);
  await page.screenshot({path:'artifacts/constructed-base.png'});
  assert.equal(core.progress,1);assert.equal(tower.progress,1);assert.ok(m.stats.produced>0);assert.deepEqual(errors,[]);
  const report={standardLobby:m.units.filter(x=>x.role==='elf').length===5,physicalMovement:true,coreBuiltThroughUI:true,gatheredThroughKeyboard:true,wallBuiltAtSingleGate:true,towerBuiltThroughUI:true,passiveEconomy:true,gold:u.gold,wood:u.wood,errors};await writeFile('artifacts/browser-gameplay.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await page.screenshot({path:'artifacts/gameplay-failure.png'});throw error;}
finally{await context.close();await browser.close();await app.close();}
