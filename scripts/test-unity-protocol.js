import { spawn } from 'node:child_process';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createGameServer } from '../server/index.js';
import { createSnapshotDelta } from '../shared/snapshot-delta.js';
import { RELEASE } from '../shared/version.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = new URL('../artifacts/unity/', import.meta.url);
await mkdir(directory, {recursive:true});
let sdk = process.env.THORNHOLD_DOTNET || fileURLToPath(new URL('../artifacts/unity-tools/dotnet/dotnet.exe', import.meta.url));
try { await access(sdk); } catch { sdk = 'dotnet'; }
const initial = {time:0, units:[{id:'elf',x:1,hp:100},{id:'troll',x:2,hp:2200}], structures:[], trees:[{id:'tree',amount:100}], events:[]};
const truth = [
  {...initial,time:.1,units:[{id:'troll',x:3,hp:2190},{id:'elf',x:2,hp:100}],events:[{id:1,type:'attack-animation'}]},
  {...initial,time:.2,units:[{id:'elf',x:2,hp:90}],structures:[{id:'wall',tier:1,hp:2541}],events:[],transient:true},
  {time:.3,units:[{id:'elf',x:3,hp:80,inventory:['a']},{id:'new',hp:20}],structures:[{id:'wall',tier:2,hp:2700}],trees:[],events:[]},
];
let previous = initial;
const steps = truth.map((expected,i) => {const delta=createSnapshotDelta(previous,expected,i+2);previous=expected;return {delta,expected};});
const fixture=fileURLToPath(new URL('protocol-fixture.json',directory));
await writeFile(fixture,JSON.stringify({protocol:RELEASE.protocol,initial,steps}));
async function run(arguments_) {
  return new Promise((resolve,reject)=>{
    const child=spawn(sdk,arguments_,{cwd:root,stdio:'inherit',windowsHide:true,
      env:{...process.env,DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_NOLOGO:'1',DOTNET_CLI_HOME:fileURLToPath(new URL('dotnet-home/',directory)),NUGET_PACKAGES:fileURLToPath(new URL('nuget/',directory)),DOTNET_SKIP_FIRST_TIME_EXPERIENCE:'1',DOTNET_ADD_GLOBAL_TOOLS_TO_PATH:'0'}});
    child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Unity protocol tests exited '+code)));
  });
}
await run(['restore','unity/ProtocolTests','--configfile','unity/ProtocolTests/NuGet.Config']);
const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false,devMode:true});
try {
  await run(['run','--no-restore','--project','unity/ProtocolTests','--',fixture,`ws://127.0.0.1:${app.port}`]);
} finally { await app.close(); }
