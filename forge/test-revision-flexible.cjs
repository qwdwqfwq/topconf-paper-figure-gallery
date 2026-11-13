// Offline browser regression for freely resized and reoriented Step 3 layouts.
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
 const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
 const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
  const page=await browser.newPage({serviceWorkers:'block'}),origin=`http://127.0.0.1:${server.address().port}`;
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());await page.goto(origin+'/forge/');
  // No simulated acceptance: every reflow must finish without a review popup.
  await page.evaluate(()=>{HTMLDialogElement.prototype.showModal=function(){throw Error('Step 3 must continue automatically without a review dialog');};});
  for(const mode of ['resize','reshape','redesign','retry']){
   const result=await page.evaluate(async mode=>{
    const {retainedReflow}=await import('./revision-layout.mjs');
    const prompt='保留所有原元素，优化整个区域的设计，允许缩小放大、改变形状和换行，把原来的从左到右改为从上到下。';
    const items=['A','B','C'].map((id,n)=>({id,label:id,appearance:'purple filled box',keep:true,source:{x:80+n*320,y:150,width:160,height:80},target:[{x:420,y:70,width:160,height:80},{x:440,y:360,width:120,height:60},{x:360,y:700,width:240,height:120}][n]}));
    if(mode==='reshape')items[1].target={x:400,y:360,width:200,height:60};
    const edges=[{from:'A',to:'B',label:'risk = true and base = 1.0'},{from:'B',to:'C',label:''}];
    const requirements=[{id:'vertical',request:'从左到右改为从上到下'}];
    const plan={kind:'connected-diagram',layout:prompt,redesign:mode==='redesign',design:mode==='redesign'?'Retypeset labels with a new readable font and rounded node shapes.':'',coordinateSpace:'normalized-1000',items,edges,requirements};
    const normalized=bad=>({...plan,items:items.map((i,n)=>({...i,target:bad?{cx:160+n*340,cy:500,width:300,height:850}:{cx:i.target.x+i.target.width/2,cy:i.target.y+i.target.height/2,width:i.target.width,height:i.target.height}}))});
    const c=document.createElement('canvas');c.width=1000;c.height=1000;const ctx=c.getContext('2d');ctx.fillStyle='#f5f5f5';ctx.fillRect(0,0,1000,1000);ctx.strokeStyle='black';ctx.strokeRect(1,1,998,998);
    for(const i of items){const s=i.source;ctx.fillStyle='#6747b5';ctx.fillRect(s.x,s.y,s.width,s.height);ctx.fillStyle='white';ctx.font='24px sans-serif';ctx.fillText(i.label,s.x+20,s.y+40);}
    const loadImage=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});
    const prior=window.fetch;let calls=0,generated=0,replanned=false;
    window.fetch=async(url,init)=>{
     const content=JSON.parse(init.body).messages[0].content,text=content[0].text;calls++;let response;
     if(calls===1){
      if(!text.includes('never minimum target sizes')||!text.includes('top-to-bottom'))throw Error('planner still constrains geometry');
      response=normalized(mode==='retry');
     }else if(calls===2){
      if(!text.includes('SOURCE INVENTORY REVIEW'))throw Error('missing independent source review');
      response={items:items.map(i=>({...i,bounds:{left:i.source.x,top:i.source.y,right:i.source.x+i.source.width,bottom:i.source.y+i.source.height}})),edges};
     }else if(text.includes('FAILED validation')){
      if(mode!=='retry'||replanned)throw Error('unexpected replanning: '+text.split('FAILED validation:')[1].slice(0,200));
      if(!text.includes('分支条件')||!text.includes('NOT minimum target sizes'))throw Error('label placement did not cause flexible replan');
      replanned=true;response=normalized(false);
     }else{
      if(!text.includes('Expected positions are deliberately withheld'))throw Error('audit leaked plan');
      const center=r=>({x:r.x+r.width/2,y:r.y+r.height/2});
      response={passed:true,layoutChanged:true,moreCompact:false,requestSatisfied:true,requirements:requirements.map(r=>({...r,satisfied:true,evidence:'Measured vertical ordering'})),unmetRequirements:[],items:items.map(i=>({id:i.id,matches:true,observedCount:1,originalCenter:center(i.source),observedCenter:center(i.target),evidence:'Visible content'})),connections:edges.map(e=>({...e,matches:true,evidence:'Directed connection'}))};
     }
     return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(response)}}]}));
    };
    try{
     const result=await retainedReflow({image:c.toDataURL(),route:{p:'infistar',base:'https://example.invalid/v1'}},prompt,{key:'offline-test',loadImage},async(parent,text)=>{
      generated++;if(!['reshape','redesign'].includes(mode))throw Error('pure proportional reflow should retain source pixels');
      if(!parent.diagramReflow||!text.includes('NEW target dimensions'))throw Error('reshape did not receive new design');
      if(mode==='redesign'&&!text.includes('new readable font'))throw Error('new typography/shape plan was lost');
      return {image:parent.diagramContentReference};
     });
     return {mode,calls,generated,replanned,retention:result.revisionAudit.retention,items:result.revisionAudit.layout.items.map(i=>({id:i.id,source:i.source,target:i.target}))};
    }finally{window.fetch=prior;}
   },mode);
   assert.equal(result.calls,mode==='retry'?4:3);assert.equal(result.generated,['reshape','redesign'].includes(mode)?1:0);assert.equal(result.replanned,mode==='retry');
   assert.ok(result.items[0].target.y<result.items[1].target.y&&result.items[1].target.y<result.items[2].target.y);
   assert.ok(result.items[1].target.height<result.items[1].source.height,'smaller target must survive crop refinement');
   assert.ok(result.items[2].target.width>result.items[2].source.width,'larger target must survive crop refinement');
   assert.equal(result.retention,['reshape','redesign'].includes(mode)?'semantic-internal-nodes':'pixel-internal-nodes');
   console.log(JSON.stringify({passed:true,...result}));
  }
  for(const mode of ['standalone-resize','standalone-reshape','standalone-redesign']){
   const result=await page.evaluate(async mode=>{
    const {retainedReflow}=await import('./revision-layout.mjs');
    const c=document.createElement('canvas');c.width=500;c.height=300;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,500,300);
    for(const x of [50,350]){ctx.fillStyle='#6747b5';ctx.fillRect(x,100,100,60);}
    const loadImage=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});
    const items=['A','B'].map((id,n)=>({id,label:id,imageIndex:0,cellIndex:n,keep:true,target:{x:n*250,y:n*150,width:125,height:mode==='standalone-reshape'&&n===0?110:150}}));
    const prior=window.fetch;let calls=0,generated=0;
    window.fetch=async(url,init)=>{
     const text=JSON.parse(init.body).messages[0].content[0].text;calls++;
     const response=calls===1?{items,redesign:mode==='standalone-redesign',design:'New readable typography and rounded shapes.'}:{passed:true,layoutChanged:true,requestSatisfied:true,requirements:[{request:'上下分组',satisfied:true,evidence:'Elements moved to different rows'}],unmetRequirements:[],items:items.map((i,n)=>({id:i.id,matches:true,evidence:'Retained element at new position',originalCenter:{x:250+n*500,y:500},observedCenter:{x:(i.target.x+i.target.width/2)*2,y:(i.target.y+i.target.height/2)*1000/300}}))};
     if(calls===1&&(!text.includes('not minimum target dimensions')||!text.includes('redesign:boolean')))throw Error('standalone path still locks design');
     return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(response)}}]}));
    };
    try{
     const result=await retainedReflow({image:c.toDataURL(),route:{p:'infistar',base:'https://example.invalid/v1'}},'保留原元素，缩小后按上下两组重新布局，可调整设计。',{key:'offline-test',loadImage},async(parent,text)=>{
      generated++;if(mode==='standalone-resize')throw Error('pure proportional reflow should keep crops');
      if(!parent.diagramReflow||!text.includes('NEW target positions and dimensions'))throw Error('standalone redraw lost target geometry');
      if(mode==='standalone-redesign'&&!text.includes('New readable typography'))throw Error('standalone redesign plan was lost');
      return {image:parent.diagramContentReference};
     });
     return {mode,calls,generated,retention:result.revisionAudit.retention,items:result.revisionAudit.layout.items};
    }finally{window.fetch=prior;}
   },mode);
   assert.equal(result.calls,2);assert.equal(result.generated,mode==='standalone-resize'?0:1);
   assert.equal(result.retention,mode==='standalone-resize'?'original-pixel-crops':'semantic-element-reflow');
   assert.ok(result.items.every(i=>i.target.width<i.source.width&&i.target.height<i.source.height));
   console.log(JSON.stringify({passed:true,...result}));
  }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
