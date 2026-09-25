import { Worker,isMainThread,parentPort,workerData } from 'node:worker_threads';
import { mkdir,writeFile } from 'node:fs/promises';
import { Match } from '../shared/simulation.js';
import { BALANCE as B, STATES } from '../shared/config.js';
import { balanceQuality } from './arena.js';

export const PARAMETERS=[
  {name:'towerDamage',path:['structures','tower','damage']},
  {name:'trollHp',path:['troll','hp']},
  {name:'trollDamage',path:['troll','damage']},
  {name:'barricadeHp',path:['structures','wall','hp']},
  {name:'trollGoldPerDamage',path:['troll','goldPerDamage']},
  {name:'exposureGrowth',path:['troll','exposureRate']},
  {name:'threatIncome',path:['economy','trollThreatRate']},
  {name:'discoveryBounty',path:['economy','trollObjective','discovery']}
];
export const CANDIDATES=[
  {name:'wall5-tower2',overrides:[['barricadeHp',5],['towerDamage',2]]},
  {name:'wall10-tower2',overrides:[['barricadeHp',10],['towerDamage',2]]},
  {name:'wall5-tower3',overrides:[['barricadeHp',5],['towerDamage',3]]},
  {name:'wall10',overrides:[['barricadeHp',10]]},
  {name:'discovery-50',overrides:[['discoveryBounty',150]]},
  {name:'discovery-75',overrides:[['discoveryBounty',275]]},
  {name:'discovery-100',overrides:[['discoveryBounty',400]]}
];
export const ABLATIONS=[
  {name:'exposure-off',absolute:[[['troll','exposureRate'],0]]},
  {name:'sanctuary-off',absolute:[[['troll','sanctuaryRegenRate'],0]]},
  {name:'healing-off',absolute:[[['troll','healCharges'],0],[['troll','healPercent'],0]]},
  {name:'threat-income-off',absolute:[[['economy','trollThreatRate'],0],[['economy','trollThreatCap'],0]]},
  {name:'legendary-off',absolute:[[['legendary','tier'],999],[['legendary','swordLevels'],999]]}
];

const valueAt=path=>path.reduce((value,key)=>value[key],B);
const setAt=(path,value)=>{let target=B;for(const key of path.slice(0,-1))target=target[key];target[path.at(-1)]=value;};
const rate=(rows,winner)=>rows.filter(row=>row.winner===winner).length/Math.max(1,rows.length)*100;
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)*.5)]??0;};
const summarizeRows=rows=>({runs:rows.length,completed:rows.filter(row=>row.completed).length,trollWins:rows.filter(row=>row.winner==='troll').length,elfWins:rows.filter(row=>row.winner==='elves').length,unfinished:rows.filter(row=>!row.completed).length,trollWinRate:+rate(rows,'troll').toFixed(2),medianDuration:median(rows.map(row=>row.duration)),under7Minutes:rows.filter(row=>row.duration<420).length,quality:balanceQuality(rows)});

export function compareVariant(name,percent,rows,baselineRows){
  const paired=rows.map(row=>({after:row,before:baselineRows.find(base=>base.seed===row.seed&&base.difficulty===row.difficulty)})).filter(pair=>pair.before),trollWinRate=rate(rows,'troll'),baselineWinRate=rate(baselineRows,'troll'),deltaWinRate=trollWinRate-baselineWinRate;
  const quality=balanceQuality(rows),baselineQuality=balanceQuality(baselineRows);return {name,percent,runs:rows.length,completed:rows.filter(row=>row.completed).length,trollWinRate:+trollWinRate.toFixed(2),deltaWinRate:+deltaWinRate.toFixed(2),medianDuration:median(rows.map(row=>row.duration)),deltaMedianDuration:median(rows.map(row=>row.duration))-median(baselineRows.map(row=>row.duration)),under7Minutes:rows.filter(row=>row.duration<420).length,unfinished:rows.filter(row=>!row.completed).length,quality,deltaQuality:+(quality.score-baselineQuality.score).toFixed(1),fragility:percent?+Math.abs(deltaWinRate/percent).toFixed(3):0,winnerFlips:paired.filter(pair=>pair.before.winner!==pair.after.winner).length};
}

