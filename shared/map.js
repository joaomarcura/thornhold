import { BALANCE } from './config.js';
export function randomFor(seed) {
  let h=2166136261;for(const c of String(seed))h=Math.imul(h^c.charCodeAt(0),16777619);
  return ()=>{h+=0x6D2B79F5;let t=h;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
}
export const toCell=(map,p)=>({x:Math.round(p.x/map.cell),z:Math.round(p.z/map.cell)});
export const world=(map,x,z)=>({x:x*map.cell,z:z*map.cell});
export const index=(map,x,z)=>z*map.size+x;
export const walkable=(map,x,z)=>x>=0&&z>=0&&x<map.size&&z<map.size&&map.grid[index(map,x,z)]===0;
export function baseAt(map,p){const c=toCell(map,p);return map.bases.find(b=>Math.abs(c.x-b.cx)<b.rx&&Math.abs(c.z-b.cz)<b.rz&&walkable(map,c.x,c.z));}
export function baseZone(map,base,p){
  const b=typeof base==='string'?map.bases.find(candidate=>candidate.id===base):base,c=toCell(map,p);
  if(!b||Math.abs(c.x-b.cx)>=b.rx||Math.abs(c.z-b.cz)>=b.rz||!walkable(map,c.x,c.z))return null;
  const rules=b.zones||{coreRadius:2.75,frontlineDepth:4},coreDistance=Math.hypot(c.x-b.cx,c.z-b.cz);
  if(coreDistance<=rules.coreRadius)return 'core';
  const depth=b.gate.axis==='x'?(c.x-b.gate.cx)*-b.gate.sign:(c.z-b.gate.cz)*-b.gate.sign;
  return depth<=rules.frontlineDepth?'frontline':'industrial';
}
export function baseUsableCells(map,b){let count=0;for(let z=b.cz-b.rz;z<=b.cz+b.rz;z++)for(let x=b.cx-b.rx;x<=b.cx+b.rx;x++)if(walkable(map,x,z))count++;return count;}

// Server, ground picking and rendering share this triangular field (diagonal 00→11).
export function heightAt(map,x,z){
  if(!map.heights)return 0;
  const fx=Math.max(0,Math.min(map.size-1.000001,x/map.cell)),fz=Math.max(0,Math.min(map.size-1.000001,z/map.cell));
  const ix=Math.floor(fx),iz=Math.floor(fz),u=fx-ix,v=fz-iz,h=(dx,dz)=>map.heights[index(map,ix+dx,iz+dz)];
  return u>=v?h(0,0)*(1-u)+h(1,0)*(u-v)+h(1,1)*v:h(0,0)*(1-v)+h(0,1)*(v-u)+h(1,1)*u;
}
export function flatGround(map,x,z,radius){
  const heights=[[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius],[radius*.7,radius*.7],[-radius*.7,radius*.7],[radius*.7,-radius*.7],[-radius*.7,-radius*.7]].map(([dx,dz])=>heightAt(map,x+dx,z+dz));
  return Math.max(...heights)-Math.min(...heights)<=.12;
}
export function traversable(map,x,z,nx,nz){return walkable(map,nx,nz)&&Math.abs((map.heights?.[index(map,x,z)]||0)-(map.heights?.[index(map,nx,nz)]||0))<=map.cell*.55;}

export function generateMap(seed='THORNHOLD',mapSize='compact'){
  const rng=randomFor(seed),size=mapSize==='large'?125:109,cell=BALANCE.cell,mid=(size-1)/2,offset=(size-109)/2;
  const map={seed:String(seed),version:3,size,cell,grid:Array(size*size).fill(1),heights:Array(size*size).fill(0),bases:[],trees:[],decor:[],pois:[],trails:[]};
  const carve=(x,z,r=1)=>{for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++)if(x+dx>1&&z+dz>1&&x+dx<size-2&&z+dz<size-2)map.grid[index(map,x+dx,z+dz)]=0;};
  const trail=(points,width=1)=>{map.trails.push(points.map(([x,z])=>world(map,x,z)));for(let i=1;i<points.length;i++){let [x,z]=points[i-1];const [tx,tz]=points[i];carve(x,z,width);while(x!==tx||z!==tz){if(x!==tx)x+=Math.sign(tx-x);else z+=Math.sign(tz-z);carve(x,z,width);}}};
  // Connected woodland loops, turns and blind branches replace radial sight lines.
  const a=36+offset,c=72+offset,lanes=[a,mid,c];
  for(let row=0;row<3;row++)for(let col=0;col<2;col++){
    const x=lanes[col],z=lanes[row],end=lanes[col+1],bend=z+Math.floor(rng()*7)-3;
    trail([[x,z],[x+5,z],[x+5,bend],[end-4,bend],[end-4,z],[end,z]]);
    const bx=x+8;trail([[bx,bend],[bx,bend+(row===0?-1:1)*(5+Math.floor(rng()*3))]],1);
  }
  for(let col=0;col<3;col++)for(let row=0;row<2;row++){
    const x=lanes[col],z=lanes[row],end=lanes[row+1],bend=x+Math.floor(rng()*7)-3;
    trail([[x,z],[x,z+4],[bend,z+4],[bend,end-5],[x,end-5],[x,end]]);
  }
  for(let z=mid-8;z<=mid+7;z++)for(let x=mid-7;x<=mid+7;x++)if(Math.abs(x-mid)+Math.abs(z-mid)<13)carve(x,z,0);
  map.elfSpawn=world(map,mid,mid+3);map.trollSpawn=world(map,mid,mid-5);
  map.trollShop={id:'troll-shop',name:'Forja Ancestral',...world(map,mid+2,mid-5)};
  const lo=12,hi=size-13,inner1=40+offset,inner2=68+offset;
  const slots=[[lo,lo,'x',1],[inner1,lo,'z',1],[inner2,lo,'z',1],[hi,lo,'x',-1],[hi,inner1,'x',-1],[hi,inner2,'x',-1],[hi,hi,'x',-1],[inner2,hi,'z',-1],[inner1,hi,'z',-1],[lo,hi,'x',1],[lo,inner2,'x',1],[lo,inner1,'x',1]];
  const names=['Vale Âmbar','Bosque do Orvalho','Refúgio Lunar','Pedra Serena','Jardim Cinzento','Clareira Rubra','Ninho de Musgo','Vigília Azul','Grota das Raízes','Terraço Antigo','Recanto Velado','Bacia das Névoas'];
  const profiles=[{label:'Recanto',rx:6,rz:5,trees:5},{label:'Bosque',rx:7,rz:7,trees:8},{label:'Clareira ampla',rx:8,rz:8,trees:12}];
  const shift=Math.floor(rng()*3),levels=[0,3.6,-3.6,5.4,-2.4,0,-4.4,3.2,0,4.8,-3.2,2.4];
  for(let i=0;i<slots.length;i++){
    const [sx,sz,axis,sign]=slots[i],cx=sx+Math.floor(rng()*3)-1,cz=sz+Math.floor(rng()*3)-1,profile=profiles[(i+shift)%3];
    // V3.1 expands sideways, not toward the trail: gates and approach distance
    // remain unchanged while each refuge gains roughly 30–50% usable space.
    const lateralExpansion=2,rx=profile.rx+(axis==='z'?lateralExpansion:0),rz=profile.rz+(axis==='x'?lateralExpansion:0),gx=cx+(axis==='x'?profile.rx*sign:0),gz=cz+(axis==='z'?profile.rz*sign:0),dx=axis==='x'?sign:0,dz=axis==='z'?sign:0;
    const end={x:gx+dx*5,z:gz+dz*5},junction={x:Math.max(a,Math.min(c,end.x)),z:Math.max(a,Math.min(c,end.z))};
    trail([[junction.x,junction.z],[end.x,junction.z],[end.x,end.z],[gx+dx*2,gz+dz*2]]);
    const nearest=lanes.reduce((best,n)=>Math.abs(n-junction.x)<Math.abs(best-junction.x)?n:best,lanes[0]);
    const nearestZ=lanes.reduce((best,n)=>Math.abs(n-junction.z)<Math.abs(best-junction.z)?n:best,lanes[0]);
    trail([[junction.x,junction.z],[nearest,junction.z],[nearest,nearestZ]]);
    const b={id:'base'+i,name:names[i],cx,cz,rx,rz,...world(map,cx,cz),height:levels[i],profile:profile.label,capacity:profile.trees,wood:BALANCE.economy.treeStock*profile.trees,zones:{coreRadius:2.75,frontlineDepth:4,lateralExpansion,legacyRx:profile.rx,legacyRz:profile.rz},gate:{...world(map,gx,gz),cx:gx,cz:gz,axis,sign},outside:world(map,gx+dx*3,gz+dz*3),ramp:{from:world(map,gx+dx,gz+dz),to:world(map,junction.x,junction.z)}};
    map.bases.push(b);
    for(let z=cz-rz;z<=cz+rz;z++)for(let x=cx-rx;x<=cx+rx;x++)map.grid[index(map,x,z)]=(Math.abs(x-cx)===rx||Math.abs(z-cz)===rz||(Math.abs(x-cx)>rx-3&&Math.abs(z-cz)>rz-3))?1:0;
    carve(gx,gz,0);carve(gx+dx,gz+dz,0);
    const candidates=[];
    for(let z=cz-rz+2;z<=cz+rz-2;z+=2)for(let x=cx-rx+2;x<=cx+rx-2;x+=2){
      const p=world(map,x,z);if(Math.hypot(x-cx,z-cz)<3.4||Math.hypot(x-gx,z-gz)<4.5||!walkable(map,x,z))continue;candidates.push(p);
    }
    for(let j=candidates.length-1;j>0;j--){const k=Math.floor(rng()*(j+1));[candidates[j],candidates[k]]=[candidates[k],candidates[j]];}
    for(const p of candidates.slice(0,profile.trees))map.trees.push({id:'tree'+map.trees.length,...p,amount:BALANCE.economy.treeStock,rich:false,style:Math.floor(rng()*3),baseId:b.id});
    b.capacity=map.trees.filter(t=>t.baseId===b.id).length;b.wood=b.capacity*BALANCE.economy.treeStock;
  }
  // Later approach trails may brush a neighbouring refuge; enforce every perimeter last.
  for(const b of map.bases){for(let z=b.cz-b.rz;z<=b.cz+b.rz;z++)for(let x=b.cx-b.rx;x<=b.cx+b.rx;x++)if(Math.abs(x-b.cx)===b.rx||Math.abs(z-b.cz)===b.rz)map.grid[index(map,x,z)]=1;carve(b.gate.cx,b.gate.cz,0);b.usableCells=baseUsableCells(map,b);}
  // Flat platforms and continuous eight-cell earth ramps; no visual-only steps.
  for(let z=0;z<size;z++)for(let x=0;x<size;x++){
    let y=0;for(const b of map.bases){const d=Math.max(0,Math.abs(x-b.cx)-b.rx-1,Math.abs(z-b.cz)-b.rz-1);y+=b.height*Math.max(0,1-d/8);}
    map.heights[index(map,x,z)]=Math.round(y*10000)/10000;
  }
  // Lateral expansion can make two elevation fields overlap at a gate. Give
  // the three-cell approach corridor one continuous local ramp so Barricade
  // foundations remain level without introducing a traversal cliff.
  for(const b of map.bases){const dx=b.gate.axis==='x'?b.gate.sign:0,dz=b.gate.axis==='z'?b.gate.sign:0;
    for(let step=0;step<=9;step++){const longitudinal=step<=1?1:Math.max(0,1-(step-1)/8);for(let side=-4;side<=4;side++){const lateral=Math.abs(side)<=1?1:Math.max(0,1-(Math.abs(side)-1)/3),blend=longitudinal*lateral,x=b.gate.cx+dx*step+(b.gate.axis==='z'?side:0),z=b.gate.cz+dz*step+(b.gate.axis==='x'?side:0);if(x>=0&&z>=0&&x<size&&z<size){const k=index(map,x,z),y=map.heights[k]*(1-blend)+b.height*blend;map.heights[k]=Math.round(y*10000)/10000;}}}
  }
  for(const b of map.bases){const axis=b.gate.axis,sign=b.gate.sign;
    for(const side of [-1,1]){const x=b.gate.cx+(axis==='x'?sign*4:side),z=b.gate.cz+(axis==='z'?sign*4:side);if(walkable(map,x,z))map.trees.push({id:'tree'+map.trees.length,...world(map,x,z),amount:BALANCE.economy.treeStock,rich:true,style:1});}
  }
  // Scenery stays on blocked cells; the visible trail is also the collision corridor.
  for(let z=2;z<size-2;z++)for(let x=2;x<size-2;x++)if(!walkable(map,x,z)&&rng()<.35)map.decor.push({...world(map,x,z),scale:.8+rng()*.4,kind:rng()<.2?'rock':'tree',rotation:rng()*6.28});
  map.pois=[{...world(map,mid-5,mid),name:'Pedras ancestrais'},{...world(map,mid+5,mid+3),name:'Fonte do luar'}];
  map.validation=map.bases.map(b=>validateBase(map,b));
  if(map.validation.some(v=>!v.valid))throw new Error('Mapa recusado: '+JSON.stringify(map.validation.filter(v=>!v.valid)));
  return map;
}
export function flood(map,start,blocked=new Set()){
  const seen=new Set(),q=[start];let head=0;seen.add(index(map,start.x,start.z));
  while(head<q.length){const p=q[head++];for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const x=p.x+dx,z=p.z+dz,k=index(map,x,z);if(traversable(map,p.x,p.z,x,z)&&!seen.has(k)&&!blocked.has(k)){seen.add(k);q.push({x,z});}}}return seen;
}
export function validateBase(map,b){
  const start=toCell(map,map.trollSpawn),target=index(map,b.cx,b.cz),gate=index(map,b.gate.cx,b.gate.cz);
  const connected=flood(map,start).has(target),sealed=!flood(map,start,new Set([gate])).has(target);
  let openings=0;for(let z=b.cz-b.rz;z<=b.cz+b.rz;z++)for(let x=b.cx-b.rx;x<=b.cx+b.rx;x++)if((Math.abs(x-b.cx)===b.rx||Math.abs(z-b.cz)===b.rz)&&walkable(map,x,z))openings++;
  return {base:b.id,connected,gateIsCutVertex:sealed,openings,valid:connected&&sealed&&openings===1};
}
export function pathfind(map,from,to,blocked=new Set()){
  const a=toCell(map,from),b=toCell(map,to),start=index(map,a.x,a.z),goal=index(map,b.x,b.z);
  if(!walkable(map,b.x,b.z)||blocked.has(goal))return [];
  const open=[start],parent=new Map(),g=new Map([[start,0]]),closed=new Set();
  const heuristic=k=>Math.abs(k%map.size-b.x)+Math.abs(Math.floor(k/map.size)-b.z);
  while(open.length){let best=0;for(let i=1;i<open.length;i++)if(g.get(open[i])+heuristic(open[i])<g.get(open[best])+heuristic(open[best]))best=i;
    const k=open.splice(best,1)[0];if(k===goal){const result=[];let n=k;while(n!==start){result.push(world(map,n%map.size,Math.floor(n/map.size)));n=parent.get(n);}return result.reverse();}
    closed.add(k);const x=k%map.size,z=Math.floor(k/map.size);
    for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,nz=z+dz,n=index(map,nx,nz);if(!traversable(map,x,z,nx,nz)||closed.has(n)||blocked.has(n))continue;const score=g.get(k)+1;if(score<(g.get(n)??Infinity)){parent.set(n,k);g.set(n,score);if(!open.includes(n))open.push(n);}}
  }return [];
}
export function lineOfSight(map,a,b,fromHeight=1.8,toHeight=1.8){
  const n=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/(map.cell*.45)),ay=heightAt(map,a.x,a.z)+fromHeight,by=heightAt(map,b.x,b.z)+toHeight;
  for(let i=1;i<n;i++){const t=i/n,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,p=toCell(map,{x,z});if(!walkable(map,p.x,p.z)||heightAt(map,x,z)>ay+(by-ay)*t)return false;}return true;
}
// Defensive towers are elevated above their own refuge perimeter. The perimeter
// blocks ground movement, but must not become an infinitely tall invisible wall
// that only lets a tower shoot when it happens to align perfectly with the gate.
export function towerLineOfSight(map,a,b,baseId,fromHeight=4.5,toHeight=2){
  const base=map.bases.find(base=>base.id===baseId),n=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/(map.cell*.45)),ay=heightAt(map,a.x,a.z)+fromHeight,by=heightAt(map,b.x,b.z)+toHeight;
  for(let i=1;i<n;i++){
    const t=i/n,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,p=toCell(map,{x,z}),ray=ay+(by-ay)*t;
    const ownPerimeter=base&&Math.abs(p.x-base.cx)<=base.rx&&Math.abs(p.z-base.cz)<=base.rz;
    if((!walkable(map,p.x,p.z)&&!ownPerimeter)||heightAt(map,x,z)>ray)return false;
  }
  return true;
}
