import assert from 'node:assert/strict';
import {registerMissingObjects,planCatalogRepairs,createWholeImageCatalog,objectRepairCatalog,auditExportLayout,extractEditableNodes,planReconstructionTiles,subdivideReconstructionTile,mergeReconstructionTiles,reconstructionQualityDeficit,acceptReconstructionRepair,planObjectRepairRegion,replaceObjectRepairRegion} from './reconstruction-core.mjs';

assert.equal(reconstructionQualityDeficit({score:.98,darkRecall:.98,localRecall:.97,edgeF1:.97,colorSimilarity:.98}),0);
assert.ok(reconstructionQualityDeficit({score:.9,darkRecall:.9,localRecall:.9,edgeF1:.9,colorSimilarity:.9})>0,
  'a merely usable redraw still needs publication-quality refinement');
assert.equal(acceptReconstructionRepair(
  {score:.73,darkRecall:.8,localRecall:.55,edgeF1:.7,colorSimilarity:.9},
  {score:.73,darkRecall:.8,localRecall:.68,edgeF1:.7,colorSimilarity:.9}),true,
  'a repair that restores missing weak-region details must be accepted even if overall score stays flat');
assert.equal(acceptReconstructionRepair(
  {score:.73,darkRecall:.8,localRecall:.55,edgeF1:.7,colorSimilarity:.9},
  {score:.76,darkRecall:.8,localRecall:.45,edgeF1:.7,colorSimilarity:.9}),false,
  'higher aggregate score must not hide lost weak-region details');
assert.equal(acceptReconstructionRepair(
  {score:.73,darkRecall:.8,localRecall:.55,edgeF1:.7,colorSimilarity:.9},
  {score:.76,darkRecall:.8,localRecall:.545,edgeF1:.7,colorSimilarity:.9}),false,
  'a small but visible loss of weak-region detail must reject an otherwise improved repair');

assert.deepEqual(extractEditableNodes({scene:{nodes:[]}}),[],'blank crops must be valid');
assert.deepEqual(extractEditableNodes({result:{shapes:[{type:'rect'}]}}),[{type:'rect'}]);
assert.deepEqual(extractEditableNodes({output:{result:{scene:{nodes:[{type:'text',text:'Nested'}]}}}}),[{type:'text',text:'Nested'}]);
assert.deepEqual(extractEditableNodes({payload:{figure:JSON.stringify({elements:[{type:'rect'}]})}}),[{type:'rect'}]);
assert.deepEqual(extractEditableNodes({customEnvelope:{layers:[{objects:[{type:'rect'}]}]}}),[{type:'rect'}]);
assert.deepEqual(extractEditableNodes({nodes:[
  {rect:{x:1,y:2,w:3,h:4,fill:'#ffffff'}},
  {x:5,y:6,w:7,h:8,fill:'#eeeeee'},
  {text:{x:9,y:10,text:'Label'}},
]}),[
  {type:'rect',x:1,y:2,w:3,h:4,fill:'#ffffff'},
  {type:'rect',x:5,y:6,w:7,h:8,fill:'#eeeeee'},
  {type:'text',x:9,y:10,text:'Label'},
],'normalize nested and untyped nodes returned by Ark');
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
const path=merged.nodes.find(n=>n.id==='tile2_right-path');
assert.equal(path.type,'path');
assert.match(path.d,new RegExp(`M ${tiles[1].x+40} 500 C `));
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

// A fully visible panel in the overlap retains its native rounded border;
// the neighbouring crop's clipped fragment must not paint over its contents.
const overlapPanel=mergeReconstructionTiles([
  {tile:panelTiles[0],scene:{nodes:[
    {id:'whole-card',type:'rect',x:600,y:200,w:210,h:180,fill:'#CDE7E8',stroke:'#333333',radius:22},
    {id:'card-label',type:'text',x:640,y:240,w:100,h:30,text:'Card'}
  ]}},
  {tile:panelTiles[1],scene:{nodes:[
    {id:'cropped-card',type:'rect',x:0,y:200,w:38,h:180,fill:'#CDE7E8',stroke:'#333333',radius:22}
  ]}}
],1600,900);
assert.equal(overlapPanel.nodes.filter(n=>n.fill==='#CDE7E8').length,1);
assert.equal(overlapPanel.nodes[0].id,'tile1_whole-card');
assert.equal(overlapPanel.nodes[0].radius,22);
assert.equal(overlapPanel.nodes[0].stroke,'#333333');
assert.ok(overlapPanel.nodes.findIndex(n=>n.text==='Card')>0,'card content must paint after its background');

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
const labelTile={index:'label',x:0,y:0,w:500,h:180,
  coreX:0,coreY:0,coreRight:500,coreBottom:180};
