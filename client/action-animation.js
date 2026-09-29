import { BALANCE as B } from '../shared/config.js';
import { attackTimeline } from './attack-timeline.js';

function recoveryFor(kind){if(kind==='heavy')return B.combat.heavyVisualRecovery;if(kind==='repair')return .38;if(kind==='gather'||kind==='gatherSpecial')return .3;return B.combat.lightVisualRecovery;}

export class ActionAnimationController{
  constructor(){this.actions=new Map();this.debug=false;this.debugEntries=[];}
  reset(){this.actions.clear();this.debugEntries.length=0;}
  setDebug(enabled){this.debug=!!enabled;}
  log(message,data={}){
    const entry={message,...data};this.debugEntries.push(entry);if(this.debugEntries.length>80)this.debugEntries.shift();
    if(this.debug&&globalThis.console?.debug)console.debug(`[animation] ${message}`,data);
  }
  predict(unit,kind,now,{windup,target=null}={}){
    const current=this.actions.get(unit);if(current&&now-current.startedAt<current.duration)return current;
    const resolvedWindup=windup??(kind==='heavy'?B.combat.heavyWindup:kind==='light'?B.combat.lightWindup:.2),recovery=recoveryFor(kind);
    const action={unit,attackId:null,kind,startedAt:now,windup:resolvedWindup,recovery,duration:resolvedWindup+recovery,target,predicted:true,impactReceived:false,finished:false};
    this.actions.set(unit,action);this.log(`AttackStarted: ${kind}`,{unit,predicted:true,impactAt:`${resolvedWindup.toFixed(2)}s`});return action;
  }
  consume(event,now,serverNow,cameraMode='thirdPerson'){
    if(event.type!=='attack-animation')return null;
    const kind=event.kind||'light',serverAge=Math.max(0,(serverNow??event.time)-event.startedAt),localStartedAt=now-Math.min(serverAge,(event.windup||0)+(event.recovery||0));
    if(event.phase==='started'){
      const current=this.actions.get(event.unit),reconcile=current&&!current.attackId&&current.kind===kind&&now-current.startedAt<.45;
      const action=reconcile?current:{unit:event.unit,startedAt:localStartedAt,target:null,predicted:false};
      Object.assign(action,{attackId:event.attackId,kind,windup:event.windup,recovery:event.recovery,duration:event.windup+event.recovery,finished:false});
      if(!reconcile)action.startedAt=localStartedAt;this.actions.set(event.unit,action);
      this.log(`AttackStarted: ${kind}`,{unit:event.unit,attackId:event.attackId,cameraMode,viewmodelAnimation:`${kind}_attack`,impactAt:`${event.windup.toFixed(2)}s`,reconciled:reconcile});return action;
    }
    let action=this.actions.get(event.unit);
    if(!action||action.attackId!==event.attackId){action={unit:event.unit,attackId:event.attackId,kind,startedAt:localStartedAt,windup:event.windup,recovery:event.recovery,duration:event.windup+event.recovery,predicted:false,target:event.entity||null};this.actions.set(event.unit,action);}
    if(event.phase==='impact'){action.impactReceived=true;action.target=event.entity||null;this.log(`AttackImpact: ${kind}`,{unit:event.unit,attackId:event.attackId,cameraMode,hit:!!event.hit,impactAt:`${event.windup.toFixed(2)}s`});}
    if(event.phase==='finished'){action.finished=true;action.finishReason=event.reason||'completed';this.log(`AttackFinished: ${kind}`,{unit:event.unit,attackId:event.attackId,cameraMode,reason:action.finishReason});}
    return action;
  }
  confirmWork(unit,kind,target,now,windup=(kind==='repair' ? .28 : .2)){
    const current=this.actions.get(unit);
    if(current&&current.kind===kind&&now-current.startedAt<current.duration){current.startedAt=now-windup;current.target=target;current.impactReceived=true;return current;}
    const action={unit,attackId:null,kind,startedAt:now-windup,windup,recovery:recoveryFor(kind),duration:windup+recoveryFor(kind),target,predicted:false,impactReceived:true,finished:false};this.actions.set(unit,action);return action;
  }
  cancel(unit,reason='cancelled'){
    const action=this.actions.get(unit);if(!action)return;action.finished=true;action.finishReason=reason;this.log(`AttackFinished: ${action.kind}`,{unit,attackId:action.attackId,reason});
  }
  get(unit,now){
    const action=this.actions.get(unit);if(!action)return null;if(action.finished){this.actions.delete(unit);return null;}const age=now-action.startedAt,timeline=attackTimeline(age,action.windup,action.kind);
    if(!timeline.active){this.actions.delete(unit);return null;}
    return {...action,age,timeline};
  }
}
