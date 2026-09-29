import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const tests=readdirSync('tests').filter(file=>file.endsWith('.test.js')).map(file=>'tests/'+file);
const fast=process.argv.includes('--fast');
const steps=[
  ['Syntax',['scripts/check.js']],
  ['Rules and network',fast?['scripts/test-suite.js','fast']:['--test',...tests]],
  ['Troll sanctuary UI',['scripts/browser-sanctuary.js']],
  ['Upgrade and resource UI',['scripts/browser-review.js']],
  ['Stun, relocation and score UI',['scripts/browser-stun-scoreboard.js']],
  ['All-bot spectator UI',['scripts/browser-lifecycle.js']],
  ['Portuguese and English UI',['scripts/browser-i18n.js']],
  ['Account, ranking and profile UI',['scripts/browser-platform.js']],
  ['Accessibility preferences and remapped controls',['scripts/browser-accessibility.js']]
];
for(const[name,args]of steps){
  console.log(`\n=== ${name} ===`);
  const result=spawnSync(process.execPath,args,{stdio:'inherit',env:process.env});
  if(result.error)console.error(result.error);
  if(result.status!==0)process.exit(result.status||1);
}
console.log(`\nThornhold ${fast?'fast ':''}verification passed.`);
