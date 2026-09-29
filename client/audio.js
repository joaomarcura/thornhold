const VOLUME_KEY='thornhold-volume',ENABLED_KEY='thornhold-sound',MIX_KEY='thornhold-audio-mix';
const DEFAULT_VOLUME=.55,MUSIC_LEVEL=.22;
export const AUDIO_CATEGORIES=Object.freeze(['master','music','sfx','ambient','ui']);
const DEFAULT_MIX=Object.freeze({master:DEFAULT_VOLUME,music:.6,sfx:.85,ambient:.45,ui:.72});

export const HEROIC_PROGRESSION=Object.freeze([
  Object.freeze([146.83,220,293.66,349.23]),
  Object.freeze([116.54,174.61,233.08,293.66]),
  Object.freeze([174.61,261.63,349.23,440]),
  Object.freeze([130.81,196,261.63,329.63])
]);

export function normalizeVolume(value){const number=Number(value);return Number.isFinite(number)?Math.max(0,Math.min(1,number)):DEFAULT_VOLUME;}
function storage(){return typeof globalThis.localStorage==='undefined'?null:globalThis.localStorage;}
function storedVolume(){const value=storage()?.getItem(VOLUME_KEY);return value===null||value===undefined?DEFAULT_VOLUME:normalizeVolume(value);}

function storedMix(){try{return {...DEFAULT_MIX,...JSON.parse(storage()?.getItem(MIX_KEY)||'{}'),master:storedVolume()};}catch{return {...DEFAULT_MIX,master:storedVolume()};}}
let mix=storedMix(),volume=mix.master,enabled=storage()?.getItem(ENABLED_KEY)!=='off'&&volume>0;
let context=null,master=null,effects=null,music=null,ambient=null,ui=null,musicActive=false,musicTimer=null,nextBar=0,barIndex=0,ambientNodes=[],threatPresence=0;

function save(){try{storage()?.setItem(VOLUME_KEY,String(volume));storage()?.setItem(ENABLED_KEY,enabled?'on':'off');storage()?.setItem(MIX_KEY,JSON.stringify(mix));}catch{}}
function audioContext(){return globalThis.AudioContext||globalThis.webkitAudioContext;}
function ensureAudio(){
  const AudioContextClass=audioContext();if(!AudioContextClass)return null;
  if(!context){
    context=new AudioContextClass();master=context.createGain();effects=context.createGain();music=context.createGain();ambient=context.createGain();ui=context.createGain();
    effects.connect(master);music.connect(master);ambient.connect(master);ui.connect(master);master.connect(context.destination);applyMix();
  }
  if(context.state==='suspended')context.resume().catch(()=>{});
  if(musicActive)startMusicScheduler();
  return context;
}
function applyMix(){
  if(!context||!master)return;const now=context.currentTime,target=enabled?mix.master:0;
  master.gain.cancelScheduledValues(now);master.gain.setTargetAtTime(target,now,.025);
  effects.gain.setTargetAtTime(mix.sfx,now,.04);ui.gain.setTargetAtTime(mix.ui,now,.04);ambient.gain.setTargetAtTime(musicActive?mix.ambient*(.1+threatPresence*.3):0,now,.25);
  music.gain.cancelScheduledValues(now);music.gain.setTargetAtTime(musicActive&&enabled?MUSIC_LEVEL*mix.music:0,now,.18);
}

export function getAudioSettings(){return {enabled,volume:mix.master,...mix};}
export function setAudioEnabled(value){enabled=!!value;if(enabled&&mix.master===0)mix.master=DEFAULT_VOLUME;volume=mix.master;save();ensureAudio();applyMix();return getAudioSettings();}
export function setAudioVolume(value){return setAudioCategory('master',value);}
export function setAudioCategory(category,value){if(!AUDIO_CATEGORIES.includes(category))return getAudioSettings();mix={...mix,[category]:normalizeVolume(value)};volume=mix.master;enabled=mix.master>0;save();ensureAudio();applyMix();return getAudioSettings();}
export function setThreatPresence(value){threatPresence=normalizeVolume(value);applyMix();}

