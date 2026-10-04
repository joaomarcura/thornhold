import * as T from 'three';

const geometries={
  box:new T.BoxGeometry(1,1,1),
  cylinder:new T.CylinderGeometry(1,1,1,7),
  cone:new T.ConeGeometry(1,1,7),
  sphere:new T.IcosahedronGeometry(1,0),
  ring:new T.TorusGeometry(1,.12,4,8)
};
for(const geometry of Object.values(geometries))geometry.userData.shared=true;
const materials=new Map();
const material=(color,metalness=0)=>{
  const key=`${color}:${metalness}`;
  if(!materials.has(key)){const value=new T.MeshStandardMaterial({color,roughness:.72,metalness});value.userData.shared=true;materials.set(key,value);}
  return materials.get(key);
};
const part=(root,{shape='box',color,position,scale,rotation=[0,0,0],metalness=0})=>{
  const mesh=new T.Mesh(geometries[shape],material(color,metalness));mesh.position.set(...position);mesh.scale.set(...scale);mesh.rotation.set(...rotation);mesh.castShadow=true;mesh.renderOrder=50;root.add(mesh);return mesh;
};

// One visual source is used by the world model, loadout preview and first-person
// viewmodel. A null weapon deliberately means the starter club, never the maul.
export const HELD_ITEM_DEFINITIONS={
  club:{label:'Porrete ancestral',parts:[
    {shape:'cylinder',color:0x614832,position:[0,.05,0],scale:[.1,.9,.1]},
    {shape:'box',color:0x817d73,position:[0,.92,0],scale:[.58,.52,.48]},
    {shape:'cone',color:0xc0b28e,position:[-.28,1.2,0],scale:[.13,.34,.13],rotation:[0,0,.35]},
    {shape:'cone',color:0xc0b28e,position:[.28,1.2,0],scale:[.13,.34,.13],rotation:[0,0,-.35]}
  ]},
  maul:{label:'Machado Quebra-Muralha',parts:[
    {shape:'cylinder',color:0x4e3828,position:[0,-.02,0],scale:[.12,1.14,.12]},
    {shape:'box',color:0x8f9691,position:[-.18,1.18,0],scale:[.78,.55,.2],metalness:.5},
    {shape:'cone',color:0xd5dbd5,position:[.46,1.18,0],scale:[.72,.82,.2],rotation:[0,0,-Math.PI/2],metalness:.78},
    {shape:'cone',color:0x9ca49e,position:[-.66,1.18,0],scale:[.32,.45,.18],rotation:[0,0,Math.PI/2],metalness:.65},
    {shape:'box',color:0xd2b77a,position:[0,.36,0],scale:[.2,.1,.2],metalness:.35}
  ]},
  claws:{label:'Escopeta do Predador',parts:[
    {shape:'box',color:0x343b3d,position:[0,.28,0],scale:[.46,.78,.3],metalness:.6},
    {shape:'cylinder',color:0xaab8b5,position:[-.14,.94,.03],scale:[.085,.88,.085],metalness:.8},
    {shape:'cylinder',color:0xaab8b5,position:[.14,.94,.03],scale:[.085,.88,.085],metalness:.8},
    {shape:'box',color:0x65462d,position:[0,-.3,-.02],scale:[.2,.52,.22]},
    {shape:'box',color:0x85c6b4,position:[0,.46,.18],scale:[.24,.16,.08],metalness:.45},
    {shape:'cone',color:0xc4cfca,position:[0,1.82,.02],scale:[.24,.32,.18],metalness:.75}
  ]},
  edge:{label:'Cajado Hemático',parts:[
    {shape:'cylinder',color:0x49362d,position:[0,.25,0],scale:[.1,1.3,.1]},
    {shape:'cone',color:0x76605b,position:[-.22,1.38,0],scale:[.15,.62,.15],rotation:[0,0,.52],metalness:.25},
    {shape:'cone',color:0x76605b,position:[.22,1.38,0],scale:[.15,.62,.15],rotation:[0,0,-.52],metalness:.25},
    {shape:'sphere',color:0xb96f85,position:[0,1.6,0],scale:[.36,.46,.36],metalness:.22},
    {shape:'sphere',color:0xf0c3ce,position:[0,1.6,.05],scale:[.14,.19,.14],metalness:.5}
  ]},
  elfAxe:{label:'Machado de coleta',parts:[
    {shape:'cylinder',color:0x674c35,position:[0,.05,0],scale:[.075,.62,.075]},
    {shape:'box',color:0xaab3ad,position:[-.13,.67,0],scale:[.38,.18,.11],metalness:.65},
    {shape:'cone',color:0xcbd2cc,position:[.22,.67,0],scale:[.3,.38,.12],rotation:[0,0,-Math.PI/2],metalness:.72}
  ]},
  elfHammer:{label:'Martelo de construção',parts:[
    {shape:'cylinder',color:0x674c35,position:[0,.02,0],scale:[.06,.62,.06]},
    {shape:'box',color:0x7e9695,position:[0,.64,0],scale:[.4,.23,.2],metalness:.7},
    {shape:'cylinder',color:0xd3d7c7,position:[.23,.64,0],scale:[.13,.09,.13],rotation:[0,0,Math.PI/2],metalness:.85},
    {shape:'box',color:0xd0af6b,position:[0,.64,.104],scale:[.1,.13,.014],metalness:.55},
    {shape:'cylinder',color:0x334943,position:[0,-.12,0],scale:[.075,.28,.075]},
    {shape:'ring',color:0xd0af6b,position:[0,.1,0],scale:[.064,.064,.064],rotation:[Math.PI/2,0,0],metalness:.6}
  ]},
  elfRod:{label:'Vara da praia',parts:[
    {shape:'cylinder',color:0x674c35,position:[0,-.08,0],scale:[.035,.28,.035]},
    {shape:'cylinder',color:0x44646a,position:[0,.7,0],scale:[.016,1.45,.016]},
    {shape:'cylinder',color:0xb0c6b7,position:[.065,-.06,0],scale:[.07,.09,.07],rotation:[0,0,Math.PI/2],metalness:.65},
    {shape:'box',color:0xd2b46b,position:[.1,-.13,0],scale:[.035,.14,.025],metalness:.6},
    {shape:'sphere',color:0x4a655d,position:[.1,-.21,0],scale:[.045,.03,.04]},
    {shape:'ring',color:0xc7cbb0,position:[0,.15,0],scale:[.025,.025,.025],rotation:[Math.PI/2,0,0],metalness:.7}
  ]}
};

