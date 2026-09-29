export const RANK_TIERS=Object.freeze([
  {key:'iron',name:'Ferro',min:0,color:'#78828a'},
  {key:'bronze',name:'Bronze',min:800,color:'#ad7652'},
  {key:'silver',name:'Prata',min:1100,color:'#aebec8'},
  {key:'gold',name:'Ouro',min:1400,color:'#e1bd61'},
  {key:'platinum',name:'Platina',min:1700,color:'#70c9b8'},
  {key:'diamond',name:'Diamante',min:2000,color:'#75a8ef'},
  {key:'master',name:'Mestre',min:2300,color:'#b477dd'},
  {key:'grandmaster',name:'Grão-Mestre',min:2500,color:'#db665d'},
  {key:'challenger',name:'Desafiante',min:2700,color:'#efe09b'}
]);

export const RANK_CONFIG=Object.freeze({initialRating:1200,initialMmr:1200,kFactor:32,seasonId:'season-0-development',tiers:RANK_TIERS});

export function tierForRating(rating,config=RANK_CONFIG){
  const value=Math.max(0,Number(rating)||0);
  return [...config.tiers].reverse().find(tier=>value>=tier.min)||config.tiers[0];
}

export function rankProgress(rating,config=RANK_CONFIG){
  const tier=tierForRating(rating,config),index=config.tiers.findIndex(row=>row.key===tier.key),next=config.tiers[index+1]||null;
  return {tier,next,progress:next?Math.max(0,Math.min(1,(rating-tier.min)/(next.min-tier.min))):1};
}
