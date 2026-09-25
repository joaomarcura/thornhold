import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { PerspectiveCamera,Vector3 } from 'three';
import { writeFile } from 'node:fs/promises';
import { createGameServer } from '../server/index.js';
import { STATES, distance } from '../shared/config.js';

const browser=await chromium.connectOverCDP(process.argv[2]);
const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false}),errors=[],report={};
page.on('pageerror',e=>errors.push(e.message));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,message,timeout=9000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await sleep(70);}throw Error(message);}
try{
  await page.goto(`http://127.0.0.1:${app.port}`);await page.getByText('Servidor conectado',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Jogar contra bots',exact:false}).click();await page.locator('[name=elves]').selectOption('5');await page.getByRole('button',{name:'Criar partida local →'}).click();
  await page.getByRole('button',{name:'Marcar como pronto'}).click();await page.getByRole('button',{name:'Iniciar expedição →'}).click();await page.locator('#role-name').waitFor();
  // Only this isolated server has fixture resources and positions. Every interaction below uses real UI commands.
  const m=[...app.sessions.rooms.values()][0].match,u=m.unit('e0'),base=m.map.bases[0];m.controllers.clear();m.time=300;m.state=STATES.ACTIVE;
  Object.assign(u,{x:base.x+4.4,z:base.z,gold:20000,wood:2000});m.act(u.id,{type:'build',kind:'core',x:base.x,z:base.z});
  const core=m.structures[0];await until(()=>core.progress===1,'Núcleo concluído');
  await page.keyboard.press('KeyN');await page.locator('[data-do=train-wisp]').waitFor();await page.keyboard.press('KeyT');await until(()=>m.wisps.length===1,'T forma Wisp');
  await page.locator('[data-do=cancel-job]').click();await until(()=>!m.wisps[0].alive,'Formação cancelada');assert.ok(m.events.some(e=>e.type==='cancel'&&e.gold>0));report.trainingCancelledWithRefund=true;
  await until(()=>page.locator('[data-do=train-wisp]').isEnabled(),'Formação disponível');await page.keyboard.press('KeyT');await until(()=>m.wisps.length===2,'Novo Wisp');const w=m.wisps[1];
  await page.keyboard.press('Escape');await page.locator('#selection-panel').waitFor({state:'hidden'});assert.equal(w.alive,true);assert.equal(await page.getByRole('dialog').count(),0);report.escapeOnlyClosesContext=true;
  await until(()=>w.readyAt<=m.time,'Wisp pronto');await page.keyboard.press('KeyE');await page.locator('[data-do=train-wisp]').waitFor();report.contextualInteraction=true;
  await page.locator(`[data-do=select-wisp][data-id=${w.id}]`).click();await page.keyboard.press('KeyQ');await until(()=>w.upgradingUntil>m.time,'Q evolui Wisp');
  assert.equal(await page.locator('[data-do=cancel-job]').count(),0);await until(()=>w.level===2,'Melhoria comprometida não concluiu');report.upgradeCommitted=true;
  assert.equal(await page.locator('[data-do=relocate-wisp],.tree-choice').count(),0);report.wispTreeAssignmentRemoved=true;
  await page.locator('[data-do=locate]').click();await page.locator('#return-camera').waitFor();await sleep(1100);
  const label=page.locator(`.wisp-label[data-id=${w.id}]`);await label.waitFor();assert.match(await label.textContent(),/\+/);await page.screenshot({path:'artifacts/hud-wisp-visible.png'});report.wispWorldMarker=true;await page.locator('[data-do=deselect]').click();await page.locator('#selection-panel').waitFor({state:'hidden'});await label.click();await page.locator('[data-do=locate]').waitFor();report.wispMarkerClickable=true;
  await page.keyboard.press('KeyC');await page.keyboard.press('KeyN');await page.locator('[data-do=train-wisp]').focus();await sleep(1200);
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.do),'train-wisp');report.focusSurvivesLiveUpdates=true;
  await page.keyboard.press('Tab');assert.notEqual(await page.evaluate(()=>document.activeElement.dataset.do),'train-wisp');report.keyboardNavigation=true;
  await page.keyboard.press('Escape');await page.keyboard.press('Digit3');await page.locator('#build-hint').waitFor();await page.mouse.click(800,400,{button:'right'});await page.locator('#build-hint').waitFor({state:'hidden'});assert.equal(await page.getByRole('dialog').count(),0);report.rightClickCancelsBlueprint=true;
  // Releasing a repeating action must remain stopped until a fresh key press.
  const tree=m.trees.find(t=>t.amount>0&&!m.wisps.some(w=>w.alive&&w.treeId===t.id)&&distance(t,base)<13);Object.assign(u,{x:tree.x+1,z:tree.z});await sleep(350);
  const wood=u.wood;await page.keyboard.down('KeyE');await until(()=>u.wood>wood+5,'Coleta contínua');await page.mouse.click(800,400,{button:'right'});const stock=tree.amount;
  await sleep(900);assert.equal(tree.amount,stock);await page.keyboard.up('KeyE');report.cancelStopsHeldAction=true;
  Object.assign(u,{x:base.x+4.4,z:base.z});await sleep(350);await page.keyboard.press('KeyN');
  await page.keyboard.press('Escape');
  const points=[];for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++){const p={x:base.x+x*2.2,z:base.z+z*2.2};if(!m.placement(u,'tower',p.x,p.z))points.push(p);}
  assert.ok(points.length);const point=points[0],camera=new PerspectiveCamera(52,1440/900,.1,400),target=new Vector3(u.x,1.25,u.z);
  camera.position.copy(target).add(new Vector3(0,Math.sin(.58)*13,Math.cos(.58)*13));camera.lookAt(target);camera.updateMatrixWorld();const pixel=new Vector3(point.x,.02,point.z).project(camera);
  await page.keyboard.press('Digit3');await page.mouse.move((pixel.x*.5+.5)*1440,(-pixel.y*.5+.5)*900);await sleep(250);await page.keyboard.down('Shift');await page.keyboard.press('Enter');await page.keyboard.up('Shift');
  await until(()=>m.structures.some(s=>s.kind==='tower'),'Construção repetível');await page.locator('#build-hint').waitFor();await page.keyboard.press('Escape');await page.locator('#build-hint').waitFor({state:'hidden'});report.shiftKeepsBlueprint=true;
  await page.keyboard.press('KeyN');
  await page.setViewportSize({width:1280,height:720});await sleep(400);
  const bounds=await page.locator('#selection-panel').boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<=720);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'artifacts/hud-1280.png'});report.layout1280=true;
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');await page.locator('#hud-hints').uncheck();await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.locator('#control-hints').waitFor({state:'hidden'});
  await page.keyboard.press('Escape');await page.locator('#hud-hints').check();await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.locator('#control-hints').waitFor();report.optionalHints=true;
  assert.deepEqual(errors,[]);report.errors=errors;await writeFile('artifacts/browser-hud.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await page.screenshot({path:'artifacts/hud-failure.png'});throw error;}
finally{await context.close();await browser.close();await app.close();}
