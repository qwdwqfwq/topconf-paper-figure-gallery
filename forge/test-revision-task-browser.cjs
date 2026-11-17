// Real revision UI, real IndexedDB, intercepted jobs; no paid upstream calls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||path.join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));
const root=path.resolve(__dirname,'..');
const fixture=`<!doctype html><meta charset="utf-8"><div id="output"></div><script type="module">
import {createRevisionGallery,generateRevision} from '/forge/revision-gallery.mjs';
const image=color=>{const c=document.createElement('canvas');c.width=160;c.height=90;c.getContext('2d').fillStyle=color;c.getContext('2d').fillRect(0,0,160,90);return c.toDataURL();};
window.pixels={source:image('red'),result:image('green'),screenshot:image('blue')};
const loadImage=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});
let active;window.gallery=createRevisionGallery({output:document.querySelector('#output'),busy:()=>false,getState:()=>null,captureView:()=>null,currentImage:()=>active?.image,activate:v=>{active=v;},download:()=>{},showExport:()=>{},rebuild:()=>{},generate:(v,p)=>generateRevision(v,p,{key:'fixture-key',toDataURL:async x=>x,loadImage})});
await gallery.ready;window.ready=true;
window.addSource=()=>gallery.addInitial({source:'image',image:pixels.source,width:160,height:90,route:{p:'infistar',base:'https://infistar.cc/v1',model:'gemini-3.1-flash-image',ratio:'16:9',resolution:'4K'}});
</script>`;
(async()=>{
 const server=http.createServer((req,res)=>{
  if(req.url==='/fixture'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fixture);}
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript; charset=utf-8':'text/plain');res.end(fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
  const failures={'real-400':{status:400,text:JSON.stringify({error:{code:'four_k_disabled',message:'暂时供应不足'}}),expected:/HTTP 400.*four_k_disabled/},'plain-403':{status:403,text:'Gallery origin required fixture-key',expected:/HTTP 403.*Gallery origin required \[redacted\]/},'html-403':{status:403,text:'<html>fixture-key secret upstream page</html>',expected:/HTTP 403.*接口未返回有效的错误说明/}};
  for(const scenario of ['refresh','task-storage-failure','history-storage-failure',...Object.keys(failures)]){
   const failure=failures[scenario];
   const context=await browser.newContext(),page=await context.newPage(),errors=[];let puts=0,reads=0,jobId,submitted,complete=scenario!=='refresh',output;
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   await context.addInitScript(()=>{
    const original=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value,...args){
     if(window.failTask&&this.name==='tasks'||window.failHistory&&this.name==='versions'&&value.parentId)throw new DOMException('fixture storage quota failure','QuotaExceededError');
     return original.call(this,value,...args);
    };
   });
   await context.route('https://gallery-revision-image-jobs.lixiao-gallery.workers.dev/**',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(req.method()==='PUT'){
     puts++;assert.equal(puts,1);jobId=u.pathname.split('/')[2];submitted=req.postDataJSON();
     assert.match(submitted.url,/^https:\/\/infistar\.cc\//);assert.equal(submitted.body.generationConfig.imageConfig.imageSize,'4K');
     if(scenario==='refresh')return route.abort('connectionfailed');
     return route.fulfill({status:202,json:{state:failure?'rejected':'queued'}});
    }
    reads++;assert.ok(u.pathname.includes(jobId));
    if(u.pathname.endsWith('/result'))return route.fulfill({json:failure?{ok:false,...failure,expected:undefined}:{ok:true,status:200,text:JSON.stringify({data:[{b64_json:output.split(',')[1]}]})}});
    return route.fulfill({status:complete?200:202,json:{state:complete?'succeeded':'running'}});
   });
   const open=async()=>{await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);await page.waitForFunction(()=>window.ready);};
   await open();output=await page.evaluate(()=>pixels.result);await page.evaluate(()=>addSource());
   await page.locator('textarea').fill('把标题改成测试标题');
   const screenshot=await page.evaluate(()=>pixels.screenshot);
   await page.locator('[data-files]').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:Buffer.from(screenshot.split(',')[1],'base64')});
   await page.waitForFunction(()=>document.querySelectorAll('.ff-revision-attachment').length===1&&!document.querySelector('[data-submit]').disabled);
   await page.evaluate(s=>{window.failTask=s==='task-storage-failure';window.failHistory=s==='history-storage-failure';},scenario);
   await page.locator('[data-submit]').click();
   if(scenario==='task-storage-failure'){
    await page.waitForFunction(()=>document.querySelector('[role=alert]').textContent.includes('quota'));
    assert.equal(puts,0);assert.equal(await page.locator('.ff-version').count(),1);
   }else if(failure){
    await page.waitForFunction(()=>document.querySelector('[role=alert]').textContent.includes('HTTP'));
    await open();const before=reads;await page.getByText('查看失败与原输入',{exact:true}).click();
    const errorText=await page.locator('[role=alert]').innerText();assert.match(errorText,failure.expected);assert.ok(!errorText.includes('fixture-key'));assert.ok(!errorText.includes('<html>'));
    assert.equal(await page.locator('textarea').inputValue(),'把标题改成测试标题');assert.equal(await page.locator('.ff-revision-attachment').count(),1);assert.equal(reads,before);assert.equal(puts,1);
   }else{
    if(scenario==='refresh')await page.waitForFunction(()=>document.querySelector('[data-revision-tasks]')?.textContent.includes('后台保留 24 小时'));
    else await page.waitForFunction(()=>document.querySelector('[role=alert]').textContent.includes('quota'));
    await open();complete=true;
    await page.getByText('取回修改任务',{exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.ff-version').length===2);
    assert.equal(puts,1);assert.equal(await page.locator('[data-revision-tasks] button').count(),0);
    const records=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('figureforge-bitmap-edit-tasks',1);r.onsuccess=()=>{const q=r.result.transaction('tasks').objectStore('tasks').getAll();q.onsuccess=()=>resolve(q.result);q.onerror=reject;};}));
    assert.equal(records.length,1);assert.equal(records[0].state,'saved');assert.equal(records[0].prompt,'把标题改成测试标题');assert.equal(records[0].input.attachments.length,1);assert.equal(records[0].input.route.base,'https://infistar.cc/v1');
    await open();assert.equal(await page.locator('.ff-version').count(),2);
    await page.locator('[data-delete]').first().click();await page.waitForFunction(()=>document.querySelectorAll('.ff-version').length===1);
    await page.locator('[data-delete]').first().click();await page.waitForFunction(()=>window.ready&&document.querySelectorAll('.ff-version').length===0);
    await open();assert.equal(await page.locator('.ff-version').count(),0);assert.equal(puts,1);
   }
   assert.deepEqual(errors,[]);console.log('PASS revision browser '+scenario);await context.close();
  }
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
