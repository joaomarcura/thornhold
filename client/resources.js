import { icon } from './icons.js';
import { getLocale, localeCode } from './i18n.js';
export const resourceNumber=n=>Math.floor(n||0).toLocaleString(localeCode());
export function resource(kind,amount,{rate='',signed=false}={}){
  const labels={gold:getLocale()==='en'?'Gold':'Ouro',wood:getLocale()==='en'?'Wood':'Madeira',essence:getLocale()==='en'?'Essence':'Essência',ancientWood:getLocale()==='en'?'Ancient Wood':'Madeira Ancestral',crystal:getLocale()==='en'?'Crystal':'Cristal',mana:'Mana'},label=labels[kind]||kind,value=rate?Number(amount||0).toLocaleString(localeCode(),{maximumFractionDigits:1}):resourceNumber(amount);
  return `<span class="resource-amount" title="${label}${rate?' por '+(rate==='s'?'segundo':'minuto'):''}"><span class="sr-only">${label}: </span>${icon(kind)}<span>${signed?'+':''}${value}${rate?'/'+rate:''}</span></span>`;
}
export const resourceCost=(cost,wallet=null)=>{const ordinary=['gold','wood','essence'].filter(kind=>kind!=='essence'||(cost?.essence||0)>0),special=cost?.specialAmount?[{kind:cost.specialResource||'relic',amount:cost.specialAmount}]:[],rows=[...ordinary.map(kind=>({kind,amount:cost?.[kind]||0})),...special];return `<span class="resource-cost">${rows.map(({kind,amount})=>{const balance=special.some(row=>row.kind===kind)?wallet?.specialResources?.[kind]:wallet?.[kind];return `<span class="${wallet&&balance<amount?'resource-missing':''}">${resource(kind,amount)}</span>`;}).join('')}</span>`;};
