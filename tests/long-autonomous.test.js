import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../shared/simulation.js';
import { BALANCE as B, STATES, distance } from '../shared/config.js';

const slots=(n=5)=>[{id:'t',role:'troll',occupant:{type:'bot',name:'Troll'}},...Array.from({length:n},(_,i)=>({id:'e'+i,role:'elf',occupant:{type:'bot',name:'Elfo '+i}}))];

test('Partidas autônomas padrão 1v5 não prendem o Troll na base nem excedem duas torres',()=>{
  for(const seed of ['TEST-5','SIM-2','SIM-7']){
    const m=new Match({seed,difficulty:'normal'},slots());let sanctuaryRecovery=0,maxSanctuaryRecovery=0;
    for(let i=0;i<18000&&m.state!==STATES.END;i++){
      m.step(.1);const troll=m.unit('t'),brain=m.controllers.get('t')?.brain,waiting=m.state===STATES.ACTIVE&&distance(troll,m.map.trollSpawn)<=B.troll.sanctuaryRadius&&brain?.state==='recover';
      sanctuaryRecovery=waiting?sanctuaryRecovery+.1:0;maxSanctuaryRecovery=Math.max(maxSanctuaryRecovery,sanctuaryRecovery);
    }
    assert.ok(m.stats.trollDamage>0,seed);assert.ok(m.stats.produced>0,seed);assert.ok(m.stats.upgrades>0,seed);assert.ok(maxSanctuaryRecovery<=30,`${seed}: ${maxSanctuaryRecovery.toFixed(1)}s no Santuário`);
    for(const base of m.map.bases)assert.ok(m.structures.filter(s=>s.baseId===base.id&&s.kind==='tower'&&s.hp>0).length<=2,base.id);
  }
});
