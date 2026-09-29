const amount=value=>Number.isFinite(value)&&value>0?value:0;

export function recordSpend(unit,cost={},purpose='other',action='other'){
  const gold=amount(cost.gold),wood=amount(cost.wood),essence=amount(cost.essence),special=amount(cost.specialAmount),specialResource=cost.specialResource||null;
  unit.stats.goldSpent=(unit.stats.goldSpent||0)+gold;
  unit.stats.woodSpent=(unit.stats.woodSpent||0)+wood;
  unit.stats.essenceSpent=(unit.stats.essenceSpent||0)+essence;
  if(specialResource&&special){unit.stats.specialResourcesSpent??={};unit.stats.specialResourcesSpent[specialResource]=(unit.stats.specialResourcesSpent[specialResource]||0)+special;}
  unit.stats.spendByPurpose??={};unit.stats.spendByAction??={};
  const add=(ledger,key)=>{ledger[key]??={gold:0,wood:0};ledger[key].gold+=gold;ledger[key].wood+=wood;if(essence)ledger[key].essence=(ledger[key].essence||0)+essence;if(specialResource&&special){ledger[key].specialResources??={};ledger[key].specialResources[specialResource]=(ledger[key].specialResources[specialResource]||0)+special;}};
  add(unit.stats.spendByPurpose,purpose);add(unit.stats.spendByAction,action);
}

export function recordRefund(unit,refund={}){
  unit.stats.goldRefunded=(unit.stats.goldRefunded||0)+amount(refund.gold);
  unit.stats.woodRefunded=(unit.stats.woodRefunded||0)+amount(refund.wood);
  unit.stats.essenceRefunded=(unit.stats.essenceRefunded||0)+amount(refund.essence);
  if(refund.specialResource&&refund.specialAmount){unit.stats.specialResourcesRefunded??={};unit.stats.specialResourcesRefunded[refund.specialResource]=(unit.stats.specialResourcesRefunded[refund.specialResource]||0)+amount(refund.specialAmount);}
}

export function structurePurpose(kind){return ['wall','tower'].includes(kind)?'defense':['core','mine','workshop'].includes(kind)?'economy':'other';}
