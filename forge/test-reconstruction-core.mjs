import assert from 'node:assert/strict';
import {extractEditableNodes,planReconstructionTiles,subdivideReconstructionTile,mergeReconstructionTiles} from './reconstruction-core.mjs';

assert.deepEqual(extractEditableNodes({scene:{nodes:[]}}),[],'blank crops must be valid');
assert.deepEqual(extractEditableNodes({result:{shapes:[{type:'rect'}]}}),[{type:'rect'}]);
assert.deepEqual(extractEditableNodes({output:{result:{scene:{nodes:[{type:'text',text:'Nested'}]}}}}),[{type:'text',text:'Nested'}]);
assert.deepEqual(extractEditableNodes({payload:{figure:JSON.stringify({elements:[{type:'rect'}]})}}),[{type:'rect'}]);
assert.deepEqual(extractEditableNodes({customEnvelope:{layers:[{objects:[{type:'rect'}]}]}}),[{type:'rect'}]);
assert.throws(()=>extractEditableNodes({message:'provider error'}),/nodes array/);

const tiles=planReconstructionTiles(1600,900);
assert.equal(tiles.length,2);
assert.deepEqual(tiles.map(t=>[t.coreX,t.coreRight]),[[0,800],[800,1600]]);
assert.ok(tiles[0].x+tiles[0].w>tiles[1].x,'adjacent crops must overlap');
const children=subdivideReconstructionTile(tiles[0],450,14);
assert.ok(children.length>1,'a failed crop must be subdivided');
assert.ok(children.every(t=>t.x>=tiles[0].x&&t.y>=tiles[0].y&&t.coreX>=tiles[0].coreX&&t.coreRight<=tiles[0].coreRight));
assert.equal(children.reduce((area,t)=>area+(t.coreRight-t.coreX)*(t.coreBottom-t.coreY),0),
  (tiles[0].coreRight-tiles[0].coreX)*(tiles[0].coreBottom-tiles[0].coreY),'subdivision cores cover the original core');

const left={tile:tiles[0],scene:{nodes:[
  {id:'cube-front',type:'polyline',points:'730,250 790,250 790,310 730,310',closed:true,fill:'#77AADA'},
  {id:'seam-label',type:'text',x:778,y:100,w:60,h:30,text:'Once'},
  {id:'left-label',type:'text',x:100,y:50,w:80,h:30,text:'Left'},
]}};
const right={tile:tiles[1],scene:{nodes:[
  // This is the same seam label, now in right-tile coordinates.
  {id:'seam-label',type:'text',x:6,y:100,w:60,h:30,text:'Once'},
  {id:'right-line',type:'line',x:40,y:400,x2:120,y2:400,arrow:true},
  {id:'right-path',type:'path',d:'M 40 500 C 80 470 100 530 140 500',stroke:'#222222',fill:'none'},
]}};
const merged=mergeReconstructionTiles([left,right],1600,900);
assert.equal(merged.canvas.width,1600);
assert.equal(merged.nodes.filter(n=>n.text==='Once').length,1,'overlap must not duplicate the same label');
const cube=merged.nodes.find(n=>n.id==='tile1_cube-front');
assert.equal(cube.closed,true,'a cube face must remain a closed polygon');
assert.equal(cube.points,'730,250 790,250 790,310 730,310');
const line=merged.nodes.find(n=>n.id==='tile2_right-line');
assert.deepEqual([line.x,line.x2],[tiles[1].x+40,tiles[1].x+120]);
const path=merged.nodes.find(n=>n.id==='tile2_right-path_part1');
assert.equal(path.type,'polyline');
assert.ok(path.points.startsWith(`${tiles[1].x+40},500`));
assert.equal(merged.counts.total,merged.nodes.length);

// A large filled panel may have its centre outside this tile's owning core.
// Its visible part must survive and must stop at the core boundary.
const panelTiles=planReconstructionTiles(1600,900,800,28);
const panel=mergeReconstructionTiles([{tile:panelTiles[0],scene:{nodes:[
  {id:'spanning-panel',type:'rect',x:650,y:180,w:400,h:300,
    fill:'#CDE7E8',stroke:'#333333',radius:22}
]}}],1600,900);
const visiblePanel=panel.nodes.find(n=>n.id==='tile1_spanning-panel');
assert.ok(visiblePanel,'the intersecting panel fill must survive even when its centre is outside the core');
assert.deepEqual([visiblePanel.x,visiblePanel.y,visiblePanel.w,visiblePanel.h],[650,180,150,270]);
assert.equal(visiblePanel.stroke,'none','the synthetic crop seam must have no outline');
assert.equal(visiblePanel.radius,0,'internal crop seams must not be rounded');

// Regression: the supplied failed export contained rays from exact crop
// origins (for example 2084,0 and 676,1160) across unrelated panels.
const rayTile={index:'4',x:2084,y:0,w:732,h:820,
  coreX:2084,coreY:0,coreRight:2816,coreBottom:792};
const childTile={index:'6.3',x:676,y:1160,w:380,h:424,
  coreX:676,coreY:1160,coreRight:1056,coreBottom:1584};
const cleaned=mergeReconstructionTiles([
  {tile:rayTile,scene:{nodes:[
    {id:'bad-ray',type:'line',x:0,y:0,x2:337,y2:358,stroke:'#333'},
    {id:'bad-edge-ray',type:'line',x:0,y:100,x2:337,y2:458,stroke:'#333'},
    {id:'bad-polyline-ray',type:'polyline',points:'0,0 337,358',stroke:'#333'},
    {id:'bad-path-ray',type:'path',d:'M 0 0 L 337 358',stroke:'#333'},
    {id:'real-connector',type:'line',x:120,y:140,x2:260,y2:190,stroke:'#333'},
    {id:'real-panel-border',type:'line',x:0,y:180,x2:600,y2:180,stroke:'#333'},
    {id:'short-corner-tick',type:'line',x:0,y:0,x2:24,y2:12,stroke:'#333'}
  ]}},
  {tile:childTile,scene:{nodes:[
    {id:'bad-child-ray',type:'line',x:0,y:0,x2:100,y2:326,stroke:'#333'},
    {id:'cube-face',type:'polyline',points:'130,90 170,90 170,130 130,130',closed:true}
  ]}}
],2816,1584);
assert.equal(cleaned.counts.filteredArtifactLines,5);
assert.deepEqual(cleaned.nodes.map(n=>n.id),[
  'tile4_real-connector','tile4_real-panel-border','tile4_short-corner-tick','tile6.3_cube-face'
]);
const titleTiles=planReconstructionTiles(2816,1584);
const titleParts=[
  {text:'Diffusion',x:360,y:78,w:372},
  {text:'on Policy for One-S',x:0,y:62,w:760},
  {text:'-Shot Robot Manip',x:-10,y:70,w:780},
  {text:'ipulation',x:-18,y:78,w:382}
];
const titleMerge=mergeReconstructionTiles(titleTiles.slice(0,4).map((tile,i)=>({tile,scene:{nodes:[
  {id:`title-${i}`,type:'text',...titleParts[i],h:110,fontSize:92,fill:'#111'}
]}})),2816,1584);
assert.equal(titleMerge.nodes.length,1,'seam title fragments must become one editable text shape');
assert.equal(titleMerge.nodes[0].text,'Diffusion Policy for One-Shot Robot Manipulation');
assert.equal(titleMerge.counts.stitchedTextFragments,4);
console.log('reconstruction tile geometry and overlap: OK');
