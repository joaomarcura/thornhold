import { mkdir, writeFile } from 'node:fs/promises';
import { Match } from '../shared/simulation.js';
import { STATES } from '../shared/config.js';

const count=Math.min(2000,Math.max(1,Number(process.argv[2])||100)),out=process.argv[3]||'artifacts/simulations.json';
const rows=[],start=performance.now();
for(let i=0;i<count;i++){
  const elves=[2,3,5,8][i%4],difficulty=['easy','normal','hard'][Math.floor(i/4)%3];
  const slots=[{id:'t',role:'troll',occupant:{type:'bot',name:'Troll',difficulty}},...Array.from({length:elves},(_,j)=>({id:'e'+j,role:'elf',occupant:{type:'bot',name:'Elfo '+j,difficulty}}))];
  const m=new Match({seed:'SIM-'+i,difficulty},slots);
  // Fixed 100 ms integration preserves cooldowns and uses movement substeps. Live server uses 50 ms.
  for(let tick=0;tick<12000&&m.state!==STATES.END;tick++)m.step(.1);
  rows.push({run:i,difficulty,completed:m.state===STATES.END,...m.result()});
}
const summary=[];for(const elves of [2,3,5,8])for(const difficulty of ['easy','normal','hard']){
  const runs=rows.filter(r=>r.elves===elves&&r.difficulty===difficulty);if(!runs.length)continue;
  summary.push({elves,difficulty,runs:runs.length,completed:runs.filter(r=>r.completed).length,trollWinRate:Math.round(runs.filter(r=>r.winner==='troll').length/runs.length*100),meanSeconds:Math.round(runs.reduce((a,r)=>a+r.duration,0)/runs.length),meanBasesBroken:+(runs.reduce((a,r)=>a+r.basesDestroyed,0)/runs.length).toFixed(1)});
}
await mkdir('artifacts',{recursive:true});await writeFile(out,JSON.stringify({at:new Date().toISOString(),step:.1,count,elapsedSeconds:(performance.now()-start)/1000,summary,matches:rows},null,2));console.table(summary);console.log(`${count} partidas · ${((performance.now()-start)/1000).toFixed(1)}s · ${out}`);
if(rows.some(r=>!r.completed))process.exitCode=1;
