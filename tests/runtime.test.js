import test from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeMetrics } from '../server/runtime-metrics.js';
import { createTelemetrySink } from '../server/telemetry.js';

test('runtime metrics reporta percentis, overruns, tráfego e memória sem histórico ilimitado',()=>{
  const metrics=new RuntimeMetrics({tickBudgetMs:50,maxSamples:3});for(const duration of [10,20,30,60])metrics.recordTick(duration);metrics.recordInbound(12);metrics.recordOutbound(24);metrics.recordDrop();metrics.recordConnection();
  const report=metrics.snapshot({rooms:2,clients:3,connections:2,bufferedBytes:7});
  assert.equal(report.tick.samples,3);assert.equal(report.tick.count,4);assert.equal(report.tick.overruns,1);assert.equal(report.tick.maxMs,60);assert.equal(report.websocket.outboundBytes,24);assert.equal(report.websocket.droppedMessages,1);assert.equal(report.rooms,2);assert.ok(report.memory.rssBytes>0);
});

test('telemetria stdout produz JSON estruturado e CloudWatch EMF',async()=>{
  const lines=[],sink=createTelemetrySink({mode:'stdout',provider:'aws',environment:'test',output:value=>lines.push(JSON.parse(value))});
  await sink.writeMatch({seed:'A',winner:'elves'});await sink.writeRuntime({at:new Date().toISOString(),rooms:1,connections:2,tick:{p95Ms:4,maxMs:8,overruns:0},websocket:{outboundBytes:1024,droppedMessages:0}});
  assert.equal(lines[0].type,'match_result');assert.equal(lines[0].environment,'test');assert.equal(lines[1].type,'runtime_metrics');assert.equal(lines[1]._aws.CloudWatchMetrics[0].Namespace,'Thornhold');assert.equal(lines[1].ActiveConnections,2);
});

test('telemetria genérica não envia envelope específico da AWS ao Azure',async()=>{
  const lines=[],sink=createTelemetrySink({mode:'stdout',provider:'azure',environment:'azure-production',output:value=>lines.push(JSON.parse(value))});
  await sink.writeRuntime({rooms:0,connections:0,tick:{p95Ms:1,maxMs:2,overruns:0},websocket:{outboundBytes:0,droppedMessages:0}});
  assert.equal(lines[0].type,'runtime_metrics');assert.equal(lines[0].environment,'azure-production');assert.equal(Object.hasOwn(lines[0],'_aws'),false);
});
