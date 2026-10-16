// Run with: node forge/test-reconstruction-browser.cjs
// Uses the bundled Playwright runtime and installed Chrome; no live API key.
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
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage({serviceWorkers:'block',acceptDownloads:true});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400 && /\.(?:m?js|html)(?:\?|$)/.test(r.url())) errors.push(`HTTP ${r.status()} ${r.url()}`);});
    page.on('requestfailed',r=>errors.push(`Request failed ${r.url()}: ${r.failure()?.errorText}`));
    await page.goto(`http://127.0.0.1:${server.address().port}/forge/`,{waitUntil:'domcontentloaded'});
    assert.equal(await page.evaluate(()=>typeof window.__ffReconstruct),'function',JSON.stringify(errors));

    const result=await page.evaluate(async()=>{
      document.querySelector('#provider').value='ark';
      document.querySelector('#key').value='browser-test-key';
      const select=document.querySelector('#analyzeModel');
      select.add(new Option('doubao-vision-test','doubao-vision-test'));select.value='doubao-vision-test';
      let calls=0,repairs=0;
      const original=window.fetch;
      window.fetch=async(url,options)=>{
        if(!String(url).endsWith('/chat/completions'))return original(url,options);
        calls++;
        const prompt=JSON.parse(options.body).messages[1].content[0].text;
        let nodes;
        if(prompt.includes('Catalog in crop coordinates: ')){
          repairs++;
          const catalog=JSON.parse(prompt.split('Catalog in crop coordinates: ')[1]);
          nodes=[...catalog.nodes.map(n=>({...n,...(n.type==='text'?{text:'INJECTED'}:{})})),
            {id:'unknown',type:'text',text:'EXTRA',x:50,y:50,w:80,h:20,fontSize:16},
            {type:'text',text:'MISSING ID',x:50,y:70,w:80,h:20,fontSize:16}];
        }else{
          if(!prompt.includes('WHOLE IMAGE'))throw Error('Whole-image catalog required');
          nodes=[{type:'rect',x:450,y:50,w:300,h:180,fill:'#abcdef'},
            {type:'text',x:510,y:100,w:170,h:24,fontSize:20,text:'Global label'},
            {type:'text',x:512,y:100,w:170,h:24,fontSize:20,text:'Global label'},
            {type:'line',x:480,y:150,x2:800,y2:150,stroke:'#111111',strokeWidth:2}];
        }
        return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({nodes})}}]}),{status:200});
      };
      const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=500;
      const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1200,500);
      ctx.fillStyle='#abcdef';ctx.fillRect(450,50,300,180);ctx.fillStyle='black';ctx.font='20px Arial';ctx.fillText('Global label',510,120);
      ctx.fillRect(480,150,320,2);ctx.fillRect(560,180,60,15);
      window.__ffLastGeneratedImage=canvas.toDataURL('image/png');
      const ok=await window.__ffReconstruct();
      return {ok,calls,repairs,audit:window.__ffApiAudit.reconstruction,scene:window.__ffExportState.scene};
    });
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.equal(result.audit.strategy,'whole-image-catalog');
    assert.equal(result.audit.deduplicatedText,1);
    assert.equal(result.scene.nodes.length,3);
    assert.equal(result.scene.nodes.filter(n=>n.type==='text').length,1);
    assert.equal(result.scene.nodes.find(n=>n.type==='text').text,'Global label');
    assert.ok(result.repairs>0,'exercise crop catalog requests');
    assert.equal(result.calls,result.repairs+1,'exactly one global recognition');
    assert.equal(result.audit.pptxLayout.state,'passed',JSON.stringify(result.audit));
    for(const format of ['svg','pptx','vsdx','drawio']){
      await page.locator(`#exportActions [data-export="${format}"]`).click();
      const promise=page.waitForEvent('download',{timeout:30000});
      await page.locator('#exportConfirm').click();
      const download=await promise;
      assert.ok(fs.statSync(await download.path()).size>100);
    }
    const failed=await page.evaluate(async()=>{
      window.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:'{"description":"no objects"}'}}]}),{status:200});
      const ok=await window.__ffReconstruct();
      return {ok,scene:window.__ffExportState.scene,audit:window.__ffApiAudit.reconstruction};
    });
    assert.equal(failed.ok,false,'invalid whole image must not invent tile fallback objects');
    assert.equal(failed.scene,null);
    assert.equal(failed.audit.state,'failed');
    assert.deepEqual(errors,[]);
    console.log('Browser whole-image catalog, constrained crops and four exports: OK');
  }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;}).finally(()=>server.close());
