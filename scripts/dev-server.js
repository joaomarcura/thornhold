import { execFileSync } from 'node:child_process';
import { BALANCE } from '../shared/config.js';

if(!process.env.BUILD_SHA){
  try{const commit=execFileSync('git',['rev-parse','--short','HEAD'],{encoding:'utf8'}).trim(),dirty=execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim();process.env.BUILD_SHA=commit+(dirty?'-dirty':'');}
  catch{process.env.BUILD_SHA='local';}
}
const { createGameServer }=await import('../server/index.js');
const port=Number(process.env.PORT)||3000,host=process.env.HOST||'0.0.0.0';
const app=await createGameServer({port,host,devMode:true});
console.log(`THORNHOLD DEV · http://localhost:${app.port} · recursos + velocidades 1×/2×/4×/6×/8×/16× · ${BALANCE.tick} Hz`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});
