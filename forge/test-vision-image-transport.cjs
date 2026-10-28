// Browser encoding + real request assembly; no live API key or paid requests.
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const name=path.resolve(root,'.'+decodeURIComponent(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname));
  if(!name.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(name,(err,data)=>{
    if(err){res.writeHead(404);return res.end();}
    if(name===path.join(root,'forge','index.html'))data=Buffer.from(data.toString().replace(/\r\n/g,'\n')
      .replace("import * as T from './vendor/transformers.min.js';",'const T={};')
      .replace('window.__ffReconstruct = () => runReconstruction();','window.__ffReconstruct = () => runReconstruction(); window.__transport={prepareVisionImages,visionImageSize,checkVisionRequestSize,requestEditableScene,loadImage,appendVisionOverviews};')
      .replace("await boot();\ninitProviders();\nsyncSubCount();\nawait Promise.all([populateModels(), populateParserModels()]);\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});","MAN=FALLBACK;\ninitProviders();\nsyncSubCount();\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});"));
    res.writeHead(200,{'Content-Type':/\.html$/.test(name)?'text/html':'text/javascript'});res.end(data);
  });
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage({serviceWorkers:'block'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/forge/`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__transport);
    const result=await page.evaluate(async()=>{
      const api=window.__transport,ensure=(v,m)=>{if(!v)throw Error(m);};
      const c=document.createElement('canvas');c.width=43;c.height=29;
      const ctx=c.getContext('2d');ctx.fillStyle='#123456';ctx.fillRect(0,0,20,29);
      const small=c.toDataURL();
      const unchanged=await api.prepareVisionImages([small],true);
      ensure(unchanged.images[0]===small,'small image must remain byte-for-byte unchanged');
      // A valid >16 MiB PNG with ancillary/trailing data: lossless re-encoding must win.
      const binary=atob(small.split(',')[1])+'\0'.repeat(17*1024*1024);
      const padded='data:image/png;base64,'+btoa(binary);
      const lossless=await api.prepareVisionImages([padded,padded],true);
      ensure(lossless.transport.every(t=>t.encoding==='png'&&!t.lossy),'lossless preferred');
      ensure(lossless.images[0]===lossless.images[1],'duplicate reference order retained');
      const decoded=await api.loadImage(lossless.images[0]);
      ensure(decoded.naturalWidth===43&&decoded.naturalHeight===29,'lossless dimensions');
      const check=document.createElement('canvas');check.width=43;check.height=29;
      check.getContext('2d').drawImage(decoded,0,0);
      const actual=check.getContext('2d').getImageData(0,0,43,29).data;
      ensure(ctx.getImageData(0,0,43,29).data.every((v,i)=>v===actual[i]),'lossless pixels and transparency');
      ensure((await api.prepareVisionImages([padded],false)).images[0]===padded,'other providers unchanged');
      // Incompressible real pixels, rather than just an oversized string.
      const noise=document.createElement('canvas');noise.width=2600;noise.height=2200;
      const nc=noise.getContext('2d'),pixels=nc.createImageData(noise.width,noise.height);
      let seed=1234567;
      for(let i=0;i<pixels.data.length;i+=4){
        for(let j=0;j<3;j++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;pixels.data[i+j]=seed&255;}
        pixels.data[i+3]=255;
      }
      nc.putImageData(pixels,0,0);const large=noise.toDataURL();
      const originals=[large,large];
      const overviewRecords=await api.appendVisionOverviews(originals);
      ensure(originals[0]===large&&originals[1]===large,'original references remain byte-identical and ordered');
      ensure(JSON.stringify(overviewRecords.map(r=>[r.index,r.sourceIndex]))==='[[2,0],[3,1]]','overviews append after existing references');
      const overview=await api.loadImage(originals[2]);
      ensure(overview.naturalWidth===1800&&overview.naturalHeight===1523,'overview geometry');
      ensure(api.visionImageSize(large).bytes>16*1024*1024,'fixture must reproduce >16 MiB');
      const compressed=await api.prepareVisionImages([large],true);
      const transport=compressed.transport[0];
      ensure(transport.encoding==='jpeg'&&transport.lossy&&transport.quality>=.9,'high-quality fallback');
      const image=await api.loadImage(compressed.images[0]);
      ensure(image.naturalWidth===2600&&image.naturalHeight===2200,'JPEG must preserve every pixel dimension');
      ensure(transport.after.bytes<9500000&&transport.after.base64Bytes<9500000,'binary and Base64 limits');
      // Intercept the final request boundary and simulate the provider's actual size rejection.
      document.querySelector('#provider').value='ark';document.querySelector('#key').value='transport-test';
      document.querySelector('#reconReasoningEffort').value='';document.querySelector('#useRelay').checked=false;
      const select=document.querySelector('#reconModel');select.add(new Option('transport-test','doubao-vision-test'));select.value='doubao-vision-test';
      const originalFetch=window.fetch,requests=[];
      const response={nodes:[{id:'box',type:'rect',x:0,y:0,w:20,h:20,fill:'#123456'}],
        items:[{id:'panel',kind:'panel',x:0,y:0,w:20,h:20,description:'panel',colors:[]}],layers:[],connections:[],uncertainties:[],
        complete:true,defects:[],wholeImageAcceptable:true,coverage:[{region:'all',missingGroups:[]}],summary:'checked',operations:[]};
      window.fetch=async(url,options)=>{
        if(!String(url).includes('/chat/completions'))return originalFetch(url,options);
        const body=JSON.parse(options.body),images=body.messages[1].content.filter(p=>p.type==='image_url');
        ensure(new TextEncoder().encode(options.body).byteLength<60000000,'request body guard');
        for(const part of images){const size=api.visionImageSize(part.image_url.url);ensure(size.bytes<10000000&&size.base64Bytes<10000000,'mock provider OversizeImage');}
        requests.push({model:body.model,max_tokens:body.max_tokens,temperature:body.temperature,thinking:body.thinking,response_format:body.response_format,
          images:images.map(p=>({detail:p.image_url.detail,size:api.visionImageSize(p.image_url.url)}))});
        return new Response(JSON.stringify({model:body.model,choices:[{finish_reason:'stop',message:{content:JSON.stringify(response)}}]}),{status:200});
      };
      try{
        const audits=[{sourceInventory:true,wholeImage:true},{wholeImage:true},{defectDiagnosis:true,wholeImageAssessment:true,contextImage:padded},
          {regionPatch:true,contextImage:padded,retryRender:padded,fullSourceImage:padded},{defectDiagnosis:true,localInspection:true,contextImage:padded}];
        for(const audit of audits)await api.requestEditableScene(padded,43,29,{...audit,maxAttempts:1});
        const audit={wholeImage:true,maxAttempts:1};
        await api.requestEditableScene(large,2600,2200,audit);
        ensure(audit.requestParameters.imageTransport[0].encoding==='jpeg','request audit encoding evidence');
        ensure(audit.requestParameters.images[0].width===2600&&audit.requestParameters.images[0].height===2200,'request geometry unchanged');
        ensure(audit.compositionOverviews.length===1&&audit.compositionOverviews[0].sourceIndex===0,'overview source recorded');
        ensure(audit.requestParameters.images[1].role==='composition-overview','overview role recorded');
        ensure(requests.length===6,'exactly one API request per stage');
        ensure(requests.every(r=>r.model==='doubao-vision-test'&&r.temperature===.1&&r.images.every(i=>i.detail==='high')&&r.thinking.type==='disabled'&&r.response_format.type==='json_object'),'frozen model parameters');
        ensure(requests[0].max_tokens===128000&&requests[1].max_tokens===128000&&requests[5].max_tokens===128000,'whole-image token budget unchanged');
        ensure(JSON.stringify(requests.map(r=>r.images.length))==='[1,1,2,4,2,2]','all reference slots preserved with appended overview');
        const saved=HTMLCanvasElement.prototype.toDataURL,qualities=[];
        HTMLCanvasElement.prototype.toDataURL=function(type,q){if(type==='image/jpeg')qualities.push(q);return padded;};
        const failedAudit={wholeImage:true,maxAttempts:3};let stopped=false;
        try{await api.requestEditableScene(padded,43,29,failedAudit);}catch(e){stopped=/90%/.test(e.message);}
        finally{HTMLCanvasElement.prototype.toDataURL=saved;}
        ensure(stopped&&requests.length===6&&failedAudit.attempts===0&&failedAudit.state==='failed','unencodable image stops before API and retries');
        ensure(JSON.stringify(qualities)==='[0.98,0.95,0.92,0.9]','never silently lower quality');
        let totalStopped=false;try{api.checkVisionRequestSize({payload:'汉'.repeat(20000000)},true);}catch(e){totalStopped=e.imageTransportFailure===true;}
        ensure(totalStopped,'UTF-8 request size guard');
        const controller=new AbortController();controller.abort();let cancelled=false;
        try{await api.prepareVisionImages([padded],true,controller.signal);}catch(e){cancelled=e.name==='AbortError';}
        ensure(cancelled&&requests.length===6,'cancel prevents encoding/send');
      }finally{window.fetch=originalFetch;}
      return {originalBytes:api.visionImageSize(large).bytes,transport,requests,lossless:lossless.transport[0]};
    });
    assert.deepEqual(errors,[]);
    console.log('PASS lossless-first, >16 MiB real PNG, native pixels, high-quality fallback, all five stages, parameters, preflight failure and cancellation');
    console.log(JSON.stringify(result,null,2));
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
