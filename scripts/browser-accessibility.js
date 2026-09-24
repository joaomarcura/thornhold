import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createGameServer } from '../server/index.js';

const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false});
const channel=process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined);
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader'],...(channel?{channel}:{})});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],report={};
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto('http://127.0.0.1:'+app.port);
  await page.getByText('Servidor conectado',{exact:false}).waitFor();
  await page.locator('[data-do=settings]').click();
  await page.getByRole('dialog',{name:'Acessibilidade e controles'}).waitFor();
  await page.locator('#ui-scale').selectOption('1.25');
  await page.locator('#reduce-motion').check();
  const mapBinding=page.locator('[data-do=bind][data-action=map]');await mapBinding.click();await page.keyboard.press('KeyJ');
  assert.equal(await mapBinding.locator('kbd').innerText(),'J');
  let state=await page.evaluate(()=>({saved:JSON.parse(localStorage.getItem('thornhold-preferences')),scale:getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'),reduced:document.body.classList.contains('reduce-motion')}));
  assert.equal(state.saved.scale,1.25);assert.equal(state.saved.bindings.map,'KeyJ');assert.equal(state.saved.reducedMotion,true);assert.equal(state.scale,'1.25');assert.equal(state.reduced,true);report.configuration=true;
  await page.reload();await page.getByText('Servidor conectado',{exact:false}).waitFor();
  state=await page.evaluate(()=>({scale:getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'),reduced:document.body.classList.contains('reduce-motion')}));
  assert.equal(state.scale,'1.25');assert.equal(state.reduced,true);report.persistence=true;
  await page.getByRole('button',{name:'Jogar contra bots',exact:false}).click();
  await page.getByRole('button',{name:'Criar partida local →'}).click();
  await page.getByRole('button',{name:'Marcar como pronto'}).click();
  await page.getByRole('button',{name:'Iniciar expedição →'}).click();
  await page.locator('#role-name').waitFor();
  await page.keyboard.press('KeyJ');await page.locator('#tactical-panel:not([hidden])').waitFor();
  assert.equal(await page.locator('#tactical-panel [data-do=map] kbd').innerText(),'J');assert.equal(await page.locator('.map-expand kbd').innerText(),'J');report.remappedGameAction=true;
  await page.keyboard.press('Escape');
  await page.locator('#hud [data-do=pause]').click();
  await page.getByRole('button',{name:'Acessibilidade e controles'}).click();
  await page.locator('[data-do=reset-preferences]').click();
  const reset=await page.evaluate(()=>JSON.parse(localStorage.getItem('thornhold-preferences')));
  assert.equal(reset.scale,1);assert.equal(reset.reducedMotion,false);assert.equal(reset.bindings.map,'KeyM');report.reset=true;
  assert.deepEqual(errors,[]);report.errors=errors;console.log(report);
}finally{await browser.close();await app.close();}
