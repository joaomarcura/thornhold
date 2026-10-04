import * as T from 'three';

// One precomputed, seamless sky texture. No volumetrics, reflection pass,
// per-frame noise evaluation, new lights or cloud particle simulation.
let texture,geometry;
export function createSky(){
  if(!texture){const w=512,h=256,data=new Uint8Array(w*h*4),top=new T.Color(0x32648d),horizon=new T.Color(0xb3c6c2),cloud=new T.Color(0xe8e4d2),pixel=new T.Color();
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=1-y/(h-1),a=x/w*Math.PI*2,alt=Math.max(0,.5-v),blend=Math.min(1,alt*2.6);pixel.copy(horizon).lerp(top,blend);
      const n=Math.sin(a*9+Math.cos(v*23)*1.7)*.35+Math.sin(a*17-v*47)*.22+Math.cos(a*31+v*83)*.13;
      const band=Math.exp(-(((v-.31)/.13)**2)),coverage=Math.max(0,Math.min(.82,(n+.1)*1.65))*band;pixel.lerp(cloud,coverage);
      const sunAngle=Math.atan2(Math.sin(a-1.1),Math.cos(a-1.1)),sun=Math.exp(-sunAngle*sunAngle*18-((v-.4)*20)**2);pixel.lerp(newSunColor,sun*.65);
      const k=(y*w+x)*4;data[k]=Math.round(pixel.r*255);data[k+1]=Math.round(pixel.g*255);data[k+2]=Math.round(pixel.b*255);data[k+3]=255;
    }
    texture=new T.DataTexture(data,w,h);texture.colorSpace=T.LinearSRGBColorSpace;texture.minFilter=T.LinearFilter;texture.magFilter=T.LinearFilter;texture.wrapS=T.RepeatWrapping;texture.needsUpdate=true;texture.userData.shared=true;geometry=new T.SphereGeometry(180,24,12);geometry.userData.shared=true;
  }
  const sky=new T.Mesh(geometry,new T.MeshBasicMaterial({map:texture,side:T.BackSide,depthWrite:false,fog:false,toneMapped:false}));sky.name='Céu · nuvens e horizonte';sky.renderOrder=-100;sky.frustumCulled=false;return sky;
}
const newSunColor=new T.Color(0xf5dab0);
