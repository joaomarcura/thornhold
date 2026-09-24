import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { createGameServer } from '../server/index.js';
import { STATES, structureHP } from '../shared/config.js';

const browser=await chromium.connectOverCDP(process.argv[2]);
const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false});
const contexts=[],pages=[],errors=[],report={};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,message,timeout=9000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await sleep(80);}throw Error(message);}
await mkdir('artifacts',{recursive:true});
try{
  for(let i=0;i<2;i++){
    const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();contexts.push(context);pages.push(page);
    page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${app.port}`);await page.getByText('Servidor conectado',{exact:false}).waitFor();
  }
  const [troll,elf]=pages;
  await troll.getByLabel('Seu nome').fill('Teste do arsenal');await troll.getByRole('button',{name:'Criar sala privada',exact:false}).click();
  await troll.locator('[name=role]').selectOption('troll');await troll.locator('[name=elves]').selectOption('2');await troll.getByRole('button',{name:'Criar sala →',exact:true}).click();await troll.locator('.invite b').waitFor();
  const code=await troll.locator('.invite b').textContent();
  await elf.getByRole('button',{name:'Entrar com código',exact:false}).click();await elf.locator('[name=code]').fill(code);await elf.getByRole('button',{name:'Entrar na sala →'}).click();await elf.locator('[data-do=slot][data-action=claim][data-slot=e0]').click();
  for(const page of pages)await page.getByRole('button',{name:'Marcar como pronto'}).click();await troll.getByRole('button',{name:'Iniciar expedição →'}).click();for(const page of pages)await page.locator('#role-name').waitFor();
  // Fixtures are confined to this ephemeral test server. All purchases and worker commands use UI → WebSocket → Match.
  const m=[...app.sessions.rooms.values()][0].match,t=m.unit('t0'),e=m.unit('e0');m.controllers.clear();m.state=STATES.ACTIVE;m.time=300;t.gold=10000;t.lastAttack=0;
  await troll.keyboard.press('KeyB');await troll.locator('.item-card').first().waitFor();assert.equal(await troll.locator('.item-card').count(),9);
  await troll.getByRole('button',{name:'Caçador',exact:true}).click();assert.equal(await troll.locator('.item-card.recommended').count(),3);
  for(const id of ['claws','mantle','hunt']){await troll.locator(`[data-do=buy-item][data-item=${id}]`).click();await until(()=>t.inventory.includes(id),'Compra não chegou: '+id);}
  assert.deepEqual(t.equipment,{weapon:'claws',body:'mantle',relic:'hunt'});await until(()=>troll.locator('.item-card.equipped').count().then(n=>n===3),'Itens equipados no HUD');await troll.screenshot({path:'artifacts/troll-arsenal.png'});report.itemBuildPurchased=true;
  await troll.getByRole('tab',{name:'Atributos ∞',exact:true}).click();t.levels.damage=4;
  await until(()=>troll.locator('[data-key=damage]').textContent().then(s=>s.includes('Nv. 4')),'Nível 4 não apareceu');await troll.locator('[data-do=buy][data-key=damage]').click();await until(()=>t.levels.damage===5,'Upgrade infinito pelo painel');report.upgradeBeyondCap=true;
  await troll.screenshot({path:'artifacts/infinite-upgrades.png'});
  await troll.getByRole('tab',{name:'Equipamentos',exact:true}).click();await troll.getByRole('button',{name:'Cerco',exact:true}).click();await troll.locator('[data-do=buy-item][data-item=maul]').click();await until(()=>t.equipment.weapon==='maul','Troca de arma');assert.ok(t.inventory.includes('claws'));
  await troll.locator('[data-do=equip-item][data-item=claws]').click();await until(()=>t.equipment.weapon==='claws','Reequipar sem recomprar');report.itemCollection=true;
  await troll.keyboard.press('KeyB');

  const base=m.map.bases[0];Object.assign(e,{x:base.x+4.4,z:base.z,gold:10000,wood:1000});
  assert.equal(m.act('e0',{type:'build',kind:'core',x:base.x,z:base.z}),undefined);
  const core=m.structures.find(s=>s.kind==='core');await until(()=>core.progress===1,'Conclusão do núcleo');
  await elf.keyboard.press('KeyN');await elf.locator('[data-do=train-wisp]').waitFor();const before=e.wood;
  await elf.locator('[data-do=train-wisp]').click();await until(()=>m.wisps.length===1,'Formar Wisp');const w=m.wisps[0];const tree=m.trees.find(t=>t.id===w.treeId),reserve=tree.amount;
  await until(()=>w.readyAt<=m.time&&e.wood>before-15,'Produção automática');assert.equal(tree.amount,reserve);assert.equal(m.snapshot('t0').wisps.length,0);report.wispIncomeAndFog=true;
  await elf.locator(`[data-do=upgrade-wisp][data-id=${w.id}]`).click();await until(()=>w.level===2,'Evolução do Wisp');await elf.locator('.wisp-row b').filter({hasText:'Nv. 2'}).waitFor();await elf.screenshot({path:'artifacts/wisp-economy.png'});report.wispUpgrade=true;
  await elf.locator(`[data-do=select-wisp][data-id=${w.id}]`).click();await elf.locator('.advanced-tree summary').click();await elf.locator('#wisp-tree').waitFor();const oldTree=w.treeId;
  await elf.locator('[data-do=assign-wisp]').click();await until(()=>w.treeId!==oldTree,'Redistribuição do Wisp');assert.ok(w.readyAt>m.time);report.wispReassignment=true;
  const progressionWall={id:'progression-gate',kind:'wall',owner:'e0',baseId:base.id,x:base.gate.x,z:base.gate.z,tier:2,hp:2000,maxHp:2000,progress:1,healthProgress:1,bounty:3,lastHit:-100};m.structures.push(progressionWall);
  core.tier=4;core.hp=core.maxHp=structureHP('core',4);await elf.keyboard.press('KeyN');await elf.locator('[data-do=upgrade]').click();await until(()=>core.tier===5,'Núcleo evolui além do tier 4');report.structureBeyondCap=true;

  // Combat fixture: use a legal gate, place defender away, and face the Troll through real mouse-look input.
  const inward={x:(base.x-base.gate.x)/13.2,z:(base.z-base.gate.z)/13.2};
  Object.assign(t,{x:base.gate.x-inward.x*4,z:base.gate.z-inward.z*4,gold:1000});t.levels.damage=0;t.equipment.weapon=null;t.cooldowns={};
  Object.assign(e,{x:base.x+4.4,z:base.z});
  const wall={id:'combat-gate',kind:'wall',owner:'e0',baseId:base.id,x:base.gate.x,z:base.gate.z,tier:1,hp:10,maxHp:850,progress:1,healthProgress:1,bounty:3,lastHit:-100};m.structures.push(wall);
  // Point attack uses the crosshair-facing direction supplied by the browser. Place the gate on its current facing axis.
  await troll.bringToFront();await troll.mouse.click(720,450);await troll.waitForFunction(()=>document.pointerLockElement?.id==='world');await sleep(150);
  const facing=t.yaw;wall.x=t.x+Math.sin(facing)*2.5;wall.z=t.z+Math.cos(facing)*2.5;m.map.grid.fill(0);
  await troll.mouse.click(720,450);await until(()=>wall.hp===0,'Ataque pelo mouse');await troll.locator('#combat-feedback').filter({hasText:'ENTRADA ROMPIDA'}).waitFor();await troll.screenshot({path:'artifacts/wall-breach.png'});report.confirmedBreachFeedback=true;
  await until(()=>!(t.cooldowns.attack>m.time),'Fim da recuperação do ataque');const swings=m.stats.attacks;await troll.keyboard.press('KeyQ');await until(()=>t.pendingStrike?.heavy===true,'Preparação pesada pelo teclado');await troll.keyboard.press('Space');await until(()=>t.dashUntil>m.time,'Esquiva pelo teclado');assert.equal(t.pendingStrike,null);report.dashCancelsWindup=true;
  assert.ok(m.stats.attacks>=swings);assert.deepEqual(errors,[]);report.errors=errors;
  await writeFile('artifacts/browser-progression.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){for(const[i,p]of pages.entries())await p.screenshot({path:`artifacts/progression-failure-${i}.png`});throw error;}
finally{for(const context of contexts)await context.close();await browser.close();await app.close();}
