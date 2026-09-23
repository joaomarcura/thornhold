import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createGameServer } from '../server/index.js';
import { STATES, distance } from '../shared/config.js';

const browser=await chromium.connectOverCDP(process.argv[2]),app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false});
const contexts=[],pages=[],errors=[],report={};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,message){for(let i=0;i<70;i++){if(await fn())return;await sleep(80);}throw Error(message);}
try{
  for(let i=0;i<3;i++){const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();contexts.push(context);pages.push(page);page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${app.port}`);await page.getByText('Servidor conectado',{exact:false}).waitFor();}
  const [troll,elf,ally]=pages;
  await troll.getByLabel('Seu nome').fill('Caçador');await troll.getByRole('button',{name:'Criar sala privada',exact:false}).click();await troll.locator('[name=role]').selectOption('troll');await troll.locator('[name=elves]').selectOption('2');await troll.getByRole('button',{name:'Criar sala →',exact:true}).click();await troll.locator('.invite b').waitFor();
  const code=await troll.locator('.invite b').textContent();
  for(const [i,p]of [elf,ally].entries()){await p.getByLabel('Seu nome').fill(i?'Aliado':'Guardião');await p.getByRole('button',{name:'Entrar com código',exact:false}).click();await p.locator('[name=code]').fill(code);await p.getByRole('button',{name:'Entrar na sala →'}).click();await p.locator(`[data-do=slot][data-action=claim][data-slot=e${i}]`).click();}
  for(const p of pages)await p.getByRole('button',{name:'Marcar como pronto'}).click();await troll.getByRole('button',{name:'Iniciar expedição →'}).click();for(const p of pages)await p.locator('#role-name').waitFor();
  const m=[...app.sessions.rooms.values()][0].match,u=m.unit('t0');
  await troll.locator('#status-effects').getByText('Selo de preparação',{exact:false}).waitFor();report.preparationTimer=true;
  await troll.bringToFront();await troll.mouse.click(700,440);await troll.waitForFunction(()=>document.pointerLockElement?.id==='world');assert.equal(await troll.locator('#crosshair').isVisible(),true);
  const yaw=u.yaw;await troll.mouse.move(850,490,{steps:5});await until(()=>u.yaw<yaw-.05,'Mover o mouse à direita deve girar a mira à direita');report.mouseLook=true;
  await troll.screenshot({path:'artifacts/mouse-look.png'});
  await troll.mouse.click(720,450,{button:'middle'});await troll.waitForFunction(()=>document.pointerLockElement===null);await troll.locator('#crosshair').waitFor({state:'hidden'});await troll.locator('#cursor-mode').getByText('Cursor livre',{exact:false}).waitFor();report.middleCursor=true;
  await troll.keyboard.press('KeyM');await troll.locator('#tactical-panel').waitFor();const map=await troll.locator('#tactical-map').boundingBox();await troll.mouse.click(map.x+map.width*.3,map.y+map.height*.4);await troll.locator('#return-camera').waitFor();
  const old={x:u.x,z:u.z};await troll.keyboard.down('KeyD');await sleep(300);await troll.keyboard.up('KeyD');assert.equal(distance(old,u),0);await troll.keyboard.press('KeyC');assert.equal(await troll.locator('#return-camera').isVisible(),false);await troll.keyboard.press('KeyM');report.mapInspection=true;
  // Controlled combat fixtures run through the real server snapshot and UI, never DOM mocks.
  m.time=80;m.state=STATES.ACTIVE;u.hp=1300;u.lastHit=m.time;u.slowUntil=m.time+4;
  await troll.locator('.effect').filter({hasText:'Lentidão'}).waitFor();const initial=parseFloat(await troll.locator('.effect').filter({hasText:'Lentidão'}).locator('b').textContent());await sleep(800);const later=parseFloat(await troll.locator('.effect').filter({hasText:'Lentidão'}).locator('b').textContent());assert.ok(later<initial);await troll.screenshot({path:'artifacts/status-effects.png'});report.effectCountdown=true;
  m.structures.push({id:'fixture-tower',kind:'tower',owner:'e0',x:u.x+5,z:u.z,tier:1,branch:'frost',hp:260,maxHp:260,progress:1,healthProgress:1,lastHit:-100,lastShot:m.time,bounty:80});
  await troll.keyboard.press('KeyF');await elf.locator('.effect').filter({hasText:'torre desativada'}).waitFor();report.towerDisabledTimer=true;
  await elf.bringToFront();await elf.keyboard.press('KeyM');const elfMap=await elf.locator('#tactical-map').boundingBox();await elf.keyboard.down('Shift');await elf.mouse.click(elfMap.x+elfMap.width*.4,elfMap.y+elfMap.height*.45);await elf.keyboard.up('Shift');await until(()=>m.pings.some(p=>p.unit==='e0'&&p.kind==='danger'),'Ping não chegou ao servidor');await ally.locator('#toast').filter({hasText:'Perigo aqui!'}).waitFor();assert.equal(m.snapshot('t0').pings.length,0);report.teamPing=true;
  const friend=m.unit('e1');m.damage(friend,5,u,'melee');await elf.locator('[data-do=focus-alert]').filter({hasText:'Aliado'}).waitFor();await elf.keyboard.press('KeyM');await elf.locator('[data-do=focus-alert]').filter({hasText:'Aliado'}).click();await elf.locator('#return-camera').waitFor();await elf.screenshot({path:'artifacts/ally-alert.png'});report.allyAttackInspection=true;
  await elf.keyboard.press('KeyM');await elf.screenshot({path:'artifacts/tactical-map.png'});assert.match(await elf.locator('#control-hints').textContent(),/E.*coletar.*R.*reparar.*M.*mapa/);report.noviceHotkeys=true;
  await troll.bringToFront();await troll.mouse.click(720,450,{button:'middle'});await troll.waitForFunction(()=>document.pointerLockElement?.id==='world');await troll.keyboard.press('KeyB');await troll.locator('#shop').waitFor();await troll.waitForFunction(()=>document.pointerLockElement===null);report.shopReleasesCursor=true;
  await troll.keyboard.press('KeyB');await troll.mouse.click(720,450,{button:'middle'});await troll.waitForFunction(()=>document.pointerLockElement?.id==='world');await troll.keyboard.press('KeyH');await troll.getByRole('dialog',{name:'Como jogar'}).waitFor();await troll.waitForFunction(()=>document.pointerLockElement===null);report.helpReleasesCursor=true;
  assert.deepEqual(errors,[]);report.errors=errors;await writeFile('artifacts/browser-controls.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){for(const[i,p]of pages.entries())await p.screenshot({path:`artifacts/controls-failure-${i}.png`});throw error;}
finally{for(const context of contexts)await context.close();await browser.close();await app.close();}
