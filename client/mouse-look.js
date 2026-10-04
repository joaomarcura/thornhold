// Pointer lock is acquired only from a real click/key gesture.
export class MouseLook {
  constructor(canvas,world,onChange,onError){
    this.canvas=canvas;this.world=world;this.onChange=onChange;this.onError=onError;this.started=false;this.pending=false;this.freeCursor=false;
    document.addEventListener('pointerlockchange',()=>{this.pending=false;if(this.locked&&this.freeCursor){document.exitPointerLock();return;}world.aiming=this.locked;onChange(this.locked);});
    document.addEventListener('pointerlockerror',()=>{this.pending=false;this.started=false;onError('Clique no cenário para ativar novamente a mira travada.');});
  }
  get locked(){return document.pointerLockElement===this.canvas;}
  async capture(){
    if(this.locked||this.pending)return;
    this.freeCursor=false;
    this.pending=true;this.started=true;
    try{await this.canvas.requestPointerLock();}catch{this.pending=false;this.started=false;this.onError('O navegador não liberou a câmera. Clique novamente no cenário.');}
  }
  release(){if(this.locked)document.exitPointerLock();this.world.aiming=false;}
  releaseForUI(){this.freeCursor=true;this.release();}
  reset(){this.release();this.started=false;this.freeCursor=false;}
  move(event){if(!this.locked)return false;this.world.yaw+=event.movementX*.003;const min=this.world.freeCamera?-1.25:this.world.isFirstPerson?.()?-1.05:-.3,max=this.world.freeCamera?1.25:1.22;this.world.pitch=Math.max(min,Math.min(max,this.world.pitch+event.movementY*.0025));return true;}
}
