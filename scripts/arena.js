import { Worker,isMainThread,parentPort,workerData } from 'node:worker_threads';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Match } from '../shared/simulation.js';
import { BALANCE, DEFAULT_SETTINGS, STATES } from '../shared/config.js';
import { RELEASE } from '../shared/version.js';

const clampScore=value=>Math.max(0,Math.min(100,value));
export function balanceQuality(rows){
  const completed=rows.filter(row=>row.completed&&row.winner),median=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)*.5)]??0;},rate=count=>count/Math.max(1,rows.length)*100;
  const trollRate=completed.filter(row=>row.winner==='troll').length/Math.max(1,completed.length)*100,duration=median(rows.map(row=>row.duration)),earlyRate=rate(rows.filter(row=>row.duration<480).length),longRate=rate(rows.filter(row=>row.duration>1500).length),unfinishedRate=rate(rows.filter(row=>!row.completed).length),failedNavigation=rows.reduce((sum,row)=>sum+(row.ai||[]).reduce((n,ai)=>n+(ai.failedNavigation||0),0),0)/Math.max(1,rows.length);
  const components={winRate:clampScore(100-Math.max(0,Math.abs(trollRate-50)-5)*4),duration:duration>=780&&duration<=900?100:clampScore(100-Math.min(Math.abs(duration-780),Math.abs(duration-900))*.3),resolution:clampScore(100-unfinishedRate*10),earlyGame:clampScore(100-Math.max(0,earlyRate-10)*5),longGame:clampScore(100-Math.max(0,longRate-10)*5),navigation:clampScore(100-Math.max(0,failedNavigation-20)*1.5)};
  const score=components.winRate*.3+components.duration*.25+components.resolution*.2+components.earlyGame*.1+components.longGame*.05+components.navigation*.1;
  return {score:+score.toFixed(1),components:Object.fromEntries(Object.entries(components).map(([key,value])=>[key,+value.toFixed(1)])),observed:{trollWinRate:+trollRate.toFixed(1),medianDuration:duration,earlyRate:+earlyRate.toFixed(1),longRate:+longRate.toFixed(1),unfinishedRate:+unfinishedRate.toFixed(1),failedNavigation:+failedNavigation.toFixed(1)}};
}

