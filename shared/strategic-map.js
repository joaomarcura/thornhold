import { BALANCE as B, distance, income, towerDamage, towerProfile } from './config.js';

const clamp01=value=>Math.max(0,Math.min(1,value));
const rounded=value=>Number.isFinite(value)?+value.toFixed(2):0;
const confidence=age=>Math.exp(-Math.max(0,age)/120);

// Persistent, imperfect memory owned by one Troll brain. It only receives
// entities that were visible to that Troll; it never scans the authoritative
// world for hidden targets.
export class StrategicMap {
  constructor(grid=6){this.grid=grid;this.sectors=new Map();this.observations=new Map();this.lastSectorId=null;this.lastDamageReceived=0;this.lastDamageDealt=0;}
  dimensions(match){return Math.max(1,(match.map.size-1)*match.map.cell);}
  idAt(match,point){const width=this.dimensions(match),x=Math.max(0,Math.min(this.grid-1,Math.floor(point.x/width*this.grid))),z=Math.max(0,Math.min(this.grid-1,Math.floor(point.z/width*this.grid)));return `${x}:${z}`;}
  center(match,id){const[x,z]=id.split(':').map(Number),size=this.dimensions(match)/this.grid;return {x:(x+.5)*size,z:(z+.5)*size};}
  ensure(match,id){
    if(!this.sectors.has(id)){const[x,z]=id.split(':').map(Number);this.sectors.set(id,{id,x,z,lastVisitedAt:null,lastEnemySeenAt:null,visits:0,knownElves:new Set(),knownStructures:new Set(),previousSieges:0,failedSieges:0,successfulSieges:0,damageTakenHere:0,damageDealtHere:0});}
    return this.sectors.get(id);
  }
  update(match,troll,visible){
    const now=match.time,id=this.idAt(match,troll),sector=this.ensure(match,id);
    if(id!==this.lastSectorId){sector.visits++;this.lastSectorId=id;}sector.lastVisitedAt=now;
    for(const entity of visible){
      const entitySector=this.ensure(match,this.idAt(match,entity)),snapshot={id:entity.id,x:entity.x,z:entity.z,kind:entity.kind||null,role:entity.role||null,hp:entity.hp,maxHp:entity.maxHp,tier:entity.tier||1,coreTier:entity.coreTier||0,branch:entity.branch||'power',progress:entity.progress??1,baseId:entity.baseId||null,seenAt:now,sectorId:entitySector.id};
      this.observations.set(entity.id,snapshot);entitySector.lastEnemySeenAt=now;if(entity.kind)entitySector.knownStructures.add(entity.id);if(entity.role==='elf')entitySector.knownElves.add(entity.id);
    }
    // Units become stale quickly; structures remain as uncertain memories.
    for(const[id,observation]of this.observations){const age=now-observation.seenAt;if((observation.role&&age>30)||age>600)this.observations.delete(id);}
    const received=troll.stats.damageReceived||0,dealt=troll.stats.damage||0;sector.damageTakenHere+=Math.max(0,received-this.lastDamageReceived);sector.damageDealtHere+=Math.max(0,dealt-this.lastDamageDealt);this.lastDamageReceived=received;this.lastDamageDealt=dealt;
  }
  recordSiege(match,point,successful){const sector=this.ensure(match,this.idAt(match,point));sector.previousSieges++;if(successful)sector.successfulSieges++;else sector.failedSieges++;}
  report(match,troll){
    const now=match.time,speed=Math.max(.1,match.trollStats(troll).movement);
    return [...this.sectors.values()].map(sector=>{
      const memories=[...this.observations.values()].filter(o=>o.sectorId===sector.id),weighted=memories.map(o=>({...o,confidence:confidence(now-o.seenAt)})),knownStructures=weighted.filter(o=>o.kind),knownElves=weighted.filter(o=>o.role==='elf'),estimatedTowerDps=weighted.filter(o=>o.kind==='tower'&&o.progress>=1).reduce((total,tower)=>{const profile=towerProfile(tower);return total+towerDamage(tower.tier)*profile.damage/(B.structures.tower.interval*profile.interval)*tower.confidence;},0),estimatedStructureHp=knownStructures.reduce((total,o)=>total+o.hp*o.confidence,0),estimatedEconomy=knownStructures.reduce((total,o)=>total+income(o)*o.confidence,0),travelCost=distance(troll,this.center(match,sector.id))/speed,riskScore=estimatedTowerDps+sector.damageTakenHere*.015+sector.failedSieges*12,strategicValue=estimatedEconomy*18+estimatedStructureHp*.015+knownElves.length*30-sector.failedSieges*8,lastEvidence=memories.length?Math.max(...memories.map(o=>o.seenAt)):sector.lastVisitedAt,informationConfidence=Number.isFinite(lastEvidence)?confidence(now-lastEvidence):0;
      return {id:sector.id,x:sector.x,z:sector.z,lastVisitedAt:sector.lastVisitedAt,lastEnemySeenAt:sector.lastEnemySeenAt,knownElves:knownElves.length,knownStructures:knownStructures.length,estimatedTowerDps:rounded(estimatedTowerDps),estimatedStructureHp:rounded(estimatedStructureHp),estimatedEconomy:rounded(estimatedEconomy),riskScore:rounded(riskScore),strategicValue:rounded(strategicValue),previousSieges:sector.previousSieges,failedSieges:sector.failedSieges,successfulSieges:sector.successfulSieges,damageTakenHere:rounded(sector.damageTakenHere),damageDealtHere:rounded(sector.damageDealtHere),travelCost:rounded(travelCost),confidence:rounded(clamp01(informationConfidence))};
    });
  }
}
