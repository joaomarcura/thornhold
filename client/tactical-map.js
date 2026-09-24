import { BALANCE as B, distance } from '../shared/config.js';
import { lineOfSight, toCell, index } from '../shared/map.js';
import { playerColor } from '../shared/player-identity.js';

// Receives only the personalized snapshot. A fading sighting never follows a hidden enemy.
export class TacticalMap {
  constructor(map){this.map=map;this.seenBases=new Set();this.lastTroll=null;this.explored=new Uint8Array(map.size*map.size);this.visible=new Uint8Array(map.size*map.size);this.revision=0;this.backgrounds=new Map();}
  update(snapshot,viewer){
    this.snapshot=snapshot;this.viewer=viewer;
    const troll=snapshot.units.find(u=>u.role==='troll'&&u.alive);
    if(troll)this.lastTroll={x:troll.x,z:troll.z,time:snapshot.time};
    if(snapshot.units.some(u=>u.role==='troll'&&!u.alive))this.lastTroll=null;
    const sources=viewer?[...snapshot.units.filter(a=>a.role===viewer.role&&a.alive),...(viewer.role==='elf'?snapshot.structures.filter(s=>s.progress>=1&&s.hp>0):[])]:[];
    const key=viewer?sources.map(p=>{const c=toCell(this.map,p);return `${c.x},${c.z}`;}).join(';'):'spectator';
    if(key===this.visionKey)return;this.visionKey=key;this.visible.fill(viewer?0:1);this.revision++;
    if(!viewer)this.explored.fill(1);
    const radius=B.vision[viewer?.role]||24,cells=Math.ceil(radius/this.map.cell);
    for(const source of sources){const c=toCell(this.map,source);for(let z=Math.max(0,c.z-cells);z<=Math.min(this.map.size-1,c.z+cells);z++)for(let x=Math.max(0,c.x-cells);x<=Math.min(this.map.size-1,c.x+cells);x++){
      const p={x:x*this.map.cell,z:z*this.map.cell},k=index(this.map,x,z);if(distance(source,p)<=radius&&lineOfSight(this.map,source,p)){this.explored[k]=1;this.visible[k]=1;}
    }}
    for(const b of this.map.bases)if(!viewer||sources.some(a=>distance(a,b.gate)<radius&&lineOfSight(this.map,a,b.gate))||(viewer.role==='elf'&&snapshot.structures.some(s=>s.baseId===b.id)))this.seenBases.add(b.id);
  }
  point(canvas,event){const r=canvas.getBoundingClientRect(),size=(this.map.size-1)*this.map.cell;return{x:Math.max(0,Math.min(size,(event.clientX-r.left)/r.width*size)),z:Math.max(0,Math.min(size,(event.clientY-r.top)/r.height*size))};}
  draw(canvas,focus){
    if(!canvas||!this.snapshot)return;
    const {snapshot:s,viewer:u,map:m}=this,ctx=canvas.getContext('2d'),w=canvas.width,k=w/((m.size-1)*m.cell),large=w>300;
    ctx.clearRect(0,0,w,w);ctx.fillStyle='#0b1c21';ctx.fillRect(0,0,w,w);
    // Cache the discovered terrain. An unexplored refuge never appears as an empty base marker.
    let bg=this.backgrounds.get(w);if(!bg){bg={canvas:document.createElement('canvas'),revision:-1};bg.canvas.width=bg.canvas.height=w;this.backgrounds.set(w,bg);}
    if(bg.revision!==this.revision){const c=bg.canvas.getContext('2d');c.clearRect(0,0,w,w);for(let z=0;z<m.size;z++)for(let x=0;x<m.size;x++){const i=index(m,x,z);if(!this.explored[i])continue;const light=this.visible[i],height=m.heights?.[i]||0;c.fillStyle=m.grid[i]?light?'#263c35':'#15282a':light?(height>1?'#7c8060':height< -1?'#4c7971':'#607869'):'#334844';c.fillRect((x-.5)*m.cell*k,(z-.5)*m.cell*k,m.cell*k+.5,m.cell*k+.5);}bg.revision=this.revision;}
    ctx.drawImage(bg.canvas,0,0);
    for(const b of m.bases){if(!this.seenBases.has(b.id))continue;ctx.fillStyle='#d7bf84';ctx.fillRect(b.gate.x*k-2,b.gate.z*k-2,4,4);if(large){ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText(b.name,b.x*k,(b.z-b.rz*m.cell-2)*k);ctx.fillStyle='#b6c7b9';ctx.font='9px sans-serif';ctx.fillText(`${b.profile} · ${b.height>0?'+':''}${b.height} m`,b.x*k,(b.z+b.rz*m.cell+4)*k);}}
    const ring=(p,r,color,dashed=false)=>{ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash(dashed?[4,3]:[]);ctx.beginPath();ctx.arc(p.x*k,p.z*k,r,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);};
    for(const e of s.structures){ctx.fillStyle=playerColor(e.owner).css;const r=e.kind==='core'?3:2;ctx.fillRect(e.x*k-r,e.z*k-r,r*2,r*2);}
    if(large)for(const worker of s.wisps||[]){ctx.fillStyle=worker.income>0?'#bbf7d1':'#8a9782';ctx.beginPath();ctx.arc(worker.x*k,worker.z*k,2.5,0,Math.PI*2);ctx.fill();}
    for(const a of s.alerts||[])ring(a,7+Math.sin(s.time*7)*2,'#ff765f');
    for(const a of s.units.filter(a=>a.alive)){
      if(a.role==='troll'){ring(a,large?12:8,'#ff795f');ctx.fillStyle='#ff795f';ctx.beginPath();ctx.moveTo(a.x*k,a.z*k-6);ctx.lineTo(a.x*k+6,a.z*k);ctx.lineTo(a.x*k,a.z*k+6);ctx.lineTo(a.x*k-6,a.z*k);ctx.closePath();ctx.fill();if(large){ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillText('TROLL',a.x*k,a.z*k-17);}}
      else {ctx.fillStyle=playerColor(a.id).css;ctx.beginPath();ctx.arc(a.x*k,a.z*k,a.id===u?.id?4:3,0,Math.PI*2);ctx.fill();if(large){ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText(a.name,a.x*k,a.z*k-9);}}
    }
    if(!s.units.some(a=>a.role==='troll'&&a.alive)&&this.lastTroll&&s.time-this.lastTroll.time<12){ctx.globalAlpha=1-(s.time-this.lastTroll.time)/15;ring(this.lastTroll,large?12:8,'#ffb198',true);ctx.font=`bold ${large?14:10}px sans-serif`;ctx.textAlign='center';ctx.fillStyle='#ffb198';ctx.fillText('?',this.lastTroll.x*k,this.lastTroll.z*k+4);ctx.globalAlpha=1;}
    for(const p of s.pings||[]){const color=p.kind==='danger'?'#ff826a':p.kind==='help'?'#88dbff':'#ffdc8e';ring(p,8+(s.time-p.time)%1*8,color);ctx.font='bold 14px sans-serif';ctx.textAlign='center';ctx.fillStyle=color;ctx.fillText(p.kind==='danger'?'!':p.kind==='help'?'+':'•',p.x*k,p.z*k+4);if(large){ctx.font='11px sans-serif';ctx.fillText(`${p.text} ${Math.ceil(p.until-s.time)}s`,p.x*k,p.z*k+25);}}
    if(u)ring(u,B.vision[u.role]*k,'#d6ffe525');
    if(focus){ctx.strokeStyle='#fff5d5';ctx.lineWidth=1;ctx.strokeRect(focus.x*k-9,focus.z*k-7,18,14);}
  }
}
