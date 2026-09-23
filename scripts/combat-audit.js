import { mkdir, writeFile } from 'node:fs/promises';
import { Match } from '../shared/simulation.js';
import { BALANCE as B, STATES, structureHP, distance } from '../shared/config.js';

// Controlled firing lane: isolate combat rules from scouting, navigation and bot decisions.
// Prebuilt structures bypass placement, but damage, repair, costs and cooldowns use Match.
const rows=[];
for(const level of [0,2,4])for(const branch of level===0?['power']:Object.keys(B.branches)){
  for(const towers of [0,2,5])for(const repair of ['none','base','workshop'])for(const abilities of [false,true]){
    if(towers===0&&branch!=='power')continue;
    const m=new Match({seed:'COMBAT-AUDIT'},[
      {id:'t',role:'troll',occupant:{type:'human',name:'Troll'}},
      {id:'e',role:'elf',occupant:{type:'human',name:'Elfo'}}
    ]);
    const t=m.unit('t'),e=m.unit('e'),tier=level===4?4:level+1;
    const origin=m.map.size/2*m.map.cell;
    // Clearing the fixture removes accidental rock occlusion, not a gameplay rule.
    m.map.grid.fill(0);m.trees=[];m.state=STATES.ACTIVE;m.time=B.finalAge+1;
    Object.assign(t,{x:origin,z:origin,yaw:0,lastAttack:m.time});
    for(const key of Object.keys(t.levels))t.levels[key]=level;
    t.maxHp=t.hp=m.trollStats(t).maxHp;
    Object.assign(e,{x:origin,z:origin+8,gold:200,wood:200});
    function structure(kind,x,z,options={}){
      const hp=structureHP(kind,tier);
      const s={id:`s${m.structures.length}`,kind,owner:'e',baseId:'fixture',x,z,tier,hp,maxHp:hp,progress:1,healthProgress:1,lastHit:-100,lastShot:m.time,upgrading:0,bounty:hp*B.troll.goldPerDamage*1.3,branch,...options};
      m.structures.push(s);return s;
    }
    const wall=structure('wall',origin,origin+3.8);
    structure('core',origin+20,origin+8);
    if(repair==='workshop')structure('workshop',origin+10,origin+8);
    for(let i=0;i<towers;i++)structure('tower',origin+(i-(towers-1)/2)*2.2,origin+7);
    const start=m.time;let repairActions=0;
    const emit=m.emit.bind(m);m.emit=(kind,event)=>{if(kind==='repair')repairActions++;return emit(kind,event);};
    while(wall.hp>0&&t.alive&&m.time-start<180){
      if(abilities&&towers&&m.structures.some(s=>s.kind==='tower'&&distance(t,s)<B.troll.roarRange)&&!(t.cooldowns.roar>m.time))m.act('t',{type:'roar'});
      m.act('t',{type:'attack',heavy:abilities&&!(t.cooldowns.heavy>m.time)});
      if(repair!=='none'&&wall.hp>0)m.act('e',{type:'repair',target:wall.id});
      m.step(1/B.tick);
    }
    rows.push({trollLevel:level,wallTier:tier,branch,towers,repair,abilities,
      outcome:wall.hp<=0?'breach':!t.alive?'troll-death':'timeout',seconds:+(m.time-start).toFixed(2),
      wallRemaining:+(wall.hp/wall.maxHp).toFixed(3),trollRemaining:+(t.hp/t.maxHp).toFixed(3),
      repairActions,elfGold:+e.gold.toFixed(1),elfWood:e.wood,trollGold:+t.gold.toFixed(1)});
  }
}
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/combat-audit.json',JSON.stringify({
  step:1/B.tick,config:B,
  assumptions:'Arena sintética sem obstáculos; todas as torres têm alcance/visão e estão ao alcance do rugido. Estruturas pré-construídas, Troll parado de frente à barricada, níveis fixos, sem itens, compras ou fuga. Elfo começa com 200 ouro/200 madeira, núcleo produz renda e reparos custam recursos reais. Oficina tem o tier da barricada. Preparação do golpe, combo de três leves, exposição e armadura reais. Golpe pesado/rugido usados ao recarregar quando abilities=true. Fim na primeira ruptura/morte ou 180 segundos. Não prevê combate numa clareira real.',
  rows
},null,2));
console.table(rows.filter(r=>r.trollLevel===4&&r.towers===5&&r.repair==='workshop'));
console.log(`${rows.length} cenários em artifacts/combat-audit.json`);
