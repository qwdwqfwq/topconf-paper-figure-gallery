import assert from 'node:assert/strict';
import {applyRegionPatch,snapshotVersions,planDetailRegions,planSemanticRegions,expandStructuredNodes,regionObjectCatalog,fitSourceFills,calibrateShapeGeometry,rollbackRegionChanges,rejectUnsupportedLines,recoverDocumentInk,repairStructuralLayers} from './reconstruction-pipeline.mjs';

const region={id:'a',x:10,y:10,w:100,h:100,coreX:10,coreY:10,coreRight:110,coreBottom:110};
const text={id:'label',type:'text',x:20,y:20,w:50,h:15,text:'old',fontSize:12,version:2};
const scene={nodes:[text],revision:0};
const versions=snapshotVersions(scene);
const updated=applyRegionPatch(scene,region,{operations:[{op:'update',id:'label',version:2,node:{...text,x:12,y:12,text:'correct'}}]},versions);
assert.equal(updated.scene.nodes[0].text,'correct');
assert.equal(updated.scene.nodes[0].x,22);
assert.equal(updated.scene.nodes[0].version,3);
const stale=applyRegionPatch(updated.scene,region,{operations:[{op:'delete',id:'label'}]},versions);
assert.equal(stale.conflicts.length,1);assert.equal(stale.scene.nodes.length,1);
const outside=applyRegionPatch(scene,region,{operations:[{op:'delete',id:'label'},{op:'add',node:{type:'rect',x:99,y:99,w:50,h:50}}]},versions);
assert.ok(outside.rejected.length);assert.deepEqual(outside.scene.nodes,scene.nodes,'a bad replacement rolls back the entire patch');
const foreign=applyRegionPatch({...scene,nodes:[{...text,owner:'another'}]},region,{operations:[{op:'delete',id:'label'}]},versions);
assert.equal(foreign.rejected[0].reason,'ownership');
const split=applyRegionPatch(scene,region,{operations:[{op:'split',id:'label',nodes:[{...text,x:10,y:10,w:20,text:'one'},{...text,x:35,y:10,w:20,text:'two'}]}]},versions);
assert.equal(split.scene.nodes.length,2);assert.ok(split.scene.nodes.every(n=>n.owner==='a'));
const merged=applyRegionPatch(split.scene,region,{operations:[{op:'merge',ids:split.scene.nodes.map(n=>n.id),nodes:[{...text,x:10,y:10,text:'one two'}]}]},snapshotVersions(split.scene));
assert.equal(merged.scene.nodes.length,1);assert.equal(merged.scene.nodes[0].text,'one two');
const table=expandStructuredNodes([{type:'table',x:0,y:0,rows:[20,20],columns:[60,40],cells:[['Name','Score'],['A','1']]}]);
assert.equal(table.filter(n=>n.type==='text').length,4);assert.equal(table.filter(n=>n.type==='rect').length,4);
assert.equal(table.find(n=>n.text==='Score').x,63);
const horizontalTable=expandStructuredNodes([{type:'table',x:0,y:0,rows:[20,20],columns:[60,40],borders:'horizontal',rowLines:[0,1,1,2,-1,9],cells:[['Name','Score'],['A','1']]}]);
assert.ok(horizontalTable.filter(n=>n.type==='rect').every(n=>n.stroke==='none'));
assert.deepEqual(horizontalTable.filter(n=>n.type==='line').map(n=>[n.x,n.y,n.x2,n.y2]),[[0,0,100,0],[0,20,100,20],[0,40,100,40]]);
assert.equal(expandStructuredNodes([{type:'table',x:0,y:0,rows:[20],columns:[40],borders:'none',cells:[['A']]}]).filter(n=>n.type==='line').length,0);
assert.deepEqual(expandStructuredNodes([{type:'table',rows:[-1],columns:[20]}]),[]);
assert.equal(expandStructuredNodes([{type:'heatmap',x:0,y:0,w:20,h:20,colors:[['#000000','#ffffff'],['#ffffff','#000000']]}]).length,4);
const regions=planSemanticRegions({regions:[{id:'p',x:0,y:0,w:200,h:100},{id:'c',parentId:'p',x:20,y:20,w:30,h:30}]},200,100);
assert.equal(regions.length,2);assert.equal(regions[0].id,'c');assert.equal(regions[0].coreX,20);
for(let y=0;y<100;y+=5)for(let x=0;x<200;x+=5)
  assert.equal(regions.filter(r=>x>=r.coreX&&x<r.coreRight&&y>=r.coreY&&y<r.coreBottom&&!(r.excludeRects||[]).some(b=>x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h)).length,1,'region ownership including child exclusions does not overlap');
