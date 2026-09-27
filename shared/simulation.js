import { BALANCE as B, STATES, DEFAULT_SETTINGS, clamp, distance, mitigation, structureHP, structureRewardHP, legendaryStructure, epicStructure, towerProfile, placementRadius, income, resourceProducer, upgradeCost, trollCost, trollUpgradeStatus, scaling, towerDamage, arcaneTowerDamage, wispIncome, mineEconomy, trollLateThreatIncome, essenceIncome, elfPath, repairPower } from './config.js';
import { generateMap, baseAt, baseZone, toCell, walkable, index, lineOfSight, towerLineOfSight, heightAt, flatGround } from './map.js';
import { AIController } from './controllers.js';
import { CombatTelemetry } from './telemetry.js';
import { playerSummary, teamScores } from './score.js';
import { unitEffects, structureEffects } from './effects.js';
import { ITEMS, ITEM_RARITIES, combatStats, itemUpgradeCost } from './equipment.js';
import { commandWisp, stepWisps, wispActive } from './wisps.js';
import { upgradeStatus } from './upgrade-rules.js';
import { cancelJob, demolitionRefund, jobRefund } from './jobs.js';
import { recordRefund, recordSpend, structurePurpose } from './economy.js';
import { TROLL_CARD_LEVELS, cardById, cardEffects, cardOffer, chooseBotCard, xpForTrollLevel } from './cards.js';
import { abilityStatus, chooseSpecialization, chooseTechnology, productionBreakdown, productionMultiplier, signatureAllowed, stepElfProgression, technologyEffects, useSpecializationAbility } from './elf-progression.js';

