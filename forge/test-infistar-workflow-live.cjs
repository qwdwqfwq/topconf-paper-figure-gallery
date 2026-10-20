// Live smoke test: set INFISTAR_TEST_KEY and PLAYWRIGHT_CORE_PATH.
// Uses small synthetic fixtures; never prints or saves credentials.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');

const root = path.resolve(__dirname, '..');
const mime = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server = http.createServer((req,res)=>{
  let pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname.endsWith('/')) pathname += 'index.html';
  const filename = path.resolve(root,'.'+pathname);
  if (!filename.startsWith(root+path.sep)) {res.writeHead(403); return res.end();}
  fs.readFile(filename,(err,data)=>{
    if(err) {res.writeHead(404); return res.end();}
    // The sparse local checkout omits the heavyweight model runtime and
    // manifest. Replace startup only in this test response, never in the app.
    if(pathname==='/forge/index.html'){
      const html=data.toString('utf8').replace(/\r\n/g,'\n')
        .replace("import * as T from './vendor/transformers.min.js';",'const T={};')
        .replace('window.__ffReconstruct = () => runReconstruction();',
          'window.__ffReconstruct = () => runReconstruction();\nwindow.__ffTestParse = (...args)=>{pdfContext={fileName:"synthetic-paper.txt"};return callPdfParser(...args);}; window.__ffTestSVG = genOaiSVG;')
        .replace("await boot();\ninitProviders();\nsyncSubCount();\nawait Promise.all([populateModels(), populateParserModels()]);\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});",
          "MAN=FALLBACK;\ninitProviders();\nsyncSubCount();\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});");
      data=Buffer.from(html);
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream'});
    res.end(data);
  });
});


(async()=>{
 assert.ok(process.env.INFISTAR_TEST_KEY, 'Set INFISTAR_TEST_KEY before running the live test.');
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
 const page=await browser.newPage({serviceWorkers:'block'});
 await page.goto(`http://127.0.0.1:${server.address().port}/forge/`,{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async({key,onlyPdf})=>{
 document.querySelector('#provider').value='infistar';document.querySelector('#key').value=key;
 const select=document.querySelector('#parseModel');select.add(new Option('deepseek-v4.1-flash','deepseek-v4.1-flash'));select.value='deepseek-v4.1-flash';
 const out=[];const orig=window.fetch;let statuses=[];window.fetch=async(...args)=>{const res=await orig(...args);statuses.push(res.status);return res;};
 let start=Date.now();
 try{const d=await window.__ffTestParse('text',{text:'Our method has two stages. The encoder maps input images into feature vectors. A classifier predicts labels from these vectors. Cross entropy trains both modules jointly.',pages:1,total:1});out.push({stage:'pdf-text-model-parser',statuses,elapsedMs:Date.now()-start,sections:d.selectedSections?.length});}
 catch(e){out.push({stage:'pdf-text-model-parser',statuses,elapsedMs:Date.now()-start,error:e.message});}
 if(onlyPdf)return out;
 statuses=[];start=Date.now();
 try{await window.__ffTestSVG('https://infistar.cc/v1','gpt-6-astra',key,'Draw a simple two-stage architecture: Input -> Encoder -> Classifier. Use three labeled boxes and two arrows.','infistar',[],'');out.push({stage:'svg',statuses,elapsedMs:Date.now()-start,success:true});}
 catch(e){out.push({stage:'svg',statuses,elapsedMs:Date.now()-start,error:e.message});}
 return out;
 },{key:process.env.INFISTAR_TEST_KEY,onlyPdf:process.env.LIVE_ONLY_PDF==='1'});
 console.log(JSON.stringify(result));
 for (const item of result) {
   assert.ok(!item.error, `${item.stage} failed: ${item.error || ''}`);
   if (item.stage === 'pdf-text-model-parser') assert.ok(item.sections > 0, 'PDF text parser returned no sections.');
   if (item.stage === 'svg') assert.equal(item.success, true);
 }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;server.close();});

