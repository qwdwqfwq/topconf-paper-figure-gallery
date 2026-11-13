// User-intent layout regression: no live provider calls.
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const prompt='将三种图例移到上方并倒序排列；两个阶段并排；公式移到最下方，脚注放在公式上方。保留内容，不保留原位置。';
(async()=>{
 const {validateDiagramPlan,validateDiagramCheck,validateRevisionIntent}=await import('./revision-layout.mjs');
 const {requestedRevisionMode,resolveRevisionContainer}=await import('./revision-scope.mjs');
 const inset={x:688,y:648,width:302,height:132},panel={x:678,y:90,width:320,height:720};
 const candidate=(title,kind,region,match=true)=>({title,kind,region,matchesRequestedBackground:match});
 const wrongInset={regions:[inset],containerCandidates:[candidate('formula','inset',inset),candidate('C','panel',panel)]};
 assert.deepEqual(resolveRevisionContainer(wrongInset).regions,[panel]);
 assert.throws(()=>resolveRevisionContainer({...wrongInset,containerCandidates:[]}),/完整边界/);
 assert.throws(()=>resolveRevisionContainer({...wrongInset,containerCandidates:[...wrongInset.containerCandidates,candidate('D','panel',{x:0,y:90,width:320,height:720})]}),/多个/);
 for(const text of [prompt,'把图例放到流程图上方','左右交换模块','按 B、A、C 排列'])assert.equal(requestedRevisionMode('auto',text),'reflow',text);
 assert.equal(requestedRevisionMode('auto','不要优化布局，只改标题'),null);assert.equal(requestedRevisionMode('local',prompt),'local');
 const rows=[['title',100,50,180,50,410,20],['legend_A',100,200,140,70,700,130],['legend_B',400,200,140,70,400,130],['legend_C',700,200,140,70,100,130],['stage_1',400,400,180,70,250,350],['stage_2',400,550,180,70,600,350],['equation',100,700,500,60,200,800],['footer',100,850,500,40,200,700]];
 const plan={kind:'connected-diagram',layout:prompt,coordinateSpace:'pixels',requirements:[{id:'order',request:'图例移到上方并倒序排列'},{id:'stages',request:'两个阶段并排'},{id:'bottom',request:'公式最下方，脚注在其上方'}],items:rows.map(([id,x,y,width,height,tx,ty])=>({id,label:id,appearance:'purple filled box',keep:true,source:{x,y,width,height},target:{x:tx,y:ty,width,height}})),edges:[{from:'stage_1',to:'stage_2',label:''}],geometry:{coordinateOwner:'planner',compactRequired:false,requireIntentAudit:true}};
 validateDiagramPlan(plan,1000,1000);
 const center=r=>({x:r.x+r.width/2,y:r.y+r.height/2});
 const audit=()=>({passed:true,layoutChanged:true,moreCompact:false,requestSatisfied:true,requirements:plan.requirements.map(r=>({...r,satisfied:true,evidence:'Measured requested ordering, parallel stages and moved footer/equations'})),unmetRequirements:[],items:plan.items.map(i=>({id:i.id,matches:true,observedCount:1,originalCenter:center(i.source),observedCenter:center(i.target),evidence:'Measured visible '+i.label})),connections:plan.edges.map(e=>({...e,matches:true,evidence:'Visible direct arrow'}))});
 validateDiagramCheck(audit(),plan,{width:1000,height:1000});validateRevisionIntent(audit(),plan.requirements);
 const cosmetic=audit();cosmetic.items.forEach(i=>i.observedCenter={...i.originalCenter});assert.throws(()=>validateRevisionIntent(cosmetic,plan.requirements),/实质改变/);
 const unmet=audit();unmet.requirements[0].satisfied=false;assert.throws(()=>validateRevisionIntent(unmet,plan.requirements),/具体布局要求/);
 const missing=audit();missing.requirements.pop();assert.throws(()=>validateDiagramCheck(missing,plan,{width:1000,height:1000}),/要求/);
 const unchanged=audit();unchanged.items.forEach(i=>i.observedCenter={...i.originalCenter});assert.throws(()=>validateDiagramCheck(unchanged,plan,{width:1000,height:1000}),/相对位置|实际位移/);
 const translated=audit();translated.items.forEach(i=>i.observedCenter={x:i.originalCenter.x+5,y:i.originalCenter.y+5});assert.throws(()=>validateDiagramCheck(translated,plan,{width:1000,height:1000}),/相对位置|实际位移/);
 const duplicate=audit();duplicate.items[1].observedCount=2;assert.throws(()=>validateDiagramCheck(duplicate,plan),/未通过/);
 const wrongArrow=audit();wrongArrow.connections[0].to='legend_A';assert.throws(()=>validateDiagramCheck(wrongArrow,plan),/连线/);
 const missingMeasurement=audit();delete missingMeasurement.items[1].originalCenter;assert.throws(()=>validateDiagramCheck(missingMeasurement,plan,{width:1000,height:1000}),/独立位置/);
 const small=structuredClone(plan);delete small.geometry;small.items.forEach(i=>i.target={...i.source});small.items[0].target.x+=5;validateDiagramPlan(small,1000,1000);
 const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
 const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
  const page=await browser.newPage({serviceWorkers:'block'}),origin=`http://127.0.0.1:${server.address().port}`;
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());await page.goto(origin+'/forge/');
  const result=await page.evaluate(async({prompt,planned})=>{
   const {retainedReflow}=await import('./revision-layout.mjs');
   const c=document.createElement('canvas');c.width=1000;c.height=1000;const ctx=c.getContext('2d');ctx.fillStyle='#f5f5f5';ctx.fillRect(0,0,1000,1000);ctx.strokeStyle='black';ctx.strokeRect(1,1,998,998);
   for(const item of planned.items){const s=item.source;ctx.fillStyle='#6747b5';ctx.fillRect(s.x,s.y,s.width,s.height);ctx.fillStyle='white';ctx.font='20px sans-serif';ctx.fillText(item.label,s.x+5,s.y+30);}const source=c.toDataURL();
   const loadImage=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});
   const originalFetch=window.fetch;let calls=0,generated=0;
   window.fetch=async(url,init)=>{
    const request=JSON.parse(init.body),content=request.messages[0].content,text=content[0].text;calls++;
    if(request.model==='gemini-3.1-pro-preview'&&request.reasoning_effort!=='low')throw Error('revision analysis missed reasoning configuration');
    let response;
    if(calls===1){if(!text.includes(prompt)||!text.includes('Preserving CONTENT never implies preserving POSITION'))throw Error('planner lost intent');response={...planned,coordinateSpace:'normalized-1000',items:planned.items.map(i=>({...i,target:{cx:i.target.x+i.target.width/2,cy:i.target.y+i.target.height/2,width:i.target.width,height:i.target.height}}))};}
    else if(calls===2){if(!text.includes('SOURCE INVENTORY REVIEW')||content.filter(c=>c.type==='image_url').length!==4)throw Error('source review missing');response={items:planned.items.map(i=>({...i,target:{cx:0,cy:0,width:1,height:1},bounds:{left:i.source.x,top:i.source.y,right:i.source.x+i.source.width,bottom:i.source.y+i.source.height}})),edges:planned.edges,preserveBands:{topEnd:300,bottomStart:650}};}
    else{
     if(text.includes('FAILED validation'))throw Error(text.split('FAILED validation:')[1].slice(0,300));
     if(!text.includes('Expected positions are deliberately withheld')||text.includes('"target"')||text.includes('"source"'))throw Error('audit leaked expected coordinates');
     if(!text.includes(prompt)||!text.includes('confirmed whole grey C panel'))throw Error('confirmed request/scope lost');
     const center=r=>({x:r.x+r.width/2,y:r.y+r.height/2});
     response={passed:true,layoutChanged:true,moreCompact:false,requestSatisfied:true,requirements:planned.requirements.map(r=>({...r,satisfied:true,evidence:'Measured requested order and grouping'})),unmetRequirements:[],items:planned.items.map(i=>({id:i.id,matches:true,observedCount:1,originalCenter:center(i.source),observedCenter:center(i.target),evidence:'Measured '+i.label})),connections:planned.edges.map(e=>({...e,matches:true,evidence:'Direct visible arrow'}))};
    }
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(response)}}]}));
   };
   const timer=setInterval(()=>document.querySelector('[data-layout-accept="true"]')?.click(),20);
   try{
    const result=await retainedReflow({image:source,confirmedRevisionScope:{summary:'confirmed whole grey C panel'},route:{p:'infistar',base:'https://example.invalid/v1'}},prompt,{key:'offline-test',loadImage},async()=>{generated++;throw Error('native content should not be regenerated');});
    const decoded=await loadImage(result.image),after=document.createElement('canvas');after.width=1000;after.height=1000;after.getContext('2d').drawImage(decoded,0,0);
    const oldFooter=after.getContext('2d').getImageData(120,870,1,1).data,restoredOldBands=oldFooter[0]===103&&oldFooter[1]===71;
    return {calls,generated,restoredOldBands,targets:result.revisionAudit.layout.items.map(i=>({id:i.id,target:i.target})),geometry:result.revisionAudit.layout.geometry,retention:result.revisionAudit.retention};
   }finally{clearInterval(timer);window.fetch=originalFetch;}
  },{prompt,planned:plan});
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
  await page.evaluate(async()=>{
   const {refineRevisionPixels}=await import('./revision-pixels.mjs');
   const {verifyDiagramRaster,validateDiagramCheck}=await import('./revision-layout.mjs');
   const source=document.createElement('canvas');source.width=500;source.height=500;const ctx=source.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,500,500);
   for(const [x,label] of [[100,'A'],[300,'B']]){ctx.fillStyle='#8844aa';ctx.fillRect(x,150,100,70);ctx.fillStyle='white';ctx.font='20px sans-serif';ctx.fillText(label,x+20,185);}
   const image=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=source.toDataURL();});
   const plan={items:['a','b'].map((id,n)=>({id,keep:true,appearance:'purple box',source:{x:100+n*200,y:150,width:100,height:70}})),edges:[],preserveBands:{topEnd:50,bottomStart:400},geometry:{coordinateOwner:'planner',compactRequired:false,requireIntentAudit:true}};
   const crops=refineRevisionPixels(image,plan);plan.items[0].target.x+=10;
   const final=document.createElement('canvas');final.width=500;final.height=500;const fc=final.getContext('2d');fc.fillStyle='white';fc.fillRect(0,0,500,500);for(const i of plan.items)fc.drawImage(crops.get(i.id),i.target.x,i.target.y);
   const center=r=>({x:(r.x+r.width/2)*2,y:(r.y+r.height/2)*2});
   const audit={passed:true,layoutChanged:true,moreCompact:true,requestSatisfied:true,requirements:[{request:'move A closer to B',satisfied:true,evidence:'A moves right; B remains fixed'}],unmetRequirements:[],items:plan.items.map(i=>({id:i.id,matches:true,observedCount:1,evidence:'visible original text',originalCenter:center(i.source),observedCenter:{...center(i.target),y:center(i.target).y+20}}))};
   const reject=(fn,label)=>{let failed=false;try{fn();}catch{failed=true;}if(!failed)throw Error(label);};
   reject(()=>validateDiagramCheck(structuredClone(audit),plan,{width:500,height:500},plan.preserveBands),'uncertified noisy measurements accepted');
   reject(()=>verifyDiagramRaster(source,plan,crops),'unchanged actual raster accepted');
   const proof=verifyDiagramRaster(final,plan,crops);validateDiagramCheck(structuredClone(audit),plan,{width:500,height:500},plan.preserveBands,proof);
   reject(()=>validateDiagramCheck(structuredClone(audit),plan,{width:500,height:500},plan.preserveBands,{...proof}),'forged serialized proof accepted');
   const wrong=structuredClone(audit);wrong.items[0].observedCount=2;reject(()=>validateDiagramCheck(wrong,plan,{width:500,height:500},plan.preserveBands,proof),'pixel proof bypassed independent content audit');
   const misplaced=structuredClone(audit);misplaced.items[0].observedCenter.x+=100;reject(()=>validateDiagramCheck(misplaced,plan,{width:500,height:500},plan.preserveBands,proof),'pixel proof bypassed visual placement audit');
   const moved=structuredClone(plan);moved.items[0].target.x+=1;reject(()=>validateDiagramCheck(structuredClone(audit),moved,{width:500,height:500},moved.preserveBands,proof),'stale plan certificate accepted');
   fc.clearRect(plan.items[0].target.x,plan.items[0].target.y,1,1);reject(()=>verifyDiagramRaster(final,plan,crops),'final composition overwrite accepted');
  });
  const scope=await page.evaluate(async(prompt)=>{
   const {planRevision}=await import('./revision-scope.mjs');
   const c=document.createElement('canvas');c.width=1000;c.height=1000;const bg=c.getContext('2d');bg.fillStyle='#f3f3f3';bg.fillRect(0,0,1000,1000);bg.fillStyle='#fae8d8';bg.fillRect(0,850,1000,150);
   const loadImage=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});
   const prior=window.fetch;let calls=0;
   window.fetch=async(url,init)=>{if(String(url).startsWith('data:'))return prior(url,init);calls++;const text=JSON.parse(init.body).messages[0].content[0].text;if(!text.includes(prompt))throw Error('scope lost user prompt');if(calls===2&&(!text.includes('INDEPENDENT CONTAINER INVENTORY')||text.includes('Previous scope:')))throw Error('missing container review');const plan={mode:'reflow',scopeType:'container',summary:'完整灰色面板',preserve:'框外保留',regions:[calls===1?{x:600,y:700,width:400,height:100}:{x:600,y:100,width:400,height:700}],coordinateSpace:'normalized-1000',needsClarification:false,question:'',containerCandidates:[{title:'full gray panel',kind:'panel',matchesRequestedBackground:true,region:{x:600,y:100,width:400,height:700}},{title:'warm panel misclassified as gray',kind:'panel',matchesRequestedBackground:true,region:{x:0,y:850,width:1000,height:150}},{title:'nested formula',kind:'inset',matchesRequestedBackground:true,region:{x:600,y:700,width:400,height:100}}]};return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(plan)}}]}));};
   try{return await planRevision({image:c.toDataURL(),route:{p:'infistar',base:'https://example.invalid/v1'},revisionMode:'auto'},prompt,{key:'offline-test',loadImage,toDataURL:async src=>src});}finally{window.fetch=prior;}
  },'这一块灰色的，内容保持，优化排版，减少空白');
  assert.deepEqual(scope.regions,[{x:600,y:100,width:400,height:700}]);assert.equal(scope.apiRequestCount,2);
  const quotaError=await page.evaluate(async()=>{
   const {revisionPlanner}=await import('./revision-layout.mjs'),prior=window.fetch;
   window.fetch=async()=>new Response(JSON.stringify({error:{code:'insufficient_user_quota',message:'untrusted provider detail'}}),{status:403});
   try{await revisionPlanner({route:{p:'infistar',base:'https://example.invalid/v1'}},[],{key:'offline-test'},100);throw Error('quota failure accepted');}
   catch(e){return e.message;}finally{window.fetch=prior;}
  });
  assert.match(quotaError,/账户余额不足/);assert.doesNotMatch(quotaError,/untrusted provider detail|offline-test/);
  for(const p of plan.items){const actual=result.targets.find(i=>i.id===p.id).target;assert.ok(Math.abs(actual.x+actual.width/2-p.target.x-p.target.width/2)<=1&&Math.abs(actual.y+actual.height/2-p.target.y-p.target.height/2)<=1,'crop refinement must preserve planner destination center');}
  assert.equal(result.geometry.coordinateOwner,'planner');assert.equal(result.calls,3);assert.equal(result.generated,0);assert.equal(result.retention,'pixel-internal-nodes');assert.equal(result.restoredOldBands,false);
  console.log(JSON.stringify({passed:true,retainedItems:plan.items.length,browser:result,adversarial:['unchanged','translation','duplicate','wrong arrow','missing measurement','missing requirement','old preserved bands','source review target override'],liveAPICalls:0},null,2));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