const joinedLabel=mergeReconstructionTiles([{tile:labelTile,scene:{nodes:[
  {id:'a',type:'text',x:20,y:35,w:70,h:24,text:'Input &',fontSize:20,fill:'#123456'},
  {id:'b',type:'text',x:88,y:36,w:94,h:18,text:'& Encoding',fontSize:15,fill:'#123456'},
  {id:'other',type:'text',x:220,y:35,w:70,h:24,text:'Output',fontSize:20,fill:'#123456'}
]}}],500,180);
assert.equal(joinedLabel.nodes.find(n=>n.text==='Input & Encoding')?.w,162,
  'overlapping fragments with different OCR font estimates become one label');
assert.ok(joinedLabel.nodes.some(n=>n.text==='Output'),'unrelated label stays separate');
assert.equal(joinedLabel.counts.reconciledTextFragments,1);
const duplicateLabels=mergeReconstructionTiles([{tile:labelTile,scene:{nodes:[
  {id:'title-a',type:'text',x:30,y:20,w:290,h:38,text:'Working Memory Model',fontSize:32},
  {id:'title-b',type:'text',x:32,y:22,w:280,h:36,text:'Working Memory Model',fontSize:31},
  {id:'legend-a',type:'text',x:40,y:100,w:80,h:22,text:'Baseline',fontSize:16},
  {id:'legend-b',type:'text',x:210,y:100,w:80,h:22,text:'Baseline',fontSize:16}
]}}],500,180);
assert.equal(duplicateLabels.counts.deduplicatedText,1,'overlapping title copies are removed');
assert.equal(duplicateLabels.nodes.filter(n=>n.text==='Working Memory Model').length,1);
assert.equal(duplicateLabels.nodes.filter(n=>n.text==='Baseline').length,2,
  'repeated chart labels at separate positions stay editable');
const arcScene={canvas:{width:400,height:300},nodes:[
  {id:'arc',type:'path',d:'M 120 140 A 50 50 0 0 1 220 140',stroke:'#111',fill:'none'},
  {id:'caption',type:'text',text:'Curve',textPath:{d:'M 120 140 A 50 50 0 0 1 220 140'},fontSize:16},
]};
const region=planObjectRepairRegion({x:155,y:85,w:30,h:30},arcScene,400,300);
assert.ok(region.x<=120&&region.x+region.w>=220,'repair crop must contain the entire curved object');
const repaired=replaceObjectRepairRegion(arcScene,region,{nodes:[
  {id:'new-arc',type:'path',d:'M 10 70 A 50 50 0 0 1 110 70',stroke:'#222',fill:'none'},
]},1);
assert.deepEqual(repaired,arcScene,'unknown IDs cannot create or replace objects');
const catalog=createWholeImageCatalog({canvas:{width:1200,height:500},nodes:[
  {id:'duplicate',type:'text',text:'Global label',x:510,y:100,w:170,h:24,fontSize:20},
  {id:'duplicate',type:'text',text:'Global label',x:512,y:100,w:170,h:24,fontSize:20},
  {type:'text',text:'Global label',x:50,y:300,w:170,h:24,fontSize:20},
  {type:'line',x:480,y:150,x2:800,y2:150,strokeWidth:2}
]});
assert.equal(catalog.nodes.length,3);
assert.equal(new Set(catalog.nodes.map(n=>n.id)).size,3);
assert.equal(catalog.counts.deduplicatedText,1);
const area={x:450,y:50,w:400,h:200};
const local=objectRepairCatalog(catalog,area,2);
assert.equal(local.nodes.length,2);
assert.equal(local.nodes[0].fontSize,40);
assert.equal(local.nodes[1].strokeWidth,4);
const imageSource={id:'photo',type:'image',x:500,y:100,w:50,h:40,href:'data:image/png;base64,AAAA',crop:{x:500,y:100,w:50,h:40}};
const imageCatalog=objectRepairCatalog({nodes:[imageSource]},area,2);
assert.equal(imageCatalog.nodes[0].id,'photo');
assert.equal(imageCatalog.nodes[0].href,undefined);
assert.equal(imageCatalog.nodes[0].crop,undefined);
assert.ok(imageSource.href,'prompt sanitization must not mutate the source image');
local.nodes[0].text='Unauthorized transcription';
local.nodes[1].y+=2;local.nodes[1].y2+=2;
local.nodes.push({id:'invented',type:'text',text:'Global label',x:100,y:100,w:50,h:20,fontSize:20});
const patched=replaceObjectRepairRegion(catalog,area,local,2);
assert.equal(patched.nodes.length,3);
assert.equal(patched.nodes[0].text,'Global label');
assert.equal(patched.nodes[2].y,151);
assert.equal(patched.nodes[2].strokeWidth,2);
assert.deepEqual(replaceObjectRepairRegion(patched,area,local,2),patched,'repeat crop is idempotent');
assert.equal(objectRepairCatalog(catalog,{x:550,y:50,w:100,h:200},2).nodes.length,0,'partial cross-boundary objects are context only');
local.nodes[0].fontSize=100;
assert.equal(replaceObjectRepairRegion(catalog,area,local,2).nodes[0].fontSize,20,'large font drift rejected');
assert.equal(auditExportLayout(catalog,catalog).state,'passed');
const bad={...catalog,nodes:[...catalog.nodes,{...catalog.nodes[0]}]};
assert.ok(auditExportLayout(catalog,bad).issues.some(i=>i.kind==='duplicate-text'));
const wrongFont={...catalog,nodes:catalog.nodes.map(n=>n.type==='text'?{...n,fontSize:30}:n)};
assert.ok(auditExportLayout(catalog,wrongFont).issues.some(i=>i.kind==='font-size'));
console.log('reconstruction catalog, crop identity, geometry and layout: OK');

