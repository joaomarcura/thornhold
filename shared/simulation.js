import { BALANCE as B, STATES, DEFAULT_SETTINGS, clamp, distance, mitigation, structureHP, income, resourceProducer, upgradeCost, trollCost, scaling, towerDamage, wispIncome, mineEconomy } from './config.js';
import { generateMap, baseAt, toCell, walkable, index, lineOfSight, heightAt, flatGround } from './map.js';
import { AIController } from './controllers.js';
import { CombatTelemetry } from './telemetry.js';
import { playerSummary } from './score.js';
import { unitEffects, structureEffects } from './effects.js';
import { ITEMS, combatStats } from './equipment.js';
import { commandWisp, stepWisps, wispActive } from './wisps.js';
import { upgradeStatus } from './upgrade-rules.js';
import { cancelJob, jobRefund } from './jobs.js';

export class Match {
  constructor(settings,slots) {
    this.settings={...DEFAULT_SETTINGS,...settings};this.map=generateMap(this.settings.seed,this.settings.mapSize);
    this.time=0;this.devSpeed=1;this.state=STATES.PREP;this.structures=[];this.units=[];this.wisps=[];this.reveals=[];this.controllers=new Map();this.nextId=1;this.repairSequence=0;this.events=[];this.pings=[];this.eventId=0;this.winner=null;this.elfStunReadyAt=0;this.brokenBases=new Set();this.breachUntil=new Map();this.reclaimUntil=new Map();this.elfBasesClaimed=new Set();
    this.stats={trollDamage:0,towerDamage:0,produced:0,destroyed:0,basesDestroyed:0,kills:0,ghostsDestroyed:0,upgrades:0,highestIncome:0,attacks:0,firstBaseFall:null,buildingsCreated:0,unitsLost:0,combatInteractions:{}};
    this.combatInteractions=new Map();this.telemetry=new CombatTelemetry(this.settings.diagnostics===true);
    this.trees=this.map.trees.map(t=>({...t}));this.preparation=this.settings.preparation+Math.max(0,slots.filter(s=>s.role==='elf'&&s.occupant).length-2)*2;
    let elfIndex=0;
    for(const slot of slots.filter(s=>s.occupant)){
      const troll=slot.role==='troll',spawn=troll?this.map.trollSpawn:this.map.elfSpawn;
      const u={id:slot.id,name:slot.occupant.name,role:slot.role,controller:slot.occupant.type,clientId:slot.occupant.clientId||null,difficulty:slot.occupant.difficulty||this.settings.difficulty,x:spawn.x+(troll?0:(elfIndex++%3-1)*1.5),z:spawn.z+(troll?0:Math.floor(elfIndex/3)*1.5),yaw:0,hp:troll?B.troll.hp:B.elf.hp,maxHp:troll?B.troll.hp:B.elf.hp,gold:troll?B.troll.gold:B.elf.gold,wood:troll?0:B.elf.wood,alive:true,ghost:false,observer:false,levels:Object.fromEntries(Object.keys(B.upgrades).map(k=>[k,0])),cooldowns:{},input:{x:0,z:0},lastInput:0,lastHit:-100,lastAttack:0,slowUntil:0,exposure:0,baseId:null,relocationUntil:0,relocationVouchers:troll?0:1,action:'idle',actionUntil:0,stats:{damage:0,produced:0,kills:0,ghostsDestroyed:0,reveals:0,upgrades:0,goldGenerated:0,goldSpent:0,woodGenerated:0,woodSpent:0,unitsCreated:0,unitsLost:0,structuresBuilt:0,structuresDestroyed:0,healing:0,stuns:0,relocations:0},pingUntil:0};
      u.inventory=[];u.equipment={weapon:null,body:null,relic:null};u.combo=0;u.comboUntil=0;
      this.units.push(u);if(u.controller==='bot')this.controllers.set(u.id,new AIController(u.difficulty));
    }
    this.emit('phase',{text:'Preparação: os Elfos erguem suas bases enquanto o Troll aguarda o selo.'});
  }
  emit(type,data={}){this.events.push({id:++this.eventId,type,time:this.time,...data});if(this.events.length>120)this.events.splice(0,this.events.length-120);}
  unit(id){return this.units.find(u=>u.id===id);}
  entity(id){return this.unit(id)||this.structures.find(s=>s.id===id)||this.wisps.find(w=>w.id===id)||this.trees.find(t=>t.id===id);}
  canSee(u,target){return !!u&&distance(u,target)<=(u.ghost?B.ghost.vision:B.vision[u.role])&&lineOfSight(this.map,u,target);}
  teamSee(u,target){return this.units.some(a=>(a.alive||a.ghost)&&a.role===u.role&&this.canSee(a,target))||(u.role==='elf'&&(this.structures.some(s=>s.hp>0&&s.progress>=1&&distance(s,target)<B.vision.elf&&lineOfSight(this.map,s,target))||this.reveals.some(r=>r.until>this.time&&distance(r,target)<=r.radius)));}
  visibleEnemies(u){return [...this.units.filter(a=>(a.alive||a.ghost)&&a.role!==u.role),...this.structures.filter(s=>s.hp>0&&u.role==='troll'),...this.wisps.filter(w=>w.alive&&u.role==='troll')].filter(e=>this.canSee(u,e));}
  setController(id,type,difficulty='normal'){const u=this.unit(id);if(!u)return;u.controller=type;u.input={x:0,z:0};if(type==='bot')this.controllers.set(id,new AIController(difficulty));else this.controllers.delete(id);}
  blockedCells(role){const result=new Set();for(const s of this.structures)if(s.hp>0&&!(s.kind==='wall'&&role==='elf')){const p=toCell(this.map,s);result.add(index(this.map,p.x,p.z));}return result;}
  positionValid(u,x,z){
    const r=u.role==='troll'?B.movement.trollRadius:B.movement.elfRadius;
    const step=Math.hypot(x-u.x,z-u.z);if(step>0&&Math.abs(heightAt(this.map,x,z)-heightAt(this.map,u.x,u.z))>step*.55+.001)return false;
    for(const[dx,dz]of[[r,0],[-r,0],[0,r],[0,-r],[r*.7,r*.7],[-r*.7,r*.7],[r*.7,-r*.7],[-r*.7,-r*.7]]){const p=toCell(this.map,{x:x+dx,z:z+dz});if(!walkable(this.map,p.x,p.z))return false;}
    return !this.structures.some(s=>s.hp>0&&!(s.kind==='wall'&&u.role==='elf')&&Math.hypot(x-s.x,z-s.z)<B.structures[s.kind].radius+r);
  }
  movement(u,dt){
    if((!u.alive&&!u.ghost)||(u.role==='troll'&&this.state===STATES.PREP)||(u.stunnedUntil||0)>this.time)return;
    const v=u.dashUntil>this.time&&u.dashVector?u.dashVector:u.input,n=Math.hypot(v.x,v.z);if(!n)return;
    const speed=u.role==='elf'?B.elf.speed:this.trollStats(u).movement;
    const d=speed*(v.sprint?B.movement.sprint:1)*(u.slowUntil>this.time?B.branches.frost.slow:1)*(u.dashUntil>this.time?B.troll.dashSpeed:1)*(u.pendingStrike?(u.pendingStrike.heavy ? .55 : .9):1)*dt;
    const dx=v.x/Math.max(1,n)*d,dz=v.z/Math.max(1,n)*d;
    // Substeps keep collision authoritative even when simulation is accelerated.
    const steps=Math.max(1,Math.ceil(d/0.3));for(let i=0;i<steps;i++){if(this.positionValid(u,u.x+dx/steps,u.z))u.x+=dx/steps;if(this.positionValid(u,u.x,u.z+dz/steps))u.z+=dz/steps;}
    u.yaw=Number.isFinite(v.yaw)?v.yaw:Math.atan2(v.x,v.z);if(u.actionUntil<this.time)u.action='walk';
  }
  input(id,data){const u=this.unit(id);if(!u||(!u.alive&&!u.ghost)||(u.stunnedUntil||0)>this.time)return;u.input={x:clamp(Number.isFinite(data.x)?data.x:0,-1,1),z:clamp(Number.isFinite(data.z)?data.z:0,-1,1),sprint:data.sprint===true,...(Number.isFinite(data.yaw)?{yaw:data.yaw}:{})};u.lastInput=this.time;if(Number.isFinite(data.yaw))u.yaw=data.yaw;}
  devGrant(id,{gold=0,wood=0}={}){
    const u=this.unit(id),g=Number(gold),w=Number(wood);
    if(!u)return 'Jogador inválido.';
    if(!Number.isSafeInteger(g)||!Number.isSafeInteger(w)||g<0||w<0||g+w<1||g>1_000_000||w>1_000_000)return 'Quantidade dev inválida.';
    u.gold+=g;u.wood+=w;this.emit('dev-grant',{unit:id,x:u.x,z:u.z,gold:g,wood:w});return null;
  }
  act(id,cmd){
    const u=this.unit(id);if(!u||![STATES.PREP,STATES.ACTIVE].includes(this.state))return 'A partida não está ativa.';
    if(cmd.type==='ping')return this.ping(u,cmd);
    if(!u.alive&&!u.ghost)return 'Você foi eliminado. Acompanhe seus aliados.';
    if(u.ghost){if(cmd.type==='repair')return this.repair(u,cmd.target);if(cmd.type==='ghostReveal')return this.ghostReveal(u);return 'Como espírito, você pode revelar, reparar Barricadas e sinalizar.';}
    if(u.role==='troll'&&this.state===STATES.PREP)return 'O selo ainda está ativo.';
    if((u.stunnedUntil||0)>this.time)return `Atordoado por ${Math.ceil(u.stunnedUntil-this.time)}s.`;
    switch(cmd.type){
      case 'build':return this.build(u,cmd);
      case 'cancelJob':return cancelJob(this,u,cmd.target);
      case 'gather':return this.gather(u,cmd.target);
      case 'repair':return this.repair(u,cmd.target);
      case 'upgrade':return this.upgrade(u,cmd.target,cmd.branch);
      case 'buy':return this.buy(u,cmd.key);
      case 'attack':if(Number.isFinite(cmd.yaw))u.yaw=cmd.yaw;return this.attack(u,cmd.heavy===true);
      case 'dash':return this.dash(u);
      case 'buyItem':case 'equipItem':return this.equipItem(u,cmd.item,cmd.type==='buyItem');
      case 'trainWisp':case 'upgradeWisp':case 'assignWisp':return commandWisp(this,u,cmd);
      case 'roar':return this.roar(u);
      case 'elfStun':return this.elfStun(u);
      case 'assist':{const s=this.structures.find(s=>s.id===cmd.target);if(u.role!=='elf'||!s||distance(u,s)>B.interactRange||s.progress>=1)return 'Aproxime-se de uma obra aliada.';if((u.cooldowns.work||0)>this.time)return;u.cooldowns.work=this.time+.5;s.progress=Math.min(1,s.progress+.5/B.structures[s.kind].seconds);u.action='build';u.actionUntil=this.time+.5;return;}
      default:return 'Comando desconhecido.';
    }
  }
  ping(u,cmd){
    if((u.cooldowns.ping||0)>this.time)return 'Aguarde para sinalizar.';
    const x=cmd.x??u.x,z=cmd.z??u.z,limit=(this.map.size-1)*this.map.cell;
    if(!Number.isFinite(x)||!Number.isFinite(z)||x<0||z<0||x>limit||z>limit)return 'Posição inválida para sinalizar.';
    const kind=['danger','help','look','gold','wood','defend','attack'].includes(cmd.kind)?cmd.kind:'help';
    const text={danger:'Perigo aqui!',help:'Preciso de ajuda!',look:'Atenção nesta posição.',gold:'Preciso de ouro!',wood:'Preciso de madeira!',defend:'Defendam esta clareira!',attack:'Ataquem este alvo!'}[kind];
    u.cooldowns.ping=this.time+3;
    const ping={unit:u.id,x,z,role:u.role,kind,text,time:this.time,until:this.time+10};
    this.emit('ping',ping);this.pings=this.pings.filter(p=>p.until>this.time);this.pings.push({...ping,id:this.eventId});
  }
  freeRelocation(u,kind='core'){return kind==='core'&&u.role==='elf'&&u.alive&&(u.relocationVouchers||0)>0&&(u.relocationUntil||0)>this.time;}
  buildCost(u,kind,baseId=null){const def=B.structures[kind];if(this.freeRelocation(u,kind))return {gold:0,wood:0,relocation:true};if(kind==='mine'){const core=this.structures.find(s=>s.kind==='core'&&s.baseId===baseId&&s.hp>0);return {...mineEconomy(core?.tier).cost,relocation:false};}return {gold:def.gold,wood:def.wood,relocation:false};}
  placement(u,kind,x,z){
    if(u.role!=='elf'||!Object.hasOwn(B.structures,kind))return 'Construção inválida.';const def=B.structures[kind];
    if(!Number.isFinite(x)||!Number.isFinite(z))return 'Posição inválida.';
    if(distance(u,{x,z})>B.interactRange)return 'Aproxime-se do local de construção.';
    if(!lineOfSight(this.map,u,{x,z}))return 'Sem acesso visual ao local.';
    const p=toCell(this.map,{x,z});if(!walkable(this.map,p.x,p.z))return 'Terreno bloqueado ou íngreme.';
    for(const[dx,dz]of[[def.radius,0],[-def.radius,0],[0,def.radius],[0,-def.radius],[def.radius*.7,def.radius*.7],[-def.radius*.7,def.radius*.7],[def.radius*.7,-def.radius*.7],[-def.radius*.7,-def.radius*.7]]){const edge=toCell(this.map,{x:x+dx,z:z+dz});if(!walkable(this.map,edge.x,edge.z))return 'A fundação colide com a rocha.';}
    if(!flatGround(this.map,x,z,def.radius))return 'Escolha uma área plana para a fundação.';
    let b=baseAt(this.map,{x,z});if(kind==='wall')b=this.map.bases.find(b=>distance(b.gate,{x,z})<.45);
    if(!b)return kind==='wall'?'Posicione na passagem iluminada.':'Construa dentro de uma clareira.';
    if(kind==='wall'&&(this.breachUntil.get(b.id)||0)>this.time)return 'Entrada rompida: aguarde 12 segundos para reconstruir.';
    if(this.units.some(a=>a.alive&&a.role==='troll'&&distance(a,{x,z})<B.construction.enemyClearance))return 'O Troll está perto demais para erguer uma fundação.';
    const claim=this.structures.find(s=>s.kind==='core'&&s.baseId===b.id&&s.hp>0);
    if(kind==='core'){
      if(this.structures.some(s=>s.kind==='core'&&s.owner===u.id&&s.hp>0))return 'Você já possui um núcleo.';
      if(claim)return 'Esta clareira já pertence a outro Elfo.';
      if((this.reclaimUntil.get(b.id)||0)>this.time)return `Clareira em colapso: aguarde ${Math.ceil(this.reclaimUntil.get(b.id)-this.time)} segundos.`;
    }else if(!claim)return 'Esta clareira precisa de um núcleo ativo.';
    else if(!this.unit(claim.owner)?.alive)return 'O proprietário desta clareira foi eliminado.';
    if(kind!=='wall'&&distance({x,z},b.gate)<B.construction.gateClearance)return 'Mantenha a entrada livre para a barricada.';
    if(this.structures.some(s=>s.hp>0&&distance(s,{x,z})<B.structures[s.kind].radius+def.radius+.3))return 'Espaço ocupado por outra estrutura.';
    if(this.units.some(a=>(a.alive||a.ghost)&&a.id!==u.id&&distance(a,{x,z})<def.radius+.7))return 'Um personagem está ocupando este espaço.';
    if(distance(u,{x,z})<def.radius+.45&&kind!=='wall')return 'Afaste-se um pouco da fundação.';
    if(this.trees.some(t=>t.amount>0&&distance(t,{x,z})<def.radius+.55))return 'Colete a árvore antes de construir aqui.';
    const kindCount=this.structures.filter(s=>s.baseId===b.id&&s.kind===kind&&s.hp>0).length;
    if(kind==='mine'&&kindCount>=mineEconomy(claim?.tier).capacity)return `Núcleo nível ${claim.tier+1} necessário para outra Mina.`;
    if(kindCount>=B.construction.limits[kind])return 'Limite desta estrutura nesta clareira atingido.';
    const cost=this.buildCost(u,kind,b.id);if(u.gold<cost.gold||u.wood<cost.wood)return 'Recursos insuficientes.';
    return null;
  }
  build(u,cmd){
    const x=Number(cmd.x),z=Number(cmd.z),kind=cmd.kind,error=this.placement(u,kind,x,z);if(error)return error;
    const def=B.structures[kind],b=kind==='wall'?this.map.bases.find(b=>distance(b.gate,{x,z})<.45):baseAt(this.map,{x,z}),cost=this.buildCost(u,kind,b.id);
    u.gold-=cost.gold;u.wood-=cost.wood;u.stats.goldSpent+=cost.gold;u.stats.woodSpent+=cost.wood;u.stats.structuresBuilt++;this.stats.buildingsCreated++;const hp=structureHP(kind,1);
    const elfCount=this.units.filter(a=>a.role==='elf').length,bountyFactor=(B.economy.trollBountyFactor[Math.min(B.maxElves,elfCount)]||1.3)*(B.economy.trollMapBounty[this.settings.mapSize]||1);
    const s={id:'s'+this.nextId++,kind,owner:u.id,baseId:b.id,x,z,rotation:Number.isFinite(cmd.rotation)?cmd.rotation:0,tier:1,hp:hp*B.construction.initialHealth,maxHp:hp,progress:0,healthProgress:0,builder:u.id,branch:'power',lastHit:-100,lastShot:-100,upgrading:0,bountyFactor,bounty:hp*B.troll.goldPerDamage*bountyFactor,constructionCost:{gold:cost.gold,wood:cost.wood},...(kind==='mine'?{coreTier:this.structures.find(a=>a.kind==='core'&&a.baseId===b.id&&a.hp>0)?.tier||0}:{})};
    s.job={type:'build',gold:cost.gold,wood:cost.wood};this.structures.push(s);if(kind==='core'){this.elfBasesClaimed.add(b.id);if(cost.relocation){u.relocationVouchers--;u.stats.relocations++;}u.relocationUntil=0;u.baseId=b.id;}u.action='build';u.actionUntil=this.time+def.seconds;this.emit('build',{unit:u.id,entity:s.id,x,z,kind,relocation:cost.relocation});
  }
  gather(u,id){
    if(u.role!=='elf')return 'Apenas Elfos coletam madeira.';
    const t=this.trees.find(t=>t.id===id&&t.amount>0);if(!t||distance(u,t)>B.interactRange||!lineOfSight(this.map,u,t))return 'Aproxime-se de uma árvore.';
    if(this.wisps.some(w=>w.alive&&w.treeId===id))return 'Árvore vinculada a um Wisp. Colete outra árvore.';
    if((u.cooldowns.gather||0)>this.time)return;
    const workshop=this.structures.find(s=>s.owner===u.id&&s.kind==='workshop'&&s.progress>=1&&s.hp>0);
    const amount=Math.min(t.amount,B.elf.gather*(t.rich?(this.time>B.finalAge?B.economy.finalRichWood:B.economy.richWood):1)*(1+(workshop?.tier||0)*B.economy.workshopGather));
    t.amount-=amount;u.wood+=amount;u.stats.woodGenerated+=amount;u.cooldowns.gather=this.time+B.elf.gatherInterval;u.action='gather';u.actionUntil=this.time+.45;this.emit('gather',{unit:u.id,x:t.x,z:t.z,amount});
  }
  repair(u,id){
    const s=this.structures.find(s=>s.id===id&&s.hp>0);if(u.role!=='elf'||!s||distance(u,s)>B.interactRange||!lineOfSight(this.map,u,s))return 'Aproxime-se de uma estrutura aliada.';
    if(u.ghost&&s.kind!=='wall')return 'Espíritos reparam apenas Barricadas.';
    if(s.progress<1)return this.act(u.id,{type:'assist',target:id});
    if(s.hp>=s.maxHp)return 'Estrutura sem danos.';if((u.cooldowns.repair||0)>this.time)return;
    const free=s.kind==='wall';
    if(!free&&(u.gold<B.elf.repairCost||u.wood<1))return 'Reparo requer 3 ouro e 1 madeira.';
    let contribution=1,contributors=1;
    if(free){
      s.repairers??={};
      for(const[id,active]of Object.entries(s.repairers))if(active.until<=this.time)delete s.repairers[id];
      s.repairers[u.id]??={order:++this.repairSequence,until:this.time+1.25};s.repairers[u.id].until=this.time+1.25;
      const active=Object.entries(s.repairers).sort((a,b)=>a[1].order-b[1].order);contributors=active.length;contribution=(active.findIndex(([id])=>id===u.id)===0?1:.25)*(u.ghost?.5:1);
    }
    const workshop=this.structures.find(a=>a.owner===u.id&&a.kind==='workshop'&&a.progress>=1&&a.hp>0);
    const heal=Math.min(s.maxHp-s.hp,B.elf.repair*(1+(workshop?.tier||0)*B.economy.workshopRepair)*contribution);s.hp+=heal;if(!free){s.bounty+=B.elf.repairCost*.6;u.gold-=B.elf.repairCost;u.wood-=1;}u.stats.healing+=heal;u.cooldowns.repair=this.time+1;u.action='repair';u.actionUntil=this.time+.8;this.emit('repair',{unit:u.id,entity:id,x:s.x,z:s.z,amount:heal,free,contribution,contributors});
  }
  upgrade(u,id,branch){
    const s=this.structures.find(s=>s.id===id),status=upgradeStatus(u,s,this.time,this.state);
    if(!status.allowed)return status.reasons.map(r=>r.message).join(' ');
    const cost=status.cost;
    if(branch!==undefined&&!Object.hasOwn(B.branches,branch))return 'Especialização inválida.';
    u.gold-=cost.gold;u.wood-=cost.wood;u.stats.goldSpent+=cost.gold;u.stats.woodSpent+=cost.wood;s.upgrading=B.construction.upgradeSeconds+Math.min(7,s.tier);s.upgradeDuration=s.upgrading;s.job={type:'upgrade',...cost,duration:s.upgrading};s.nextBranch=branch||s.branch;u.stats.upgrades++;this.stats.upgrades++;this.emit('upgrade',{unit:u.id,entity:id,x:s.x,z:s.z});
  }
  buy(u,key){
    if(u.role!=='troll'||!Object.hasOwn(B.upgrades,key))return 'Melhoria inválida.';
    const level=u.levels[key];
    if(level===3&&this.time<B.finalAge)return 'Melhoria final ainda selada.';
    const cost=trollCost(key,level);if(u.gold<cost)return 'Ouro insuficiente.';
    u.gold-=cost;u.stats.goldSpent+=cost;u.levels[key]++;if(key==='health'){const next=this.trollStats(u).maxHp;u.hp+=next-u.maxHp;u.maxHp=next;}u.stats.upgrades++;this.stats.upgrades++;this.emit('purchase',{unit:u.id,key,x:u.x,z:u.z});
  }
  trollStats(u){
    // Bots survive through the same purchased stats and abilities as players.
    return combatStats(u);
  }
  legendarySword(u){return u?.role==='troll'&&(u.levels.damage||0)+(u.levels.siege||0)>=B.legendary.swordLevels;}
  equipItem(u,id,buy){
    if(u.role!=='troll'||!Object.hasOwn(ITEMS,id))return 'Equipamento inválido.';
    if(this.time-u.lastHit<5||(u.lastAttack>0&&this.time-u.lastAttack<5)||u.pendingStrike)return 'Equipe fora de combate: 5 s sem causar ou receber dano.';
    const item=ITEMS[id],owned=u.inventory.includes(id);
    if(!owned){if(!buy)return 'Compre o item primeiro.';if(u.gold<item.cost)return 'Ouro insuficiente.';u.gold-=item.cost;u.stats.goldSpent+=item.cost;u.inventory.push(id);}
    const fraction=u.hp/u.maxHp;u.equipment[item.slot]=id;u.maxHp=this.trollStats(u).maxHp;u.hp=u.maxHp*fraction;
    this.emit('purchase',{unit:u.id,item:id,x:u.x,z:u.z});
  }
  dash(u){
    if(u.role!=='troll')return 'Habilidade exclusiva do Troll.';
    if((u.cooldowns.dash||0)>this.time)return 'Esquiva recarregando.';
    u.cooldowns.dash=this.time+this.trollStats(u).dashCooldown;u.dashUntil=this.time+B.troll.dashDuration;
    const n=Math.hypot(u.input.x,u.input.z);u.dashVector=n?{x:u.input.x/n,z:u.input.z/n,yaw:u.yaw}:{x:Math.sin(u.yaw),z:Math.cos(u.yaw),yaw:u.yaw};
    u.pendingStrike=null;u.queuedStrike=null;u.cooldowns.attack=Math.min(u.cooldowns.attack||0,this.time+.12);
    u.openingUntil=this.time+B.combat.openingSeconds;this.emit('dash',{unit:u.id,x:u.x,z:u.z});
  }
  wallBlocks(a,b){return this.structures.some(s=>s.kind==='wall'&&s.hp>0&&s.id!==b.id&&pointSegmentDistance(s,a,b)<1.05);}
  attack(u,heavy){
    if(u.role!=='troll')return 'Elfos constroem defesas; não atacam.';
    if(heavy&&(u.cooldowns.heavy||0)>this.time)return 'Golpe pesado recarregando.';
    if((u.cooldowns.attack||0)>this.time||u.pendingStrike){
      if(!u.pendingStrike&&u.cooldowns.attack-this.time<=B.combat.buffer&&(!u.queuedStrike||heavy))u.queuedStrike={heavy,yaw:u.yaw,until:this.time+B.combat.buffer};
      return;
    }
    const stats=this.trollStats(u),windup=heavy?B.combat.heavyWindup:B.combat.lightWindup;
    u.queuedStrike=null;u.cooldowns.attack=this.time+Math.max(windup+.12,stats.interval*(heavy?B.troll.heavyRecovery:1));if(heavy)u.cooldowns.heavy=this.time+B.troll.heavyCooldown;
    u.pendingStrike={heavy,yaw:u.yaw,at:this.time+windup};u.action=heavy?'heavy':'attack';u.actionUntil=this.time+windup+.22;
    this.stats.attacks++;this.emit('swing',{unit:u.id,x:u.x,z:u.z,heavy,windup,yaw:u.yaw});
  }
  resolveStrike(u){
    const strike=u.pendingStrike;if(!strike||strike.at>this.time)return;
    u.pendingStrike=null;const {heavy,yaw}=strike,stats=this.trollStats(u);
    const targets=this.visibleEnemies(u).filter(e=>distance(u,e)<=stats.range+(e.kind?B.structures[e.kind].radius:0)&&!this.wallBlocks(u,e));
    targets.sort((a,b)=>distance(u,a)-distance(u,b));
    const target=targets.find(e=>Math.cos(Math.atan2(e.x-u.x,e.z-u.z)-yaw)>.35);
    if(!target){u.combo=0;u.comboTarget=null;this.emit('miss',{unit:u.id,x:u.x,z:u.z});return;}
    const chain=u.comboTarget===target.id&&u.comboUntil>this.time?u.combo:0;
    const finisher=!heavy&&chain>=2,opening=u.openingUntil>this.time;
    const damage=stats.damage*(heavy?stats.heavy:finisher?1+B.combat.comboBonus:1)*(opening?1+stats.opening:1)*(target.kind?stats.siege:1)*(target.kind&&this.time>B.finalAge&&u.levels.siege>=3?B.troll.finalSiege:1);
    const actual=this.damage(target,damage,u,'melee');
    if(target.kind&&target.hp>0&&this.legendarySword(u)&&target.hp/target.maxHp<=B.legendary.executeThreshold){this.emit('legendary-execute',{unit:u.id,entity:target.id,x:target.x,z:target.z});this.damage(target,target.hp,u,'legendary-execute');}
    u.openingUntil=0;u.combo=heavy||finisher?0:chain+1;u.comboTarget=target.id;u.comboUntil=this.time+B.combat.comboWindow;
    if(stats.drain)u.hp=Math.min(u.maxHp,u.hp+Math.min(u.maxHp*.01,actual*stats.drain*(target.kind ? .375 : 1)));
    this.emit('impact',{unit:u.id,entity:target.id,x:target.x,z:target.z,amount:Math.round(actual),heavy,finisher,opening,broken:target.hp<=0&&target.kind==='wall'});
  }
  roar(u){
    if(u.role!=='troll')return 'Habilidade exclusiva do Troll.';if((u.cooldowns.roar||0)>this.time)return 'Rugido recarregando.';
    u.cooldowns.roar=this.time+B.troll.roarCooldown;u.action='roar';u.actionUntil=this.time+.7;
    for(const s of this.structures.filter(s=>s.kind==='tower'&&s.hp>0&&this.canSee(u,s)&&distance(u,s)<B.troll.roarRange))s.disabledUntil=this.time+this.trollStats(u).roarDuration;
    this.emit('roar',{unit:u.id,x:u.x,z:u.z});
  }
  elfStunStatus(u){
    if(u?.role!=='elf')return {available:false,reason:'Habilidade exclusiva dos Elfos.',readyAt:this.elfStunReadyAt};
    const troll=this.units.find(a=>a.role==='troll'&&a.alive),breachUntil=this.breachUntil.get(u.baseId)||0;
    if(this.state!==STATES.ACTIVE)return {available:false,reason:'Disponível quando a caçada começar.',readyAt:this.elfStunReadyAt};
    if(!u.alive)return {available:false,reason:'Você foi eliminado.',readyAt:this.elfStunReadyAt};
    if(breachUntil<=this.time)return {available:false,reason:'Disponível por 45s após sua Barricada ser rompida.',readyAt:this.elfStunReadyAt};
    if(this.elfStunReadyAt>this.time)return {available:false,reason:`Proteção da equipe recarregando: ${Math.ceil(this.elfStunReadyAt-this.time)}s.`,readyAt:this.elfStunReadyAt};
    const base=this.map.bases.find(b=>b.id===u.baseId),inside=baseAt(this.map,troll)?.id===u.baseId||(base&&distance(base.gate,troll)<8);
    if(!troll||!inside)return {available:false,reason:'O Troll ainda não entrou na sua base.',readyAt:this.elfStunReadyAt};
    if(distance(u,troll)>B.elf.stunRange||!lineOfSight(this.map,u,troll))return {available:false,reason:`Troll fora do alcance de ${B.elf.stunRange} m.`,readyAt:this.elfStunReadyAt};
    return {available:true,reason:'Atordoar o Troll por 3s e abrir uma rota de fuga.',readyAt:this.time,troll:troll.id};
  }
  elfStun(u){
    const status=this.elfStunStatus(u);if(!status.available)return status.reason;
    const troll=this.unit(status.troll);this.elfStunReadyAt=this.time+B.elf.stunCooldown;
    for(const elf of this.units.filter(a=>a.role==='elf'))elf.cooldowns.elfStun=this.elfStunReadyAt;
    troll.stunnedUntil=this.time+B.elf.stunDuration;troll.input={x:0,z:0};troll.pendingStrike=null;troll.queuedStrike=null;troll.dashUntil=this.time;troll.action='stunned';troll.actionUntil=troll.stunnedUntil;
    u.stats.stuns++;this.emit('stun',{unit:u.id,target:troll.id,x:troll.x,z:troll.z,duration:B.elf.stunDuration,baseId:u.baseId});
  }
  ghostReveal(u){
    if(!u.ghost)return 'Habilidade exclusiva de espíritos.';
    if((u.cooldowns.ghostReveal||0)>this.time)return `Revelação recarregando por ${Math.ceil(u.cooldowns.ghostReveal-this.time)}s.`;
    u.cooldowns.ghostReveal=this.time+B.ghost.revealCooldown;u.stats.reveals++;const reveal={id:'reveal-'+this.nextId++,unit:u.id,x:u.x,z:u.z,radius:B.ghost.revealRadius,time:this.time,until:this.time+B.ghost.revealDuration};this.reveals.push(reveal);this.emit('ghost-reveal',reveal);
  }
  collapseElf(u,killer){
    const owned=this.structures.filter(s=>s.owner===u.id&&s.hp>0),homeBases=new Set(owned.filter(s=>s.kind==='core').map(s=>s.baseId));
    const economic=this.structures.filter(s=>s.hp>0&&s.progress===1),total=economic.reduce((sum,s)=>sum+income(s),0),scale=scaling(this.units.filter(a=>a.role==='elf'&&a.alive).length,total,economic.filter(s=>s.kind==='core').length,this.time);
    let reward=0;
    for(const s of owned){
      if(killer?.role==='troll')reward+=Math.min(s.hp*B.troll.goldPerDamage*scale,s.bounty||0)*.25;
      s.hp=0;this.stats.destroyed++;this.telemetry.destroyed[s.kind]=(this.telemetry.destroyed[s.kind]||0)+1;
      if(killer?.role==='troll')killer.stats.structuresDestroyed++;
      if(s.kind==='wall'){this.brokenBases.add(s.baseId);this.breachUntil.set(s.baseId,this.time+B.construction.breachCooldown);this.stats.firstBaseFall??=this.time;}
      this.emit('destroy',{entity:s.id,x:s.x,z:s.z,kind:s.kind,cause:'owner-collapse'});
    }
    for(const w of this.wisps.filter(w=>w.owner===u.id&&w.alive)){w.alive=false;this.emit('wisp-death',{entity:w.id,x:w.x,z:w.z,cause:'owner-collapse'});}
    for(const baseId of homeBases)this.reclaimUntil.set(baseId,this.time+15);
    if(killer?.role==='troll'&&reward>0){killer.gold+=reward;killer.stats.goldGenerated+=reward;}
    this.stats.basesDestroyed=this.brokenBases.size;u.gold=0;u.wood=0;u.baseId=null;u.relocationUntil=0;
    this.emit('collapse',{unit:u.id,x:u.x,z:u.z,reward,structures:owned.length,reclaimAt:homeBases.size?this.time+15:null});
  }
  damage(target,amount,source,kind,sourceId){
    if(target.hp<=0||amount<=0||!Number.isFinite(amount))return 0;
    const actual=Math.min(target.hp,amount);target.hp-=actual;
    this.telemetry.hit(this,target,actual,source,kind,sourceId);
    if(source){const sourceType=kind==='tower'?'tower':source.role||source.kind||kind,targetType=target.role||target.kind,key=`${sourceType}->${targetType}`;let interaction=this.combatInteractions.get(key);if(!interaction){interaction={source:sourceType,target:targetType,startedAt:this.time,damage:0,attacks:0,finishedAt:null,targets:{}};this.combatInteractions.set(key,interaction);}interaction.damage+=actual;interaction.attacks++;interaction.lastHitAt=this.time;const contact=interaction.targets[target.id]??={first:this.time,death:null};if(target.hp<=0)contact.death=this.time;if(target.hp<=0&&interaction.finishedAt===null)interaction.finishedAt=this.time;target.stats&&(target.stats.damageReceived=(target.stats.damageReceived||0)+actual);}
    // Hunger is attrition, not an enemy hit: do not renew threat, exposure or attack alerts.
    if(kind!=='hunger')target.lastHit=this.time;
    if(source?.role==='troll'){
      const economic=this.structures.filter(s=>s.hp>0&&s.progress===1),total=economic.reduce((sum,s)=>sum+income(s),0);
      const gain=actual*B.troll.goldPerDamage*scaling(this.units.filter(u=>u.role==='elf'&&u.alive).length,total,economic.filter(s=>s.kind==='core').length,this.time);
      const budgeted=target.kind||target.role==='wisp',awarded=target.ghost?0:budgeted?Math.min(gain,target.bounty||0):gain;
      if(budgeted)target.bounty-=awarded;source.gold+=awarded;source.stats.goldGenerated+=awarded;source.lastAttack=this.time;source.stats.damage+=actual;this.stats.trollDamage+=actual;
    }else if(kind==='tower'){this.stats.towerDamage+=actual;if(source)source.stats.damage+=actual;}
    this.emit('damage',{entity:target.id,unit:source?.id,x:target.x,z:target.z,amount:Math.round(actual),kind});
    if(target.hp<=0){
      target.hp=0;
      if(target.kind){
        this.stats.destroyed++;if(source?.role==='troll')source.stats.structuresDestroyed++;
        if(target.kind==='wall'){this.brokenBases.add(target.baseId);this.stats.basesDestroyed=this.brokenBases.size;this.breachUntil.set(target.baseId,this.time+B.construction.breachCooldown);this.stats.firstBaseFall??=this.time;}
        if(target.kind==='core'){
          const owner=this.unit(target.owner);if(owner?.alive){owner.baseId=null;
            if(target.progress>=1&&(owner.relocationVouchers||0)>0&&(owner.relocationUntil||0)<=this.time){owner.relocationUntil=this.time+B.elf.relocationSeconds;this.emit('relocation',{unit:owner.id,entity:target.id,x:owner.x,z:owner.z,until:owner.relocationUntil,free:true});}
          }
        }
        this.emit('destroy',{entity:target.id,x:target.x,z:target.z,kind:target.kind});
      }
      else if(target.role==='wisp'){target.alive=false;this.emit('wisp-death',{entity:target.id,x:target.x,z:target.z});}
      else if(target.ghost){target.ghost=false;target.observer=true;target.input={x:0,z:0};if(source?.role==='troll'){source.gold+=B.ghost.goldReward;source.stats.goldGenerated+=B.ghost.goldReward;source.stats.ghostsDestroyed++;this.stats.ghostsDestroyed++;}this.emit('ghost-death',{entity:target.id,unit:source?.id,x:target.x,z:target.z,reward:source?.role==='troll'?B.ghost.goldReward:0});}
      else {target.alive=false;target.input={x:0,z:0};target.pendingStrike=null;target.queuedStrike=null;this.stats.kills++;this.stats.unitsLost++;target.stats.unitsLost++;if(source)source.stats.kills++;if(target.role==='elf'){this.collapseElf(target,source);target.ghost=true;target.observer=false;target.hp=B.ghost.hp;target.maxHp=B.ghost.hp;target.action='idle';target.lastHit=-100;this.emit('ghost-spawn',{entity:target.id,x:target.x,z:target.z});}this.emit('death',{entity:target.id,x:target.x,z:target.z,name:target.name});}
      this.checkEndState();
    }return actual;
  }
  checkEndState(){
    if(this.state===STATES.END)return;
    const troll=this.units.find(u=>u.role==='troll'),elves=this.units.filter(u=>u.role==='elf');
    if(!troll?.alive||!elves.some(u=>u.alive)){this.state=STATES.END;this.winner=troll?.alive?'troll':'elves';this.endReason=troll?.alive?'army-eliminated':'troll-eliminated';this.emit('end',{winner:this.winner,reason:this.endReason});return;}
    if(this.state!==STATES.ACTIVE)return;
    const noCores=this.elfBasesClaimed.size&&[...this.elfBasesClaimed].every(id=>!this.structures.some(s=>s.kind==='core'&&s.baseId===id&&s.hp>0));
    const canRelocate=elves.some(u=>u.alive&&(u.relocationUntil||0)>this.time),canReclaim=elves.some(u=>u.alive)&&[...this.reclaimUntil.values()].some(until=>until+60>this.time);
    if(noCores&&!canRelocate&&!canReclaim){this.state=STATES.END;this.winner='troll';this.endReason='all-elf-bases-destroyed';this.emit('end',{winner:this.winner,reason:this.endReason});}
  }
  towerTargeting(s,troll=this.units.find(u=>u.role==='troll'&&u.alive)){
    if(!s||s.kind!=='tower')return {valid:false,reason:'not-tower'};
    const branch=B.branches[s.branch]||B.branches.power,def=B.structures.tower;
    if(this.state!==STATES.ACTIVE)return {valid:false,reason:'match-not-active',target:troll?.id||null};
    if(s.progress<1||s.hp<=0)return {valid:false,reason:'tower-not-ready',target:troll?.id||null};
    if(s.disabledUntil>this.time)return {valid:false,reason:'disabled',target:troll?.id||null,cooldown:s.disabledUntil-this.time};
    if(!troll)return {valid:false,reason:'no-troll',target:null};
    const distanceToTarget=distance(s,troll),maxRange=def.range+branch.range,los=lineOfSight(this.map,s,troll),cooldown=s.legendary?0:Math.max(0,def.interval*branch.interval-(this.time-s.lastShot));
    if(distanceToTarget>maxRange)return {valid:false,reason:'out-of-range',target:troll.id,distance:distanceToTarget,maxRange,los,cooldown};
    if(!los)return {valid:false,reason:'line-of-sight',target:troll.id,distance:distanceToTarget,maxRange,los,cooldown};
    if(cooldown>0)return {valid:false,reason:'cooldown',target:troll.id,distance:distanceToTarget,maxRange,los,cooldown};
    return {valid:true,reason:'ready',target:troll.id,distance:distanceToTarget,maxRange,los,cooldown:0};
  }
  step(dt=1/B.tick){
    if(![STATES.PREP,STATES.ACTIVE].includes(this.state))return;
    this.time+=dt;
    if(this.state===STATES.PREP&&this.time>=this.preparation){this.state=STATES.ACTIVE;const troll=this.units.find(u=>u.role==='troll');if(troll)troll.lastAttack=this.time;this.emit('phase',{text:'O Troll foi libertado. Protejam as clareiras.'});}
    this.reveals=this.reveals.filter(r=>r.until>this.time);
    for(const u of this.units){if(!u.alive&&!u.ghost)continue;const controller=this.controllers.get(u.id);if(controller)controller.tick(this,u,dt);else if(this.time-u.lastInput>.35)u.input={x:0,z:0};this.movement(u,dt);if(u.actionUntil<this.time&&!Math.hypot(u.input.x,u.input.z))u.action='idle';}
    if(this.state===STATES.ACTIVE)for(const u of this.units.filter(u=>u.role==='troll'&&u.alive)){
      if((u.stunnedUntil||0)>this.time)continue;
      this.resolveStrike(u);
      if(u.queuedStrike){const queued=u.queuedStrike;if(queued.until<this.time)u.queuedStrike=null;else if(!(u.cooldowns.attack>this.time)&&!u.pendingStrike){u.yaw=queued.yaw;this.attack(u,queued.heavy);}}
      if(u.comboUntil<this.time)u.combo=0;
    }
    for(const s of this.structures){
      if(s.hp<=0)continue;
      if(s.progress<1){const builder=this.unit(s.builder);if(builder?.alive&&distance(builder,s)<B.interactRange+1)s.progress=Math.min(1,s.progress+dt/B.structures[s.kind].seconds);}
      if(s.healthProgress<s.progress){s.hp=Math.min(s.maxHp,s.hp+(s.progress-s.healthProgress)*s.maxHp*(1-B.construction.initialHealth));if(s.maxHp-s.hp<1e-8)s.hp=s.maxHp;s.healthProgress=s.progress;}
      if(s.progress<1)continue;
      if(s.job?.type==='build')delete s.job;
      if(s.upgrading>0){s.upgrading=Math.max(0,s.upgrading-dt);if(!s.upgrading){const old=s.maxHp;s.tier++;s.maxHp=structureHP(s.kind,s.tier);s.hp+=s.maxHp-old;s.bounty+=(s.maxHp-old)*B.troll.goldPerDamage*(s.bountyFactor||1.3);s.branch=s.nextBranch;this.emit('complete',{entity:s.id,x:s.x,z:s.z});}}
      if(s.kind==='tower'&&s.tier>=B.legendary.towerTier&&!this.structures.some(a=>a.kind==='tower'&&a.legendary&&a.hp>0)){s.legendary=true;s.beamStartedAt=0;s.beamTarget=null;this.emit('legendary-tower',{entity:s.id,unit:s.owner,x:s.x,z:s.z});}
      if(s.kind==='mine')s.coreTier=this.structures.find(a=>a.kind==='core'&&a.baseId===s.baseId&&a.hp>0&&a.progress>=1)?.tier||0;
      const owner=this.unit(s.owner),producer=resourceProducer(s);if(owner?.alive&&producer){const production=producer.amount*dt;owner.gold+=production;owner.stats.produced+=production;owner.stats.goldGenerated+=production;this.stats.produced+=production;s.productionPulse=(s.productionPulse||0)+production;if((s.productionPulseAt??this.time)<=this.time){this.emit('resource',{unit:owner.id,entity:s.id,x:s.x,z:s.z,resource:producer.resource,amount:s.productionPulse,rate:producer.perMinute});s.productionPulse=0;s.productionPulseAt=this.time+producer.interval;}}
      if(s.kind==='tower'&&s.disabledUntil>this.time){s.beamTarget=null;s.beamStartedAt=0;}
      if(s.kind==='tower'&&this.state===STATES.ACTIVE&&!(s.disabledUntil>this.time)){
        const troll=this.units.find(u=>u.role==='troll'&&u.alive),status=this.towerTargeting(s,troll),branch=B.branches[s.branch]||B.branches.power;
        if(status.valid&&s.legendary){
          if(s.beamTarget!==troll.id){s.beamTarget=troll.id;s.beamStartedAt=this.time;}const contact=this.time-s.beamStartedAt,ramp=Math.min(B.legendary.maxRamp,1+contact*B.legendary.rampPerSecond),armor=this.trollStats(troll).armor*(1-branch.armorPierce),dmg=B.legendary.towerDps*ramp*mitigation(armor)*dt;
          this.damage(troll,dmg,owner,'legendary-beam',s.id);if((s.beamPulseAt||0)<=this.time){s.beamPulseAt=this.time+.2;this.emit('beam',{entity:s.id,target:troll.id,x:s.x,z:s.z,tx:troll.x,tz:troll.z,ramp});}
        }else if(status.valid){
          s.lastShot=this.time;const armor=this.trollStats(troll).armor*(1-branch.armorPierce),exposure=1+Math.max(0,troll.exposure-B.troll.exposureGrace)*B.troll.exposureRate;
          const dmg=towerDamage(s.tier)*branch.damage*mitigation(armor)*exposure;
          this.damage(troll,dmg,owner,'tower',s.id);if(branch.slow)troll.slowUntil=this.time+1.5;
          this.emit('shot',{entity:s.id,target:troll.id,x:s.x,z:s.z,tx:troll.x,tz:troll.z,branch:s.branch});
        }else{s.beamTarget=null;s.beamStartedAt=0;}
      }
    }
    for(const u of this.units.filter(u=>u.alive)){
      if(u.role==='troll'&&this.state===STATES.ACTIVE){const hunger=this.time>B.hungerAge&&this.time-u.lastAttack>B.hungerGrace;u.exposure=this.time-u.lastHit<2?u.exposure+dt:Math.max(0,u.exposure-dt*2);if(this.time-u.lastHit>this.trollStats(u).regenDelay&&!hunger)u.hp=Math.min(u.maxHp,u.hp+this.trollStats(u).regen*dt);
        if(hunger)this.damage(u,u.maxHp*B.hungerRate*dt,null,'hunger');
      }
      if(u.role==='elf')this.stats.highestIncome=Math.max(this.stats.highestIncome,this.structures.filter(s=>s.owner===u.id&&s.hp>0&&s.progress>=1).reduce((a,s)=>a+income(s),0));
    }
    stepWisps(this,dt);
    const troll=this.units.find(u=>u.role==='troll'),elves=this.units.filter(u=>u.role==='elf');
    this.checkEndState();this.telemetry.step(this,dt);
  }
  snapshot(viewerId=null){
    const viewer=this.unit(viewerId),observer=!viewer,canView=e=>observer||e.id===viewer.id||e.role===viewer.role||(viewer.role==='elf'&&e.kind)||this.teamSee(viewer,e);
    const units=this.units.filter(canView).map(u=>{const own=observer||u.id===viewer.id;return {id:u.id,name:u.name,role:u.role,controller:u.controller,x:u.x,z:u.z,yaw:u.yaw,hp:u.hp,maxHp:u.maxHp,alive:u.alive,ghost:u.ghost,observer:u.observer,lastHit:u.lastHit,effects:unitEffects(u,this.time,this.state,this.preparation),action:u.action,actionUntil:u.actionUntil,equipment:u.equipment,baseId:u.role==='elf'&&(observer||viewer.role==='elf')?u.baseId:null,...(own?{gold:u.gold,wood:u.wood,levels:u.levels,cooldowns:u.cooldowns,stats:u.stats,lastAttack:u.lastAttack,inventory:u.inventory,combo:u.combo,comboUntil:u.comboUntil,openingUntil:u.openingUntil,relocationUntil:u.relocationUntil||0,relocationVouchers:u.relocationVouchers||0,...(u.role==='troll'?{combat:this.trollStats(u),legendarySword:this.legendarySword(u)}:{income:this.structures.filter(s=>s.owner===u.id&&s.hp>0&&s.progress===1).reduce((a,s)=>a+income(s),0),woodIncome:this.wisps.filter(w=>w.owner===u.id&&wispActive(this,w)).reduce((n,w)=>n+wispIncome(w),0)})}:{})};});
    const structures=this.structures.filter(s=>s.hp>0&&canView(s)).map(({bounty,bountyFactor,builder,nextBranch,job,repairers,...s})=>({...s,effects:structureEffects(s,this.time),...(observer||s.owner===viewer.id?{refund:jobRefund({...s,job},this.time)}:{})}));
    const wisps=this.wisps.filter(w=>w.alive&&(observer||viewer.role==='elf'||this.teamSee(viewer,w))).map(({bounty,job,...w})=>({...w,income:wispActive(this,w)?wispIncome(w):0,...(observer||w.owner===viewer.id?{refund:jobRefund({...w,job},this.time)}:{})}));
    const visibleIds=new Set([...units,...structures,...wisps].map(e=>e.id));
    const events=this.events.filter(e=>e.type==='phase'||e.type==='end'||(e.type==='ping'&&(observer||e.role===viewer.role))||(e.type!=='ping'&&(visibleIds.has(e.unit)||visibleIds.has(e.entity)||(Number.isFinite(e.x)&&(observer||this.teamSee(viewer,e))))));
    const pings=this.pings.filter(p=>p.until>this.time&&(observer||p.role===viewer.role));
    const alerts=[...units.filter(u=>u.alive&&(observer||u.role===viewer.role)),...structures.filter(()=>observer||viewer.role==='elf'),...wisps.filter(()=>observer||viewer.role==='elf')].filter(e=>this.time-e.lastHit<5).map(e=>({id:e.id,x:e.x,z:e.z,owner:e.owner||e.id,kind:e.kind||e.role,until:e.lastHit+5}));
    return {state:this.state,time:this.time,preparation:this.preparation,scoreboard:this.units.map(u=>{const{hp,maxHp,...summary}=playerSummary(u);return summary;}).sort((a,b)=>b.score-a.score),elfStun:viewer?.role==='elf'?this.elfStunStatus(viewer):null,devSpeed:this.devSpeed||1,winner:this.winner,viewerId,units,structures,wisps,pings,alerts,reveals:observer||viewer.role==='elf'?this.reveals:[],trees:this.trees.filter(t=>observer||this.teamSee(viewer,t)),breaches:observer||viewer.role==='elf'?Object.fromEntries(this.breachUntil):{},reclaims:observer||viewer.role==='elf'?Object.fromEntries(this.reclaimUntil):{},events,stats:this.state===STATES.END?this.stats:null,debugTowers:this.debugTowers?this.structures.filter(s=>s.kind==='tower').map(s=>({id:s.id,...this.towerTargeting(s)})):undefined,finalAge:B.finalAge,hungerAge:B.hungerAge};
  }
  stallDiagnostics(){const lastCombat=Number.isFinite(this.telemetry.lastContact)?this.telemetry.lastContact:null;return {lastCombatAt:lastCombat,secondsWithoutCombat:lastCombat===null?Math.round(this.time):Math.max(0,Math.round(this.time-lastCombat)),liveCores:this.structures.filter(s=>s.kind==='core'&&s.hp>0).length,economyPerSecond:+this.structures.filter(s=>s.hp>0&&s.progress>=1).reduce((n,s)=>n+income(s),0).toFixed(2),relocations:this.units.reduce((n,u)=>n+(u.stats.relocations||0),0),targetlessExplorationSeconds:+this.units.filter(u=>u.role==='troll'&&u.controller==='bot').reduce((n,u)=>n+(this.controllers.get(u.id)?.metrics.idle||0),0).toFixed(1)};}
  result(){const duration=Math.max(1,this.time),interactions=[...this.combatInteractions.values()].map(i=>({...i,ttk:Object.values(i.targets).some(t=>t.death!==null)?Object.values(i.targets).filter(t=>t.death!==null).reduce((n,t)=>n+t.death-t.first,0)/Object.values(i.targets).filter(t=>t.death!==null).length:null,effectiveDps:i.damage/Math.max(.001,this.time-i.startedAt)}));const bases=this.map.bases.map(b=>{const structures=this.structures.filter(s=>s.baseId===b.id),core=structures.find(s=>s.kind==='core'&&s.hp>0)||structures.findLast(s=>s.kind==='core');return {id:b.id,name:b.name,owner:core?.owner||null,claimed:this.elfBasesClaimed.has(b.id),core:core?{id:core.id,hp:Math.round(core.hp),maxHp:Math.round(core.maxHp),progress:core.progress,tier:core.tier}:null,wall:structures.filter(s=>s.kind==='wall').map(s=>({id:s.id,hp:Math.round(s.hp),maxHp:Math.round(s.maxHp),progress:s.progress})),towers:structures.filter(s=>s.kind==='tower').map(s=>({id:s.id,hp:Math.round(s.hp),maxHp:Math.round(s.maxHp),progress:s.progress,tier:s.tier,branch:s.branch,legendary:!!s.legendary})),structureCount:structures.filter(s=>s.hp>0).length};});const finalState={state:this.state,winner:this.winner,endReason:this.endReason||null,bases,units:this.units.map(u=>({id:u.id,role:u.role,alive:u.alive,hp:Math.round(u.hp),maxHp:Math.round(u.maxHp),x:+u.x.toFixed(1),z:+u.z.toFixed(1),baseId:u.baseId,action:u.action})),objectives:{elfBasesClaimed:this.elfBasesClaimed.size,basesDestroyed:this.stats.basesDestroyed,liveElfCores:bases.filter(b=>b.core?.hp>0).length,aliveElves:this.units.filter(u=>u.role==='elf'&&u.alive).length,trollAlive:!!this.units.find(u=>u.role==='troll')?.alive}};return {seed:this.map.seed,winner:this.winner,endReason:this.endReason||null,duration:Math.round(this.time),elves:this.units.filter(u=>u.role==='elf').length,survivors:this.units.filter(u=>u.role==='elf'&&u.alive).length,...this.stats,telemetry:this.telemetry.result(this),stallDiagnostics:this.stallDiagnostics(),combatInteractions:interactions,finalState,ai:this.units.filter(u=>u.controller==='bot').map(u=>({id:u.id,role:u.role,difficulty:u.difficulty,state:this.controllers.get(u.id)?.brain?.state||null,target:this.controllers.get(u.id)?.brain?.targetId||null,destination:this.controllers.get(u.id)?.destination||null,...(this.controllers.get(u.id)?.metrics||{})})),players:this.units.map(u=>({...playerSummary(u),goldPerMinute:u.stats.goldGenerated/duration*60,woodPerMinute:u.stats.woodGenerated/duration*60,...u.stats})),mvp:this.units.filter(u=>u.role===(this.winner==='troll'?'troll':'elf')).map(playerSummary).sort((a,b)=>b.score-a.score)[0]||null};}
}
function pointSegmentDistance(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,n=dx*dx+dz*dz;if(n===0)return distance(p,a);const t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/n,0,1);return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);}
