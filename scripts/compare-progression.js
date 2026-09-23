import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename } from 'node:path';

const files=process.argv.slice(2);
if(files.length<2)throw new Error('Informe ao menos dois relatórios de audit:progression com as mesmas seeds e o mesmo passo.');
const key=r=>[r.seed,r.mapSize,r.elves,r.elfDifficulty,r.trollDifficulty].join('/');
const median=values=>{
  const v=values.filter(Number.isFinite).sort((a,b)=>a-b);
  return v.length?(v[Math.floor((v.length-1)/2)]+v[Math.ceil((v.length-1)/2)])/2:null;
};
const reports=await Promise.all(files.map(async file=>({file,data:JSON.parse(await readFile(file,'utf8'))})));
const reference=reports[0].data,keys=reference.runs.map(key).sort();
const summary=reports.map(({file,data})=>{
  if(data.step!==reference.step||data.maxSeconds!==reference.maxSeconds||JSON.stringify(data.runs.map(key).sort())!==JSON.stringify(keys))throw new Error(`Lote incompatível: ${file}`);
  const done=data.runs.filter(r=>r.completed),maxUpgrades=Object.values(data.config.upgrades).every(u=>Number.isFinite(u.max)&&u.max>0)?Object.values(data.config.upgrades).reduce((sum,u)=>sum+u.max,0):null;
  const maxed=data.runs.map(r=>Object.values(r.milestones.t.purchases).flat()).filter(a=>maxUpgrades!==null&&a.length===maxUpgrades).map(a=>Math.max(...a));
  const groupSummary=(mapSize,elves,elfDifficulty)=>{
    const group=data.runs.filter(r=>r.mapSize===mapSize&&r.elves===elves&&r.elfDifficulty===elfDifficulty),completed=group.filter(r=>r.completed);
    return {mapSize,elves,elfDifficulty,runs:group.length,completed:completed.length,trollWins:completed.filter(r=>r.winner==='troll').length,medianCompletedSeconds:median(completed.map(r=>r.duration)),medianFirstHit:median(group.map(r=>r.firstHit))};
  };
  return {file,name:basename(file,'.json'),runs:data.runs.length,completed:done.length,censored:data.runs.length-done.length,
    trollWins:done.filter(r=>r.winner==='troll').length,elfWins:done.filter(r=>r.winner==='elves').length,
    hungerDeaths:done.filter(r=>r.trollDeathCause==='hunger').length,
    medianCompletedSeconds:median(done.map(r=>r.duration)),withinTarget:done.filter(r=>r.duration>=720&&r.duration<=1080).length,
    shortestSeconds:Math.min(...done.map(r=>r.duration)),longestCompletedSeconds:Math.max(...done.map(r=>r.duration)),
    trollMaxed:{runs:maxed.length,earliestSeconds:maxed.length?Math.min(...maxed):null,medianSeconds:median(maxed)},
    groups:[...new Set(data.runs.map(r=>r.mapSize))].flatMap(map=>[...new Set(data.runs.map(r=>r.elves))].flatMap(elves=>[...new Set(data.runs.map(r=>r.elfDifficulty))].map(difficulty=>groupSummary(map,elves,difficulty))))};
});
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/progression-comparison.json',JSON.stringify({generated:new Date().toISOString(),step:reference.step,maxSeconds:reference.maxSeconds,notes:'Seeds pareadas. Medianas de duração excluem partidas sem vencedor no limite; não são duração estimada do lote inteiro. Amostra de bots não estima equilíbrio humano. Os totais misturam tamanhos de lobby: consulte os grupos.',summary},null,2));
console.table(summary.map(({groups,trollMaxed,...s})=>s));
