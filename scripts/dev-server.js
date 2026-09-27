import { createGameServer } from '../server/index.js';
import { BALANCE } from '../shared/config.js';

const port=Number(process.env.PORT)||3000,host=process.env.HOST||'0.0.0.0';
const app=await createGameServer({port,host,devMode:true});
console.log(`THORNHOLD DEV · http://localhost:${app.port} · recursos + velocidades 1×/2×/4×/6×/8×/16× · ${BALANCE.tick} Hz`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});
