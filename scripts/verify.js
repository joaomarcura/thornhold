import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const tests=readdirSync('tests').filter(file=>file.endsWith('.test.js')).map(file=>'tests/'+file);
const steps=[
  ['Syntax',['scripts/check.js']],
  ['Rules and network',['--test',...tests]],
  ['Upgrade and resource UI',['scripts/browser-review.js']],
  ['Stun, relocation and score UI',['scripts/browser-stun-scoreboard.js']],
  ['Portuguese and English UI',['scripts/browser-i18n.js']]
];
for(const[name,args]of steps){
  console.log(`\n=== ${name} ===`);
  const result=spawnSync(process.execPath,args,{stdio:'inherit',env:process.env});
  if(result.error)console.error(result.error);
  if(result.status!==0)process.exit(result.status||1);
}
console.log('\nThornhold verification passed.');
