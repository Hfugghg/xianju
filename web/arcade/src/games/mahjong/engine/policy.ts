import type { Difficulty } from './types';

export function isDifficulty(value:unknown):value is Difficulty {
 return value==='easy'||value==='normal'||value==='expert';
}

// Separate from the tile-wall RNG. A replay records the actual selected actions.
function randomFor(seed:number,step:number,seat:number,difficulty:Difficulty):number {
 let state=(seed^Math.imul(step+1,0x9e3779b9)^Math.imul(seat+1,0x85ebca6b)^(difficulty==='easy'?0x12345678:0x76543210))>>>0;
 state=Math.imul(state^(state>>>16),0x21f0aaad);
 state=Math.imul(state^(state>>>15),0x735a2d97);
 return ((state^(state>>>15))>>>0)/4294967296;
}

export function selectAction(scores:ArrayLike<number>,mask:ArrayLike<number|boolean>,difficulty:Difficulty,seed:number,step:number,seat:number):number {
 if(!isDifficulty(difficulty))throw new Error('未知 AI 难度');
 if(scores.length!==235||mask.length!==235)throw new Error('模型输出维度异常');
 const legal:number[]=[];
 for(let i=0;i<235;i++){
  if(!Number.isFinite(scores[i]))throw new Error('模型输出异常');
  if(mask[i])legal.push(i);
 }
 if(!legal.length)throw new Error('模型没有合法动作');
 legal.sort((a,b)=>scores[b]-scores[a]||a-b);
 if(difficulty==='expert'||legal.length===1)return legal[0];
 if(mask[1])return 1;
 // Model outputs are probabilities, not logits. Preserve top-1 most of the
 // time; otherwise sample model-weighted alternatives, without another softmax.
 const keep=difficulty==='normal'?0.85:0.45;
 const draw=randomFor(seed,step,seat,difficulty);
 if(draw<keep)return legal[0];
 const alternatives=legal.slice(1,difficulty==='normal'?3:5);
 const weights=alternatives.map(action=>Math.max(0,scores[action]));
 const total=weights.reduce((sum,value)=>sum+value,0);
 let target=(draw-keep)/(1-keep)*(total||alternatives.length);
 for(let i=0;i<alternatives.length;i++){
  target-=total?weights[i]:1;
  if(target<0)return alternatives[i];
 }
 return alternatives[alternatives.length-1];
}