export function heldItemKey(role,equipment={},tool=''){
  if(role==='troll')return equipment.weapon||'club';
  if(tool==='fishing')return 'elfRod';
  return ['gather','gatherSpecial'].includes(tool)?'elfAxe':'elfHammer';
}

export function createHeldItem(role,equipment={},tool='',visualLevel=1){
  const key=heldItemKey(role,equipment,tool),definition=HELD_ITEM_DEFINITIONS[key]||HELD_ITEM_DEFINITIONS.club,root=new T.Group();
  for(const value of definition.parts)part(root,value);
  if(key==='elfRod'){
    const shaft=root.children[1],geometry=new T.CylinderGeometry(.01,.018,1.45,5,8);shaft.geometry=geometry;shaft.scale.set(1,1,1);
    root.userData.shaft=shaft;root.userData.shaftRest=Float32Array.from(geometry.attributes.position.array);root.userData.tip=new T.Vector3(0,1.425,0);root.userData.bend=0;
    root.userData.guides=[];for(const y of [.38,.76,1.12,1.39]){const guide=part(root,{shape:'ring',color:0xc7cbb0,position:[0,y,.025],scale:[.026,.026,.026],metalness:.7});root.userData.guides.push(guide);}
    root.traverse(o=>{if(o.isMesh)o.castShadow=false;});
  }
  const level=Math.max(1,Math.min(5,visualLevel||1));
  if(role==='troll'&&key!=='club'&&level>1){
    const rarityColors=[0x8fa19b,0x7fd8bc,0x79bfe8,0xe3bc63,0xb78aff],accent=rarityColors[level-1];
    for(let i=0;i<level-1;i++)part(root,{shape:'box',color:accent,position:[0,-.35+i*.3,.13],scale:[.18,.065,.06],metalness:.62});
    if(level>=4)part(root,{shape:'sphere',color:accent,position:[0,1.52,.16],scale:[.11,.16,.1],metalness:.75});
    if(level>=5){part(root,{shape:'cone',color:0xe9e3ff,position:[-.18,1.72,.02],scale:[.09,.3,.09],rotation:[0,0,.38],metalness:.8});part(root,{shape:'cone',color:0xe9e3ff,position:[.18,1.72,.02],scale:[.09,.3,.09],rotation:[0,0,-.38],metalness:.8});}
  }
  root.userData.heldItemKey=key;root.userData.label=definition.label;root.userData.visualLevel=level;
  return root;
}

export function bendRod(rod,amount){
  if(!rod?.userData.shaft||Math.abs(amount-rod.userData.bend)<.002)return;
  const position=rod.userData.shaft.geometry.attributes.position,rest=rod.userData.shaftRest;
  for(let i=0;i<position.count;i++){const p=(rest[i*3+1]+.725)/1.45;position.setX(i,rest[i*3]+amount*p*p);}
  position.needsUpdate=true;rod.userData.bend=amount;rod.userData.tip.x=amount;
  for(const guide of rod.userData.guides||[])guide.position.x=amount*((guide.position.y-.7+.725)/1.45)**2;
}
