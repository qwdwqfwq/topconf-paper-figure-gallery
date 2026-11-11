// Offline contract test: real decoding and request construction, mocked provider responses.
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
 const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
 const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({serviceWorkers:'block'});
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.goto(origin+'/forge/');
  const report=await page.evaluate(async()=>{
   const {generateRevision,revisionInstruction}=await import('./revision-gallery.mjs?v=20261112');
   const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1152;
   const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,2048,1152);
   ctx.fillStyle='red';ctx.fillRect(10,900,700,200);const source=canvas.toDataURL();
   ctx.fillStyle='white';ctx.fillRect(10,900,700,200);ctx.fillStyle='blue';ctx.fillRect(50,50,800,800);
   const edited=canvas.toDataURL();
   ctx.fillStyle='green';ctx.fillRect(1,1,1,1);const tiny=canvas.toDataURL();
   const shotCanvas=document.createElement('canvas');shotCanvas.width=300;shotCanvas.height=100;
   shotCanvas.getContext('2d').fillRect(20,20,30,30);const shot=shotCanvas.toDataURL();
   // Insert a legal PNG tEXt chunk: bytes differ, decoded pixels stay identical.
   const bytes=Uint8Array.from(atob(source.split(',')[1]),c=>c.charCodeAt(0));
   const payload=new TextEncoder().encode('Comment\0reencoded-original');
   const chunk=new Uint8Array(payload.length+12);new DataView(chunk.buffer).setUint32(0,payload.length);
   chunk.set(new TextEncoder().encode('tEXt'),4);chunk.set(payload,8);
   let crc=0xffffffff;for(const b of chunk.slice(4,-4)){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
   new DataView(chunk.buffer).setUint32(chunk.length-4,(crc^0xffffffff)>>>0);
   const combined=new Uint8Array(bytes.length+chunk.length);combined.set(bytes.slice(0,-12));combined.set(chunk,bytes.length-12);combined.set(bytes.slice(-12),bytes.length-12+chunk.length);
   let binary='';for(const b of combined)binary+=String.fromCharCode(b);
   const reencoded='data:image/png;base64,'+btoa(binary);
   const loadImage=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('decode failed'));img.src=src;});
   const deps={key:'offline-secret',toDataURL:async x=>x,loadImage};
   const route={base:'https://relay.example.test/v1',model:'gemini-3.1-flash-image-preview',p:'nonelinear',ratio:'16:9',resolution:'2K'};
   const parent={image:source,route,attachments:[{data:shot}]};
   const originalFetch=window.fetch,requests=[];let responseImage=edited,status=200;
   window.fetch=async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return new Response(status===200?JSON.stringify({data:[{b64_json:responseImage.split(',')[1]}]}):JSON.stringify({error:{message:'offline-secret Bearer another-secret'}}),{status,headers:{'x-request-id':'offline-request-123'}});};
   function check(value,message){if(!value)throw Error(message);}
   async function rejected(input,prompt,fragment){let error;try{await generateRevision(input,prompt,deps);}catch(e){error=e;}check(error&&error.message.includes(fragment),'Expected '+fragment+', got '+error?.message);return error;}
   try{
    const prompt='删除截图标记的左下块，保留其他内容，重新排版';
    const first=await generateRevision(parent,prompt,deps);
    check(requests.length===1,'one submission must make one POST');
    check(JSON.stringify(requests[0].body.image)===JSON.stringify([source,shot]),'input order');
    check(requests[0].body.prompt.endsWith(prompt),'verbatim current prompt');
    check(first.revisionAudit.requestId==='offline-request-123','provider request ID');
    check(first.revisionAudit.referenceCount===2&&first.revisionAudit.status===200,'request audit');
    responseImage=tiny;
    const second=await generateRevision({...parent,image:edited,attachments:[]},'将一个小标记变绿',deps);
    check(requests.length===2&&requests[1].body.image[0]===edited&&requests[1].body.image.length===1,'fresh source and screenshot snapshot');
    check(first.revisionAudit.clientRequestId!==second.revisionAudit.clientRequestId,'unique submission identity');
    check(first.revisionAudit.promptHash!==second.revisionAudit.promptHash,'new prompt identity');
    responseImage=source;await rejected(parent,prompt,'与原图像素相同');
    responseImage=reencoded;check(reencoded!==source,'distinct encoding');await rejected(parent,prompt,'与原图像素相同');
    responseImage=shot;await rejected(parent,prompt,'返回了上传的示意截图');
    const count=requests.length;
    await rejected({...parent,attachments:[{data:'bad-image'}]},prompt,'本次未发送');
    await rejected({...parent,attachments:Array.from({length:5},()=>({data:shot}))},prompt,'本次未发送');
    await rejected(parent,'   ','请填写');check(requests.length===count,'invalid input must not POST');
    status=400;const error=await rejected(parent,prompt,'HTTP 400');
    check(!error.message.includes('offline-secret')&&!error.message.includes('another-secret'),'redacted API errors');
    check(requests.length===count+1,'no automatic paid retry');
    for(const requirement of ['删除并重新排版','增加一个模块','更正文字','换成蓝色','移动到右上角']){
     const instruction=revisionInstruction(requirement,3);check(instruction.endsWith(requirement),'general request preserved');
     check(instruction.includes('do not assume every screenshot requests deletion'),'not a hardcoded deletion flow');
    }
    return {calls:requests.length,pixelComparison:'exact URI and differently encoded PNG rejected; one-pixel edit accepted',inputs:'source + screenshots + verbatim prompt',audit:'unique submission, input hashes, HTTP status, provider ID',retry:'manual only'};
   }finally{window.fetch=originalFetch;}
  });
  assert.equal(report.calls,6);console.log('Offline revision request checks passed:',JSON.stringify(report),'. Zero live API calls.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
