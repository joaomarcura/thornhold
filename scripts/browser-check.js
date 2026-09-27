import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';

const endpoint=process.argv[2];if(!endpoint)throw new Error('Informe o CDP de uma sessão isolada: node scripts/browser-check.js ws://...');
const browser=await chromium.connectOverCDP(endpoint),ctx=await browser.newContext({viewport:{width:1440,height:900}}),guestCtx=await browser.newContext({viewport:{width:1280,height:800}}),page=await ctx.newPage(),guest=await guestCtx.newPage();
const errors=[],report={};for(const p of [page,guest])p.on('pageerror',e=>errors.push(e.message));
await mkdir('artifacts',{recursive:true});
try{
  await page.goto('http://localhost:3000');await page.getByText('Servidor conectado',{exact:false}).waitFor();await page.screenshot({path:'artifacts/menu.png'});
  await page.getByLabel('Seu nome').fill('Pedro');await page.getByRole('button',{name:'Criar sala privada',exact:false}).click();await page.locator('[name=role]').selectOption('troll');await page.locator('[name=elves]').selectOption('2');await page.getByRole('button',{name:'Criar sala →',exact:true}).click();
  await page.getByRole('heading',{name:'Pedro · Expedição',exact:true}).waitFor();const code=await page.locator('.invite b').textContent();assert.match(code,/^[A-F0-9]{6}$/);await page.screenshot({path:'artifacts/lobby.png',fullPage:true});
  await guest.goto('http://localhost:3000');await guest.getByText('Servidor conectado',{exact:false}).waitFor();await guest.getByLabel('Seu nome').fill('Aliado');await guest.getByRole('button',{name:'Entrar com código',exact:false}).click();await guest.locator('[name=code]').fill(code);await guest.getByRole('button',{name:'Entrar na sala →'}).click();
  await guest.getByRole('heading',{name:'Pedro · Expedição'}).waitFor();await guest.locator('[data-do=slot][data-action=claim][data-slot=e0]').click();await guest.locator('.slot.mine .slot-info b').filter({hasText:'Aliado'}).waitFor();
  await guest.getByRole('button',{name:'Marcar como pronto'}).click();await page.getByRole('button',{name:'Marcar como pronto'}).click();await page.getByRole('button',{name:'Iniciar expedição →'}).click();
  await page.locator('#role-name').filter({hasText:'TROLL'}).waitFor();await guest.locator('#role-name').filter({hasText:'GUARDIÃO'}).waitFor();await page.screenshot({path:'artifacts/troll-gameplay.png'});await guest.screenshot({path:'artifacts/elf-gameplay.png'});
  const before=await guest.locator('#objective').textContent();await guest.keyboard.down('KeyD');await guest.waitForTimeout(1200);await guest.keyboard.up('KeyD');await guest.locator('[data-do=build][data-kind=core]').click();await guest.mouse.move(720,500);await guest.locator('#build-hint').waitFor();await guest.screenshot({path:'artifacts/build-preview.png'});await guest.keyboard.press('Escape');assert.equal(await guest.locator('#build-hint').isVisible(),false);
  await page.locator('[data-do=shop]').click();await page.locator('#shop').waitFor();assert.equal(await page.locator('.item-tile').count(),5);assert.equal(await page.locator('.equipment-categories [role=tab]').count(),4);assert.equal(await page.locator('.item-inspector').count(),1);await page.getByRole('tab',{name:'Árvore de crescimento',exact:true}).click();assert.equal(await page.locator('.shop-item').count(),8);await page.keyboard.press('KeyG');
  await guest.keyboard.press('KeyH');await guest.getByRole('heading',{name:'Sobreviver é uma escolha.'}).waitFor();await guest.getByRole('button',{name:'Entendido.',exact:false}).click();
  await page.reload();await page.locator('#role-name').filter({hasText:'TROLL'}).waitFor();assert.equal(await page.locator('#player-title').textContent(),'Pedro');
  report.menu=true;report.privateLobby=true;report.twoClients=true;report.readyStart=true;report.roleHUDs=true;report.buildPreview=true;report.shop=true;report.help=true;report.resume=true;report.errors=errors;
  assert.deepEqual(errors,[]);await writeFile('artifacts/browser-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await page.screenshot({path:'artifacts/browser-failure-host.png'});await guest.screenshot({path:'artifacts/browser-failure-guest.png'});throw error;}
finally{await ctx.close();await guestCtx.close();await browser.close();}
