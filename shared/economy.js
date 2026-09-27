const amount=value=>Number.isFinite(value)&&value>0?value:0;

export function recordSpend(unit,cost={},purpose='other',action='other'){
  const gold=amount(cost.gold),wood=amount(cost.wood),essence=amount(cost.essence);
  unit.stats.goldSpent=(unit.stats.goldSpent||0)+gold;
  unit.stats.woodSpent=(unit.stats.woodSpent||0)+wood;
  unit.stats.essenceSpent=(unit.stats.essenceSpent||0)+essence;
  unit.stats.spendByPurpose??={};unit.stats.spendByAction??={};
  const add=(ledger,key)=>{ledger[key]??={gold:0,wood:0};ledger[key].gold+=gold;ledger[key].wood+=wood;if(essence)ledger[key].essence=(ledger[key].essence||0)+essence;};
  add(unit.stats.spendByPurpose,purpose);add(unit.stats.spendByAction,action);
}

export function recordRefund(unit,refund={}){
  unit.stats.goldRefunded=(unit.stats.goldRefunded||0)+amount(refund.gold);
  unit.stats.woodRefunded=(unit.stats.woodRefunded||0)+amount(refund.wood);
  unit.stats.essenceRefunded=(unit.stats.essenceRefunded||0)+amount(refund.essence);
}

export function structurePurpose(kind){return ['wall','tower'].includes(kind)?'defense':['core','mine','workshop'].includes(kind)?'economy':'other';}
