import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createGameServer } from '../server/index.js';
import { STATES } from '../shared/config.js';

const channel=process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined);
const browser = await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader'],...(channel?{channel}:{})});
const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const host = await hostContext.newPage();
const server = await createGameServer({ port: 0, host: '127.0.0.1', telemetry: false, devMode: true });
const url = `http://127.0.0.1:${server.port}`;
const errors = [];
let devSpeedValidated=false;
host.on('pageerror', error => errors.push(error.message));
await mkdir('artifacts', { recursive: true });

try {
  await host.goto(url);
  await host.getByText('Servidor conectado', { exact: false }).waitFor();
  await host.getByRole('button', { name: 'Jogar contra bots', exact: false }).click();
  await host.locator('[name=role]').selectOption('observer');
  assert.equal(await host.locator('[name=elves]').inputValue(), '5');
  await host.getByRole('button', { name: 'Criar partida local →', exact: true }).click();
  await host.locator('.invite b').waitFor();
  const code = await host.locator('.invite b').textContent();
  await host.locator('[data-setting=seed]').fill('TEST-2');
  await host.locator('[data-setting=seed]').blur();
  for(let attempt=0;attempt<40&&server.sessions.rooms.get(code)?.settings.seed!=='TEST-2';attempt++)await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(server.sessions.rooms.get(code)?.settings.seed,'TEST-2');
  await host.getByRole('button', { name: 'Marcar como pronto' }).click();
  await host.getByRole('button', { name: 'Iniciar expedição →' }).click();
  await host.locator('#role-name').filter({ hasText: 'OBSERVADOR' }).waitFor();

  const room = server.sessions.rooms.get(code);
  assert.equal(room.match.units.length, 6);
  assert.ok(room.match.units.every(unit => unit.controller === 'bot'));
  await host.locator('[data-do=dev]').click();
  await host.locator('[data-do=dev-speed][data-speed="8"]').click();
  await host.locator('.dev-modal [data-do=close]').click();
  assert.equal(room.devSpeed,8);
  devSpeedValidated=true;

  // Accelerate the real simulation only inside this isolated test server.
  // Pause the interval's contribution so it cannot interleave .4 s ticks with
  // the deterministic .05 s steps below. No gameplay state is overwritten.
  room.devSpeed=0;
  while (room.match.state !== STATES.END && room.match.time < 1800) {
    for (let i = 0; i < 100; i++) room.match.step(.05);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(room.match.state, STATES.END);
  const result = room.match.result();
  assert.ok(result.trollDamage > 0 && result.produced > 0 && result.upgrades > 0);
  await host.locator('.result-page').waitFor();
  await host.screenshot({ path: 'artifacts/result.png', fullPage: true });

  await host.getByRole('button', { name: 'Revanche · voltar ao lobby →' }).click();
  await host.getByRole('button', { name: 'Marcar como pronto' }).waitFor();
  assert.equal(await host.locator('.invite b').textContent(), code);
  await host.locator('[data-setting=seed]').fill('REVANCHE-VALIDADA');
  await host.locator('[data-setting=seed]').blur();
  for(let attempt=0;attempt<40&&room.settings.seed!=='REVANCHE-VALIDADA';attempt++)await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(room.settings.seed,'REVANCHE-VALIDADA');
  await host.getByRole('button', { name: 'Marcar como pronto' }).click();
  await host.getByRole('button', { name: 'Iniciar expedição →' }).click();
  await host.locator('#role-name').filter({ hasText: 'OBSERVADOR' }).waitFor();
  assert.equal(room.match.map.seed, 'REVANCHE-VALIDADA');
  assert.equal(room.members.size, 1);
  assert.deepEqual(errors, []);

  const report = { allBots: true, standardLobby: room.match.units.length===6, observerOnly: room.slots.every(slot=>slot.occupant?.type==='bot'||slot.closed), devSpeed: devSpeedValidated, naturalVictory: true,
    sameLobbyRetained: true, readyReset: true, newSeedOnRematch: true,
    winner: result.winner, duration: result.duration, errors };
  await writeFile('artifacts/browser-lifecycle.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await host.screenshot({ path: 'artifacts/lifecycle-failure.png', fullPage: true });
  throw error;
} finally {
  await hostContext.close();
  await browser.close();
  await server.close();
}
