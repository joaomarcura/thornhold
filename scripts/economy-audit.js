import { readFile } from 'node:fs/promises';

const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
const rounded=value=>+value.toFixed(3);
const summarize=rows=>({
  samples:rows.length,
  generatedGold:rounded(mean(rows.map(r=>r.generatedGold||0))),
  spentGold:rounded(mean(rows.map(r=>r.spentGold||0))),
  storedGold:rounded(mean(rows.map(r=>r.storedGold||0))),
  goldUtilization:rounded(mean(rows.map(r=>r.goldUtilization||0))),
  woodUtilization:rounded(mean(rows.map(r=>r.woodUtilization||0))),
  economyGold:rounded(mean(rows.map(r=>r.economyGold||0))),
  defenseGold:rounded(mean(rows.map(r=>r.defenseGold||0))),
  upgradeGold:rounded(mean(rows.map(r=>r.upgradeGold||0)))
});

export function analyzeEconomy(artifact){
  const checkpoints=[];
  for(const match of artifact.matches||[])for(const checkpoint of match.telemetry?.v2?.economyCheckpoints||[])checkpoints.push({seed:match.seed,winner:match.winner||'unfinished',time:checkpoint.time,...checkpoint.elves,economyGold:checkpoint.elves.spendByPurpose?.economy?.gold||0,defenseGold:checkpoint.elves.spendByPurpose?.defense?.gold||0,upgradeGold:checkpoint.elves.spendByAction?.upgrade?.gold||0});
  const times=[...new Set(checkpoints.map(row=>row.time))].sort((a,b)=>a-b),profiles=[];
  for(const match of artifact.matches||[])for(const checkpoint of match.telemetry?.v2?.economyCheckpoints||[])for(const player of checkpoint.elves.players||[])profiles.push({...player,time:checkpoint.time,winner:match.winner||'unfinished',economyGold:player.spendByPurpose?.economy?.gold||0,defenseGold:player.spendByPurpose?.defense?.gold||0,upgradeGold:player.spendByAction?.upgrade?.gold||0});
  const byCheckpoint=times.map(time=>({time,...summarize(checkpoints.filter(row=>row.time===time))}));
  const profileNames=[...new Set(profiles.map(row=>row.profile))].sort(),byProfile=profileNames.map(profile=>({profile,...summarize(profiles.filter(row=>row.profile===profile))}));
  const outcomes=[...new Set(checkpoints.map(row=>row.winner))].sort(),byOutcome=outcomes.map(winner=>({winner,...summarize(checkpoints.filter(row=>row.winner===winner))}));
  const saturation=byCheckpoint.find(row=>row.goldUtilization<.75||row.storedGold>row.spentGold*.3)||null;
  return {schema:1,runs:artifact.matches?.length||0,byCheckpoint,byProfile,byOutcome,signals:{goldSaturationAt:saturation?.time||null,lateGoldUtilization:byCheckpoint.at(-1)?.goldUtilization??null,economyToDefenseGoldRatio:rounded(mean(checkpoints.map(row=>row.economyGold/Math.max(1,row.defenseGold))))}};
}

if(process.argv[1]?.endsWith('economy-audit.js')){
  const path=process.argv[2]||'artifacts/arena.json',artifact=JSON.parse(await readFile(path,'utf8'));
  console.log(JSON.stringify(analyzeEconomy(artifact),null,2));
}
