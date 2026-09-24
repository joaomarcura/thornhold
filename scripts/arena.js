import { Worker,isMainThread,parentPort,workerData } from 'node:worker_threads';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { Match } from '../shared/simulation.js';
import { STATES } from '../shared/config.js';

export function aggregate(rows){
  const mean=v=>v.length?v.reduce((a,b)=>a+b,0)/v.length:0;
  const distribution=v=>{const s=[...v].sort((a,b)=>a-b),p=n=>s[Math.floor((s.length-1)*n)]??null;return {mean:mean(s),median:p(.5),p10:p(.1),p90:p(.9)};};
  const troll=r=>r.ai.find(a=>a.role==='troll')||{};
  return {runs:rows.length,duration:distribution(rows.map(r=>r.duration)),trollWins:rows.filter(r=>r.winner==='troll').length,
    elfWins:rows.filter(r=>r.winner==='elves').length,timeLimit:rows.filter(r=>r.endReason==='time-limit-objective').length,
    unfinished:rows.filter(r=>!r.completed).length,under4Minutes:rows.filter(r=>r.duration<240).length,
    under10Minutes:rows.filter(r=>r.duration<600).length,
    trollDeath:distribution(rows.filter(r=>r.telemetry.death).map(r=>r.telemetry.death.time)),
    survivalCensored:rows.filter(r=>r.telemetry.survivalCensored).length,
    damageReceived:Object.fromEntries(['tower','elf','hunger','other'].map(k=>[k,mean(rows.map(r=>r.telemetry.received[k]))])),
    meanTrollDamage:mean(rows.map(r=>r.trollDamage)),meanStructuresDestroyed:mean(rows.map(r=>r.destroyed)),
    meanTowersDestroyed:mean(rows.map(r=>r.telemetry.structuresDestroyed.tower||0)),
    meanCombatSeconds:mean(rows.map(r=>r.telemetry.combatSeconds)),meanRetreatSeconds:mean(rows.map(r=>troll(r).retreating||0)),
    meanRetreats:mean(rows.map(r=>troll(r).retreatAttempts||0)),meanEngagements:mean(rows.map(r=>r.telemetry.engagementCount)),
    meanFailedNavigation:mean(rows.map(r=>r.ai.reduce((n,a)=>n+a.failedNavigation,0))),
    meanStuckNavigation:mean(rows.map(r=>r.ai.reduce((n,a)=>n+(a.stuckNavigation||0),0))),
    meanFailedExploration:mean(rows.map(r=>r.ai.reduce((n,a)=>n+(a.failedExploration||0),0))),
    meanPathRecalculations:mean(rows.map(r=>r.ai.reduce((n,a)=>n+(a.pathRecalculations||0),0))),
    meanTrollFailedNavigation:mean(rows.map(r=>troll(r).failedNavigation||0)),
    meanGoldPerMinute:mean(rows.map(r=>r.players.filter(p=>p.role==='elf').reduce((n,p)=>n+p.goldPerMinute,0)/r.elves)),
    meanWoodPerMinute:mean(rows.map(r=>r.players.filter(p=>p.role==='elf').reduce((n,p)=>n+p.woodPerMinute,0)/r.elves))};
}
if(!isMainThread){
  for(const i of workerData.indices){
    const elves=[2,3,5,8][i%4],difficulty=['easy','normal','hard'][Math.floor(i/4)%3];
    const slots=[{id:'t',role:'troll',occupant:{type:'bot',name:'Troll',difficulty}},...Array.from({length:elves},(_,j)=>({id:'e'+j,role:'elf',occupant:{type:'bot',name:'Elfo '+j,difficulty}}))];
    const m=new Match({seed:'SIM-'+i,difficulty,diagnostics:true},slots);
    for(let tick=0;tick<Math.ceil(1201/workerData.step)&&m.state!==STATES.END;tick++)m.step(workerData.step);
    parentPort.postMessage({run:i,difficulty,completed:m.state===STATES.END,...m.result()});
  }
}else if(process.argv[1]?.endsWith('arena.js')){
  const count=Math.min(1000,Math.max(1,Number(process.argv[2])||60)),out=process.argv[3]||'artifacts/arena.json',baselinePath=process.argv[4],step=Number(process.env.SIM_STEP)||.1;
  const start=performance.now(),rows=[],concurrency=Math.min(4,count);
  await Promise.all(Array.from({length:concurrency},(_,worker)=>new Promise((resolve,reject)=>{
    const w=new Worker(new URL(import.meta.url),{workerData:{indices:Array.from({length:count},(_,i)=>i).filter(i=>i%concurrency===worker),step}});
    w.on('message',r=>{rows.push(r);if(rows.length%10===0)console.log(rows.length+'/'+count+' completed');});
    w.on('error',reject);w.on('exit',code=>code?reject(new Error('Worker exit '+code)):resolve());
  })));
  rows.sort((a,b)=>a.run-b.run);
  const summary=aggregate(rows),groups=[];
  for(const elves of [2,3,5,8])for(const difficulty of ['easy','normal','hard']){const group=rows.filter(r=>r.elves===elves&&r.difficulty===difficulty);if(group.length)groups.push({elves,difficulty,...aggregate(group)});}
  let comparison=null;
  if(baselinePath){const baseline=JSON.parse(await readFile(baselinePath,'utf8')),paired=rows.map(r=>{const before=baseline.matches.find(b=>b.seed===r.seed&&b.elves===r.elves&&b.difficulty===r.difficulty);if(!before)return null;return {seed:r.seed,durationDelta:r.duration-before.duration,trollDamageDelta:r.trollDamage-before.trollDamage,winnerBefore:before.winner,winnerAfter:r.winner};}).filter(Boolean);if(!paired.length)throw Error('No matching seeds in baseline');comparison={matchedRuns:paired.length,baseline:aggregate(baseline.matches.filter(b=>paired.some(r=>r.seed===b.seed))),current:aggregate(rows.filter(b=>paired.some(r=>r.seed===b.seed))),paired};}
  const result={schema:1,step,count,elapsedSeconds:(performance.now()-start)/1000,summary,groups,comparison,matches:rows};
  await mkdir('artifacts',{recursive:true});await writeFile(out,JSON.stringify(result,null,2));
  console.log(JSON.stringify({...result,matches:undefined,groups:undefined,comparison:comparison?{baseline:comparison.baseline,current:comparison.current,matchedRuns:comparison.matchedRuns}:null},null,2));
  if(summary.unfinished)process.exitCode=1;
}
