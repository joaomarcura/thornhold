import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const mode=process.argv[2]||'fast';
const tests=readdirSync('tests').filter(file=>file.endsWith('.test.js')).map(file=>'tests/'+file);
const args=mode==='long'
  ?['--test','tests/long-autonomous.test.js']
  :['--test',...tests.filter(file=>!file.endsWith('/long-autonomous.test.js'))];
const result=spawnSync(process.execPath,args,{stdio:'inherit',env:process.env});
if(result.error)console.error(result.error);
process.exit(result.status||0);
