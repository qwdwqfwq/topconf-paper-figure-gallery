// Run with PLAYWRIGHT_CORE_PATH=<path to playwright-core> node forge/test-step4-tile-fallback.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');

const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json'};
const server=http.createServer((req,res)=>{
  let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname.endsWith('/')) pathname+='index.html';
  const filename=path.resolve(root,'.'+pathname);
  if(!filename.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(filename,(err,data)=>{
    if(err){res.writeHead(404);return res.end();}
    if(pathname==='/forge/index.html'){
      const html=data.toString('utf8').replace(/\r\n/g,'\n')
        .replace("import * as T from './vendor/transformers.min.js';",'const T={};')
        .replace('async function reconstructCatalogWithFallback(', 'window.__testReconstructCatalogWithFallback=async function reconstructCatalogWithFallback(')
        .replace('function reconstructionProgressText(', 'window.__testReconstructionProgressText=function reconstructionProgressText(')
        .replace("await boot();\ninitProviders();\nsyncSubCount();\nawait Promise.all([populateModels(), populateParserModels()]);\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});",
          "MAN=FALLBACK;\ninitProviders();\nsyncSubCount();\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});");
      data=Buffer.from(html);
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream'});
    res.end(data);
  });
});

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage({serviceWorkers:'block'});
    await page.goto(`http://127.0.0.1:${server.address().port}/forge/`,{waitUntil:'domcontentloaded'});
    const result=await page.evaluate(async()=>{
      const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,320,180);
      const src=canvas.toDataURL(),audit={tiles:[]};let calls=0,published=false,measured=false;
      const request=async(_src,_w,_h,task)=>{calls++;if(task?.regionPatch)return {operations:[],uncertainties:[]};return {canvas:{width:320,height:180},nodes:[{id:'label',type:'text',x:20,y:20,w:150,h:30,text:'Editable',fontSize:18}]};};
      const measure=async()=>{if(!published)throw Error('Quality check blocked first result');measured=true;return {score:.6,darkRecall:.5,localRecall:.5,edgeF1:.5,colorSimilarity:.8};};
      const scene=await window.__testReconstructCatalogWithFallback(canvas,src,request,audit,null,false,measure,async()=>{published=true;});
      const firstCalls=calls;
      await window.__testReconstructCatalogWithFallback(canvas,src,request,{tiles:[]},scene,false,measure);
      let failedCalls=0,error='';
      try{await window.__testReconstructCatalogWithFallback(canvas,src,async()=>{failedCalls++;throw Error('Invalid scene');},{tiles:[]});}catch(e){error=e.message;}
      const progress=window.__testReconstructionProgressText({phase:'regions',startedAt:Date.now()-62000,completedTiles:2,totalTiles:4,tiles:[]});
      return {firstCalls,calls,published,measured,failedCalls,error,progress,details:audit.detailRegions,nodes:scene.nodes.length};
    });
    assert.equal(result.firstCalls,2);assert.equal(result.calls,3);
    assert.equal(result.published,true);assert.equal(result.measured,true);
    assert.equal(result.failedCalls,1);assert.match(result.error,/Invalid scene/);
    assert.deepEqual(result.details,[]);assert(result.nodes>0);
    assert.match(result.progress,/1\/3/);assert(!result.progress.includes('NaN'));
    console.log('PASS whole-image first result, no exhaustive fallback, cached result and truthful progress');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
