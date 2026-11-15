const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
 const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
 const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;let browser,puts=0,posts=0,gets=0,image;const ids=new Set();
 try{
  browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
  const page=await browser.newPage({serviceWorkers:'block'});
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.hostname==='gallery-infistar-image-jobs.lixiao-gallery.workers.dev'){
    const id=url.pathname.split('/')[2];
    if(req.method()==='PUT'){ids.add(id);puts++;assert.equal(req.headers().authorization,'Bearer offline-recovery-key');return route.fulfill({json:{id,state:'succeeded'}});}
    gets++;
    return route.fulfill({json:url.pathname.endsWith('/result')?{ok:true,status:200,text:JSON.stringify({data:[{b64_json:image,mimeType:'image/png'}]}),usedReferences:false,requestId:'offline-request'}:{id,state:'succeeded'}});
   }
   if(req.method()==='POST'){posts++;return route.abort();}
   if(url.origin!==origin)return route.abort();
   if(url.pathname==='/forge/'){
    const response=await route.fetch();let html=await response.text();
    html=html.replace('window.__ffReconstruct = () => runReconstruction();',`window.__ffReconstruct = () => runReconstruction();
     window.__recoveryTest=async(prompt='offline paper fixture')=>{
      await revisionGallery.ready;mode='image';$('#provider').value='infistar';
      $('#figureRatio').value='16:9';$('#imageResolution').value='1K';
      revisionGallery.addInitial=async()=>{throw Error('EDITOR_BOUNDARY_SENTINEL');};
      try{await genOaiImage('https://infistar.cc/v1','gpt-image-2.5-sunburst','offline-recovery-key',prompt,'infistar',[],'');return 'NO_ERROR';}catch(e){return e.message;}
     };`);
    return route.fulfill({response,body:html});
   }
   return route.continue();
  });
  await page.addInitScript(async()=>{
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('offline-recovery-key'));
   const key='figureforge:infistar-image-job:v1:'+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
   const stale=JSON.stringify({id:'stale-task-from-before-removal',fingerprint:'old-parameters',created:1,acknowledged:true});
   localStorage.setItem(key,stale);localStorage.setItem(key+':saved',stale);
  });
  await page.goto(origin+'/forge/');await page.waitForFunction(()=>window.__recoveryTest&&document.querySelector('#provider option[value="infistar"]'));
  image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1280;c.height=720;c.getContext('2d').fillRect(0,0,1280,720);return c.toDataURL().split(',')[1];});
  assert.equal(await page.locator('#infistarJobRecovery').count(),0);
  assert.equal(await page.evaluate(()=>window.__recoveryTest()),'EDITOR_BOUNDARY_SENTINEL');
  assert.equal(await page.evaluate(()=>window.__recoveryTest('changed parameters')),'EDITOR_BOUNDARY_SENTINEL');
  assert.equal(puts,2);assert.equal(posts,0);assert.equal(ids.size,2);
  await page.reload();await page.waitForFunction(()=>window.__recoveryTest);
  assert.equal(await page.locator('#infistarJobRecovery').count(),0);
  assert.equal(await page.getByRole('button',{name:'取回上次图片',exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>window.__recoveryTest()),'EDITOR_BOUNDARY_SENTINEL');
  assert.equal(puts,3);assert.equal(posts,0);assert.equal(ids.size,3);assert.equal(gets,3);
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('figureforge:infistar-image-job:v1:')).length),2);
  console.log('PASS browser: stale records ignored; changed input and refresh generate successfully; recovery panel removed; Step 4 not executed');
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
