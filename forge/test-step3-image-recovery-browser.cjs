const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
 const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
 const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;let browser,puts=0,posts=0,gets=0,image;
 try{
  browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
  const page=await browser.newPage({serviceWorkers:'block'});
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.hostname==='gallery-infistar-image-jobs.lixiao-gallery.workers.dev'){
    const id=url.pathname.split('/')[2];
    if(req.method()==='PUT'){puts++;assert.equal(req.headers().authorization,'Bearer offline-recovery-key');return route.fulfill({json:{id,state:'succeeded'}});}
    gets++;
    return route.fulfill({json:url.pathname.endsWith('/result')?{ok:true,status:200,text:JSON.stringify({data:[{b64_json:image,mimeType:'image/png'}]}),usedReferences:false,requestId:'offline-request'}:{id,state:'succeeded'}});
   }
   if(req.method()==='POST'){posts++;return route.abort();}
   if(url.origin!==origin)return route.abort();
   if(url.pathname==='/forge/'){
    const response=await route.fetch();let html=await response.text();
    html=html.replace('window.__ffReconstruct = () => runReconstruction();',`window.__ffReconstruct = () => runReconstruction();
     window.__recoveryTest=async()=>{
      await revisionGallery.ready;mode='image';$('#provider').value='infistar';
      $('#figureRatio').value='16:9';$('#imageResolution').value='1K';
      revisionGallery.addInitial=async()=>{throw Error('EDITOR_BOUNDARY_SENTINEL');};
      try{await genOaiImage('https://infistar.cc/v1','gpt-image-2.5-sunburst','offline-recovery-key','offline paper fixture','infistar',[],'');return 'NO_ERROR';}catch(e){return e.message;}
     };`);
    return route.fulfill({response,body:html});
   }
   return route.continue();
  });
  await page.goto(origin+'/forge/');await page.waitForFunction(()=>window.__recoveryTest&&document.querySelector('#provider option[value="infistar"]'));
  image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1280;c.height=720;c.getContext('2d').fillRect(0,0,1280,720);return c.toDataURL().split(',')[1];});
  assert.equal(await page.evaluate(()=>window.__recoveryTest()),'EDITOR_BOUNDARY_SENTINEL');
  assert.equal(puts,1);assert.equal(posts,0);
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('figureforge:infistar-image-job:v1:')&&k.endsWith(':saved')).length),1);
  await page.reload();await page.locator('#infistarJobRecovery').waitFor();await page.locator('#key').fill('offline-recovery-key');
  await page.getByRole('button',{name:'取回上次图片',exact:true}).click();
  await page.locator('#infistarJobRecovery a[download]').waitFor();
  const size=await page.locator('#infistarJobRecovery img').evaluate(async img=>{await img.decode();return [img.naturalWidth,img.naturalHeight];});
  assert.deepEqual(size,[1280,720]);assert.equal(puts,1);assert.equal(posts,0);assert.ok(gets>=3);
  console.log('PASS browser: valid image survives editor failure and refresh; original task recovered; no second submission or Step 4 execution');
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
