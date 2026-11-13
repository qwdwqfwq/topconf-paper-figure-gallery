// Real Step 3 UI with streamed fixtures. All external requests are blocked.
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
 const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
 const server=createGalleryServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 let browser,externalPosts=0;const errors=[];
 try{
  browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
  const page=await browser.newPage({serviceWorkers:'block'});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(request.method()==='POST'){externalPosts++;return route.abort();}
   if(url.origin!==origin)return route.abort();
   if(url.pathname==='/forge/'){
    const response=await route.fetch();let html=await response.text();
    html=html.replace('window.__ffReconstruct = () => runReconstruction();',`window.__ffReconstruct = () => runReconstruction();
     runReconstruction=async()=>null;
     window.__streamTest=async ({provider,incomplete})=>{
      await revisionGallery.ready;
      const previousSource=document.querySelector('[data-step3-output]')?.src;
      mode='image';$('#provider').value=provider;$('#key').value='offline-secret';
      const model=provider==='oai'?'gpt-image-2':'gemini-3.1-flash-image';
      $('#model').add(new Option(model,model));$('#model').value=model;
      $('#figureRatio').value='16:9';$('#imageResolution').value='2K';syncImageRatioSupport();
      const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1152;
      const context=canvas.getContext('2d');context.fillStyle='#1689b0';context.fillRect(0,0,2048,1152);
      const pixels=canvas.toDataURL('image/png').split(',')[1];
      const event=value=>'data: '+JSON.stringify(value)+'\\r\\n\\r\\n';
      const native=provider==='infistar';
      const stream=native?event({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:pixels}}]}}]})+
       (incomplete?'':event({candidates:[{finishReason:'STOP',content:{parts:[{text:''}]}}]})):
       event({type:'image_generation.partial_image',b64_json:'invalid-preview-pixels'})+
       (incomplete?'':event({type:'image_generation.completed',b64_json:pixels,output_format:'png'}));
      const original=window.fetch;let calls=0,request;
      window.fetch=(url,init)=>{
       if(init?.method!=='POST')return original(url,init);
       calls++;request={url:String(url),body:JSON.parse(init.body)};
       const synchronous=provider==='nonelinear';
       if(synchronous && Object.hasOwn(request.body,'stream'))return Promise.resolve(new Response('不支持流式，请勿设置stream参数',{status:400}));
       const payload=synchronous?JSON.stringify(incomplete?{data:[]}:{data:[{b64_json:pixels}]}):stream;
       const bytes=new TextEncoder().encode(payload);let offset=0;
       return Promise.resolve(new Response(new ReadableStream({async pull(controller){
        await new Promise(resolve=>setTimeout(resolve,1));
        if(offset===bytes.length){controller.close();return;}
        controller.enqueue(bytes.slice(offset,offset+=Math.min(2039,bytes.length-offset)));
       }}),{headers:{'content-type':synchronous?'application/json':'text/event-stream','x-request-id':'trace-ui-stream'}}));
      };
      let error='';
      try{await genOaiImage(native?'https://infistar.cc/v1':provider==='oai'?'https://api.openai.com/v1':window.FF_NONELINEAR_BASE,
       model,'offline-secret','Synthetic encoder and classifier paper.',provider,[],'');}
      catch(failure){error=failure.message;}
      finally{window.fetch=original;}
      const image=document.querySelector('[data-step3-output]');
      return {calls,request,error,image:image?{width:image.naturalWidth,height:image.naturalHeight}:null,
       imageUnchanged:previousSource===image?.src};
     };`);
    return route.fulfill({response,body:html});
   }
   if(url.pathname.startsWith('/api/nonelinear/v1/'))return route.fulfill({json:{data:[]}});
   return route.continue();
  });
  for(const provider of ['infistar','nonelinear','oai'])for(const incomplete of [false,true]){
   await page.goto(origin+'/forge/');
   await page.waitForFunction(()=>window.__streamTest && document.querySelector('#provider option[value="nonelinear"]'));
   const result=await page.evaluate(input=>window.__streamTest(input),{provider,incomplete});
   assert.equal(result.calls,1);assert.doesNotMatch(result.error,/offline-secret|Synthetic encoder/);
   if(provider==='infistar'){
    assert.match(result.request.url,/:streamGenerateContent\?alt=sse$/);
    assert.deepEqual(result.request.body.generationConfig.imageConfig,{aspectRatio:'16:9',imageSize:'2K'});
   }else{
    assert.equal(Object.hasOwn(result.request.body,'stream'),provider!=='nonelinear');
    if(provider!=='nonelinear')assert.equal(result.request.body.stream,true);
    assert.equal(result.request.body.size,provider==='oai'?'2048x1152':'2K');
   }
   if(incomplete){assert.ok(result.error);if(provider!=='nonelinear')assert.match(result.error,/complete final image/);assert.equal(result.imageUnchanged,true);}
   else{assert.equal(result.error,'');assert.deepEqual(result.image,{width:2048,height:1152});}
   console.log(provider+': '+(incomplete?'truncated stream rejected':'final image displayed at 2048×1152'));
  }
  assert.equal(externalPosts,0);assert.deepEqual(errors,[]);
  console.log('PASS three-provider streaming UI integration, zero live API calls.');
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
