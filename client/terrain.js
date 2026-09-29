import * as T from 'three';
import { baseZone, heightAt, walkable, index } from '../shared/map.js';

// Vertex heights and diagonal agree with heightAt(), including raycast hit positions.
export function terrainMesh(map){
  const positions=[],colors=[],indices=[],color=new T.Color();
  const styles={woodland:{openHue:.105,openSat:.18,openLight:.30,blockedHue:.36,blockedLight:.17},deepForest:{openHue:.34,openSat:.22,openLight:.22,blockedHue:.38,blockedLight:.12},crossroads:{openHue:.12,openSat:.14,openLight:.34,blockedHue:.31,blockedLight:.2}},style=styles[map.style]||styles.woodland;
  for(let z=0;z<map.size;z++)for(let x=0;x<map.size;x++){
    const y=heightAt(map,x*map.cell,z*map.cell),open=walkable(map,x,z);
    const b=map.bases.find(b=>Math.abs(x-b.cx)<b.rx&&Math.abs(z-b.cz)<b.rz),zone=b&&open?baseZone(map,b,{x:x*map.cell,z:z*map.cell}):null;
    const noise=((x*73+z*179)%17)/17;
    // Lowlands are cool moss; raised clearings are dry grass. Paths remain legible.
    const zoneHue=zone==='frontline'?.12:zone==='industrial'?.19:zone==='core'?.28:null;
    const elevationTint=Math.max(-.035,Math.min(.045,y*.006));
    color.setHSL(open?(b?(zoneHue??(y<-.5?.39:.25)):style.openHue):style.blockedHue,open?(b?.22:style.openSat):.19,open?(b?.27:style.openLight)+noise*.025+elevationTint:style.blockedLight+noise*.025+elevationTint);
    positions.push(x*map.cell,y,z*map.cell);colors.push(color.r,color.g,color.b);
    if(x<map.size-1&&z<map.size-1){const a=index(map,x,z),b=a+1,c=a+map.size,d=c+1;indices.push(a,d,b,a,c,d);}
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new T.Mesh(geometry,new T.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true}));mesh.receiveShadow=true;mesh.userData.disposeGeometry=true;mesh.userData.disposeMaterial=true;return mesh;
}

// Drape tactical rings over slopes instead of cutting through the earth.
export function groundRing(mesh,map,x,z,radius,width=.07){
  const count=80,positions=[],indices=[];
  for(let i=0;i<=count;i++)for(const r of [radius-width,radius]){const angle=i/count*Math.PI*2,px=x+Math.cos(angle)*r,pz=z+Math.sin(angle)*r;positions.push(px,heightAt(map,px,pz)+.075,pz);}
  for(let i=0;i<count;i++){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  mesh.geometry.dispose();mesh.geometry=new T.BufferGeometry();mesh.geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));mesh.geometry.setIndex(indices);mesh.rotation.set(0,0,0);mesh.position.set(0,0,0);
}
