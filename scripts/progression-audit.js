import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { combatStats } from '../shared/equipment.js';
import { Match } from '../shared/simulation.js';
import { BALANCE as B, STATES, income, mitigation, trollCost, upgradeCost, structureHP, wispIncome } from '../shared/config.js';

// Independent role difficulties and paired seeds distinguish rules from controller strength.
const seeds=Number(process.argv[2]??2);
const output=process.argv[3]||'artifacts/progression-audit.json';
const step=process.env.AUDIT_STEP===undefined?1/B.tick:Number(process.env.AUDIT_STEP),maxSeconds=1500,runs=[];
if(!Number.isInteger(seeds)||seeds<1||seeds>20||!Number.isFinite(step)||step<=0||step>.1)throw new Error('Use 1–20 seeds e AUDIT_STEP maior que 0 e até 0.1 segundo.');
// Experimental process-local overrides. The server and configuration file are untouched.
const experiment=process.argv.includes('--timers-only')?'timers-only':'current';
if(experiment==='timers-only'){B.finalAge=600;B.hungerAge=900;}
const start=performance.now();
const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
const percentile=(values,p)=>{const v=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!v.length)return null;const i=(v.length-1)*p;return v[Math.floor(i)]+(v[Math.ceil(i)]-v[Math.floor(i)])*(i%1);};
for(const mapSize of ['compact','large'])for(const elves of [2,5,8])for(const elfDifficulty of ['normal','hard'])for(let seed=0;seed<seeds;seed++){
  const slots=[{id:'t',role:'troll',occupant:{type:'bot',difficulty:'normal',name:'Troll'}},...Array.from({length:elves},(_,i)=>({id:'e'+i,role:'elf',occupant:{type:'bot',difficulty:elfDifficulty,name:'Elfo '+i}}))];
  const m=new Match({seed:`AUDIT-${seed}`,mapSize},slots),milestones={},errors={},states={},timeline=[];
  let firstHit=null,firstDeath=null,lastTrollDamage=null,nextSample=0,nextTimeline=60;
  for(const u of m.units)milestones[u.id]={core:{},wall:{},tower:{},purchases:{},items:[],death:null};
  const act=m.act.bind(m),emit=m.emit.bind(m);
  m.act=(id,cmd)=>{const result=act(id,cmd);if(typeof result==='string'){const key=`${m.unit(id).role}/${cmd.type}/${cmd.kind||''}/${result}`;errors[key]=(errors[key]||0)+1;}return result;};
  m.emit=(type,e={})=>{
    if(type==='damage'&&e.kind==='melee')firstHit??=m.time;
    if(type==='damage'&&e.entity==='t')lastTrollDamage=e.kind;
    if(type==='death'){firstDeath??=m.time;milestones[e.entity].death=m.time;}
    if(type==='purchase'&&e.key)milestones[e.unit].purchases[e.key]=(milestones[e.unit].purchases[e.key]||[]).concat(m.time);
    if(type==='purchase'&&e.item)milestones[e.unit].items.push({item:e.item,time:m.time});
    return emit(type,e);
  };
  while(m.state!==STATES.END&&m.time<maxSeconds){
    m.step(step);const state=m.controllers.get('t')?.brain?.state||'preparation';states[state]=(states[state]||0)+step;
    if(m.time>=nextSample){nextSample+=1;for(const s of m.structures)if(s.hp>0&&s.progress>=1&&milestones[s.owner]?.[s.kind])milestones[s.owner][s.kind][s.tier]??=m.time;}
    if(m.time>=nextTimeline){
      const troll=m.unit('t'),living=m.units.filter(u=>u.role==='elf'&&u.alive);
      timeline.push({time:Math.round(m.time),alive:living.length,wisps:m.wisps.filter(w=>w.alive).length,highestWispLevel:Math.max(0,...m.wisps.map(w=>w.level)),trollItems:{...troll.equipment},trollHP:troll.hp/troll.maxHp,trollGold:troll.gold,trollLevels:{...troll.levels},elfGold:mean(living.map(u=>u.gold)),elfWood:mean(living.map(u=>u.wood)),coreTier:mean(living.map(u=>m.structures.find(s=>s.owner===u.id&&s.kind==='core'&&s.hp>0)?.tier||0)),income:mean(living.map(u=>m.structures.filter(s=>s.owner===u.id&&s.hp>0&&s.progress>=1).reduce((sum,s)=>sum+income(s),0)))});nextTimeline+=60;
    }
  }
  runs.push({seed:m.map.seed,mapSize,elves,elfDifficulty,trollDifficulty:'normal',completed:m.state===STATES.END,...m.result(),firstHit,firstDeath,trollDeathCause:m.unit('t').alive?null:lastTrollDamage,milestones,errors,states,timeline});
}
const summary=[];
for(const mapSize of ['compact','large'])for(const elves of [2,5,8])for(const elfDifficulty of ['normal','hard']){
  const group=runs.filter(r=>r.mapSize===mapSize&&r.elves===elves&&r.elfDifficulty===elfDifficulty),done=group.filter(r=>r.completed),wins=done.filter(r=>r.winner==='troll').length;
  summary.push({mapSize,elves,elfDifficulty,runs:group.length,completed:done.length,censored:group.length-done.length,trollWins:wins,trollWinRateCompleted:done.length?Math.round(wins/done.length*100):null,medianCompletedSeconds:percentile(done.map(r=>r.duration),.5),medianFirstHit:Math.round(percentile(group.map(r=>r.firstHit),.5)),hungerDeaths:group.filter(r=>r.trollDeathCause==='hunger').length});
}
const branches=Object.entries(B.branches).map(([id,b])=>({id,range:B.structures.tower.range+b.range,damagePerShot:B.structures.tower.damage*b.damage,interval:B.structures.tower.interval*b.interval,dpsByArmor:[1,4,7,10,13].map(a=>+(B.structures.tower.damage*b.damage/(B.structures.tower.interval*b.interval)*mitigation(a*(1-b.armorPierce))).toFixed(2)),slow:b.slow||null}));
const economy=[];for(const kind of ['core','mine'])for(let tier=1;tier<=4;tier++){const s={kind,tier},delta=income(s)-(tier===1?0:income({kind,tier:tier-1})),cost=tier===1?B.structures[kind]:upgradeCost({kind,tier:tier-1});economy.push({kind,tier,income:income(s),gold:cost.gold,wood:cost.wood,goldPayback:cost.gold/delta,buildSeconds:tier===1?B.structures[kind].seconds:B.construction.upgradeSeconds+tier-1});}
const melee=[];for(const level of [0,1,2,3,4,6,10]){const {damage,siege,interval}=combatStats({levels:Object.fromEntries(Object.keys(B.upgrades).map(key=>[key,level]))});melee.push({level,lightDPS:damage*siege/interval,elfHits:Math.ceil(B.elf.hp/damage),trollAllUpgradesCost:Object.keys(B.upgrades).reduce((sum,k)=>sum+Array.from({length:level},(_,l)=>trollCost(k,l)).reduce((a,b)=>a+b,0),0),wallHP:structureHP('wall',level===4?4:level+1),baseRepairPerSecond:B.elf.repair,workshop4Repair:B.elf.repair*(1+4*B.economy.workshopRepair)});}
const errorTotals={};for(const r of runs)for(const[k,v]of Object.entries(r.errors))errorTotals[k]=(errorTotals[k]||0)+v;
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify({generated:new Date().toISOString(),experiment,step,maxSeconds,seeds,config:B,elapsedSeconds:(performance.now()-start)/1000,summary,branches,economy,melee,errorTotals,runs},null,2));
console.table(summary);console.log('Top rejected bot intentions:',Object.entries(errorTotals).sort((a,b)=>b[1]-a[1]).slice(0,8));console.log(output);
if(runs.some(r=>!r.completed))process.exitCode=1;
