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
        .replace('window.__ffReconstruct = () => runReconstruction();',
          'window.__ffReconstruct = () => runReconstruction();\nwindow.__ffTestGenerateBitmap = genOaiImage; window.__ffTestZip = zipStore; window.__ffTestRequestScene = requestEditableScene;')
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

    assert.equal(await page.inputValue('#reconTimeoutMinutes'),'25');
    await page.evaluate(()=>{
      localStorage.setItem('ff_recon_timeout_minutes','15');
      localStorage.removeItem('ff_recon_timeout_extension_v1');
    });
    await page.reload({waitUntil:'domcontentloaded'});
    assert.equal(await page.inputValue('#reconTimeoutMinutes'),'25','saved timeout gains ten minutes');
    await page.reload({waitUntil:'domcontentloaded'});
    assert.equal(await page.inputValue('#reconTimeoutMinutes'),'25','migration runs only once');

    const fidelityRoundtrip=await page.evaluate(async()=>{
      const {buildNativePptx,readNativePptxScene}=await import('./editable-native.mjs');
      const scene={canvas:{width:600,height:400},nodes:[
        {id:'panel',type:'rect',x:10,y:10,w:560,h:360,radius:12,fill:'#ffffff',stroke:'#123456',strokeWidth:2},
        {id:'arrow',type:'path',d:'M 50 60 L 150 60 L 150 45 L 180 70 L 150 95 L 150 80 L 50 80 Z',fill:'#cccccc',stroke:'#222222',strokeWidth:2},
        {id:'cell1',type:'rect',x:50,y:150,w:40,h:40,fill:'#ffcc00',stroke:'#222222'},
        {id:'cell2',type:'rect',x:90,y:150,w:40,h:40,fill:'#0088aa',stroke:'#222222'}
      ]};
      const blob=await buildNativePptx(scene,window.__ffTestZip);
      return await readNativePptxScene(blob,600,400);
    });
    assert.ok(Math.abs(fidelityRoundtrip.nodes[0].radius-12)<.01,'PPTX roundtrip preserves measured corners');
    assert.equal(fidelityRoundtrip.nodes[1].type,'path');
    assert.equal(fidelityRoundtrip.nodes[1].fill.toLowerCase(),'#cccccc');
    assert.match(fidelityRoundtrip.nodes[1].d,/Z/i);
    assert.deepEqual(fidelityRoundtrip.nodes.slice(2).map(n=>n.fill.toLowerCase()),['#ffcc00','#0088aa']);

    // Exercise the API parser as well as the merge: the old parser silently
    // dropped type changes and every child of a multicolor decomposition.
    const parsedRepair=await page.evaluate(async()=>{
      const {replaceObjectRepairRegion}=await import('./reconstruction-core.mjs');
      document.querySelector('#provider').value='ark';
      document.querySelector('#key').value='browser-test-key';
      const model=document.querySelector('#analyzeModel');
      model.add(new Option('doubao-vision-test','doubao-vision-test'));model.value='doubao-vision-test';
      const scene={canvas:{width:400,height:300},nodes:[
        {id:'matrix',type:'rect',x:40,y:40,w:80,h:80,fill:'#aaaaaa'},
        {id:'arrow',type:'line',x:150,y:80,x2:250,y2:80,stroke:'#222222',strokeWidth:2}
      ]};
      const nodes=[
        {replaces:'matrix',type:'rect',x:40,y:40,w:80,h:160,fill:'#ffcc00'},
        {id:'new-cell',replaces:'matrix',type:'rect',x:120,y:40,w:80,h:160,fill:'#0088aa'},
        {id:'arrow',type:'path',d:'M 260 110 L 420 110 L 420 100 L 460 120 L 420 140 L 420 130 L 260 130 Z',fill:'#cccccc',stroke:'#222222',strokeWidth:2},
        {id:'unrelated',type:'rect',x:0,y:0,w:560,h:360,fill:'#ff0000'}
      ];
      const original=window.fetch;
      window.fetch=async(url,options)=>String(url).endsWith('/chat/completions')?
        new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({nodes})}}]}),{status:200}):original(url,options);
      try{
        const canvas=document.createElement('canvas');canvas.width=560;canvas.height=360;
        const parsed=await window.__ffTestRequestScene(canvas.toDataURL(),560,360,{objectRepair:true,catalog:scene});
        return {parsed:parsed.nodes,merged:replaceObjectRepairRegion(scene,{x:20,y:20,w:280,h:180},parsed,2).nodes};
      }finally{window.fetch=original;}
    });
    assert.equal(parsedRepair.parsed.length,3,'API boundary retains valid replacement geometry only');
    assert.equal(parsedRepair.merged.length,3);
    assert.deepEqual(parsedRepair.merged.slice(0,2).map(n=>n.fill.toLowerCase()),['#ffcc00','#0088aa']);
    assert.equal(parsedRepair.merged[2].type,'path');
    assert.equal(parsedRepair.merged[2].fill.toLowerCase(),'#cccccc');

    // Step 3 must offer a real bitmap download while Step 4's vision request
    // is still pending. Exercise the image generation path without a live API.
    const pending=await page.evaluate(async()=>{
      document.querySelector('#figureRatio').value='1:1';
      document.querySelector('#imageResolution').value='1K';
      document.querySelector('#provider').value='ark';
      document.querySelector('#key').value='browser-test-key';
      const select=document.querySelector('#analyzeModel');
      select.add(new Option('doubao-vision-test','doubao-vision-test'));
      select.value='doubao-vision-test';
      const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1024,1024);
      ctx.fillStyle='#123456';ctx.fillRect(80,80,400,200);
      const b64=canvas.toDataURL('image/png').split(',')[1];
      const original=window.fetch;
      window.fetch=async(url,options)=>{
        if(String(url).endsWith('/images/generations'))
          return new Response(JSON.stringify({data:[{b64_json:b64}]}),{status:200});
        if(String(url).endsWith('/chat/completions')){
          await new Promise(resolve=>setTimeout(resolve,3000));
          return new Response(JSON.stringify({choices:[{message:{content:'{}'}}]}),{status:200});
        }
        return original(url,options);
      };
      await window.__ffTestGenerateBitmap('https://browser-test.invalid','gpt-image-2','key','paper','oai',[],'');
      return {pending:window.__ffExportState.reconPending,
        downloadEnabled:!document.querySelector('#dlImg').disabled,
        imageVisible:!!document.querySelector('#out img[data-step3-output]'),
        exportMode:document.querySelector('#exportMode')};
    });
    assert.equal(pending.pending,true,JSON.stringify(pending));
    assert.equal(pending.downloadEnabled,true);
    assert.equal(pending.imageVisible,true);
    assert.equal(pending.exportMode,null);
    const bitmapDownload=page.waitForEvent('download',{timeout:10000});
    await page.locator('#dlImg').click();
    const bitmap=await bitmapDownload;
    assert.equal(bitmap.suggestedFilename(),'figure-forge-draft.png');
    assert.ok(fs.statSync(await bitmap.path()).size>100);
    await page.reload({waitUntil:'domcontentloaded'});

    const result=await page.evaluate(async()=>{
      document.querySelector('#provider').value='ark';
      document.querySelector('#key').value='browser-test-key';
      const select=document.querySelector('#analyzeModel');
      select.add(new Option('doubao-vision-test','doubao-vision-test'));select.value='doubao-vision-test';
      let calls=0,repairs=0,active=0,peak=0;
      const timer=window.setTimeout.bind(window);
      let configuredTimeout=0;
      window.setTimeout=(fn,ms,...args)=>{if(ms>=900000)configuredTimeout=ms;return timer(fn,ms>=900000?80:ms,...args);};
      const original=window.fetch;
      window.fetch=async(url,options)=>{
        if(!String(url).endsWith('/chat/completions'))return original(url,options);
        calls++;
        if(calls===1)return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));
        const prompt=JSON.parse(options.body).messages[1].content[0].text;
        let nodes;
        if(prompt.includes('Catalog in crop coordinates: ')){
          repairs++;active++;peak=Math.max(peak,active);
          await new Promise(resolve=>timer(resolve,20));active--;
          const catalog=JSON.parse(prompt.split('Catalog in crop coordinates: ')[1]);
          nodes=[...catalog.nodes.map(n=>({...n,...(n.type==='text'?{text:'INJECTED'}:{})})),
            {id:'unknown',type:'text',text:'EXTRA',x:50,y:50,w:80,h:20,fontSize:16},
            {type:'text',text:'MISSING ID',x:50,y:70,w:80,h:20,fontSize:16}];
        }else if(prompt.includes('WHOLE IMAGE layout correction')){
          return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({groups:[{nodes:[{id:'unknown',x:0}]}]})}}]}));
        }else if(prompt.includes('Independent bitmap transcription')){
          nodes=[{type:'text',text:'Global label'}];
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
      localStorage.setItem('test-bitmap',window.__ffLastGeneratedImage);
      const ok=await window.__ffReconstruct();
      return {ok,calls,repairs,peak,configuredTimeout,audit:window.__ffApiAudit.reconstruction,scene:window.__ffExportState.scene};
    });
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.equal(result.audit.strategy,'whole-image-catalog');
    assert.equal(result.audit.deduplicatedText,1);
    assert.equal(result.scene.nodes.length,3);
    assert.equal(result.scene.nodes.filter(n=>n.type==='text').length,1);
    assert.equal(result.scene.nodes.find(n=>n.type==='text').text,'Global label');
    assert.ok(result.repairs>0,'exercise crop catalog requests');
    assert.equal(result.calls,result.repairs+5,'one timeout, global retry, completeness audit, transcript and layout correction');
    assert.equal(result.audit.globalLayout.rejected,1,'unknown objects cannot replace the scene');
    assert.equal(result.configuredTimeout,1500000);
    assert.equal(result.audit.tiles[0].attempts,2);
    assert.equal(result.peak,3,'three actual concurrent detail requests');
    assert.equal(result.audit.pptxLayout.state,'passed',JSON.stringify(result.audit));
    assert.equal(result.audit.transcription.state,'passed');
    assert.match(result.audit.source.sha256,/^[a-f0-9]{64}$/);
    assert.equal(result.audit.source.width,1200);
    assert.equal(await page.locator('#exportConfirm').isDisabled(),true);
    await page.locator('#exportDraft').check();
    for(const format of ['svg','pptx','vsdx','drawio']){
      await page.locator(`#exportActions [data-export="${format}"]`).click();
      const promise=page.waitForEvent('download',{timeout:30000});
      await page.locator('#exportConfirm').click();
      const download=await promise;
      assert.ok(fs.statSync(await download.path()).size>100);
      assert.match(download.suggestedFilename(),/editable-draft/);
    }
    await page.locator('#exportDraft').uncheck();
    assert.equal(await page.locator('#exportMode').count(),0);
    assert.equal(await page.locator('#exportConfirm').isDisabled(),true);
    assert.equal(await page.locator('#exportComparison').isVisible(),true);
    await page.reload({waitUntil:'domcontentloaded'});
    const cached=await page.evaluate(async(src)=>{
      document.querySelector('#provider').value='ark';document.querySelector('#key').value='test';
      const select=document.querySelector('#analyzeModel');select.add(new Option('test','doubao-vision-test'));select.value='doubao-vision-test';
      window.__ffLastGeneratedImage=src;
      let calls=0;const original=window.fetch;window.fetch=async(url,options)=>{if(!String(url).endsWith('/chat/completions'))return original(url,options);calls++;throw Error('offline');};
      return {ok:await window.__ffReconstruct(),calls,audit:window.__ffApiAudit.reconstruction};
    },await page.evaluate(()=>localStorage.getItem('test-bitmap')));
    assert.equal(cached.ok,true);assert.ok(cached.calls>0,'unfinished repairs remain retryable');assert.equal(cached.audit.cacheHit,true);
    const failed=await page.evaluate(async()=>{
      const select=document.querySelector('#analyzeModel');select.add(new Option('different','different'));select.value='different';
      window.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:'{"description":"no objects"}'}}]}),{status:200});
      const ok=await window.__ffReconstruct();
      return {ok,scene:window.__ffExportState.scene,audit:window.__ffApiAudit.reconstruction};
    });
    assert.equal(failed.ok,false,'invalid whole image must not invent tile fallback objects');
    assert.equal(failed.scene,null);
    assert.equal(failed.audit.state,'failed');
    const split=await page.evaluate(async()=>{
      const select=document.querySelector('#analyzeModel');select.add(new Option('split','split-test'));select.value='split-test';
      const timer=window.setTimeout.bind(window);
      window.setTimeout=(fn,ms,...args)=>timer(fn,ms>=900000?20:ms>=1000?1:ms,...args);
      const nodes=Array.from({length:12},(_,i)=>({type:'text',text:'Label '+i,x:80+(i%4)*260,y:50+Math.floor(i/4)*110,w:80,h:20,fontSize:16,fill:'#000000'}));
      const missing={type:'text',text:'Small detail',x:850,y:420,w:100,h:20,fontSize:16,fill:'#000000'};
      const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=500;
      const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1200,500);ctx.fillStyle='black';ctx.font='16px Arial';
      [...nodes,missing].forEach(n=>ctx.fillText(n.text,n.x,n.y+16));
      window.__ffLastGeneratedImage=canvas.toDataURL();
      let active=0,peak=0,global=0,phase=0,detailCalls=0;
      const original=window.fetch;
      window.fetch=async(url,options)=>{
        if(!String(url).endsWith('/chat/completions'))return original(url,options);
        const prompt=JSON.parse(options.body).messages[1].content[0].text;
        let output=nodes;
        if(prompt.includes('completeness audit'))output=[missing,{...nodes[0],x:nodes[0].x+1},missing];
        else if(prompt.includes('Catalog in crop coordinates: ')){
          const catalog=JSON.parse(prompt.split('Catalog in crop coordinates: ')[1]);
          detailCalls++;active++;peak=Math.max(peak,active);
          try{
            if(!phase&&catalog.nodes.length>2)await new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));
            await new Promise(resolve=>timer(resolve,2));
            if(!phase&&catalog.nodes.some(n=>n.text==='Label 0'))return new Response('unavailable',{status:503});
            output=catalog.nodes;
          }finally{active--;}
        }else if(prompt.includes('WHOLE IMAGE layout correction'))return new Response(JSON.stringify({choices:[{message:{content:'{"groups":[]}'}}]}));
        else if(prompt.includes('Independent bitmap transcription'))output=[...nodes,missing].map(n=>({type:'text',text:n.text}));
        else global++;
        return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({nodes:output})}}]}));
      };
      const ok=await window.__ffReconstruct(),audit=structuredClone(window.__ffApiAudit.reconstruction),texts=window.__ffExportState.scene.nodes.filter(n=>n.type==='text').map(n=>n.text);
      const status={recon:document.querySelector('#reconStatus').textContent,export:document.querySelector('#exportStatus').textContent};
      phase=1;const firstCalls=detailCalls;
      const resumed=await window.__ffReconstruct();
      return {ok,audit,texts,status,peak,global,resumed,resumeCalls:detailCalls-firstCalls,resumeAudit:window.__ffApiAudit.reconstruction};
    });
    assert.equal(split.ok,true);assert.equal(split.peak,3);assert.equal(split.global,1);
    assert.equal(split.audit.registeredMissing,1);assert.equal(split.texts.length,13);assert.equal(new Set(split.texts).size,13);
    assert.ok(split.audit.revisions.some(r=>r.state==='subdivided'));
    assert.ok(split.audit.failedDetailIds.length>0);assert.equal(split.audit.state,'needs-review');
    assert.match(split.status.recon,/please inspect|请检查/);
    assert.match(split.status.export,/Needs review|需复核/);

    assert.equal(split.resumed,true);assert.equal(split.resumeAudit.cacheHit,true);assert.ok(split.resumeCalls>0);
    assert.equal(split.resumeAudit.failedDetailIds,undefined);
    await page.reload();
    await page.waitForFunction(()=>window.__ffExportState);
    const overview=await page.evaluate(async()=>{
      document.querySelector('#provider').value='ark';
      document.querySelector('#key').value='browser-test-key';
      const select=document.querySelector('#analyzeModel');
      select.add(new Option('overview-test','overview-test'));select.value='overview-test';
      const nodes=[{type:'rect',x:40,y:40,w:100,h:80,fill:'#224488',stroke:'none'},
        {type:'rect',x:800,y:300,w:100,h:80,fill:'#cc8822',stroke:'none'}];
      const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=500;
      const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1200,500);
      nodes.forEach(n=>{ctx.fillStyle=n.fill;ctx.fillRect(n.x,n.y,n.w,n.h);});
      window.__ffLastGeneratedImage=canvas.toDataURL();
      const original=window.fetch;
      window.fetch=async(url,options)=>{
        if(!String(url).endsWith('/chat/completions'))return original(url,options);
        const prompt=JSON.parse(options.body).messages[1].content[0].text;
        let output;
        if(prompt.includes('completeness audit')||prompt.includes('Independent bitmap transcription'))output=[];
        else if(prompt.includes('WHOLE IMAGE layout correction')){
          const catalog=JSON.parse(prompt.split('Catalog: ')[1]);
          return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({groups:[
            {nodes:[{id:catalog.nodes[0].id,x:600}]},
            {nodes:[{id:catalog.nodes[1].id,x:800,y:300}]}
          ]})}}]}));
        }
        else if(prompt.includes('Catalog in crop coordinates: '))output=JSON.parse(prompt.split('Catalog in crop coordinates: ')[1]).nodes;
        else output=[nodes[0],{...nodes[1],x:500,y:100}];
        return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({nodes:output})}}]}));
      };
      const ok=await window.__ffReconstruct();
      return {ok,audit:window.__ffApiAudit.reconstruction,scene:window.__ffExportState.scene};
    });
    assert.equal(overview.ok,true);
    assert.equal(overview.audit.globalLayout.accepted,1,JSON.stringify(overview.audit.globalLayout));
    assert.equal(overview.audit.globalLayout.rejected,1);
    assert.equal(overview.scene.nodes[0].x,40);
    assert.equal(overview.scene.nodes[1].x,800);
    assert.equal(overview.scene.nodes[1].y,300);
    const invalidated=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=100;canvas.height=80;
      window.__ffLastGeneratedImage=canvas.toDataURL();
      window.__ffRefreshExportCard();
      return {svg:window.__ffExportState.svg,binding:window.__ffExportState.sourceBinding,
        comparisonHidden:document.querySelector('#exportComparison').hidden};
    });
    assert.equal(invalidated.svg,'');assert.equal(invalidated.binding,null);
    assert.equal(invalidated.comparisonHidden,true);
    assert.equal(await page.locator('#exportConfirm').isDisabled(),true);
    const stale=await page.evaluate(async()=>{
      const select=document.querySelector('#analyzeModel');select.add(new Option('stale','stale-test'));select.value='stale-test';
      let release,started;const ready=new Promise(r=>started=r);
      const original=window.fetch;
      window.fetch=async(url,options)=>{
        if(!String(url).endsWith('/chat/completions'))return original(url,options);
        started();await new Promise(r=>release=r);
        return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({nodes:[{type:'rect',x:0,y:0,w:30,h:30,fill:'#000000'}]})}}]}));
      };
      const task=window.__ffReconstruct();await ready;
      const canvas=document.createElement('canvas');canvas.width=101;canvas.height=81;
      window.__ffLastGeneratedImage=canvas.toDataURL();window.__ffRefreshExportCard();
      release();const ok=await task;
      return {ok,svg:window.__ffExportState.svg,binding:window.__ffExportState.sourceBinding};
    });
    assert.equal(stale.ok,null,'late response is discarded');
    assert.equal(stale.svg,'');assert.equal(stale.binding,null);
    assert.deepEqual(errors,[]);
    console.log('Browser whole-image catalog, constrained crops and four exports: OK');
  }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;}).finally(()=>server.close());
