import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { Match } from '../shared/simulation.js';
import { STATES } from '../shared/config.js';

const count=Math.min(2000,Math.max(1,Number(process.argv[2])||100)),out=process.argv[3]||'artifacts/simulations.json',baselinePath=process.argv[4]||'';
const rows=[],start=performance.now();
for(let i=0;i<count;i++){
  const elves=[2,3,5,8][i%4],difficulty=['easy','normal','hard'][Math.floor(i/4)%3];
  const slots=[{id:'t',role:'troll',occupant:{type:'bot',name:'Troll',difficulty}},...Array.from({length:elves},(_,j)=>({id:'e'+j,role:'elf',occupant:{type:'bot',name:'Elfo '+j,difficulty}}))];
  const m=new Match({seed:'SIM-'+i,difficulty},slots);
  // Fixed 100 ms integration preserves cooldowns and uses movement substeps. Live server uses 50 ms.
  for(let tick=0;tick<12000&&m.state!==STATES.END;tick++)m.step(.1);
  rows.push({run:i,difficulty,completed:m.state===STATES.END,gameVersion:'0.1.0',aiVersion:'troll-brain-v2',map:m.settings.mapSize,...m.result()});
}
const percentile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))]:0;};
const summary=[];for(const elves of [2,3,5,8])for(const difficulty of ['easy','normal','hard']){
  const runs=rows.filter(r=>r.elves===elves&&r.difficulty===difficulty);if(!runs.length)continue;
  const durations=runs.map(r=>r.duration),towerInteractions=runs.flatMap(r=>r.combatInteractions.filter(i=>i.source==='tower'));
  summary.push({elves,difficulty,runs:runs.length,completed:runs.filter(r=>r.completed).length,trollWinRate:Math.round(runs.filter(r=>r.winner==='troll').length/runs.length*100),meanSeconds:Math.round(durations.reduce((a,r)=>a+r,0)/runs.length),medianSeconds:Math.round(percentile(durations,.5)),p25Seconds:Math.round(percentile(durations,.25)),p75Seconds:Math.round(percentile(durations,.75)),meanGoldPerMinute:+(runs.reduce((a,r)=>a+r.players.filter(p=>p.role==='elf').reduce((n,p)=>n+p.goldPerMinute,0)/Math.max(1,r.elves),0)/runs.length).toFixed(1),meanTowerEffectiveDps:+(towerInteractions.length?towerInteractions.reduce((a,i)=>a+i.effectiveDps,0)/towerInteractions.length:0).toFixed(2),meanTowerTtk:+(towerInteractions.filter(i=>i.ttk!==null).reduce((a,i)=>a+i.ttk,0)/Math.max(1,towerInteractions.filter(i=>i.ttk!==null).length)).toFixed(2),meanBasesBroken:+(runs.reduce((a,r)=>a+r.basesDestroyed,0)/runs.length).toFixed(1)});
}
const aggregate=matches=>({runs:matches.length,completed:matches.filter(r=>r.completed).length,timeouts:matches.filter(r=>!r.completed).length,trollWins:matches.filter(r=>r.winner==='troll').length,elfWins:matches.filter(r=>r.winner==='elves').length,meanSeconds:Math.round(matches.reduce((n,r)=>n+r.duration,0)/Math.max(1,matches.length)),meanFailedNavigation:+(matches.reduce((n,r)=>n+(r.ai||[]).reduce((a,x)=>a+(x.failedNavigation||0),0),0)/Math.max(1,matches.length)).toFixed(2),meanTowerDamage:Math.round(matches.reduce((n,r)=>n+(r.towerDamage||0),0)/Math.max(1,matches.length))});
let comparison=null;if(baselinePath){try{const baseline=JSON.parse(await readFile(baselinePath,'utf8'));comparison={baseline:aggregate(baseline.matches||[]),current:aggregate(rows),delta:{timeouts:(rows.filter(r=>!r.completed).length-(baseline.matches||[]).filter(r=>!r.completed).length),trollWins:(rows.filter(r=>r.winner==='troll').length-(baseline.matches||[]).filter(r=>r.winner==='troll').length),meanSeconds:Math.round(rows.reduce((n,r)=>n+r.duration,0)/rows.length)-Math.round((baseline.matches||[]).reduce((n,r)=>n+r.duration,0)/Math.max(1,(baseline.matches||[]).length)),meanFailedNavigation:+(rows.reduce((n,r)=>n+(r.ai||[]).reduce((a,x)=>a+(x.failedNavigation||0),0),0)/rows.length-(baseline.matches||[]).reduce((n,r)=>n+(r.ai||[]).reduce((a,x)=>a+(x.failedNavigation||0),0),0)/Math.max(1,(baseline.matches||[]).length)).toFixed(2)}};}catch(error){comparison={error:String(error)}}}
await mkdir('artifacts',{recursive:true});await writeFile(out,JSON.stringify({at:new Date().toISOString(),gameVersion:'0.1.0',aiVersion:'troll-brain-v3',step:.1,count,elapsedSeconds:(performance.now()-start)/1000,summary,comparison,matches:rows},null,2));console.table(summary);console.log(`${count} partidas · ${((performance.now()-start)/1000).toFixed(1)}s · ${out}`);if(comparison)console.log('comparação',JSON.stringify(comparison));
if(rows.some(r=>!r.completed))process.exitCode=1;
