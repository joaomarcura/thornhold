import { BALANCE as B } from './config.js';

export const matchClockRate=(devSpeed=1)=>B.gameSpeed*Math.max(1,Number.isFinite(Number(devSpeed))?Number(devSpeed):1);

// Fractional rates accumulate whole fixed physics steps; no enlarged dt and
// no lost fraction when switching DEV speed. Wall time stays separately known.
export class FixedStepClock {
  constructor(){this.remainder=0;}
  steps(rate,maxSteps=Infinity){this.remainder+=rate;const count=Math.min(maxSteps,Math.floor(this.remainder+1e-9));this.remainder-=count;return count;}
}
