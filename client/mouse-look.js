// Pointer lock is acquired only from a real click/key gesture.
export class MouseLook {
  constructor(canvas,world,onChange,onError){
    this.canvas=canvas;this.world=world;this.onChange=onChange;this.onError=onError;this.started=false;this.pending=false;
    document.addEventListener('pointerlockchange',()=>{this.pending=false;world.aiming=this.locked;onChange();});
    document.addEventListener('pointerlockerror',()=>{this.pending=false;this.started=false;onError('Clique no cenário para ativar novamente a mira travada.');});
  }
  get locked(){return document.pointerLockElement===this.canvas;}
  async capture(){
    if(this.locked||this.pending)return;
    this.pending=true;this.started=true;
    try{await this.canvas.requestPointerLock();}catch{this.pending=false;this.started=false;this.onError('O navegador não liberou a câmera. Clique novamente no cenário.');}
  }
  release(){if(this.locked)document.exitPointerLock();this.world.aiming=false;}
  reset(){this.release();this.started=false;}
  move(event){if(!this.locked)return false;this.world.yaw+=event.movementX*.003;this.world.pitch=Math.max(.12,Math.min(1.22,this.world.pitch+event.movementY*.0025));return true;}
}