export class Match {
  constructor(settings,slots) {
    this.settings={...DEFAULT_SETTINGS,...settings};this.map=generateMap(this.settings.seed,this.settings.mapSize);
    this.time=0;this.devSpeed=1;this.devSpeedHistory=[{time:0,speed:1}];this.state=STATES.PREP;this.structures=[];this.units=[];this.wisps=[];this.reveals=[];this.unitById=new Map();this.structureById=new Map();this.wispById=new Map();this.treeById=new Map();this.structureBuckets=new Map();this.indexedStructureCount=0;this.controllers=new Map();this.nextId=1;this.repairSequence=0;this.events=[];this.pings=[];this.eventId=0;this.winner=null;this.endReason=null;this.scoreLimit=null;this.elfStunReadyAt=0;this.brokenBases=new Set();this.breachUntil=new Map();this.reclaimUntil=new Map();this.elfBasesClaimed=new Set();this.trollDiscoveredBases=new Set();this.startingElfCount=slots.filter(s=>s.role==='elf'&&s.occupant).length;
    this.stats={trollDamage:0,towerDamage:0,wallRegeneration:0,produced:0,destroyed:0,basesDestroyed:0,kills:0,ghostsDestroyed:0,upgrades:0,highestIncome:0,attacks:0,firstBaseFall:null,buildingsCreated:0,unitsLost:0,combatInteractions:{}};
    this.combatInteractions=new Map();this.telemetry=new CombatTelemetry(this.settings.diagnostics===true);
    this.trees=this.map.trees.map(t=>({...t}));for(const tree of this.trees)this.treeById.set(tree.id,tree);this.specialNodes=(this.map.specialNodes||[]).map(n=>({...n}));this.preparation=this.settings.preparation+Math.max(0,slots.filter(s=>s.role==='elf'&&s.occupant).length-2)*2;
    let elfIndex=0;
    for(const slot of slots.filter(s=>s.occupant)){
      const troll=slot.role==='troll',spawn=troll?this.map.trollSpawn:this.map.elfSpawn;
      const u={id:slot.id,name:slot.occupant.name,role:slot.role,controller:slot.occupant.type,clientId:slot.occupant.clientId||null,difficulty:slot.occupant.difficulty||this.settings.difficulty,x:spawn.x+(troll?0:(elfIndex++%3-1)*1.5),z:spawn.z+(troll?0:Math.floor(elfIndex/3)*1.5),yaw:0,hp:troll?B.troll.hp:B.elf.hp,maxHp:troll?B.troll.hp:B.elf.hp,gold:troll?B.troll.gold:B.elf.gold,wood:troll?0:B.elf.wood,essence:0,elfPath:null,specialResources:{ancientWood:0,crystal:0,mana:0},elfSpecialization:null,elfTechCards:[],alive:true,ghost:false,observer:false,levels:Object.fromEntries(Object.keys(B.upgrades).map(k=>[k,0])),cooldowns:{},input:{x:0,z:0},lastInput:0,lastHit:-100,lastAttack:0,slowUntil:0,exposure:0,baseId:null,coreFoundations:0,relocationUntil:0,relocationVouchers:troll?0:1,action:'idle',actionUntil:0,stats:{damage:0,produced:0,kills:0,ghostsDestroyed:0,reveals:0,upgrades:0,goldGenerated:0,goldFromDamage:0,goldFromDamageGross:0,goldFromDamageDiminished:0,goldFromObjectives:0,goldFromObjectiveScalingGross:0,goldFromObjectiveScalingDiminished:0,goldFromThreat:0,goldSpent:0,woodGenerated:0,manualWoodGathered:0,wispWoodGenerated:0,woodSpent:0,essenceGenerated:0,essenceSpent:0,specialResources:0,technologyCards:0,goldRefunded:0,woodRefunded:0,spendByPurpose:{},spendByAction:{},specializationImpact:{arcaneDamage:0,fortifiedDamagePrevented:0,bastionHealing:0,refineryBonusGold:0,refineryBonusWood:0,overdriveBonusGold:0,overdriveBonusWood:0},unitsCreated:0,unitsLost:0,structuresBuilt:0,structuresDestroyed:0,healing:0,stuns:0,relocations:0,coreFoundations:0,recalls:0},pingUntil:0};
      u.inventory=[];u.itemLevels={};u.equipment={weapon:null,helmet:null,armor:null,boots:null};u.combo=0;u.comboUntil=0;
      if(troll){u.healCharges=B.troll.healCharges;u.healRechargeAt=null;u.healingUntil=0;u.healingRemaining=0;u.recallUntil=0;u.recallStartedAt=0;u.recallSpeedUntil=0;u.recallDeparturePending=false;u.trollLevel=1;u.trollXp=0;u.cards=[];u.cardOffer=cardOffer(this.map.seed,1,[]);u.cardOfferLevel=1;u.pendingCardLevels=[];u.stats.xpEarned=0;u.stats.xpFromStructureDamage=0;u.stats.xpFromStructureDamageGross=0;u.stats.xpFromStructureDamageDiminished=0;u.stats.xpFromUnitDamage=0;u.stats.trollLevelTimestamps={1:0};u.stats.cardChoices=[];u.stats.cardHealing={lifesteal:0,combatRegen:0,devour:0};}
      this.units.push(u);this.unitById.set(u.id,u);if(u.controller==='bot')this.controllers.set(u.id,new AIController(u.difficulty));
    }
    this.emit('phase',{text:'Preparação: os Elfos erguem suas bases enquanto o Troll aguarda o selo.'});
  }
  emit(type,data={}){this.events.push({id:++this.eventId,type,time:this.time,...data});if(this.events.length>120)this.events.splice(0,this.events.length-120);}
  unit(id){if(!id)return undefined;const cached=this.unitById.get(id);if(cached)return cached;const value=this.units.find(u=>u.id===id);if(value)this.unitById.set(id,value);return value;}
  entity(id){if(!id)return undefined;const cached=this.unit(id)||this.structureById.get(id)||this.wispById.get(id)||this.treeById.get(id);if(cached)return cached;const value=this.structures.find(s=>s.id===id)||this.wisps.find(w=>w.id===id)||this.trees.find(t=>t.id===id)||this.specialNodes.find(n=>n.id===id);if(value){if(value.kind)this.structureById.set(id,value);else if(value.role==='wisp')this.wispById.set(id,value);else if(value.amount!==undefined&&!value.resource)this.treeById.set(id,value);}return value;}
  structureBucket(x,z){return `${Math.floor(x/8)},${Math.floor(z/8)}`;}
  registerStructure(structure){this.structureById.set(structure.id,structure);const key=this.structureBucket(structure.x,structure.z),bucket=this.structureBuckets.get(key)||[];bucket.push(structure);this.structureBuckets.set(key,bucket);this.indexedStructureCount=this.structures.length;}
  syncStructureIndex(){if(this.indexedStructureCount===this.structures.length)return;this.structureBuckets.clear();this.structureById.clear();for(const structure of this.structures){this.structureById.set(structure.id,structure);const key=this.structureBucket(structure.x,structure.z),bucket=this.structureBuckets.get(key)||[];bucket.push(structure);this.structureBuckets.set(key,bucket);}this.indexedStructureCount=this.structures.length;}
  nearbyStructures(point,radius=8){this.syncStructureIndex();const result=[],minX=Math.floor((point.x-radius)/8),maxX=Math.floor((point.x+radius)/8),minZ=Math.floor((point.z-radius)/8),maxZ=Math.floor((point.z+radius)/8);for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++)for(const structure of this.structureBuckets.get(`${x},${z}`)||[])if(structure.hp>0&&distance(point,structure)<=radius+B.structures[structure.kind].radius)result.push(structure);return result;}
  grantTrollGold(troll,amount,source){if(!troll?.alive||amount<=0)return;troll.gold+=amount;troll.stats.goldGenerated+=amount;const key=source==='damage'?'goldFromDamage':source==='threat'?'goldFromThreat':'goldFromObjectives';troll.stats[key]=(troll.stats[key]||0)+amount;}
  trollDamageGoldMultiplier(troll){
    const activeElapsed=Math.max(0,this.time-this.preparation),levelPressure=Math.max(0,(troll?.trollLevel||1)-B.economy.trollDamageGoldDiminishingLevel+1),minutePressure=Math.max(0,activeElapsed-B.economy.trollDamageGoldDiminishingStart)/60;
    if(levelPressure<=0&&minutePressure<=0)return 1;
    return Math.max(B.economy.trollDamageGoldMinimum,1/(1+levelPressure*B.economy.trollDamageGoldLevelPressure+minutePressure*B.economy.trollDamageGoldMinutePressure));
  }
  legendarySustainPressure(troll){
    const towers=this.structures.filter(s=>s.kind==='tower'&&s.legendary&&s.hp>0&&s.progress>=1&&s.beamTarget===troll?.id&&!(s.disabledUntil>this.time)).length;
    return {towers,multiplier:towers>=3?B.legendary.sustainThreeTowers:towers>=2?B.legendary.sustainTwoTowers:1};
  }
  trollStructureXpMultiplier(troll){
    const levelPressure=Math.max(0,(troll?.trollLevel||1)-B.troll.structureXpDiminishingLevel);
    return levelPressure>0?Math.max(B.troll.structureXpMinimum,1/(1+levelPressure*B.troll.structureXpLevelPressure)):1;
  }
  grantTrollXp(troll,amount,source='combat'){
    if(!troll?.alive||amount<=0||troll.trollLevel>=20)return;
    troll.trollXp+=amount;troll.stats.xpEarned+=amount;
    while(troll.trollLevel<20&&troll.trollXp>=xpForTrollLevel(troll.trollLevel)){
      troll.trollXp-=xpForTrollLevel(troll.trollLevel);troll.trollLevel++;troll.stats.trollLevelTimestamps[troll.trollLevel]=this.time;
      this.emit('troll-level',{unit:troll.id,x:troll.x,z:troll.z,level:troll.trollLevel,source});
      if(TROLL_CARD_LEVELS.includes(troll.trollLevel)){if(troll.cardOffer?.length)troll.pendingCardLevels.push(troll.trollLevel);else{troll.cardOfferLevel=troll.trollLevel;troll.cardOffer=cardOffer(this.map.seed,troll.trollLevel,troll.cards);}}
    }
  }
  trollCardAvailable(troll){return !!troll?.cardOffer?.length&&(this.state!==STATES.ACTIVE||this.time-Math.max(troll.lastHit??-Infinity,troll.lastAttack??-Infinity)>=B.troll.cardOutOfCombatDelay);}
  selectTrollCard(troll,id){
    if(troll?.role!=='troll'||!troll.cardOffer?.includes(id)||!cardById(id))return 'Carta indisponível.';
    if(!this.trollCardAvailable(troll))return `A escolha será liberada após ${B.troll.cardOutOfCombatDelay}s fora de combate.`;
    const before=this.trollStats(troll),level=troll.cardOfferLevel||troll.trollLevel,offered=[...troll.cardOffer];troll.cards.push(id);troll.cardOffer=[];troll.cardOfferLevel=0;troll.stats.cardChoices.push({id,offered,level,time:this.time});
    const after=this.trollStats(troll),fraction=troll.hp/Math.max(1,before.maxHp);troll.maxHp=after.maxHp;troll.hp=Math.min(troll.maxHp,troll.maxHp*fraction);
    const next=troll.pendingCardLevels.shift();if(next){troll.cardOfferLevel=next;troll.cardOffer=cardOffer(this.map.seed,next,troll.cards);}
    this.emit('card-chosen',{unit:troll.id,x:troll.x,z:troll.z,card:id,level,rarity:cardById(id).rarity});return null;
  }
  objectiveReward(troll,target){
    const rewards=B.economy.trollObjective,base=target.kind?rewards[target.kind]||0:target.role==='elf'&&!target.ghost?rewards.elf:target.role==='wisp'?rewards.wisp:0,multiplier=this.trollStats(troll).objectiveGold||1,investment=target.investmentCost||{},activeElapsed=Math.max(0,this.time-this.preparation),legendary=target.kind&&(target.legendary||legendaryStructure(target.kind,target.tier)),scalingMode=this.settings.objectiveScalingMode||'late',scalable=target.kind&&(legendary||(scalingMode==='late'&&activeElapsed>=B.economy.trollLateThreatStart)),economicValue=scalable?(investment.gold||0)*B.economy.trollObjectiveInvestmentRate+(investment.wood||0)*B.economy.trollObjectiveWoodRate+(investment.essence||0)*B.economy.trollObjectiveEssenceRate+income(target)*B.economy.trollObjectiveIncomeSeconds:0;
    const flatAmount=(base+(legendary?rewards.legendary:0))*multiplier,scalableGross=economicValue*multiplier,scalingMultiplier=this.trollDamageGoldMultiplier(troll),scalableAmount=scalableGross*scalingMultiplier,amount=flatAmount+scalableAmount;
    troll.stats.goldFromObjectiveScalingGross=(troll.stats.goldFromObjectiveScalingGross||0)+scalableGross;troll.stats.goldFromObjectiveScalingDiminished=(troll.stats.goldFromObjectiveScalingDiminished||0)+Math.max(0,scalableGross-scalableAmount);
    this.grantTrollGold(troll,amount,'objective');this.grantTrollXp(troll,(target.kind?{wall:120,tower:180,mine:160,core:300,workshop:120}[target.kind]||50:target.role==='elf'?200:20)+(target.legendary?250:0),'objective');if(amount)this.emit('troll-objective',{unit:troll.id,entity:target.id,x:target.x,z:target.z,kind:target.kind||target.role,amount,flatAmount,scalableGross,scalableAmount,scalingMultiplier});
  }
  canSee(u,target){return !!u&&distance(u,target)<=(u.ghost?B.ghost.vision:B.vision[u.role])&&lineOfSight(this.map,u,target);}
  teamSee(u,target){return this.units.some(a=>(a.alive||a.ghost)&&a.role===u.role&&this.canSee(a,target))||(u.role==='elf'&&(this.structures.some(s=>s.hp>0&&s.progress>=1&&distance(s,target)<B.vision.elf&&lineOfSight(this.map,s,target))||this.reveals.some(r=>r.until>this.time&&distance(r,target)<=r.radius)));}
  visibleEnemies(u){return [...this.units.filter(a=>(a.alive||a.ghost)&&a.role!==u.role),...this.structures.filter(s=>s.hp>0&&u.role==='troll'),...this.wisps.filter(w=>w.alive&&u.role==='troll')].filter(e=>this.canSee(u,e));}
  setController(id,type,difficulty='normal'){const u=this.unit(id);if(!u)return;u.controller=type;u.input={x:0,z:0};if(type==='bot')this.controllers.set(id,new AIController(difficulty));else this.controllers.delete(id);}
  blockedCells(role){const result=new Set();for(const s of this.structures)if(s.hp>0&&!(s.kind==='wall'&&role==='elf')){const p=toCell(this.map,s);result.add(index(this.map,p.x,p.z));}return result;}
  positionValid(u,x,z){
    const r=u.role==='troll'?B.movement.trollRadius:B.movement.elfRadius;
    const step=Math.hypot(x-u.x,z-u.z);if(step>0&&Math.abs(heightAt(this.map,x,z)-heightAt(this.map,u.x,u.z))>step*.55+.001)return false;
    for(const[dx,dz]of[[r,0],[-r,0],[0,r],[0,-r],[r*.7,r*.7],[-r*.7,r*.7],[r*.7,-r*.7],[-r*.7,-r*.7]]){const p=toCell(this.map,{x:x+dx,z:z+dz});if(!walkable(this.map,p.x,p.z))return false;}
    return !this.nearbyStructures({x,z},6).some(s=>!(s.kind==='wall'&&u.role==='elf')&&Math.hypot(x-s.x,z-s.z)<B.structures[s.kind].radius+r);
  }
  movement(u,dt){
    if((!u.alive&&!u.ghost)||(u.stunnedUntil||0)>this.time||(u.recallUntil||0)>this.time)return;
    const v=u.dashUntil>this.time&&u.dashVector?u.dashVector:u.input,n=Math.hypot(v.x,v.z);if(!n)return;
    const speed=u.role==='elf'?B.elf.speed:this.trollStats(u).movement;
    const travel=u.role==='troll'&&u.controller==='bot'&&v.travel===true&&this.time-u.lastHit>=5&&this.time-u.lastAttack>=5?B.troll.travelSpeed:1;
    const sprint=v.sprint?(u.role==='elf'?B.movement.elfSprint:B.movement.sprint):1;
    const d=speed*sprint*travel*(u.slowUntil>this.time?B.branches.frost.slow:1)*(u.dashUntil>this.time?B.troll.dashSpeed:1)*(u.recallSpeedUntil>this.time?B.troll.recallExitBoost:1)*(u.pendingStrike?(u.pendingStrike.heavy ? .55 : .9):1)*dt;
    const dx=v.x/Math.max(1,n)*d,dz=v.z/Math.max(1,n)*d;
    // Substeps keep collision authoritative even when simulation is accelerated.
    const sealed=u.role==='troll'&&this.state===STATES.PREP,insideSeal=(x,z)=>!sealed||distance({x,z},this.map.trollSpawn)<=B.troll.sanctuaryRadius;
    const steps=Math.max(1,Math.ceil(d/0.3));for(let i=0;i<steps;i++){if(insideSeal(u.x+dx/steps,u.z)&&this.positionValid(u,u.x+dx/steps,u.z))u.x+=dx/steps;if(insideSeal(u.x,u.z+dz/steps)&&this.positionValid(u,u.x,u.z+dz/steps))u.z+=dz/steps;}
    u.yaw=Number.isFinite(v.yaw)?v.yaw:Math.atan2(v.x,v.z);if(u.recallDeparturePending&&distance(u,this.map.trollSpawn)>B.troll.sanctuaryRadius){u.recallDeparturePending=false;u.recallSpeedUntil=this.time+B.troll.recallExitBoostDuration;this.emit('recall-boost',{unit:u.id,x:u.x,z:u.z,until:u.recallSpeedUntil});}if(u.actionUntil<this.time)u.action='walk';
  }
  input(id,data){const u=this.unit(id);if(!u||(!u.alive&&!u.ghost)||(u.stunnedUntil||0)>this.time)return;const x=clamp(Number.isFinite(data.x)?data.x:0,-1,1),z=clamp(Number.isFinite(data.z)?data.z:0,-1,1);if((u.recallUntil||0)>this.time&&Math.hypot(x,z)>.05)this.cancelTrollRecall(u,'movement');u.input={x,z,sprint:data.sprint===true,...(Number.isFinite(data.yaw)?{yaw:data.yaw}:{})};u.lastInput=this.time;if(Number.isFinite(data.yaw))u.yaw=data.yaw;}
  devGrant(id,{gold=0,wood=0,essence=0}={}){
    const u=this.unit(id),g=Number(gold),w=Number(wood),e=Number(essence);
    if(!u)return 'Jogador inválido.';
    if(!Number.isSafeInteger(g)||!Number.isSafeInteger(w)||!Number.isSafeInteger(e)||g<0||w<0||e<0||g+w+e<1||g>1_000_000||w>1_000_000||e>1_000_000)return 'Quantidade dev inválida.';
    u.gold+=g;u.wood+=w;if(u.role==='elf')u.essence+=e;this.emit('dev-grant',{unit:id,x:u.x,z:u.z,gold:g,wood:w,essence:u.role==='elf'?e:0});return null;
  }
  act(id,cmd){
    const u=this.unit(id);if(!u||![STATES.PREP,STATES.ACTIVE].includes(this.state))return 'A partida não está ativa.';
    if(cmd.type==='ping')return this.ping(u,cmd);
    if(cmd.type==='selectCard')return this.selectTrollCard(u,cmd.card);
    if(!u.alive&&!u.ghost)return 'Você foi eliminado. Acompanhe seus aliados.';
    if(u.ghost){if(cmd.type==='repair')return this.repair(u,cmd.target);if(cmd.type==='ghostReveal')return this.ghostReveal(u);return 'Como espírito, você pode revelar, reparar Barricadas e sinalizar.';}
    const preparationShopAction=u.role==='troll'&&['buy','buyItem','equipItem','upgradeItem'].includes(cmd.type);
    if(u.role==='troll'&&this.state===STATES.PREP&&!preparationShopAction)return 'O selo ainda está ativo.';
    if((u.stunnedUntil||0)>this.time)return `Atordoado por ${Math.ceil(u.stunnedUntil-this.time)}s.`;
    if((u.recallUntil||0)>this.time&&cmd.type!=='trollRecall')this.cancelTrollRecall(u,'action');
    switch(cmd.type){
      case 'build':return this.build(u,cmd);
      case 'cancelJob':return cancelJob(this,u,cmd.target);
      case 'demolish':return this.demolish(u,cmd.target);
      case 'gather':return this.gather(u,cmd.target);
      case 'gatherSpecial':return this.gatherSpecial(u,cmd.target);
      case 'repair':return this.repair(u,cmd.target);
      case 'upgrade':return this.upgrade(u,cmd.target,cmd.branch);
      case 'chooseElfPath':return this.chooseElfPath(u,cmd.target,cmd.path);
      case 'buy':return this.buy(u,cmd.key);
      case 'attack':if(Number.isFinite(cmd.yaw))u.yaw=cmd.yaw;return this.attack(u,cmd.heavy===true);
      case 'dash':return this.dash(u);
      case 'buyItem':case 'equipItem':return this.equipItem(u,cmd.item,cmd.type==='buyItem');
      case 'upgradeItem':return this.upgradeItem(u,cmd.item);
      case 'trainWisp':case 'trainSpecialWisp':case 'upgradeWisp':case 'upgradeAllWisps':return commandWisp(this,u,cmd);
      case 'chooseElfSpecialization':return chooseSpecialization(this,u,cmd.key);
      case 'chooseElfTechnology':return chooseTechnology(this,u,cmd.key);
      case 'elfSpecializationAbility':return useSpecializationAbility(this,u);
      case 'heal':return this.healTroll(u);
      case 'roar':return this.roar(u);
      case 'trollRecall':return this.trollRecall(u);
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
    if(['refinery','bastion','arcaneTower'].includes(kind)&&!signatureAllowed(u,kind))return 'Esta construção pertence a outra especialização.';
    if(!Number.isFinite(x)||!Number.isFinite(z))return 'Posição inválida.';
    if(distance(u,{x,z})>B.construction.range)return 'Aproxime-se do local de construção.';
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
      if((u.coreFoundations||0)>=2)return 'Você já usou seu único reassentamento.';
      if(claim)return 'Esta clareira já pertence a outro Elfo.';
      if((this.reclaimUntil.get(b.id)||0)>this.time)return `Clareira em colapso: aguarde ${Math.ceil(this.reclaimUntil.get(b.id)-this.time)} segundos.`;
    }else if(!claim)return 'Esta clareira precisa de um núcleo ativo.';
    else if(!this.unit(claim.owner)?.alive)return 'O proprietário desta clareira foi eliminado.';
    if(kind!=='wall'&&distance({x,z},b.gate)<B.construction.gateClearance)return 'Mantenha a entrada livre para a barricada.';
    if(this.structures.some(s=>s.hp>0&&distance(s,{x,z})<placementRadius(s.kind)+placementRadius(kind)+B.construction.placementGap))return 'Espaço ocupado por outra estrutura.';
    if(this.units.some(a=>(a.alive||a.ghost)&&a.id!==u.id&&distance(a,{x,z})<def.radius+.7))return 'Um personagem está ocupando este espaço.';
    if(distance(u,{x,z})<def.radius+.45&&kind!=='wall')return 'Afaste-se um pouco da fundação.';
    if(this.trees.some(t=>t.amount>0&&distance(t,{x,z})<def.radius+.55))return 'Colete a árvore antes de construir aqui.';
    if(this.specialNodes.some(n=>n.amount>0&&distance(n,{x,z})<def.radius+.8))return 'O depósito especial ocupa este espaço.';
    const kindCount=this.structures.filter(s=>s.baseId===b.id&&s.kind===kind&&s.hp>0).length;
    if(kind==='mine'&&kindCount>=mineEconomy(claim?.tier).capacity)return `Núcleo nível ${claim.tier+1} necessário para outra Mina.`;
    if(kindCount>=B.construction.limits[kind])return 'Limite desta estrutura nesta clareira atingido.';
    const cost=this.buildCost(u,kind,b.id);if(u.gold<cost.gold||u.wood<cost.wood)return 'Recursos insuficientes.';
    return null;
  }
  build(u,cmd){
    const x=Number(cmd.x),z=Number(cmd.z),kind=cmd.kind,error=this.placement(u,kind,x,z);if(error)return error;
    const def=B.structures[kind],b=kind==='wall'?this.map.bases.find(b=>distance(b.gate,{x,z})<.45):baseAt(this.map,{x,z}),cost=this.buildCost(u,kind,b.id);
    u.gold-=cost.gold;u.wood-=cost.wood;recordSpend(u,cost,structurePurpose(kind),'construction');u.stats.structuresBuilt++;this.stats.buildingsCreated++;const hp=structureHP(kind,1)*(elfPath(u.elfPath)?.structureHp||1);
    const elfCount=this.units.filter(a=>a.role==='elf').length,lobby=Math.min(B.maxElves,elfCount),bountyFactor=(B.economy.trollBountyFactor[lobby]||1.3)*(B.economy.trollMapBounty[this.settings.mapSize]||1)*(B.economy.trollScenarioBounty[this.settings.mapSize]?.[this.settings.difficulty]?.[lobby]||1);
    const s={id:'s'+this.nextId++,kind,owner:u.id,baseId:b.id,zone:kind==='wall'?'frontline':baseZone(this.map,b,{x,z}),x,z,rotation:Number.isFinite(cmd.rotation)?cmd.rotation:0,tier:1,hp:hp*B.construction.initialHealth,maxHp:hp,progress:0,healthProgress:0,builder:u.id,branch:'power',lastHit:-100,lastShot:-100,upgrading:0,createdAt:this.time,bountyFactor,bounty:hp*B.troll.goldPerDamage*bountyFactor,constructionCost:{gold:cost.gold,wood:cost.wood},investmentCost:{gold:cost.gold,wood:cost.wood},...(kind==='mine'?{coreTier:this.structures.find(a=>a.kind==='core'&&a.baseId===b.id&&a.hp>0)?.tier||0}:{})};
    s.job={type:'build',gold:cost.gold,wood:cost.wood,relocation:cost.relocation,relocationUntil:u.relocationUntil||0};this.structures.push(s);this.registerStructure(s);if(kind==='core'){u.coreFoundations=(u.coreFoundations||0)+1;u.stats.coreFoundations=(u.stats.coreFoundations||0)+1;this.elfBasesClaimed.add(b.id);if(cost.relocation){u.relocationVouchers--;u.stats.relocations++;}u.relocationUntil=0;u.baseId=b.id;u.displacedBaseId=null;u.relocationThreat=null;}u.action='build';u.actionUntil=this.time+def.seconds;this.emit('build',{unit:u.id,entity:s.id,x,z,kind,relocation:cost.relocation,coreFoundation:u.coreFoundations||0});
  }
  gather(u,id){
    if(u.role!=='elf')return 'Apenas Elfos coletam madeira.';
    const t=this.trees.find(t=>t.id===id&&t.amount>0);if(!t||distance(u,t)>B.interactRange||!lineOfSight(this.map,u,t))return 'Aproxime-se de uma árvore.';
    if(this.wisps.some(w=>w.alive&&w.treeId===id))return 'Árvore vinculada a um Wisp. Colete outra árvore.';
    if((u.cooldowns.gather||0)>this.time)return;
    const workshop=this.structures.find(s=>s.owner===u.id&&s.kind==='workshop'&&s.progress>=1&&s.hp>0);
    const amount=Math.min(t.amount,B.elf.gather*(t.rich?(this.time>B.finalAge?B.economy.finalRichWood:B.economy.richWood):1)*(1+(workshop?.tier||0)*B.economy.workshopGather));
    t.amount-=amount;u.wood+=amount;u.stats.woodGenerated+=amount;u.stats.manualWoodGathered+=amount;u.cooldowns.gather=this.time+B.elf.gatherInterval;u.action='gather';u.actionUntil=this.time+.45;this.emit('gather',{unit:u.id,x:t.x,z:t.z,amount});
  }
  gatherSpecial(u,id){
    if(u.role!=='elf')return 'Apenas Elfos coletam recursos especiais.';
    const node=this.specialNodes.find(n=>n.id===id&&n.amount>0);if(!node||distance(u,node)>B.interactRange||!lineOfSight(this.map,u,node))return 'Aproxime-se do depósito especial.';
    if(this.wisps.some(w=>w.alive&&w.specialNodeId===id))return 'Depósito vinculado a um Wisp especial.';
    if((u.cooldowns.gather||0)>this.time)return;
    const amount=Math.min(node.amount,B.elfProgression.specialGather);node.amount-=amount;u.specialResources[node.resource]+=amount;u.stats.specialResources+=amount;u.cooldowns.gather=this.time+B.elf.gatherInterval;u.action='gather';u.actionUntil=this.time+.45;this.emit('gather',{unit:u.id,entity:id,x:node.x,z:node.z,resource:node.resource,amount});
  }
  repair(u,id,range=B.interactRange){
    const s=this.structures.find(s=>s.id===id&&s.hp>0);if(u.role!=='elf'||!s||distance(u,s)>range||!lineOfSight(this.map,u,s))return 'Aproxime-se de uma estrutura aliada.';
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
    const workshop=this.structures.find(a=>a.owner===u.id&&a.kind==='workshop'&&a.progress>=1&&a.hp>0),breach=this.breachMomentum(s),repairEfficiency=s.kind==='wall'?Math.max(0,1-breach.stacks*B.breachMomentum.repairPenaltyPerStack):1;
    const heal=Math.min(s.maxHp-s.hp,repairPower(s)*(1+(workshop?.tier||0)*B.economy.workshopRepair)*(elfPath(u.elfPath)?.repair||1)*contribution*repairEfficiency);s.hp+=heal;if(!free){s.bounty+=B.elf.repairCost*.6;u.gold-=B.elf.repairCost;u.wood-=1;recordSpend(u,{gold:B.elf.repairCost,wood:1},structurePurpose(s.kind),'repair');}u.stats.healing+=heal;u.cooldowns.repair=this.time+1;u.action='repair';u.actionUntil=this.time+.8;this.emit('repair',{unit:u.id,entity:id,x:s.x,z:s.z,amount:heal,free,contribution,contributors,repairEfficiency,breachStacks:breach.stacks});
  }
  demolish(u,id){
    const s=this.structures.find(s=>s.id===id),refund=s&&demolitionRefund(s);
    if(u.role!=='elf'||!s||s.owner!==u.id||!refund)return 'Selecione uma estrutura sua já concluída.';
    if(s.kind==='core'&&(u.coreFoundations||0)>=2)return 'O último Núcleo não pode ser demolido.';
    if(s.job||s.upgrading)return 'Aguarde a melhoria em andamento antes de demolir.';
    if(this.time-s.lastHit<5)return 'Aguarde 5 s sem dano para demolir.';
    if(distance(u,s)>B.interactRange||!this.canSee(u,s))return 'Aproxime-se para demolir.';
    u.gold+=refund.gold;u.wood+=refund.wood;u.essence+=refund.essence||0;recordRefund(u,refund);s.hp=0;s.destroyedAt=this.time;this.stats.destroyed++;
    if(s.kind==='wall'){this.brokenBases.add(s.baseId);this.stats.basesDestroyed=this.brokenBases.size;this.breachUntil.set(s.baseId,this.time+B.construction.breachCooldown);}
    if(s.kind==='core')u.baseId=null;
    this.emit('destroy',{unit:u.id,entity:s.id,x:s.x,z:s.z,kind:s.kind,cause:'demolition',refund});
    this.emit('demolish',{unit:u.id,entity:s.id,x:s.x,z:s.z,kind:s.kind,...refund});
    this.checkEndState();
  }
  upgrade(u,id,branch){
    const s=this.structures.find(s=>s.id===id),status=upgradeStatus(u,s,this.time,this.state,this.structures);
    if(!status.allowed)return status.reasons.map(r=>r.message).join(' ');
    const cost=status.cost;
    if(B.tower.specializations&&branch!==undefined&&!Object.hasOwn(B.branches,branch))return 'Especialização inválida.';
    u.gold-=cost.gold;u.wood-=cost.wood;u.essence-=cost.essence||0;recordSpend(u,cost,structurePurpose(s.kind),'upgrade');s.investmentCost??={...(s.constructionCost||{gold:B.structures[s.kind].gold,wood:B.structures[s.kind].wood})};s.investmentCost.gold+=cost.gold;s.investmentCost.wood+=cost.wood;if(cost.essence)s.investmentCost.essence=(s.investmentCost.essence||0)+cost.essence;if(this.elfEpicProject?.towerId===s.id&&!this.elfEpicProject.completedAt){this.elfEpicProject.resources.gold+=cost.gold;this.elfEpicProject.resources.wood+=cost.wood;this.elfEpicProject.resources.essence+=cost.essence||0;}const speed=elfPath(u.elfPath)?.upgradeSpeed||1;s.upgrading=(B.construction.upgradeSeconds+Math.min(7,s.tier))/speed;s.upgradeDuration=s.upgrading;s.job={type:'upgrade',...cost,duration:s.upgrading};s.nextBranch=B.tower.specializations?(branch||s.branch):'power';u.stats.upgrades++;this.stats.upgrades++;this.emit('upgrade',{unit:u.id,entity:id,x:s.x,z:s.z});
  }
  chooseElfPath(u,id,pathId){
    const workshop=this.structures.find(s=>s.id===id),path=elfPath(pathId),cost=B.elfIncremental.pathCost;
    if(u.role!=='elf'||!u.alive)return 'Especialização exclusiva dos Elfos.';
    if(u.elfPath)return 'Sua clareira já possui uma especialização.';
    if(!workshop||workshop.owner!==u.id||workshop.kind!=='workshop'||workshop.hp<=0||workshop.progress<1)return 'Selecione sua Oficina.';
    if(distance(u,workshop)>B.interactRange)return 'Aproxime-se da Oficina.';
    if(workshop.tier<B.elfIncremental.essenceUnlockTier)return `Oficina nível ${B.elfIncremental.essenceUnlockTier} necessária.`;
    if(!path)return 'Especialização inválida.';
    if(u.essence<cost)return `Essência insuficiente: ${Math.floor(u.essence)} / ${cost}.`;
    u.essence-=cost;u.elfPath=pathId;recordSpend(u,{essence:cost},pathId,'specialization');
    if(pathId==='defense')for(const s of this.structures.filter(s=>s.owner===u.id&&s.hp>0)){const fraction=s.hp/Math.max(1,s.maxHp),before=s.maxHp;s.maxHp*=path.structureHp;s.hp=s.maxHp*fraction;s.bounty+=(s.maxHp-before)*B.troll.goldPerDamage*(s.bountyFactor||1.3);}
    this.emit('elf-path',{unit:u.id,entity:workshop.id,x:workshop.x,z:workshop.z,path:pathId});return null;
  }
  buy(u,key){
    if(u.role!=='troll'||!Object.hasOwn(B.upgrades,key))return 'Melhoria inválida.';
    if(!this.trollShopStatus(u).available)return 'Volte à Forja Ancestral para comprar melhorias.';
    const level=u.levels[key];
    const status=trollUpgradeStatus(u.levels,key);if(!status.allowed)return status.message;
    const cost=trollCost(key,level);if(u.gold<cost)return 'Ouro insuficiente.';
    u.gold-=cost;u.stats.goldSpent+=cost;u.levels[key]++;if(key==='health'){const next=this.trollStats(u).maxHp;u.hp+=next-u.maxHp;u.maxHp=next;}u.stats.upgrades++;this.stats.upgrades++;this.emit('purchase',{unit:u.id,key,x:u.x,z:u.z});
  }
  trollShopStatus(u){
    const shop=this.map.trollShop,d=shop&&u?distance(u,shop):Infinity,available=u?.role==='troll'&&u.alive&&d<=B.troll.shopRange;
    return {available,distance:Number.isFinite(d)?d:null,range:B.troll.shopRange,x:shop?.x,z:shop?.z,reason:available?'Forja ao alcance. Abra o arsenal.':'Compras somente na Forja Ancestral do Santuário.'};
  }
  trollStats(u){
    // Bots survive through the same purchased stats and abilities as players.
    const stats=combatStats(u),lobby=Math.min(B.maxElves,this.units.filter(a=>a.role==='elf').length),siege=B.economy.trollLobbySiege[lobby]||1;
    return {...stats,siege:stats.siege*siege};
  }
  finalSiegeMultiplier(u,target){
    const activeElapsed=Math.max(0,this.time-this.preparation),activeElves=this.units.filter(unit=>unit.role==='elf'&&unit.alive).length;
    return target?.kind&&activeElapsed>=B.troll.finalSiegeUnlockSeconds&&activeElves<=B.troll.finalSiegeMaxElves&&(u?.levels?.siege||0)>=3?B.troll.finalSiege:1;
  }
  breachMomentum(s){
    if((!this.settings.breachEnabled&&!s?.breachFinalActive&&!s?.breachLateActive)||s?.kind!=='wall')return {stacks:0,multiplier:1};
    s.breachStacks??=0;
    while(s.breachStacks>0&&Number.isFinite(s.breachDecayAt)&&this.time>=s.breachDecayAt){s.breachStacks--;s.breachDecayAt+=B.breachMomentum.decaySeconds;}
    return {stacks:s.breachStacks,multiplier:1+s.breachStacks*B.breachMomentum.damagePerStack};
  }
  addBreachMomentum(s,heavy,attacker=null){
    const activeElapsed=Math.max(0,this.time-this.preparation),finalDuel=this.state===STATES.ACTIVE&&activeElapsed>=B.breachMomentum.unlockSeconds&&this.units.filter(u=>u.role==='elf'&&u.alive).length<=1,lateFortification=this.settings.lateBreachEnabled!==false&&this.state===STATES.ACTIVE&&activeElapsed>=B.breachMomentum.unlockSeconds&&(s?.legendary||s?.tier>=B.legendary.tier);
    const botCommitted=attacker?.controller==='bot'&&this.controllers.get(attacker.id)?.brain?.state==='breach',humanCommitted=attacker?.controller!=='bot'&&finalDuel,committedBreach=botCommitted||humanCommitted||lateFortification;
    if(s?.kind!=='wall'||attacker?.role!=='troll'||(!this.settings.breachEnabled&&!finalDuel&&!lateFortification)||!committedBreach)return {stacks:0,multiplier:1};
    if(finalDuel)s.breachFinalActive=true;if(lateFortification)s.breachLateActive=true;
    const current=this.breachMomentum(s),continuous=Number.isFinite(s.breachLastHitAt)&&this.time-s.breachLastHitAt<=B.breachMomentum.decayDelay;
    if(!continuous){s.breachPressureStartedAt=this.time;s.breachNextStackAt=this.time+B.breachMomentum.firstStackSeconds;}
    s.breachLastHitAt=this.time;
    if(this.time>=(s.breachNextStackAt??Infinity)){s.breachStacks=Math.min(B.breachMomentum.maxStacks,current.stacks+1);s.breachNextStackAt=this.time+B.breachMomentum.nextStackSeconds;}
    s.breachDecayAt=this.time+B.breachMomentum.decayDelay+B.breachMomentum.decaySeconds;
    return {stacks:s.breachStacks,multiplier:1+s.breachStacks*B.breachMomentum.damagePerStack};
  }
  healTroll(u){
    if(u.role!=='troll')return 'Habilidade exclusiva do Troll.';
    if((u.healCharges||0)<1)return 'Cura sem cargas.';
    if((u.cooldowns.heal||0)>this.time)return `Cura recarregando por ${Math.ceil(u.cooldowns.heal-this.time)}s.`;
    if(u.hp>=u.maxHp)return 'Você já está com a vida cheia.';
    u.healCharges--;u.cooldowns.heal=this.time+B.troll.healCooldown;u.healingUntil=this.time+B.troll.healDuration;u.healingRemaining+=u.maxHp*B.troll.healPercent;
    if(u.healCharges<B.troll.healCharges)u.healRechargeAt??=this.time+B.troll.healRecharge;
    u.action='heal';u.actionUntil=this.time+1;this.telemetry.healUse();this.emit('heal',{unit:u.id,x:u.x,z:u.z,amount:u.maxHp*B.troll.healPercent,duration:B.troll.healDuration,charges:u.healCharges});
  }
  trollRecallStatus(u){
    const unlockAt=B.troll.recallUnlock,readyAt=Math.max(unlockAt,u?.cooldowns?.recall||0);
    if(u?.role!=='troll')return {available:false,reason:'Habilidade exclusiva do Troll.',readyAt,unlockAt,channel:B.troll.recallChannel};
    if(this.state!==STATES.ACTIVE)return {available:false,reason:'Disponível quando a caçada começar.',readyAt,unlockAt,channel:B.troll.recallChannel};
    if(!u.alive)return {available:false,reason:'O Troll foi eliminado.',readyAt,unlockAt,channel:B.troll.recallChannel};
    if((u.recallUntil||0)>this.time)return {available:false,channeling:true,reason:'Canalizando Retorno ao Santuário.',readyAt:u.recallUntil,unlockAt,channel:B.troll.recallChannel};
    if(this.time<unlockAt)return {available:false,reason:`Disponível em ${Math.ceil(unlockAt-this.time)}s.`,readyAt:unlockAt,unlockAt,channel:B.troll.recallChannel};
    if((u.cooldowns.recall||0)>this.time)return {available:false,reason:`Retorno recarregando por ${Math.ceil(u.cooldowns.recall-this.time)}s.`,readyAt:u.cooldowns.recall,unlockAt,channel:B.troll.recallChannel};
    return {available:true,reason:'Canalize por 5s para retornar ao Santuário.',readyAt:this.time,unlockAt,channel:B.troll.recallChannel};
  }
  trollRecall(u){
    const status=this.trollRecallStatus(u);if(!status.available)return status.reason;
    u.recallStartedAt=this.time;u.recallUntil=this.time+B.troll.recallChannel;u.input={x:0,z:0};u.pendingStrike=null;u.queuedStrike=null;u.dashUntil=this.time;u.action='recall';u.actionUntil=u.recallUntil;
    this.emit('recall-start',{unit:u.id,x:u.x,z:u.z,until:u.recallUntil});
  }
  cancelTrollRecall(u,reason='cancelled'){
    if(!u||(u.recallUntil||0)<=this.time)return false;
    u.recallUntil=0;u.recallStartedAt=0;u.action='idle';u.actionUntil=this.time;this.emit('recall-cancel',{unit:u.id,x:u.x,z:u.z,reason});return true;
  }
  finishTrollRecall(u){
    if(!u?.recallUntil||u.recallUntil>this.time)return false;
    u.recallUntil=0;u.recallStartedAt=0;u.x=this.map.trollSpawn.x;u.z=this.map.trollSpawn.z;u.input={x:0,z:0};u.action='idle';u.actionUntil=this.time;u.cooldowns.recall=this.time+B.troll.recallCooldown;u.recallDeparturePending=true;u.stats.recalls=(u.stats.recalls||0)+1;this.emit('recall-complete',{unit:u.id,x:u.x,z:u.z,cooldown:u.cooldowns.recall});return true;
  }
  legendarySword(u){const levels=Object.values(u?.levels||{}).reduce((sum,level)=>sum+level,0);return u?.role==='troll'&&(u.trollLevel||1)>=B.legendary.swordRequiredTrollLevel&&(u.levels.damage||0)+(u.levels.siege||0)>=B.legendary.swordLevels&&levels>=B.legendary.swordTotalLevels;}
  equipItem(u,id,buy){
    if(u.role!=='troll'||!Object.hasOwn(ITEMS,id))return 'Equipamento inválido.';
    if(!this.trollShopStatus(u).available)return 'Volte à Forja Ancestral para comprar ou equipar itens.';
    if(this.time-u.lastHit<5||(u.lastAttack>0&&this.time-u.lastAttack<5)||u.pendingStrike)return 'Equipe fora de combate: 5 s sem causar ou receber dano.';
    const item=ITEMS[id],owned=u.inventory.includes(id);
    if(!owned){if(!buy)return 'Compre o item primeiro.';if(u.gold<item.cost)return 'Ouro insuficiente.';u.gold-=item.cost;u.stats.goldSpent+=item.cost;u.inventory.push(id);u.itemLevels[id]=1;}
    const fraction=u.hp/u.maxHp;u.equipment[item.slot]=id;u.maxHp=this.trollStats(u).maxHp;u.hp=u.maxHp*fraction;
    this.emit('purchase',{unit:u.id,item:id,x:u.x,z:u.z});
  }
  upgradeItem(u,id){
    if(u.role!=='troll'||!Object.hasOwn(ITEMS,id))return 'Equipamento inválido.';
    if(!this.trollShopStatus(u).available)return 'Volte à Forja Ancestral para evoluir itens.';
    if(this.time-u.lastHit<5||(u.lastAttack>0&&this.time-u.lastAttack<5)||u.pendingStrike)return 'Evolua fora de combate: 5 s sem causar ou receber dano.';
    if(!u.inventory.includes(id))return 'Compre o item primeiro.';
    const level=u.itemLevels[id]||1;if(level>=ITEM_RARITIES.length)return 'Item já está no nível máximo.';
    const cost=itemUpgradeCost(id,level);if(u.gold<cost)return 'Ouro insuficiente.';
    const fraction=u.hp/u.maxHp;u.gold-=cost;u.stats.goldSpent+=cost;u.itemLevels[id]=level+1;u.maxHp=this.trollStats(u).maxHp;u.hp=u.maxHp*fraction;this.emit('item-upgrade',{unit:u.id,item:id,level:level+1,x:u.x,z:u.z});
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
    u.queuedStrike=null;u.cooldowns.attack=this.time+Math.max(windup+.12,stats.interval*(heavy?B.troll.heavyRecovery:1));if(heavy)u.cooldowns.heavy=this.time+stats.heavyCooldown;
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
    const breach=target.kind==='wall'?this.addBreachMomentum(target,heavy,u):{stacks:0,multiplier:1};
    const damage=stats.damage*(heavy?stats.heavy:finisher?1+B.combat.comboBonus:1)*(opening?1+stats.opening:1)*(target.kind?stats.siege*(heavy?1+stats.heavyStructure:1):1)*this.finalSiegeMultiplier(u,target)*breach.multiplier;
    const actual=this.damage(target,damage,u,'melee');
    const executeThreshold=target.kind==='wall'?Math.min(stats.executeThreshold,B.legendary.wallExecuteThreshold):stats.executeThreshold;
    if(target.kind&&target.hp>0&&this.legendarySword(u)&&(u.cooldowns.legendaryExecute||0)<=this.time&&target.hp/target.maxHp<=executeThreshold){u.cooldowns.legendaryExecute=this.time+B.legendary.executeCooldown;const executeDamage=target.kind==='wall'?Math.min(target.hp,B.legendary.wallExecuteMaxHp):target.hp;this.emit('legendary-execute',{unit:u.id,entity:target.id,x:target.x,z:target.z,threshold:executeThreshold,cap:target.kind==='wall'?B.legendary.wallExecuteMaxHp:null});const removed=this.damage(target,executeDamage,u,'legendary-execute');this.telemetry.legendaryExecute(this,target,removed);}
    u.openingUntil=0;u.combo=heavy||finisher?0:chain+1;u.comboTarget=target.id;u.comboUntil=this.time+B.combat.comboWindow;
    if(stats.drain){const structure=!!target.kind,rate=structure?stats.structureDrain:stats.drain,cap=structure?stats.structureDrainCap:stats.drainCap,potential=Math.min(u.maxHp-u.hp,u.maxHp*cap,actual*rate),pressure=this.legendarySustainPressure(u),healed=potential*pressure.multiplier,suppressed=potential-healed;u.hp+=healed;u.stats.cardHealing.lifesteal+=healed;if(healed)this.telemetry.heal('card-lifesteal',healed);if(suppressed)this.telemetry.heal('legendarySuppressed',suppressed);}
    this.emit('impact',{unit:u.id,entity:target.id,x:target.x,z:target.z,amount:Math.round(actual),heavy,finisher,opening,broken:target.hp<=0&&target.kind==='wall',breachStacks:breach.stacks});
  }
  roar(u){
    if(u.role!=='troll')return 'Habilidade exclusiva do Troll.';if((u.cooldowns.roar||0)>this.time)return 'Rugido recarregando.';
    u.cooldowns.roar=this.time+B.troll.roarCooldown;u.action='roar';u.actionUntil=this.time+.7;
    for(const s of this.structures.filter(s=>['tower','arcaneTower'].includes(s.kind)&&s.hp>0&&this.canSee(u,s)&&distance(u,s)<B.troll.roarRange))s.disabledUntil=this.time+this.trollStats(u).roarDuration;
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
    const duration=B.elf.stunDuration*(1-(this.trollStats(troll).stunResistance||0));this.cancelTrollRecall(troll,'stun');troll.stunnedUntil=this.time+duration;troll.input={x:0,z:0};troll.pendingStrike=null;troll.queuedStrike=null;troll.dashUntil=this.time;troll.action='stunned';troll.actionUntil=troll.stunnedUntil;
    u.stats.stuns++;this.emit('stun',{unit:u.id,target:troll.id,x:troll.x,z:troll.z,duration,baseId:u.baseId});
  }
  ghostReveal(u){
    if(!u.ghost)return 'Habilidade exclusiva de espíritos.';
    if((u.cooldowns.ghostReveal||0)>this.time)return `Revelação recarregando por ${Math.ceil(u.cooldowns.ghostReveal-this.time)}s.`;
    u.cooldowns.ghostReveal=this.time+B.ghost.revealCooldown;u.stats.reveals++;const reveal={id:'reveal-'+this.nextId++,unit:u.id,x:u.x,z:u.z,radius:B.ghost.revealRadius,time:this.time,until:this.time+B.ghost.revealDuration};this.reveals.push(reveal);this.emit('ghost-reveal',reveal);
  }
  collapseElf(u,killer){
    const owned=this.structures.filter(s=>s.owner===u.id&&s.hp>0),homeBases=new Set(owned.filter(s=>s.kind==='core').map(s=>s.baseId));
    const economic=this.structures.filter(s=>s.hp>0&&s.progress===1),total=economic.reduce((sum,s)=>sum+income(s),0),scale=scaling(this.startingElfCount,total,economic.filter(s=>s.kind==='core').length,this.time);
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
    if(killer?.role==='troll'&&reward>0){const multiplier=this.trollDamageGoldMultiplier(killer),awarded=reward*multiplier;killer.stats.goldFromDamageGross=(killer.stats.goldFromDamageGross||0)+reward;killer.stats.goldFromDamageDiminished=(killer.stats.goldFromDamageDiminished||0)+Math.max(0,reward-awarded);this.grantTrollGold(killer,awarded,'damage');}
    this.stats.basesDestroyed=this.brokenBases.size;u.gold=0;u.wood=0;u.essence=0;u.specialResources={ancientWood:0,crystal:0,mana:0};u.baseId=null;u.relocationUntil=0;
    this.emit('collapse',{unit:u.id,x:u.x,z:u.z,reward,structures:owned.length,reclaimAt:homeBases.size?this.time+15:null});
  }
  eliminateElf(u,killer,cause='combat',recordTelemetry=false){
    if(!u?.alive||u.role!=='elf')return;
    u.alive=false;u.input={x:0,z:0};u.pendingStrike=null;u.queuedStrike=null;this.stats.kills++;this.stats.unitsLost++;u.stats.unitsLost++;if(killer)killer.stats.kills++;
    if(recordTelemetry)this.telemetry.eliminations.push({time:this.time,id:u.id,role:u.role,cause,source:killer?.id||null});
    this.collapseElf(u,killer);u.ghost=true;u.observer=false;u.hp=B.ghost.hp;u.maxHp=B.ghost.hp;u.action='idle';u.lastHit=-100;
    this.emit('ghost-spawn',{entity:u.id,x:u.x,z:u.z});this.emit('death',{entity:u.id,x:u.x,z:u.z,name:u.name,cause});
  }
  damage(target,amount,source,kind,sourceId){
    if(target.hp<=0||amount<=0||!Number.isFinite(amount))return 0;
    if(target.kind){const owner=this.unit(target.owner),technology=technologyEffects(owner),afterTechnology=amount*(1-technology.structureReduction);if((target.fortifiedUntil||0)>this.time){const fortify=Math.min(.9,B.elfProgression.specializations.fortress.fortify*(1+technology.signaturePower));if(owner?.stats?.specializationImpact)owner.stats.specializationImpact.fortifiedDamagePrevented+=afterTechnology*fortify;amount=afterTechnology*(1-fortify);}else amount=afterTechnology;}
    const actual=Math.min(target.hp,amount);target.hp-=actual;
    if(actual>0&&target.role==='troll')this.cancelTrollRecall(target,'damage');
    this.telemetry.hit(this,target,actual,source,kind,sourceId);
    if(source){const sourceType=['tower','legendary-beam'].includes(kind)?'tower':source.role||source.kind||kind,targetType=target.role||target.kind,key=`${sourceType}->${targetType}`;let interaction=this.combatInteractions.get(key);if(!interaction){interaction={source:sourceType,target:targetType,startedAt:this.time,damage:0,attacks:0,finishedAt:null,targets:{}};this.combatInteractions.set(key,interaction);}interaction.damage+=actual;interaction.attacks++;interaction.lastHitAt=this.time;const contact=interaction.targets[target.id]??={first:this.time,death:null};if(target.hp<=0)contact.death=this.time;if(target.hp<=0&&interaction.finishedAt===null)interaction.finishedAt=this.time;target.stats&&(target.stats.damageReceived=(target.stats.damageReceived||0)+actual);}
    // Hunger is attrition, not an enemy hit: do not renew threat, exposure or attack alerts.
    if(kind!=='hunger')target.lastHit=this.time;
    if(target.role==='troll'&&['tower','legendary-beam'].includes(kind)){
      target.lastTowerHit=this.time;
      const attackingTower=this.structures.find(s=>s.id===sourceId&&s.kind==='tower');
      if(attackingTower)attackingTower.revealedToTrollUntil=this.time+B.vision.towerRevealSeconds;
    }
    if(source?.role==='troll'){
      const economic=this.structures.filter(s=>s.hp>0&&s.progress===1),total=economic.reduce((sum,s)=>sum+income(s),0);
      const grossGain=actual*B.troll.goldPerDamage*scaling(this.startingElfCount,total,economic.filter(s=>s.kind==='core').length,this.time),structural=!!target.kind||target.role==='wisp',goldMultiplier=structural?this.trollDamageGoldMultiplier(source):1,gain=grossGain*goldMultiplier;
      source.stats.goldFromDamageGross=(source.stats.goldFromDamageGross||0)+grossGain;source.stats.goldFromDamageDiminished=(source.stats.goldFromDamageDiminished||0)+Math.max(0,grossGain-gain);
      const budgeted=target.kind||target.role==='wisp',awarded=target.ghost?0:budgeted?Math.min(gain,target.bounty||0):gain;
      if(budgeted)target.bounty-=awarded;this.grantTrollGold(source,awarded,'damage');
      const grossXp=actual*.18,structureXpMultiplier=target.kind?this.trollStructureXpMultiplier(source):1,xp=grossXp*structureXpMultiplier;
      if(target.kind){source.stats.xpFromStructureDamageGross+=grossXp;source.stats.xpFromStructureDamage+=xp;source.stats.xpFromStructureDamageDiminished+=grossXp-xp;}else source.stats.xpFromUnitDamage+=xp;
      this.grantTrollXp(source,xp,target.kind?'structure-damage':'unit-damage');source.lastAttack=this.time;source.stats.damage+=actual;this.stats.trollDamage+=actual;
    }else if(['tower','legendary-beam'].includes(kind)){this.stats.towerDamage+=actual;if(source)source.stats.damage+=actual;}
    this.emit('damage',{entity:target.id,unit:source?.id,x:target.x,z:target.z,amount:Math.round(actual),kind});
    if(target.hp<=0){
      target.hp=0;
      if(source?.role==='troll')this.objectiveReward(source,target);
      if(target.kind){
        target.destroyedAt=this.time;
        if(source?.role==='troll'){const fraction=this.trollStats(source).structureHeal||0,heal=Math.min(source.maxHp-source.hp,source.maxHp*fraction);if(heal>0){source.hp+=heal;source.stats.cardHealing.devour+=heal;this.telemetry.heal('card-devour',heal);}}
        this.stats.destroyed++;if(source?.role==='troll')source.stats.structuresDestroyed++;
        if(target.kind==='wall'){this.brokenBases.add(target.baseId);this.stats.basesDestroyed=this.brokenBases.size;this.breachUntil.set(target.baseId,this.time+B.construction.breachCooldown);this.stats.firstBaseFall??=this.time;}
        if(target.kind==='core'){
          const owner=this.unit(target.owner);if(owner?.alive){owner.coreFoundations=Math.max(1,owner.coreFoundations||0);owner.stats.coreFoundations=Math.max(owner.coreFoundations,owner.stats.coreFoundations||0);owner.displacedBaseId=target.baseId;owner.baseId=null;if(source?.role==='troll')owner.relocationThreat={x:source.x,z:source.z,until:this.time+B.elf.relocationSeconds};
            if(owner.coreFoundations>=2){if(source?.role==='troll')this.objectiveReward(source,owner);this.eliminateElf(owner,source,'final-core',true);}
            else if(target.progress>=1&&(owner.relocationVouchers||0)>0&&(owner.relocationUntil||0)<=this.time){owner.relocationUntil=this.time+B.elf.relocationSeconds;this.emit('relocation',{unit:owner.id,entity:target.id,x:owner.x,z:owner.z,until:owner.relocationUntil,free:true});}
          }
        }
        this.emit('destroy',{entity:target.id,x:target.x,z:target.z,kind:target.kind});
      }
      else if(target.role==='wisp'){target.alive=false;this.emit('wisp-death',{entity:target.id,x:target.x,z:target.z});}
      else if(target.ghost){target.ghost=false;target.observer=true;target.input={x:0,z:0};if(source?.role==='troll'){this.grantTrollGold(source,B.ghost.goldReward*(this.trollStats(source).objectiveGold||1),'objective');this.grantTrollXp(source,50,'objective');source.stats.ghostsDestroyed++;this.stats.ghostsDestroyed++;}this.emit('ghost-death',{entity:target.id,unit:source?.id,x:target.x,z:target.z,reward:source?.role==='troll'?B.ghost.goldReward:0});}
      else if(target.role==='elf')this.eliminateElf(target,source,kind);
      else {target.alive=false;target.input={x:0,z:0};target.pendingStrike=null;target.queuedStrike=null;this.stats.kills++;this.stats.unitsLost++;target.stats.unitsLost++;if(source)source.stats.kills++;this.emit('death',{entity:target.id,x:target.x,z:target.z,name:target.name});}
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
    if(noCores&&!canRelocate&&!canReclaim){this.state=STATES.END;this.winner='troll';this.endReason='all-elf-bases-destroyed';this.emit('end',{winner:this.winner,reason:this.endReason});return;}
    if(this.time>=B.matchHardLimit){
      const scores=teamScores(this.units),tied=scores.troll===scores.elf;
      this.state=STATES.END;this.winner=scores.troll>scores.elf?'troll':'elves';this.endReason='score-limit';
      this.scoreLimit={at:B.matchHardLimit,troll:scores.troll,elves:scores.elf,tied,tieBreaker:tied?'defenders-hold':null};
      this.emit('end',{winner:this.winner,reason:this.endReason,teamScores:{troll:scores.troll,elves:scores.elf},tieBreaker:this.scoreLimit.tieBreaker});
    }
  }
  surrender(role){
    if(this.state!==STATES.ACTIVE)return false;
    this.state=STATES.END;this.winner=role==='troll'?'elves':'troll';this.endReason=`${role}-surrender`;
    this.emit('end',{winner:this.winner,reason:this.endReason});return true;
  }
  towerTargeting(s,troll=this.units.find(u=>u.role==='troll'&&u.alive)){
    if(!s||!['tower','arcaneTower'].includes(s.kind))return {valid:false,reason:'not-tower'};
    const arcane=s.kind==='arcaneTower',branch=arcane?{damage:1,interval:1,range:0,armorPierce:.2}:towerProfile(s),def=B.structures[s.kind],technology=technologyEffects(this.unit(s.owner));
    if(this.state!==STATES.ACTIVE)return {valid:false,reason:'match-not-active',target:troll?.id||null};
    if(s.progress<1||s.hp<=0)return {valid:false,reason:'tower-not-ready',target:troll?.id||null};
    if(s.disabledUntil>this.time)return {valid:false,reason:'disabled',target:troll?.id||null,cooldown:s.disabledUntil-this.time};
    if(!troll)return {valid:false,reason:'no-troll',target:null};
    const acquisitionRange=def.range+branch.range,retained=s.targetLock===troll.id,maxRange=acquisitionRange+(retained?def.retainRange:0),distanceToTarget=distance(s,troll),los=towerLineOfSight(this.map,s,troll,s.baseId,def.muzzleHeight,def.targetHeight),speed=(s.overchargedUntil>this.time?1-B.elfProgression.specializations.arcane.overcharge:1)*(arcane?1/(1+technology.signaturePower):1),cooldown=s.legendary&&!arcane?0:Math.max(0,def.interval*branch.interval*speed-(this.time-s.lastShot));
    if(distanceToTarget>maxRange)return {valid:false,reason:'out-of-range',target:troll.id,distance:distanceToTarget,maxRange,acquisitionRange,retained,los,cooldown};
    if(!los)return {valid:false,reason:'line-of-sight',target:troll.id,distance:distanceToTarget,maxRange,acquisitionRange,retained,los,cooldown};
    if(cooldown>0)return {valid:false,reason:'cooldown',target:troll.id,distance:distanceToTarget,maxRange,acquisitionRange,retained,los,cooldown};
    return {valid:true,reason:'ready',target:troll.id,distance:distanceToTarget,maxRange,acquisitionRange,retained,los,cooldown:0};
  }
  step(dt=1/B.tick){
    if(![STATES.PREP,STATES.ACTIVE].includes(this.state))return;
    this.time+=dt;
    if(this.state===STATES.PREP&&this.time>=this.preparation){this.state=STATES.ACTIVE;const troll=this.units.find(u=>u.role==='troll');if(troll)troll.lastAttack=this.time;this.emit('phase',{text:'O Troll foi libertado. Protejam as clareiras.'});}
    // Fixed-step accumulation can land a few trillionths below 3600. Treat
    // that as the exact boundary so a live or simulated match cannot survive
    // the hard limit because of floating-point drift.
    if(this.state===STATES.ACTIVE&&this.time>=B.matchHardLimit-1e-6){this.time=B.matchHardLimit;this.checkEndState();this.telemetry.step(this,dt);return;}
    this.reveals=this.reveals.filter(r=>r.until>this.time);
    for(const u of this.units.filter(u=>u.role==='troll'&&u.alive))this.finishTrollRecall(u);
    for(const u of this.units){if(!u.alive&&!u.ghost)continue;const controller=this.controllers.get(u.id);if(u.role==='troll'&&controller&&this.trollCardAvailable(u)){const archetype={hunter:'hunter',siegebreaker:'siegebreaker',raider:'hunter',adaptive:'sustain'}[controller.brain?.strategy]||'juggernaut';this.selectTrollCard(u,chooseBotCard(u.cardOffer,archetype,`${this.map.seed}:${u.trollLevel}`));}if(controller)controller.tick(this,u,dt);else if(this.time-u.lastInput>.35*Math.max(1,this.devSpeed||1))u.input={x:0,z:0};this.movement(u,dt);if(u.actionUntil<this.time&&!Math.hypot(u.input.x,u.input.z))u.action='idle';}
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
      if(s.upgrading>0){s.upgrading=Math.max(0,s.upgrading-dt);if(!s.upgrading){const fraction=s.hp/Math.max(1,s.maxHp),oldReward=structureRewardHP(s.kind,s.tier),owner=this.unit(s.owner);s.tier++;s.maxHp=structureHP(s.kind,s.tier)*(elfPath(owner?.elfPath)?.structureHp||1);s.hp=s.maxHp*fraction;s.bounty+=(structureRewardHP(s.kind,s.tier)-oldReward)*B.troll.goldPerDamage*(s.bountyFactor||1.3);s.branch=s.nextBranch;s.upgradeCompletedAt=this.time;delete s.job;const becameLegendary=!s.legendary&&legendaryStructure(s.kind,s.tier),becameEpic=!s.epic&&epicStructure(s.kind,s.tier);if(becameLegendary){s.legendary=true;s.beamStartedAt=0;s.beamTarget=null;this.emit('legendary-structure',{entity:s.id,unit:s.owner,x:s.x,z:s.z,kind:s.kind});if(s.kind==='tower')this.emit('legendary-tower',{entity:s.id,unit:s.owner,x:s.x,z:s.z});}if(becameEpic){s.epic=true;if(this.elfEpicProject?.towerId===s.id&&!this.elfEpicProject.completedAt)this.elfEpicProject.completedAt=this.time;this.emit('epic-structure',{entity:s.id,unit:s.owner,x:s.x,z:s.z,kind:s.kind});}this.emit('complete',{entity:s.id,x:s.x,z:s.z,legendary:becameLegendary,epic:becameEpic});}}
      if(!s.legendary&&legendaryStructure(s.kind,s.tier)){s.legendary=true;s.beamStartedAt=0;s.beamTarget=null;this.emit('legendary-structure',{entity:s.id,unit:s.owner,x:s.x,z:s.z,kind:s.kind});if(s.kind==='tower')this.emit('legendary-tower',{entity:s.id,unit:s.owner,x:s.x,z:s.z});}
      if(!s.epic&&epicStructure(s.kind,s.tier)){s.epic=true;this.emit('epic-structure',{entity:s.id,unit:s.owner,x:s.x,z:s.z,kind:s.kind});}
      s.passiveRegenerating=false;
      const recoveryBlockedAt=Math.max(s.lastHit??-Infinity,s.upgradeCompletedAt??-Infinity);
      if(s.kind==='wall'&&s.hp<s.maxHp&&!s.upgrading&&this.state===STATES.ACTIVE&&this.time-recoveryBlockedAt>=B.wallRecovery.delay){
        const heal=Math.min(s.maxHp-s.hp,s.maxHp*B.wallRecovery.rate*dt);
        if(heal>0){s.hp+=heal;s.passiveRegenerating=true;this.stats.wallRegeneration+=heal;}
      }
      if(s.kind==='mine')s.coreTier=this.structures.find(a=>a.kind==='core'&&a.baseId===s.baseId&&a.hp>0&&a.progress>=1)?.tier||0;
      const owner=this.unit(s.owner),producer=resourceProducer(s);if(owner?.alive&&producer){const pathMultiplier=elfPath(owner.elfPath)?.gold||1,breakdown=productionBreakdown(this,owner,s),multiplier=pathMultiplier*breakdown.multiplier,production=producer.amount*multiplier*dt;owner.gold+=production;owner.stats.produced+=production;owner.stats.goldGenerated+=production;owner.stats.specializationImpact.refineryBonusGold+=producer.amount*pathMultiplier*(breakdown.withoutOverdrive-breakdown.base)*dt;owner.stats.specializationImpact.overdriveBonusGold+=producer.amount*pathMultiplier*(breakdown.multiplier-breakdown.withoutOverdrive)*dt;this.stats.produced+=production;s.productionPulse=(s.productionPulse||0)+production;if((s.productionPulseAt??this.time)<=this.time){this.emit('resource',{unit:owner.id,entity:s.id,x:s.x,z:s.z,resource:producer.resource,amount:s.productionPulse,rate:producer.perMinute*multiplier});s.productionPulse=0;s.productionPulseAt=this.time+producer.interval;}}
      const essenceRate=essenceIncome(s)*(elfPath(owner?.elfPath)?.essence||1);if(owner?.alive&&essenceRate>0){const production=essenceRate*dt;owner.essence+=production;owner.stats.essenceGenerated+=production;s.essencePulse=(s.essencePulse||0)+production;if((s.essencePulseAt??this.time)<=this.time){this.emit('resource',{unit:owner.id,entity:s.id,x:s.x,z:s.z,resource:'essence',amount:s.essencePulse,rate:essenceRate*60});s.essencePulse=0;s.essencePulseAt=this.time+1;}}
      if(['tower','arcaneTower'].includes(s.kind)&&s.disabledUntil>this.time){s.beamTarget=null;s.beamStartedAt=0;}
      if(['tower','arcaneTower'].includes(s.kind)&&this.state===STATES.ACTIVE){
        const troll=this.units.find(u=>u.role==='troll'&&u.alive),status=this.towerTargeting(s,troll),branch=s.kind==='arcaneTower'?{damage:1,interval:1,range:0,armorPierce:.2}:towerProfile(s);
        this.telemetry.towerState(s,status,dt);
        if(status.valid)s.targetLock=troll.id;else if(!['cooldown','disabled'].includes(status.reason))s.targetLock=null;
        if(status.valid&&s.legendary&&s.kind==='tower'){
          if(s.beamTarget!==troll.id){s.beamTarget=troll.id;s.beamStartedAt=this.time;}const contact=this.time-s.beamStartedAt,ramp=Math.min(B.legendary.maxRamp,1+contact*B.legendary.rampPerSecond),armor=this.trollStats(troll).armor*(1-branch.armorPierce),tierFactor=towerDamage(s.tier)/towerDamage(B.legendary.tier),dmg=B.legendary.towerDps*tierFactor*ramp*mitigation(armor)*dt;
          const actual=this.damage(troll,dmg,owner,'legendary-beam',s.id);this.telemetry.towerBeam(s.id,dt,actual);if((s.beamPulseAt||0)<=this.time){s.beamPulseAt=this.time+.2;this.emit('beam',{entity:s.id,target:troll.id,x:s.x,z:s.z,tx:troll.x,tz:troll.z,ramp});}
        }else if(status.valid){
          s.lastShot=this.time;const armor=this.trollStats(troll).armor*(1-branch.armorPierce),exposure=1+Math.max(0,troll.exposure-B.troll.exposureGrace)*B.troll.exposureRate;
          const technology=technologyEffects(owner),baseDamage=s.kind==='arcaneTower'?arcaneTowerDamage(s.tier)*(1+technology.signaturePower):towerDamage(s.tier),overcharge=s.overchargedUntil>this.time?1+B.elfProgression.specializations.arcane.overcharge:1,dmg=baseDamage*branch.damage*overcharge*mitigation(armor)*exposure;
          const actual=this.damage(troll,dmg,owner,'tower',s.id);if(s.kind==='arcaneTower')owner.stats.specializationImpact.arcaneDamage+=actual;if(branch.slow)troll.slowUntil=this.time+1.5;
          this.telemetry.towerShot(s.id);
          this.emit('shot',{entity:s.id,target:troll.id,x:s.x,z:s.z,tx:troll.x,tz:troll.z,branch:s.branch});
        }else{s.beamTarget=null;s.beamStartedAt=0;}
      }
    }
    const economyStructures=this.structures.filter(s=>s.hp>0&&s.progress>=1),incomeByOwner=new Map();for(const structure of economyStructures)incomeByOwner.set(structure.owner,(incomeByOwner.get(structure.owner)||0)+income(structure));
    for(const u of this.units.filter(u=>u.alive)){
      if(u.role==='troll'&&this.state===STATES.ACTIVE){const stats=this.trollStats(u);u.exposure=this.time-u.lastHit<2?u.exposure+dt:Math.max(0,u.exposure-dt*2);
        if(u.healCharges<B.troll.healCharges&&u.healRechargeAt!==null&&this.time>=u.healRechargeAt){u.healCharges++;u.healRechargeAt=u.healCharges<B.troll.healCharges?this.time+B.troll.healRecharge:null;this.emit('heal-charge',{unit:u.id,x:u.x,z:u.z,charges:u.healCharges});}
        if(u.healingRemaining>0&&u.healingUntil>this.time){const heal=Math.min(u.maxHp-u.hp,u.healingRemaining, u.maxHp*B.troll.healPercent/B.troll.healDuration*dt);u.hp+=heal;u.healingRemaining-=heal;this.telemetry.heal('consumable',heal);}
        else if(u.healingUntil&&u.healingUntil<=this.time){u.healingUntil=0;u.healingRemaining=0;}
        const resting=this.time-u.lastHit>=stats.regenDelay;u.inSanctuary=!!this.map.trollSpawn&&distance(u,this.map.trollSpawn)<=B.troll.sanctuaryRadius;
        if(u.hp<u.maxHp){const underTowerPressure=this.time-(u.lastTowerHit??-100)<2,baseRate=resting?stats.restRegen:stats.combatRegen,towerRate=baseRate*(underTowerPressure&&!resting?B.troll.towerCombatRegenMultiplier:1),legendaryPressure=resting?{towers:0,multiplier:1}:this.legendarySustainPressure(u),rate=towerRate*legendaryPressure.multiplier,missing=u.maxHp-u.hp,unsuppressed=Math.min(missing,u.maxHp*baseRate*dt),afterTowerPressure=Math.min(missing,u.maxHp*towerRate*dt),heal=Math.min(missing,u.maxHp*rate*dt),towerSuppressed=Math.max(0,unsuppressed-afterTowerPressure),legendarySuppressed=Math.max(0,afterTowerPressure-heal);u.hp+=heal;if(!resting&&cardEffects(u.cards).combatRegen>0)u.stats.cardHealing.combatRegen+=heal;this.telemetry.heal('regen',heal);this.telemetry.heal(resting?'restRegen':'combatRegen',heal);this.telemetry.heal('towerSuppressed',towerSuppressed);this.telemetry.heal('legendarySuppressed',legendarySuppressed);
          if(resting&&u.inSanctuary&&u.hp<u.maxHp){const sanctuaryHeal=Math.min(u.maxHp-u.hp,u.maxHp*B.troll.sanctuaryRegenRate*dt);u.hp+=sanctuaryHeal;this.telemetry.heal('sanctuary',sanctuaryHeal);}
        }
      }
      if(u.role==='elf')this.stats.highestIncome=Math.max(this.stats.highestIncome,incomeByOwner.get(u.id)||0);
    }
    if(this.state===STATES.ACTIVE){const troll=this.units.find(u=>u.role==='troll'&&u.alive);if(troll){for(const entity of this.visibleEnemies(troll)){if(entity.baseId&&!this.trollDiscoveredBases.has(entity.baseId)){this.trollDiscoveredBases.add(entity.baseId);const amount=B.economy.trollObjective.discovery*(this.trollStats(troll).objectiveGold||1);this.grantTrollGold(troll,amount,'objective');this.grantTrollXp(troll,80,'discovery');this.emit('base-discovered',{unit:troll.id,baseId:entity.baseId,x:entity.x,z:entity.z,amount});}}const teamIncome=economyStructures.reduce((n,s)=>n+income(s),0),mines=economyStructures.filter(s=>s.kind==='mine').length,legendary=economyStructures.filter(s=>s.legendary).length,matureBases=economyStructures.filter(s=>s.kind==='core'&&s.tier>=B.legendary.tier).length,activeElapsed=Math.max(0,this.time-this.preparation),lateThreat=this.settings.lateThreatEnabled===false?null:trollLateThreatIncome(activeElapsed,teamIncome,matureBases,legendary),lateThreatScale=Number.isFinite(this.settings.lateThreatScale)?Math.max(0,this.settings.lateThreatScale):1,threatRate=lateThreat===null?Math.min(B.economy.trollThreatCap,teamIncome*B.economy.trollThreatRate+mines*.035+legendary*.12):lateThreat*lateThreatScale;this.grantTrollGold(troll,threatRate*dt,'threat');}}
    stepElfProgression(this,dt);
    stepWisps(this,dt);
    const troll=this.units.find(u=>u.role==='troll'),elves=this.units.filter(u=>u.role==='elf');
    this.checkEndState();this.telemetry.step(this,dt);
  }
  snapshot(viewerId=null){
    const viewer=this.unit(viewerId),observer=!viewer,canView=e=>observer||e.id===viewer.id||e.role===viewer.role||(viewer.role==='elf'&&e.kind)||(viewer.role==='troll'&&['tower','arcaneTower'].includes(e.kind)&&(e.revealedToTrollUntil||0)>this.time)||this.teamSee(viewer,e),economyByOwner=new Map(),woodByOwner=new Map(),essenceByOwner=new Map();
    for(const s of this.structures)if(s.hp>0&&s.progress===1){economyByOwner.set(s.owner,(economyByOwner.get(s.owner)||0)+income(s));essenceByOwner.set(s.owner,(essenceByOwner.get(s.owner)||0)+essenceIncome(s));}
    for(const w of this.wisps)if(w.alive&&wispActive(this,w))woodByOwner.set(w.owner,(woodByOwner.get(w.owner)||0)+wispIncome(w));
    const units=this.units.filter(canView).map(u=>{const own=observer||u.id===viewer.id,path=elfPath(u.elfPath),trollCombat=u.role==='troll'?this.trollStats(u):null;return {id:u.id,name:u.name,role:u.role,controller:u.controller,x:u.x,z:u.z,yaw:u.yaw,hp:u.hp,maxHp:u.maxHp,alive:u.alive,ghost:u.ghost,observer:u.observer,lastHit:u.lastHit,effects:unitEffects(u,this.time,this.state,this.preparation),action:u.action,actionUntil:u.actionUntil,sprinting:u.input.sprint===true&&Math.hypot(u.input.x,u.input.z)>0,equipment:{...u.equipment},baseId:u.role==='elf'&&(observer||viewer.role==='elf')?u.baseId:null,elfSpecialization:u.role==='elf'&&(observer||viewer?.role==='elf')?u.elfSpecialization:null,...(u.role==='troll'?{trollLevel:u.trollLevel,combat:trollCombat}:{}),...(own?{gold:u.gold,wood:u.wood,essence:u.essence||0,elfPath:u.elfPath||null,specialResources:{...u.specialResources},elfTechCards:[...(u.elfTechCards||[])],levels:{...u.levels},cooldowns:{...u.cooldowns},lastAttack:u.lastAttack,inventory:[...u.inventory],itemLevels:{...u.itemLevels},combo:u.combo,comboUntil:u.comboUntil,openingUntil:u.openingUntil,relocationUntil:u.relocationUntil||0,relocationVouchers:u.relocationVouchers||0,coreFoundations:u.coreFoundations||0,...(u.role==='troll'?{legendarySword:this.legendarySword(u),healCharges:u.healCharges,healRechargeAt:u.healRechargeAt,healingUntil:u.healingUntil,trollXp:u.trollXp,trollXpNext:xpForTrollLevel(u.trollLevel),cards:[...u.cards],cardOffer:[...(this.trollCardAvailable(u)?u.cardOffer:[])],cardOfferLevel:this.trollCardAvailable(u)?u.cardOfferLevel||0:0}:{income:this.structures.filter(s=>s.owner===u.id&&s.hp>0&&s.progress===1).reduce((n,s)=>n+income(s)*(path?.gold||1)*productionMultiplier(this,u,s),0),woodIncome:this.wisps.filter(w=>w.owner===u.id&&!w.specialNodeId&&wispActive(this,w)).reduce((n,w)=>n+wispIncome(w)*(path?.wood||1)*productionMultiplier(this,u,w),0),essenceIncome:(essenceByOwner.get(u.id)||0)*(path?.essence||1),specializationAbility:abilityStatus(this,u)})}:{})};});
    // Network snapshots are a public view model, not a copy of authoritative
    // simulation objects. Keep server-only bookkeeping out of the 10 Hz path.
    const structures=this.structures.filter(s=>s.hp>0&&canView(s)).map(s=>({
      id:s.id,kind:s.kind,owner:s.owner,baseId:s.baseId,x:s.x,z:s.z,rotation:s.rotation||0,
      tier:s.tier,hp:s.hp,maxHp:s.maxHp,progress:s.progress,branch:s.branch,lastHit:s.lastHit,
      upgrading:s.upgrading||0,upgradeDuration:s.upgradeDuration||0,constructionCost:s.constructionCost,essenceIncome:essenceIncome(s)*(elfPath(this.unit(s.owner)?.elfPath)?.essence||1),
      coreTier:s.coreTier||0,legendary:!!s.legendary,epic:!!s.epic,disabledUntil:s.disabledUntil||0,overchargedUntil:s.overchargedUntil||0,breachStacks:s.kind==='wall'?this.breachMomentum(s).stacks:0,
      effects:structureEffects(s,this.time),
      ...(observer||s.owner===viewer.id?{refund:jobRefund(s,this.time),demolitionRefund:demolitionRefund(s)}:{})
    }));
    const wisps=this.wisps.filter(w=>w.alive&&(observer||viewer.role==='elf'||this.teamSee(viewer,w))).map(w=>({
      id:w.id,role:w.role,name:w.name,owner:w.owner,treeId:w.treeId,specialNodeId:w.specialNodeId,specialResource:w.specialResource,rich:w.rich,x:w.x,z:w.z,
      level:w.level,hp:w.hp,maxHp:w.maxHp,alive:w.alive,readyAt:w.readyAt,
      upgradingUntil:w.upgradingUntil,lastHit:w.lastHit,income:wispActive(this,w)?(w.specialNodeId?B.elfProgression.specialWisp.rate*(this.unit(w.owner)?.elfSpecialization==='industrial'?1+B.elfProgression.specializations.industrial.wispBonus:1)*(1+technologyEffects(this.unit(w.owner)).specialWisp):wispIncome(w)*productionMultiplier(this,this.unit(w.owner),w)):0,
      ...(observer||w.owner===viewer.id?{refund:jobRefund(w,this.time)}:{})
    }));
    const visibleIds=new Set([...units,...structures,...wisps].map(e=>e.id));
    // Clients process events by monotonically increasing id. Repeating the
    // complete 120-event history in every snapshot caused the largest payload
    // component in long fights. Thirty-two entries cover several snapshot
    // windows while bounding bandwidth and JSON parsing work.
    const visibleEvents=this.events.filter(e=>{
      if(e.type==='resource'&&!observer&&e.unit!==viewer.id)return false;
      if(e.type==='phase'||e.type==='end')return true;
      if(e.type==='ping')return observer||e.role===viewer.role;
      return visibleIds.has(e.unit)||visibleIds.has(e.entity)||(Number.isFinite(e.x)&&(observer||this.teamSee(viewer,e)));
    });
    const events=visibleEvents.slice(-32);
    const pings=this.pings.filter(p=>p.until>this.time&&(observer||p.role===viewer.role));
    const alerts=[...units.filter(u=>u.alive&&(observer||u.role===viewer.role)),...structures.filter(()=>observer||viewer.role==='elf'),...wisps.filter(()=>observer||viewer.role==='elf')].filter(e=>this.time-e.lastHit<5).map(e=>({id:e.id,x:e.x,z:e.z,owner:e.owner||e.id,kind:e.kind||e.role,until:e.lastHit+5}));
    const trees=this.trees.filter(t=>observer||this.teamSee(viewer,t)).map(t=>({id:t.id,x:t.x,z:t.z,amount:t.amount,rich:!!t.rich,regrowAt:t.regrowAt||0}));
    return {state:this.state,time:this.time,preparation:this.preparation,matchHardLimit:B.matchHardLimit,timeRemaining:Math.max(0,B.matchHardLimit-this.time),scoreboard:this.units.map(u=>{const{hp,maxHp,...summary}=playerSummary(u),canSeeResources=observer||u.id===viewer?.id||(viewer?.role==='elf'&&u.role==='elf');return {...summary,gold:canSeeResources?Math.floor(u.gold):null,wood:canSeeResources?Math.floor(u.wood):null};}).sort((a,b)=>b.score-a.score),teamScores:teamScores(this.units),elfStun:viewer?.role==='elf'?this.elfStunStatus(viewer):null,trollRecall:viewer?.role==='troll'?this.trollRecallStatus(viewer):null,trollShop:viewer?.role==='troll'?this.trollShopStatus(viewer):null,devSpeed:this.devSpeed||1,winner:this.winner,viewerId,units,structures,wisps,pings,alerts,reveals:observer||viewer?.role==='elf'?this.reveals:[],trees,specialNodes:this.specialNodes.filter(n=>observer||this.teamSee(viewer,n)),breaches:observer||viewer?.role==='elf'?Object.fromEntries(this.breachUntil):{},reclaims:observer||viewer?.role==='elf'?Object.fromEntries(this.reclaimUntil):{},events,stats:this.state===STATES.END?this.stats:null,debugTowers:this.debugTowers?this.structures.filter(s=>['tower','arcaneTower'].includes(s.kind)).map(s=>({id:s.id,...this.towerTargeting(s)})):undefined,finalAge:B.finalAge};
  }
  stallDiagnostics(){const lastCombat=Number.isFinite(this.telemetry.lastContact)?this.telemetry.lastContact:null;return {lastCombatAt:lastCombat,secondsWithoutCombat:lastCombat===null?Math.round(this.time):Math.max(0,Math.round(this.time-lastCombat)),liveCores:this.structures.filter(s=>s.kind==='core'&&s.hp>0).length,economyPerSecond:+this.structures.filter(s=>s.hp>0&&s.progress>=1).reduce((n,s)=>n+income(s),0).toFixed(2),relocations:this.units.reduce((n,u)=>n+(u.stats.relocations||0),0),targetlessExplorationSeconds:+this.units.filter(u=>u.role==='troll'&&u.controller==='bot').reduce((n,u)=>n+(this.controllers.get(u.id)?.metrics.idle||0),0).toFixed(1)};}
  result(){const duration=Math.max(1,this.time),scores=teamScores(this.units),interactions=[...this.combatInteractions.values()].map(i=>({...i,ttk:Object.values(i.targets).some(t=>t.death!==null)?Object.values(i.targets).filter(t=>t.death!==null).reduce((n,t)=>n+t.death-t.first,0)/Object.values(i.targets).filter(t=>t.death!==null).length:null,effectiveDps:i.damage/Math.max(.001,this.time-i.startedAt)}));const bases=this.map.bases.map(b=>{const structures=this.structures.filter(s=>s.baseId===b.id),core=structures.find(s=>s.kind==='core'&&s.hp>0)||structures.findLast(s=>s.kind==='core');return {id:b.id,name:b.name,owner:core?.owner||null,claimed:this.elfBasesClaimed.has(b.id),core:core?{id:core.id,hp:Math.round(core.hp),maxHp:Math.round(core.maxHp),progress:core.progress,tier:core.tier}:null,wall:structures.filter(s=>s.kind==='wall').map(s=>({id:s.id,hp:Math.round(s.hp),maxHp:Math.round(s.maxHp),progress:s.progress,tier:s.tier})),towers:structures.filter(s=>s.kind==='tower').map(s=>({id:s.id,hp:Math.round(s.hp),maxHp:Math.round(s.maxHp),progress:s.progress,tier:s.tier,branch:s.branch,legendary:!!s.legendary})),structureCount:structures.filter(s=>s.hp>0).length};});const finalState={state:this.state,winner:this.winner,endReason:this.endReason||null,bases,units:this.units.map(u=>({id:u.id,role:u.role,alive:u.alive,hp:Math.round(u.hp),maxHp:Math.round(u.maxHp),x:+u.x.toFixed(1),z:+u.z.toFixed(1),baseId:u.baseId,action:u.action})),objectives:{elfBasesClaimed:this.elfBasesClaimed.size,basesDestroyed:this.stats.basesDestroyed,liveElfCores:bases.filter(b=>b.core?.hp>0).length,aliveElves:this.units.filter(u=>u.role==='elf'&&u.alive).length,trollAlive:!!this.units.find(u=>u.role==='troll')?.alive}};return {seed:this.map.seed,routeVariant:this.settings.routeVariant||null,winner:this.winner,endReason:this.endReason||null,duration:Math.round(this.time),teamScores:{troll:scores.troll,elves:scores.elf},scoreLimit:this.scoreLimit,elves:this.units.filter(u=>u.role==='elf').length,survivors:this.units.filter(u=>u.role==='elf'&&u.alive).length,...this.stats,telemetry:this.telemetry.result(this),stallDiagnostics:this.stallDiagnostics(),combatInteractions:interactions,finalState,ai:this.units.filter(u=>u.controller==='bot').map(u=>{const controller=this.controllers.get(u.id);return {id:u.id,role:u.role,difficulty:u.difficulty,state:controller?.brain?.state||null,target:controller?.brain?.targetId||null,destination:controller?.destination||null,...(controller?.metrics||{}),...(u.role==='troll'&&controller?.brain?{strategy:controller.brain.strategy,strategyChanges:controller.brain.strategyChanges,failedSieges:controller.brain.failedSieges,failedChases:controller.brain.failedChases,stagnationEvents:controller.brain.stagnationEvents,decisiveAssaults:controller.brain.decisiveAssaults,assaultPreparation:controller.brain.assaultPreparation||null,director:controller.brain.director||null,chase:controller.brain.chase||null,retreatNeed:controller.brain.retreatNeed||null,strategicMemory:controller.brain.strategicMap?.report(this,u)||[],targetEvaluation:controller.brain.targetEvaluation||null,candidateEvaluations:controller.brain.candidateEvaluations||[],siegeDecision:controller.brain.siegeDecision||null}:{})};}),players:this.units.map(u=>({...playerSummary(u),goldPerMinute:u.stats.goldGenerated/duration*60,woodPerMinute:u.stats.woodGenerated/duration*60,...u.stats})),mvp:this.units.filter(u=>u.role===(this.winner==='troll'?'troll':'elf')).map(playerSummary).sort((a,b)=>b.score-a.score)[0]||null};}
}
function pointSegmentDistance(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,n=dx*dx+dz*dz;if(n===0)return distance(p,a);const t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/n,0,1);return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);}
