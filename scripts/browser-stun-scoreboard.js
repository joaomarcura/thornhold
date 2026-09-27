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
const until=async(fn,label,tries=160)=>{for(let i=0;i<tries;i++){if(await fn())return;await new Promise(r=>setTimeout(r,50));}throw Error(label);};
await mkdir('artifacts',{recursive:true});
try{
  await page.goto('http://127.0.0.1:'+app.port);await page.getByText('Servidor conectado',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Criar sala privada',exact:false}).click();
  await page.locator('[name=mode]').selectOption('custom');await page.locator('[name=role]').selectOption('elf');await page.locator('[name=elves]').selectOption('2');
  await page.getByRole('button',{name:'Criar sala →',exact:true}).click();
  await page.getByRole('button',{name:'Marcar como pronto'}).click();await page.getByRole('button',{name:'Iniciar expedição →'}).click();
  await page.locator('#role-name').waitFor();
  const room=[...app.sessions.rooms.values()][0],m=room.match,u=m.units.find(a=>a.controller==='human'),troll=m.units.find(a=>a.role==='troll'),base=m.map.bases[0];
  m.controllers.clear();m.state=STATES.ACTIVE;m.time=60;u.baseId=base.id;Object.assign(u,{x:base.x,z:base.z});Object.assign(troll,{x:base.x+4,z:base.z});
  await until(()=>page.locator('#live-scoreboard>div').count().then(n=>n===3),'Live scoreboard rows');
  const stun=page.locator('[data-do=elf-stun]');await stun.waitFor();assert.equal(await stun.isDisabled(),true);
  m.breachUntil.set(base.id,m.time+45);
  await until(()=>stun.isEnabled(),'Stun did not unlock after breach');assert.match(await stun.getAttribute('title'),/Atordoar/);
  await stun.click();await until(()=>troll.stunnedUntil>m.time,'Stun command did not reach server');
  // Exact three-second duration is covered by the deterministic rules suite.
  // The browser assertion only verifies command delivery and rendered state;
  // wall-clock latency on shared CI runners must not consume a test threshold.
  await page.locator('.troll-label').getByText('ATORDOADO',{exact:false}).waitFor();
  await page.screenshot({path:'artifacts/elf-stun-live-scoreboard.png'});report.stunAndLiveScoreboard=true;
  const core={id:'relocation-core',kind:'core',owner:u.id,baseId:base.id,x:base.x,z:base.z,hp:360,maxHp:360,progress:1,healthProgress:1,tier:1,bounty:360,lastHit:-100};
  m.structures.push(core);m.elfBasesClaimed.add(base.id);u.baseId=base.id;u.gold=0;u.wood=0;m.damage(core,core.hp,troll,'melee');
  await page.locator('#objective').getByText('REASSENTAMENTO',{exact:false}).waitFor();assert.ok(u.relocationUntil>m.time);
  await until(()=>page.locator('#hotbar [data-kind=core]').textContent().then(text=>text.includes('GRÁTIS')),'Free relocation was not shown in the hotbar');assert.equal(u.relocationVouchers,1);
  await page.screenshot({path:'artifacts/elf-relocation-countdown.png'});report.relocationCountdown=true;
  // End through authoritative damage so the normal server result flow renders.
  troll.stunnedUntil=0;m.damage(troll,troll.hp,u,'tower','test-tower');
  await page.getByText('MVP DA PARTIDA').waitFor();await page.locator('.result-table tbody tr').first().waitFor();
  assert.equal(await page.locator('.result-table tbody tr').count(),3);assert.equal(await page.locator('.mvp-row').count(),1);
  assert.ok(await page.locator('.result-table').getByText('Stuns').count());
  await page.screenshot({path:'artifacts/result-scoreboard-mvp.png',fullPage:true});report.resultAndMvp=true;
  assert.deepEqual(errors,[]);report.errors=errors;await writeFile('artifacts/browser-stun-scoreboard.json',JSON.stringify(report,null,2));console.log(report);
}catch(error){await page.screenshot({path:'artifacts/stun-scoreboard-failure.png',fullPage:true});throw error;}
finally{await browser.close();await app.close();}
