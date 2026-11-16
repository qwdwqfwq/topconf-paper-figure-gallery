const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||path.join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));
const root=path.resolve(__dirname,'..');
const live=false,report={live,apiMocked:!live,requests:[],results:[],step4DisabledOnlyInServedTestResponse:true};
let browser,server,key;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const save=()=>{};
(async()=>{
 key='offline-key';
 const {createGalleryServer}=await import(pathToFileURL(path.join(root,'scripts/serve-nonelinear.mjs')).href);
 server=createGalleryServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),...(live?{proxy:{server:'http://127.0.0.1:7897'}}:{})});
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
 page.on('requestfinished',r=>{if(r.method()==='POST')console.log('FINISHED POST');});page.on('pageerror',e=>{report.pageError=String(e.message);save();});page.setDefaultTimeout(30000);let fail=false,imageNumber=0,pixels;
 page.on('request',req=>{if(['POST','PUT'].includes(req.method())){const u=new URL(req.url());report.requests.push({method:req.method(),host:u.hostname,path:u.pathname,at:new Date().toISOString()});save();console.log('REQUEST '+req.method()+' '+u.hostname+u.pathname);}});
 await page.route('**/*',async route=>{
  try { const req=route.request(),u=new URL(req.url());
  if(u.hostname==='gallery-infistar-image-jobs.lixiao-gallery.workers.dev')throw Error('Infistar must not use project job backend');
  if(u.origin===origin&&u.pathname==='/forge/'){
   const response=await route.fetch();let html=await response.text();
   const anchor='window.__ffReconstruct = () => runReconstruction();';assert.ok(html.includes(anchor));
   html=html.replace(anchor,anchor+`\nrunReconstruction=async()=>null;
    window.__directTest=async key=>{
     await revisionGallery.ready;mode='image';$('#provider').value='infistar';$('#key').value=key;
     const model='gemini-nano-banana-2.1';$('#model').add(new Option(model,model));$('#model').value=model;
     $('#figureRatio').value='16:9';$('#imageResolution').value='2K';syncImageRatioSupport();
     try{await genOaiImage('https://infistar.ai/v1',model,key,'Draw a clean academic method diagram on a white background with three colored rounded boxes labelled INPUT, METHOD, OUTPUT connected left to right by arrows. Use readable English text, blue accents, wide 16:9 layout.','infistar',[],'');return {ok:true};}
     catch(e){return {ok:false,error:String(e.message).replaceAll(key,'[redacted]')};}
    };`);
   return route.fulfill({response,body:html});
  }
  if(u.origin===origin)return route.continue();
  if(/infistar\.(ai|cc)$/.test(u.hostname)&&req.method()==='POST'){
   if(live)return route.continue();
   imageNumber++;const body=req.postDataJSON();
   assert.match(u.pathname,/gemini-nano-banana-2\.1:generateContent$/);assert.equal(u.search,'');
   assert.deepEqual(body.generationConfig.imageConfig,{aspectRatio:'16:9',imageSize:'2K'});
   if(fail)return route.fulfill({status:500,headers:{'access-control-allow-origin':'*','x-oneapi-request-id':'fixture-500'},json:{error:{message:'暂时供应不足，请稍后重试',code:'UPSTREAM_HTTP_500'}}});
   pixels=await page.evaluate(n=>{const c=document.createElement('canvas');c.width=2752;c.height=1536;const x=c.getContext('2d');x.fillStyle=n===1?'#336699':'#996633';x.fillRect(0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1];},imageNumber);
   return route.fulfill({headers:{'access-control-allow-origin':'*'},json:{candidates:[{finishReason:'STOP',content:{parts:[{inlineData:{mimeType:'image/png',data:pixels}}]}}]}});
  }
  if(live)return route.continue();
  return route.abort();
 } catch(e) {report.routeError=String(e.stack||e);save();console.error(report.routeError);await route.abort();}
 });
 await page.goto(origin+'/forge/');await page.waitForFunction(()=>window.__directTest&&document.querySelector('#provider option[value="infistar"]'));
 let start=Date.now();const initial=await page.evaluate(k=>window.__directTest(k),key);initial.elapsedMs=Date.now()-start;report.results.push({stage:'initial',...initial});save();console.log(JSON.stringify(report.results.at(-1)));assert.equal(initial.ok,true);
 const read=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const o=indexedDB.open('figureforge-revisions',1);o.onsuccess=()=>{const db=o.result,r=db.transaction('versions').objectStore('versions').getAll();r.onsuccess=()=>{resolve(r.result);db.close();};r.onerror=reject;};o.onerror=reject;}));
 const before=await read();assert.equal(before.length,1);report.initialImage={width:before[0].width,height:before[0].height,sha256:hash(before[0].image)};
 await page.locator('[data-modify]').last().click();await page.locator('.ff-revision-editor textarea').fill('Change the main blue accent color to green; keep the three box labels and arrows readable.');
 start=Date.now();await page.locator('.ff-revision-editor [data-submit]').click(); await page.waitForFunction(()=>document.querySelectorAll('.ff-version').length===2||document.querySelector('[data-revision-accept]')||document.querySelector('.ff-revision-error')?.textContent,null,{timeout:live?780000:30000});
 console.log('REVISION WAIT FINISHED');const error=await page.locator('.ff-revision-error').textContent();assert.equal(error,'');if(await page.locator('[data-revision-accept]').count())await page.locator('[data-revision-accept]').click();
 await page.waitForFunction(()=>document.querySelectorAll('.ff-version').length===2&&!document.querySelector('[data-revision-accept]'));
 let after;for(let i=0;i<30;i++){after=await read();if(after.length===2)break;await page.waitForTimeout(100);}assert.equal(after.length,2);
 const modified=after.find(v=>v.parentId);assert.ok(modified);assert.notEqual(hash(modified.image),report.initialImage.sha256);
 report.results.push({stage:'revision',ok:true,elapsedMs:Date.now()-start,audit:modified.revisionAudit});report.revisionImage={width:modified.width,height:modified.height,sha256:hash(modified.image)};save();console.log('PASS revision + accepted history');
 const snapshots=after.map(v=>[v.id,hash(v.image)]).sort();
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.ff-version').length===2);assert.deepEqual((await read()).map(v=>[v.id,hash(v.image)]).sort(),snapshots);report.historyRestored=true;
 if(!live){fail=true;const count=report.requests.length;const failure=await page.evaluate(k=>window.__directTest(k),key);assert.equal(failure.ok,false);assert.match(failure.error,/500/);assert.match(failure.error,/供应不足/);assert.equal(report.requests.length,count+1);assert.deepEqual((await read()).map(v=>[v.id,hash(v.image)]).sort(),snapshots);report.results.push({stage:'500-no-resubmit',...failure});}
 assert.ok(report.requests.every(r=>/infistar\.(ai|cc)$/.test(r.host)));assert.equal(report.requests.length,live?2:3);
 report.passed=true;console.log('PASS direct initial + revision + reload history'+(live?' (real provider)':' + 500 no resubmit'));
})().catch(e=>{report.error=String(e.stack||e).replaceAll(key||'never-match','[redacted]');console.error(report.error);process.exitCode=1;}).finally(async()=>{save();await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}});
