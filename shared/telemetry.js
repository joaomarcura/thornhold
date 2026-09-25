// Bounded diagnostics; no hidden observations are fed back into decisions.
export class CombatTelemetry {
  constructor(detailed=false){
    this.detailed=detailed;this.timeline=[];this.nextSample=0;this.hits=new Map();
    this.received={tower:0,elf:0,hunger:0,other:0};this.dealt=0;this.dealtToBuildings=0;this.combatSeconds=0;this.retreatSeconds=0;this.movingWithoutCombatSeconds=0;
    this.healing={consumable:0,regen:0,sanctuary:0,uses:0};this.retreats=[];this.currentRetreat=null;
    this.engagementCount=0;this.lastContact=-Infinity;this.peakTowers=0;this.peakAttackers=0;
    this.towersSeconds=0;this.death=null;this.destroyed={};this.eliminations=[];this.towerDiagnostics=new Map();
  }
  towerState(tower,status,dt){
    if(!tower)return;let row=this.towerDiagnostics.get(tower.id);
    if(!row){row={id:tower.id,owner:tower.owner||null,branch:tower.branch||'power',tier:tower.tier||1,shots:0,reasons:{},seconds:{},closestDistance:null};this.towerDiagnostics.set(tower.id,row);}
    row.branch=tower.branch||row.branch;row.tier=tower.tier||row.tier;row.reasons[status.reason]=(row.reasons[status.reason]||0)+1;row.seconds[status.reason]=(row.seconds[status.reason]||0)+dt;
    if(Number.isFinite(status.distance))row.closestDistance=row.closestDistance===null?status.distance:Math.min(row.closestDistance,status.distance);
  }
  towerShot(id){const row=this.towerDiagnostics.get(id);if(row)row.shots++;}
  hit(m,target,actual,source,kind,sourceId){
    if(target.kind&&target.hp<=0)this.destroyed[target.kind]=(this.destroyed[target.kind]||0)+1;
    if(target.hp<=0&&target.role&&!target.ghost)this.eliminations.push({time:m.time,id:target.id,role:target.role,cause:kind,source:sourceId||source?.id||null});
    if(target.role==='troll'){
      const category=kind==='tower'?'tower':kind==='hunger'?'hunger':source?.role==='elf'?'elf':'other';
      this.received[category]+=actual;
      if(kind!=='hunger')this.hits.set(sourceId||source?.id||kind,{time:m.time,kind});
      if(target.hp<=0)this.death={time:m.time,cause:kind,source:sourceId||source?.id||null};
    }
    if(source?.role==='troll'){this.dealt+=actual;if(target.kind)this.dealtToBuildings+=actual;}
    if(source?.role==='troll'||(target.role==='troll'&&kind!=='hunger')){
      if(m.time-this.lastContact>5)this.engagementCount++;
      this.lastContact=m.time;
    }
  }
  heal(kind,actual){if(actual>0)this.healing[kind]=(this.healing[kind]||0)+actual;}
  healUse(){this.healing.uses++;}
  retreatStart(m,u){if(this.currentRetreat)return;this.currentRetreat={start:m.time,hpPercent:u.hp/Math.max(1,u.maxHp)};}
  reengage(m,u){if(!this.currentRetreat)return;this.retreats.push({...this.currentRetreat,end:m.time,duration:m.time-this.currentRetreat.start,reengageHpPercent:u.hp/Math.max(1,u.maxHp)});this.currentRetreat=null;}
  step(m,dt){
    const t=m.units.find(u=>u.role==='troll');if(!t)return;
    for(const[id,hit]of this.hits)if(m.time-hit.time>2)this.hits.delete(id);
    const towers=[...this.hits.values()].filter(h=>h.kind==='tower').length;
    this.peakTowers=Math.max(this.peakTowers,towers);this.peakAttackers=Math.max(this.peakAttackers,this.hits.size);
    this.towersSeconds+=towers*dt;
    const c=m.controllers.get(t.id),inCombat=m.time-this.lastContact<=5,retreating=!!c?.retreating;
    if(inCombat)this.combatSeconds+=dt;
    if(retreating)this.retreatSeconds+=dt;
    if(!inCombat&&!retreating&&Math.hypot(t.input?.x||0,t.input?.z||0)>.1)this.movingWithoutCombatSeconds+=dt;
    if(this.detailed&&(m.time>=this.nextSample||!t.alive)){
      this.nextSample=m.time+5;const stats=m.trollStats(t);
      if(this.timeline.length<500)this.timeline.push({time:+m.time.toFixed(1),hp:Math.round(t.hp),maxHp:t.maxHp,
        x:+t.x.toFixed(1),z:+t.z.toFixed(1),state:c?.brain?.state||'human',target:c?.brain?.targetId||null,
        risk:c?.brain?.riskScore??null,towers,received:{...this.received},damage:this.dealt,
        armor:stats.armor,combatRegen:stats.combatRegen,restRegen:stats.restRegen,movement:stats.movement,levels:{...t.levels},
        economy:m.units.map(u=>({id:u.id,gold:Math.floor(u.gold),wood:Math.floor(u.wood),goldGenerated:Math.round(u.stats.goldGenerated),woodGenerated:Math.round(u.stats.woodGenerated)}))});
    }
  }
  result(m){
    const duration=Math.max(1,m.time),received=Object.values(this.received).reduce((a,b)=>a+b,0);
    const retreats=[...this.retreats];if(this.currentRetreat)retreats.push({...this.currentRetreat,end:m.time,duration:m.time-this.currentRetreat.start,reengageHpPercent:null});
    const avg=key=>retreats.length?retreats.reduce((n,r)=>n+(r[key]??0),0)/retreats.length:0;
    return {schema:2,received:{...this.received},dealt:this.dealt,dealtToBuildings:this.dealtToBuildings,combatSeconds:this.combatSeconds,retreatSeconds:this.retreatSeconds,movingWithoutCombatSeconds:this.movingWithoutCombatSeconds,
      combatTimePercent:this.combatSeconds/duration*100,retreatTimePercent:this.retreatSeconds/duration*100,movingWithoutCombatPercent:this.movingWithoutCombatSeconds/duration*100,
      averageRetreatDuration:avg('duration'),averageRetreatHpPercent:avg('hpPercent')*100,averageReengageHpPercent:avg('reengageHpPercent')*100,retreats,healing:{...this.healing},
      receivedDps:received/duration,dealtDps:this.dealt/duration,damagePerMinute:this.dealt/duration*60,buildingDamagePerMinute:this.dealtToBuildings/duration*60,
      combatReceivedDps:(received-this.received.hunger)/Math.max(1,this.combatSeconds),
      combatDealtDps:this.dealt/Math.max(1,this.combatSeconds),
      engagementCount:this.engagementCount,averageEngagementSeconds:this.combatSeconds/Math.max(1,this.engagementCount),
      peakSimultaneousTowers:this.peakTowers,peakSimultaneousAttackers:this.peakAttackers,
      averageSimultaneousTowers:this.towersSeconds/duration,death:this.death,
      trollSurvivalSeconds:this.death?.time??m.time,survivalCensored:!this.death,
      timeToElfDefeat:['army-eliminated','all-elf-bases-destroyed'].includes(m.endReason)?m.time:null,
      structuresDestroyed:{...this.destroyed},eliminations:this.eliminations,towerDiagnostics:[...this.towerDiagnostics.values()].map(row=>({...row,seconds:Object.fromEntries(Object.entries(row.seconds).map(([key,value])=>[key,+value.toFixed(2)])),closestDistance:row.closestDistance===null?null:+row.closestDistance.toFixed(2)})),timeline:this.timeline};
  }
}
