import assert from 'node:assert/strict';
import {uncoveredRecognitionRegions,sourceCoverageRecovery,recognitionCoverageGaps,nativeLayoutRecognitionPrompt} from './bitmap-evidence.mjs';

// Small gutters must remain explicitly owned by the global task even when
// they are too narrow to justify another model request.
const gutterPlan=[{x:30,y:0,w:470,h:1000},{x:500,y:0,w:500,h:1000}];
assert.deepEqual(recognitionCoverageGaps(gutterPlan,1000,1000),[{x:0,y:0,w:30,h:1000}]);
assert.deepEqual(uncoveredRecognitionRegions(gutterPlan,1000,1000,()=>true),[]);
assert.ok(nativeLayoutRecognitionPrompt(1000,1000,{items:[]},gutterPlan).includes('{"x":0,"y":0,"w":30,"h":1000}'));
assert.deepEqual(recognitionCoverageGaps([{x:0,y:0,w:1000,h:1000}],1000,1000),[]);

// A truncated right panel used to escape every regional inspection. Its lower
// half must get its own owner even when neighboring panels split the gaps.
const plan=[{id:'left',x:0,y:0,w:600,h:1000},{id:'right',x:650,y:0,w:350,h:450}];
const missing=uncoveredRecognitionRegions(plan,1000,1000,g=>g.x>=600&&g.y>=450);
assert.equal(missing.length,1);
assert.deepEqual(missing[0],{x:600,y:450,w:400,h:550,id:'uncovered-1',itemIds:[],coverageRecovery:true});
for(const g of missing){
  assert.ok(g.x>=0&&g.y>=0&&g.x+g.w<=1000&&g.y+g.h<=1000);
  for(const r of plan)assert.ok(g.x>=r.x+r.w||g.x+g.w<=r.x||g.y>=r.y+r.h||g.y+g.h<=r.y);
}
assert.deepEqual(uncoveredRecognitionRegions(plan,1000,1000,()=>false),[],'flat gutters need no extra requests');
assert.deepEqual(uncoveredRecognitionRegions([],1000,1000,()=>true),[],'whole-image fallback already owns the complete source');
assert.deepEqual(uncoveredRecognitionRegions([{x:0,y:0,w:1000,h:1000}],1000,1000,()=>true),[]);
const split=[{x:0,y:0,w:600,h:500},{x:0,y:500,w:600,h:500},{x:650,y:0,w:350,h:450}];
assert.equal(uncoveredRecognitionRegions(split,1000,1000,g=>g.x>=600&&g.y>=450)[0].h,550,'unrelated seams must not fragment missing content');
const pixels=new Uint8ClampedArray(1000*1000*4).fill(255);
const canvas={getContext:()=>({getImageData:()=>({data:pixels})})};
assert.deepEqual(sourceCoverageRecovery(canvas,plan,1000,1000),[],'white gutters must not create extra workers');
for(let y=500;y<900;y++)for(let x=700;x<950;x++){
  const p=(y*1000+x)*4,ink=(Math.floor(x/12)+Math.floor(y/12))%2?0:220;
  pixels[p]=pixels[p+1]=pixels[p+2]=ink;
}
assert.equal(sourceCoverageRecovery(canvas,plan,1000,1000).length,1,'uncovered diagram ink needs an explicit worker');
assert.deepEqual(sourceCoverageRecovery({getContext:()=>null},plan,1000,1000),[],'non-pixel test adapters remain supported');
console.log('PASS source coverage ownership');

