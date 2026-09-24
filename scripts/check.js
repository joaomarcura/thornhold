import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const files=[];
for(const directory of ['client','shared','server','scripts','tests'])
  for(const entry of await readdir(directory,{withFileTypes:true}))
    if(entry.isFile()&&entry.name.endsWith('.js'))files.push(directory+'/'+entry.name);
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0){console.error(file,result.stderr);process.exit(1);}}
console.log(files.length+' JavaScript files passed node --check. No compilation/typecheck step: native ES modules.');
