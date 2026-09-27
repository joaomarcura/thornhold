export const DEFAULT_BINDINGS=Object.freeze({
  forward:'KeyW',backward:'KeyS',left:'KeyA',right:'KeyD',sprint:'ShiftLeft',
  repair:'KeyR',heal:'KeyR',heavy:'KeyQ',dash:'Space',ability:'KeyF',
  recall:'KeyB',shop:'KeyG',map:'KeyM',camera:'KeyC',core:'KeyN',upgrade:'KeyQ',
  wisp:'KeyT',ping:'KeyV',spectate:'Tab',help:'KeyH'
});

export const BINDING_LABELS=Object.freeze({
  forward:'Mover para frente',backward:'Mover para trás',left:'Mover à esquerda',right:'Mover à direita',sprint:'Correr',
  repair:'Reparar / coletar / girar projeto',heal:'Cura do Troll',heavy:'Golpe pesado',dash:'Esquiva',ability:'Habilidade',
  recall:'Retorno ao Santuário',shop:'Loja do Troll',map:'Mapa tático',camera:'Voltar à câmera',core:'Núcleo / Wisps',upgrade:'Evoluir seleção',
  wisp:'Formar Wisp',ping:'Comunicação',spectate:'Trocar observado',help:'Como jogar'
});

const STORAGE_KEY='thornhold-preferences';
const SCALES=[.9,1,1.1,1.25];
const RESERVED=new Set(['Escape','Enter','Delete','F3','F10','Digit1','Digit2','Digit3','Digit4','Digit5']);
let preferences=load();

function storage(){return typeof globalThis.localStorage==='undefined'?null:globalThis.localStorage;}
function load(){
  let saved={};try{saved=JSON.parse(storage()?.getItem(STORAGE_KEY)||'{}')||{};}catch{}
  const scale=SCALES.includes(Number(saved.scale))?Number(saved.scale):1;
  const bindings={...DEFAULT_BINDINGS,...(saved.bindings||{})};if((saved.bindingVersion||0)<2){bindings.upgrade='KeyQ';bindings.heal='KeyR';}if((saved.bindingVersion||0)<3){bindings.recall='KeyB';bindings.shop='KeyG';}
  return {scale,reducedMotion:saved.reducedMotion===true,bindingVersion:3,bindings};
}
function save(){try{storage()?.setItem(STORAGE_KEY,JSON.stringify(preferences));}catch{}applyPreferences();return getPreferences();}
export function getPreferences(){return {scale:preferences.scale,reducedMotion:preferences.reducedMotion,bindings:{...preferences.bindings}};}
export function binding(action){return preferences.bindings[action]||DEFAULT_BINDINGS[action];}
export function matches(event,action){return event.code===binding(action);}
export function held(keys,action){const code=binding(action);return keys.has(code)||(action==='sprint'&&code==='ShiftLeft'&&keys.has('ShiftRight'));}
export function setScale(value){const scale=SCALES.includes(Number(value))?Number(value):1;preferences={...preferences,scale};return save();}
export function setReducedMotion(value){preferences={...preferences,reducedMotion:!!value};return save();}
export function setBinding(action,code){
  if(!DEFAULT_BINDINGS[action]||!code||RESERVED.has(code))return {ok:false,reason:'reserved'};
  const bindings={...preferences.bindings},contextual=new Set(['upgrade:heavy','heavy:upgrade','repair:heal','heal:repair']),other=Object.keys(bindings).find(key=>key!==action&&bindings[key]===code&&!contextual.has(`${action}:${key}`));
  if(other)bindings[other]=bindings[action];
  bindings[action]=code;preferences={...preferences,bindings};save();return {ok:true,swapped:other||null};
}
export function resetPreferences(){preferences={scale:1,reducedMotion:false,bindingVersion:3,bindings:{...DEFAULT_BINDINGS}};return save();}
export function keyLabel(code){
  if(!code)return '—';
  const names={Space:'Espaço',Tab:'Tab',ShiftLeft:'Shift',ShiftRight:'Shift',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Backquote:'`',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',Backslash:'\\',BracketLeft:'[',BracketRight:']'};
  return names[code]||code.replace(/^Key/,'').replace(/^Digit/,'').replace(/^Numpad/,'Num ');
}
export function applyPreferences(){
  if(typeof document==='undefined')return;
  const scale=preferences.scale,root=document.documentElement;
  root.style.setProperty('--ui-scale',String(scale));
  root.style.setProperty('--ui-extent',`${100/scale}%`);
  root.style.setProperty('--ui-vh',`${100/scale}vh`);
  document.body?.classList.toggle('reduce-motion',preferences.reducedMotion);
}
