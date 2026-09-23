import { BALANCE as B, STATES, DEFAULT_SETTINGS, clamp, distance, mitigation, structureHP, income, upgradeCost, trollCost, scaling, towerDamage, wispIncome } from './config.js';
import { generateMap, baseAt, toCell, walkable, index, lineOfSight, heightAt, flatGround } from './map.js';
import { AIController } from './controllers.js';
import { unitEffects, structureEffects } from './effects.js';
import { ITEMS, combatStats } from './equipment.js';
import { commandWisp, stepWisps, wispActive } from './wisps.js';
import { cancelJob, jobRefund } from './jobs.js';

export class Match {
  constructor(settings,slots) {
    this.settings={...DEFAULT_SETTINGS,...settings};this.map=generateMap(this.settings.seed,this.settings.mapSize);
    this.time=0;this.state=STATES.PREP;this.structures=[];this.units=[];this.wisps=[];this.controllers=new Map();this.nextId=1;this.events=[];this.pings=[];this.eventId=0;this.winner=null;this.brokenBases=new Set();this.breachUntil=new Map();
    this.stats={trollDamage:0,towerDamage:0,produced:0,destroyed:0,basesDestroyed:0,kills:0,upgrades:0,highestIncome:0,attacks:0,firstBaseFall:null};
    this.trees=this.map.trees.map(t=>({...t}));this.preparation=this.settings.preparation+Math.max(0,slots.filter(s=>s.role==='elf'&&s.occupant).length-2)*2;
    let elfIndex=0;
    for(const slot of slots.filter(s=>s.occupant)){
      const troll=slot.role==='troll',spawn=troll?this.map.trollSpawn:this.map.elfSpawn;
      const u={id:slot.id,name:slot.occupant.name,role:slot.role,controller:slot.occupant.type,clientId:slot.occupant.clientId||null,difficulty:slot.occupant.difficulty||this.settings.difficulty,x:spawn.x+(troll?0:(elfIndex++%3-1)*1.5),z:spawn.z+(troll?0:Math.floor(elfIndex/3)*1.5),yaw:0,hp:troll?B.troll.hp:B.elf.hp,maxHp:troll?B.troll.hp:B.elf.hp,gold:troll?B.troll.gold:B.elf.gold,wood:troll?0:B.elf.wood,alive:true,levels:Object.fromEntries(Object.keys(B.upgrades).map(k=>[k,0])),cooldowns:{},input:{x:0,z:0},lastInput:0,lastHit:-100,lastAttack:0,slowUntil:0,exposure:0,baseId:null,action:'idle',actionUntil:0,stats:{damage:0,produced:0,kills:0,upgrades:0},pingUntil:0};
      u.inventory=[];u.equipment={weapon:null,body:null,relic:null};u.combo=0;u.comboUntil=0;
      this.units.push(u);if(u.controller==='bot')this.controllers.set(u.id,new AIController(u.difficulty));
    }
    this.emit('phase',{text:'Preparação: os Elfos erguem suas bases enquanto o Troll aguarda o selo.'});
  }
  emit(type,data={}){this.events.push({id:++this.eventId,type,time:this.time,...data});if(this.events.length>120)this.events.splice(0,this.events.length-120);}
  unit(id){return this.units.find(u=>u.id===id);}
  entity(id){return this.unit(id)||this.structures.find(s=>s.id===id)||this.wisps.find(w=>w.id===id)||this.trees.find(t=>t.id===id);}
  canSee(u,target){return !!u&&distance(u,target)<=B.vision[u.role]&&lineOfSight(this.map,u,target);}
  teamSee(u,target){return this.units.some(a=>a.alive&&a.role===u.role&&this.canSee(a,target))||(u.role==='elf'&&this.structures.some(s=>s.hp>0&&s.progress>=1&&distance(s,target)<B.vision.elf&&lineOfSight(this.map,s,target)));}
  visibleEnemies(u){return [...this.units.filter(a=>a.alive&&a.role!==u.role),...this.structures.filter(s=>s.hp>0&&u.role==='troll'),...this.wisps.filter(w=>w.alive&&u.role==='troll')].filter(e=>this.canSee(u,e));}
  setController(id,type,difficulty='normal'){const u=this.unit(id);if(!u)return;u.controller=type;u.input={x:0,z:0};if(type==='bot')this.controllers.set(id,new AIController(difficulty));else this.controllers.delete(id);}
  blockedCells(role){const result=new Set();for(const s of this.structures)if(s.hp>0&&!(s.kind==='wall'&&role==='elf')){const p=toCell(this.map,s);result.add(index(this.map,p.x,p.z));}return result;}
  positionValid(u,x,z){
    const r=u.role==='troll'?B.movement.trollRadius:B.movement.elfRadius;
    const step=Math.hypot(x-u.x,z-u.z);if(step>0&&Math.abs(heightAt(this.map,x,z)-heightAt(this.map,u.x,u.z))>step*.55+.001)return false;
    for(const[dx,dz]of[[r,0],[-r,0],[0,r],[0,-r],[r*.7,r*.7],[-r*.7,r*.7],[r*.7,-r*.7],[-r*.7,-r*.7]]){const p=toCell(this.map,{x:x+dx,z:z+dz});if(!walkable(this.map,p.x,p.z))return false;}
    return !this.structures.some(s=>s.hp>0&&!(s.kind==='wall'&&u.role==='elf')&&Math.hypot(x-s.x,z-s.z)<B.structures[s.kind].radius+r);
  }
  movement(u,dt){
    if(!u.alive||(u.role==='troll'&&this.state===STATES.PREP))return;
    const v=u.dashUntil>this.time&&u.dashVector?u.dashVector:u.input,n=Math.hypot(v.x,v.z);if(!n)return;
    const speed=u.role==='elf'?B.elf.speed:this.trollStats(u).movement;
    const d=speed*(v.sprint?B.movement.sprint:1)*(u.slowUntil>this.time?B.branches.frost.slow:1)*(u.dashUntil>this.time?B.troll.dashSpeed:1)*(u.pendingStrike?(u.pendingStrike.heavy ? .55 : .9):1)*dt;
    const dx=v.x/Math.max(1,n)*d,dz=v.z/Math.max(1,n)*d;
    // Substeps keep collision authoritative even when simulation is accelerated.
    const steps=Math.max(1,Math.ceil(d/0.3));for(let i=0;i<steps;i++){if(this.positionValid(u,u.x+dx/steps,u.z))u.x+=dx/steps;if(this.positionValid(u,u.x,u.z+dz/steps))u.z+=dz/steps;}
    u.yaw=Number.isFinite(v.yaw)?v.yaw:Math.atan2(v.x,v.z);if(u.actionUntil<this.time)u.action='walk';
  }
  input(id,data){const u=this.unit(id);if(!u)return;u.input={x:clamp(Number.isFinite(data.x)?data.x:0,-1,1),z:clamp(Number.isFinite(data.z)?data.z:0,-1,1),sprint:data.sprint===true,...(Number.isFinite(data.yaw)?{yaw:data.yaw}:{})};u.lastInput=this.time;if(Number.isFinite(data.yaw))u.yaw=data.yaw;}
  act(id,cmd){
    const u=this.unit(id);if(!u||![STATES.PREP,STATES.ACTIVE].includes(this.state))return 'A partida não está ativa.';
    if(cmd.type==='ping')return this.ping(u,cmd);
    if(!u.alive)return 'Você foi eliminado. Acompanhe seus aliados.';
    if(u.role==='troll'&&this.state===STATES.PREP)return 'O selo ainda está ativo.';
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
      case 'transfer':return this.transfer(u,cmd);
      case 'assist':{const s=this.structures.find(s=>s.id===cmd.target);if(u.role!=='elf'||!s||distance(u,s)>B.interactRange||s.progress>=1)return 'Aproxime-se de uma obra aliada.';if((u.cooldowns.work||0)>this.time)return;u.cooldowns.work=this.time+.5;s.progress=Math.min(1,s.progress+.5/B.structures[s.kind].seconds);u.action='build';u.actionUntil=this.time+.5;return;}
      default:return 'Comando desconhecido.';
    }
  }
  ping(u,cmd){
    if((u.cooldowns.ping||0)>this.time)return 'Aguarde para sinalizar.';
    const x=cmd.x??u.x,z=cmd.z??u.z,limit=(this.map.size-1)*this.map.cell;
    if(!Number.isFinite(x)||!Number.isFinite(z)||x<0||z<0||x>limit||z>limit)return 'Posição inválida para sinalizar.';
    const kind=['danger','help','look'].includes(cmd.kind)?cmd.kind:'help';
    const text={danger:'Perigo aqui!',help:'Preciso de ajuda!',look:'Atenção nesta posição.'}[kind];
    u.cooldowns.ping=this.time+3;
    const ping={unit:u.id,x,z,role:u.role,kind,text,time:this.time,until:this.time+10};
    this.emit('ping',ping);this.pings=this.pings.filter(p=>p.until>this.time);this.pings.push({...ping,id:this.eventId});
  }
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
    }else if(!claim||claim.owner!==u.id)return 'Construa seu núcleo nesta clareira primeiro.';
    if(kind!=='wall'&&distance({x,z},b.gate)<B.construction.gateClearance)return 'Mantenha a entrada livre para a barricada.';
    if(this.structures.some(s=>s.hp>0&&distance(s,{x,z})<B.structures[s.kind].radius+def.radius+.3))return 'Espaço ocupado por outra estrutura.';
    if(this.units.some(a=>a.alive&&a.id!==u.id&&distance(a,{x,z})<def.radius+.7))return 'Um personagem está ocupando este espaço.';
    if(distance(u,{x,z})<def.radius+.45&&kind!=='wall')return 'Afaste-se um pouco da fundação.';
    if(this.trees.some(t=>t.amount>0&&distance(t,{x,z})<def.radius+.55))return 'Colete a árvore antes de construir aqui.';
    if(this.structures.filter(s=>s.owner===u.id&&s.kind===kind&&s.hp>0).length>=B.construction.limits[kind])return 'Limite desta estrutura atingido.';
    if(u.gold<def.gold||u.wood<def.wood)return 'Recursos insuficientes.';
    return null;
  }
  build(u,cmd){
    const x=Number(cmd.x),z=Number(cmd.z),kind=cmd.kind,error=this.placement(u,kind,x,z);if(error)return error;
    const def=B.structures[kind],b=kind==='wall'?this.map.bases.find(b=>distance(b.gate,{x,z})<.45):baseAt(this.map,{x,z});
    u.gold-=def.gold;u.wood-=def.wood;const hp=structureHP(kind,1);
    const s={id:'s'+this.nextId++,kind,owner:u.id,baseId:b.id,x,z,rotation:Number.isFinite(cmd.rotation)?cmd.rotation:0,tier:1,hp:hp*B.construction.initialHealth,maxHp:hp,progress:0,healthProgress:0,builder:u.id,branch:'power',lastHit:-100,lastShot:-100,upgrading:0,bounty:hp*B.troll.goldPerDamage*1.3};
    s.job={type:'build',gold:def.gold,wood:def.wood};this.structures.push(s);u.baseId=b.id;u.action='build';u.actionUntil=this.time+def.seconds;this.emit('build',{unit:u.id,entity:s.id,x,z,kind});
  }
  gather(u,id){
    if(u.role!=='elf')return 'Apenas Elfos coletam madeira.';
    const t=this.trees.find(t=>t.id===id&&t.amount>0);if(!t||distance(u,t)>B.interactRange||!lineOfSight(this.map,u,t))return 'Aproxime-se de uma árvore.';
    if(this.wisps.some(w=>w.alive&&w.treeId===id))return 'Árvore vinculada a um Wisp. Colete outra árvore.';
    if((u.cooldowns.gather||0)>this.time)return;
    const workshop=this.structures.find(s=>s.owner===u.id&&s.kind==='workshop'&&s.progress>=1&&s.hp>0);
    const amount=Math.min(t.amount,B.elf.gather*(t.rich?(this.time>B.finalAge?B.economy.finalRichWood:B.economy.richWood):1)*(1+(workshop?.tier||0)*B.economy.workshopGather));
    t.amount-=amount;u.wood+=amount;u.cooldowns.gather=this.time+B.elf.gatherInterval;u.action='gather';u.actionUntil=this.time+.45;this.emit('gather',{unit:u.id,x:t.x,z:t.z,amount});
  }
  repair(u,id){
    const s=this.structures.find(s=>s.id===id&&s.hp>0);if(u.role!=='elf'||!s||distance(u,s)>B.interactRange||!lineOfSight(this.map,u,s))return 'Aproxime-se de uma estrutura aliada.';
    if(s.progress<1)return this.act(u.id,{type:'assist',target:id});
    if(s.hp>=s.maxHp)return 'Estrutura sem danos.';if((u.cooldowns.repair||0)>this.time)return;
    if(u.gold<B.elf.repairCost||u.wood<1)return 'Reparo requer 3 ouro e 1 madeira.';
    const workshop=this.structures.find(a=>a.owner===u.id&&a.kind==='workshop'&&a.progress>=1&&a.hp>0);
    const heal=Math.min(s.maxHp-s.hp,B.elf.repair*(1+(workshop?.tier||0)*B.economy.workshopRepair));s.hp+=heal;s.bounty+=B.elf.repairCost*.6;u.gold-=B.elf.repairCost;u.wood-=1;u.cooldowns.repair=this.time+1;u.action='repair';u.actionUntil=this.time+.8;this.emit('repair',{unit:u.id,entity:id,x:s.x,z:s.z,amount:heal});
  }
  upgrade(u,id,branch){
    const s=this.structures.find(s=>s.id===id&&s.hp>0);if(u.role!=='elf'||!s||s.owner!==u.id)return 'Selecione uma estrutura sua.';
    if(distance(u,s)>B.interactRange)return 'Aproxime-se para melhorar.';
    if(s.progress<1||s.upgrading)return 'Construção ou melhoria em andamento.';
    if(s.tier===3&&this.time<B.finalAge)return `Tier final disponível em ${Math.ceil(B.finalAge-this.time)}s.`;
    const cost=upgradeCost(s);if(u.gold<cost.gold||u.wood<cost.wood)return 'Recursos insuficientes.';
    if(branch!==undefined&&!Object.hasOwn(B.branches,branch))return 'Especialização inválida.';
    u.gold-=cost.gold;u.wood-=cost.wood;s.upgrading=B.construction.upgradeSeconds+Math.min(7,s.tier);s.upgradeDuration=s.upgrading;s.job={type:'upgrade',...cost,duration:s.upgrading};s.nextBranch=branch||s.branch;u.stats.upgrades++;this.stats.upgrades++;this.emit('upgrade',{unit:u.id,entity:id,x:s.x,z:s.z});
  }
  buy(u,key){
    if(u.role!=='troll'||!Object.hasOwn(B.upgrades,key))return 'Melhoria inválida.';
    const level=u.levels[key];
    if(level===3&&this.time<B.finalAge)return 'Melhoria final ainda selada.';
    const cost=trollCost(key,level);if(u.gold<cost)return 'Ouro insuficiente.';
    u.gold-=cost;u.levels[key]++;if(key==='health'){const next=this.trollStats(u).maxHp;u.hp+=next-u.maxHp;u.maxHp=next;}u.stats.upgrades++;this.stats.upgrades++;this.emit('purchase',{unit:u.id,key,x:u.x,z:u.z});
  }
  trollStats(u){return combatStats(u);}
  equipItem(u,id,buy){
    if(u.role!=='troll'||!Object.hasOwn(ITEMS,id))return 'Equipamento inválido.';
    if(this.time-u.lastHit<5||(u.lastAttack>0&&this.time-u.lastAttack<5)||u.pendingStrike)return 'Equipe fora de combate: 5 s sem causar ou receber dano.';
    const item=ITEMS[id],owned=u.inventory.includes(id);
    if(!owned){if(!buy)return 'Compre o item primeiro.';if(u.gold<item.cost)return 'Ouro insuficiente.';u.gold-=item.cost;u.inventory.push(id);}
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
  transfer(u,cmd){
    const ally=this.unit(cmd.target);if(u.role!=='elf'||!ally||ally.id===u.id||ally.role!=='elf'||!ally.alive)return 'Selecione um aliado vivo.';
    const gold=Number(cmd.gold),wood=Number(cmd.wood);if(!Number.isSafeInteger(gold)||!Number.isSafeInteger(wood)||gold<0||wood<0||gold+wood===0||gold>u.gold||wood>u.wood)return 'Quantidade inválida.';
    u.gold-=gold;u.wood-=wood;ally.gold+=gold;ally.wood+=wood;this.emit('transfer',{unit:u.id,target:ally.id,gold,wood});
  }
  damage(target,amount,source,kind){
    if(target.hp<=0||amount<=0||!Number.isFinite(amount))return 0;
    const actual=Math.min(target.hp,amount);target.hp-=actual;
    // Hunger is attrition, not an enemy hit: do not renew threat, exposure or attack alerts.
    if(kind!=='hunger')target.lastHit=this.time;
    if(source?.role==='troll'){
      const economic=this.structures.filter(s=>s.hp>0&&s.progress===1),total=economic.reduce((sum,s)=>sum+income(s),0);
      const gain=actual*B.troll.goldPerDamage*scaling(this.units.filter(u=>u.role==='elf'&&u.alive).length,total,economic.filter(s=>s.kind==='core').length,this.time);
      const budgeted=target.kind||target.role==='wisp',awarded=budgeted?Math.min(gain,target.bounty||0):gain;
      if(budgeted)target.bounty-=awarded;source.gold+=awarded;source.lastAttack=this.time;source.stats.damage+=actual;this.stats.trollDamage+=actual;
    }else if(kind==='tower'){this.stats.towerDamage+=actual;if(source)source.stats.damage+=actual;}
    this.emit('damage',{entity:target.id,unit:source?.id,x:target.x,z:target.z,amount:Math.round(actual),kind});
    if(target.hp<=0){
      target.hp=0;if(target.kind){this.stats.destroyed++;if(target.kind==='wall'){this.brokenBases.add(target.baseId);this.stats.basesDestroyed=this.brokenBases.size;this.breachUntil.set(target.baseId,this.time+B.construction.breachCooldown);this.stats.firstBaseFall??=this.time;}this.emit('destroy',{entity:target.id,x:target.x,z:target.z,kind:target.kind});}
      else if(target.role==='wisp'){target.alive=false;this.emit('wisp-death',{entity:target.id,x:target.x,z:target.z});}
      else {target.alive=false;target.input={x:0,z:0};target.pendingStrike=null;target.queuedStrike=null;this.stats.kills++;if(source)source.stats.kills++;this.emit('death',{entity:target.id,x:target.x,z:target.z,name:target.name});}
    }return actual;
  }
  step(dt=1/B.tick){
    if(![STATES.PREP,STATES.ACTIVE].includes(this.state))return;
    this.time+=dt;
    if(this.state===STATES.PREP&&this.time>=this.preparation){this.state=STATES.ACTIVE;const troll=this.units.find(u=>u.role==='troll');if(troll)troll.lastAttack=this.time;this.emit('phase',{text:'O Troll foi libertado. Protejam as clareiras.'});}
    for(const u of this.units){if(!u.alive)continue;const controller=this.controllers.get(u.id);if(controller)controller.tick(this,u,dt);else if(this.time-u.lastInput>.35)u.input={x:0,z:0};this.movement(u,dt);if(u.actionUntil<this.time&&!Math.hypot(u.input.x,u.input.z))u.action='idle';}
    if(this.state===STATES.ACTIVE)for(const u of this.units.filter(u=>u.role==='troll'&&u.alive)){
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
      if(s.upgrading>0){s.upgrading=Math.max(0,s.upgrading-dt);if(!s.upgrading){const old=s.maxHp;s.tier++;s.maxHp=structureHP(s.kind,s.tier);s.hp+=s.maxHp-old;s.bounty+=(s.maxHp-old)*B.troll.goldPerDamage;s.branch=s.nextBranch;this.emit('complete',{entity:s.id,x:s.x,z:s.z});}}
      const owner=this.unit(s.owner);if(owner?.alive){const production=income(s)*dt;owner.gold+=production;owner.stats.produced+=production;this.stats.produced+=production;}
      if(s.kind==='tower'&&this.state===STATES.ACTIVE&&!(s.disabledUntil>this.time)){
        const troll=this.units.find(u=>u.role==='troll'&&u.alive),branch=B.branches[s.branch],def=B.structures.tower;
        if(troll&&distance(s,troll)<def.range+branch.range&&lineOfSight(this.map,s,troll)&&this.time-s.lastShot>=def.interval*branch.interval){
          s.lastShot=this.time;const armor=this.trollStats(troll).armor*(1-branch.armorPierce),exposure=1+Math.max(0,troll.exposure-B.troll.exposureGrace)*B.troll.exposureRate;
          const dmg=towerDamage(s.tier)*branch.damage*mitigation(armor)*exposure;
          this.damage(troll,dmg,owner,'tower');if(branch.slow)troll.slowUntil=this.time+1.5;
          this.emit('shot',{entity:s.id,target:troll.id,x:s.x,z:s.z,tx:troll.x,tz:troll.z,branch:s.branch});
        }
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
    if(!troll?.alive||!elves.some(u=>u.alive)){this.state=STATES.END;this.winner=troll?.alive?'troll':'elves';this.emit('end',{winner:this.winner});}
  }
  snapshot(viewerId=null){
    const viewer=this.unit(viewerId),observer=!viewer,canView=e=>observer||e.id===viewer.id||e.role===viewer.role||(viewer.role==='elf'&&e.kind)||this.teamSee(viewer,e);
    const units=this.units.filter(canView).map(u=>{const own=observer||u.id===viewer.id;return {id:u.id,name:u.name,role:u.role,controller:u.controller,x:u.x,z:u.z,yaw:u.yaw,hp:u.hp,maxHp:u.maxHp,alive:u.alive,lastHit:u.lastHit,effects:unitEffects(u,this.time,this.state,this.preparation),action:u.action,actionUntil:u.actionUntil,equipment:u.equipment,baseId:u.role==='elf'&&(observer||viewer.role==='elf')?u.baseId:null,...(own?{gold:u.gold,wood:u.wood,levels:u.levels,cooldowns:u.cooldowns,stats:u.stats,lastAttack:u.lastAttack,inventory:u.inventory,combo:u.combo,comboUntil:u.comboUntil,openingUntil:u.openingUntil,...(u.role==='troll'?{combat:this.trollStats(u)}:{income:this.structures.filter(s=>s.owner===u.id&&s.hp>0&&s.progress===1).reduce((a,s)=>a+income(s),0),woodIncome:this.wisps.filter(w=>w.owner===u.id&&wispActive(this,w)).reduce((n,w)=>n+wispIncome(w),0)})}:{})};});
    const structures=this.structures.filter(s=>s.hp>0&&canView(s)).map(({bounty,builder,nextBranch,job,...s})=>({...s,effects:structureEffects(s,this.time),...(observer||s.owner===viewer.id?{refund:jobRefund({...s,job},this.time)}:{})}));
    const wisps=this.wisps.filter(w=>w.alive&&(observer||viewer.role==='elf'||this.teamSee(viewer,w))).map(({bounty,job,...w})=>({...w,income:wispActive(this,w)?wispIncome(w):0,...(observer||w.owner===viewer.id?{refund:jobRefund({...w,job},this.time)}:{})}));
    const visibleIds=new Set([...units,...structures,...wisps].map(e=>e.id));
    const events=this.events.filter(e=>e.type==='phase'||e.type==='end'||(e.type==='ping'&&(observer||e.role===viewer.role))||(e.type!=='ping'&&(visibleIds.has(e.unit)||visibleIds.has(e.entity)||(Number.isFinite(e.x)&&(observer||this.teamSee(viewer,e))))));
    const pings=this.pings.filter(p=>p.until>this.time&&(observer||p.role===viewer.role));
    const alerts=[...units.filter(u=>u.alive&&(observer||u.role===viewer.role)),...structures.filter(()=>observer||viewer.role==='elf'),...wisps.filter(()=>observer||viewer.role==='elf')].filter(e=>this.time-e.lastHit<5).map(e=>({id:e.id,x:e.x,z:e.z,owner:e.owner||e.id,kind:e.kind||e.role,until:e.lastHit+5}));
    return {state:this.state,time:this.time,preparation:this.preparation,winner:this.winner,viewerId,units,structures,wisps,pings,alerts,trees:this.trees.filter(t=>observer||this.teamSee(viewer,t)),breaches:observer||viewer.role==='elf'?Object.fromEntries(this.breachUntil):{},events,stats:this.state===STATES.END?this.stats:null,finalAge:B.finalAge,hungerAge:B.hungerAge};
  }
  result(){return {seed:this.map.seed,winner:this.winner,duration:Math.round(this.time),elves:this.units.filter(u=>u.role==='elf').length,survivors:this.units.filter(u=>u.role==='elf'&&u.alive).length,...this.stats,players:this.units.map(u=>({name:u.name,role:u.role,...u.stats}))};}
}
function pointSegmentDistance(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,n=dx*dx+dz*dz;if(n===0)return distance(p,a);const t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/n,0,1);return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);}
