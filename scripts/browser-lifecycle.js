import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createGameServer } from '../server/index.js';
import { STATES } from '../shared/config.js';

const browser = await chromium.connectOverCDP(process.argv[2]);
const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const guestContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const host = await hostContext.newPage();
const guest = await guestContext.newPage();
const server = await createGameServer({ port: 0, host: '127.0.0.1', telemetry: false });
const url = `http://127.0.0.1:${server.port}`;
const errors = [];
for (const page of [host, guest]) page.on('pageerror', error => errors.push(error.message));
await mkdir('artifacts', { recursive: true });

try {
  await host.goto(url);
  await host.getByText('Servidor conectado', { exact: false }).waitFor();
  await host.getByRole('button', { name: 'Criar sala privada', exact: false }).click();
  await host.locator('[name=elves]').selectOption('2');
  await host.getByRole('button', { name: 'Criar sala →', exact: true }).click();
  await host.locator('.invite b').waitFor();
  const code = await host.locator('.invite b').textContent();
  await host.locator('[data-setting=seed]').fill('TEST-2');
  await host.locator('[data-setting=seed]').blur();
  await host.getByRole('button', { name: 'Observar partida' }).click();
  await host.locator('[data-slot=e0][data-action=bot]').click();

  await guest.goto(`${url}/?room=${code}`);
  await guest.getByText('Servidor conectado', { exact: false }).waitFor();
  await guest.getByRole('button', { name: 'Entrar na sala →' }).click();
  await guest.getByRole('button', { name: 'Marcar como pronto' }).click();
  await host.getByRole('button', { name: 'Marcar como pronto' }).click();
  await host.getByRole('button', { name: 'Iniciar expedição →' }).click();
  await host.locator('#role-name').filter({ hasText: 'OBSERVADOR' }).waitFor();
  await guest.locator('#role-name').filter({ hasText: 'OBSERVADOR' }).waitFor();

  const room = server.sessions.rooms.get(code);
  assert.equal(room.match.units.length, 3);
  assert.ok(room.match.units.every(unit => unit.controller === 'bot'));

  // Accelerate the real simulation only inside this isolated test server.
  // No HP, gold, positions or victory conditions are overwritten.
  while (room.match.state !== STATES.END && room.match.time < 1200) {
    for (let i = 0; i < 100; i++) room.match.step(.05);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(room.match.state, STATES.END);
  const result = room.match.result();
  assert.ok(result.trollDamage > 0 && result.produced > 0 && result.upgrades > 0);
  await host.locator('.result-page').waitFor();
  await guest.locator('.result-page').waitFor();
  assert.equal(await host.locator('.result-page h1').textContent(), await guest.locator('.result-page h1').textContent());
  await host.screenshot({ path: 'artifacts/result.png', fullPage: true });

  await host.getByRole('button', { name: 'Revanche · voltar ao lobby →' }).click();
  await host.getByRole('button', { name: 'Marcar como pronto' }).waitFor();
  await guest.getByRole('button', { name: 'Marcar como pronto' }).waitFor();
  assert.equal(await host.locator('.invite b').textContent(), code);
  assert.equal(await guest.locator('.invite b').textContent(), code);
  await host.locator('[data-setting=seed]').fill('REVANCHE-VALIDADA');
  await host.locator('[data-setting=seed]').blur();
  await guest.locator('[data-setting=seed][value="REVANCHE-VALIDADA"]').waitFor();
  await guest.getByRole('button', { name: 'Marcar como pronto' }).click();
  await host.getByRole('button', { name: 'Marcar como pronto' }).click();
  await host.getByRole('button', { name: 'Iniciar expedição →' }).click();
  await host.locator('#role-name').filter({ hasText: 'OBSERVADOR' }).waitFor();
  await guest.locator('#role-name').filter({ hasText: 'OBSERVADOR' }).waitFor();
  assert.equal(room.match.map.seed, 'REVANCHE-VALIDADA');
  assert.equal(room.members.size, 2);
  assert.deepEqual(errors, []);

  const report = { allBots: true, naturalVictory: true, resultsOnBothClients: true,
    sameLobbyRetained: true, readyReset: true, newSeedOnRematch: true,
    winner: result.winner, duration: result.duration, errors };
  await writeFile('artifacts/browser-lifecycle.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await host.screenshot({ path: 'artifacts/lifecycle-failure.png', fullPage: true });
  throw error;
} finally {
  await hostContext.close();
  await guestContext.close();
  await browser.close();
  await server.close();
}
