import { BALANCE as B, upgradeCost } from './config.js';

const pressureAt=(match,structures)=>structures.reduce((sum,structure)=>sum+Math.max(0,90-(match.time-(structure.lastHit??-Infinity)))/90,0);

const liveStructures=(match,ownerId,baseId=null)=>match.structures.filter(structure=>
  structure.owner===ownerId&&structure.hp>0&&structure.progress>=1&&(!baseId||structure.baseId===baseId)
);

const projectStateKey=match=>match.units.filter(unit=>unit.role==='elf').map(unit=>`${unit.id}:${unit.alive?1:0}`).join('|')+'#'+match.structures.filter(structure=>['core','wall','tower','mine','bastion','arcaneTower'].includes(structure.kind)).map(structure=>`${structure.id}:${structure.hp>0?1:0}:${structure.tier}`).sort().join('|');

function selectAnchor(match){
  const candidates=match.units.filter(unit=>unit.role==='elf'&&unit.alive).map(owner=>{
    const structures=liveStructures(match,owner.id),core=structures.find(structure=>structure.kind==='core'),wall=structures.find(structure=>structure.kind==='wall'),towers=structures.filter(structure=>structure.kind==='tower'),mine=structures.filter(structure=>structure.kind==='mine').sort((a,b)=>b.tier-a.tier)[0],signatureKind=B.elfProgression.specializations[owner.elfSpecialization]?.structure,signature=structures.find(structure=>structure.kind===signatureKind);
    if(!core||!wall||!towers.length||!mine||signatureKind&&!signature)return null;
    const specialCoverage=structures.filter(structure=>['bastion','arcaneTower'].includes(structure.kind)).length,bestTower=towers.slice().sort((a,b)=>b.tier-a.tier)[0],foundationTier=Math.min(core.tier,wall.tier,bestTower.tier),supportTier=Math.min(mine.tier,...(signature?[signature.tier]:[]));
    return {owner,baseId:core.baseId,core,wall,towers,mine,signature,specialCoverage,bestTower,foundationTier,supportTier,recentPressure:pressureAt(match,structures)};
  }).filter(Boolean);
  const bestFoundation=Math.max(0,...candidates.map(candidate=>candidate.foundationTier));
  return candidates.filter(candidate=>candidate.foundationTier>=bestFoundation-1).sort((a,b)=>a.recentPressure-b.recentPressure||b.foundationTier-a.foundationTier||b.supportTier-a.supportTier||b.specialCoverage-a.specialCoverage||b.wall.tier-a.wall.tier||a.owner.id.localeCompare(b.owner.id))[0]||null;
}

function archiveFailedProject(match,project,tower,reason='infrastructure-lost'){
  for(const {structure} of epicProjectStructures(match,project))if(structure)structure.epicProject=false;
  match.elfEpicProjectHistory??=[];
  match.elfEpicProjectHistory.push({...project,failedAt:match.time,failureReason:reason,finalTier:tower?.tier||project.startingTier||B.legendary.tier});
}

export const epicProjectEntries=project=>[
  ['core',project?.coreId],['wall',project?.wallId],['tower',project?.towerId],
  ['mine',project?.mineId],
  ...(project?.signatureKind?[['signature',project?.signatureId]]:[])
];

export function epicProjectStructures(match,project){
  return epicProjectEntries(project).map(([key,id])=>({key,structure:match.structures.find(row=>row.id===id)}));
}

