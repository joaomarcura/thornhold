import test from 'node:test';
import assert from 'node:assert/strict';
import { recordRefund, recordSpend, structurePurpose } from '../shared/economy.js';
import { analyzeEconomy } from '../scripts/economy-audit.js';

test('Contabilidade econômica separa propósito, ação, gasto bruto e reembolso',()=>{
  const unit={stats:{goldSpent:0,woodSpent:0,goldRefunded:0,woodRefunded:0,spendByPurpose:{},spendByAction:{}}};
  recordSpend(unit,{gold:100,wood:40},structurePurpose('mine'),'construction');recordSpend(unit,{gold:30,wood:20},structurePurpose('tower'),'upgrade');recordRefund(unit,{gold:25,wood:10});
  assert.deepEqual(unit.stats.spendByPurpose,{economy:{gold:100,wood:40},defense:{gold:30,wood:20}});
  assert.deepEqual(unit.stats.spendByAction,{construction:{gold:100,wood:40},upgrade:{gold:30,wood:20}});
  assert.equal(unit.stats.goldSpent,130);assert.equal(unit.stats.goldRefunded,25);
});

test('Auditoria econômica encontra saturação e preserva cortes por perfil',()=>{
  const player={id:'e0',profile:'economy',generatedGold:850,generatedWood:390,spentGold:500,spentWood:250,storedGold:500,storedWood:250,goldUtilization:.5,woodUtilization:.5,spendByPurpose:{economy:{gold:400},defense:{gold:100}},spendByAction:{upgrade:{gold:300}}};
  const artifact={matches:[{seed:'S',winner:'elves',telemetry:{v2:{economyCheckpoints:[{time:600,elves:{generatedGold:850,spentGold:500,storedGold:500,goldUtilization:.5,woodUtilization:.5,spendByPurpose:player.spendByPurpose,spendByAction:player.spendByAction,players:[player]}}]}}}]};
  const report=analyzeEconomy(artifact);assert.equal(report.signals.goldSaturationAt,600);assert.equal(report.byProfile[0].profile,'economy');assert.equal(report.byCheckpoint[0].upgradeGold,300);
});
