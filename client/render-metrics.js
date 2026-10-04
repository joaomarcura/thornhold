// CPU submission is not GPU execution. Keep their samples separate and never
// synchronously wait for GPU results (no finish/readPixels/query busy-wait).
export class CostMetrics {
  constructor(size=120){this.size=size;this.stages=new Map();}
  clear(stage){this.stages.delete(stage);}
  record(stage,ms){if(!Number.isFinite(ms)||ms<0)return;let s=this.stages.get(stage);if(!s){s={values:new Float64Array(this.size),count:0,cursor:0};this.stages.set(stage,s);}s.values[s.cursor]=ms;s.cursor=(s.cursor+1)%this.size;s.count=Math.min(this.size,s.count+1);}
  summary(){return Object.fromEntries([...this.stages].map(([key,s])=>{const v=Array.from(s.values.subarray(0,s.count)).sort((a,b)=>a-b);return [key,{p50:+v[Math.floor((v.length-1)*.5)].toFixed(2),p95:+v[Math.floor((v.length-1)*.95)].toFixed(2),max:+v.at(-1).toFixed(2),samples:s.count}];}));}
}

export class GpuTimer {
  constructor(gl,costs){this.gl=gl;this.costs=costs;this.extension=gl.getExtension('EXT_disjoint_timer_query_webgl2');this.pending=[];this.active=null;this.frame=0;this.sample=false;this.disjoint=false;}
  beginFrame(){this.frame++;this.sample=this.frame%12===0;this.poll();}
  begin(stage){if(!this.extension||!this.sample||this.active||this.pending.length>=6||this.disjoint)return false;const query=this.gl.createQuery();if(!query)return false;this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT,query);this.active={query,stage};return true;}
  end(){if(!this.active)return;this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);this.pending.push(this.active);this.active=null;}
  poll(){if(!this.extension||(!this.pending.length&&!this.sample))return;const gl=this.gl;this.disjoint=gl.getParameter(this.extension.GPU_DISJOINT_EXT);if(this.disjoint){this.costs.clear('sceneGpu');this.costs.clear('shadowGpu');}for(let i=this.pending.length-1;i>=0;i--){const p=this.pending[i];if(this.disjoint||gl.getQueryParameter(p.query,gl.QUERY_RESULT_AVAILABLE)){if(!this.disjoint)this.costs.record(p.stage,gl.getQueryParameter(p.query,gl.QUERY_RESULT)/1e6);gl.deleteQuery(p.query);this.pending.splice(i,1);}}}
}

export async function compilePresentation(renderer,objects,camera,scene){
  // Compile all visible/hidden construction variants under real scene lights.
  // Work is asynchronous; callers gate gameplay, not the render loop.
  await renderer.compileAsync(objects,camera,scene);
}
