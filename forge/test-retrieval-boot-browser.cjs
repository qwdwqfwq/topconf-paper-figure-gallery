const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
 const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
 const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=process.env.RETRIEVAL_TEST_URL||`http://127.0.0.1:${server.address().port}/forge/`;
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  async function scenario(mode){
   const context=await browser.newContext({serviceWorkers:'block'}),errors=[];
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   let workerMode=mode,failCore=mode==='core-error';
   await context.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.origin!==new URL(origin).origin)return route.abort();
    if(u.pathname.endsWith('/forge/')){
     const r=await route.fetch();let html=await r.text();
     html=html.replace('\nawait boot();',`\nwindow.__retrievalTest={state:()=>retrievalBoot.state.phase,search:async()=>{await search();return results.map(f=>({id:f.id,score:f.matchScore}));},vector:queryVec};\nawait boot();`);
     if(mode==='timeout')html=html.replace('const BOOT_TIMEOUT = 300000;','const BOOT_TIMEOUT = 1000;');
     return route.fulfill({response:r,body:html});
    }
    if(failCore&&u.pathname.endsWith('/ids.json'))return route.fulfill({status:503,body:'Unavailable'});
    if(mode!=='real'&&u.pathname.endsWith('/retrieval-worker.mjs')){
     const script=workerMode==='error'?`self.onmessage=()=>self.postMessage({type:'error',message:'Fixture model unavailable'});`:
      workerMode==='ready'?`self.onmessage=({data:m})=>self.postMessage(m.type==='init'?{type:'ready'}:{type:'vector',id:m.id,vector:Array(512).fill(1/Math.sqrt(512))});`:'self.onmessage=()=>{};';
     return route.fulfill({contentType:'text/javascript',body:script});
    }
    return route.continue();
   });
   await page.goto(origin,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.__retrievalTest);
   if(mode==='real'){
    await page.waitForFunction(()=>window.__retrievalTest.state()==='ready'||window.__retrievalTest.state().endsWith('error'),null,{timeout:300000});
    assert.equal(await page.evaluate(()=>window.__retrievalTest.state()),'ready',await page.locator('#bootText').textContent());
    const v=await page.evaluate(()=>window.__retrievalTest.vector('diffusion segmentation'));
    assert.equal(v.length,512);assert.ok(v.every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...v)-1)<1e-5);
   }else if(mode==='core-error'){
    await page.waitForFunction(()=>window.__retrievalTest.state()==='core-error');
    assert.ok(await page.locator('#bootRetry').isVisible());
    failCore=false;workerMode='ready';await page.locator('#bootRetry').click();
    await page.waitForFunction(()=>window.__retrievalTest.state()==='ready');
   }else{
    await page.waitForFunction(()=>window.__retrievalTest.state()!=='core-loading');
    assert.ok(await page.locator('#provider option').count()>1);
    await page.locator('#paper').fill('diffusion segmentation');
    const start=Date.now(),rows=await page.evaluate(()=>window.__retrievalTest.search());
    assert.ok(rows.length>100);assert.ok(rows.every(r=>Number.isFinite(r.score)));assert.ok(Date.now()-start<5000);
    if(mode==='stall')assert.equal(await page.evaluate(()=>window.__retrievalTest.state()),'semantic-loading');
    else{
     await page.waitForFunction(()=>window.__retrievalTest.state()==='semantic-error');
     assert.ok(await page.locator('#bootRetry').isVisible());assert.equal(await page.locator('#bootSpin').isVisible(),false);
     workerMode='ready';await page.locator('#bootRetry').click();
     await page.waitForFunction(()=>window.__retrievalTest.state()==='ready');
     assert.equal(await page.locator('#bootBanner').isVisible(),false);
    }
   }
   assert.deepEqual(errors,[]);await context.close();console.log('PASS browser retrieval '+mode);
  }
  for(const mode of process.env.RETRIEVAL_REAL_ONLY?['real']:['stall','error','core-error','timeout','real'])await scenario(mode);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
