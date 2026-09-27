import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createGameServer } from '../server/index.js';
import { BALANCE as B, STATES, distance } from '../shared/config.js';
import { xpForTrollLevel } from '../shared/cards.js';

const channel=process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined);
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader'],...(channel?{channel}:{})});
const context=await browser.newContext({viewport:{width:1440,height:900}});
const page=await context.newPage();
const server=await createGameServer({port:0,host:'127.0.0.1',telemetry:false,devMode:true});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
await mkdir('artifacts',{recursive:true});

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,message,timeout=5000){
  const end=Date.now()+timeout;
  while(Date.now()<end){if(await check())return;await sleep(50);}
  throw new Error(message);
}

try{
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.getByText('Servidor conectado',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Jogar contra bots',exact:false}).click();
  await page.locator('[name=role]').selectOption('troll');
  await page.locator('[name=elves]').selectOption('5');
  await page.getByRole('button',{name:'Criar partida local →',exact:true}).click();
  await page.getByRole('button',{name:'Marcar como pronto'}).click();
  await page.getByRole('button',{name:'Iniciar expedição →'}).click();
  await page.locator('#role-name').filter({hasText:'TROLL'}).waitFor();
  await page.getByRole('dialog',{name:'Escolha uma mutação'}).waitFor();
  await page.locator('#live-scoreboard').getByText('Viajante · Nv. 1',{exact:false}).waitFor();

  const room=[...server.sessions.rooms.values()][0];
  const match=room.match;
  const troll=match.unit('t0');
  await page.locator('.predator-card').first().click();await sleep(150);assert.equal(troll.cards.length,0,'Clicar na carta não deve escolhê-la.');
  await page.keyboard.press('Digit1');
  await until(()=>troll.cards.length===1,'A escolha da carta não chegou ao servidor.');
  assert.equal(await page.evaluate(()=>document.pointerLockElement),null);
  await page.locator('#world').click({position:{x:720,y:450}});
  await until(()=>page.evaluate(()=>document.pointerLockElement?.id==='world'),'Clique no cenário não recuperou a mira presa.');
  const sealed={x:troll.x,z:troll.z};
  await page.keyboard.down('KeyW');await sleep(250);await page.keyboard.up('KeyW');
  const preparationMovement=distance(sealed,troll);assert.ok(preparationMovement>.15,'O Troll deve conseguir andar dentro do Santuário durante a preparação.');
  assert.ok(distance(troll,match.map.trollSpawn)<=B.troll.sanctuaryRadius,'O selo deve impedir que o Troll deixe o Santuário antes da hora.');

  await page.keyboard.press('F10');
  await page.getByRole('dialog',{name:'Menu dev'}).waitFor();
  await until(()=>page.evaluate(()=>document.pointerLockElement===null),'Abrir DEV deve liberar a mira para operar o painel.');
  await page.locator('[data-do=dev-speed][data-speed="8"]').click();
  const beforeDevClose={x:troll.x,z:troll.z};
  // Navegadores desktop podem rejeitar pointer lock disparado por F10. O primeiro WASD deve recuperar o controle.
  await page.evaluate(()=>{const canvas=document.querySelector('#world'),capture=canvas.requestPointerLock.bind(canvas);let attempts=0;canvas.requestPointerLock=(...args)=>++attempts===1?Promise.reject(new Error('simulated F10 rejection')):capture(...args);});
  await page.keyboard.press('F10');
  await until(()=>page.evaluate(()=>document.pointerLockElement===null&&document.querySelector('#toast')?.textContent.includes('não liberou')),'A rejeição simulada do F10 não foi observada.');
  await page.keyboard.down('KeyW');
  await page.getByRole('dialog',{name:'Menu dev'}).waitFor({state:'detached'});
  await until(()=>page.evaluate(()=>document.pointerLockElement?.id==='world'),'Fechar DEV com F10 não devolveu a mira ao jogo.');
  await until(()=>distance(beforeDevClose,troll)>.15,'O movimento não voltou depois de fechar DEV.');await page.keyboard.up('KeyW');

  // Acelera o relógio real da sala, sem sobrescrever estado ou tempo.
  room.devSpeed=8;
  await until(()=>match.state===STATES.ACTIVE,'O selo não caiu pela transição normal.',12000);
  room.devSpeed=1;
  const before={x:troll.x,z:troll.z};

  // A escolha não pode reabrir o modal com um snapshot antigo nem engolir W.
  await page.keyboard.down('KeyW');
  await until(()=>distance(before,troll)>.15,'O servidor não recebeu movimento do Troll.');
  await page.keyboard.up('KeyW');

  // Uma escolha obtida em combate fica enfileirada; ao ficar segura ela aparece,
  // e um novo contato fecha o modal antes que ele possa bloquear o jogador.
  match.grantTrollXp(troll,xpForTrollLevel(1)+xpForTrollLevel(2)+1,'browser-test');troll.lastHit=match.time;troll.lastAttack=match.time;
  await sleep(500);assert.equal(await page.getByRole('dialog',{name:'Escolha uma mutação'}).count(),0);
  troll.lastHit=match.time-B.troll.cardOutOfCombatDelay-.1;troll.lastAttack=troll.lastHit;
  await page.getByRole('dialog',{name:'Escolha uma mutação'}).waitFor();
  troll.lastHit=match.time;
  await page.getByRole('dialog',{name:'Escolha uma mutação'}).waitFor({state:'detached'});
  const afterCombatCard={x:troll.x,z:troll.z};await page.keyboard.down('KeyW');await until(()=>page.evaluate(()=>document.pointerLockElement?.id==='world'),'WASD não retomou a mira após adiar a carta.');await until(()=>distance(afterCombatCard,troll)>.15,'Troll não voltou a andar após a carta ser adiada.');await page.keyboard.up('KeyW');

  const diagnostics=await fetch(`http://127.0.0.1:${server.port}/debug/controls`).then(response=>response.json()),controlEvents=diagnostics.rooms[0]?.humans[0]?.events||[];
  assert.ok(controlEvents.some(event=>event.event==='dev-close'),'Diagnóstico DEV não registrou o fechamento do painel.');
  assert.ok(controlEvents.some(event=>event.event==='movement-keydown'&&event.code==='KeyW'),'Diagnóstico DEV não registrou o retorno do movimento.');
  const report={cardChosen:troll.cards[0],cardKeyboardOnly:true,cloudControlFlow:true,preparationMovement,devSpeedMovement:8,devMenuRestoresMovement:true,combatCardDeferred:true,combatCardModalClosed:true,trollLevelVisible:true,controlDiagnostics:true,naturalActiveTransition:true,movedAfterSeal:distance(before,troll),errors};
  assert.ok(report.movedAfterSeal>.15);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'artifacts/troll-movement.png'});
  await writeFile('artifacts/browser-troll-movement.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}catch(error){
  await page.screenshot({path:'artifacts/troll-movement-failure.png',fullPage:true});
  throw error;
}finally{
  await context.close();
  await browser.close();
  await server.close();
}
