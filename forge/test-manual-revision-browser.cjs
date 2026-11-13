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
  const results=await page.evaluate(async()=>{
   const {confirmedRevision}=await import('./revision-scope.mjs?v=20261114-errors');
   const c=document.createElement('canvas');c.width=320;c.height=180;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,320,180);const source=c.toDataURL();ctx.fillStyle='green';ctx.fillRect(0,0,320,180);const edited=c.toDataURL();
   const loadImage=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});
   const regions=[{x:5,y:5,width:30,height:20},{x:80,y:5,width:40,height:20},{x:5,y:90,width:30,height:30},{x:200,y:100,width:60,height:40}];
   const originalFetch=window.fetch;let analysisCalls=0;window.fetch=async(...args)=>{if(/example\.invalid|\/chat\/completions|\/responses(?:\?|$)/.test(String(args[0]))){analysisCalls++;throw Error('manual scope must not call analysis');}return originalFetch(...args);};
   const results=[];
   try{
    for(const provider of ['nonelinear','infistar','oai']){
     let generated=0,confirmed=false;
     const timer=setInterval(()=>{const d=document.querySelector('[data-scope-review]');if(d){if(!d.textContent.includes('这是你已框选的范围'))throw Error('manual explanation missing');confirmed=true;d.querySelector('[data-confirm-scope]').click();}},10);
     try{
      const result=await confirmedRevision({image:source,manualScope:true,revisionMode:'local',editRegions:regions,route:{p:provider,model:'unchanged',base:'https://example.invalid/v1'}},'只修改选区颜色',{key:'offline',loadImage,toDataURL:async x=>x},async()=>{if(!confirmed)throw Error('generated before confirmation');generated++;return {image:edited,revisionAudit:{apiRequestCount:1}};});
      const a=result.revisionAudit;results.push({provider,generated,analysisCalls,width:result.width,height:result.height,manual:a.scopePlan.manual,regions:a.regions,changedInside:a.changedInside,changedOutside:a.changedOutside,requests:a.apiRequestCount});
     }finally{clearInterval(timer);}
    }
    let generated=0;const timer=setInterval(()=>document.querySelector('[data-scope-review]')?.close(),10);
    try{await confirmedRevision({image:source,manualScope:true,revisionMode:'local',editRegions:regions,route:{p:'infistar'}},'cancel',{loadImage,toDataURL:async x=>x},async()=>{generated++;});throw Error('cancel accepted');}catch(error){if(!error.message.includes('已取消'))throw error;}finally{clearInterval(timer);}
    if(generated)throw Error('cancel sent generation');
    return results;
   }finally{window.fetch=originalFetch;}
  });
  for(const r of results){assert.equal(r.generated,4);assert.equal(r.analysisCalls,0);assert.equal(r.requests,4);assert.equal(r.manual,true);assert.equal(r.width,320);assert.equal(r.height,180);assert.equal(r.changedInside,4700);assert.equal(r.changedOutside,0);assert.equal(r.regions.length,4);}
  console.log(JSON.stringify({passed:true,manualFourRegionResults:results,cancelWithoutRequest:true}));
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
