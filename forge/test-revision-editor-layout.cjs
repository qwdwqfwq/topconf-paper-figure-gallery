// Actual gallery DOM and IndexedDB; checks the layout regression without paid calls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||path.join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));
const root=path.resolve(__dirname,'..');
const fixture=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:20px;font-family:Arial,sans-serif}*{box-sizing:border-box}</style><div id="output"></div><script type="module">
import {createRevisionGallery} from '/forge/revision-gallery.mjs';
const c=document.createElement('canvas');c.width=1600;c.height=900;const ctx=c.getContext('2d');ctx.fillStyle='#f3efff';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#6944db';ctx.font='50px Arial';ctx.fillText('Figure — layout verification',80,140);
window.gallery=createRevisionGallery({output:document.querySelector('#output'),busy:()=>false,getState:()=>null,captureView:()=>null,currentImage:()=>null,activate:()=>{},download:()=>{},showExport:()=>{},rebuild:()=>{}});
await gallery.ready;window.ready=true;
window.addSource=()=>gallery.addInitial({source:'image',image:c.toDataURL(),width:1600,height:900,route:{p:'infistar',base:'https://infistar.cc/v1',model:'gemini-3.1-flash-image',ratio:'16:9',resolution:'4K'}});
window.seedTask=async()=>{const {revisionTaskStore}=await import('/forge/revision-task-store.mjs');await revisionTaskStore.write({schema:1,id:crypto.randomUUID(),createdAt:Date.now(),state:'queued',prompt:'保留标题',input:{id:crypto.randomUUID(),source:'image',image:c.toDataURL(),width:1600,height:900,route:{p:'infistar',base:'https://infistar.cc/v1',model:'gemini-3.1-flash-image',resolution:'4K'}}});};
</script>`;
(async()=>{
 const server=http.createServer((req,res)=>{
  if(req.url==='/fixture'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fixture);}
  const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
  for(const width of [1440,1024,851,850,390]){
   const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const open=async()=>{await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);await page.waitForFunction(()=>window.ready);};
   const check=async state=>{
    await page.evaluate(()=>scrollTo(0,0));
    const rects=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width};};return {image:rect('.ff-version'),editor:rect('.ff-revision-editor'),scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth};});
    if(width>850){assert.ok(rects.editor.x>=rects.image.right+16,`${width} ${state}: editor must be beside the images`);assert.ok(Math.abs(rects.editor.y-rects.image.y)<2,`${width} ${state}: editor must start beside first image`);}
    else assert.ok(rects.editor.bottom<=rects.image.y,`${width} ${state}: narrow screens keep the editor above images`);
    assert.ok(rects.scrollWidth<=rects.clientWidth,`${width} ${state}: no horizontal overflow`);
    console.log(`PASS editor layout ${width}px ${state}`);
   };
   await open();for(let i=0;i<4;i++)await page.evaluate(()=>addSource());
   await check('empty task list, four images');
   await page.evaluate(()=>seedTask());await open();await page.getByText('取回修改任务',{exact:true}).waitFor();
   await check('pending task after refresh');
   if(width===1440&&process.env.REVISION_LAYOUT_SCREENSHOT)await page.screenshot({path:process.env.REVISION_LAYOUT_SCREENSHOT,fullPage:true});
   await page.getByText('结束此任务',{exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-revision-tasks] button').length===0);
   await check('dismissed task');
   assert.deepEqual(errors,[]);await context.close();
  }
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
