import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../shared/simulation.js';
import { BALANCE as B, STATES } from '../shared/config.js';

function arena(){
  const match=new Match({seed:'ATTACK-EVENTS'},[{id:'t',role:'troll',occupant:{type:'human',name:'Troll'}},{id:'e',role:'elf',occupant:{type:'human',name:'Elf'}}]);
  match.state=STATES.ACTIVE;match.time=80;const troll=match.unit('t'),elf=match.unit('e');Object.assign(elf,{x:troll.x,z:troll.z+2,hp:1000,maxHp:1000});troll.yaw=0;return {match,troll,elf};
}

test('authoritative attack publishes one start, impact and finish lifecycle',()=>{
  const {match,troll}=arena();match.attack(troll,true);const start=match.events.find(e=>e.type==='attack-animation'&&e.phase==='started');
  assert.ok(start);assert.equal(start.kind,'heavy');assert.ok(Math.abs(start.impactAt-start.startedAt-B.combat.heavyWindup)<1e-9);assert.ok(Math.abs(start.finishedAt-start.impactAt-B.combat.heavyVisualRecovery)<1e-9);
  match.time=start.impactAt;match.resolveStrike(troll);const impact=match.events.find(e=>e.type==='attack-animation'&&e.phase==='impact');assert.equal(impact.attackId,start.attackId);assert.equal(impact.hit,true);
  match.time=start.finishedAt;match.stepAttackAnimation(troll);const finish=match.events.find(e=>e.type==='attack-animation'&&e.phase==='finished');assert.equal(finish.attackId,start.attackId);assert.equal(finish.reason,'completed');
});

test('miss still publishes the authoritative impact frame',()=>{
  const {match,troll,elf}=arena();elf.x+=30;match.attack(troll,false);match.time=troll.pendingStrike.at;match.resolveStrike(troll);
  const impact=match.events.find(e=>e.type==='attack-animation'&&e.phase==='impact');assert.ok(impact);assert.equal(impact.hit,false);assert.ok(match.events.some(e=>e.type==='miss'));
});

test('dash and stun terminate the same active animation state',()=>{
  const {match,troll,elf}=arena();match.attack(troll,true);const first=troll.attackAnimation.attackId;match.dash(troll);assert.equal(troll.attackAnimation,null);assert.ok(match.events.some(e=>e.type==='attack-animation'&&e.attackId===first&&e.phase==='finished'&&e.reason==='dash'));
  troll.cooldowns.attack=0;troll.cooldowns.dash=0;match.attack(troll,false);const second=troll.attackAnimation.attackId;const original=match.elfStunStatus;match.elfStunStatus=()=>({available:true,troll:troll.id});match.elfStun(elf);match.elfStunStatus=original;
  assert.equal(troll.attackAnimation,null);assert.ok(match.events.some(e=>e.type==='attack-animation'&&e.attackId===second&&e.phase==='finished'&&e.reason==='stun'));
});
