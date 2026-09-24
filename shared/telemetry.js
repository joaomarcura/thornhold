// Bounded diagnostics; no hidden observations are fed back into decisions.
export class CombatTelemetry {
  constructor(detailed=false){
    this.detailed=detailed;this.timeline=[];this.nextSample=0;this.hits=new Map();
    this.received={tower:0,elf:0,hunger:0,other:0};this.dealt=0;this.combatSeconds=0;
    this.engagementCount=0;this.lastContact=-Infinity;this.peakTowers=0;this.peakAttackers=0;
    this.towersSeconds=0;this.death=null;this.destroyed={};this.eliminations=[];
  }
  hit(m,target,actual,source,kind,sourceId){
    if(target.kind&&target.hp<=0)this.destroyed[target.kind]=(this.destroyed[target.kind]||0)+1;
    if(target.hp<=0&&target.role)this.eliminations.push({time:m.time,id:target.id,role:target.role,cause:kind,source:sourceId||source?.id||null});
    if(target.role==='troll'){
      const category=kind==='tower'?'tower':kind==='hunger'?'hunger':source?.role==='elf'?'elf':'other';
      this.received[category]+=actual;
      if(kind!=='hunger')this.hits.set(sourceId||source?.id||kind,{time:m.time,kind});
      if(target.hp<=0)this.death={time:m.time,cause:kind,source:sourceId||source?.id||null};
    }
    if(source?.role==='troll')this.dealt+=actual;
    if(source?.role==='troll'||(target.role==='troll'&&kind!=='hunger')){
      if(m.time-this.lastContact>5)this.engagementCount++;
      this.lastContact=m.time;
    }
  }
  step(m,dt){
    const t=m.units.find(u=>u.role==='troll');if(!t)return;
    for(const[id,hit]of this.hits)if(m.time-hit.time>2)this.hits.delete(id);
    const towers=[...this.hits.values()].filter(h=>h.kind==='tower').length;
    this.peakTowers=Math.max(this.peakTowers,towers);this.peakAttackers=Math.max(this.peakAttackers,this.hits.size);
    this.towersSeconds+=towers*dt;
    if(m.time-this.lastContact<=5)this.combatSeconds+=dt;
    if(this.detailed&&(m.time>=this.nextSample||!t.alive)){
      this.nextSample=m.time+5;const c=m.controllers.get(t.id),stats=m.trollStats(t);
      if(this.timeline.length<500)this.timeline.push({time:+m.time.toFixed(1),hp:Math.round(t.hp),maxHp:t.maxHp,
        x:+t.x.toFixed(1),z:+t.z.toFixed(1),state:c?.brain?.state||'human',target:c?.brain?.targetId||null,
        risk:c?.brain?.riskScore??null,towers,received:{...this.received},damage:this.dealt,
        armor:stats.armor,regen:stats.regen,movement:stats.movement,levels:{...t.levels},
        economy:m.units.map(u=>({id:u.id,gold:Math.floor(u.gold),wood:Math.floor(u.wood),goldGenerated:Math.round(u.stats.goldGenerated),woodGenerated:Math.round(u.stats.woodGenerated)}))});
    }
  }
  result(m){
    const duration=Math.max(1,m.time),received=Object.values(this.received).reduce((a,b)=>a+b,0);
    return {schema:1,received:{...this.received},dealt:this.dealt,combatSeconds:this.combatSeconds,
      receivedDps:received/duration,dealtDps:this.dealt/duration,damagePerMinute:this.dealt/duration*60,
      combatReceivedDps:(received-this.received.hunger)/Math.max(1,this.combatSeconds),
      combatDealtDps:this.dealt/Math.max(1,this.combatSeconds),
      engagementCount:this.engagementCount,averageEngagementSeconds:this.combatSeconds/Math.max(1,this.engagementCount),
      peakSimultaneousTowers:this.peakTowers,peakSimultaneousAttackers:this.peakAttackers,
      averageSimultaneousTowers:this.towersSeconds/duration,death:this.death,
      trollSurvivalSeconds:this.death?.time??m.time,survivalCensored:!this.death,
      timeToElfDefeat:['army-eliminated','all-elf-bases-destroyed'].includes(m.endReason)?m.time:null,
      structuresDestroyed:{...this.destroyed},eliminations:this.eliminations,timeline:this.timeline};
  }
}
