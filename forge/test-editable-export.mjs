// Smoke test for the exact browser exporters in index.html, with a three-face cube.
// Run: node forge/test-editable-export.mjs [output-directory]
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { geometrySegments, buildNativePptx, parseEditablePath, expandEditableTextPaths } from './editable-native.mjs';
import {layoutEditableText} from './editable-text-layout.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const output = resolve(process.argv[2] || resolve(tmpdir(), 'figureforge-editable-smoke'));
await mkdir(output, { recursive: true });
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const section = (begin, end) => {
  const a = html.indexOf(begin), b = html.indexOf(end, a + begin.length);
  if (a < 0 || b < 0) throw new Error(`Missing exporter section: ${begin}`);
  return html.slice(a, b);
};
const code = [
  section('function xmlEscape(value)', 'function rasterToExportSvg(src)'),
  section('function exportColor(value, fallback)', '/* ---------- text-free base'),
  'globalThis.exports = { sceneToDrawio, sceneToVsdxFiles, zipStore };',
].join('\n');
const context = vm.createContext({
  geometrySegments, expandEditableTextPaths, TextEncoder, Uint8Array, Uint32Array, DataView, Blob, Date,
  Math, Number, String, Array, Object, RegExp, atob, btoa,
  EXPORT_CANVAS: { w: 1200, h: 675 }, PT_PER_UNIT: 0.6,
});
vm.runInContext(code, context);
const { sceneToDrawio, sceneToVsdxFiles, zipStore } = context.exports;

const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6mAAAAABJRU5ErkJggg==';
const measure=(line,size)=>[...line].reduce((sum,ch)=>sum+(ch===' '?0.28:0.56)*size,0);
const wrapped=layoutEditableText('Memory state\ninitialization',{
  fontSize:40,width:247,height:91,measure
});
assert.equal(wrapped.text,'Memory state\ninitialization','OCR line breaks must be preserved exactly');
assert.equal(wrapped.fontSize,40,'the original glyph size must be retained');
const preserved=layoutEditableText('Memory\nUpdate',{fontSize:40,width:154,height:91,measure});
assert.equal(preserved.text,'Memory\nUpdate','OCR line breaks must survive scene materialization');
const scene = {
  canvas: { width: 1200, height: 675 },
  nodes: [
    {type:'rect',x:20,y:20,w:1160,h:635,fill:'#FFFFFF',stroke:'#222222',strokeWidth:2,radius:15},
    {type:'polyline',points:'300,200 440,200 440,340 300,340',closed:true,fill:'#77AADA',stroke:'#222222',strokeWidth:2},
    {type:'polyline',points:'300,200 350,150 490,150 440,200',closed:true,fill:'#BDD7EF',stroke:'#222222',strokeWidth:2},
    {type:'polyline',points:'440,200 490,150 490,290 440,340',closed:true,fill:'#477FAE',stroke:'#222222',strokeWidth:2},
    {type:'ellipse',x:600,y:200,w:100,h:100,fill:'#FFD280',stroke:'#222222',strokeWidth:2},
    {type:'path',d:'M 730 250 C 780 180 830 320 880 250',fill:'none',stroke:'#222222',strokeWidth:3},
    {type:'path',d:'M 750 330 A 65 65 0 0 1 880 330',fill:'none',stroke:'#267ABC',strokeWidth:3},
    {type:'line',x:510,y:270,x2:590,y2:270,stroke:'#222222',strokeWidth:3,arrow:true},
    {type:'text',x:300,y:395,w:300,h:45,text:'Editable 3D cube',fontSize:32,fontFamily:'Arial',fill:'#111111',bold:true},
    {type:'text',x:300,y:450,w:247,h:91,text:wrapped.text,fontSize:wrapped.fontSize,fontFamily:'Arial',fill:'#111111'},
    {type:'text',x:730,y:360,w:180,h:30,text:'Rotate',fontSize:19,rotation:34,fill:'#111111'},
    {type:'text',text:'Curve',textPath:{d:'M 750 400 A 65 65 0 0 1 880 400'},fontSize:19,fill:'#111111'},
    {type:'image',x:950,y:200,w:100,h:100,href:tinyPng},
  ],
};
for (const face of scene.nodes.slice(1, 4)) {
  const segments = geometrySegments(face);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].closed, true, 'every cube face must remain a closed polygon');
  assert.equal(segments[0].points.length, 4);
}
globalThis.fetch = async () => ({ok:true,json:async()=>JSON.parse(await readFile(resolve(root,'pptx-template.json'),'utf8'))});
const pptx = await buildNativePptx(scene, zipStore);
const pptxBytes=Buffer.from(await pptx.arrayBuffer());
assert.match(pptxBytes.toString('utf8'),/<a:cubicBezTo>/,
  'cubic and SVG arc paths must export as editable PowerPoint curves');
