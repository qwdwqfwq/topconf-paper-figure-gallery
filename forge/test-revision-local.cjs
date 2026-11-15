// Actual Step 3 UI + decoded PNG invariants. Provider fixtures only: no paid requests.
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
 const {createGalleryServer}=await import(pathToFileURL(path.resolve(__dirname,'../scripts/serve-nonelinear.mjs')).href);
 const server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
  const page=await browser.newPage({serviceWorkers:'block',viewport:{width:1440,height:1100}});
  const calls=[],unexpected=[],errors=[],jobs=new Map();let fixtures,mode='green';
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request();let url=new URL(req.url()),jobId,jobBody;
   if(url.hostname==='gallery-infistar-image-jobs.lixiao-gallery.workers.dev'){
    jobId=url.pathname.split('/')[2];
    if(req.method()!=='PUT')return route.fulfill({json:url.pathname.endsWith('/result')?jobs.get(jobId):{id:jobId,state:'succeeded'}});
    const submission=req.postDataJSON();url=new URL(submission.url);jobBody=submission.body;
   }
   if(url.origin===origin)return route.continue();
   if(url.pathname.endsWith('/models'))return route.fulfill({json:{data:[{id:'gpt-image-2'},{id:'gemini-3.1-flash-image'}]}});
   if(url.pathname.endsWith('/pricing'))return route.fulfill({json:{data:[]}});
   let prompt,images=[],native=false;
   if(/\/images\/edits$/.test(url.pathname)){
    const form=await new Response(req.postDataBuffer(),{headers:{'content-type':req.headers()['content-type']}}).formData();
    prompt=form.get('prompt');assert.equal(form.get('size'),'1024x1024');
    for(const [k,v] of form)if(k.startsWith('image')&&typeof v!=='string')images.push(Buffer.from(await v.arrayBuffer()).toString('base64'));
   }else if(/:(?:streamGenerateContent|generateContent)$/.test(url.pathname)){
    native=true;const body=jobBody||req.postDataJSON(),parts=body.contents.flatMap(c=>c.parts);
    assert.equal(body.generationConfig.imageConfig.aspectRatio,'1:1');
    prompt=parts.filter(p=>p.text).map(p=>p.text).join('\n');images=parts.filter(p=>p.inlineData).map(p=>p.inlineData.data);
   }else{unexpected.push(url.pathname);return route.fulfill({status:400,json:{error:{message:'Unexpected offline request'}}});}
   calls.push({prompt,images,native});
   const data=mode==='echo'?images[0]:mode==='guide'?images[1]:fixtures[mode].split(',')[1];
   if(jobId){jobs.set(jobId,{ok:true,status:200,text:JSON.stringify({data:[{b64_json:data,mimeType:'image/png'}]})});return route.fulfill({json:{id:jobId,state:'succeeded'}});}
   if(native)return route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data}}]},finishReason:'STOP'}]})+'\n\n'});
   return route.fulfill({json:native?{candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data}}]}}]}:{data:[{b64_json:data}]}});
  });
  await page.goto(origin+'/forge/',{waitUntil:'domcontentloaded'});
  fixtures=await page.evaluate(()=>{
   const make=(w,h,color,label)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,w,h);if(label){x.fillStyle='#333';x.font='28px sans-serif';x.fillText(label,35,55);for(let i=0;i<4;i++){x.fillStyle=['#ddeaff','#ffdfdc','#e2f2df','#ece3fb'][i];x.fillRect(35+i*220,110,190,330);x.fillStyle='#333';x.fillText('Panel '+String.fromCharCode(65+i),50+i*220,160);x.fillText('Data '+(i+1),50+i*220,220);}}return c.toDataURL();};
   return {source:make(960,540,'#fff','Step 3 local editing'),green:make(1024,1024,'#42aa77'),blue:make(1024,1024,'#7777ee'),wrong:make(512,256,'#ff0000'),reference:make(260,120,'#ffcc77')};
  });
  const core=await page.evaluate(async()=>{
   const {prepareLocalEdit,prepareLocalRedraw,compositeLocalEdit,localEditCrop}=await import('./revision-local.mjs?v=20261115-local');
   const load=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});
   const make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
   const source=make(201,93),ctx=source.getContext('2d',{willReadFrequently:true});
   for(let y=0;y<93;y++)for(let x=0;x<201;x++){ctx.fillStyle=`rgba(${x%255},${y%255},90,${x%3===0?.5:1})`;ctx.fillRect(x,y,1,1);}
   const original=await load(source.toDataURL());const baseline=()=>{ctx.clearRect(0,0,201,93);ctx.drawImage(original,0,0);return ctx.getImageData(0,0,201,93).data;};
   let outside=0,inside=0,cases=0;
   const selections=[[{x:0,y:0,width:2,height:2}],[{x:180,y:80,width:21,height:13}],[{x:0,y:0,width:9,height:8},{x:190,y:85,width:11,height:8}],[{x:0,y:0,width:201,height:93}]];
   for(const regions of selections){
    const p=prepareLocalEdit(original,regions),edit=make(p.crop.width,p.crop.height);edit.getContext('2d').fillRect(0,0,edit.width,edit.height);
    const before=baseline(),result=await compositeLocalEdit(original,edit,regions,p.crop,load),afterImg=await load(result.image);
    ctx.clearRect(0,0,201,93);ctx.drawImage(afterImg,0,0);const after=ctx.getImageData(0,0,201,93).data;
    for(let y=0;y<93;y++)for(let x=0;x<201;x++){const i=(y*201+x)*4;if([0,1,2,3].some(k=>before[i+k]!==after[i+k])){if(regions.some(r=>x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height))inside++;else outside++;}}
    if(result.width!==201||result.height!==93||result.changedOutside!==0)throw Error('dimensions/outside invariant');cases++;
   }
   const regions=[{x:40,y:20,width:15,height:15}],p=prepareLocalEdit(original,regions);
   // Model changes only the context. Selected pixels are unchanged: reject.
   const edit=make(p.crop.width,p.crop.height),e=edit.getContext('2d');e.drawImage(await load(p.image),0,0);e.fillStyle='red';e.fillRect(0,0,1,1);
   // Use an opaque source to test no-op rejection independently of alpha flattening in the crop.
   const opaque=make(201,93);opaque.getContext('2d').fillRect(0,0,201,93);const op=prepareLocalEdit(opaque,regions);
   const target=await load(op.target),targetCanvas=make(op.crop.width,op.crop.height);targetCanvas.getContext('2d').drawImage(target,0,0);
   const erased=Array.from(targetCanvas.getContext('2d').getImageData(regions[0].x-op.crop.x,regions[0].y-op.crop.y,1,1).data).every(v=>v===255);
   const full=[{x:0,y:0,width:201,height:93}],wide=localEditCrop(201,93,full,true),square=localEditCrop(201,93,full);
   const wideFraming=wide.width===201&&wide.height===114&&square.width===square.height;
   const noOp=make(op.crop.width,op.crop.height);noOp.getContext('2d').drawImage(await load(op.image),0,0);noOp.getContext('2d').fillStyle='red';noOp.getContext('2d').fillRect(0,0,1,1);
   let noOpRejected=false;try{await compositeLocalEdit(opaque,noOp,regions,op.crop,load);}catch(e){noOpRejected=e.message.includes('没有像素变化');}
   let ratioRejected=false;try{await compositeLocalEdit(original,make(120,60),regions,p.crop,load);}catch(e){ratioRejected=e.message.includes('比例错误');}
   const large=make(1513,815),roundedRegions=[{x:30,y:18,width:1468,height:60},{x:805,y:702,width:647,height:54}];
   large.getContext('2d').fillRect(0,0,1513,815);
   const roundedPatch=prepareLocalEdit(large,roundedRegions,true),rounded=make(2752,1536);
   const roundedResult=await compositeLocalEdit(large,rounded,roundedRegions,roundedPatch.crop,load);
   const nativeRoundingAccepted=roundedResult.changedOutside===0&&roundedResult.width===1513&&roundedResult.height===815;
   const redrawRegions=[{x:20,y:10,width:100,height:60}],redraw=prepareLocalRedraw(opaque,redrawRegions,['1:1','3:2']);
   const redrawOutput=make(150,100),redrawResult=await compositeLocalEdit(opaque,redrawOutput,redrawRegions,redraw.crop,load,1.5);
   if(redraw.ratio!=='3:2'||redraw.crop.x!==20||redrawResult.changedOutside!==0||redrawResult.changedInside!==6000)throw Error('Redraw exact rectangle mapping');
   return {cases,outside,inside,noOpRejected,ratioRejected,erased,wideFraming,nativeRoundingAccepted,redrawMapping:true};
  });
  assert.equal(core.outside,0);assert.ok(core.inside>0);assert.equal(core.noOpRejected,true);assert.equal(core.ratioRejected,true);assert.equal(core.erased,true);assert.equal(core.wideFraming,true);
  assert.equal(core.nativeRoundingAccepted,true);
  async function configure(model){
   await page.locator('#provider').selectOption('infistar');await page.locator('#key').fill('offline-fixture-no-secret');
   await page.locator('#modeTabs [data-mode="image"]').click();
   await page.waitForFunction(model=>Array.from(document.querySelector('#model').options).some(o=>o.value===model),model);
   await page.locator('#model').selectOption(model);await page.locator('#passTabs [data-pass="direct"]').click();
   await page.locator('#figureRatio').selectOption('16:9');await page.locator('#imageResolution').selectOption('1K');
  }
  async function records(){return page.evaluate(()=>new Promise(resolve=>{const q=indexedDB.open('figureforge-revisions',1);q.onsuccess=()=>{const d=q.result,r=d.transaction('versions').objectStore('versions').getAll();r.onsuccess=()=>{d.close();resolve(r.result.sort((a,b)=>a.number-b.number));};};}));}
  async function waitCount(n){await page.waitForFunction(n=>new Promise(resolve=>{const q=indexedDB.open('figureforge-revisions',1);q.onsuccess=()=>{const d=q.result,r=d.transaction('versions').objectStore('versions').count();r.onsuccess=()=>{d.close();resolve(r.result===n);};};}),n);}
  async function draw(index,from,to){
   const canvas=page.locator('.ff-version').nth(index).locator('[data-local-selection]');await canvas.evaluate(el=>el.scrollIntoView({behavior:'instant',block:'center'}));
   await page.waitForFunction(()=>document.fonts.status==='loaded');
   // Upload/edit actions scroll the card smoothly. Measure drag coordinates
   // only after its image stops moving, as a person would before drawing.
   await canvas.evaluate(el=>new Promise((resolve,reject)=>{
    let last='',stable=0,frames=0;
    const frame=()=>{const r=el.getBoundingClientRect(),now=[r.x,r.y,r.width,r.height].join(',');stable=now===last?stable+1:0;last=now;
     if(stable>=8)return resolve();if(++frames>180)return reject(Error('Selection canvas did not settle'));requestAnimationFrame(frame);};
    requestAnimationFrame(frame);
   }));
   const b=await canvas.boundingBox();
   await page.mouse.move(b.x+b.width*from[0],b.y+b.height*from[1]);await page.mouse.down();await page.mouse.move(b.x+b.width*to[0],b.y+b.height*to[1]);await page.mouse.up();
  }
  async function start(index,text){await page.locator('.ff-version').nth(index).locator('[data-modify]').click();await page.locator('.ff-revision-editor textarea').fill(text);await page.locator('[data-manual-revision]').click();}
  async function review(){try{await page.locator('[data-revision-accept]').waitFor({timeout:10000});}catch(e){throw Error('Review did not appear: '+await page.locator('.ff-revision-error').textContent()+'; unexpected='+JSON.stringify(unexpected)+'; calls='+calls.length,{cause:e});}assert.equal(await page.locator('[data-compare-slider]').count(),1);}
  async function pixelDiff(before,after,regions){return page.evaluate(async({before,after,regions})=>{
   const load=src=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=src;});const a=await load(before),b=await load(after),c=document.createElement('canvas');c.width=a.width;c.height=a.height;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(a,0,0);const p=x.getImageData(0,0,c.width,c.height).data;x.clearRect(0,0,c.width,c.height);x.drawImage(b,0,0);const q=x.getImageData(0,0,c.width,c.height).data;let outside=0,inside=0;for(let y=0;y<c.height;y++)for(let z=0;z<c.width;z++){const i=(y*c.width+z)*4;if([0,1,2,3].some(k=>p[i+k]!==q[i+k])){if(regions.some(r=>z>=r.x&&z<r.x+r.width&&y>=r.y&&y<r.y+r.height))inside++;else outside++;}}return {outside,inside,width:b.width,height:b.height};
  },{before,after,regions});}
  await configure('gpt-image-2');
  await page.locator('[data-original-file]').setInputFiles({name:'original.png',mimeType:'image/png',buffer:Buffer.from(fixtures.source.split(',')[1],'base64')});await waitCount(1);
  assert.equal(await page.locator('[data-manual-revision]').isDisabled(),true);
  await draw(0,[.24,.22],[.44,.65]);
  await page.locator('[data-files]').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:Buffer.from(fixtures.reference.split(',')[1],'base64')});await page.waitForSelector('.ff-revision-attachment');
  const prompt='把框里的内容换成绿色，保留其他部分';
  await start(0,prompt);await review();assert.equal((await records()).length,1);assert.equal(calls.length,1);
  assert.equal(calls[0].images.length,3);assert.notEqual(calls[0].images[0],fixtures.source.split(',')[1]);assert.notEqual(calls[0].images[0],calls[0].images[1]);assert.equal(calls[0].images[2],fixtures.reference.split(',')[1]);
  assert.ok(calls[0].prompt.includes('UNMARKED crop'));assert.ok(calls[0].prompt.includes(prompt));
  await page.locator('[data-compare-slider]').fill('0');await page.locator('[data-compare-slider]').dispatchEvent('input');
  assert.ok((await page.locator('.ff-local-comparison img[alt="修改前"]').getAttribute('style')).includes('100%'));
  await page.locator('[data-revision-reject]').click();assert.equal((await records()).length,1);
  assert.equal(await page.locator('.ff-revision-editor textarea').inputValue(),prompt);assert.equal(await page.locator('.ff-revision-attachment').count(),1);assert.equal(await page.locator('[data-manual-revision]').isEnabled(),true);
  await start(0,prompt);await review();
  const artifacts=process.env.REVISION_ARTIFACT_DIR;if(artifacts){fs.mkdirSync(artifacts,{recursive:true});await page.locator('[data-compare-slider]').fill('30');await page.locator('[data-compare-slider]').dispatchEvent('input');await page.locator('.ff-revision-review').screenshot({path:path.join(artifacts,'local-review.png')});}
  await page.locator('[data-revision-accept]').click();await waitCount(2);
  let rows=await records();const a=rows[1].revisionAudit;
  assert.equal(rows[1].parentId,rows[0].id);assert.equal(rows[0].image,fixtures.source);assert.equal(a.review,'user-confirmed');assert.equal(a.changedOutside,0);assert.equal(a.encodedPixelCheck,'passed');assert.equal(a.apiRequestCount,1);
  assert.ok(a.crop.width<960);assert.ok(a.regions[0].x>=229&&a.regions[0].x<=231);assert.ok(a.regions[0].y>=118&&a.regions[0].y<=120,JSON.stringify({regions:a.regions}));
  const firstDiff=await pixelDiff(rows[0].image,rows[1].image,a.regions);assert.equal(firstDiff.outside,0);assert.ok(firstDiff.inside>0);assert.equal(firstDiff.width,960);assert.equal(firstDiff.height,540);
  // Native model, continuing the new version, on a narrow viewport; current image must be the source.
  mode='blue';await configure('gemini-3.1-flash-image');await page.setViewportSize({width:390,height:844});
  await draw(1,[.7,.3],[.9,.6]);await start(1,'把第二个区域改成蓝色');await review();await page.locator('[data-revision-accept]').click();await waitCount(3);
  rows=await records();assert.equal(rows[2].parentId,rows[1].id);assert.equal(calls.at(-1).native,true);assert.equal(rows[2].revisionAudit.apiRequestCount,1);
  const secondDiff=await pixelDiff(rows[1].image,rows[2].image,rows[2].revisionAudit.regions);assert.equal(secondDiff.outside,0);assert.ok(secondDiff.inside>0);
  const inherited=await pixelDiff(rows[0].image,rows[2].image,[...a.regions,...rows[2].revisionAudit.regions]);assert.equal(inherited.outside,0);assert.ok(inherited.inside>firstDiff.inside);
  // Failure modes must never save or silently retry; original input remains editable.
  await page.setViewportSize({width:1440,height:1100});await page.locator('.ff-version').nth(0).locator('[data-modify]').click();
  for(const [response,fragment] of [['wrong','比例错误'],['echo','与原图像素相同'],['guide','示意截图']]){
   mode=response;const before=calls.length;await start(0,'测试错误响应并保留输入');
   try{await page.waitForFunction(fragment=>document.querySelector('.ff-revision-error')?.textContent.includes(fragment),fragment,{timeout:10000});}catch(e){throw Error('Failure fixture '+response+': '+await page.locator('.ff-revision-error').textContent()+'; calls='+calls.length,{cause:e});}
   assert.equal(calls.length,before+1);assert.equal((await records()).length,3);assert.equal(await page.locator('.ff-revision-editor textarea').inputValue(),'测试错误响应并保留输入');
  }
  await page.locator('.ff-version').nth(0).locator('[data-local-undo]').click();assert.equal(await page.locator('[data-manual-revision]').isDisabled(),true);
  await draw(0,[.1,.1],[.2,.2]);await draw(0,[.11,.11],[.19,.19]);assert.ok((await page.locator('.ff-revision-error').textContent()).includes('不能重叠'));
  await page.locator('.ff-version').nth(0).locator('[data-local-clear]').click();assert.equal(await page.locator('[data-manual-revision]').isDisabled(),true);
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.ff-version');assert.equal(await page.locator('.ff-version').count(),3);
  await page.locator('.ff-version').nth(1).locator('[data-compare-version]').click();await page.locator('dialog[open] [data-compare-slider]').waitFor();
  const sizes=await page.locator('dialog[open] .ff-local-comparison img').evaluateAll(imgs=>imgs.map(i=>({width:i.getBoundingClientRect().width,height:i.getBoundingClientRect().height})));
  assert.ok(Math.abs(sizes[0].width-sizes[1].width)<1);assert.ok(Math.abs(sizes[0].height-sizes[1].height)<1);
  await page.locator('dialog[open]').getByRole('button',{name:'关闭',exact:true}).click();
  const contracts=await page.evaluate(async fixtures=>{
   const {generateRevision}=await import('./revision-gallery.mjs');
   const {unpackImageBody}=await import('./step3-image-protocol.mjs');
   const loadImage=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});
   const options={key:'offline-fixture',loadImage,toDataURL:async x=>x};
   const originalFetch=window.fetch,requests=[],uploads=[],discoveries=[],jobs=new Map();let failRead=false,failModels=false;
   window.fetch=async(url,options)=>{
    if(url.startsWith('https://gallery-infistar-image-jobs.lixiao-gallery.workers.dev/jobs/')){
     const id=new URL(url).pathname.split('/')[2];
     if(options?.method==='PUT'){
      const submission=JSON.parse(options.body),body=unpackImageBody(submission.body),response=await window.fetch(submission.url,{body:body instanceof FormData?body:JSON.stringify(body)});
      jobs.set(id,{ok:response.ok,status:response.status,text:await response.text()});
      return new Response(JSON.stringify({id,state:'succeeded'}));
     }
     return new Response(JSON.stringify(url.endsWith('/result')?jobs.get(id):{id,state:'succeeded'}));
    }
    if(url==='https://nonelinear.com.cn/api/upload-file'){
     uploads.push(JSON.parse(options.body));return new Response(JSON.stringify({url:'https://storage.example.test/crop-'+uploads.length+'.png'}));
    }
    if(url.endsWith('/models')){discoveries.push({url,options});return new Response(JSON.stringify(failModels?{error:{message:'catalogue unavailable'}}:{data:[{id:'gpt-4.1'},{id:'gpt-6-sol'},{id:'gpt-6.1-terra'},{id:'gpt-6.1-sol'},{id:'gpt-image-2'},{id:'gpt-99-codex'}]}),{status:failModels?503:200});}
    requests.push({url,body:options.body instanceof FormData?Object.fromEntries(options.body):JSON.parse(options.body)});
    if(url.endsWith('/chat/completions'))return new Response(JSON.stringify(failRead?{error:{message:'fixture failure'}}:{choices:[{message:{reasoning_content:'Hidden draft should never be forwarded',content:'Keep node labels Source and Target; place Source left and Target right, connected by an arrow. Pale blue academic style.'}}]}),{status:failRead?400:200});
    if(url.includes(':generateContent'))return new Response(JSON.stringify({candidates:[{content:{parts:[{thought:true,inlineData:{mimeType:'image/png',data:fixtures.reference.split(',')[1]}},{inlineData:{mimeType:'image/png',data:fixtures.green.split(',')[1]}}]},finishReason:'STOP'}]}));
    return new Response(JSON.stringify({data:[{b64_json:fixtures.green.split(',')[1]}]}));
   };
   try{
    const parent={image:fixtures.source,freeRevision:true,manualScope:true,editRegions:[{x:230,y:119,width:192,height:232}],attachments:[{data:fixtures.reference}]};
    const nonelinear=await generateRevision({...parent,route:{p:'nonelinear',model:'gemini-3.1-flash-image-preview',base:'https://relay.example.test/v1',ratio:'16:9',resolution:'1K'}},'绿色局部',options);
    if(uploads.length!==3||uploads[0].image===fixtures.source.split(',')[1]||uploads[1].image===uploads[0].image||uploads[2].image!==fixtures.reference.split(',')[1])throw Error('NoneLinear crop/guide/reference upload order');
    if(requests.length!==1||requests[0].body.image.length!==3||nonelinear.revisionAudit.changedOutside!==0||nonelinear.route.ratio!=='16:9')throw Error('NoneLinear local request/composite');
    const oai=await generateRevision({...parent,route:{p:'oai',model:'gpt-image-2',base:'https://api.openai.com/v1',ratio:'16:9',resolution:'1K'}},'绿色局部',options);
    if(requests[1].url!=='https://api.openai.com/v1/images/edits'||requests[1].body.size!=='1024x1024'||oai.revisionAudit.changedOutside!==0)throw Error('OpenAI local edit contract');
    const before=requests.length;let rejected=false;
    try{await generateRevision({...parent,route:oai.route,attachments:Array.from({length:4},()=>({data:fixtures.reference}))},'不能发送',options);}catch(e){rejected=e.message.includes('最多添加 3 张');}
    if(!rejected||requests.length!==before)throw Error('Excess reference preflight');
    const banana=await generateRevision({...parent,route:{p:'infistar',model:'gemini-nano-banana-2.1',base:'https://infistar.cc/v1',ratio:'16:9',resolution:'1K'}},'绿色局部',options);
    if(requests.length!==before+1||!requests.at(-1).url.endsWith(':generateContent')||banana.revisionAudit.streaming===true||banana.revisionAudit.apiRequestCount!==1||banana.revisionAudit.changedOutside!==0)throw Error('Nano Banana local synchronous one-call contract');
    const redrawParent={...parent,localRedraw:true,editRegions:[{x:230,y:119,width:192,height:192}],route:banana.route};
    if(discoveries.length)throw Error('Ordinary editing must not discover reader models');
    const redrawStart=requests.length,redraw=await generateRevision(redrawParent,'把上下改成左右，不要只是改字改色',options);
    const read=requests[redrawStart].body,draw=requests[redrawStart+1].body;
    const readParts=read.messages.flatMap(c=>c.content),drawParts=draw.contents.flatMap(c=>c.parts);
    if(!requests[redrawStart].url.endsWith('/chat/completions')||read.model!=='gpt-6.1-sol'||requests.length!==redrawStart+2||readParts.filter(p=>p.type==='image_url'&&p.image_url.detail==='high').length!==2)throw Error('Redraw content read contract');
    if(drawParts.some(p=>p.inlineData)||!drawParts.some(p=>p.text?.includes('Source left and Target right'))||drawParts.some(p=>p.text?.includes('Hidden draft')))throw Error('Redraw must use final text only, no original-layout image');
    if(redraw.revisionAudit.contentReadModel!=='gpt-6.1-sol'||redraw.revisionAudit.apiRequestCount!==2||redraw.revisionAudit.referenceCount!==0||redraw.revisionAudit.changedOutside!==0||redraw.revisionAudit.editingPolicy!=='content-redraw')throw Error('Redraw audit and outside preservation');
    if(discoveries.length!==1||discoveries[0].url!=='https://infistar.cc/v1/models'||discoveries[0].options.headers.Authorization!=='Bearer offline-fixture')throw Error('Reader discovery provider/key contract');
    failModels=true;const catalogueStart=requests.length;let catalogueFailed=false;
    try{await generateRevision(redrawParent,'重新绘制',options);}catch(e){catalogueFailed=e.message.includes('模型自动选择失败');}
    if(!catalogueFailed||requests.length!==catalogueStart)throw Error('Catalogue failure must not read, draw, retry or fall back');
    failModels=false;failRead=true;let readFailed=false;const failureStart=requests.length;
    try{await generateRevision(redrawParent,'重新绘制',options);}catch(e){readFailed=e.message.includes('读取选区失败');}
    if(!readFailed||requests.length!==failureStart+1)throw Error('Failed read must not draw or retry');
    let multiRejected=false,providerRejected=false;const preflightStart=requests.length,discoveryStart=discoveries.length;
    try{await generateRevision({...redrawParent,editRegions:[...redrawParent.editRegions,{x:600,y:100,width:50,height:50}]},'重新绘制',options);}catch(e){multiRejected=e.message.includes('一个框');}
    try{await generateRevision({...redrawParent,route:oai.route},'重新绘制',options);}catch(e){providerRejected=e.message.includes('无限星河');}
    if(!multiRejected||!providerRejected||requests.length!==preflightStart||discoveries.length!==discoveryStart)throw Error('Redraw preflight must not charge unsupported inputs');
    return {nonelinear:true,oai:true,nanoBananaSynchronous:true,thoughtDraftExcluded:true,referenceLimit:true,redrawTextOnly:true,redrawTwoCalls:true,readFailureNoRetry:true,redrawPreflight:true,latestReader:true,ordinaryEditNoDiscovery:true,catalogueFailureNoCalls:true,requests:requests.length};
   }finally{window.fetch=originalFetch;}
  },fixtures);
  assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
  const report={passed:true,liveAPICalls:0,providerRequests:calls.length+contracts.requests,core,firstDiff,secondDiff,contracts,reviewBeforeSave:true,rejectedInputRetained:true,gptAndGemini:true,continuedFromChild:true,mobileCoordinates:true,reloadComparison:true,noStep4Requests:true};
  if(artifacts)fs.writeFileSync(path.join(artifacts,'local-test-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
