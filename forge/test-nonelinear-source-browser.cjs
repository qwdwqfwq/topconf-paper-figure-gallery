// Actual generation, original download, scene parsing and four export buttons; no paid API calls.
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const fs=require('node:fs/promises');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||path.join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));
(async()=>{
 const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
 const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
  const page=await browser.newPage({serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.hostname==='imagen-nonelinear-2025.tos-cn-beijing.volces.com'){const pixels=await page.evaluate(()=>window.__sourcePixels);return pixels?route.fulfill({body:Buffer.from(pixels,'base64'),headers:{'content-type':'image/png','access-control-allow-origin':'*'}}):route.abort();}
   if(url.origin!==origin)return route.abort();
   if(url.pathname==='/forge/'){
    const response=await route.fetch();let html=await response.text();
    html=html.replace('window.__ffReconstruct = () => runReconstruction();',`window.__ffReconstruct = () => runReconstruction();
     window.__sourceTest=async({folder,failure})=>{
      await revisionGallery.ready;
      mode='image';$('#provider').value='nonelinear';$('#key').value='offline-secret';
      $('#baseOverride').value='https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1';
      const model='gemini-3.1-flash-image';$('#model').add(new Option(model,model));$('#model').value=model;
      $('#reconModel').add(new Option('gpt-6.1-sol','gpt-6.1-sol'));$('#reconModel').value='gpt-6.1-sol';
      $('#figureRatio').value='16:9';$('#imageResolution').value='2K';syncImageRatioSupport();
      const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1152;
      canvas.getContext('2d').fillRect(0,0,2048,1152);
      const original=canvas.toDataURL('image/png'),bytes=Uint8Array.from(atob(original.split(',')[1]),c=>c.charCodeAt(0));
      window.__sourcePixels=original.split(',')[1];
      const url='https://imagen-nonelinear-2025.tos-cn-beijing.volces.com/'+folder+'/browser-0.png';
      const native=window.fetch;const calls={source:0,vision:0,generation:0,originalAttached:false};
      window.__sourceCalls=calls;window.__sourceAvailable=!failure;
      window.fetch=async(input,init)=>{
       const address=String(input);
       if(init?.method!=='POST')return native(input,init);
       const body=JSON.parse(init.body);
       if(address.endsWith('/images/generations')){calls.generation++;return new Response(JSON.stringify({data:[{url}]}),{headers:{'content-type':'application/json'}});}
       if(address.endsWith('/source-image')){
        calls.source++;assertSource(body.url===url);
        if(!window.__sourceAvailable)return new Response('not found',{status:404});
        if(!failure&&calls.source===1)return new Response('busy',{status:503});
        return new Response(bytes,{headers:{'content-type':'image/png'}});
       }
       if(address.endsWith('/chat/completions')){
        calls.vision++;
        const images=body.messages.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(p=>p.type==='image_url');
        calls.originalAttached=images[0]?.image_url.url===original;
        const scene={canvas:{width:2048,height:1152},nodes:[
         {id:'frame',type:'rect',x:20,y:20,w:2000,h:1100,fill:'#ffffff',stroke:'#111111',strokeWidth:2},
         {id:'label',type:'text',x:80,y:80,w:600,h:60,text:'Original pixels preserved',fontSize:32,fontFamily:'Arial',fill:'#111111'}]};
        return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(scene)},finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}});
       }
       throw new Error('Unexpected offline POST '+address);
      };
      function assertSource(ok){if(!ok)throw new Error('Source URL changed');}
      await genOaiImage(baseURL(),model,'offline-secret','Synthetic test figure','nonelinear',[],'');
      window.__sourceExpected=original;
      window.__sourceState=()=>{const st=ensureExportState();return {calls,failed:st.reconFailed,error:st.reconError,
       source:st.bitmapSrc,canvas:st.scene?.canvas,svg:st.svg,pending:st.reconPending,
       session:sessionStorage.getItem('ff_step3_bitmap'),image:document.querySelector('[data-step3-output]')?.src};};
      return window.__sourceState();
     };`);
    return route.fulfill({response,body:html});
   }
   return route.continue();
  });
  for(const folder of ['others','gemini'])for(const failure of [false,true]){
   await page.goto(origin+'/forge/');
   await page.waitForFunction(()=>window.__sourceTest&&document.querySelector('#provider option[value="nonelinear"]'));
   let result=await page.evaluate(input=>window.__sourceTest(input),{folder,failure});
   await page.waitForFunction(()=>!window.__ffExportState.reconPending);
   result=await page.evaluate(()=>window.__sourceState());
   if(failure){
    assert.equal(result.calls.source,1);assert.equal(result.calls.vision,0);assert.match(result.error,/404/);assert.equal(result.failed,true);
    await page.evaluate(()=>{window.__sourceAvailable=true;});
    await page.locator('#reconBtn').click();
    await page.waitForFunction(()=>window.__sourceCalls.vision===1&&!window.__ffExportState.reconPending);
    result=await page.evaluate(()=>window.__sourceState());
   }
   assert.equal(result.calls.source,2);assert.equal(result.calls.generation,1);assert.equal(result.calls.vision,1);
   assert.equal(result.calls.originalAttached,true);assert.equal(result.canvas.width,2048);assert.equal(result.canvas.height,1152);
   assert.match(result.svg,/<text/);assert.doesNotMatch(result.svg,/<image/);
   await page.locator('#reconBtn').click();
   await page.waitForFunction(()=>window.__sourceCalls.vision===2&&!window.__ffExportState.reconPending);
   assert.equal(await page.evaluate(()=>window.__sourceCalls.source),2,'Manual rebuild reuses original bytes');
   for(const format of ['svg','pptx','vsdx','drawio']){
    await page.locator('[data-export="'+format+'"]').click();
    const downloadPromise=page.waitForEvent('download');await page.locator('#exportConfirm').click();
    const download=await downloadPromise;const content=await fs.readFile(await download.path());
    if(['pptx','vsdx'].includes(format))assert.equal(content.subarray(0,2).toString(),'PK');
    else assert.match(content.toString(),format==='svg'?/<svg/:/<mxfile/);
    assert.ok(content.length>100);
   }
   console.log('PASS '+folder+': '+(failure?'404 surfaced; manual recovery':'transient retry')+', unchanged original attached, 2048x1152, four exports');
  }
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