export function epicProjectCostPlan(match,project,targetOverride=null){
  const owner=project&&match.unit(project.ownerId),totals={gold:0,wood:0,essence:0,specialResource:project?.resource||null,specialAmount:0,targetId:null,targetKind:null,fromTier:0,toTier:0,levels:0,recovery:false};
  if(!project||!owner)return totals;
  const structures=Object.fromEntries(epicProjectStructures(match,project).map(({key,structure})=>[key,structure?.hp>0?structure:null]));
  if(project.signatureKind&&project.recoveringKind===project.signatureKind&&!structures.signature){
    const construction=B.structures[project.signatureKind];
    if(construction){totals.gold=construction.gold||0;totals.wood=construction.wood||0;totals.targetKind=project.signatureKind;totals.recovery=true;}
    return totals;
  }
  const projectStructures=[structures.core,structures.wall,structures.tower,structures.mine,structures.signature].filter(Boolean),target=projectStructures.includes(targetOverride)?targetOverride:orderedMilestoneTarget(structures.core,structures.wall,structures.tower,B.epic.tier,false,[structures.mine,structures.signature],B.epic.focusLead);
  if(!target)return totals;
  const paidLevel=target.upgrading&&target.job?.type==='upgrade'?1:0,startTier=Math.min(B.epic.tier,target.tier+paidLevel),lowest=Math.min(...projectStructures.map(structure=>structure.tier)),bandCeiling=Math.min(B.epic.tier,lowest+Math.max(1,B.epic.focusLead)),toTier=Math.min(B.epic.tier,bandCeiling,startTier+2);
  totals.targetId=target.id;totals.targetKind=target.kind;totals.fromTier=startTier;totals.toTier=toTier;totals.levels=Math.max(0,toTier-startTier);
  for(let tier=startTier;tier<toTier;tier++){
    const cost=upgradeCost({...target,tier},owner.elfPath,owner.elfSpecialization);
    totals.gold+=cost.gold||0;totals.wood+=cost.wood||0;totals.essence+=cost.essence||0;
    if(cost.specialResource===project.resource)totals.specialAmount+=cost.specialAmount||0;
  }
  return totals;
}

export function epicProjectResourceNeed(match,project,targetOverride=null){return epicProjectCostPlan(match,project,targetOverride).specialAmount;}

export function updateEpicProjectResourcePlan(match,project,targetOverride=null){
  if(!project)return;
  const owner=match.unit(project.ownerId),cost=epicProjectCostPlan(match,project,targetOverride),required=cost.specialAmount,stored=owner?.specialResources?.[project.resource]||0,specialWisps=match.wisps.filter(wisp=>wisp.owner===project.ownerId&&wisp.alive&&wisp.specialResource===project.resource).length;
  project.resourcePlan={resource:project.resource,required,stored,shortfall:Math.max(0,required-stored),targetId:cost.targetId,targetKind:cost.targetKind,fromTier:cost.fromTier,toTier:cost.toTier,levels:cost.levels,recovery:cost.recovery,gold:{required:cost.gold,stored:owner?.gold||0,shortfall:Math.max(0,cost.gold-(owner?.gold||0))},wood:{required:cost.wood,stored:owner?.wood||0,shortfall:Math.max(0,cost.wood-(owner?.wood||0))},essence:{required:cost.essence,stored:owner?.essence||0,shortfall:Math.max(0,cost.essence-(owner?.essence||0))},specialWisps};
  return project.resourcePlan;
}