export function aggregate(rows){
  const mean=v=>v.length?v.reduce((a,b)=>a+b,0)/v.length:0;
  const distribution=v=>{const s=[...v].sort((a,b)=>a-b),p=n=>s[Math.floor((s.length-1)*n)]??null;return {mean:mean(s),median:p(.5),p10:p(.1),p90:p(.9)};};
  const troll=r=>r.ai.find(a=>a.role==='troll')||{};
  const trollPlayer=r=>r.players.find(p=>p.role==='troll')||{};
  const trollEconomy=rows.map(r=>{const p=trollPlayer(r),damage=p.goldFromDamage||0,objectives=p.goldFromObjectives||0,threat=p.goldFromThreat||0,total=damage+objectives+threat;return {damage,objectives,threat,total,damageShare:total?damage/total:0,objectiveShare:total?objectives/total:0,threatShare:total?threat/total:0};});
  const v2=rows.map(r=>r.telemetry?.v2).filter(Boolean),sieges=v2.flatMap(v=>v.sieges||[]),states=[...new Set(v2.flatMap(v=>Object.keys(v.stateSeconds||{})))],milestone=name=>v2.map(v=>v.progression?.milestones?.[name]).filter(Number.isFinite);
  const checkpoints=[180,300,480,600,720,900,1200].map(time=>{const samples=v2.flatMap(v=>v.economyCheckpoints||[]).filter(c=>c.time===time);return samples.length?{time,samples:samples.length,elfGoldIncomePerSecond:mean(samples.map(c=>c.elves.goldIncomePerSecond)),elfWoodIncomePerSecond:mean(samples.map(c=>c.elves.woodIncomePerSecond)),elfGeneratedGold:mean(samples.map(c=>c.elves.generatedGold)),elfSpentGold:mean(samples.map(c=>c.elves.spentGold)),elfNetSpentGold:mean(samples.map(c=>c.elves.netSpentGold||0)),elfStoredGold:mean(samples.map(c=>c.elves.storedGold)),elfGoldUtilization:mean(samples.map(c=>c.elves.goldUtilization||0)),elfWoodUtilization:mean(samples.map(c=>c.elves.woodUtilization||0)),elfEconomyInvestmentGold:mean(samples.map(c=>c.elves.spendByPurpose?.economy?.gold||0)),elfDefenseInvestmentGold:mean(samples.map(c=>c.elves.spendByPurpose?.defense?.gold||0)),elfUpgradeInvestmentGold:mean(samples.map(c=>c.elves.spendByAction?.upgrade?.gold||0)),elfUpgrades:mean(samples.map(c=>c.elves.upgrades)),trollGeneratedGold:mean(samples.map(c=>c.troll?.generatedGold||0)),trollSpentGold:mean(samples.map(c=>c.troll?.spentGold||0))}:null;}).filter(Boolean);
  return {runs:rows.length,quality:balanceQuality(rows),duration:distribution(rows.map(r=>r.duration)),trollWins:rows.filter(r=>r.winner==='troll').length,
    elfWins:rows.filter(r=>r.winner==='elves').length,timeLimit:rows.filter(r=>r.endReason==='time-limit-objective').length,
    unfinished:rows.filter(r=>!r.completed).length,under4Minutes:rows.filter(r=>r.duration<240).length,
    under8Minutes:rows.filter(r=>r.duration<480).length,over25Minutes:rows.filter(r=>r.duration>1500).length,
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
    trollEconomy:{damage:mean(trollEconomy.map(e=>e.damage)),objectives:mean(trollEconomy.map(e=>e.objectives)),threat:mean(trollEconomy.map(e=>e.threat)),damageShare:mean(trollEconomy.map(e=>e.damageShare))*100,objectiveShare:mean(trollEconomy.map(e=>e.objectiveShare))*100,threatShare:mean(trollEconomy.map(e=>e.threatShare))*100},
    meanGoldPerMinute:mean(rows.map(r=>r.players.filter(p=>p.role==='elf').reduce((n,p)=>n+p.goldPerMinute,0)/r.elves)),
    meanWoodPerMinute:mean(rows.map(r=>r.players.filter(p=>p.role==='elf').reduce((n,p)=>n+p.woodPerMinute,0)/r.elves)),
    v2:{observedRuns:v2.length,stateSeconds:Object.fromEntries(states.map(state=>[state,mean(v2.map(v=>v.stateSeconds?.[state]||0))])),sieges:{count:sieges.length,perMatch:mean(v2.map(v=>v.siegeSummary?.count||0)),successRate:sieges.length?sieges.filter(s=>s.successful).length/sieges.length*100:0,averageSeconds:mean(sieges.map(s=>s.duration)),averageHpLossPercent:mean(sieges.map(s=>s.hpLossPercent)),averageTradeScore:mean(sieges.map(s=>s.tradeScore)),averageSiegeEfficiency:mean(sieges.map(s=>s.siegeEfficiency||0))},progression:{firstLegendaryStructure:distribution(milestone('firstLegendaryStructureAt')),firstLegendaryTower:distribution(milestone('firstLegendaryTowerAt')),firstEpicStructure:distribution(milestone('firstEpicStructureAt')),trollLegendarySword:distribution(milestone('trollLegendarySwordAt')),matchesWithLegendaryStructure:milestone('firstLegendaryStructureAt').length,matchesWithLegendaryTower:milestone('firstLegendaryTowerAt').length,matchesWithEpicStructure:milestone('firstEpicStructureAt').length,matchesWithTrollLegendarySword:milestone('trollLegendarySwordAt').length},economyCheckpoints:checkpoints,meanVisitedSectors:mean(v2.map(v=>v.sectors?.filter(s=>s.visits>0).length||0)),meanPressureGap:mean(v2.flatMap(v=>v.pressureWindows||[]).map(w=>w.pressureGap))}};
}
if(!isMainThread&&workerData?.indices){
  for(const i of workerData.indices){
    const difficulties=workerData.difficulties,scenarioCount=workerData.elfCounts.length*difficulties.length*workerData.mapSizes.length,scenario=i%scenarioCount,replicate=Math.floor(i/scenarioCount);
    const elves=workerData.elfCounts[scenario%workerData.elfCounts.length],difficulty=difficulties[Math.floor(scenario/workerData.elfCounts.length)%difficulties.length],mapSize=workerData.mapSizes[Math.floor(scenario/(workerData.elfCounts.length*difficulties.length))];
    const seed=workerData.seeds?.[i]||(workerData.crossed?'MATRIX-'+replicate:'SIM-'+i);
    const slots=[{id:'t',role:'troll',occupant:{type:'bot',name:'Troll',difficulty}},...Array.from({length:elves},(_,j)=>({id:'e'+j,role:'elf',occupant:{type:'bot',name:'Elfo '+j,difficulty}}))];
    const m=new Match({seed,difficulty,mapSize,diagnostics:true,breachEnabled:workerData.breachEnabled,adaptiveBuildEnabled:workerData.adaptiveBuildEnabled},slots);
    for(let tick=0;tick<Math.ceil(workerData.maxSeconds/workerData.step)&&m.state!==STATES.END;tick++)m.step(workerData.step);
    parentPort.postMessage({run:i,replicate,difficulty,mapSize,completed:m.state===STATES.END,...m.result()});
  }
}else if(process.argv[1]?.endsWith('arena.js')){
  const count=Math.min(1000,Math.max(1,Number(process.argv[2])||60)),out=process.argv[3]||'artifacts/arena.json',baselinePath=process.argv[4],step=Number(process.env.SIM_STEP)||.1;
  // Product balance always defaults to the standard 1x5 lobby. Alternate
  // populations require an explicit SIM_ELF_COUNTS override.
  const elfCounts=(process.env.SIM_ELF_COUNTS||'5').split(',').map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=8);
  const difficulties=(process.env.SIM_DIFFICULTIES||'normal').split(',').filter(n=>['easy','normal','hard'].includes(n));
  const mapSizes=(process.env.SIM_MAP_SIZES||'compact').split(',').filter(n=>['compact','large'].includes(n));
  const crossed=process.env.SIM_CROSSED==='1',seeds=(process.env.SIM_SEEDS||'').split(',').map(seed=>seed.trim()).filter(Boolean);
  const breachEnabled=process.env.SIM_BREACH==='1',adaptiveBuildEnabled=process.env.SIM_ADAPTIVE!=='0';
  const maxSeconds=Math.max(60,Number(process.env.SIM_MAX_SECONDS)||3600);
  if(!elfCounts.length)throw Error('SIM_ELF_COUNTS must contain at least one integer from 1 to 8');
  if(!difficulties.length)throw Error('SIM_DIFFICULTIES must contain easy, normal or hard');
  if(!mapSizes.length)throw Error('SIM_MAP_SIZES must contain compact or large');
  const start=performance.now(),rows=[],concurrency=Math.min(4,count);
  await Promise.all(Array.from({length:concurrency},(_,worker)=>new Promise((resolve,reject)=>{
    const w=new Worker(new URL(import.meta.url),{workerData:{indices:Array.from({length:count},(_,i)=>i).filter(i=>i%concurrency===worker),step,elfCounts,difficulties,mapSizes,maxSeconds,crossed,seeds,breachEnabled,adaptiveBuildEnabled}});
    w.on('message',r=>{rows.push(r);if(rows.length%10===0)console.log(rows.length+'/'+count+' completed');});
    w.on('error',reject);w.on('exit',code=>code?reject(new Error('Worker exit '+code)):resolve());
  })));
  rows.sort((a,b)=>a.run-b.run);
  const summary=aggregate(rows),groups=[];
  for(const mapSize of mapSizes)for(const elves of elfCounts)for(const difficulty of difficulties){const group=rows.filter(r=>r.mapSize===mapSize&&r.elves===elves&&r.difficulty===difficulty);if(group.length)groups.push({mapSize,elves,difficulty,...aggregate(group)});}
  let comparison=null;
  if(baselinePath){const baseline=JSON.parse(await readFile(baselinePath,'utf8')),paired=rows.map(r=>{const before=baseline.matches.find(b=>b.seed===r.seed&&b.elves===r.elves&&b.difficulty===r.difficulty&&(b.mapSize||'compact')===r.mapSize);if(!before)return null;return {seed:r.seed,durationDelta:r.duration-before.duration,trollDamageDelta:r.trollDamage-before.trollDamage,winnerBefore:before.winner,winnerAfter:r.winner};}).filter(Boolean);if(!paired.length)throw Error('No matching seeds in baseline');comparison={matchedRuns:paired.length,baseline:aggregate(baseline.matches.filter(b=>paired.some(r=>r.seed===b.seed))),current:aggregate(rows.filter(b=>paired.some(r=>r.seed===b.seed))),paired};}
  let gitCommit='unavailable',dirty=null;try{gitCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();dirty=!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim();}catch{}
  const metadata={release:RELEASE,gitCommit,dirty,node:process.version,generatedAt:new Date().toISOString(),configHash:createHash('sha256').update(JSON.stringify({BALANCE,DEFAULT_SETTINGS})).digest('hex'),defaultSettings:DEFAULT_SETTINGS,systems:{breachEnabled,adaptiveBuildEnabled},seedPattern:seeds.length?'explicit':crossed?'MATRIX-{replicate}':'SIM-{run}',seeds:seeds.length?seeds:undefined,crossedSeeds:crossed,simulationCeilingSeconds:maxSeconds,matrix:{elves:elfCounts,difficulty:difficulties,mapSize:mapSizes}};
  const result={schema:3,metadata,step,count,elapsedSeconds:(performance.now()-start)/1000,summary,groups,comparison,matches:rows};
  await mkdir('artifacts',{recursive:true});await writeFile(out,JSON.stringify(result,null,2));
  console.log(JSON.stringify({...result,matches:undefined,groups:undefined,comparison:comparison?{baseline:comparison.baseline,current:comparison.current,matchedRuns:comparison.matchedRuns}:null},null,2));
  if(summary.unfinished)process.exitCode=1;
}
