// Seeded scenery has its own RNG stream. It never edits navigation, elevations,
// resources, refuge gates or the combat RNG; bridges cover existing road cells.
export function riverSectionAt(river,x){
  const points=river.points;
  if(x<points[0].x||x>points.at(-1).x)return null;
  const i=Math.min(points.length-2,Math.max(0,Math.floor((x-points[0].x)/river.step))),a=points[i],b=points[i+1],t=(x-a.x)/(b.x-a.x);
  const fade=Math.min(1,(x-points[0].x)/5,(points.at(-1).x-x)/5);
  return {z:a.z+(b.z-a.z)*t,width:river.width*Math.max(0,fade)};
}

export function riverProfileAt(map,x,z){
  for(const river of map.rivers||[]){
    if(!river.points)continue;
    const section=riverSectionAt(river,x);if(!section||section.width<=0)continue;
    const radius=section.width/2+map.cell*1.2,distance=Math.abs(z-section.z);
    if(distance>=radius)continue;
    const t=1-distance/radius;
    return {...section,depth:2.7*t*t*(3-2*t),riverId:river.id};
  }
  return null;
}

export function populateScenery(map,randomFor){
  const rng=randomFor(map.seed+':scenery-v1'),mid=(map.size-1)/2,phase=rng()*Math.PI*2,start=30,end=map.size-31;
  const river={id:'river0',name:'Rio do Orvalho',width:5.6,step:map.cell,points:[]};
  for(let x=start;x<=end;x++)river.points.push({x:x*map.cell,z:(mid-14+Math.sin((x-start)/10+phase)*1.25+Math.sin((x-start)/5)*.35)*map.cell});
  map.rivers=[river];map.bridges=[];map.bushes=[];
  const isOpen=(x,z)=>map.grid[z*map.size+x]===0,candidates=new Set();
  // Include the sloping banks and tile corners so no old road is left without
  // a deck after the presentation terrain is excavated.
  for(let z=2;z<map.size-2;z++)for(let x=start-1;x<=end+1;x++){
    if(!isOpen(x,z))continue;
    if([[0,0],[-.5,-.5],[.5,-.5],[-.5,.5],[.5,.5]].some(([dx,dz])=>riverProfileAt(map,(x+dx)*map.cell,(z+dz)*map.cell)))candidates.add(z*map.size+x);
  }
  while(candidates.size){
    const queue=[candidates.values().next().value],cells=[];candidates.delete(queue[0]);
    for(let i=0;i<queue.length;i++){
      const key=queue[i],x=key%map.size,z=Math.floor(key/map.size);cells.push({x:x*map.cell,z:z*map.cell});
      for(const next of [key-1,key+1,key-map.size,key+map.size])if(candidates.delete(next))queue.push(next);
    }
    const xs=cells.map(p=>p.x),zs=cells.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs),center={x:(minX+maxX)/2,z:(minZ+maxZ)/2};
    const anchor=cells.reduce((best,p)=>Math.hypot(p.x-center.x,p.z-center.z)<Math.hypot(best.x-center.x,best.z-center.z)?p:best,cells[0]);
    map.bridges.push({id:'bridge'+map.bridges.length,...anchor,axis:'z',width:maxX-minX+map.cell,length:maxZ-minZ+map.cell,bounds:{minX:minX-map.cell/2,maxX:maxX+map.cell/2,minZ:minZ-map.cell/2,maxZ:maxZ+map.cell/2},cells});
  }
  map.decor=map.decor.filter(p=>!riverProfileAt(map,p.x,p.z));
  const shrubs=map.decor.filter(p=>p.kind==='tree'&&map.bases.every(b=>Math.abs(p.x/map.cell-b.cx)>b.rx+1||Math.abs(p.z/map.cell-b.cz)>b.rz+1)&&[[1,0],[-1,0],[0,1],[0,-1],[2,0],[-2,0],[0,2],[0,-2]].some(([dx,dz])=>isOpen(Math.round(p.x/map.cell)+dx,Math.round(p.z/map.cell)+dz)));
  for(let i=shrubs.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[shrubs[i],shrubs[j]]=[shrubs[j],shrubs[i]];}
  const removed=new Set();
  for(const p of shrubs.slice(0,180)){
    removed.add(p);
    const section=riverSectionAt(river,p.x),bank=section&&Math.abs(p.z-section.z)<section.width/2+map.cell*3;
    map.bushes.push({x:p.x,z:p.z,kind:bank?'reeds':['round','fern','berry'][map.bushes.length%3],scale:.8+rng()*.45,rotation:rng()*Math.PI*2});
  }
  map.decor=map.decor.filter(p=>!removed.has(p));
  map.sceneryVersion=1;
}
