import { icon } from './icons.js';
import { getLocale, localeCode } from './i18n.js';
export const resourceNumber=n=>Math.floor(n||0).toLocaleString(localeCode());
export function resource(kind,amount,{rate='',signed=false}={}){
  const labels={gold:getLocale()==='en'?'Gold':'Ouro',wood:getLocale()==='en'?'Wood':'Madeira',essence:getLocale()==='en'?'Essence':'Essência'},label=labels[kind]||kind,value=rate?Number(amount||0).toLocaleString(localeCode(),{maximumFractionDigits:1}):resourceNumber(amount);
  return `<span class="resource-amount" title="${label}${rate?' por '+(rate==='s'?'segundo':'minuto'):''}"><span class="sr-only">${label}: </span>${icon(kind)}<span>${signed?'+':''}${value}${rate?'/'+rate:''}</span></span>`;
}
export const resourceCost=(cost,wallet=null)=>`<span class="resource-cost">${['gold','wood','essence'].filter(kind=>kind!=='essence'||(cost?.essence||0)>0).map(kind=>`<span class="${wallet&&wallet[kind]<(cost[kind]||0)?'resource-missing':''}">${resource(kind,cost[kind])}</span>`).join('')}</span>`;
