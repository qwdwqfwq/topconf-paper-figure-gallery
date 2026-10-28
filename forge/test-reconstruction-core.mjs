import assert from 'node:assert/strict';
import {normalizeRotatedTextBounds} from './editable-native.mjs';
import {scaleRegionCatalog,scaleRegionPatch,scaleStructureScene,registerMissingObjects,planCatalogRepairs,tileDetailCatalog,createWholeImageCatalog,objectRepairCatalog,auditExportLayout,extractEditableNodes,planReconstructionTiles,subdivideReconstructionTile,mergeReconstructionTiles,reconstructionQualityDeficit,acceptReconstructionRepair,planObjectRepairRegion,replaceObjectRepairRegion} from './reconstruction-core.mjs';

const verticalLabel={type:'text',text:'Central process',x:72,y:1180,w:86,h:630,rotation:-90};
const layoutLabel=normalizeRotatedTextBounds(verticalLabel);
assert.equal(layoutLabel.x+layoutLabel.w/2,verticalLabel.x+verticalLabel.w/2);
assert.equal(layoutLabel.y+layoutLabel.h/2,verticalLabel.y+verticalLabel.h/2);
assert.equal(layoutLabel.w,630);
assert.equal(layoutLabel.h,86);
assert.deepEqual(normalizeRotatedTextBounds(layoutLabel),layoutLabel);
assert.equal(verticalLabel.x,72,'rendering must not mutate catalog ownership coordinates');
assert.equal(normalizeRotatedTextBounds({...verticalLabel,rotation:0}).w,86);
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

// Two crops can each own the centre of a different fragment of one line.
// The final graph must contain the union once, even when the whole-image
// catalog did not identify that connector.
const seamGeometry=mergeReconstructionTiles([
  {tile:tiles[0],scene:{nodes:[
    {id:'left-fragment',type:'line',x:600,y:420,x2:828,y2:420,stroke:'#222'},
    {id:'small-box',type:'rect',x:783,y:260,w:30,h:24,fill:'#ABCDEF',stroke:'#222'}
  ]}},
  {tile:tiles[1],scene:{nodes:[
    {id:'right-fragment',type:'line',x:0,y:420,x2:228,y2:420,stroke:'#222',arrow:true},
    {id:'small-box-copy',type:'rect',x:13,y:260,w:30,h:24,fill:'#ABCDEF',stroke:'#222'}
  ]}}
],1600,900);
const joinedLine=seamGeometry.nodes.filter(n=>n.type==='line');
assert.equal(joinedLine.length,1,'cross-tile connector fragments must form one editable line');
assert.deepEqual([joinedLine[0].x,joinedLine[0].x2],[600,1000]);
assert.equal(joinedLine[0].arrow,true);
assert.equal(seamGeometry.nodes.filter(n=>n.type==='rect').length,1,
  'same small shape observed on each side of a seam must have one owner');
assert.equal(seamGeometry.counts.mergedCrossTileLines,1);
assert.equal(seamGeometry.counts.deduplicatedCrossTileShapes,1);

// Adjacent crops must not erase distinctions between dashed connectors.
function mergedDashLines(leftStyle,rightStyle){
  return mergeReconstructionTiles([
    {tile:tiles[0],scene:{nodes:[{id:'left',type:'line',x:600,y:420,x2:828,y2:420,stroke:'#222',...leftStyle}]}},
    {tile:tiles[1],scene:{nodes:[{id:'right',type:'line',x:0,y:420,x2:228,y2:420,stroke:'#222',...rightStyle}]}}
  ],1600,900).nodes.filter(node=>node.type==='line');
}
assert.equal(mergedDashLines({dash:[12,6]},{dash:[3,2]}).length,2,
  'different dash patterns must remain separate');
assert.equal(mergedDashLines({strokeDasharray:'12 6'},{}).length,2,
  'a dash alias must not merge with a solid line');
assert.equal(mergedDashLines({dash:[3,2,1]},{strokeDasharray:'3,2,1,3,2,1'}).length,1,
  'equivalent odd dash arrays and string aliases may merge');
assert.equal(mergedDashLines({dash:true},{dash:[8,6]}).length,2,
  'a preset dash must retain its distinct export semantics');
const doubleHead=mergedDashLines({arrowStart:true},{arrow:true});
assert.equal(doubleHead.length,1);
assert.equal(doubleHead[0].arrowStart,true,'merging must preserve the left arrowhead');
assert.equal(doubleHead[0].arrow,true,'merging must preserve the right arrowhead');
assert.equal(mergedDashLines({arrow:true},{}).length,2,
  'an interior arrowhead must not move to the end of an extended line');
