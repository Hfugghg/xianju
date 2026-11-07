import assert from 'node:assert/strict';
import fs from 'node:fs';
import { selectAction, isDifficulty } from '../web/arcade/src/games/mahjong/engine/policy.ts';

const scores=Array(235).fill(0),mask=Array(235).fill(false);
for(const [id,p] of [[2,.7],[4,.2],[7,.07],[9,.02],[12,.01]]){scores[id]=p;mask[id]=true;}
const pick=(difficulty,seed=42,step=5,seat=0)=>selectAction(scores,mask,difficulty,seed,step,seat);
assert.equal(pick('expert'),2);
assert.ok(!isDifficulty('hard')&&!isDifficulty(null));
assert.throws(()=>pick('hard'),/难度/);
let normalTop=0,easyTop=0,changed=0;
for(let seed=0;seed<10000;seed++){
 const normal=pick('normal',seed),easy=pick('easy',seed);
 assert.equal(normal,pick('normal',seed));assert.equal(easy,pick('easy',seed));
 assert.ok([2,4,7].includes(normal));assert.ok([2,4,7,9,12].includes(easy));
 normalTop+=normal===2;easyTop+=easy===2;changed+=easy!==normal;
}
assert.ok(normalTop>8300&&normalTop<8700,`normal top1 ${normalTop}`);
assert.ok(easyTop>4300&&easyTop<4700,`easy top1 ${easyTop}`);
assert.ok(changed>3500);
const tied=[...scores];tied[4]=.7;
assert.equal(selectAction(tied,mask,'expert',0,0,0),2);
const illegalHigh=[...scores];illegalHigh[200]=1;
assert.equal(selectAction(illegalHigh,mask,'expert',0,0,0),2);
const winMask=[...mask];winMask[1]=true;
for(const difficulty of ['easy','normal'])for(let seed=0;seed<100;seed++)assert.equal(selectAction(scores,winMask,difficulty,seed,0,0),1);
const only=Array(235).fill(false);only[9]=true;
for(const difficulty of ['easy','normal','expert'])assert.equal(selectAction(scores,only,difficulty,42,0,0),9);
const zeros=Array(235).fill(0);
for(let seed=0;seed<100;seed++)assert.ok(mask[selectAction(zeros,mask,'easy',seed,0,0)]);
assert.throws(()=>selectAction(scores,Array(235).fill(false),'expert',0,0,0),/合法/);
const broken=[...scores];broken[100]=NaN;
assert.throws(()=>selectAction(broken,mask,'easy',0,0,0),/输出/);
assert.throws(()=>selectAction(scores.slice(1),mask,'expert',0,0,0),/维度/);
let goldenCases=0;
if(process.argv[2]){
 const fixtures=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 for(const item of fixtures.cases){
  const expected=item.action;
  assert.equal(selectAction(item.logits,item.mask,'expert',42,0,0),expected);
  goldenCases++;
 }
}
console.log(JSON.stringify({status:'passed',normalTop1OutOf10000:normalTop,easyTop1OutOf10000:easyTop,differentChoices:changed,goldenCases}));
