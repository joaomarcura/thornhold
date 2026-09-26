import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { createGameServer } from '../server/index.js';
import { BALANCE as B,STATES } from '../shared/config.js';
import { DEFAULT_BINDINGS } from '../client/preferences.js';

const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false,devMode:true});
const channel=process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined);
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader'],...(channel?{channel}:{})});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],report={};
page.on('pageerror',error=>errors.push(error.message));
const until=async(fn,label)=>{for(let i=0;i<120;i++){if(await fn())return;await page.waitForTimeout(50);}throw Error(label);};
await mkdir('artifacts',{recursive:true});
try{
  await page.goto(`http://127.0.0.1:${app.port}`);await page.getByText('Servidor conectado',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Jogar contra bots',exact:false}).click();await page.locator('[name=role]').selectOption('troll');await page.locator('[name=elves]').selectOption('5');
  await page.getByRole('button',{name:'Criar partida local →'}).click();await page.getByRole('button',{name:'Marcar como pronto'}).click();await page.getByRole('button',{name:'Iniciar expedição →'}).click();await page.locator('#role-name').waitFor();
  const room=[...app.sessions.rooms.values()][0],m=room.match,t=m.units.find(u=>u.role==='troll');room.state=m.state=STATES.ACTIVE;m.time=60;Object.assign(t,{...m.map.trollSpawn,hp:t.maxHp*.3,lastHit:50});
  await page.mouse.click(720,450);await page.waitForFunction(()=>document.pointerLockElement?.id==='world');
  await page.mouse.click(720,450,{button:'middle'});assert.equal(await page.evaluate(()=>document.pointerLockElement?.id),'world');
  await page.keyboard.press(DEFAULT_BINDINGS.shop);await page.locator('#shop').waitFor();assert.equal(await page.evaluate(()=>document.pointerLockElement?.id),'world');
  const focusedBefore=await page.evaluate(()=>document.activeElement?.dataset?.do||'');await page.keyboard.press('ArrowDown');const focusedAfter=await page.evaluate(()=>document.activeElement?.dataset?.do||'');assert.notEqual(focusedAfter,focusedBefore);await page.keyboard.press(DEFAULT_BINDINGS.shop);
  await page.keyboard.press('KeyH');await page.getByRole('dialog',{name:'Como jogar'}).waitFor();assert.equal(await page.evaluate(()=>document.pointerLockElement?.id),'world');await page.keyboard.press('KeyH');report.permanentAimAndKeyboardShop=true;
  await until(()=>page.locator('#objective').textContent().then(text=>text.includes('Santuário')),'Sanctuary guidance did not reach HUD');
  const effects=page.locator('#status-effects');await until(()=>effects.textContent().then(text=>text.includes('Santuário ancestral')),'Sanctuary effect did not reach HUD');const before=t.hp;await page.waitForTimeout(350);assert.ok(t.hp>before+t.maxHp*B.troll.sanctuaryRegenRate*.2,'Sanctuary did not heal through live server ticks');
  await page.screenshot({path:'artifacts/sanctuary-ui.png'});report.visibleGuidance=true;report.activeHealing=true;
  Object.assign(t,{x:m.map.trollSpawn.x+B.troll.sanctuaryRadius+4,z:m.map.trollSpawn.z,lastHit:m.time-10});await until(()=>effects.textContent().then(text=>!text.includes('Santuário ancestral')),'Sanctuary effect remained outside its radius');report.radiusExit=true;
  m.time=B.idlePressureAge+60;t.lastAttack=0;t.lastHit=m.time;const idleHp=t.hp;await page.waitForTimeout(350);assert.ok(t.hp>=idleHp,'Idle Troll lost health without enemy damage');assert.ok(!(await effects.textContent()).includes('Fome'),'Removed hunger effect returned to HUD');report.noIdleDamage=true;
  assert.deepEqual(errors,[]);report.errors=errors;await writeFile('artifacts/browser-sanctuary.json',JSON.stringify(report,null,2));console.log(report);
}catch(error){await page.screenshot({path:'artifacts/sanctuary-browser-failure.png'});throw error;}
finally{await browser.close();await app.close();}
