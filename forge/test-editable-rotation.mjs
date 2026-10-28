import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {editableShapeFrame,geometrySegments,buildNativePptx,parseEditablePath,expandEditableTextPaths} from './editable-native.mjs';
import {editableNodeBounds,extractEditableNodes} from './reconstruction-core.mjs';
import {expandStructuredNodes} from './reconstruction-pipeline.mjs';
import {layoutEditableText} from './editable-text-layout.mjs';

const html=await readFile(new URL('./index.html',import.meta.url),'utf8');
const section=(start,end)=>{
  const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,`Missing browser function ${start}`);
  return html.slice(a,b);
};
const context=vm.createContext({editableShapeFrame,geometrySegments,parseEditablePath,
  expandEditableTextPaths,extractEditableNodes,expandStructuredNodes,layoutEditableText,
  TextEncoder,Uint8Array,Uint32Array,DataView,Blob,Date,atob,btoa,
  EXPORT_CANVAS:{w:1200,h:675},PT_PER_UNIT:.6});
vm.runInContext([
  section('function xmlEscape(value)','function rasterToExportSvg(src)'),
  section('function escapeSvgAttr(value)','function xmlEscape(value)'),
  section('function sceneNumber(v, fallback)','function parseEditableSceneResponse'),
  section('function sceneToSvgString(scene)','// Render the actual editable SVG'),
  section('function exportColor(value, fallback)','/* ---------- text-free base'),
  'globalThis.api={materializeEditableScene,sceneToSvgString,zipStore};'
].join('\n'),context);
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6mAAAAABJRU5ErkJggg==';
const source=[
  {type:'rect',x:10,y:20,w:100,h:20,rotation:90},
  {type:'ellipse',x:150,y:20,w:70,h:30,angle:18},
  {type:'path',d:'M 10 100 C 30 80 50 120 70 100',rotate:-25},
  {type:'polyline',points:'100,100 150,100 125,140',rotation:45},
  {type:'line',x:200,y:100,x2:250,y2:120,rotation:30},
  {type:'image',x:300,y:20,w:50,h:30,rotation:12,href:png}
].map(n=>({...n,fill:'123456',stroke:'none'}));
const scene=context.api.materializeEditableScene({nodes:source},1200,675);
assert.equal(scene.nodes.length,source.length);
assert.deepEqual(Array.from(scene.nodes,n=>n.rotation),[90,18,-25,45,30,12]);
const b=editableNodeBounds(scene.nodes[0]);
for(const [key,value] of Object.entries({x:50,y:-20,right:70,bottom:80}))
  assert.ok(Math.abs(b[key]-value)<1e-9,`Rotated bounds ${key}`);
assert.deepEqual(editableShapeFrame(scene.nodes[2]),{x:10,y:80,w:60,h:40});
const svg=context.api.sceneToSvgString(scene);
assert.match(svg,/<g transform="rotate\(90 60 30\)">/);
assert.match(svg,/<g transform="rotate\(-25 40 100\)">/);
assert.equal((svg.match(/<g transform="rotate/g)||[]).length,6);
assert.equal((svg.match(/<\/g>/g)||[]).length,6);
globalThis.fetch=async()=>({ok:true,json:async()=>JSON.parse(await readFile(new URL('./pptx-template.json',import.meta.url),'utf8'))});
const pptx=await buildNativePptx(scene,context.api.zipStore);
const xml=Buffer.from(await pptx.arrayBuffer()).toString('utf8');
for(const angle of [90,18,-25,45,30,12])
  assert.ok(xml.includes(`<a:xfrm rot="${angle*60000}">`),`PPTX rotation ${angle}`);
console.log('Editable rotation survives model normalization, SVG, PPTX and repair bounds.');

const dashScene=context.api.materializeEditableScene({nodes:[
  {type:'rect',x:10,y:10,w:80,h:30,dash:[12,6]},
  {type:'ellipse',x:100,y:10,w:80,h:30,strokeDasharray:'3, 2, 1'},
  {type:'line',x:10,y:80,x2:90,y2:80,dash:true},
  {type:'path',d:'M 10 100 L 90 100',dash:[0,4]},
  ...[[],[0,0],[-1,2],[Infinity,2],['bad',2]].map((dash,i)=>({type:'rect',x:200+i*90,y:10,w:80,h:30,dash}))
].map(n=>({...n,stroke:'000000',strokeWidth:2,fill:'none'}))},1200,675);
assert.deepEqual(Array.from(dashScene.nodes[0].dash),[12,6]);
const dashSvg=context.api.sceneToSvgString(dashScene);
assert.match(dashSvg,/stroke-dasharray="12 6"/);
assert.match(dashSvg,/stroke-dasharray="3 2 1"/);
assert.match(dashSvg,/stroke-dasharray="0 4"/);
assert.equal((dashSvg.match(/stroke-dasharray=/g)||[]).length,4);
const dashXml=Buffer.from(await (await buildNativePptx(dashScene,context.api.zipStore)).arrayBuffer()).toString('utf8');
assert.match(dashXml,/<a:custDash><a:ds d="600000" sp="300000"\/><\/a:custDash>/);
assert.match(dashXml,/<a:custDash><a:ds d="150000" sp="100000"\/><a:ds d="50000" sp="150000"\/><a:ds d="100000" sp="50000"\/><\/a:custDash>/);
assert.match(dashXml,/<a:ds d="0" sp="200000"\/>/);
assert.equal((dashXml.match(/<a:custDash>/g)||[]).length,3);
assert.equal((dashXml.match(/<a:prstDash val="dash"\/>/g)||[]).length,1);
console.log('Dash spacing survives normalization, SVG and native PPTX, including odd and zero-length patterns.');
const arrowScene=context.api.materializeEditableScene({nodes:[
  {type:'line',x:10,y:10,x2:80,y2:10,markerStart:true,arrowEnd:true},
  {type:'polyline',points:'10,30 40,30 80,50',arrowStart:true,markerEnd:true},
  {type:'path',d:'M 10 70 C 30 50 60 90 80 70',markerStart:true,arrowhead:true}
].map(n=>({...n,stroke:'123456',fill:'none'}))},1200,675);
assert.ok(arrowScene.nodes.every(n=>n.arrow&&n.arrowStart));
const arrowSvg=context.api.sceneToSvgString(arrowScene);
assert.equal((arrowSvg.match(/marker-start=/g)||[]).length,3);
assert.equal((arrowSvg.match(/marker-end=/g)||[]).length,3);
const arrowXml=Buffer.from(await (await buildNativePptx(arrowScene,context.api.zipStore)).arrayBuffer()).toString('utf8');
assert.equal((arrowXml.match(/<a:headEnd type="triangle"\/>/g)||[]).length,3);
assert.equal((arrowXml.match(/<a:tailEnd type="triangle"\/>/g)||[]).length,3);
console.log('Both arrowheads survive line, polyline and curve normalization, SVG and native PPTX.');
