// Live Step 4 evaluation. Usage:
// FF_API_KEY=<key> node forge/test-reconstruction-live.cjs <input.png> <output-dir>
// Keeps the API key in the local Node process; generated files contain no key.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const https=require('node:https');
const {execFile}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');

const input=path.resolve(process.argv[2]||'');
const output=path.resolve(process.argv[3]||'');
if(!process.env.FF_API_KEY||!fs.existsSync(input)||!output)throw Error('Set FF_API_KEY and pass input PNG and output directory');
fs.mkdirSync(output,{recursive:true});
const root=path.resolve(__dirname,'..');
const checkpointFile=path.join(output,'checkpoint.json');
const resume=process.env.FF_RESUME==='1'&&fs.existsSync(checkpointFile)?JSON.parse(fs.readFileSync(checkpointFile,'utf8')):null;
const finalizeOnly=process.env.FF_FINALIZE_ONLY==='1';
const selectedRegions=process.env.FF_REGION_IDS?.split(',').filter(Boolean);
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/render-pptx'){
    const chunks=[];req.on('data',b=>chunks.push(b));req.on('end',()=>{
      const pptx=path.join(output,'office-input.pptx'),png=path.join(output,'powerpoint-render.png');
      fs.writeFileSync(pptx,Buffer.concat(chunks));
      execFile('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/render-pptx-office.ps1'),'-InputPptx',pptx,'-OutputPng',png],{windowsHide:true,timeout:120000},error=>{
        res.writeHead(error?500:200,{'Content-Type':'application/json'});
        res.end(JSON.stringify(error?{error:error.message}:{image:'data:image/png;base64,'+fs.readFileSync(png).toString('base64')}));
      });
    });return;
  }
  if(pathname==='/relay/chat/completions'){
    const upstream=https.request('https://infistar.cc/v1/chat/completions',{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.FF_API_KEY}
    },response=>{res.writeHead(response.statusCode||502,{'Content-Type':response.headers['content-type']||'application/json'});response.pipe(res);});
    upstream.on('error',error=>{res.writeHead(502);res.end(JSON.stringify({error:{message:error.message}}));});
    req.pipe(upstream);return;
  }
  const relative=pathname.endsWith('/')?pathname+'index.html':pathname;
  const filename=path.resolve(root,'.'+relative);
  if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(filename,(err,bytes)=>{
    if(err){res.writeHead(404);res.end();return;}
    if(relative==='/forge/index.html'){
      let html=bytes.toString('utf8').replace(/\r\n/g,'\n')
        .replace('const cached=bypassCache?null:await readReconstructionCache(cacheKey);','const cached=window.__liveResumeScene?{scene:window.__liveResumeScene,detailComplete:false,omissionChecked:false}:bypassCache?null:await readReconstructionCache(cacheKey);')
        .replace("import * as T from './vendor/transformers.min.js';",'const T={};')
        .replace('window.__ffReconstruct = () => runReconstruction();',
          'window.__ffReconstruct = () => runReconstruction(); window.__ffTestPptx=buildNativePptx; window.__ffTestSvg=sceneToSvgString; window.__ffTestZip=zipStore; window.__ffStructureTest=async src=>{const im=await loadImage(src),c=document.createElement("canvas");c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext("2d").drawImage(im,0,0);const audit={tiles:[]};const scene=await reconstructCatalogWithFallback(c,src,requestEditableScene,audit,null,false,async()=>({score:0}),async()=>{},{regionIds:[]});window.__ffExportState.scene=scene;return true;};')
        .replace("await boot();\ninitProviders();\nsyncSubCount();\nawait Promise.all([populateModels(), populateParserModels()]);\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});",
          "MAN=FALLBACK;\ninitProviders();\nsyncSubCount();\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});");
      if(finalizeOnly)html=html.replace('completedIds:[]});\n    });','completedIds:[]});\n    },{regionIds:[]});');
      if(selectedRegions){
        html=html.replace('completedIds:[]});\n    });','completedIds:[]});\n    },{regionIds:'+JSON.stringify(selectedRegions)+'});');
        html=html.replace("r.state==='retry'&&r.officeQuality)","r.state==='retry'&&r.officeQuality&&"+JSON.stringify(selectedRegions)+".includes(id))").replace("filter(([,r])=>r.state==='retry'&&r.officeQuality&&","filter(([id,r])=>r.state==='retry'&&r.officeQuality&&");
      }
      bytes=Buffer.from(html);
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream'});res.end(bytes);
  });
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage();
    page.on('pageerror',error=>console.error('Page error:',error.message));
    await page.goto('http://127.0.0.1:'+server.address().port+'/forge/',{waitUntil:'domcontentloaded'});
    const data='data:image/png;base64,'+fs.readFileSync(input).toString('base64');
    await page.evaluate(({data,port,resume,structureOnly})=>{
      window.__liveResumeScene=resume?.scene||null;
      document.querySelector('#provider').value='infistar';
      document.querySelector('#useRelay').checked=true;
      document.querySelector('#baseOverride').value='http://127.0.0.1:'+port+'/relay';
      document.querySelector('#key').value='local-proxy';
      const select=document.querySelector('#analyzeModel');
      select.add(new Option('gpt-6.1-sol','gpt-6.1-sol'));select.value='gpt-6.1-sol';
      document.querySelector('#visualReasoningEffort').value='medium';
      document.querySelector('#reconTimeoutMinutes').value='25';
      window.__ffLastGeneratedImage=data;
      window.__ffRenderPptx=async blob=>{const response=await fetch('/render-pptx',{method:'POST',body:blob});const result=await response.json();if(!response.ok)throw Error(result.error);return result.image;};
      window.__liveDone=false;
      window.__livePromise=(structureOnly?window.__ffStructureTest(data):window.__ffReconstruct()).then(ok=>{window.__liveResult=ok;window.__liveDone=true;}).catch(e=>{window.__liveError=String(e);window.__liveDone=true;});
    },{data,port:server.address().port,resume:resume?{scene:resume.scene}:null,structureOnly:process.env.FF_STRUCTURE_ONLY==='1'});
    let previous='';
    while(true){
      const state=await page.evaluate(()=>{const a=window.__ffApiAudit?.reconstruction||{};return {done:window.__liveDone,result:window.__liveResult,error:window.__liveError,phase:a.phase,completed:a.completedTiles,total:a.totalTiles,repairs:a.repairCalls,revisionRequests:a.revisions?.length,revisionFinished:a.revisions?.filter(r=>['succeeded','failed','subdivided'].includes(r.state)).length,model:a.model,status:a.state};});
      const s=JSON.stringify(state);
      if(s!==previous){
        console.log(new Date().toISOString(),s);previous=s;
        const checkpoint=await page.evaluate(()=>({scene:window.__ffExportState.partialScene||window.__ffExportState.scene,audit:window.__ffApiAudit?.reconstruction}));
        fs.writeFileSync(path.join(output,'checkpoint.json'),JSON.stringify(checkpoint));
      }
      if(state.done)break;
      await new Promise(resolve=>setTimeout(resolve,10000));
    }
    const result=await page.evaluate(async()=>{
      const state=window.__ffExportState,audit=window.__ffApiAudit?.reconstruction;
      const scene=state.scene;
      const pptx=scene?await window.__ffTestPptx(scene,window.__ffTestZip):null;
      return {audit,scene,svg:scene?window.__ffTestSvg(scene):null,pptx:pptx?Array.from(new Uint8Array(await pptx.arrayBuffer())):null};
    });
    fs.writeFileSync(path.join(output,'audit.json'),JSON.stringify(result.audit||{},null,2));
    if(result.scene)fs.writeFileSync(path.join(output,'scene.json'),JSON.stringify(result.scene));
    if(result.svg)fs.writeFileSync(path.join(output,'reconstructed.svg'),result.svg);
    if(result.pptx){
      const finalPptx=path.join(output,'reconstructed.pptx');
      fs.writeFileSync(finalPptx,Buffer.from(result.pptx));
      // A rejected candidate may have overwritten the host's temporary PNG.
      // Always publish a render of the scene actually returned to the user.
      await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/render-pptx-office.ps1'),'-InputPptx',finalPptx,'-OutputPng',path.join(output,'powerpoint-render.png')],{windowsHide:true,timeout:120000},error=>error?reject(error):resolve()));
    }
    console.log('Saved:',output,'nodes:',result.scene?.nodes?.length||0,'quality:',result.audit?.quality);
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
