import { Worker,isMainThread,parentPort,workerData } from 'node:worker_threads';
import { mkdir,writeFile } from 'node:fs/promises';
import { Match } from '../shared/simulation.js';
import { BALANCE as B, STATES } from '../shared/config.js';

export const PARAMETERS=[
  {name:'towerDamage',path:['structures','tower','damage']},
  {name:'trollHp',path:['troll','hp']},
  {name:'trollDamage',path:['troll','damage']},
  {name:'barricadeHp',path:['structures','wall','hp']},
  {name:'trollGoldPerDamage',path:['troll','goldPerDamage']},
  {name:'exposureGrowth',path:['troll','exposureRate']},
  {name:'threatIncome',path:['economy','trollThreatRate']}
];
export const CANDIDATES=[
  {name:'wall5-tower2',overrides:[['barricadeHp',5],['towerDamage',2]]},
  {name:'wall10-tower2',overrides:[['barricadeHp',10],['towerDamage',2]]},
  {name:'wall5-tower3',overrides:[['barricadeHp',5],['towerDamage',3]]},
  {name:'wall10',overrides:[['barricadeHp',10]]}
];

const valueAt=path=>path.reduce((value,key)=>value[key],B);
const setAt=(path,value)=>{let target=B;for(const key of path.slice(0,-1))target=target[key];target[path.at(-1)]=value;};
const rate=(rows,winner)=>rows.filter(row=>row.winner===winner).length/Math.max(1,rows.length)*100;
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)*.5)]??0;};
const summarizeRows=rows=>({runs:rows.length,completed:rows.filter(row=>row.completed).length,trollWins:rows.filter(row=>row.winner==='troll').length,elfWins:rows.filter(row=>row.winner==='elves').length,unfinished:rows.filter(row=>!row.completed).length,trollWinRate:+rate(rows,'troll').toFixed(2),medianDuration:median(rows.map(row=>row.duration)),under7Minutes:rows.filter(row=>row.duration<420).length});

export function compareVariant(name,percent,rows,baselineRows){
  const paired=rows.map(row=>({after:row,before:baselineRows.find(base=>base.seed===row.seed&&base.difficulty===row.difficulty)})).filter(pair=>pair.before),trollWinRate=rate(rows,'troll'),baselineWinRate=rate(baselineRows,'troll'),deltaWinRate=trollWinRate-baselineWinRate;
  return {name,percent,runs:rows.length,completed:rows.filter(row=>row.completed).length,trollWinRate:+trollWinRate.toFixed(2),deltaWinRate:+deltaWinRate.toFixed(2),medianDuration:median(rows.map(row=>row.duration)),deltaMedianDuration:median(rows.map(row=>row.duration))-median(baselineRows.map(row=>row.duration)),under7Minutes:rows.filter(row=>row.duration<420).length,unfinished:rows.filter(row=>!row.completed).length,fragility:percent?+Math.abs(deltaWinRate/percent).toFixed(3):0,winnerFlips:paired.filter(pair=>pair.before.winner!==pair.after.winner).length};
}

if(!isMainThread){
  const overrides=workerData.job.overrides||[[workerData.job.name,workerData.job.percent]];for(const[name,percent]of overrides){const parameter=PARAMETERS.find(item=>item.name===name);if(parameter)setAt(parameter.path,valueAt(parameter.path)*(1+percent/100));}
  const rows=[];
  for(let i=0;i<workerData.count;i++){
    const difficulty=['easy','normal','hard'][i%3],seed=`SENS-${i}`,slots=[{id:'t',role:'troll',occupant:{type:'bot',name:'Troll',difficulty}},...Array.from({length:5},(_,j)=>({id:`e${j}`,role:'elf',occupant:{type:'bot',name:`Elfo ${j}`,difficulty}}))],match=new Match({seed,difficulty,mapSize:'compact',diagnostics:true},slots);
    for(let tick=0;tick<Math.ceil(workerData.maxSeconds/workerData.step)&&match.state!==STATES.END;tick++)match.step(workerData.step);
    rows.push({seed,difficulty,completed:match.state===STATES.END,...match.result()});
  }
  parentPort.postMessage({job:workerData.job,rows});
}else if(process.argv[1]?.endsWith('sensitivity.js')){
  const count=Math.max(3,Math.min(100,Number(process.argv[2])||12)),out=process.argv[3]||'artifacts/sensitivity.json',step=Number(process.env.SIM_STEP)||.1,maxSeconds=Math.max(420,Number(process.env.SIM_MAX_SECONDS)||1200),candidateMode=process.env.SENS_MODE==='candidates',jobs=[{name:'baseline',percent:0},...(candidateMode?CANDIDATES:PARAMETERS.flatMap(parameter=>[-5,5].map(percent=>({name:parameter.name,percent}))))],results=[];
  let cursor=0,finished=0;
  await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{while(cursor<jobs.length){const job=jobs[cursor++],result=await new Promise((resolve,reject)=>{const worker=new Worker(new URL(import.meta.url),{workerData:{job,count,step,maxSeconds}});worker.on('message',resolve);worker.on('error',reject);worker.on('exit',code=>{if(code)reject(new Error(`Worker exit ${code}`));});});results.push(result);console.log(`${++finished}/${jobs.length} ${job.name} ${job.percent}%`);}}));
  const baseline=results.find(result=>result.job.name==='baseline').rows,variants=results.filter(result=>result.job.name!=='baseline').map(result=>({...compareVariant(result.job.name,result.job.percent||0,result.rows,baseline),overrides:result.job.overrides||null})).sort((a,b)=>candidateMode?b.deltaMedianDuration-a.deltaMedianDuration:b.fragility-a.fragility),report={schema:1,mode:candidateMode?'candidates':'sensitivity',count,step,maxSeconds,baseline:summarizeRows(baseline),variants,parameters:Object.fromEntries(PARAMETERS.map(parameter=>[parameter.name,{path:parameter.path.join('.'),baseline:valueAt(parameter.path)}]))};
  await mkdir('artifacts',{recursive:true});await writeFile(out,JSON.stringify({...report,matches:Object.fromEntries(results.map(result=>[`${result.job.name}:${result.job.percent}`,result.rows]))},null,2));console.log(JSON.stringify(report,null,2));
}
