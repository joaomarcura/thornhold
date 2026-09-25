import { mkdir,writeFile } from 'node:fs/promises';
import { Match } from '../shared/simulation.js';
import { STATES } from '../shared/config.js';
import { aggregate } from './arena.js';

export const SKILL_SCENARIOS=[
  {name:'novice-troll',troll:'easy',elves:'normal'},
  {name:'average',troll:'normal',elves:'normal'},
  {name:'expert-troll',troll:'hard',elves:'normal'},
  {name:'novice-elves',troll:'normal',elves:'easy'},
  {name:'expert-elves',troll:'normal',elves:'hard'},
  {name:'one-afk-elf',troll:'normal',elves:'normal',afkElf:true}
];

export function slotsForProfile(profile){
  return [{id:'t',role:'troll',occupant:{type:'bot',name:'Troll',difficulty:profile.troll}},...Array.from({length:5},(_,index)=>({id:`e${index}`,role:'elf',occupant:{type:profile.afkElf&&index===0?'human':'bot',name:`Elfo ${index}`,difficulty:profile.elves}}))];
}

if(process.argv[1]?.endsWith('profile-lab.js')){
  const count=Math.max(1,Math.min(100,Number(process.argv[2])||10)),out=process.argv[3]||'artifacts/profile-lab.json',step=Number(process.env.SIM_STEP)||.1,maxSeconds=Math.max(600,Number(process.env.SIM_MAX_SECONDS)||1800),scenarios=[];
  for(const profile of SKILL_SCENARIOS){
    const rows=[];for(let run=0;run<count;run++){const match=new Match({seed:`PROFILE-${run}`,difficulty:'normal',mapSize:'compact',diagnostics:true},slotsForProfile(profile));for(let tick=0;tick<Math.ceil(maxSeconds/step)&&match.state!==STATES.END;tick++)match.step(step);rows.push({run,profile:profile.name,completed:match.state===STATES.END,...match.result()});}
    scenarios.push({profile,...aggregate(rows),matches:rows});console.log(`${profile.name}: ${rows.filter(row=>row.completed).length}/${count}`);
  }
  const report={schema:1,count,step,maxSeconds,scenarios};await mkdir('artifacts',{recursive:true});await writeFile(out,JSON.stringify(report,null,2));console.log(JSON.stringify({schema:report.schema,count,step,maxSeconds,scenarios:scenarios.map(scenario=>({name:scenario.profile.name,completed:scenario.completed,trollWins:scenario.trollWins,elfWins:scenario.elfWins,unfinished:scenario.unfinished,median:scenario.duration?.median,quality:scenario.quality?.score}))},null,2));
}
