import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { createGameServer } from '../server/index.js';
import { STATES } from '../shared/config.js';

const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false});
const channel=process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined);
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader'],...(channel?{channel}:{})});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],report={};
page.on('pageerror',e=>errors.push(e.message));
const until=async(fn,label)=>{for(let i=0;i<120;i++){if(await fn())return;await new Promise(r=>setTimeout(r,50));}throw Error(label);};
await mkdir('artifacts',{recursive:true});
try{
  await page.goto('http://127.0.0.1:'+app.port);
  await page.getByText('Servidor conectado',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Explorar partidas online',exact:false}).click();await page.getByRole('button',{name:'Ranqueada · 1×5'}).waitFor();
  // The public-room browser refreshes while it is open, replacing this button.
  // Dispatching through the stable action selector avoids a flaky Playwright
  // visibility/stability race without changing the user-facing behavior.
  await page.locator('[data-do=menu]').dispatchEvent('click');
  await page.getByRole('button',{name:'Criar sala privada',exact:false}).click();
  assert.deepEqual(await page.locator('[name=mode] option').allTextContents(),['Personalizado','Normal']);
  await page.locator('[name=mode]').selectOption('custom');await page.locator('[name=role]').selectOption('elf');await page.locator('[name=elves]').selectOption('5');
  await page.getByRole('button',{name:'Criar sala →',exact:true}).click();
  const mode=page.locator('[data-setting=mode]');await mode.selectOption('normal');await until(()=>page.locator('[data-setting=elfSlots]').isDisabled(),'Normal preset did not lock settings');assert.equal([...app.sessions.rooms.values()][0].settings.elfSlots,5);
  await mode.selectOption('custom');await until(()=>page.locator('[data-setting=elfSlots]').isEnabled(),'Custom mode did not unlock settings');await page.locator('[data-setting=elfSlots]').selectOption('8');await until(()=>[...app.sessions.rooms.values()][0].settings.elfSlots===8,'Custom lobby size did not apply');report.matchModes=true;
  await page.getByRole('button',{name:'Marcar como pronto'}).click();
  await page.getByRole('button',{name:'Iniciar expedição →'}).click();
  await page.locator('#role-name').waitFor();
  await page.mouse.click(720,450);await page.waitForFunction(()=>document.pointerLockElement?.id==='world');
  const m=[...app.sessions.rooms.values()][0].match,u=m.units.find(u=>u.controller==='human'),base=m.map.bases[0];
  m.controllers.clear();m.state=STATES.PREP;m.time=5;
  Object.assign(u,{x:base.x+4.4,z:base.z,gold:119,wood:67});
  assert.equal(m.act(u.id,{type:'build',kind:'core',x:base.x,z:base.z}),undefined);
  const core=m.structures.find(s=>s.owner===u.id);core.progress=core.healthProgress=1;core.hp=core.maxHp;delete core.job;
  Object.assign(u,{x:base.gate.x,z:base.gate.z,gold:1000,wood:1000});assert.equal(m.act(u.id,{type:'build',kind:'wall',x:base.gate.x,z:base.gate.z}),undefined);
  const wall=m.structures.find(s=>s.kind==='wall'&&s.owner===u.id);wall.progress=wall.healthProgress=1;wall.hp=wall.maxHp;delete wall.job;
  // Build mode must tilt toward a usable ground point and never leave the reticle beyond range.
  await page.keyboard.press('Digit3');
  await until(()=>page.locator('#build-hint').isVisible(),'Build hint did not open');
  await until(()=>page.locator('#build-hint').textContent().then(t=>!/Fora do alcance/.test(t)),'Construction reticle remained outside Elf range');
  await page.waitForTimeout(250);
  assert.doesNotMatch(await page.locator('#build-hint').textContent(),/Fora do alcance/);
  await page.screenshot({path:'artifacts/review-build-camera.png'});
  await page.keyboard.press('Escape');report.buildCamera=true;
  // R must work without selecting an object and prioritize a damaged Barricade.
  const tree=m.trees.find(t=>t.amount>0);Object.assign(tree,{x:wall.x+1,z:wall.z});Object.assign(u,{x:wall.x,z:wall.z,wood:500});wall.hp-=50;
  await page.waitForTimeout(300);
  await page.keyboard.down('r');await until(()=>wall.hp>wall.maxHp-50,'Context R did not repair the Barricade');await page.keyboard.up('r');
  const woodBefore=u.wood;wall.hp=wall.maxHp;await page.keyboard.down('r');await until(()=>u.wood>woodBefore,'Context R did not gather the nearby tree');await page.keyboard.up('r');report.contextWork=true;
  await page.keyboard.down('Shift');await page.keyboard.down('w');await until(()=>m.snapshot(u.id).units.find(a=>a.id===u.id)?.sprinting===true,'Elf sprint state did not reach the renderer');await page.waitForTimeout(220);await page.screenshot({path:'artifacts/review-elf-sprint.png'});await page.keyboard.up('w');await page.keyboard.up('Shift');report.elfSprintVisual=true;
  Object.assign(u,{x:core.x+3,z:core.z});m.emit('resource',{unit:u.id,resource:'gold',amount:8,rate:490,x:core.x,z:core.z});await page.waitForTimeout(250);
  assert.doesNotMatch(await page.locator('#toast').textContent(),/490\/min/);report.noIncomeToast=true;
  u.gold=119;u.wood=67;
  await until(()=>page.locator('#objective').textContent().then(t=>t.includes('Núcleo T')),'Core and Barricade snapshot did not arrive');
  await page.keyboard.press('KeyN');
  const upgrade=page.locator('[data-do=upgrade]');await upgrade.waitFor();
  const demolish=page.locator('[data-do=demolish]');await demolish.waitFor();let demolitionPrompt='';page.once('dialog',async dialog=>{demolitionPrompt=dialog.message();await dialog.dismiss();});await demolish.dispatchEvent('click');assert.match(demolitionPrompt,/75|receberá|Demolir/);assert.ok(core.hp>0);report.demolitionConfirmation=true;
  let deletePrompt='';page.once('dialog',async dialog=>{deletePrompt=dialog.message();await dialog.dismiss();});await page.keyboard.press('Delete');assert.match(deletePrompt,/receberá|Demolir/);assert.ok(core.hp>0);report.demolitionHotkey=true;
  await until(()=>upgrade.isEnabled(),'Affordable core upgrade disabled');
  await page.screenshot({path:'artifacts/review-core-affordable.png'});
  await page.keyboard.press('KeyQ');await until(()=>core.upgrading>0,'Q upgrade command did not reach server');
  await until(()=>core.tier===2,'Core did not reach tier 2');report.coreUpgrade=true;
  core.tier=3;core.upgrading=0;u.gold=u.wood=10000;wall.tier=1;
  await until(()=>upgrade.isDisabled(),'Core 4 should require Barricade 2');await until(()=>page.locator('#upgrade-reasons').textContent().then(t=>t.includes('Barricada nível 2 necessária — atual: nível 1')),'Missing Barricade requirement');await page.screenshot({path:'artifacts/review-core-barricade-gate.png'});report.coreBarricadeGate=true;
  wall.tier=2;await until(()=>upgrade.isEnabled(),'Barricade 2 did not unlock Core 4');core.tier=1;
  // Freeze simulation (not snapshots) to isolate threshold refresh from clock changes.
  const step=m.step.bind(m);m.step=()=>{};core.tier=1;core.upgrading=0;u.gold=99.99;u.wood=35;
  await until(()=>upgrade.isDisabled(),'Insufficient gold not disabled');
  await until(()=>page.locator('.resource-missing .resource-gold').count().then(n=>n>0),'Missing red insufficient-gold icon');
  const time=m.time;u.gold=100;
  await until(()=>upgrade.isEnabled(),'Affordability stayed stale with same clock');
  assert.equal(m.time,time);report.sameClockUpdate=true;
  u.x+=15;await until(()=>upgrade.isDisabled(),'Distance not disabled');
  await until(()=>page.locator('#upgrade-reasons').textContent().then(t=>t.includes('Aproxime-se')),'Missing distance');
  await page.screenshot({path:'artifacts/review-core-distance.png'});u.x-=15;
  // Tower path and committed-upgrade policy are covered authoritatively in the
  // rules suite. The former browser check changed a selected Core into a Tower,
  // an impossible gameplay transition that made this UI flow nondeterministic.
  m.step=step;core.tier=1;core.upgrading=0;core.legendary=false;Object.assign(u,{x:core.x+2,z:core.z,gold:10000,wood:10000});
  // Upgrade All is exercised against real trained Wisps in progression.test.js.
  // Injecting client-invisible entities here tested snapshot timing rather than
  // the command and made this end-to-end review flaky under Linux CI.
  core.tier=10;core.legendary=true;await until(()=>page.locator('.selection-heading h3').textContent().then(t=>t.includes('Núcleo Lendário')),'Legendary core heading missing');await page.screenshot({path:'artifacts/review-legendary-core.png'});report.legendaryIdentity=true;
  core.tier=5;core.legendary=false;u.elfSpecialization=null;await page.keyboard.press('KeyN');
  await page.locator('[data-do=choose-specialization]').first().waitFor();assert.equal(await page.locator('[data-do=choose-specialization]').count(),3);
  await page.keyboard.press('Digit1');await until(()=>u.elfSpecialization==='industrial','Keyboard specialization choice did not reach server');
  await until(()=>page.locator('[data-kind=refinery]').count().then(n=>n===1),'Industrial signature building missing from hotbar');assert.equal(await page.locator('[data-kind=bastion]').count(),0);
  assert.equal(await page.locator('.special-resource').count(),3);await page.screenshot({path:'artifacts/review-elf-specialization.png'});report.elfSpecialization=true;
  core.tier=8;u.specialResources.ancientWood=30;await until(()=>page.locator('[data-do=choose-technology]').count().then(n=>n===3),'Technology milestone did not render three cards');
  await page.screenshot({path:'artifacts/review-elf-technology.png'});await page.keyboard.press('Digit1');await until(()=>u.elfTechCards.includes('efficient-production'),'Keyboard technology choice did not reach server');report.elfTechnology=true;
  const localNode=m.specialNodes.find(node=>node.baseId===base.id);assert.ok(localNode,'Clearing has no local special resource');Object.assign(u,{x:localNode.x,z:localNode.z});
  await until(()=>page.locator(`.resource-node-label[data-id="${localNode.id}"]`).count().then(n=>n===1),'Local special resource has no world label');
  await page.screenshot({path:'artifacts/review-clearing-resource.png'});report.clearingResource=true;
  // Central icon shapes must match HUD and menu at both desktop and narrow widths.
  for(const kind of ['gold','wood']){
    const shapes=await page.locator('.resource-'+kind+' path').evaluateAll(nodes=>[...new Set(nodes.map(n=>n.getAttribute('d')))]);
    assert.equal(shapes.length,1);
  }
  for(const width of [1440,768]){
    await page.setViewportSize({width,height:900});
    await page.screenshot({path:'artifacts/review-icons-'+width+'.png'});
    const overflow=await page.locator('#selection-panel').evaluate(el=>el.scrollWidth>el.clientWidth+1);
    assert.equal(overflow,false,'Selection panel horizontal overflow at '+width);
  }
  report.unifiedIcons=true;
  core.kind='core';core.upgrading=0;
  assert.deepEqual(errors,[]);report.errors=errors;
  await writeFile('artifacts/browser-review.json',JSON.stringify(report,null,2));console.log(report);
}catch(error){await page.screenshot({path:'artifacts/review-browser-failure.png'});throw error;}
finally{await browser.close();await app.close();}
