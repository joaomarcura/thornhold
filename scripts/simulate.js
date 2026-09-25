import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { Match } from '../shared/simulation.js';
import { STATES } from '../shared/config.js';
import { randomFor } from '../shared/map.js';

const requestedCount=Math.min(2000,Math.max(1,Number(process.argv[2])||100)),out=process.argv[3]||'artifacts/simulations.json',baselinePath=process.argv[4]||'';
const requestedStep=Number(process.argv[5]),step=[.05,.1].includes(requestedStep)?requestedStep:.05;
const gameVersion=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version,aiVersion='elf-economy-v7-level20';
// Balance baselines always model the product's standard lobby. Smaller rosters
// belong in focused rule tests and must never be mixed into balance reports.
const STANDARD_ELVES=5,STANDARD_DIFFICULTY='normal',STANDARD_MAP='compact';
const seedRng=randomFor('THORNHOLD-RANKED-BASELINE-v1'),rankedSeed=()=>`RANK-${Array.from({length:16},()=>Math.floor(seedRng()*16).toString(16)).join('').toUpperCase()}`;
const selectedSeeds=(process.env.SIM_SEEDS||'').split(',').map(seed=>seed.trim()).filter(Boolean),seeds=selectedSeeds.length?selectedSeeds:Array.from({length:requestedCount},rankedSeed),count=seeds.length;
const rows=[],start=performance.now();
for(let i=0;i<count;i++){
  const elves=STANDARD_ELVES,difficulty=STANDARD_DIFFICULTY;
  const slots=[{id:'t',role:'troll',occupant:{type:'bot',name:'Troll',difficulty}},...Array.from({length:elves},(_,j)=>({id:'e'+j,role:'elf',occupant:{type:'bot',name:'Elfo '+j,difficulty}}))];
  const m=new Match({seed:seeds[i],difficulty,mapSize:STANDARD_MAP},slots);
  // 50 ms is live-server parity; 100 ms remains available for faster broad sweeps.
  for(let tick=0;tick<Math.ceil(1200/step)&&m.state!==STATES.END;tick++)m.step(step);
  rows.push({run:i,difficulty,completed:m.state===STATES.END,gameVersion,aiVersion,map:m.settings.mapSize,...m.result()});
}
const percentile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))]:0;};
const durationMetrics=matches=>{const durations=matches.map(r=>r.duration);return {minSeconds:Math.round(percentile(durations,0)),p10Seconds:Math.round(percentile(durations,.1)),medianSeconds:Math.round(percentile(durations,.5)),p90Seconds:Math.round(percentile(durations,.9)),maxSeconds:Math.round(percentile(durations,1)),underSixMinutes:matches.filter(r=>r.duration<=360).length,underSevenMinutes:matches.filter(r=>r.duration<=420).length,inTargetWindow:matches.filter(r=>r.duration>=720&&r.duration<=1080).length};};
const summary=[];for(const elves of [STANDARD_ELVES])for(const difficulty of [STANDARD_DIFFICULTY]){
  const runs=rows.filter(r=>r.elves===elves&&r.difficulty===difficulty);if(!runs.length)continue;
  const durations=runs.map(r=>r.duration),towerInteractions=runs.flatMap(r=>r.combatInteractions.filter(i=>i.source==='tower'));
  const telemetry=key=>runs.reduce((n,r)=>n+(r.telemetry?.[key]||0),0)/runs.length,healing=key=>runs.reduce((n,r)=>n+(r.telemetry?.healing?.[key]||0),0)/runs.length;
  summary.push({elves,difficulty,runs:runs.length,completed:runs.filter(r=>r.completed).length,trollWinRate:Math.round(runs.filter(r=>r.winner==='troll').length/runs.length*100),meanSeconds:Math.round(durations.reduce((a,r)=>a+r,0)/runs.length),medianSeconds:Math.round(percentile(durations,.5)),combatPct:+telemetry('combatTimePercent').toFixed(1),retreatPct:+telemetry('retreatTimePercent').toFixed(1),avgRetreat:+telemetry('averageRetreatDuration').toFixed(1),healUses:+healing('uses').toFixed(1),consumableHeal:Math.round(healing('consumable')),regenHeal:Math.round(healing('regen')),trollDpm:Math.round(telemetry('damagePerMinute')),structuresDestroyed:+(runs.reduce((n,r)=>n+Object.values(r.telemetry?.structuresDestroyed||{}).reduce((a,b)=>a+b,0),0)/runs.length).toFixed(1),meanBasesBroken:+(runs.reduce((a,r)=>a+r.basesDestroyed,0)/runs.length).toFixed(1)});
}
const aggregate=matches=>{const divisor=Math.max(1,matches.length),telemetry=key=>matches.reduce((n,r)=>n+(r.telemetry?.[key]||0),0)/divisor,healing=key=>matches.reduce((n,r)=>n+(r.telemetry?.healing?.[key]||0),0)/divisor;return {runs:matches.length,completed:matches.filter(r=>r.completed).length,timeouts:matches.filter(r=>!r.completed).length,trollWins:matches.filter(r=>r.winner==='troll').length,elfWins:matches.filter(r=>r.winner==='elves').length,trollWinRate:+(matches.filter(r=>r.winner==='troll').length/divisor*100).toFixed(1),meanSeconds:Math.round(matches.reduce((n,r)=>n+r.duration,0)/divisor),...durationMetrics(matches),meanFailedNavigation:+(matches.reduce((n,r)=>n+(r.ai||[]).reduce((a,x)=>a+(x.failedNavigation||0),0),0)/divisor).toFixed(2),combatPct:+telemetry('combatTimePercent').toFixed(1),retreatPct:+telemetry('retreatTimePercent').toFixed(1),averageRetreatSeconds:+telemetry('averageRetreatDuration').toFixed(1),consumableHealing:Math.round(healing('consumable')),regenHealing:Math.round(healing('regen')),sanctuaryHealing:Math.round(healing('sanctuary')),trollDamagePerMinute:Math.round(telemetry('damagePerMinute')),meanTowerDamage:Math.round(matches.reduce((n,r)=>n+(r.towerDamage||0),0)/divisor)};};
let comparison=null;if(baselinePath){try{const baseline=JSON.parse(await readFile(baselinePath,'utf8'));comparison={baseline:aggregate(baseline.matches||[]),current:aggregate(rows),delta:{timeouts:(rows.filter(r=>!r.completed).length-(baseline.matches||[]).filter(r=>!r.completed).length),trollWins:(rows.filter(r=>r.winner==='troll').length-(baseline.matches||[]).filter(r=>r.winner==='troll').length),meanSeconds:Math.round(rows.reduce((n,r)=>n+r.duration,0)/rows.length)-Math.round((baseline.matches||[]).reduce((n,r)=>n+r.duration,0)/Math.max(1,(baseline.matches||[]).length)),meanFailedNavigation:+(rows.reduce((n,r)=>n+(r.ai||[]).reduce((a,x)=>a+(x.failedNavigation||0),0),0)/rows.length-(baseline.matches||[]).reduce((n,r)=>n+(r.ai||[]).reduce((a,x)=>a+(x.failedNavigation||0),0),0)/Math.max(1,(baseline.matches||[]).length)).toFixed(2)}};}catch(error){comparison={error:String(error)}}}
await mkdir('artifacts',{recursive:true});await writeFile(out,JSON.stringify({at:new Date().toISOString(),gameVersion,aiVersion,scenario:{trolls:1,elves:STANDARD_ELVES,difficulty:STANDARD_DIFFICULTY,map:STANDARD_MAP,seedSet:selectedSeeds.length?'explicit':'ranked-format-v1'},step,count,elapsedSeconds:(performance.now()-start)/1000,summary,aggregate:aggregate(rows),comparison,matches:rows},null,2));console.table(summary);console.log(`${count} partidas · ${(step*1000).toFixed(0)} ms · ${((performance.now()-start)/1000).toFixed(1)}s · ${out}`);if(comparison)console.log('comparação',JSON.stringify(comparison));
if(rows.some(r=>!r.completed))process.exitCode=1;
