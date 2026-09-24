import { icon } from './icons.js';
import { getLocale, localeCode } from './i18n.js';
export const resourceNumber=n=>Math.floor(n||0).toLocaleString(localeCode());
export function resource(kind,amount,{rate='',signed=false}={}){
  const label=kind==='gold'?(getLocale()==='en'?'Gold':'Ouro'):(getLocale()==='en'?'Wood':'Madeira'),value=rate?Number(amount||0).toLocaleString(localeCode(),{maximumFractionDigits:1}):resourceNumber(amount);
  return `<span class="resource-amount" title="${label}${rate?' por '+(rate==='s'?'segundo':'minuto'):''}"><span class="sr-only">${label}: </span>${icon(kind)}<span>${signed?'+':''}${value}${rate?'/'+rate:''}</span></span>`;
}
export const resourceCost=cost=>`<span class="resource-cost">${resource('gold',cost.gold)}${resource('wood',cost.wood)}</span>`;