const registered=registerMissingObjects(catalog,{nodes:[
 {...catalog.nodes[0],x:511},
 {type:'text',text:'Missing',x:850,y:350,w:80,h:20,fontSize:16},
 {type:'text',text:'Missing',x:851,y:350,w:80,h:20,fontSize:16}
]});
assert.equal(registered.nodes.length,catalog.nodes.length+1);
assert.equal(registered.counts.registeredMissing,1);
assert.equal(new Set(registered.nodes.map(n=>n.id)).size,registered.nodes.length);
const distinct=registerMissingObjects({nodes:[{id:'a',type:'path',d:'M 10 10 L 50 50'}]},
 {nodes:[{type:'path',d:'M 10 50 L 50 10'}]});
assert.equal(distinct.nodes.length,2,'distinct curves with shared bounds are preserved');
const nested=registerMissingObjects({nodes:[{id:'a',type:'rect',x:10,y:10,w:100,h:100}]},
 {nodes:[{type:'rect',x:30,y:30,w:30,h:30}]});
assert.equal(nested.nodes.length,2,'nested detail is not a duplicate panel');
const jobs=planCatalogRepairs(registered,1200,500);
const owners=jobs.flatMap(j=>j.ids);
assert.equal(new Set(owners).size,owners.length,'each object belongs to one crop only');

// Fidelity repairs may change geometry and split flattened color blocks.
const fidelity={nodes:[
 {id:'back',type:'rect',x:0,y:0,w:400,h:300},
 {id:'matrix',type:'rect',x:40,y:40,w:80,h:80,fill:'#aaaaaa'},
 {id:'arrow',type:'line',x:150,y:80,x2:250,y2:80,strokeWidth:2},
 {id:'label',type:'text',x:40,y:140,w:100,h:20,text:'Keep',fontSize:18}
]};
const repairArea={x:20,y:20,w:280,h:180};
const details={nodes:[
 {replaces:'matrix',type:'rect',x:40,y:40,w:80,h:160,fill:'#ffcc00'},
 {replaces:'matrix',type:'rect',x:120,y:40,w:80,h:160,fill:'#0088aa'},
 {id:'arrow',type:'path',d:'M 260 112 L 420 112 L 420 100 L 460 120 L 420 140 L 420 128 L 260 128 Z',fill:'#cccccc',stroke:'#222222',strokeWidth:4}
]};
const fixed=replaceObjectRepairRegion(fidelity,repairArea,details,2);
assert.deepEqual(fixed.nodes.map(n=>n.id),['back','matrix::detail-0','matrix::detail-1','arrow','label']);
assert.deepEqual(fixed.nodes.slice(1,3).map(n=>n.fill),['#ffcc00','#0088aa']);
assert.equal(fixed.nodes[1].x,40);
assert.equal(fixed.nodes[1].w,40);
assert.equal(fixed.nodes[3].type,'path');
assert.equal(fixed.nodes[3].fill,'#cccccc');
assert.match(fixed.nodes[3].d,/Z/i);
assert.equal(fixed.nodes[3].x2,undefined,'old line geometry must not leak into replacement');
const invalidDetails={nodes:[...details.nodes.slice(0,2),{replaces:'matrix',type:'rect',x:500,y:40,w:20,h:20}]};
assert.deepEqual(replaceObjectRepairRegion(fidelity,repairArea,invalidDetails,2),fidelity,'one escaped child rejects entire decomposition');
assert.deepEqual(replaceObjectRepairRegion(fidelity,repairArea,{nodes:[{replaces:'label',type:'rect',x:40,y:240,w:100,h:40}]},2),fidelity,'text cannot be replaced by geometric fragments');
console.log('filled arrow correction and multicolor decomposition: OK');
