const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
 const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
 const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
  for(const provider of ['infistar','nonelinear']){
   const page=await browser.newPage({serviceWorkers:'block'});let image,puts=0,posts=0,submission;
   await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.hostname==='gallery-infistar-image-jobs.lixiao-gallery.workers.dev'){
     const id=url.pathname.split('/')[2];
     if(req.method()==='PUT'){puts++;submission=req.postDataJSON();assert.equal(req.headers().authorization,'Bearer offline-endpoint-key');return route.fulfill({json:{id,state:'succeeded'}});}
     return route.fulfill({json:url.pathname.endsWith('/result')?{ok:true,status:200,text:JSON.stringify({data:[{b64_json:image,mimeType:'image/png'}]}),usedReferences:true,requestId:'offline-endpoint'}:{id,state:'succeeded'}});
    }
    if(req.method()==='POST'){posts++;return route.abort();}
    if(url.origin!==origin)return route.abort();
    if(url.pathname==='/forge/'){
     const response=await route.fetch();let html=await response.text();
     html=html.replace('window.__ffReconstruct = () => runReconstruction();',`window.__ffReconstruct = () => runReconstruction();
      window.__endpointTest=async(provider)=>{
       await revisionGallery.ready;mode='image';$('#provider').value=provider;
       $('#figureRatio').value='16:9';$('#imageResolution').value='4K';
       refDataURIs=async ids=>ids.map(()=> 'data:image/png;base64,'+window.__endpointImage);
       revisionGallery.addInitial=async value=>{window.__acceptedPixels=[value.width,value.height];throw Error('EDITOR_BOUNDARY_SENTINEL');};
       const model=provider==='infistar'?'gemini-nano-banana-2.1':'gemini-3.1-flash-image-preview';
       const base=provider==='infistar'?'https://infistar.cc/v1':'https://api.nonelinear.com.cn/v1';
       try{await genOaiImage(base,model,'offline-endpoint-key','offline paper fixture',provider,['endpoint-ref-a','endpoint-ref-b','endpoint-ref-c'],'');return 'NO_ERROR';}catch(e){return e.message;}
      };`);
     return route.fulfill({response,body:html});
    }
    return route.continue();
   });
   await page.goto(origin+'/forge/');await page.waitForFunction(()=>window.__endpointTest&&document.querySelector('#provider option[value="infistar"]'));
   image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=4096;c.height=2304;c.getContext('2d').fillRect(0,0,c.width,c.height);return window.__endpointImage=c.toDataURL().split(',')[1];});
   assert.equal(await page.evaluate(p=>window.__endpointTest(p),provider),'EDITOR_BOUNDARY_SENTINEL');
   assert.deepEqual(await page.evaluate(()=>window.__acceptedPixels),[4096,2304]);assert.equal(puts,1);assert.equal(posts,0);assert.equal(submission.usedReferences,true);
   if(provider==='infistar'){
    assert.equal(submission.url,'https://infistar.cc/v1beta/models/gemini-nano-banana-2.1:generateContent');
    assert.equal(submission.body.contents[0].parts.filter(p=>p.inlineData).length,3);
    assert.deepEqual(submission.body.generationConfig.imageConfig,{aspectRatio:'16:9',imageSize:'4K'});
   }else{
    assert.equal(submission.url,'https://api.nonelinear.com.cn/v1/images/generations');
    assert.equal(submission.body.size,'4K');assert.equal(submission.body.aspect_ratio,'16:9');assert.equal(submission.body.image.length,3);
   }
   await page.close();
  }
  console.log('PASS browser: both Step 3 provider paths preserve 4K, 16:9 and three references; one durable task; no direct paid POST or Step 4 execution');
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