function voice(frequency,start,duration,{type='sine',gain=.04,destination=effects,attack=.015}={}){
  const oscillator=context.createOscillator(),amp=context.createGain();oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,start);
  amp.gain.setValueAtTime(.0001,start);amp.gain.exponentialRampToValueAtTime(gain,start+attack);amp.gain.exponentialRampToValueAtTime(.0001,start+duration);
  oscillator.connect(amp);amp.connect(destination);oscillator.start(start);oscillator.stop(start+duration+.02);
}

export function sound(type,{distance=0}={}){
  if(!enabled||volume<=0)return;try{
    if(!ensureAudio())return;const t=context.currentTime,harsh=['damage','swing','destroy','impact'].includes(type),uiSound=['click','purchase','complete','phase','card-chosen'].includes(type),destination=uiSound?ui:effects,distanceGain=Math.max(.18,1-Math.max(0,distance-4)/48);
    const frequency={impact:100,'wisp-death':210,'wisp-trained':700,click:420,build:280,gather:640,damage:110,swing:85,repair:520,purchase:740,phase:180,stun:1150,shot:950,beam:1250,'legendary-tower':1450,'legendary-execute':55,death:75,destroy:65,complete:880}[type]||350;
    voice(frequency,t,.22,{type:harsh?'triangle':'sine',gain:((type==='shot'||type==='beam')?.025:.055)*distanceGain,destination});
    if(type==='gather'){voice(165,t,.075,{type:'square',gain:.025*distanceGain,destination:effects,attack:.003});voice(82,t+.018,.16,{type:'triangle',gain:.035*distanceGain,destination:effects,attack:.004});}
    if(type==='impact'||type==='destroy'){voice(frequency*.52,t+.015,.32,{type:'sawtooth',gain:.025*distanceGain,destination:effects,attack:.006});voice(frequency*1.8,t,.09,{type:'square',gain:.012*distanceGain,destination:effects,attack:.004});}
  }catch{}
}

function startAmbient(){
  if(!context||ambientNodes.length)return;for(const [frequency,gain] of [[54,.035],[81,.014]]){const oscillator=context.createOscillator(),amp=context.createGain();oscillator.type='sine';oscillator.frequency.value=frequency;amp.gain.value=gain;oscillator.connect(amp);amp.connect(ambient);oscillator.start();ambientNodes.push(oscillator,amp);}
}

function scheduleBar(start,index){
  const beat=60/72,chord=HEROIC_PROGRESSION[index%HEROIC_PROGRESSION.length];
  // Sustained low brass-like harmony and a sparse rising motif keep the track heroic without masking combat cues.
  chord.forEach((frequency,note)=>voice(frequency,start,beat*3.85,{type:note<2?'triangle':'sine',gain:note===0?.075:.025,destination:music,attack:.28}));
  const motif=[chord[1],chord[2],chord[3],chord[2]];
  motif.forEach((frequency,note)=>voice(frequency*2,start+beat*(note+.18),beat*.62,{type:'triangle',gain:.027,destination:music,attack:.035}));
  voice(chord[0]/2,start,beat*1.65,{type:'sine',gain:.08,destination:music,attack:.08});
  voice(chord[0]/2,start+beat*2,beat*1.65,{type:'sine',gain:.07,destination:music,attack:.08});
}
function scheduleMusic(){
  if(!context||!musicActive||!enabled)return;const horizon=context.currentTime+3.5,barLength=4*(60/72);
  if(nextBar<context.currentTime+.05)nextBar=context.currentTime+.08;
  while(nextBar<horizon){scheduleBar(nextBar,barIndex++);nextBar+=barLength;}
}
function startMusicScheduler(){
  if(!context||musicTimer||!musicActive||!enabled)return;nextBar=Math.max(nextBar,context.currentTime+.08);scheduleMusic();musicTimer=setInterval(scheduleMusic,500);
}
function stopMusicScheduler(){if(musicTimer){clearInterval(musicTimer);musicTimer=null;}nextBar=0;barIndex=0;}
export function setMusicActive(value){musicActive=!!value;if(musicActive){if(context){startMusicScheduler();startAmbient();}}else stopMusicScheduler();applyMix();}
