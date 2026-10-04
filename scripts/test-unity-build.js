import { spawn } from 'node:child_process';
import { access, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createGameServer } from '../server/index.js';

const build = fileURLToPath(new URL('../unity/Thornhold/Builds/Windows/Thornhold.exe',import.meta.url));
await access(build);
const directory = new URL('../artifacts/unity/',import.meta.url); await mkdir(directory,{recursive:true});
const app = await createGameServer({port:0,host:'127.0.0.1',telemetry:false,devMode:true});
try {
  for (const role of ['elf','troll','observer','coop']) {
    const log = fileURLToPath(new URL('native-'+role+'.log',directory));
    const capture=process.env.THORNHOLD_CAPTURE==='1',options=capture?['-screen-width','1280','-screen-height','720','-thornholdCapture',fileURLToPath(new URL('capture-'+role+'-'+Date.now()+'.png',directory))]:['-nographics'];
    await new Promise((resolve,reject)=>{
      // Standalone batch mode skips normal presentation. GPU QA uses a real rendered player.
      const process = spawn(build,[...(capture?[]:['-batchmode']),...options,'-thornholdSmoke',`ws://127.0.0.1:${app.port}`,'-thornholdRole',role,'-logFile',log],{windowsHide:true});
      const timer=setTimeout(()=>{process.kill();reject(new Error('Native smoke timed out: '+role));},80000);
      process.once('error',error=>{clearTimeout(timer);reject(error);});
      process.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error(`Native ${role} failed (${code}); inspect ${log}`));});
    });
    const text = await readFile(log,'utf8');
    if(!text.includes('THORNHOLD_NATIVE_SMOKE_OK: '+role)||text.includes('Exception:'))throw new Error('Native log did not pass cleanly: '+role);
    console.log('PASS: compiled Windows Unity scene + authoritative server — '+role);
  }
} finally { await app.close(); }