const edge={id:'edge',type:'text',x:10,y:10,w:100,h:20,text:'boundary',fontSize:12};
assert.equal(regionObjectCatalog({nodes:[edge]},region).nodes.length,1,'text ownership uses declared box, not audit padding');
const verticalScene={nodes:[{...text,x:20,y:20,w:15,h:70,rotation:-90}]};
const verticalPatch=applyRegionPatch(verticalScene,region,{operations:[
  {op:'update',id:'label',version:2,node:{...text,x:-17.5,y:37.5,w:70,h:15,rotation:-90}},
  {op:'add',node:{type:'rect',x:60,y:10,w:20,h:20}}
]},snapshotVersions(verticalScene));
assert.equal(verticalPatch.rejected.length,0,'rotated layout box stays within crop after rotation');
assert.equal(verticalPatch.scene.nodes.length,2,'a valid vertical label must not roll back other chart objects');
assert.equal(regionObjectCatalog(verticalPatch.scene,region).nodes.length,2);
const additions={operations:[{op:'add',node:{type:'line',x:5,y:5,x2:80,y2:5,stroke:'#000000'}},{op:'add',node:{type:'line',x:5,y:7,x2:80,y2:7,stroke:'#000000'}},{op:'add',node:{type:'rect',x:99,y:99,w:40,h:40}}]};
const added=applyRegionPatch({nodes:[]},region,additions,{});
assert.equal(added.scene.nodes.length,2,'nearby grid lines must remain distinct');assert.equal(added.ignored.length,1);
const repeated=applyRegionPatch(added.scene,region,additions,snapshotVersions(added.scene));
assert.equal(repeated.scene.nodes.length,2,'retries are idempotent');
const otherCore={...region,coreX:80};
assert.equal(regionObjectCatalog(scene,otherCore).nodes.length,0,'context does not grant ownership');
const canvas={width:100,height:100,getContext:()=>({getImageData:(x,y)=>({data:[180+x*.2,200+x*.2,220+x*.2,255]})})};
const fitted=fitSourceFills({nodes:[{id:'g',type:'rect',x:0,y:0,w:100,h:100,fill:'#bed2e6'}]},canvas);
assert.equal(fitted.nodes[0].gradient.angle,0);assert.equal(fitted.nodes[0].gradient.stops.length,2);
const insetCanvas={width:100,height:100,getContext:()=>({getImageData:(x,y)=>({data:x>=15&&x<=85&&y>=15&&y<=85?[230,230,230,255]:[250,220,225,255]})})};
const panelFills=fitSourceFills({nodes:[
  {id:'panel',type:'rect',x:0,y:0,w:100,h:100,fill:'#efecec'},
  {id:'chart',type:'rect',x:15,y:15,w:70,h:70,fill:'#e6e6e6'}
]},insetCanvas,new Set(['panel']));
assert.equal(panelFills.nodes[0].fill,'#fadce1','nested gray chart must not recolor the pink panel');
assert.equal(panelFills.nodes[1].fill,'#e6e6e6','unselected chart remains unchanged');
console.log('Semantic patches: atomicity, ownership, conflicts, split/merge and dense primitives OK');

