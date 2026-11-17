// Real Step 3 two-pass button with intercepted network. No paid requests.
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||path.join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));

(async()=>{
 const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
 const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const imageModel='gemini-nano-banana-2.1',analysisModel='gpt-6.1-sol';
 let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
  for(const scenario of ['upstream-200','success','lost-ack']){
   const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
   const pageErrors=[],analysisRequests=[],imageRequests=[];let pixels,jobId,generating=false,diagnosticProbes=0,analysisId,putCount=0,resultReads=0;
   page.on('pageerror',e=>pageErrors.push(e.message));
   await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.hostname==='public.gallery-reference-analysis.pages.dev'){
     const id=url.pathname.split('/')[2];
     if(req.method()==='PUT'){
      putCount++;const input=req.postDataJSON();
      if(!analysisId){analysisId=id;analysisRequests.push(input);}else{assert.equal(id,analysisId);assert.deepEqual(input,analysisRequests[0]);}
      if(scenario==='lost-ack'&&putCount===1)return route.abort('connectionfailed');
      return route.fulfill({status:202,json:{id,state:'queued'}});
     }
     assert.equal(req.method(),'GET');assert.equal(id,analysisId);resultReads++;
     if(resultReads===1)return route.abort('connectionfailed');
     if(resultReads===2)return route.fulfill({status:202,json:{id,state:'running'}});
     if(scenario==='upstream-200')return route.fulfill({json:{error:{message:'NoneLinear upstream HTTP 524: fixture original failure',code:524,type:'upstream_http_error',request_id:'req-browser-fixture'}}});
     return route.fulfill({json:{choices:[{finish_reason:'stop',message:{content:JSON.stringify({layout:'Left to right',elements:'Three blocks',palette:['#123456'],hierarchy:'Overview then detail',representative:[1],imageRefIds:[1],refinedPrompt:'Clean research diagram.'})}}]}});
    }
    if(url.pathname.endsWith('/chat/completions'))throw Error('Analysis must use durable jobs');
    if(url.hostname==='gallery-infistar-image-jobs.lixiao-gallery.workers.dev'){
     if(req.method()==='PUT'){
      imageRequests.push(req.postDataJSON());assert.equal(jobId,undefined);jobId=url.pathname.split('/').pop();
      return route.fulfill({status:202,json:{id:jobId,state:'queued'}});
     }
     assert.equal(req.method(),'GET');assert.ok(url.pathname.includes(jobId));
     return route.fulfill({json:url.pathname.endsWith('/result')?{ok:true,status:200,usedReferences:true,text:JSON.stringify({data:[{b64_json:pixels}]})}:{id:jobId,state:'succeeded'}});
    }
    if(/^(?:www\.)?nonelinear\.com\.cn$/.test(url.hostname)&&url.pathname==='/models')return route.fulfill({json:{headers:Array(11).fill('fixture'),total:2,data:[[imageModel,'google','','','','','','','','','image'],[analysisModel,'google','','','','','','','','','LMM']]}});
    if(url.pathname.endsWith('/models')){
     if(generating)diagnosticProbes++;
     return route.fulfill({json:{data:[{id:imageModel},{id:analysisModel}]}});
    }
    if(url.origin!==origin){assert.ok(!['POST','PUT'].includes(req.method()),'Unexpected paid request');return route.abort();}
    if(url.pathname==='/forge/'){
     const response=await route.fetch();let html=await response.text();
     html=html.replace(/window\.FF_NONELINEAR_BASE=([^;]+);/,'window.FF_NONELINEAR_BASE="https://api.nonelinear.com.cn/v1";');
     const anchor='window.__ffReconstruct = () => runReconstruction();';assert.ok(html.includes(anchor));
     // Suppress automatic Step 4 in this served response only; no frozen disk edits.
     return route.fulfill({response,body:html.replace(anchor,anchor+'\nrunReconstruction=async()=>null;')});
    }
    return route.continue();
   });
   await page.goto(origin+'/forge/');
   await page.waitForFunction(()=>document.querySelector('#provider option[value="nonelinear"]'));
   pixels=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=2752;c.height=1536;c.getContext('2d').fillRect(0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1];});
   await page.locator('#provider').selectOption('nonelinear');
   await page.locator('#key').fill('offline-fixture');
   await page.locator('#modeTabs [data-mode="image"]').click();
   await page.locator('#refreshModels').click();
   await page.waitForFunction(m=>Array.from(document.querySelector('#analyzeModel').options).some(o=>o.value===m),analysisModel).catch(async error=>{console.error(await page.evaluate(()=>({analysis:document.querySelector('#analyzeModel').textContent,status:document.querySelector('#step3CatalogStatus').textContent})),pageErrors);throw error;});
   await page.locator('#model').selectOption(imageModel);
   await page.locator('#passTabs [data-pass="two"]').click();
   await page.locator('#analyzeModel').selectOption(analysisModel);
   await page.locator('#figureRatio').selectOption('16:9');await page.locator('#imageResolution').selectOption('2K');
   await page.locator('#refsUpload').setInputFiles(Array.from({length:4},(_,i)=>({name:`reference-${i+1}.png`,mimeType:'image/png',buffer:Buffer.from(pixels,'base64')})));
   await page.waitForFunction(()=>!document.querySelector('#refsUploadBtn').disabled);
   await page.locator('#paper').fill('Offline method overview: input -> retrieval -> reasoning -> verified answer.');
   generating=true;await page.locator('#genBtn').click();
   await page.waitForFunction(()=>!document.querySelector('#genBtn').disabled);
   assert.equal(analysisRequests.length,1,'Only the original analysis POST; no hi probe');
   assert.equal(diagnosticProbes,0,'No diagnostic /models request after a failure');
   const analysis=analysisRequests[0];assert.equal(analysis.model,analysisModel);assert.equal(analysis.temperature,0.2);assert.equal(analysis.max_completion_tokens,16000);assert.equal(analysis.max_tokens,undefined);assert.equal(analysis.messages[1].content.filter(p=>p.type==='image_url').length,4);assert.equal(putCount,scenario==='lost-ack'?2:1);assert.ok(resultReads>=3);
   assert.equal(analysis.messages[0].role,'system');assert.ok(analysis.messages[1].content.some(p=>p.type==='image_url'));
   const error=await page.locator('#genErr').evaluate(e=>e.hidden?'':e.textContent);
   if(scenario==='success'||scenario==='lost-ack'){
    assert.equal(error,'');assert.equal(imageRequests.length,1);
    assert.equal(imageRequests[0].body.model,imageModel);assert.equal(imageRequests[0].body.size,'2K');
    await page.waitForFunction(()=>document.querySelector('[data-step3-output]')?.naturalWidth>0);
    assert.deepEqual(await page.locator('[data-step3-output]').evaluate(i=>[i.naturalWidth,i.naturalHeight]),[2752,1536]);
   }else{
    assert.equal(imageRequests.length,0,'Failed analysis must not submit an image');
    assert.match(error,/gpt-6.1-sol/);assert.doesNotMatch(error,/Key 错误或过期|offline-fixture/);
    if(scenario==='transport')assert.match(error,/transport.*Failed to fetch/);
    else assert.match(error,/upstream=524.*req-browser-fixture.*fixture original failure/);
   }
   assert.deepEqual(pageErrors,[]);console.log('PASS durable Step 3 two-pass button: '+scenario);
   await context.close();
  }
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
