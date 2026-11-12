// Recorded inventory regression + browser execution, no live provider calls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const prompt='这一块灰色的，我觉得里面的内容可以保持，但是让里面的排版布局稍微优化一些，不要出现大块的空余的空间，显得不好看';
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/revision-connected-panel.json'),'utf8'));
(async()=>{
 const {compactDiagramPlan,validateDiagramPlan,validateDiagramCheck}=await import('./revision-layout.mjs');
 const {requestedRevisionMode,resolveRevisionContainer}=await import('./revision-scope.mjs');
 const inset={x:688,y:648,width:302,height:132},panel={x:678,y:90,width:320,height:720};
 const candidate=(title,kind,region,match=true)=>({title,kind,region,matchesRequestedBackground:match});
 const wrongInset={regions:[inset],containerCandidates:[candidate('formula','inset',inset),candidate('C. Two-Stage Evaluation','panel',panel),candidate('A','panel',{x:0,y:90,width:320,height:720},false)]};
 assert.deepEqual(resolveRevisionContainer(wrongInset).regions,[panel],'nested formula agreement must not override the complete gray panel');
 assert.throws(()=>resolveRevisionContainer({...wrongInset,containerCandidates:[]}),/完整边界/);
 assert.throws(()=>resolveRevisionContainer({...wrongInset,containerCandidates:[...wrongInset.containerCandidates,candidate('D','panel',{x:0,y:90,width:320,height:720})]}),/多个/);
 const realInventory=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/revision-real-panel-inventory.json'),'utf8'));
 compactDiagramPlan(realInventory,1000,1000,prompt);validateDiagramPlan(realInventory,1000,1000);
 for(const item of realInventory.items){
  assert.ok(Math.abs(item.target.x-item.source.x)<=60,'slight optimization must limit horizontal displacement');
  assert.ok(Math.abs(item.target.y-item.source.y)<=60,'slight optimization must limit vertical displacement');
 }
 const realOuter=realInventory.items.filter(i=>i.keep&&i.source.y>=realInventory.preserveBands.topEnd&&i.source.y+i.source.height<=realInventory.preserveBands.bottomStart&&i.source.x+i.source.width>900);
 assert.equal(realOuter.length,6,'retain both outcome stacks from the real source');
 for(const a of realOuter)for(const b of realOuter)assert.equal(a.target.x-a.source.x,b.target.x-b.source.x,'different parent branches must keep the original aligned outcome column');
 for(const i of realOuter)assert.ok(i.target.x+i.target.width>=i.source.x+i.source.width-20,'do not create a new empty right margin');
 assert.equal(requestedRevisionMode('auto',prompt),'reflow');
 assert.equal(requestedRevisionMode('auto','不要优化布局，只改标题'),null);
 assert.equal(requestedRevisionMode('local',prompt),'local');
 const plan=structuredClone(fixture);plan.items.forEach(i=>i.target={...i.source});
 compactDiagramPlan(plan,1000,1000,prompt);validateDiagramPlan(plan,1000,1000);
 assert.ok(plan.geometry.target.largestBlank<plan.geometry.source.largestBlank*.8);
 assert.equal(JSON.stringify(plan.edges),JSON.stringify(fixture.edges));
 // A smaller internal blank must not be bought by abandoning an outer column.
 for(const i of plan.items.filter(i=>i.keep&&i.source.y>=120&&i.source.y+i.source.height<=650)){
  if(i.source.x+i.source.width>900)assert.ok(i.target.x+i.target.width>=i.source.x+i.source.width-20);
  if(i.source.x<100)assert.ok(i.target.x<=i.source.x+20);
 }
 const outer=plan.items.filter(i=>i.keep&&i.source.y>=120&&i.source.y+i.source.height<=650&&i.source.x+i.source.width>900);
 for(const a of outer)for(const b of outer)if(Math.abs(a.source.x-b.source.x)<30&&Math.abs(a.source.width-b.source.width)<30)assert.equal(a.target.x-a.source.x,b.target.x-b.source.x,'aligned branches must retain their column');
 for(const i of plan.items){assert.equal(i.label,fixture.items.find(j=>j.id===i.id).label);assert.equal(i.target.width,i.source.width);assert.equal(i.target.height,i.source.height);if(i.source.y>=650||i.source.y+i.source.height<=120)assert.deepEqual(i.target,i.source);}
 const center=r=>({x:r.x+r.width/2,y:r.y+r.height/2});
 const audit=()=>({passed:true,layoutChanged:true,moreCompact:true,unmetRequirements:[],items:plan.items.map(i=>({id:i.id,matches:true,observedCount:1,originalCenter:center(i.source),observedCenter:center(i.target),evidence:'Measured visible text '+i.label})),connections:plan.edges.map(e=>({...e,matches:true,evidence:'Visible direct arrow'}))});
 validateDiagramCheck(audit(),plan,{width:1000,height:1000},plan.preserveBands);
 const unchanged=audit();unchanged.items.forEach(i=>i.observedCenter={...i.originalCenter});assert.throws(()=>validateDiagramCheck(unchanged,plan,{width:1000,height:1000},plan.preserveBands),/相对位置|实际位移/);
 const translated=audit();translated.items.forEach(i=>i.observedCenter={x:i.originalCenter.x+5,y:i.originalCenter.y+5});assert.throws(()=>validateDiagramCheck(translated,plan,{width:1000,height:1000},plan.preserveBands),/相对位置|实际位移/);
 const duplicate=audit();duplicate.items[1].observedCount=2;assert.throws(()=>validateDiagramCheck(duplicate,plan),/未通过/);
 const wrongArrow=audit();wrongArrow.connections[0].to='stalled';assert.throws(()=>validateDiagramCheck(wrongArrow,plan),/连线/);
 const missingMeasurement=audit();delete missingMeasurement.items[1].originalCenter;assert.throws(()=>validateDiagramCheck(missingMeasurement,plan,{width:1000,height:1000},plan.preserveBands),/独立位置/);
 // Small valid moves used to be rejected by a fixed 12% movement threshold.
 const small=structuredClone(plan);delete small.geometry;small.items.forEach(i=>i.target={...i.source});small.items.find(i=>i.id==='stage_1').target.x+=5;validateDiagramPlan(small,1000,1000);
 for(const [width,height] of [[800,1000],[1435,1815]]){
  const scaled=structuredClone(fixture);for(const i of scaled.items){i.source={x:Math.floor(i.source.x*width/1000),y:Math.floor(i.source.y*height/1000),width:Math.floor(i.source.width*width/1000),height:Math.floor(i.source.height*height/1000)};i.target={...i.source};}scaled.preserveBands={topEnd:Math.floor(120*height/1000),bottomStart:Math.floor(650*height/1000)};
  compactDiagramPlan(scaled,width,height,prompt);validateDiagramPlan(scaled,width,height);
 }
 const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
 const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
  const page=await browser.newPage({serviceWorkers:'block'}),origin=`http://127.0.0.1:${server.address().port}`;
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());await page.goto(origin+'/forge/');
  const result=await page.evaluate(async({fixture,prompt})=>{
   const {retainedReflow}=await import('./revision-layout.mjs');
   const c=document.createElement('canvas');c.width=1000;c.height=1000;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1000,1000);ctx.fillStyle='#6747b5';ctx.fillRect(0,0,1000,120);ctx.fillStyle='#579e61';ctx.fillRect(0,650,1000,350);ctx.strokeStyle='black';ctx.strokeRect(1,1,998,998);const source=c.toDataURL();
   const loadImage=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});
   const originalFetch=window.fetch;let calls=0,generated=0,currentPlan;
   window.fetch=async(url,init)=>{
    const request=JSON.parse(init.body),content=request.messages[0].content,text=content[0].text;calls++;
    if(request.model==='gemini-3.1-pro-preview'&&request.reasoning_effort!=='low')throw Error('Gemini 3.1 revision analysis missed low reasoning configuration');
    if(calls===1){if(!text.includes(prompt)||/more than 100|>150|at least 150/i.test(text))throw Error('conflicting planner prompt');return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(fixture)}}]}));}
    if(calls===2){if(!text.includes(prompt)||!text.includes('SOURCE INVENTORY REVIEW')||content.filter(c=>c.type==='image_url').length!==4)throw Error('missing independent source review');const reviewed={...fixture,preserveBands:{topEnd:100,bottomStart:850},items:fixture.items.map(i=>({...i,bounds:{left:i.source.x,top:i.source.y,right:i.source.x+i.source.width,bottom:i.source.y+i.source.height}}))};return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(reviewed)}}]}));}
    if(!text.includes('Expected positions are deliberately withheld')||text.includes('\"target\"')||text.includes('\"source\"'))throw Error('audit leaked expected coordinates');
    if(!text.includes(prompt)||!text.includes('originalCenter'))throw Error('missing audit request');
    if(!text.includes('CONFIRMED EDIT SCOPE')||!text.includes('confirmed whole grey C panel')||!text.includes('never to a smaller nested formula inset'))throw Error('confirmed scope lost during audit');
    const {compactDiagramPlan}=await import('./revision-layout.mjs');currentPlan=structuredClone(fixture);currentPlan.items.forEach(i=>i.target={...i.source});compactDiagramPlan(currentPlan,1000,1000,prompt);
    const center=r=>({x:(r.x+r.width/2),y:(r.y+r.height/2)});
    const check={passed:true,layoutChanged:true,moreCompact:true,unmetRequirements:[],items:currentPlan.items.map(i=>({id:i.id,matches:true,observedCount:1,originalCenter:center(i.source),observedCenter:center(i.target),evidence:'mock measured '+i.label})),connections:currentPlan.edges.map(e=>({...e,matches:true,evidence:'mock direct arrow'}))};
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(check)}}]}));
   };
   const timer=setInterval(()=>{const d=document.querySelector('[data-layout-review]');if(!d)return;if(!d.querySelector('[data-layout-preview]'))throw Error('missing actual preview');d.querySelector('[data-layout-accept="true"]').click();},20);
   try{
    const result=await retainedReflow({image:source,confirmedRevisionScope:{summary:'confirmed whole grey C panel'},route:{p:'infistar',base:'https://example.invalid/v1'}},prompt,{key:'offline-test',loadImage},async(parent,instruction)=>{
     generated++;if(!instruction.includes(prompt))throw Error('user request lost before generation');if(!parent.diagramContentReference)throw Error('target draft missing');
     // The public visual checklist contains flow-relative targets; recover full
     // panel plan independently using the same fixture for this protocol test.
     const {compactDiagramPlan}=await import('./revision-layout.mjs');currentPlan=structuredClone(fixture);currentPlan.items.forEach(i=>i.target={...i.source});compactDiagramPlan(currentPlan,1000,1000,prompt);
     return {image:parent.diagramContentReference};
    });
    const decoded=await loadImage(result.image),after=document.createElement('canvas');after.width=1000;after.height=1000;after.getContext('2d').drawImage(decoded,0,0);const beforePixels=ctx.getImageData(0,0,1000,1000).data,afterPixels=after.getContext('2d').getImageData(0,0,1000,1000).data;let preservedBytes=0;
    for(let y=0;y<1000;y++)if(y<120||y>=650)for(let x=0;x<4000;x++){const index=y*4000+x;if(beforePixels[index]!==afterPixels[index])throw Error('static-band pixels changed');preservedBytes++;}
    return {calls,generated,preservedBytes,geometry:result.revisionAudit.layout.geometry,retention:result.revisionAudit.retention};
   }finally{clearInterval(timer);window.fetch=originalFetch;}
  },{fixture,prompt});
  const pixelRegression=await page.evaluate(async()=>{
   const {refineRevisionPixels,verifyRevisionPixels,revisionBackground}=await import('./revision-pixels.mjs');
   const c=document.createElement('canvas');c.width=500;c.height=500;const ctx=c.getContext('2d');ctx.fillStyle='#f5f5f5';ctx.fillRect(0,0,500,500);ctx.fillStyle='#8844aa';ctx.fillRect(100,150,120,70);ctx.fillStyle='white';ctx.font='20px sans-serif';ctx.fillText('Exact',110,185);
   ctx.strokeStyle='#aaaaaa';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(12,500);ctx.moveTo(488,0);ctx.lineTo(488,500);ctx.stroke();
   ctx.fillStyle='black';ctx.fillRect(60,70,10,20);ctx.fillRect(100,70,10,20);ctx.fillStyle='rgb(225,232,239)';ctx.fillRect(80,75,3,10);
   const image=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=c.toDataURL();});
   const textPlan={items:[{id:'caption',keep:true,appearance:'unboxed black caption',source:{x:55,y:65,width:60,height:30}}],preserveBands:{topEnd:50,bottomStart:400}};
   const textCrops=refineRevisionPixels(image,textPlan),caption=textPlan.items[0].source,captionPixels=textCrops.get('caption').getContext('2d');
   if(captionPixels.getImageData(80-caption.x,75-caption.y,1,1).data[3]!==0)throw Error('pale arrow residue retained in caption');
   if(captionPixels.getImageData(62-caption.x,72-caption.y,1,1).data[3]!==255)throw Error('black glyph lost while removing arrow residue');
   const background=document.createElement('canvas');background.width=500;background.height=350;revisionBackground(background.getContext('2d'),image,textPlan.preserveBands,textPlan);
   for(const x of [12,488])if(background.getContext('2d').getImageData(x,100,1,1).data[0]!==ctx.getImageData(x,150,1,1).data[0])throw Error('continuous enclosing border broken');
   const plan={items:[{id:'box',keep:true,appearance:'purple box',source:{x:100,y:150,width:114,height:70}}],preserveBands:{topEnd:50,bottomStart:400}};
   const crops=refineRevisionPixels(image,plan),item=plan.items[0];if(item.source.x>100||item.source.x+item.source.width<220)throw Error('full border not recovered');
   for(const appearance of ['bold/regular, purple background','white text, red background','colored fill','紫色背景']){
    const reviewed={...plan,items:[{id:'reviewed',keep:true,appearance,source:{x:100,y:150,width:114,height:70}}]};
    const crop=refineRevisionPixels(image,reviewed).get('reviewed'),s=reviewed.items[0].source;
    if(s.x+s.width<220)throw Error('background-only description lost full box');
    const retained=crop.getContext('2d').getImageData(105-s.x,155-s.y,1,1).data;
    if(retained[0]!==136||retained[1]!==68||retained[2]!==170||retained[3]!==255)throw Error('background-only description erased colored fill');
   }
   item.target={...item.source,x:250};const out=document.createElement('canvas');out.width=500;out.height=500;out.getContext('2d').drawImage(crops.get('box'),item.target.x,item.target.y);
   const proof=verifyRevisionPixels(out,plan,crops);out.getContext('2d').clearRect(item.target.x,item.target.y,item.target.width,item.target.height);let rejected=false;try{verifyRevisionPixels(out,plan,crops);}catch{rejected=true;}if(!rejected)throw Error('missing actual pixels accepted');return proof;
  });
  assert.equal(pixelRegression.verified,true);
  const scope=await page.evaluate(async(prompt)=>{
   const {planRevision}=await import('./revision-scope.mjs');
   const c=document.createElement('canvas');c.width=1000;c.height=1000;const bg=c.getContext('2d');bg.fillStyle='#f3f3f3';bg.fillRect(0,0,1000,1000);bg.fillStyle='#fae8d8';bg.fillRect(0,850,1000,150);
   const loadImage=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});
   const prior=window.fetch;let calls=0;
   window.fetch=async(url,init)=>{if(String(url).startsWith('data:'))return prior(url,init);calls++;const text=JSON.parse(init.body).messages[0].content[0].text;if(!text.includes(prompt))throw Error('scope lost user prompt');if(calls===2&&(!text.includes('INDEPENDENT CONTAINER INVENTORY')||text.includes('Previous scope:')))throw Error('missing container review');const plan={mode:'reflow',scopeType:'container',summary:'完整灰色面板',preserve:'框外保留',regions:[calls===1?{x:600,y:700,width:400,height:100}:{x:600,y:100,width:400,height:700}],coordinateSpace:'normalized-1000',needsClarification:false,question:'',containerCandidates:[{title:'full gray panel',kind:'panel',matchesRequestedBackground:true,region:{x:600,y:100,width:400,height:700}},{title:'warm panel misclassified as gray',kind:'panel',matchesRequestedBackground:true,region:{x:0,y:850,width:1000,height:150}},{title:'nested formula',kind:'inset',matchesRequestedBackground:true,region:{x:600,y:700,width:400,height:100}}]};return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(plan)}}]}));};
   try{return await planRevision({image:c.toDataURL(),route:{p:'infistar',base:'https://example.invalid/v1'},revisionMode:'auto'},prompt,{key:'offline-test',loadImage,toDataURL:async src=>src});}finally{window.fetch=prior;}
  },prompt);
  assert.deepEqual(scope.regions,[{x:600,y:100,width:400,height:700}]);assert.equal(scope.apiRequestCount,2);
  const quotaError=await page.evaluate(async()=>{
   const {revisionPlanner}=await import('./revision-layout.mjs'),prior=window.fetch;
   window.fetch=async()=>new Response(JSON.stringify({error:{code:'insufficient_user_quota',message:'untrusted provider detail'}}),{status:403});
   try{await revisionPlanner({route:{p:'infistar',base:'https://example.invalid/v1'}},[],{key:'offline-test'},100);throw Error('quota failure accepted');}
   catch(e){return e.message;}finally{window.fetch=prior;}
  });
  assert.match(quotaError,/账户余额不足/);assert.doesNotMatch(quotaError,/untrusted provider detail|offline-test/);
  assert.equal(result.calls,3);assert.equal(result.generated,0);assert.equal(result.retention,'pixel-internal-nodes');console.log(JSON.stringify({passed:true,exactPrompt:prompt,geometry:plan.geometry,browser:result,adversarial:['unchanged','translation','duplicate','wrong arrow','missing measurement'],liveAPICalls:0},null,2));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