const excludedRegion={...region,excludeRects:[{x:10,y:10,w:70,h:50}]};
assert.equal(regionObjectCatalog(scene,excludedRegion).nodes.length,0);
assert.equal(regionObjectCatalog(scene,excludedRegion).readOnlyContext.length,1);
assert.equal(applyRegionPatch(scene,excludedRegion,{operations:[{op:'delete',id:'label'}]},versions).rejected.length,1);
const headingPixels=new Uint8ClampedArray(400*400*4).fill(255);
for(let y=30;y<60;y++)for(let x=50;x<350;x++){const i=(y*400+x)*4;headingPixels.set([180,210,230,255],i);}
const headingCanvas={width:400,height:400,getContext:()=>({getImageData:(x,y,w,h)=>({data:w===1&&h===1?headingPixels.slice((y*400+x)*4,(y*400+x)*4+4):headingPixels})})};
const headingScene={nodes:[{id:'title',type:'text',x:80,y:30,w:240,h:30,fontSize:25,bold:true,text:'Title'},{id:'frame',type:'rect',x:5,y:40,w:390,h:150},{id:'duplicate',type:'rect',x:6,y:41,w:389,h:149}]};
const layered=repairStructuralLayers(headingScene,headingCanvas);
assert.equal(layered.nodes.filter(n=>n.sourceDetail==='heading-strip').length,1);
assert.equal(layered.nodes.filter(n=>n.id==='duplicate').length,0);
assert.equal(layered.nodes.at(-1).id,'title');
assert.equal(layered.nodes.at(-2).sourceDetail,'heading-strip');
assert.deepEqual(repairStructuralLayers(layered,headingCanvas),layered,'structural recovery is idempotent');
assert.equal(repairStructuralLayers({nodes:[{...headingScene.nodes[0],bold:false}]},headingCanvas).nodes.filter(n=>n.sourceDetail==='heading-strip').length,0,'ordinary labels must not become opaque heading plates');
assert.equal(repairStructuralLayers({nodes:[{...headingScene.nodes[0],rotation:-90}]},headingCanvas).nodes.filter(n=>n.sourceDetail==='heading-strip').length,0,'vertical labels must not become horizontal heading plates');
const distinctLayers=repairStructuralLayers({nodes:[
  {id:'ownership',type:'rect',x:5,y:40,w:390,h:150,fill:'none',stroke:'none'},
  {id:'visible-frame',type:'rect',x:5,y:40,w:390,h:150,fill:'none',stroke:'#000000'}
]},headingCanvas);
assert.ok(distinctLayers.nodes.some(n=>n.id==='visible-frame'),'an invisible ownership rectangle must not remove a visible border');
const boundedHeading=repairStructuralLayers({nodes:[
  {...headingScene.nodes[0],x:80,w:160},
  {id:'own-panel',type:'rect',x:50,y:25,w:210,h:200,fill:'#b4d2e6',stroke:'none'},
  {id:'neighbor',type:'rect',x:265,y:25,w:100,h:200,fill:'#ffe2bc',stroke:'none'}
]},headingCanvas).nodes.find(n=>n.sourceDetail==='heading-strip');
assert.ok(boundedHeading&&boundedHeading.x+boundedHeading.w<=260,'a title plate must not bridge into its neighboring panel');

const exactArrow=expandStructuredNodes([{type:'line',x:0,y:0,x2:100,y2:0,arrow:true,arrowLength:10,arrowWidth:8,stroke:'#123456'}]);
assert.equal(exactArrow.length,2);assert.equal(exactArrow[0].arrow,false);assert.equal(exactArrow[1].d,'M100 0L90 4L90 -4Z');
const borderPixels=new Uint8ClampedArray(100*100*4).fill(255);
for(let y=20;y<=70;y++)for(let x=20;x<=70;x++)if(x===20||x===70||y===20||y===70){const i=(y*100+x)*4;borderPixels[i]=borderPixels[i+1]=borderPixels[i+2]=0;}
const borderCanvas={width:100,height:100,getContext:()=>({getImageData:()=>({data:borderPixels})})};
const geom=calibrateShapeGeometry({nodes:[{type:'rect',x:22,y:22,w:46,h:46,stroke:'#000000',strokeWidth:1}]},borderCanvas).nodes[0];
assert.deepEqual([geom.x,geom.y,geom.w,geom.h],[20,20,50,50]);

const rollbackOriginal={nodes:[{id:'r1',owner:'bad'},{id:'r2',owner:'bad'},{id:'keep',owner:'good'}]};
const rollbackCandidate={nodes:[{id:'new',owner:'bad'},{id:'r2',owner:'bad',changed:true},{id:'keep',owner:'good',changed:true},{id:'newgood',owner:'good'}]};
const rolled=rollbackRegionChanges(rollbackOriginal,rollbackCandidate,['bad']);
assert.deepEqual(rolled.nodes.map(n=>n.id),['r1','r2','keep','newgood']);
assert.equal(rolled.nodes[1].changed,undefined);
assert.equal(rolled.nodes[2].changed,true);

