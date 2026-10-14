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
      const html=data.toString('utf8')
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
      select.add(new Option('doubao-vision-test','doubao-vision-test'));
      select.value='doubao-vision-test';
      const original=window.fetch;
      let calls=0;
      window.fetch=async(url,options)=>{
        if(String(url).endsWith('/chat/completions')){
          calls++;
          const body=JSON.parse(options.body);
          if(body.response_format?.type!=='json_object') throw new Error('Ark vision requests require JSON mode');
          const match=body.messages[1].content[0].text.match(/"width":(\d+),"height":(\d+)/);
          const w=Number(match[1]),h=Number(match[2]);
          const nodes=Array.from({length:8},(_,i)=>({type:'rect',x:20+i*45,y:30,w:35,h:35,rx:i===0?12:0,fill:'#abcdef',stroke:'#123456'}));
          nodes.push({type:'text',x:15,y:90,w:200,h:30,text:'Editable test'});
          nodes.push({type:'line',x1:12,y1:14,x2:70,y2:14,stroke:'#123456'});
          nodes.push({type:'line',x:22,y:22,w:48,h:0,stroke:'#123456'}); // Some vision responses use a displacement instead of end coordinates.
          nodes.push({type:'line',x2:70,y2:14,stroke:'#123456'}); // Invalid origin must not become (0,0).
          nodes.push({type:'line',x:0,y:0,x2:500,y2:240,stroke:'#123456'}); // Crop-corner hallucination must not become a page-wide ray.
          nodes.push({type:'line',x:0,y:100,x2:500,y2:240,stroke:'#123456'}); // Edge hallucination is equally invalid.
          nodes.push({type:'polyline',points:'0,0 500,240',stroke:'#123456'});
          nodes.push({type:'path',d:'M 0 0 L 500 240',stroke:'#123456'});
          nodes.push({type:'text',x:15,y:140,w:80,h:20,text:'Oversized label',fontSize:100});
          nodes.push({type:'polyline',points:'12,180 70,180',stroke:'#123456'});
          return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({output:{result:{scene:{canvas:{width:w,height:h},nodes}}}})}}]}),{status:200,headers:{'Content-Type':'application/json'}});
        }
        return original(url,options);
      };
      const canvas=document.createElement('canvas'); canvas.width=1200; canvas.height=500;
      canvas.getContext('2d').fillStyle='#ffffff'; canvas.getContext('2d').fillRect(0,0,1200,500);
      window.__ffLastGeneratedImage=canvas.toDataURL('image/png');
      const ok=await window.__ffReconstruct();
      const scene=window.__ffExportState.scene;
      return {ok,calls,nodes:scene&&scene.nodes.length,svg:window.__ffExportState.svg,
        qualityState:window.__ffExportState.recon?.qualityState,
        lines:scene?.nodes.filter(n=>n.type==='line').map(n=>({x:n.x,y:n.y,x2:n.x2,y2:n.y2})),
        fittedText:scene?.nodes.filter(n=>n.type==='text'&&n.text==='Oversized label').map(n=>n.fontSize),
        polylines:(window.__ffExportState.svg.match(/<polyline\b/g)||[]).length,
        textColor:(window.__ffExportState.svg.match(/<text[^>]*fill="([^"]+)"/)||[])[1],
        status:document.querySelector('#reconStatus').textContent};
    });
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.equal(result.qualityState,'needs-review','a mismatched editable scene must not be labelled publication ready');
    assert.equal(result.calls,2,'1200px bitmap must use two vision requests');
    assert.ok(result.nodes>=16,'editable primitives must survive tile merge');
    assert.equal(result.lines.length,4,'valid line coordinates and displacements survive');
    assert.equal(result.lines.filter(n=>n.y===14 && n.x2-n.x===58).length,2,'x1/y1 aliases must preserve line geometry');
    assert.equal(result.lines.filter(n=>n.y===22 && n.y2===22 && n.x2-n.x===48).length,2,'width and height line displacements must preserve geometry');
    assert.match(result.status,/已过滤 8 条|filtered 8/i,'all crop-boundary rays must be reported');
    assert.equal(result.fittedText.length,2,'oversized labels must remain editable');
    assert.ok(result.fittedText.every(size=>size<=23),'text must fit its explicit bounding box');
    assert.equal(result.polylines,2,'point-only polylines must survive');
    assert.equal(result.textColor,'#111827','text without model color must remain visible');
    assert.match(result.svg,/rx="12"/,'model rx must survive as an editable rounded corner');
    assert.match(result.svg,/<svg/);
    for(const format of ['svg','pptx','vsdx','drawio']){
      await page.locator(`#exportActions [data-export="${format}"]`).click();
      const downloadPromise=page.waitForEvent('download',{timeout:30000});
      await page.locator('#exportConfirm').click();
      const download=await downloadPromise;
      assert.equal(download.suggestedFilename(),`figure-forge-editable.${format}`);
      const bytes=fs.readFileSync(await download.path());
      assert.ok(bytes.length>100,`${format} download must contain content`);
      if(format==='pptx' || format==='vsdx') assert.equal(bytes.subarray(0,2).toString(),'PK',`${format} must be a ZIP package`);
      if(format==='svg') assert.match(bytes.toString('utf8'),/<svg/);
      if(format==='drawio') assert.match(bytes.toString('utf8'),/<mxfile/);
      assert.match(await page.locator('#exportStatus').innerText(),/已生成|完成|finished|ready/i);
    }
    const repaired=await page.evaluate(async()=>{
      const original=window.fetch;
      let calls=0,revisionSeen=false;
      window.fetch=async(url,options)=>{
        if(String(url).endsWith('/chat/completions')){
          calls++;
          const body=JSON.parse(options.body);
          const prompt=body.messages[1].content[0].text;
          const match=prompt.match(/"width":(\d+),"height":(\d+)/);
          const w=Number(match[1]),h=Number(match[2]);
          const images=body.messages[1].content.filter(part=>part.type==='image_url').length;
          if(images===2) revisionSeen=true;
          const fill=images===2?'#e02020':'#2020e0';
          const content=JSON.stringify({canvas:{width:w,height:h},nodes:[{type:'rect',x:20,y:20,w:180,h:110,fill,stroke:'none'}]});
          return new Response(JSON.stringify({choices:[{message:{content}}]}),{status:200,headers:{'Content-Type':'application/json'}});
        }
        return original(url,options);
      };
      const canvas=document.createElement('canvas');canvas.width=240;canvas.height=160;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,240,160);
      ctx.fillStyle='#e02020';ctx.fillRect(20,20,180,110);
      window.__ffLastGeneratedImage=canvas.toDataURL('image/png');
      const ok=await window.__ffReconstruct();
      return {ok,calls,revisionSeen,audit:window.__ffApiAudit.reconstruction,
        fill:window.__ffExportState.scene?.nodes.find(n=>n.type==='rect')?.fill};
    });
    assert.equal(repaired.ok,true,JSON.stringify(repaired));
    assert.equal(repaired.calls,2,'one vision pass and one visual revision: '+JSON.stringify(repaired.audit));
    assert.equal(repaired.revisionSeen,true,'revision must receive both source and rendered preview');
    assert.equal(repaired.fill,'#e02020','accepted repair must improve the editable scene');
    assert.equal(repaired.audit.tiles[0].repairAccepted,true);
    const split=await page.evaluate(async()=>{
      const original=window.fetch;
      let calls=0;
      window.fetch=async(url,options)=>{
        if(String(url).endsWith('/chat/completions')){
          calls++;
          const body=JSON.parse(options.body);
          const match=body.messages[1].content[0].text.match(/"width":(\d+),"height":(\d+)/);
          const w=Number(match[1]),h=Number(match[2]);
          const fill=w<500?'#e02020':'#2020e0';
          const content=JSON.stringify({canvas:{width:w,height:h},nodes:[
            {type:'rect',x:0,y:0,w,h,fill,stroke:'none'}]});
          return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content}}]}),
            {status:200,headers:{'Content-Type':'application/json'}});
        }
        return original(url,options);
      };
      const canvas=document.createElement('canvas');canvas.width=700;canvas.height=500;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#e02020';ctx.fillRect(0,0,700,500);
      window.__ffLastGeneratedImage=canvas.toDataURL('image/png');
      const ok=await window.__ffReconstruct();
      return {ok,calls,audit:window.__ffApiAudit.reconstruction,
        fills:window.__ffExportState.scene?.nodes.map(n=>n.fill)};
    });
    assert.equal(split.ok,true,JSON.stringify(split));
    assert.equal(split.audit.tiles[0].splitAccepted,true,'smaller crops must replace a poor parent when rendered quality improves');
    assert.ok(split.audit.splitCalls>=4,'dense parent must be reconstructed from smaller crops');
    assert.ok(split.fills.every(fill=>fill==='#e02020'),'the accepted scene uses corrected native shapes');
    const truncated=await page.evaluate(async()=>{
      const original=window.fetch;
      let calls=0;
      window.fetch=async(url,options)=>{
        if(String(url).endsWith('/chat/completions')){
          calls++;
          const body=JSON.parse(options.body);
          if(body.max_tokens!==16000) throw Error('Reconstruction token budget was not raised');
          const content=JSON.stringify({nodes:[{type:'rect',x:0,y:0,w:240,h:160,
            fill:calls===1?'#2020e0':'#e02020'}]});
          return new Response(JSON.stringify({choices:[{finish_reason:calls===1?'length':'stop',
            message:{content}}]}),{status:200,headers:{'Content-Type':'application/json'}});
        }
        return original(url,options);
      };
      const canvas=document.createElement('canvas');canvas.width=240;canvas.height=160;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#e02020';ctx.fillRect(0,0,240,160);
      window.__ffLastGeneratedImage=canvas.toDataURL('image/png');
      const ok=await window.__ffReconstruct();
      return {ok,calls,fill:window.__ffExportState.scene?.nodes[0]?.fill};
    });
    assert.deepEqual(truncated,{ok:true,calls:2,fill:'#e02020'},
      'a length-limited answer must be retried even when its JSON parses');
    const largeTruncated=await page.evaluate(async()=>{
      const original=window.fetch;
      let calls=0;
      window.fetch=async(url,options)=>{
        if(String(url).endsWith('/chat/completions')){
          calls++;
          const body=JSON.parse(options.body);
          const image=body.messages[1].content.find(part=>part.type==='image_url').image_url.url;
          const im=new Image();im.src=image;await im.decode();
          const content=JSON.stringify({nodes:[{type:'rect',x:0,y:0,w:im.width,h:im.height,fill:'#e02020'}]});
          return new Response(JSON.stringify({choices:[{finish_reason:calls===1?'length':'stop',message:{content}}]}),
            {status:200,headers:{'Content-Type':'application/json'}});
        }
        return original(url,options);
      };
      const canvas=document.createElement('canvas');canvas.width=700;canvas.height=500;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#e02020';ctx.fillRect(0,0,700,500);
      window.__ffLastGeneratedImage=canvas.toDataURL('image/png');
      const ok=await window.__ffReconstruct();
      return {ok,calls,first:window.__ffApiAudit.reconstruction.tiles[0]};
    });
    assert.equal(largeTruncated.ok,true,JSON.stringify(largeTruncated));
    assert.equal(largeTruncated.calls,5,'large truncated crops should split without repeating the same request');
    assert.equal(largeTruncated.first.state,'subdivided');
    const recovered=await page.evaluate(async()=>{
      const original=window.fetch;
      let calls=0;
      window.fetch=async(url,options)=>{
        if(String(url).endsWith('/chat/completions')){
          calls++;
          const body=JSON.parse(options.body);
          const match=body.messages[1].content[0].text.match(/"width":(\d+),"height":(\d+)/);
          const w=Number(match[1]),h=Number(match[2]);
          const content=calls>=3&&calls<=6
            ? JSON.stringify({result:{description:'summary only'}})
            : JSON.stringify({nodes:[{type:'rect',x:20,y:20,w:30,h:30,fill:'#123456'}]});
          return new Response(JSON.stringify({choices:[{message:{content}}]}),{status:200,headers:{'Content-Type':'application/json'}});
        }
        return original(url,options);
      };
      const canvas=document.createElement('canvas');canvas.width=3200;canvas.height=1600;
      canvas.getContext('2d').fillStyle='#ffffff';canvas.getContext('2d').fillRect(0,0,3200,1600);
      window.__ffLastGeneratedImage=canvas.toDataURL('image/png');
      const ok=await window.__ffReconstruct();
      return {ok,calls,audit:window.__ffApiAudit.reconstruction,nodes:window.__ffExportState.scene?.nodes.length};
    });
    assert.equal(recovered.ok,true,JSON.stringify(recovered));
    assert.ok(recovered.audit.totalTiles>8,'failed third crop must be subdivided');
    assert.equal(recovered.audit.completedTiles,recovered.audit.totalTiles,'all replacement crops must complete');
    assert.ok(recovered.nodes>0,'recovered result remains editable');
    const fallback=await page.evaluate(async()=>{
      const original=window.fetch;
      let calls=0;
      window.fetch=async(url,options)=>{
        if(String(url).endsWith('/chat/completions')){
          calls++;
          return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({description:'summary only'})}}]}),{status:200,headers:{'Content-Type':'application/json'}});
        }
        return original(url,options);
      };
      const canvas=document.createElement('canvas');canvas.width=240;canvas.height=160;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,240,160);
      ctx.fillStyle='#123456';ctx.fillRect(30,25,100,80);
      window.__ffLastGeneratedImage=canvas.toDataURL('image/png');
      const ok=await window.__ffReconstruct();
      return {ok,calls,audit:window.__ffApiAudit.reconstruction,nodes:window.__ffExportState.scene?.nodes.length,
        status:document.querySelector('#reconStatus').textContent};
    });
    assert.equal(fallback.ok,true,JSON.stringify(fallback));
    assert.equal(fallback.calls,2,'malformed response should get one schema retry');
    assert.equal(fallback.audit.fallbackTiles,1,'terminal malformed response must use editable fallback');
    assert.ok(fallback.nodes>0,'fallback must contain native vector nodes');
    assert.match(fallback.status,/可编辑色块|editable color blocks/);
    for(const format of ['svg','pptx','vsdx','drawio']){
      await page.locator(`#exportActions [data-export="${format}"]`).click();
      const downloadPromise=page.waitForEvent('download',{timeout:30000});
      await page.locator('#exportConfirm').click();
      const download=await downloadPromise;
      const bytes=fs.readFileSync(await download.path());
      assert.ok(bytes.length>100,`${format} fallback download must contain content`);
    }
    const failed=await page.evaluate(async()=>{
      const original=window.fetch;
      window.fetch=async(url,options)=>{
        if(String(url).endsWith('/chat/completions')) return new Response(JSON.stringify({error:{message:'Provider temporarily unavailable'}}),{status:503});
        return original(url,options);
      };
      const ok=await window.__ffReconstruct();
      return {ok,status:document.querySelector('#exportStatus').textContent};
    });
    assert.equal(failed.ok,false);
    assert.match(failed.status,/503|temporarily unavailable/i);
    assert.deepEqual(errors,[],'page JavaScript errors');
    console.log('Browser rebuild with mocked vision API: OK');
  }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;}).finally(()=>server.close());