const reversedHead=mergedDashLines({arrowStart:true},{x:228,x2:0,arrowStart:true});
assert.equal(reversedHead.length,1);
assert.deepEqual([reversedHead[0].x,reversedHead[0].x2],[600,1000]);
assert.equal(reversedHead[0].arrowStart,true);
assert.equal(reversedHead[0].arrow,true,'a reversed fragment start head belongs at the final end');
assert.equal(mergedDashLines({},{x:228,x2:0,arrow:true}).length,2,
  'a reversed fragment interior end head must remain at its observed position');

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
assert.equal(repaired.nodes.length,3,'a crop can register a missing editable curve');
assert.ok(repaired.nodes[2].id.startsWith('whole_added_'));
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
local.nodes[0].text='Corrected transcription';
local.nodes[1].y+=2;local.nodes[1].y2+=2;
local.nodes.push({id:'invented',type:'text',text:'Global label',x:100,y:100,w:50,h:20,fontSize:20});
local.nodes.push({type:'text',text:'Axis 10',x:600,y:260,w:100,h:30,fontSize:20});
const patched=replaceObjectRepairRegion(catalog,area,local,2);
assert.equal(patched.nodes.length,4,'a crop restores a missed editable label while suppressing duplicate text');
assert.equal(patched.nodes[0].text,'Corrected transcription');
assert.equal(patched.nodes[2].y,151);
assert.equal(patched.nodes[2].strokeWidth,2);
assert.equal(patched.nodes[3].text,'Axis 10');
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
const registeredLine=registerMissingObjects({nodes:[
 {id:'whole-connector',type:'line',x:600,y:420,x2:850,y2:420,stroke:'#222'}
]},{nodes:[
 {type:'line',x:770,y:421,x2:1000,y2:421,stroke:'#222',arrow:true},
 {type:'line',x:770,y:432,x2:1000,y2:432,stroke:'#222'}
]});
assert.equal(registeredLine.nodes.length,2,
 'a jittered connector from a crop is not registered twice, while a separate parallel line remains');
const nested=registerMissingObjects({nodes:[{id:'a',type:'rect',x:10,y:10,w:100,h:100}]},
 {nodes:[{type:'rect',x:30,y:30,w:30,h:30}]});
assert.equal(nested.nodes.length,2,'nested detail is not a duplicate panel');
const jobs=planCatalogRepairs(registered,1200,500);
const owners=jobs.flatMap(j=>j.ids);
assert.equal(new Set(owners).size,owners.length,'each object belongs to one crop only');
const crossRegion={canvas:{width:1600,height:900},nodes:[
  {id:'cross-region-arrow',type:'line',x:100,y:250,x2:1500,y2:250,stroke:'#222',arrow:true},
  {id:'local-box',type:'rect',x:180,y:300,w:100,h:80,fill:'#fff'}
]};
const crossTiles=planReconstructionTiles(1600,900,700,40);
assert.equal(crossTiles.flatMap(tile=>tileDetailCatalog(crossRegion,tile).nodes)
  .filter(node=>node.id==='cross-region-arrow').length,0,
  'a tile cannot recreate a partial cross-region arrow');
const crossJobs=planCatalogRepairs(crossRegion,1600,900);
assert.equal(crossJobs.flatMap(job=>job.ids).filter(id=>id==='cross-region-arrow').length,1,
  'one complete repair owns each cross-region arrow');
const crossJob=crossJobs.find(job=>job.ids.includes('cross-region-arrow'));
assert.equal(crossJob.allowLarge,true);
const crossLocal=objectRepairCatalog(crossRegion,crossJob.region,1,true);
crossLocal.nodes=crossLocal.nodes.filter(node=>crossJob.ids.includes(node.id));
assert.equal(crossLocal.nodes.length,1);
crossLocal.nodes[0].y+=2;crossLocal.nodes[0].y2+=2;
crossLocal.nodes.push({id:'invented-crossing',type:'line',x:-20,y:-20,x2:100,y2:100});
const crossPatched=replaceObjectRepairRegion(crossRegion,crossJob.region,crossLocal,1,true);
assert.equal(crossPatched.nodes.length,crossRegion.nodes.length,
  'a regional repair rejects objects crossing its boundary');
assert.equal(crossPatched.nodes[0].y,252);

const scaledStructure=scaleStructureScene({canvas:{width:100,height:50},regions:[{id:'panel',x:10,y:5,w:80,h:40}],nodes:[{type:'rect',x:10,y:5,w:80,h:40,strokeWidth:1},{type:'text',x:12,y:8,w:40,h:10,fontSize:8}]},400,200);
assert.deepEqual(scaledStructure.regions,[{id:'panel',x:40,y:20,w:320,h:160}]);
assert.equal(scaledStructure.nodes[0].strokeWidth,4);
assert.equal(scaledStructure.nodes[1].fontSize,32);

const nativeCatalog={canvas:{width:4000,height:1000},nodes:[{id:'arrow',version:3,type:'line',x:100,y:200,x2:2000,y2:200,strokeWidth:4,arrowLength:20,arrowWidth:12}],readOnlyContext:[{id:'frame',type:'rect',x:0,y:0,w:4000,h:1000}],excludeRects:[{x:1000,y:200,w:800,h:600}]};
const inputCatalog=scaleRegionCatalog(nativeCatalog,.4);
assert.deepEqual(inputCatalog.canvas,{width:1600,height:400});
assert.equal(inputCatalog.readOnlyContext[0].w,1600);
assert.equal(inputCatalog.excludeRects[0].x,400);
assert.equal(inputCatalog.nodes[0].arrowLength,8);
const restoredPatch=scaleRegionPatch({operations:[{op:'update',id:'arrow',version:3,nodes:inputCatalog.nodes}],uncertainties:[{x:400,y:80,w:320,h:240,reason:'small'}]},2.5);
for(const [key,value] of Object.entries(nativeCatalog.nodes[0])){
  const actual=restoredPatch.operations[0].nodes[0][key];
  if(typeof value==='number')assert.ok(Math.abs(actual-value)<1e-9,key);else assert.equal(actual,value);
}
assert.equal(restoredPatch.operations[0].version,3);
assert.deepEqual(restoredPatch.uncertainties[0],{x:1000,y:200,w:800,h:600,reason:'small'});
assert.equal(nativeCatalog.nodes[0].x2,2000,'input catalog remains immutable');
