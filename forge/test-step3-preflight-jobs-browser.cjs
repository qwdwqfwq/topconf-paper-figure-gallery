// Current Step 3 button -> durable job -> displayed pixels. No paid requests.
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||path.join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));
(async()=>{
 const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
 const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 let browser;const model='gemini-nano-banana-2.1',errors=[],submissions=[];
 try{
  browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
  for(const failure of [false,true]){
   const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
   let pixels,jobId,polls=0;
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.hostname==='gallery-infistar-image-jobs.lixiao-gallery.workers.dev'){
     if(req.method()==='PUT'){
      assert.equal(jobId,undefined,'Only one submission per click');jobId=url.pathname.split('/').pop();
      submissions.push(req.postDataJSON());
      return route.fulfill({status:202,json:{id:jobId,state:'queued'}});
     }
     assert.equal(req.method(),'GET');assert.ok(url.pathname.includes(jobId));
     if(url.pathname.endsWith('/result'))return route.fulfill({json:{ok:true,status:200,usedReferences:true,text:JSON.stringify({data:[{b64_json:pixels}]})}});
     polls++;
     return route.fulfill({json:failure?{id:jobId,state:'unknown',error:'UPSTREAM_HTTP_522_NO_RESUBMIT',diagnostic:{upstreamStatus:522,upstreamMessage:'fixture origin timeout',stage:'response_received'}}:{id:jobId,state:'succeeded'}});
    }
    if(/^(?:www\.)?nonelinear\.com\.cn$/.test(url.hostname)&&url.pathname==='/models')return route.fulfill({json:{headers:Array(11).fill('fixture'),total:1,data:[[model,'google','','','','','','','','','image']]}});
    if(url.pathname.endsWith('/models'))return route.fulfill({json:{data:[{id:model}]}});
    if(url.origin!==origin){assert.ok(!['POST','PUT'].includes(req.method()),'Unexpected paid request');return route.abort();}
    if(url.pathname==='/forge/'){
     const response=await route.fetch();let html=await response.text();
     html=html.replace(/window\.FF_NONELINEAR_BASE=([^;]+);/,'window.FF_NONELINEAR_BASE="https://api.nonelinear.com.cn/v1";');
     const anchor='window.__ffReconstruct = () => runReconstruction();';assert.ok(html.includes(anchor));
     // Isolate automatic Step 4 only in this served test response; disk bytes stay intact.
     html=html.replace(anchor,anchor+'\nrunReconstruction=async()=>null;');
     return route.fulfill({response,body:html});
    }
    return route.continue();
   });
   await page.goto(origin+'/forge/');
   await page.waitForFunction(()=>document.querySelector('#provider option[value="nonelinear"]'));
   pixels=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=5504;c.height=3072;c.getContext('2d').fillRect(0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1];});
   await page.locator('#provider').selectOption('nonelinear');
   await page.locator('#key').fill('offline-fixture');
   await page.locator('#modeTabs [data-mode="image"]').click();
   await page.locator('#refreshModels').click();
   await page.waitForFunction(m=>Array.from(document.querySelector('#model').options).some(o=>o.value===m),model).catch(async e=>{console.error(await page.evaluate(()=>({base:window.FF_NONELINEAR_BASE,models:document.querySelector('#model').textContent,status:document.querySelector('#step3CatalogStatus').textContent})),errors);throw e;});
   await page.locator('#model').selectOption(model);
   await page.locator('#passTabs [data-pass="direct"]').click();
   await page.locator('#figureRatio').selectOption('16:9');await page.locator('#imageResolution').selectOption('4K');
   await page.locator('#refsUpload').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:Buffer.from(pixels,'base64')});
   await page.waitForFunction(()=>!document.querySelector('#refsUploadBtn').disabled);
   assert.equal(await page.locator('#refsUploadStatus').textContent(),'');
   assert.match(await page.locator('#refsSummary').textContent(),/1/);
   await page.locator('#paper').fill('Offline method overview: input -> retrieval -> reasoning -> verified answer.');
   await page.locator('#genBtn').click();
   await page.waitForFunction(()=>!document.querySelector('#genBtn').disabled);
   assert.equal(polls,1);assert.ok(jobId);
   const submission=submissions.at(-1);
   assert.match(submission.url,/\/v1\/images\/generations$/);assert.equal(submission.body.model,model);
   assert.equal(submission.body.size,'4K');assert.equal(submission.body.aspect_ratio,'16:9');
   assert.equal(Object.hasOwn(submission.body,'stream'),false);assert.equal(submission.usedReferences,true);
   const result=await page.evaluate(()=>({error:document.querySelector('#genErr').hidden?'':document.querySelector('#genErr').textContent,image:(()=>{const i=document.querySelector('[data-step3-output]');return i?{width:i.naturalWidth,height:i.naturalHeight}:null;})()}));
   if(failure){assert.match(result.error,/522/);assert.match(result.error,/fixture origin timeout/);assert.match(result.error,new RegExp(jobId));assert.equal(result.image,null);}
   else{assert.equal(result.error,'');assert.deepEqual(result.image,{width:5504,height:3072});}
   console.log('PASS current button + exact alias + 4K + ordinary job: '+(failure?'real diagnostic, one submission':'5504x3072 pixels displayed'));
   await context.close();
  }
  assert.equal(submissions.length,2);assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