if(!isMainThread){
  if(workerData.job.absolute)for(const[path,value]of workerData.job.absolute)setAt(path,value);
  else{const overrides=workerData.job.overrides||[[workerData.job.name,workerData.job.percent]];for(const[name,percent]of overrides){const parameter=PARAMETERS.find(item=>item.name===name);if(parameter)setAt(parameter.path,valueAt(parameter.path)*(1+percent/100));}}
  const rows=[];
  for(let i=0;i<workerData.count;i++){
    const difficulty=workerData.difficulty,seed=`SENS-${i}`,slots=[{id:'t',role:'troll',occupant:{type:'bot',name:'Troll',difficulty}},...Array.from({length:5},(_,j)=>({id:`e${j}`,role:'elf',occupant:{type:'bot',name:`Elfo ${j}`,difficulty}}))],match=new Match({seed,difficulty,mapSize:'compact',diagnostics:true},slots);
    for(let tick=0;tick<Math.ceil(workerData.maxSeconds/workerData.step)&&match.state!==STATES.END;tick++)match.step(workerData.step);
    rows.push({seed,difficulty,completed:match.state===STATES.END,...match.result()});
  }
  parentPort.postMessage({job:workerData.job,rows});
}else if(process.argv[1]?.endsWith('sensitivity.js')){
  const count=Math.max(3,Math.min(100,Number(process.argv[2])||12)),out=process.argv[3]||'artifacts/sensitivity.json',step=Number(process.env.SIM_STEP)||.1,maxSeconds=Math.max(420,Number(process.env.SIM_MAX_SECONDS)||1200),difficulty=process.env.SIM_DIFFICULTY||'normal',mode=process.env.SENS_MODE||'sensitivity',candidateMode=mode==='candidates',ablationMode=mode==='ablation',candidateNames=new Set((process.env.SENS_CANDIDATES||'').split(',').filter(Boolean)),candidates=candidateNames.size?CANDIDATES.filter(candidate=>candidateNames.has(candidate.name)):CANDIDATES,jobs=[{name:'baseline',percent:0},...(ablationMode?ABLATIONS:candidateMode?candidates:PARAMETERS.flatMap(parameter=>[-10,-5,5,10].map(percent=>({name:parameter.name,percent}))))],results=[];
  if(!['easy','normal','hard'].includes(difficulty))throw Error('SIM_DIFFICULTY must be easy, normal or hard');
  if(candidateMode&&candidateNames.size&&!candidates.length)throw Error('SENS_CANDIDATES did not match a known candidate');
  let cursor=0,finished=0;
  await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{while(cursor<jobs.length){const job=jobs[cursor++],result=await new Promise((resolve,reject)=>{const worker=new Worker(new URL(import.meta.url),{workerData:{job,count,step,maxSeconds,difficulty}});worker.on('message',resolve);worker.on('error',reject);worker.on('exit',code=>{if(code)reject(new Error(`Worker exit ${code}`));});});results.push(result);console.log(`${++finished}/${jobs.length} ${job.name}${job.percent===undefined?'':` ${job.percent}%`}`);}}));
  const baseline=results.find(result=>result.job.name==='baseline').rows,variants=results.filter(result=>result.job.name!=='baseline').map(result=>({...compareVariant(result.job.name,result.job.percent||0,result.rows,baseline),overrides:result.job.overrides||null,absolute:result.job.absolute||null})).sort((a,b)=>candidateMode?b.deltaMedianDuration-a.deltaMedianDuration:ablationMode?a.quality.score-b.quality.score:b.fragility-a.fragility),report={schema:2,mode,difficulty,count,step,maxSeconds,baseline:summarizeRows(baseline),variants,parameters:Object.fromEntries(PARAMETERS.map(parameter=>[parameter.name,{path:parameter.path.join('.'),baseline:valueAt(parameter.path)}]))};
  await mkdir('artifacts',{recursive:true});await writeFile(out,JSON.stringify({...report,matches:Object.fromEntries(results.map(result=>[`${result.job.name}:${result.job.percent}`,result.rows]))},null,2));console.log(JSON.stringify(report,null,2));
}
