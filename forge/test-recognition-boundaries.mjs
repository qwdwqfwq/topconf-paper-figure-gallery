import assert from 'node:assert/strict';
import {alignRecognitionBoundaries} from './bitmap-evidence.mjs';

function fixture(background=255){
  const W=600,H=300,data=new Uint8ClampedArray(W*H*4).fill(255);
  for(let p=0;p<data.length;p+=4)data[p]=data[p+1]=data[p+2]=background;
  const fill=(x,y,w,h,value)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){
    const p=(yy*W+xx)*4;data[p]=data[p+1]=data[p+2]=value;
  }};
  return {W,H,fill,canvas:{getContext:()=>({getImageData:()=>({data})})}};
}
for(const background of [255,180]){
  const f=fixture(background);
  f.fill(20,20,270,260,30);f.fill(310,20,270,260,30);
  // The inventory cuts into the right panel; an arrow crosses its gutter.
  f.fill(290,145,20,7,30);
  const regions=[{id:'a',x:20,y:20,w:275,h:260,itemIds:['a']},{id:'b',x:330,y:20,w:250,h:260,itemIds:['b']}];
  const inventory={items:[{id:'a',kind:'panel'},{id:'b',kind:'panel'}]};
  const aligned=alignRecognitionBoundaries(f.canvas,regions,inventory,f.W,f.H);
  assert.equal(aligned[0].x+aligned[0].w,aligned[1].x,'neighbors share one source gutter');
  assert.ok(aligned[1].x>=290&&aligned[1].x<=310,'crossing connector must not hide the gutter');
  assert.ok(aligned[1].x<regions[1].x,'restore the strip clipped by inventory');
  assert.ok(aligned[0].x<=20&&aligned[1].x+aligned[1].w>=580,'retain outer source content');
  assert.deepEqual(alignRecognitionBoundaries(f.canvas,regions,{items:[]},f.W,f.H),regions,'unboxed diagrams are not snapped');
}
const f=fixture();f.fill(0,0,600,300,30);
const region=[{id:'a',x:50,y:50,w:500,h:200,itemIds:['a']}];
assert.deepEqual(alignRecognitionBoundaries(f.canvas,region,{items:[{id:'a',kind:'panel'}]},600,300),region,'no reliable corridor leaves the estimate intact');
assert.deepEqual(alignRecognitionBoundaries({getContext:()=>null},region,{items:[]},600,300),region);
console.log('PASS source boundary alignment');