assert.match(pptxBytes.toString('utf8'),/rot="2040000"/,
  'rotated text must retain its angle in the PPTX');
assert.match(pptxBytes.toString('utf8'),/<a:t>Memory state<\/a:t>[\s\S]*?<a:t>initialization<\/a:t>/,
  'PPTX must contain separate editable lines at the chosen font size');
assert.match(pptxBytes.toString('utf8'),/<a:rPr[^>]*sz="1920"[^>]*b="1"[^>]*>[\s\S]*?<a:t>Editable 3D cube<\/a:t>/,
  'PPTX must retain the bold title and its original font size');
assert.equal(parseEditablePath('M 750 330 A 65 65 0 0 1 880 330')[0].commands.some(c=>c.type==='cubic'),true);
assert.equal(expandEditableTextPaths(scene).nodes.filter(n=>String(n.id||'').startsWith('text_char')).length,5,
  'arc labels must remain editable individual characters');
const vsdx = zipStore(sceneToVsdxFiles(scene, 'Arial'));
const drawio = sceneToDrawio(scene);
assert.ok(pptx.size > 10000, 'PPTX package should contain native parts');
assert.ok(vsdx.size > 10000, 'VSDX package should contain native parts');
assert.equal((drawio.match(/<mxCell id="ff\d+"/g) || []).length, expandEditableTextPaths(scene).nodes.length);
assert.match(drawio,/rotation=34/,'draw.io rotated text must keep its angle');
const vsdxBytes=Buffer.from(await vsdx.arrayBuffer());
for(const [ratio,height] of [['16:9',675],['3:2',800],['4:3',900],['1:1',1200]]){
  const sized={...scene,canvas:{width:1200,height}};
  const pptxXml=Buffer.from(await (await buildNativePptx(sized,zipStore)).arrayBuffer()).toString('utf8');
  const expectedCy=Math.round(9144000*height/1200);
  assert.match(pptxXml,new RegExp(`<p:sldSz cx="9144000" cy="${expectedCy}"`),`${ratio} PPTX slide size`);
  const vsdxXml=Buffer.from(await zipStore(sceneToVsdxFiles(sized,'Arial')).arrayBuffer()).toString('utf8');
  assert.match(vsdxXml,new RegExp(`<Cell N="PageHeight" V="${(10*height/1200).toFixed(4)}"`),`${ratio} VSDX page size`);
}
assert.match(vsdxBytes.toString('utf8'),/<Cell N="Angle"/,'Visio text rotation must remain editable');
assert.match(vsdxBytes.toString('utf8'),/<Text>Memory state\r?\ninitialization<\/Text>/,
  'VSDX must keep the same editable line breaks as PPTX');
assert.equal((drawio.match(/shape=stencil\(/g) || []).length, 5, 'cube faces and curved paths must be editable stencils');
const stencils=[...drawio.matchAll(/shape=stencil\(([^)]+)\)/g)].map(match =>
  decodeURIComponent(inflateRawSync(Buffer.from(match[1], 'base64')).toString('utf8')));
assert.equal(stencils.length, 5);
for(const shape of stencils) assert.match(shape, /<shape name="FigureForge Path"/);
for(const face of stencils.slice(0,3)) assert.match(face, /<close\/><\/path><fillstroke\/>/);
await Promise.all([
  writeFile(resolve(output,'cube.pptx'), Buffer.from(await pptx.arrayBuffer())),
  writeFile(resolve(output,'cube.vsdx'), Buffer.from(await vsdx.arrayBuffer())),
  writeFile(resolve(output,'cube.drawio'), drawio),
]);
console.log(output);
