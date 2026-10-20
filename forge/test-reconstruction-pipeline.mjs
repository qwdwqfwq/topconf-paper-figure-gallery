import assert from 'node:assert/strict';
import {applyRegionPatch,snapshotVersions,planSemanticRegions,expandStructuredNodes,regionObjectCatalog,fitSourceFills,calibrateShapeGeometry,rollbackRegionChanges,rejectUnsupportedLines,recoverDocumentInk,repairStructuralLayers} from './reconstruction-pipeline.mjs';

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
console.log('Semantic patches: atomicity, ownership, conflicts, split/merge and dense primitives OK');

const excludedRegion={...region,excludeRects:[{x:10,y:10,w:70,h:50}]};
assert.equal(regionObjectCatalog(scene,excludedRegion).nodes.length,0);
assert.equal(regionObjectCatalog(scene,excludedRegion).readOnlyContext.length,1);
assert.equal(applyRegionPatch(scene,excludedRegion,{operations:[{op:'delete',id:'label'}]},versions).rejected.length,1);
const headingPixels=new Uint8ClampedArray(400*400*4).fill(255);
for(let y=30;y<60;y++)for(let x=50;x<350;x++){const i=(y*400+x)*4;headingPixels.set([180,210,230,255],i);}
const headingCanvas={width:400,height:400,getContext:()=>({getImageData:(x,y,w,h)=>({data:w===1&&h===1?headingPixels.slice((y*400+x)*4,(y*400+x)*4+4):headingPixels})})};
const headingScene={nodes:[{id:'title',type:'text',x:80,y:30,w:240,h:30,fontSize:25,text:'Title'},{id:'frame',type:'rect',x:5,y:40,w:390,h:150},{id:'duplicate',type:'rect',x:6,y:41,w:389,h:149}]};
const layered=repairStructuralLayers(headingScene,headingCanvas);
assert.equal(layered.nodes.filter(n=>n.sourceDetail==='heading-strip').length,1);
assert.equal(layered.nodes.filter(n=>n.id==='duplicate').length,0);
assert.equal(layered.nodes.at(-1).id,'title');
assert.equal(layered.nodes.at(-2).sourceDetail,'heading-strip');
assert.deepEqual(repairStructuralLayers(layered,headingCanvas),layered,'structural recovery is idempotent');
const distinctLayers=repairStructuralLayers({nodes:[
  {id:'ownership',type:'rect',x:5,y:40,w:390,h:150,fill:'none',stroke:'none'},
  {id:'visible-frame',type:'rect',x:5,y:40,w:390,h:150,fill:'none',stroke:'#000000'}
]},headingCanvas);
assert.ok(distinctLayers.nodes.some(n=>n.id==='visible-frame'),'an invisible ownership rectangle must not remove a visible border');

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
assert.deepEqual(panelOnly.map(r=>r.id),['panel'],'cross-panel connector bounds must not spawn overlapping content workers');

const fakePrint={id:'fake-print',type:'text',x:110,y:115,w:50,h:105,fontSize:6,text:'----------------------\n----------------------',fill:'#333333'};
const restoredPrint=recoverDocumentInk({nodes:[paper,fakePrint]},sourceCanvas);
assert.ok(!restoredPrint.nodes.some(n=>n.id==='fake-print'),'placeholder text must not block source print restoration');
assert.ok(restoredPrint.nodes.some(n=>n.sourceDetail==='untranscribed-ink'));
const readablePrint={...fakePrint,id:'real-text',text:'Readable document text'};
assert.ok(recoverDocumentInk({nodes:[paper,readablePrint]},sourceCanvas).nodes.some(n=>n.id==='real-text'),'real transcription remains editable text');
