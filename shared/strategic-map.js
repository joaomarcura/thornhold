import { distance, income } from './config.js';
import { evaluateThreatAt } from './combat-risk.js';

const clamp01=value=>Math.max(0,Math.min(1,value));
const rounded=value=>Number.isFinite(value)?+value.toFixed(2):0;
const confidence=age=>Math.exp(-Math.max(0,age)/120);

// Persistent, imperfect memory owned by one Troll brain. It only receives
// entities that were visible to that Troll; it never scans the authoritative
// world for hidden targets.
export class StrategicMap {
  constructor(grid=6){this.grid=grid;this.sectors=new Map();this.observations=new Map();this.lastSectorId=null;this.lastDamageReceived=0;this.lastDamageDealt=0;this.reportAt=-Infinity;this.reportCache=null;}
  dimensions(match){return Math.max(1,(match.map.size-1)*match.map.cell);}
  idAt(match,point){const width=this.dimensions(match),x=Math.max(0,Math.min(this.grid-1,Math.floor(point.x/width*this.grid))),z=Math.max(0,Math.min(this.grid-1,Math.floor(point.z/width*this.grid)));return `${x}:${z}`;}
  center(match,id){const[x,z]=id.split(':').map(Number),size=this.dimensions(match)/this.grid;return {x:(x+.5)*size,z:(z+.5)*size};}
  ensure(match,id){
    if(!this.sectors.has(id)){const[x,z]=id.split(':').map(Number);this.sectors.set(id,{id,x,z,lastVisitedAt:null,lastEnemySeenAt:null,visits:0,knownElves:new Set(),knownStructures:new Set(),previousSieges:0,failedSieges:0,successfulSieges:0,damageTakenHere:0,damageDealtHere:0});}
    return this.sectors.get(id);
  }
  update(match,troll,visible){
    this.reportCache=null;
    const now=match.time,id=this.idAt(match,troll),sector=this.ensure(match,id);
    if(id!==this.lastSectorId){sector.visits++;this.lastSectorId=id;}sector.lastVisitedAt=now;
    for(const entity of visible){
      const entitySector=this.ensure(match,this.idAt(match,entity)),snapshot={id:entity.id,x:entity.x,z:entity.z,kind:entity.kind||null,role:entity.role||null,hp:entity.hp,maxHp:entity.maxHp,tier:entity.tier||1,coreTier:entity.coreTier||0,branch:entity.branch||'power',progress:entity.progress??1,baseId:entity.baseId||null,seenAt:now,sectorId:entitySector.id};
      this.observations.set(entity.id,snapshot);entitySector.lastEnemySeenAt=now;if(entity.kind)entitySector.knownStructures.add(entity.id);if(entity.role==='elf')entitySector.knownElves.add(entity.id);
    }
    // Structures remain as uncertain memories only while their last known
    // position has not been checked again. Seeing an empty location is real
    // information and must invalidate it, otherwise FINISHER can walk between
    // already-destroyed objectives for several minutes.
    const visibleIds=new Set(visible.map(entity=>entity.id));
    for(const[id,observation]of this.observations){
      const age=now-observation.seenAt,disproved=match.canSee(troll,observation)&&!visibleIds.has(id);
      if(disproved||(observation.role&&age>30)||age>600){
        this.observations.delete(id);
        const rememberedSector=this.sectors.get(observation.sectorId);
        rememberedSector?.knownStructures.delete(id);rememberedSector?.knownElves.delete(id);
      }
    }
    const received=troll.stats.damageReceived||0,dealt=troll.stats.damage||0;sector.damageTakenHere+=Math.max(0,received-this.lastDamageReceived);sector.damageDealtHere+=Math.max(0,dealt-this.lastDamageDealt);this.lastDamageReceived=received;this.lastDamageDealt=dealt;
  }
  recordSiege(match,point,successful){this.reportCache=null;const sector=this.ensure(match,this.idAt(match,point));sector.previousSieges++;if(successful)sector.successfulSieges++;else sector.failedSieges++;}
  report(match,troll){
    const now=match.time,speed=Math.max(.1,match.trollStats(troll).movement);
    if(this.reportCache&&this.reportAt===now)return this.reportCache;
    const rows=[...this.sectors.values()].map(sector=>{
      const memories=[...this.observations.values()].filter(o=>o.sectorId===sector.id),allWeighted=[...this.observations.values()].map(o=>({...o,confidence:confidence(now-o.seenAt)})),weighted=allWeighted.filter(o=>o.sectorId===sector.id),knownStructures=weighted.filter(o=>o.kind),knownElves=weighted.filter(o=>o.role==='elf'),center=this.center(match,sector.id),size=this.dimensions(match)/this.grid,samples=[center,...[-.4,0,.4].flatMap(dx=>[-.4,0,.4].map(dz=>({x:center.x+dx*size,z:center.z+dz*size})))],estimatedTowerDps=Math.max(...samples.map(position=>evaluateThreatAt(match,troll,allWeighted,{position,projected:true}).dps),0),estimatedStructureHp=knownStructures.reduce((total,o)=>total+o.hp*o.confidence,0),estimatedEconomy=knownStructures.reduce((total,o)=>total+income(o)*o.confidence,0),travelCost=distance(troll,center)/speed,riskScore=estimatedTowerDps+sector.damageTakenHere*.015+sector.failedSieges*12,strategicValue=estimatedEconomy*18+estimatedStructureHp*.015+knownElves.length*30-sector.failedSieges*8,lastEvidence=memories.length?Math.max(...memories.map(o=>o.seenAt)):sector.lastVisitedAt,informationConfidence=Number.isFinite(lastEvidence)?confidence(now-lastEvidence):0;
      return {id:sector.id,x:sector.x,z:sector.z,lastVisitedAt:sector.lastVisitedAt,lastEnemySeenAt:sector.lastEnemySeenAt,knownElves:knownElves.length,knownStructures:knownStructures.length,estimatedTowerDps:rounded(estimatedTowerDps),estimatedStructureHp:rounded(estimatedStructureHp),estimatedEconomy:rounded(estimatedEconomy),riskScore:rounded(riskScore),strategicValue:rounded(strategicValue),previousSieges:sector.previousSieges,failedSieges:sector.failedSieges,successfulSieges:sector.successfulSieges,damageTakenHere:rounded(sector.damageTakenHere),damageDealtHere:rounded(sector.damageDealtHere),travelCost:rounded(travelCost),confidence:rounded(clamp01(informationConfidence))};
    });
    this.reportAt=now;this.reportCache=rows;return rows;
  }
}
