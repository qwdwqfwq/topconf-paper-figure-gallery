import assert from 'node:assert/strict';
import {orderSourceBackdrops} from './reconstruction-pipeline.mjs';
const W=100,H=100,pixels=new Uint8ClampedArray(W*H*4).fill(255);
for(let y=20;y<80;y++)for(let x=20;x<80;x++){if(Math.abs(x-y)<4){const i=(y*W+x)*4;pixels[i]=196;pixels[i+1]=44;pixels[i+2]=37;}}
const canvas={width:W,height:H,getContext:()=>({getImageData:()=>({data:pixels})})};
const cross={id:'cross',owner:'table',type:'line',x:25,y:25,x2:75,y2:75,stroke:'#c42c25'};
const box={id:'cell',owner:'table',type:'rect',x:10,y:10,w:80,h:80,fill:'#eef4e6',stroke:'none'};
const scene={nodes:[cross,box]};
assert.deepEqual(orderSourceBackdrops(scene,canvas).nodes.map(n=>n.id),['cell','cross']);
assert.deepEqual(orderSourceBackdrops({nodes:[{...cross,owner:'other'},box]},canvas).nodes.map(n=>n.id),['cross','cell']);
assert.deepEqual(orderSourceBackdrops({nodes:[{...cross,stroke:'#0000ff'},box]},canvas).nodes.map(n=>n.id),['cross','cell']);
const repaired=orderSourceBackdrops(scene,canvas);
assert.deepEqual(orderSourceBackdrops(repaired,canvas),repaired);
console.log('Backdrop ordering: source-supported ink, ownership, intentional cover and idempotence passed');
