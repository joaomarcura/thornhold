const amount=value=>Number.isFinite(value)&&value>0?value:0;

export function recordSpend(unit,cost={},purpose='other',action='other'){
  const gold=amount(cost.gold),wood=amount(cost.wood);
  unit.stats.goldSpent=(unit.stats.goldSpent||0)+gold;
  unit.stats.woodSpent=(unit.stats.woodSpent||0)+wood;
  unit.stats.spendByPurpose??={};unit.stats.spendByAction??={};
  const add=(ledger,key)=>{ledger[key]??={gold:0,wood:0};ledger[key].gold+=gold;ledger[key].wood+=wood;};
  add(unit.stats.spendByPurpose,purpose);add(unit.stats.spendByAction,action);
}

export function recordRefund(unit,refund={}){
  unit.stats.goldRefunded=(unit.stats.goldRefunded||0)+amount(refund.gold);
  unit.stats.woodRefunded=(unit.stats.woodRefunded||0)+amount(refund.wood);
}

export function structurePurpose(kind){return ['wall','tower'].includes(kind)?'defense':['core','mine','workshop'].includes(kind)?'economy':'other';}
