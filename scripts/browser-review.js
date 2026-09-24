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
  await page.getByRole('button',{name:'Criar sala privada',exact:false}).click();
  assert.deepEqual(await page.locator('[name=mode] option').allTextContents(),['Personalizado','Normal','Ranqueado']);
  await page.locator('[name=mode]').selectOption('custom');await page.locator('[name=role]').selectOption('elf');await page.locator('[name=elves]').selectOption('2');
  await page.getByRole('button',{name:'Criar sala →',exact:true}).click();
  const mode=page.locator('[data-setting=mode]');await mode.selectOption('normal');await until(()=>page.locator('[data-setting=elfSlots]').isDisabled(),'Normal preset did not lock settings');assert.equal([...app.sessions.rooms.values()][0].settings.elfSlots,5);
  await mode.selectOption('custom');await until(()=>page.locator('[data-setting=elfSlots]').isEnabled(),'Custom mode did not unlock settings');await page.locator('[data-setting=elfSlots]').selectOption('2');await until(()=>[...app.sessions.rooms.values()][0].settings.elfSlots===2,'Custom lobby size did not apply');report.matchModes=true;
  await page.getByRole('button',{name:'Marcar como pronto'}).click();
  await page.getByRole('button',{name:'Iniciar expedição →'}).click();
  await page.locator('#role-name').waitFor();
  const m=[...app.sessions.rooms.values()][0].match,u=m.units.find(u=>u.controller==='human'),base=m.map.bases[0];
  m.controllers.clear();m.state=STATES.PREP;m.time=5;
  Object.assign(u,{x:base.x+4.4,z:base.z,gold:119,wood:67});
  assert.equal(m.act(u.id,{type:'build',kind:'core',x:base.x,z:base.z}),undefined);
  const core=m.structures.find(s=>s.owner===u.id);core.progress=core.healthProgress=1;core.hp=core.maxHp;delete core.job;
  Object.assign(u,{x:base.gate.x,z:base.gate.z,gold:1000,wood:1000});assert.equal(m.act(u.id,{type:'build',kind:'wall',x:base.gate.x,z:base.gate.z}),undefined);
  const wall=m.structures.find(s=>s.kind==='wall'&&s.owner===u.id);wall.progress=wall.healthProgress=1;wall.hp=wall.maxHp;delete wall.job;
  Object.assign(u,{x:core.x+3,z:core.z});m.emit('resource',{unit:u.id,resource:'gold',amount:8,rate:490,x:core.x,z:core.z});await page.waitForTimeout(250);
  assert.doesNotMatch(await page.locator('#toast').textContent(),/490\/min/);report.noIncomeToast=true;
  u.gold=119;u.wood=67;
  await until(()=>page.locator('#objective').textContent().then(t=>t.includes('Núcleo T')),'Core and Barricade snapshot did not arrive');
  await page.locator('#core-shortcut').click();
  const upgrade=page.locator('[data-do=upgrade]');await upgrade.waitFor();
  await until(()=>upgrade.isEnabled(),'Affordable core upgrade disabled');
  await page.screenshot({path:'artifacts/review-core-affordable.png'});
  await upgrade.click();await until(()=>core.upgrading>0,'UI command did not reach server');
  await until(()=>core.tier===2,'Core did not reach tier 2');report.coreUpgrade=true;
  core.tier=3;core.upgrading=0;u.gold=u.wood=10000;wall.tier=1;
  await until(()=>upgrade.isDisabled(),'Core 4 should require Barricade 2');await until(()=>page.locator('#upgrade-reasons').textContent().then(t=>t.includes('Barricada nível 2 necessária — atual: nível 1')),'Missing Barricade requirement');await page.screenshot({path:'artifacts/review-core-barricade-gate.png'});report.coreBarricadeGate=true;
  wall.tier=2;await until(()=>upgrade.isEnabled(),'Barricade 2 did not unlock Core 4');core.tier=1;
  // Freeze simulation (not snapshots) to isolate threshold refresh from clock changes.
  const step=m.step.bind(m);m.step=()=>{};core.tier=1;core.upgrading=0;u.gold=99.99;u.wood=35;
  await until(()=>upgrade.isDisabled(),'Insufficient gold not disabled');
  await until(()=>page.locator('#upgrade-reasons').textContent().then(t=>t.includes('Ouro insuficiente')),'Missing reason');
  const time=m.time;u.gold=100;
  await until(()=>upgrade.isEnabled(),'Affordability stayed stale with same clock');
  assert.equal(m.time,time);report.sameClockUpdate=true;
  u.x+=15;await until(()=>upgrade.isDisabled(),'Distance not disabled');
  await until(()=>page.locator('#upgrade-reasons').textContent().then(t=>t.includes('Aproxime-se')),'Missing distance');
  await page.screenshot({path:'artifacts/review-core-distance.png'});u.x-=15;
  // A selected tower uses the same rules. Focused select must survive snapshots.
  core.kind='tower';core.branch='power';u.gold=89.99;u.wood=100;
  await page.locator('#branch').waitFor();await page.locator('#branch').focus();await page.locator('#branch').selectOption('frost');
  u.gold=90;await until(()=>upgrade.isEnabled(),'Focused selector blocked update');
  assert.equal(await page.locator('#branch').inputValue(),'frost');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'branch');report.focusedSelectorUpdate=true;
  await upgrade.click();await until(()=>core.upgrading>0,'Tower command failed');assert.equal(core.nextBranch,'frost');
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
  core.kind='core';core.upgrading=0;m.step=step;
  assert.deepEqual(errors,[]);report.errors=errors;
  await writeFile('artifacts/browser-review.json',JSON.stringify(report,null,2));console.log(report);
}catch(error){await page.screenshot({path:'artifacts/review-browser-failure.png'});throw error;}
finally{await browser.close();await app.close();}
