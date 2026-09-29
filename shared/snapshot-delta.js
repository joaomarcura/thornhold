// Collections with stable ids are diffed item by item. Scoreboard resources
// and special deposits change frequently in mature matches; treating either as
// one opaque value resent the complete array for a one-field change.
const COLLECTIONS=['units','structures','wisps','trees','specialNodes','scoreboard','debugTowers'];

// Snapshot diffing runs for every connected viewer at the network cadence.
// Compare in place to avoid allocating two complete JSON strings for every
// nested value on every snapshot.
function equal(a,b){
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
  if(Array.isArray(a)!==Array.isArray(b))return false;
  if(Array.isArray(a)){
    if(a.length!==b.length)return false;
    for(let i=0;i<a.length;i++)if(!equal(a[i],b[i]))return false;
    return true;
  }
  const aKeys=Object.keys(a),bKeys=Object.keys(b);if(aKeys.length!==bKeys.length)return false;
  for(const key of aKeys)if(!Object.hasOwn(b,key)||!equal(a[key],b[key]))return false;
  return true;
}

function objectPatch(previous,next){
  const set={},unset=[];
  for(const [key,value] of Object.entries(next))if(key!=='id'&&!equal(previous[key],value))set[key]=value;
  for(const key of Object.keys(previous))if(key!=='id'&&!(key in next))unset.push(key);
  return {set,unset};
}

export function createSnapshotDelta(previous,next,seq=1){
  if(!previous)return null;
  const set={},unset=[],collections={};
  for(const [key,value] of Object.entries(next)){
    if(COLLECTIONS.includes(key))continue;
    // Events are already cursor-filtered by the server. Always replace them so
    // a quiet tick cannot replay the previous event list in the browser.
    if(key==='events'||!equal(previous[key],value))set[key]=value;
  }
  for(const key of Object.keys(previous))if(!COLLECTIONS.includes(key)&&!(key in next))unset.push(key);
  for(const key of COLLECTIONS){
    const before=Array.isArray(previous[key])?previous[key]:[],after=Array.isArray(next[key])?next[key]:[];
    if(!after.length&&!before.length)continue;
    const beforeById=new Map(before.map(item=>[item.id,item])),afterById=new Map(after.map(item=>[item.id,item]));
    const add=[],patch=[],remove=[];
    for(const item of after){
      const old=beforeById.get(item.id);
      if(!old)add.push(item);
      else{const change=objectPatch(old,item);if(Object.keys(change.set).length||change.unset.length)patch.push({id:item.id,...change});}
    }
    for(const item of before)if(!afterById.has(item.id))remove.push(item.id);
    const beforeOrder=before.map(item=>item.id),afterOrder=after.map(item=>item.id),order=equal(beforeOrder,afterOrder)?undefined:afterOrder;
    if(add.length||patch.length||remove.length||order)collections[key]={add,patch,remove,...(order?{order}:{})};
  }
  return {seq,set,unset,collections};
}

export function applySnapshotDelta(previous,delta){
  if(!previous||!delta)return null;
  const next={...previous,...delta.set};
  for(const key of delta.unset||[])delete next[key];
  for(const [key,change] of Object.entries(delta.collections||{})){
    const items=new Map((next[key]||[]).map(item=>[item.id,{...item}]));
    for(const id of change.remove||[])items.delete(id);
    for(const item of change.add||[])items.set(item.id,item);
    for(const item of change.patch||[]){const current=items.get(item.id);if(!current)continue;Object.assign(current,item.set);for(const field of item.unset||[])delete current[field];}
    const order=change.order||[...items.keys()];next[key]=order.map(id=>items.get(id)).filter(Boolean);
  }
  return next;
}
