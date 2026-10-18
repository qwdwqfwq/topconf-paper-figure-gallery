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
          'window.__ffReconstruct = () => runReconstruction();\nwindow.__ffTestMaterialize = materializeEditableScene; window.__ffTestCalibrate = calibrateEditableText; window.__ffTestGenerateBitmap = genOaiImage; window.__ffTestZip = zipStore; window.__ffTestRequestScene = requestEditableScene; window.__ffTestParseSvg = parseSvgScene; window.__ffTestParseBitmap = parseBitmapSvgScene; window.__ffTestDrawio = sceneToDrawio; window.__ffTestVsdx = sceneToVsdxFiles; window.__ffTestPptx = buildNativePptx; window.__ffTestSvgString = sceneToSvgString;')
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

    const svgCheck=await page.evaluate(async()=>{
      const svg='<svg xmlns="http://www.w3.org/2000/svg" width="500" height="300" viewBox="0 0 500 300"><style>.label{font:25px Arial;fill:#123456}.wire{fill:none;stroke:#345678;stroke-width:2;stroke-dasharray:5 3;marker-end:url(#tip)}</style><defs><marker id="tip" markerWidth="5" markerHeight="5" refX="5" refY="2"><path d="M0 0 L5 2 L0 4"/></marker></defs><rect x="0" y="0" width="500" height="300" fill="#FFFFFF"/><g transform="translate(20 10)"><text class="label" x="220" y="70" text-anchor="middle">FEATURE EXTRACTION</text><path class="wire" d="M 10 120 L 180 120"/><path class="wire" d="M 190 120 L 190 190"/><polygon points="220,110 260,110 240,145" fill="#abcdef"/><path d="M 270 120 C 300 80 340 170 370 120" fill="none" stroke="#345678"/></g></svg>';
      const scene=window.__ffTestParseSvg(svg);
      const bitmapParserScene=window.__ffTestParseBitmap(svg);
      const host=document.createElement('div');host.style.cssText='position:absolute;left:-10000px;top:0;visibility:hidden';
      host.innerHTML=svg;document.body.appendChild(host);
      const original=host.querySelector('text');const box=original.getBBox();const font=getComputedStyle(original).fontSize;host.remove();
      const label=scene.nodes.find(n=>n.type==='text'&&n.text==='FEATURE EXTRACTION');
      const lines=scene.nodes.filter(n=>n.type==='line');
      const polygon=scene.nodes.find(n=>n.type==='polyline'&&n.closed);
      const curve=scene.nodes.find(n=>n.type==='path'&&n.d&&n.d.includes(' C '));
      const drawio=window.__ffTestDrawio({...scene,svgSource:true});
      const vsdx=window.__ffTestVsdx({...scene,svgSource:true},'Arial');
      const visioPage=vsdx.find(f=>f.name==='visio/pages/page1.xml');
      const visioXml=typeof visioPage.data==='string'?visioPage.data:new TextDecoder().decode(visioPage.data);
      const pptx=await window.__ffTestPptx({...scene,svgSource:true},window.__ffTestZip);
      const pptxXml=new TextDecoder().decode(await pptx.arrayBuffer());
      const roundtrip=window.__ffTestSvgString({...scene,svgSource:true});
      return {label,bitmapLabel:bitmapParserScene.nodes.find(n=>n.type==='text'&&n.text==='FEATURE EXTRACTION'),expectedX:box.x+20,expectedY:box.y+10,font,lines,polygon,curve,
        background:scene.nodes.find(n=>n.type==='rect'),drawio,visioXml,pptxXml,roundtrip};
    });
    assert.ok(Math.abs(svgCheck.label.x-svgCheck.expectedX)<0.1,'centered SVG text uses measured left edge');
    assert.ok(Math.abs(svgCheck.label.y-svgCheck.expectedY)<0.1,'SVG text uses measured top edge');
    assert.equal(svgCheck.label.fontSize,25,'class font size survives');
    assert.equal(svgCheck.label.fill,'123456','class text fill survives');
    assert.equal(svgCheck.bitmapLabel.x,240,'bitmap fallback retains its original SVG parser coordinates');
    assert.equal(svgCheck.bitmapLabel.fontSize,16,'bitmap fallback retains its original style parser');
    assert.equal(svgCheck.background.fill,'FFFFFF','white background survives');
    assert.equal(svgCheck.lines.length,2,'horizontal and vertical path lines survive');
    assert.ok(svgCheck.lines.every(n=>n.dash&&n.arrow),'class dash and marker survive');
    assert.equal(svgCheck.polygon.points,'240 120 280 120 260 155','transformed polygon points survive');
    assert.match(svgCheck.curve.d,/M 290 130 C 320 90 360 180 390 130/,'Bezier controls are transformed');
    assert.match(svgCheck.drawio,/dashed=1/,'Draw.io receives dash');
    assert.match(svgCheck.drawio,/endArrow=classic/,'Draw.io receives arrow');
    assert.match(svgCheck.visioXml,/EndArrow/,'Visio receives arrow');
    assert.match(svgCheck.visioXml,/LinePattern/,'Visio receives dashed line');
    assert.match(svgCheck.pptxXml,/FEATURE EXTRACTION/,'PPTX contains editable label');
    const pptxUnit=9144000/500;
    assert.ok(svgCheck.pptxXml.includes(`<a:off x="${Math.round(svgCheck.label.x*pptxUnit)}" y="${Math.round(svgCheck.label.y*pptxUnit)}"/>`),'PPTX text uses measured SVG top-left');
    assert.match(svgCheck.pptxXml,/<a:prstDash val="dash"\/>/,'PPTX retains dashed line');
    assert.match(svgCheck.pptxXml,/<a:tailEnd type="triangle"\/>/,'PPTX retains arrow');
    assert.match(svgCheck.pptxXml,/cubicBezTo/,'PPTX retains cubic path');
    assert.match(svgCheck.roundtrip,/marker-end="url\(#ff-arrow\)"/,'SVG roundtrip retains arrow');
    assert.match(svgCheck.roundtrip,/stroke-dasharray=/,'SVG roundtrip retains dash');
    if(process.env.SVG_ONLY==='1'){
      console.log('SVG editable browser regression: OK');
      return;
    }

    const textCheck=await page.evaluate(()=>{
      const raw={nodes:[
        {type:'rect',x:30,y:30,w:200,h:100,fill:'#eeeeee'},
        {type:'line',x:230,y:80,x2:270,y2:80,arrow:true},
        {type:'text',x:50,y:50,w:140,h:50,text:'Memory state\r\ninitialization',fontSize:22},
        {type:'text',x:300,y:50,w:140,h:76,text:'Answer\nCandidate\nGeneration',fontSize:22}
      ]};
      const scene=window.__ffTestMaterialize(raw,600,400);
      const canvas=document.createElement('canvas');canvas.width=600;canvas.height=400;
      const before=JSON.stringify(scene.nodes);
      window.__ffTestCalibrate(scene,canvas);
      return {nodes:scene.nodes,unchanged:before===JSON.stringify(scene.nodes)};
    });
    assert.equal(textCheck.nodes[2].text,'Memory state\ninitialization');
    assert.equal(textCheck.nodes[2].fontSize,22,'two lines retain recognized size');
    assert.equal(textCheck.nodes[3].fontSize,22,'three lines retain recognized size');
    assert.equal(textCheck.unchanged,true,'single-line calibrator must leave multiline labels and geometry alone');

    assert.equal(await page.inputValue('#reconTimeoutMinutes'),'25');
    await page.evaluate(()=>{
      localStorage.setItem('ff_recon_timeout_minutes','15');
      localStorage.removeItem('ff_recon_timeout_extension_v1');
    });
    await page.reload({waitUntil:'domcontentloaded'});
    assert.equal(await page.inputValue('#reconTimeoutMinutes'),'25','saved timeout gains ten minutes');
    await page.reload({waitUntil:'domcontentloaded'});
    assert.equal(await page.inputValue('#reconTimeoutMinutes'),'25','migration runs only once');

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
        exportMode:!!document.querySelector('#exportMode')};
    });
    assert.equal(pending.pending,true,JSON.stringify(pending));
    assert.equal(pending.downloadEnabled,true);
    assert.equal(pending.imageVisible,true);
    assert.equal(pending.exportMode,true);
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
      window.setTimeout=(fn,ms,...args)=>{if(ms>=180000&&!configuredTimeout)configuredTimeout=ms;return timer(fn,ms>=180000?80:ms,...args);};
      const original=window.fetch;
      window.fetch=async(url,options)=>{
        if(!String(url).endsWith('/chat/completions'))return original(url,options);
        calls++;
        if(calls===1)return new Response(JSON.stringify({choices:[{message:{content:'{"description":"no nodes"}'}}]}),{status:200});
        const prompt=JSON.parse(options.body).messages[1].content[0].text;
        let nodes;
        if(prompt.includes('Catalog in crop coordinates: ')){
          repairs++;active++;peak=Math.max(peak,active);
          await new Promise(resolve=>timer(resolve,20));active--;
          const catalog=JSON.parse(prompt.split('Catalog in crop coordinates: ')[1]);
          nodes=[...catalog.nodes.map(n=>({...n,...(n.type==='text'?{text:'INJECTED'}:{})})),
            {id:'unknown',type:'text',text:'EXTRA',x:50,y:50,w:80,h:20,fontSize:16},
            {type:'text',text:'MISSING ID',x:50,y:70,w:80,h:20,fontSize:16}];
        }else{
          if(!prompt.includes('WHOLE IMAGE')&&!prompt.includes('previous answer could not be used'))throw Error('Whole-image catalog required');
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
    assert.equal(result.calls,result.repairs+5,'schema retry, regional inspection and completeness audit');
    assert.ok(result.configuredTimeout>235000&&result.configuredTimeout<=240000,
      'whole-image request stays within the four-minute budget');
    assert.equal(result.audit.tiles[0].attempts,2);
    assert.equal(result.peak,3,'three actual concurrent detail requests');
    assert.equal(result.audit.pptxLayout.state,'passed',JSON.stringify(result.audit));
    for(const format of ['svg','pptx','vsdx','drawio']){
      await page.locator(`#exportActions [data-export="${format}"]`).click();
      const promise=page.waitForEvent('download',{timeout:30000});
      await page.locator('#exportConfirm').click();
      const download=await promise;
      assert.ok(fs.statSync(await download.path()).size>100);
    }
    await page.reload({waitUntil:'domcontentloaded'});
    const cached=await page.evaluate(async(src)=>{
      document.querySelector('#provider').value='ark';document.querySelector('#key').value='test';
      const select=document.querySelector('#analyzeModel');select.add(new Option('test','doubao-vision-test'));select.value='doubao-vision-test';
      window.__ffLastGeneratedImage=src;
      let calls=0;const original=window.fetch;window.fetch=async(url,options)=>{if(!String(url).endsWith('/chat/completions'))return original(url,options);calls++;throw Error('offline');};
      return {ok:await window.__ffReconstruct(),calls,audit:window.__ffApiAudit.reconstruction};
    },await page.evaluate(()=>localStorage.getItem('test-bitmap')));
    assert.equal(cached.ok,true);assert.equal(cached.audit.cacheHit,true);
    assert.ok(cached.calls<=2,'cached catalog may retry an unfinished detail pass');
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
      window.setTimeout=(fn,ms,...args)=>timer(fn,ms>=90000?20:ms>=1000?1:ms,...args);
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
        }else global++;
        return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({nodes:output})}}]}));
      };
      const ok=await window.__ffReconstruct(),audit=structuredClone(window.__ffApiAudit.reconstruction),texts=window.__ffExportState.scene.nodes.filter(n=>n.type==='text').map(n=>n.text);
      phase=1;const firstCalls=detailCalls;
      const resumed=await window.__ffReconstruct();
      return {ok,audit,texts,peak,global,resumed,resumeCalls:detailCalls-firstCalls,resumeAudit:window.__ffApiAudit.reconstruction};
    });
    assert.equal(split.ok,true);assert.equal(split.peak,3);assert.ok(split.global>=1);
    assert.equal(split.audit.registeredMissing,1);assert.equal(split.texts.length,13);assert.equal(new Set(split.texts).size,13);
    assert.ok(split.audit.revisions.some(r=>r.state==='subdivided'));
    assert.ok(split.audit.failedDetailIds.length>0);assert.equal(split.audit.state,'needs-review');
    assert.equal(split.resumed,true);assert.equal(split.resumeAudit.cacheHit,true);assert.ok(split.resumeCalls>0);
    assert.equal(split.resumeAudit.failedDetailIds,undefined);
    assert.deepEqual(errors,[]);
    console.log('Browser whole-image catalog, constrained crops and four exports: OK');
  }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;}).finally(()=>server.close());