// Cached blue hallucinations must not be validated by black title glyphs.
const sourcePixels=new Uint8ClampedArray(1000*500*4).fill(255);
function paint(x,y,w,h,rgb){for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++){
  const at=(py*1000+px)*4;rgb.forEach((v,i)=>sourcePixels[at+i]=v);
}}
const sourceCanvas={width:1000,height:500,getContext:()=>({getImageData:()=>({data:sourcePixels})})};
paint(50,20,850,4,[0,0,0]);
paint(50,40,850,4,[30,65,106]);
for(let x=50;x<900;x+=20)paint(x,60,6,3,[30,65,106]);
const line=(id,y,dash=false)=>({id,type:'line',x:50,y,x2:900,y2:y,stroke:'#1e416a',strokeWidth:3,dash});
assert.deepEqual(rejectUnsupportedLines({nodes:[line('cached-error',21),line('real',41),line('dashed',61,true)]},sourceCanvas).nodes.map(n=>n.id),['real','dashed']);
paint(50,80,850,1,[135,135,135]);
assert.equal(rejectUnsupportedLines({nodes:[{...line('antialiased-table',80),stroke:'#222222',strokeWidth:1}]},sourceCanvas).nodes.length,1,'thin gray antialiased table rules survive');
// Restore measurable print strokes, keep ordinary empty boxes empty, and obey occlusion.
for(let y=115;y<190;y+=3){paint(110,y,35,1,[100,100,100]);paint(149,y,12,1,[100,100,100]);}
const paper={id:'paper',type:'rect',x:100,y:100,w:70,h:110,fill:'#ffffff',strokeWidth:1};
const occluder={id:'front',type:'rect',x:145,y:100,w:30,h:110,fill:'#ffffff'};
const inkScene=recoverDocumentInk({nodes:[paper,occluder,{...paper,id:'empty',x:250}]},sourceCanvas);
assert.deepEqual(inkScene.nodes.map(n=>n.id),['paper','paper_source_ink','front','empty']);
assert.match(inkScene.nodes[1].d,/M110 115h35/);
assert.ok(!inkScene.nodes[1].d.includes('M149'),'covered ink is not duplicated on the back sheet');
assert.equal(recoverDocumentInk(inkScene,sourceCanvas).nodes.length,inkScene.nodes.length,'source ink recovery is idempotent');
assert.equal(recoverDocumentInk({...inkScene,nodes:inkScene.nodes.filter(n=>n.id!=='paper')},sourceCanvas).nodes.some(n=>n.id==='paper_source_ink'),false,'deleting a paper removes its derived ink');
const movedPaper={...inkScene,nodes:inkScene.nodes.map(n=>n.id==='paper'?{...n,x:250}:n)};
assert.equal(recoverDocumentInk(movedPaper,sourceCanvas).nodes.some(n=>n.id==='paper_source_ink'),false,'moving a paper does not leave ink at its old position');
console.log('Source evidence: cached false lines, real/dashed lines, paper ink, occlusion and idempotence OK');

const modelInk={id:'model_ink',type:'line',x:110,y:115,x2:140,y2:115,stroke:'#000000',strokeWidth:1};
const replaced=recoverDocumentInk({nodes:[paper,modelInk,occluder]},sourceCanvas);
assert.ok(!replaced.nodes.some(n=>n.id==='model_ink'),'source ink replaces dark model strokes instead of overlaying them');
assert.ok(replaced.nodes.some(n=>n.sourceDetail==='untranscribed-ink'));
const blankInk={...modelInk,x:260,x2:290};
assert.ok(recoverDocumentInk({nodes:[{...paper,x:250},blankInk]},sourceCanvas).nodes.some(n=>n.id==='model_ink'),'without dense source evidence keep model strokes');

const panelOnly=planSemanticRegions({regions:[
  {id:'panel',kind:'panel',x:0,y:0,w:100,h:100},
  {id:'links',kind:'connectors',x:0,y:0,w:200,h:200}
]},200,200);
assert.deepEqual(panelOnly.filter(r=>r.kind!=='uncovered').map(r=>r.id),['panel'],'cross-panel connector bounds must not spawn overlapping content workers');
assert.ok(panelOnly.filter(r=>r.kind==='uncovered').every(r=>r.coreX>=100||r.coreY>=100),'gap workers do not own existing panel pixels');
const chartWithSidebar=planSemanticRegions({regions:[{id:'chart',x:100,y:0,w:900,h:600}]},1000,600);
assert.ok(chartWithSidebar.some(r=>r.kind==='uncovered'&&r.coreX===0&&r.coreRight===100&&r.coreBottom===600),'vertical captions outside model regions remain eligible for reconstruction');
const narrowGutter=planSemanticRegions({regions:[{id:'chart',x:10,y:0,w:990,h:600}]},1000,600);
assert.equal(narrowGutter.length,1,'tiny page gutters need no separate API call');

const fakePrint={id:'fake-print',type:'text',x:110,y:115,w:50,h:105,fontSize:6,text:'----------------------\n----------------------',fill:'#333333'};
const restoredPrint=recoverDocumentInk({nodes:[paper,fakePrint]},sourceCanvas);
assert.ok(!restoredPrint.nodes.some(n=>n.id==='fake-print'),'placeholder text must not block source print restoration');
assert.ok(restoredPrint.nodes.some(n=>n.sourceDetail==='untranscribed-ink'));
const readablePrint={...fakePrint,id:'real-text',text:'Readable document text'};
assert.ok(recoverDocumentInk({nodes:[paper,readablePrint]},sourceCanvas).nodes.some(n=>n.id==='real-text'),'real transcription remains editable text');