export function synchronizeEpicProjectSpecialization(match,owner){
  const project=match.elfEpicProject,specialization=B.elfProgression.specializations[owner?.elfSpecialization];
  if(!project||project.completedAt||project.ownerId!==owner?.id||!specialization)return false;
  const oldSignature=match.structures.find(row=>row.id===project.signatureId),changed=project.signatureKind!==specialization.structure||project.resource!==specialization.resource;
  if(oldSignature&&oldSignature.kind!==specialization.structure)oldSignature.epicProject=false;
  project.signatureKind=specialization.structure;project.resource=specialization.resource;
  const live=liveStructures(match,owner.id,project.baseId),signature=specialization.structure?live.filter(row=>row.kind===specialization.structure).sort((a,b)=>b.tier-a.tier||(a.createdAt||0)-(b.createdAt||0))[0]:null;
  project.signatureId=signature?.id||null;if(signature)signature.epicProject=true;
  for(const wisp of match.wisps.filter(row=>row.owner===owner.id&&row.alive&&row.specialResource)){
    wisp.specialResource=specialization.resource;
    const current=match.specialNodes.find(node=>node.id===wisp.specialNodeId&&node.resource===specialization.resource&&node.amount>0),next=current||match.specialNodes.filter(node=>node.resource===specialization.resource&&node.amount>0&&!match.wisps.some(other=>other.alive&&other.id!==wisp.id&&other.specialNodeId===node.id)).sort((a,b)=>Number(a.local)-Number(b.local)||Math.hypot(a.x-wisp.x,a.z-wisp.z)-Math.hypot(b.x-wisp.x,b.z-wisp.z))[0];
    wisp.specialNodeId=next?.id||null;if(next)wisp.rich=!next.local;
  }
  project.missingSince=null;project.failureReason=null;
  const missingEntry=epicProjectEntries(project).find(([key,id])=>!id||!match.structures.some(row=>row.id===id&&row.hp>0));
  project.recoveringKind=missingEntry?(missingEntry[0]==='signature'?specialization.structure:missingEntry[0]):null;
  project.specializationRevision=(project.specializationRevision||0)+(changed?1:0);project.lastSpecializationChangedAt=match.time;
  updateEpicProjectResourcePlan(match,project);match.elfTeamProjectTick=null;match.elfTeamProjectStateKey=null;match.elfTeamProjectSnapshot=null;
  match.emit('epic-project-specialization',{unit:owner.id,entity:signature?.id||null,x:signature?.x??owner.x,z:signature?.z??owner.z,specialization:owner.elfSpecialization,signatureKind:project.signatureKind,resource:project.resource,recovering:!!project.recoveringKind});
  return true;
}

function recoverProjectStructures(match,project){
  const owner=match.unit(project.ownerId),ownerAlive=owner?.alive;
  if(!ownerAlive)return {valid:false,terminal:true,reason:'owner-eliminated'};
  let live=liveStructures(match,project.ownerId,project.baseId),core=live.find(row=>row.kind==='core'),wall=live.find(row=>row.kind==='wall');
  // Losing the first Core is not the same as losing the project: every Elf has
  // one relocation. Keep the project and its stored resources alive during the
  // recovery grace, then re-anchor every active milestone to the rebuilt refuge.
  if(!core||!wall){
    const all=liveStructures(match,project.ownerId),baseIds=[...new Set(all.map(row=>row.baseId))],replacement=baseIds.map(baseId=>{
      const structures=all.filter(row=>row.baseId===baseId),nextCore=structures.find(row=>row.kind==='core'),nextWall=structures.find(row=>row.kind==='wall');
      return nextCore&&nextWall?{baseId,structures,core:nextCore,wall:nextWall,foundation:Math.min(nextCore.tier,nextWall.tier)}:null;
    }).filter(Boolean).sort((a,b)=>b.foundation-a.foundation)[0];
    if(!replacement){
      project.recoveringKind=!core?'core':'wall';
      if((owner.relocationUntil||0)>match.time){project.missingSince=null;return {valid:false,terminal:false,reason:'relocation-active'};}
      project.missingSince??=match.time;return {valid:false,terminal:match.time-project.missingSince>B.epic.recoveryGrace,reason:'relocation-not-rebuilt'};
    }
    for(const {structure} of epicProjectStructures(match,project))if(structure)structure.epicProject=false;
    project.baseId=replacement.baseId;project.coreId=replacement.core.id;project.wallId=replacement.wall.id;
    project.towerId=null;project.mineId=null;project.workshopId=null;project.signatureId=null;
    project.migrations=(project.migrations||0)+1;project.lastMigratedAt=match.time;project.missingSince=null;
    const specialization=B.elfProgression.specializations[owner.elfSpecialization];if(specialization){project.signatureKind=specialization.structure;project.resource=specialization.resource;}
    live=replacement.structures;core=replacement.core;wall=replacement.wall;
  }
  let missing=null,replaced=false;
  for(const [key,id] of epicProjectEntries(project)){
    if(match.structures.some(row=>row.id===id&&row.hp>0))continue;
    const kind=key==='signature'?project.signatureKind:key,candidate=kind&&live.filter(row=>row.kind===kind&&!epicProjectEntries(project).some(([,used])=>used===row.id)).sort((a,b)=>b.tier-a.tier||(a.createdAt||0)-(b.createdAt||0))[0];
    if(candidate){candidate.epicProject=true;project[`${key}Id`]=candidate.id;project.replacements=(project.replacements||0)+1;replaced=true;continue;}
    missing??=kind;
  }
  if(replaced){project.lastRecoveredAt=match.time;project.missingSince=null;project.recoveringKind=null;}
  if(missing){project.missingSince??=match.time;project.recoveringKind=missing;return {valid:false,terminal:match.time-project.missingSince>B.epic.recoveryGrace,reason:`missing-${missing}`};}
  project.missingSince=null;project.recoveringKind=null;return {valid:true,terminal:false};
}

