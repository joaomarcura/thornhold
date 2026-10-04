// Placement and its preview use the same ownership rule. Core/gate remain
// shared physical slots; equipment built by a co-op ally uses that ally's quota.
export function personalConstructionQuota(kind,settings,owner,claimOwner){
  return kind==='mine'||kind==='fishery'||kind==='tower'&&settings?.coop===true&&!!owner?.partyId&&owner.partyId===claimOwner?.partyId;
}
export function constructionCount(structures,baseId,kind,settings,owner,claimOwner){
  const personal=personalConstructionQuota(kind,settings,owner,claimOwner);
  return structures.filter(s=>s.baseId===baseId&&s.kind===kind&&s.hp>0&&(!personal||s.owner===owner?.id)).length;
}