// Dense poster panels receive complete disjoint cores, with source-pixel overlap.
const posterDetails=planDetailRegions([{id:'panel',x:0,y:0,w:5504,h:3072}],5504,3072);
assert.equal(posterDetails.length,28);
assert.equal(posterDetails.reduce((sum,r)=>sum+(r.coreRight-r.coreX)*(r.coreBottom-r.coreY),0),5504*3072);
assert.ok(posterDetails.every(r=>r.coreRight-r.coreX<=900&&r.coreBottom-r.coreY<=900&&r.x>=0&&r.y>=0&&r.x+r.w<=5504&&r.y+r.h<=3072));
assert.equal(planDetailRegions([{id:'small',x:0,y:0,w:700,h:700}],700,700).length,0);
const detail=posterDetails[0];
const parentScene={nodes:[{...text,owner:'panel'},{...text,id:'foreign',owner:'other-panel'},
  {id:'frame',type:'rect',x:0,y:0,w:5504,h:3072,owner:'panel'}]};
assert.deepEqual(regionObjectCatalog(parentScene,detail).nodes.map(n=>n.id),['label']);
const refined=applyRegionPatch(parentScene,detail,{operations:[{op:'update',id:'label',node:{...text,text:'refined'}}]},snapshotVersions(parentScene));
assert.equal(refined.rejected.length,0);
assert.equal(refined.scene.nodes[0].text,'refined');
assert.equal(refined.scene.nodes[0].owner,detail.id);
assert.equal(regionObjectCatalog(refined.scene,detail).nodes.length,1,'retry can still edit a detail-owned object');
assert.ok(applyRegionPatch(parentScene,detail,{operations:[{op:'delete',id:'frame'}]},snapshotVersions(parentScene)).rejected.length);
assert.ok(applyRegionPatch(parentScene,detail,{operations:[{op:'delete',id:'foreign'}]},snapshotVersions(parentScene)).rejected.length);
for(const other of posterDetails.slice(1))assert.equal(regionObjectCatalog(refined.scene,other).nodes.some(n=>n.id==='label'),false);
console.log('Native-resolution detail coverage and inherited ownership tests passed');

// Recover a missing pastel body box only when all four source borders exist.
{
  const W=400,H=200,data=new Uint8ClampedArray(W*H*4).fill(255);
  for(let y=60;y<=110;y++)for(let x=80;x<=280;x++){
    const border=x===80||x===280||y===60||y===110;
    data.set(border?[30,30,30,255]:[255,236,190,255],(y*W+x)*4);
  }
  const canvas={width:W,height:H,getContext:()=>({getImageData:()=>({data})})};
  const label={id:'body-label',type:'text',x:100,y:70,w:140,h:20,text:'Memory',fontSize:18};
  const {recoverSourceBoxes}=await import('./reconstruction-pipeline.mjs');
  const fixed=recoverSourceBoxes({nodes:[label]},canvas);
  assert.equal(fixed.nodes.length,2);
  assert.equal(fixed.nodes[0].sourceDetail,'source-box');
  assert.equal(fixed.nodes[0].type,'rect');
  assert.equal(recoverSourceBoxes(fixed,canvas).nodes.length,2,'repeat repair must not duplicate source boxes');
  const grid=[{x:80,y:60,x2:80,y2:110},{x:280,y:60,x2:280,y2:110},
    {x:80,y:60,x2:180,y2:60},{x:180,y:60,x2:280,y2:60},{x:80,y:110,x2:280,y2:110}]
    .map((n,i)=>({...n,id:`grid-${i}`,type:'line',stroke:'#222222',strokeWidth:2}));
  assert.equal(recoverSourceBoxes({nodes:[...grid,label]},canvas).nodes.length,6,'shared and split table grid edges must not acquire duplicate cell frames');
  assert.equal(recoverSourceBoxes({nodes:[...grid.slice(1),label]},canvas).nodes.length,6,'an incomplete grid must still permit frame recovery');
  const outer={id:'table',type:'rect',x:20,y:20,w:260,h:130,stroke:'#222222',strokeWidth:2,radius:0};
  const outerGrid=[outer,grid[0],...grid.slice(2),label];
  assert.equal(recoverSourceBoxes({nodes:outerGrid},canvas).nodes.length,outerGrid.length,'outer table rectangle must supply the last column edge');
  for(let y=60;y<=110;y++)data.set([255,255,255,255],(y*W+80)*4);
  assert.equal(recoverSourceBoxes({nodes:[label]},canvas).nodes.length,1,'an open color region is not a missing framed box');
}
