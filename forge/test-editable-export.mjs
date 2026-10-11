// Smoke test for the exact browser exporters in index.html, with a three-face cube.
// Run: node forge/test-editable-export.mjs [output-directory]
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { geometrySegments, buildNativePptx } from './editable-native.mjs';

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
  geometrySegments, TextEncoder, Uint8Array, Uint32Array, DataView, Blob, Date,
  Math, Number, String, Array, Object, RegExp, atob, btoa,
  EXPORT_CANVAS: { w: 1200, h: 675 }, PT_PER_UNIT: 0.6,
});
vm.runInContext(code, context);
const { sceneToDrawio, sceneToVsdxFiles, zipStore } = context.exports;

const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6mAAAAABJRU5ErkJggg==';
const scene = {
  canvas: { width: 1200, height: 675 },
  nodes: [
    {type:'rect',x:20,y:20,w:1160,h:635,fill:'#FFFFFF',stroke:'#222222',strokeWidth:2,radius:15},
    {type:'polyline',points:'300,200 440,200 440,340 300,340',closed:true,fill:'#77AADA',stroke:'#222222',strokeWidth:2},
    {type:'polyline',points:'300,200 350,150 490,150 440,200',closed:true,fill:'#BDD7EF',stroke:'#222222',strokeWidth:2},
    {type:'polyline',points:'440,200 490,150 490,290 440,340',closed:true,fill:'#477FAE',stroke:'#222222',strokeWidth:2},
    {type:'ellipse',x:600,y:200,w:100,h:100,fill:'#FFD280',stroke:'#222222',strokeWidth:2},
    {type:'path',d:'M 730 250 C 780 180 830 320 880 250',fill:'none',stroke:'#222222',strokeWidth:3},
    {type:'line',x:510,y:270,x2:590,y2:270,stroke:'#222222',strokeWidth:3,arrow:true},
    {type:'text',x:300,y:395,w:300,h:45,text:'Editable 3D cube',fontSize:32,fontFamily:'Arial',fill:'#111111',bold:true},
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
const vsdx = zipStore(sceneToVsdxFiles(scene, 'Arial'));
const drawio = sceneToDrawio(scene);
assert.ok(pptx.size > 10000, 'PPTX package should contain native parts');
assert.ok(vsdx.size > 10000, 'VSDX package should contain native parts');
assert.equal((drawio.match(/<mxCell id="ff\d+"/g) || []).length, scene.nodes.length);
assert.equal((drawio.match(/shape=stencil\(/g) || []).length, 4, 'cube faces and curved path must be editable stencils');
const stencils=[...drawio.matchAll(/shape=stencil\(([^)]+)\)/g)].map(match =>
  decodeURIComponent(inflateRawSync(Buffer.from(match[1], 'base64')).toString('utf8')));
assert.equal(stencils.length, 4);
for(const shape of stencils) assert.match(shape, /<shape name="FigureForge Path"/);
for(const face of stencils.slice(0,3)) assert.match(face, /<close\/><\/path><fillstroke\/>/);
await Promise.all([
  writeFile(resolve(output,'cube.pptx'), Buffer.from(await pptx.arrayBuffer())),
  writeFile(resolve(output,'cube.vsdx'), Buffer.from(await vsdx.arrayBuffer())),
  writeFile(resolve(output,'cube.drawio'), drawio),
]);
console.log(output);