// Team decisions are updated once per simulation time, regardless of how many
// Elf controllers ask for them. Individual bots execute the returned plan but
// cannot independently replace its anchor or Epic target.
export function updateElfTeamProject(match,activeElapsed,trollLevel=1){
  const stateKey=projectStateKey(match);
  if(match.elfTeamProjectTick===match.time&&match.elfTeamProjectStateKey===stateKey&&match.elfTeamProjectSnapshot)return match.elfTeamProjectSnapshot;
  match.elfTeamProjectTick=match.time;
  match.elfTeamProjectStateKey=stateKey;
  const trigger=trollLevel>=8||activeElapsed>=B.epic.prepareAt;
  let project=match.elfEpicProject;
  if(project&&!project.completedAt){
    const tower=match.structures.find(structure=>structure.id===project.towerId),recovery=recoverProjectStructures(match,project);
    if(recovery.terminal){archiveFailedProject(match,project,tower,recovery.reason);match.elfEpicProject=null;project=null;}
    else updateEpicProjectResourcePlan(match,project);
  }

  const anchor=match.elfLegendaryAnchor;
  const anchorOwnerAlive=anchor&&match.units.some(unit=>unit.id===anchor.ownerId&&unit.alive);
  const anchorStructures=anchor?liveStructures(match,anchor.ownerId,anchor.baseId):[];
  const anchorValid=anchorOwnerAlive&&anchorStructures.some(structure=>structure.kind==='core')&&anchorStructures.some(structure=>structure.kind==='wall');
  if(trigger&&!anchorValid&&!project){
    const chosen=selectAnchor(match);
    if(chosen){
      match.elfLegendaryAnchor={baseId:chosen.baseId,ownerId:chosen.owner.id,designatedAt:match.time,replacements:(anchor?.replacements||0)+(anchor?1:0)};
      match.emit('legendary-anchor',{unit:chosen.owner.id,baseId:chosen.baseId,x:chosen.wall.x,z:chosen.wall.z});
    }
  }
  if(trigger&&!project&&activeElapsed>=B.epic.projectAt){
    const chosen=selectAnchor(match),currentCore=anchorStructures.find(structure=>structure.kind==='core'),currentWall=anchorStructures.find(structure=>structure.kind==='wall'),currentTower=anchorStructures.filter(structure=>structure.kind==='tower').sort((a,b)=>b.tier-a.tier)[0],currentFoundation=currentCore&&currentWall&&currentTower?Math.min(currentCore.tier,currentWall.tier,currentTower.tier):0;
    if(chosen&&chosen.foundationTier>=B.epic.foundationTier&&currentFoundation<B.epic.foundationTier){
      match.elfLegendaryAnchor={baseId:chosen.baseId,ownerId:chosen.owner.id,designatedAt:match.time,replacements:(anchor?.replacements||0)+(anchor?1:0),promotedForEpic:true};
      match.emit('legendary-anchor',{unit:chosen.owner.id,baseId:chosen.baseId,x:chosen.wall.x,z:chosen.wall.z,epic:true});
    }
  }

  const selectedAnchor=match.elfLegendaryAnchor;
  const anchorMilestones=selectedAnchor?liveStructures(match,selectedAnchor.ownerId,selectedAnchor.baseId):[],anchorCore=anchorMilestones.find(structure=>structure.kind==='core'),anchorWall=anchorMilestones.find(structure=>structure.kind==='wall');
  const legendaryTowers=anchorMilestones.filter(structure=>structure.kind==='tower'&&structure.tier>=B.legendary.tier),anchorOwner=selectedAnchor?match.unit(selectedAnchor.ownerId):null,anchorSignatureKind=B.elfProgression.specializations[anchorOwner?.elfSpecialization]?.structure,supportReady=anchorMilestones.some(structure=>structure.kind==='mine')&&(!anchorSignatureKind||anchorMilestones.some(structure=>structure.kind===anchorSignatureKind));
  const pairReady=legendaryTowers.length>=2,foundationTower=anchorMilestones.filter(structure=>structure.kind==='tower').sort((a,b)=>b.tier-a.tier)[0],timedFoundation=activeElapsed>=B.epic.projectAt&&foundationTower?.tier>=B.epic.foundationTier&&anchorCore?.tier>=B.epic.foundationTier&&anchorWall?.tier>=B.epic.foundationTier&&supportReady,epicReady=legendaryTowers.length>=1&&anchorCore?.tier>=B.legendary.tier&&anchorWall?.tier>=B.legendary.tier&&supportReady||timedFoundation;
  if(epicReady&&!project){
    const structures=anchorMilestones,wall=anchorWall,specialCoverage=structures.filter(structure=>['bastion','arcaneTower'].includes(structure.kind)).length,owner=match.unit(selectedAnchor.ownerId),mine=structures.filter(structure=>structure.kind==='mine').sort((a,b)=>b.tier-a.tier)[0],signatureKind=B.elfProgression.specializations[owner?.elfSpecialization]?.structure,signature=structures.find(structure=>structure.kind===signatureKind);
    if(mine&&(!signatureKind||signature)){
      const selected=(legendaryTowers.length?legendaryTowers:[foundationTower]).slice().sort((a,b)=>b.tier-a.tier||(a.createdAt||0)-(b.createdAt||0)||a.id.localeCompare(b.id))[0],recentPressure=pressureAt(match,structures);
      match.elfEpicProject={coreId:anchorCore.id,wallId:wall.id,towerId:selected.id,mineId:mine.id,workshopId:null,signatureId:signature?.id||null,signatureKind:signatureKind||null,resource:B.elfProgression.specializations[owner.elfSpecialization].resource,ownerId:selected.owner,baseId:selected.baseId,selection:{wallAlive:!!wall,coverage:legendaryTowers.length+specialCoverage,legendaryCoverage:legendaryTowers.length,specialCoverage,recentPressure:+recentPressure.toFixed(3)},startedAt:match.time,designatedAt:match.time,startingTier:selected.tier,replacements:0,resources:{gold:0,wood:0,essence:0,specialResources:{}}};
      project=match.elfEpicProject;
      for(const {structure} of epicProjectStructures(match,project))if(structure)structure.epicProject=true;
      updateEpicProjectResourcePlan(match,project);
      match.emit('epic-project',{entity:selected.id,unit:selected.owner,x:selected.x,z:selected.z,tier:selected.tier,replacement:false,baseId:selected.baseId,coverage:project.selection.coverage,recentPressure});
    }
  }

  const snapshot={anchor:match.elfLegendaryAnchor||null,anchorLegendaryTowers:legendaryTowers,anchorPairReady:pairReady,epicReady,epicProject:match.elfEpicProject||null,epicInProgress:!!match.elfEpicProject&&!match.elfEpicProject.completedAt};
  match.elfTeamProjectSnapshot=snapshot;
  return snapshot;
}

export function orderedMilestoneTarget(core,wall,tower,milestone,underSiege=false,support=[],focusLead=1){
  const order=underSiege?[wall,tower,core,...support]:[core,wall,tower,...support];
  const available=order.filter((structure,index)=>structure&&order.indexOf(structure)===index),lowest=Math.min(...available.map(structure=>structure.tier)),bandCeiling=Math.min(milestone,lowest+Math.max(1,focusLead));
  // Advance one visible focus at a time, but only inside a narrow level band.
  // The Core may lead the project by two levels; then Wall, Tower and support
  // structures must catch up before the next band opens. Under siege the same
  // invariant is preserved with Wall and Tower at the front of the order.
  return available.find(structure=>structure.tier<bandCeiling)||null;
}
