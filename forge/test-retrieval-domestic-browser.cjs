const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
 const {createGalleryServer}=await import('../scripts/serve-nonelinear.mjs');
 const {ASSETS,DOMESTIC,VERSION}=await import('./retrieval-assets.mjs');
 const staticRoot=path.resolve(__dirname,'../../artifacts/retrieval-domestic-20261118/static',VERSION);
 const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}/forge/`;
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  for(const mode of ['cold-warm','fallback','corrupt','denied','failure-retry','real']){
   const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
   let fail=mode==='failure-retry',block=false,requests=0,domestic=0;const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',async route=>{
    const url=route.request().url(),u=new URL(url);
    if(url===origin){const response=await route.fetch();let html=await response.text();html=html.replace('\nawait startupRetrieval;',`\nwindow.__test={phase:()=>retrievalBoot.state.phase,search:async()=>{await search();return results.map(f=>({id:f.id,score:f.matchScore}));},vector:queryVec};\nawait startupRetrieval;`);return route.fulfill({response,body:html});}
    const asset=url.startsWith(DOMESTIC)?url.slice(DOMESTIC.length):u.pathname.startsWith('/forge/')?u.pathname.slice(7):'';
    if(ASSETS[asset]){
     requests++;if(url.startsWith(DOMESTIC))domestic++;
     if(block||fail||(mode==='fallback'&&url.startsWith(DOMESTIC)))return route.abort();
     if(mode==='corrupt'&&url.startsWith(DOMESTIC))return route.fulfill({body:'bad data'});
     return route.fulfill({body:fs.readFileSync(path.join(staticRoot,asset)),contentType:ASSETS[asset].type});
    }
    if(mode!=='real'&&u.pathname.endsWith('/retrieval-domestic-worker.mjs'))return route.fulfill({contentType:'text/javascript',body:'self.onmessage=()=>{};'});
    if(mode==='denied'&&u.pathname.endsWith('/retrieval-core-worker.mjs')){const response=await route.fetch();return route.fulfill({response,body:"Object.defineProperty(globalThis,'indexedDB',{get(){throw new Error('Denied');}});\n"+await response.text()});}
    if(u.origin!==new URL(origin).origin)return route.abort();return route.continue();
   });
   const start=Date.now();await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__test,{timeout:30000});
   await page.waitForFunction(()=>window.__test.phase()!=='core-loading',null,{timeout:35000});
   if(fail){assert.equal(await page.evaluate(()=>window.__test.phase()),'core-error');fail=false;await page.locator('#bootRetry').click();await page.waitForFunction(()=>window.__test.phase()==='semantic-loading');}
   assert.notEqual(await page.evaluate(()=>window.__test.phase()),'core-error',await page.locator('#bootText').textContent());
   await page.locator('#paper').fill('diffusion segmentation');const rows=await page.evaluate(()=>window.__test.search());assert.ok(rows.length>100);assert.ok(rows.every(r=>Number.isFinite(r.score)));
   const coldMs=Date.now()-start;
   if(mode==='cold-warm'){
    block=true;requests=0;const warm=Date.now();await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__test&&window.__test.phase()!=='core-loading');
    assert.equal(await page.evaluate(()=>window.__test.phase()),'semantic-loading');assert.equal(requests,0,'Both keyword index and semantic vectors must use local caches');
    console.log(JSON.stringify({mode,coldMs,warmMs:Date.now()-warm,rows:rows.length}));
   }else if(mode==='real'){
    await page.waitForFunction(()=>['ready','semantic-error'].includes(window.__test.phase()),null,{timeout:180000});
    assert.equal(await page.evaluate(()=>window.__test.phase()),'ready',await page.locator('#bootText').textContent());const vector=await page.evaluate(()=>window.__test.vector('diffusion segmentation'));
    assert.equal(vector.length,512);assert.ok(vector.every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...vector)-1)<1e-5);assert.ok(domestic>=8);console.log(JSON.stringify({mode,coldMs,readyMs:Date.now()-start,dimensions:vector.length,domestic}));
   }else console.log(JSON.stringify({mode,coldMs,domestic}));
   assert.deepEqual(errors,[]);await context.close();
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
