import { CRYSTAL_RULES } from './structure-specializations.js';
import { baseAt, flatGround, lineOfSight, flood, index, randomFor, toCell, walkable } from './map.js';
import { distance } from './config.js';

// Generated once per wave, never per frame. A seeded candidate list and
// farthest-point distribution keep deposits outside bases and spread them out.
export function spawnCrystalWave(match,wave){
  const rng=randomFor(`${match.map.seed}:crystal-wave:${wave}`),candidates=[],map=match.map,reachable=flood(map,toCell(map,map.elfSpawn));
  for(let attempt=0;attempt<1600&&candidates.length<100;attempt++){
    const x=(2+Math.floor(rng()*(map.size-4)))*map.cell,z=(2+Math.floor(rng()*(map.size-4)))*map.cell,p={x,z},cell=toCell(map,p);
    if(!walkable(map,cell.x,cell.z)||baseAt(map,p)||!flatGround(map,x,z,.8)||distance(p,map.trollSpawn)<15||distance(p,map.elfSpawn)<12)continue;
    if(match.trees.some(t=>t.amount>0&&distance(t,p)<2)||match.structures.some(s=>s.hp>0&&distance(s,p)<4)||match.specialNodes.some(n=>n.amount>0&&distance(n,p)<5))continue;
    if(!reachable.has(index(map,cell.x,cell.z)))continue;
    candidates.push(p);
  }
  const chosen=[];
  while(candidates.length&&chosen.length<CRYSTAL_RULES.deposits){
    const references=chosen.length?chosen:map.bases.map(b=>b.outside||b.gate),score=p=>Math.min(...references.map(other=>distance(p,other))),best=candidates.reduce((idx,p,i)=>score(p)>score(candidates[idx])?i:idx,0);
    chosen.push(candidates.splice(best,1)[0]);
  }
  for(const p of chosen)match.specialNodes.push({id:`crystal-${wave}-${match.nextId++}`,resource:'crystal',...p,amount:CRYSTAL_RULES.amount,maxAmount:CRYSTAL_RULES.amount,local:false,wave,spawnedAt:match.time});
  match.crystalWaves??=[];match.crystalWaves.push({wave,time:match.time,deposits:chosen.length,amount:chosen.length*CRYSTAL_RULES.amount});
  match.emit('crystal-wave',{wave,deposits:chosen.length,amount:chosen.length*CRYSTAL_RULES.amount});
}
export function crystalCollectStatus(match,u,node){
  if(u?.role!=='elf'||!u.alive)return 'Apenas Elfos vivos coletam cristais.';
  if(!node||node.resource!=='crystal'||node.amount<=0)return 'Depósito esgotado.';
  if(distance(u,node)>CRYSTAL_RULES.interaction||!lineOfSight(match.map,u,node))return 'Aproxime-se do cristal.';
  if((u.stunnedUntil||0)>match.time)return 'Atordoado.';
  return null;
}
export function stepCrystals(match){
  while((match.nextCrystalWave||0)<CRYSTAL_RULES.waves.length&&match.time>=CRYSTAL_RULES.waves[match.nextCrystalWave])spawnCrystalWave(match,match.nextCrystalWave++);
  for(const u of [...match.units].sort((a,b)=>(a.crystalChannel?.until??Infinity)-(b.crystalChannel?.until??Infinity))){
    const channel=u.crystalChannel;if(!channel)continue;
    const node=match.specialNodes.find(n=>n.id===channel.target),invalid=crystalCollectStatus(match,u,node);
    if(invalid||match.time-channel.lastHeldAt>CRYSTAL_RULES.heartbeat||Math.hypot(u.x-channel.x,u.z-channel.z)>.5||u.lastHit>channel.lastHit){match.emit('crystal-collect-cancel',{unit:u.id,entity:channel.target,reason:invalid||'interrompido'});u.crystalChannel=null;if(u.action==='gather')u.actionUntil=match.time;continue;}
    if(match.time+1e-6<channel.until)continue;
    const amount=node.amount;node.amount=0;node.collectedBy=u.id;node.collectedAt=match.time;u.specialResources.crystal+=amount;u.stats.crystalCollected=(u.stats.crystalCollected||0)+amount;u.stats.specialResourcesGenerated??={};u.stats.specialResourcesGenerated.crystal=(u.stats.specialResourcesGenerated.crystal||0)+amount;
    u.stats.crystalExpeditions=(u.stats.crystalExpeditions||0)+1;u.crystalExpedition=null;u.crystalChannel=null;u.cooldowns.gather=match.time+.2;
    match.emit('crystal-collected',{unit:u.id,entity:node.id,x:node.x,z:node.z,amount,duration:match.time-channel.startedAt,wave:node.wave});
  }
}
