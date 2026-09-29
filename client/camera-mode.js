export const CAMERA_LIMITS=Object.freeze({first:1.2,transition:4.2,third:13,min:0,max:23});

export function normalizeCameraMode(value){return value==='third'?'third':'first';}
export function initialCameraZoom(mode){return normalizeCameraMode(mode)==='first'?CAMERA_LIMITS.first:CAMERA_LIMITS.third;}
export function firstPersonBlend(zoom){
  const t=Math.max(0,Math.min(1,(CAMERA_LIMITS.transition-Number(zoom))/(CAMERA_LIMITS.transition-CAMERA_LIMITS.first)));
  return t*t*(3-2*t);
}
export function adjustCameraZoom(zoom,delta){return Math.max(CAMERA_LIMITS.min,Math.min(CAMERA_LIMITS.max,Number(zoom)+Number(delta)*.01));}

