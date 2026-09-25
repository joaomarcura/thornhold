import test from 'node:test';
import assert from 'node:assert/strict';
import { recordRefund, recordSpend, structurePurpose } from '../shared/economy.js';
import { analyzeEconomy } from '../scripts/economy-audit.js';
import { ABLATIONS, compareVariant } from '../scripts/sensitivity.js';
import { balanceQuality } from '../scripts/arena.js';
import { SKILL_SCENARIOS, slotsForProfile } from '../scripts/profile-lab.js';

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

test('Sensibilidade pareada mede delta, fragilidade e mudanças de vencedor',()=>{
  const baseline=[{seed:'A',difficulty:'normal',winner:'elves',duration:800,completed:true},{seed:'B',difficulty:'hard',winner:'troll',duration:600,completed:true}],variant=[{seed:'A',difficulty:'normal',winner:'troll',duration:650,completed:true},{seed:'B',difficulty:'hard',winner:'troll',duration:500,completed:true}];
  const row=compareVariant('towerDamage',5,variant,baseline);assert.equal(row.deltaWinRate,50);assert.equal(row.fragility,10);assert.equal(row.winnerFlips,1);assert.equal(row.deltaMedianDuration,-100);
});

test('Balance Lab pontua equilíbrio, duração, resolução e comportamento separadamente',()=>{
  const healthy=Array.from({length:20},(_,i)=>({completed:true,winner:i%2?'troll':'elves',duration:840,ai:[{failedNavigation:5}]})),poor=healthy.map((row,i)=>({...row,winner:'troll',duration:i<10?360:1800,completed:i<15,ai:[{failedNavigation:80}]}));
  const good=balanceQuality(healthy),bad=balanceQuality(poor);assert.equal(good.score,100);assert.ok(bad.score<good.score);assert.equal(bad.components.resolution,0);assert.equal(bad.components.navigation,10);
});
test('Balance Lab cobre ablações e perfis artificiais sem alterar atributos',()=>{
  assert.deepEqual(ABLATIONS.map(item=>item.name),['exposure-off','sanctuary-off','healing-off','threat-income-off','legendary-off']);assert.equal(SKILL_SCENARIOS.length,6);
  const expert=slotsForProfile(SKILL_SCENARIOS.find(item=>item.name==='expert-troll')),afk=slotsForProfile(SKILL_SCENARIOS.find(item=>item.name==='one-afk-elf'));assert.equal(expert[0].occupant.difficulty,'hard');assert.equal(afk.filter(slot=>slot.occupant.type==='human').length,1);assert.equal(afk.length,6);
});
