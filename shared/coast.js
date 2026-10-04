// Coastal presentation and fishing anchors. No RNG is consumed and no
// navigation, elevation, resource or combat state is changed by this module.
export function populateCoast(map){
  let lowest=0;for(let k=0;k<map.grid.length;k++)if(map.grid[k]===0)lowest=Math.min(lowest,map.heights[k]);
  map.ocean={version:1,level:lowest-.9,margin:600};map.fishingSpots=[];
  for(const base of map.bases){
    const axis=base.gate.axis,sign=-base.gate.sign,dx=axis==='x'?sign:0,dz=axis==='z'?sign:0;
    const radius=axis==='x'?base.rx:base.rz,lateral=axis==='x'?base.rz:base.rx;
    base.coast={axis,sign,dx,dz,beachStart:(radius-3)*map.cell,edge:(radius-.5)*map.cell,halfWidth:(lateral-2)*map.cell,rampLength:Math.max(map.cell*8,(base.height-map.ocean.level)/.45)};
    const candidates=[];
    for(let depth=radius-2;depth>=radius-3;depth--)for(let side=-(lateral-3);side<=lateral-3;side++){
      const cx=base.cx+dx*depth+(axis==='z'?side:0),cz=base.cz+dz*depth+(axis==='x'?side:0),x=cx*map.cell,z=cz*map.cell;
      if(map.grid[cz*map.size+cx]!==0)continue;
      const clearance=map.trees.reduce((best,tree)=>Math.min(best,Math.hypot(tree.x-x,tree.z-z)),Infinity);
      if(clearance<2.6)continue;
      candidates.push({x,z,score:depth*2-Math.abs(side)*.25});
    }
    candidates.sort((a,b)=>b.score-a.score);const point=candidates[0];
    if(point)map.fishingSpots.push({id:'fishing-'+base.id,baseId:base.id,x:point.x,z:point.z,facing:{x:dx,z:dz},castPoint:{x:base.x+dx*(base.coast.edge+base.coast.rampLength+map.cell*4),y:map.ocean.level,z:base.z+dz*(base.coast.edge+base.coast.rampLength+map.cell*4)}});
  }
}

// Continuous strip, not a radius around the deck marker. Coast remains inside
// the existing walkable cells; this never adds a back entrance to a refuge.
export function fishingLocation(map,u){
  const cx=Math.round(u.x/map.cell),cz=Math.round(u.z/map.cell);
  if(cx<0||cz<0||cx>=map.size||cz>=map.size||map.grid[cz*map.size+cx]!==0)return null;
  for(const base of map.bases){const c=base.coast;if(!c)continue;
    const along=(u.x-base.x)*c.dx+(u.z-base.z)*c.dz,across=c.axis==='x'?u.z-base.z:u.x-base.x;
    if(along<c.beachStart-1.5||along>c.edge+.2||Math.abs(across)>c.halfWidth+1e-6)continue;
    return {id:'fishing-'+base.id,baseId:base.id,x:u.x,z:u.z,castPoint:{x:u.x+c.dx*(c.edge-along+(c.rampLength||0)+map.cell*4),y:map.ocean.level,z:u.z+c.dz*(c.edge-along+(c.rampLength||0)+map.cell*4)}};
  }return null;
}

// Height of the visual sand bank, including the portion outside the finite
// navigation grid. Outside a bank there is seabed, not an infinitely extended
// copy of the last terrain cell (which used to fling reeling fish upward).
export function coastalBankHeight(map,x,z){
  let result=map.ocean?.level-1.4;
  for(const base of map.bases){const c=base.coast;if(!c)continue;const along=(x-base.x)*c.dx+(z-base.z)*c.dz,across=Math.abs(c.axis==='x'?z-base.z:x-base.x),start=c.edge+map.cell*1.5;
    if(along<start||across>c.halfWidth+map.cell)continue;const p=Math.max(0,Math.min(1,(along-start)/(c.rampLength||map.cell*8))),height=base.height+(map.ocean.level-.12-base.height)*p;
    result=Math.max(result,height);
  }return result;
}

// Build once per map, never during ticks/frames. 0=land, 1=beach, 2=bank,
// 3=sea. Protect the full triangle neighbourhood of all traversable cells so
// rendered ground still agrees with server collision, even on co-op ramps.
export function coastalField(map){
  const zones=new Uint8Array(map.size*map.size),heights=Float32Array.from(map.heights||zones);
  if(!map.ocean)return {zones,heights};
  const isOpen=(x,z)=>x>=0&&z>=0&&x<map.size&&z<map.size&&map.grid[z*map.size+x]===0;
  for(let z=0;z<map.size;z++)for(let x=0;x<map.size;x++){
    const k=z*map.size+x,px=x*map.cell,pz=z*map.cell;
    let bay=false,beach=false,ramp=null;
    for(const base of map.bases){
      const coast=base.coast;if(!coast)continue;
      const along=(px-base.x)*coast.dx+(pz-base.z)*coast.dz,across=Math.abs(coast.axis==='x'?pz-base.z:px-base.x);
      if(along>=coast.beachStart&&along<coast.edge&&across<=coast.halfWidth&&isOpen(x,z))beach=true;
      if(along>=coast.edge-map.cell*.25&&across<=coast.halfWidth+map.cell+Math.max(0,along-coast.edge)*.25)bay=true;
      const start=coast.edge+map.cell*1.5,length=coast.rampLength||map.cell*8;
      if(along>=start&&along<=start+length&&across<=coast.halfWidth+map.cell)ramp={base,progress:Math.max(0,Math.min(1,(along-start)/length))};
    }
    if(beach){zones[k]=1;continue;}
    if(!bay&&Math.min(x,z,map.size-1-x,map.size-1-z)>1)continue;
    if(isOpen(x,z))continue;
    let protectedGround=false;
    for(let dz=-1;dz<=1&&!protectedGround;dz++)for(let dx=-1;dx<=1;dx++)if(isOpen(x+dx,z+dz)){protectedGround=true;break;}
    zones[k]=protectedGround||ramp?2:3;
    // The sand bank descends gradually, outside the protected movement mesh.
    // Sea collision and all existing gates/tunnel elevations stay unchanged.
    if(!protectedGround)heights[k]=ramp?ramp.base.height+(map.ocean.level-.12-ramp.base.height)*ramp.progress:map.ocean.level-1.4;
  }
  return {zones,heights};
}
