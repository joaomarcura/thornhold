import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createGameServer } from '../server/index.js';

const server=await createGameServer({port:0,host:'127.0.0.1',telemetry:false,devMode:true});
const channel=process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined);
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader'],...(channel?{channel}:{})});
const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.getByText('Servidor conectado',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Jogar contra bots',exact:false}).click();
  await page.locator('[name=role]').selectOption('observer');
  await page.getByRole('button',{name:'Criar partida local →',exact:true}).click();
  await page.getByRole('button',{name:'Marcar como pronto'}).click();
  await page.getByRole('button',{name:'Iniciar expedição →'}).click();
  await page.locator('#role-name').filter({hasText:'OBSERVADOR'}).waitFor();
  await page.keyboard.press('F3');
  await page.locator('#debug-overlay').waitFor({state:'visible'});
  await page.waitForTimeout(5000);
  const line=await page.locator('#debug-overlay > div').first().textContent(),match=line.match(/(\d+) FPS · p95 ([\d.]+)ms · ([\d.]+) draws · ([\d.]+) tri · DPR ([\d.]+) · (\d+) long tasks/);
  assert.ok(match,`Métricas gráficas ausentes: ${line}`);assert.deepEqual(errors,[]);
  const integer=value=>Number(value.replace(/[^\d-]/g,''));
  const report={renderer:'headless-swiftshader',viewport:'1920x1080',fps:Number(match[1]),frameP95Ms:Number(match[2]),drawCalls:integer(match[3]),triangles:integer(match[4]),pixelRatio:Number(match[5]),longTasks:Number(match[6]),errors};
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await server.close();}
