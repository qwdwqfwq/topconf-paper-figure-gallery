// Local real-provider test through the Step 4 upload and export controls.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),https=require('node:https');
const {execFile}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');
const input=path.resolve(process.argv[2]||''),output=path.resolve(process.argv[3]||'work/live-step4');
if((!process.env.FF_API_KEY&&!process.env.FF_EXPORT_ONLY)||!fs.existsSync(input))throw Error('Set FF_API_KEY and pass input PNG');
fs.mkdirSync(output,{recursive:true});
const root=path.resolve(__dirname,'..');
const deployedAssets={};
function readAsset(relative,filename,callback){
 if(!process.env.FF_DEPLOYED_BASE||!relative.startsWith('/forge/'))return fs.readFile(filename,callback);
 const url=process.env.FF_DEPLOYED_BASE.replace(/\/$/,'')+'/'+relative.slice('/forge/'.length);
 fetch(url,{cache:'no-store'}).then(async r=>{
  if(!r.ok)throw Error('Deployed asset HTTP '+r.status+': '+relative);
  const bytes=Buffer.from(await r.arrayBuffer());
  deployedAssets[relative]={url,sha256:require('node:crypto').createHash('sha256').update(bytes).digest('hex')};
  fs.writeFileSync(path.join(output,'deployed-assets.json'),JSON.stringify(deployedAssets,null,2));
  callback(null,bytes);
 }).catch(callback);
}
function render(pptx,png,width,height){return new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/render-pptx-office.ps1'),'-InputPptx',pptx,'-OutputPng',png,'-Width',String(width),'-Height',String(height)],{windowsHide:true,timeout:120000},e=>e?reject(e):resolve()));}
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname);
 if(pathname==='/relay/chat/completions'){
  const callStarted=Date.now();
  const upstream=https.request('https://infistar.cc/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.FF_API_KEY}},r=>{let bytes=0;console.log('API status:',r.statusCode);r.on('data',b=>bytes+=b.length);r.on('end',()=>console.log('API complete:',bytes,'bytes',Date.now()-callStarted,'ms'));r.on('aborted',()=>{console.error('API response aborted:',bytes,'bytes');res.destroy();});res.writeHead(r.statusCode||502,{'Content-Type':r.headers['content-type']||'application/json'});r.pipe(res);});
  res.on('close',()=>{if(!res.writableEnded)upstream.destroy();});
  upstream.on('error',e=>{console.error('API connection:',e.code||e.name);if(!res.destroyed){res.writeHead(502);res.end(JSON.stringify({error:{message:'Upstream connection failed'}}));}});req.pipe(upstream);return;
 }
 if(pathname==='/render-pptx'){
  const chunks=[];req.on('data',b=>chunks.push(b));req.on('end',async()=>{try{
   const pptx=path.join(output,'office-input.pptx'),png=path.join(output,'office-qa.png');fs.writeFileSync(pptx,Buffer.concat(chunks));
   await render(pptx,png,Number(url.searchParams.get('width')),Number(url.searchParams.get('height')));
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({image:'data:image/png;base64,'+fs.readFileSync(png).toString('base64')}));
  }catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}));}});return;
 }
 const relative=pathname.endsWith('/')?pathname+'index.html':pathname,filename=path.resolve(root,'.'+relative);
 if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 readAsset(relative,filename,(err,bytes)=>{if(err){res.writeHead(404);res.end();return;}
  if(relative==='/forge/index.html')bytes=Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n').replace("import * as T from './vendor/transformers.min.js';",'const T={};').replace("await boot();\ninitProviders();\nsyncSubCount();\nawait Promise.all([populateModels(), populateParserModels()]);\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});","MAN=FALLBACK;\ninitProviders();\nsyncSubCount();\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});"));
  if(relative==='/forge/index.html')bytes=Buffer.from(bytes.toString('utf8').replace('async function runReconstruction(options={}){','window.__ffTestResume=async(scene,regionIds,exportOnly)=>{const st=ensureExportState();st.scene=scene;if(exportOnly){const im=await loadImage(st.bitmap),c=document.createElement(\'canvas\');c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext(\'2d\').drawImage(im,0,0);scene=repairStructuralLayers(recoverDocumentInk(scene,c),c);const svg=sceneToSvgString(scene);Object.assign(st,{scene,vectorScene:scene,svg,baseSvg:svg,vectorSvg:svg,exportMode:\'vector\',source:\'bitmap\',recon:{mode:\'vector\',nodes:scene.nodes.length}});renderEditableExportCard();return;}st.reconPending=true;try{await runReconstruction({refine:true,regionIds});}finally{st.reconPending=false;renderEditableExportCard();}};\nasync function runReconstruction(options={}){'));
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css'})[path.extname(filename)]||'application/octet-stream'});res.end(bytes);
 });
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage({acceptDownloads:true});page.on('pageerror',e=>console.error('Page:',e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/forge/',{waitUntil:'domcontentloaded'});
  await page.evaluate(({port,model})=>{
   document.querySelector('#provider').value='infistar';document.querySelector('#useRelay').checked=true;
   document.querySelector('#baseOverride').value='http://127.0.0.1:'+port+'/relay';document.querySelector('#key').value='local-proxy';
   const s=document.querySelector('#reconModel');if(![...s.options].some(o=>o.value===model))s.add(new Option(model,model));s.value=model;
   document.querySelector('#reconReasoningEffort').value='medium';
   window.__ffRenderPptx=async(blob,{width,height})=>{const r=await fetch('/render-pptx?width='+width+'&height='+height,{method:'POST',body:blob});const j=await r.json();if(!r.ok)throw Error(j.error);return j.image;};
  },{port:server.address().port,model:process.env.FF_MODEL||'gpt-6.1-sol'});
  await page.locator('#exportBitmapUpload').setInputFiles(input);
  await page.waitForFunction(()=>!!window.__ffExportState.bitmap);
  const started=Date.now();
  if(process.env.FF_RESUME_SCENE){
   const seed=JSON.parse(fs.readFileSync(process.env.FF_RESUME_SCENE,'utf8'));
   await page.evaluate(async({scene,regionIds,exportOnly})=>{if(exportOnly)await window.__ffTestResume(scene,regionIds,true);else void window.__ffTestResume(scene,regionIds);},{scene:seed.scene||seed,exportOnly:!!process.env.FF_EXPORT_ONLY,regionIds:process.env.FF_REGION_IDS?.split(',')});
  }else await page.locator('#reconBtn').click();
  let previous='',lastCheckpoint=0;
  while(true){
   const a=await page.evaluate(()=>({pending:window.__ffExportState.reconPending,phase:window.__ffApiAudit?.reconstruction?.phase,status:window.__ffApiAudit?.reconstruction?.state,nodes:window.__ffExportState.scene?.nodes?.length,requests:window.__ffApiAudit?.reconstruction?.tiles?.length}));
   const status=JSON.stringify(a);if(status!==previous){console.log(Math.round((Date.now()-started)/1000)+'s',status);previous=status;}
   if(Date.now()-lastCheckpoint>=30000){
    const checkpoint=await page.evaluate(()=>({scene:window.__ffExportState.scene,audit:window.__ffApiAudit?.reconstruction}));
    if(checkpoint.scene&&!fs.existsSync(path.join(output,'first-published-scene.json')))fs.writeFileSync(path.join(output,'first-published-scene.json'),JSON.stringify(checkpoint.scene));
    fs.writeFileSync(path.join(output,'checkpoint.json'),JSON.stringify({...checkpoint,wallTimeMs:Date.now()-started}));lastCheckpoint=Date.now();
   }
   if(!a.pending)break;await new Promise(r=>setTimeout(r,5000));
  }
  const result=await page.evaluate(()=>({scene:window.__ffExportState.scene,svg:window.__ffExportState.svg,audit:window.__ffApiAudit?.reconstruction}));
  fs.writeFileSync(path.join(output,'audit.json'),JSON.stringify({...result.audit,wallTimeMs:Date.now()-started},null,2));
  if(!result.scene)throw Error('No editable scene; inspect audit.json');
  fs.writeFileSync(path.join(output,'scene.json'),JSON.stringify(result.scene));fs.writeFileSync(path.join(output,'reconstructed.svg'),result.svg);
  await page.locator('[data-export="pptx"]').click();const downloadPromise=page.waitForEvent('download',{timeout:0});await page.locator('#exportConfirm').click();
  const download=await downloadPromise,final=path.join(output,'reconstructed.pptx');await download.saveAs(final);
  await render(final,path.join(output,'powerpoint-render.png'),result.scene.canvas.width,result.scene.canvas.height);
  console.log('Saved:',output,'nodes:',result.scene.nodes.length,'seconds:',Math.round((Date.now()-started)/1000));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;server.close();});
