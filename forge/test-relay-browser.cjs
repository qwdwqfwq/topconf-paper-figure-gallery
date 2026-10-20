// Run with: node forge/test-relay-browser.cjs
// Optional live verification reads INFISTAR_TEST_KEY from the environment only.
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
          "window.__testGenImage=genOaiImage; window.__testGenImageRefs=async(...args)=>{const saved=refDataURIs;refDataURIs=async()=>Array(10).fill('data:image/png;base64,AA==');try{return await genOaiImage(...args);}finally{refDataURIs=saved;}}; runReconstruction=async()=>false; MAN=FALLBACK;\ninitProviders();\nsyncSubCount();\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});");
      data=Buffer.from(html);
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream'});
    res.end(data);
  });
});

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-proxy-server']});
  try{
    const page=await browser.newPage({serviceWorkers:'block'});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/forge/`);
    assert.equal(await page.locator('#provider').inputValue(),'infistar');
    const providers=await page.locator('#provider option').evaluateAll(xs=>xs.map(x=>x.value));
    assert.equal(providers[0],'infistar');
    for(const id of ['sf','claude','custom']) assert.ok(!providers.includes(id));
    assert.equal(await page.locator('#relayToggle').isVisible(),false);
    assert.equal(await page.locator('#relayRow').isVisible(),false);
    assert.equal(await page.locator('#manifestHint').isVisible(),false);
    assert.equal(await page.locator('#baseHint').isVisible(),false);
    assert.equal(await page.locator('[data-i18n="hint.pdf"]').count(),0);
    // Migrate obsolete saved selections without borrowing their credentials.
    await page.evaluate(()=>{localStorage.setItem('ff_provider','claude');localStorage.setItem('ff_key_claude','old-provider-key');localStorage.setItem('ff_base_infistar','https://infistar.ai/v1');});
    await page.reload();
    assert.equal(await page.locator('#provider').inputValue(),'infistar');
    assert.equal(await page.locator('#key').inputValue(),'');
    assert.equal(await page.locator('#baseOverride').inputValue(),'https://infistar.ai/v1');
    await page.evaluate(()=>localStorage.removeItem('ff_base_infistar'));
    await page.reload();
    await page.locator('[data-mode="image"]').click();
    for(const id of ['figureRatio','imageResolution','analyzeModel']){
      assert.equal(await page.locator('#'+id).evaluate(el=>getComputedStyle(el).borderTopStyle),'solid');
    }
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.setViewportSize({width:1280,height:900});
    let requested=[];
    await page.route('https://infistar.cc/v1/**',route=>{
      requested.push({url:route.request().url(),headers:route.request().headers()});
      return route.fulfill({json:{data:[{id:'gpt-4o-mini'},{id:'text-embedding-v4'},{id:'wan3.0-video'},{id:'gpt-image-2'},{id:'gpt-image-2.5-sunburst'},{id:'qwen-image-plus'}]}});
    });
    await page.locator('#key').fill('test-key');
    await page.locator('#refreshModels').click();
    await page.waitForFunction(()=>document.querySelector('#parseModel').value==='gpt-4o-mini');
    assert.deepEqual(await page.locator('#parseModel option').evaluateAll(xs=>xs.map(x=>x.value)),['gpt-4o-mini']);
    assert.ok(requested.every(r=>r.url==='https://infistar.cc/v1/models' && r.headers.authorization==='Bearer test-key'));
    await page.unroute('https://infistar.cc/v1/**');
    // Exercise the app's image branch and bitmap handoff to Step 4.
    // Reference payloads are covered by test-image-api.mjs; reconstruction is stubbed.
    await page.locator('#figureRatio').selectOption('1:1');
    const pixel=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=2048;return canvas.toDataURL('image/png').split(',')[1];});
    let imageRequests=[];
    await page.route('https://infistar.cc/**',route=>{
      const req=route.request();
      imageRequests.push({url:req.url(),body:req.postDataJSON(),headers:req.headers()});
      return route.fulfill({json:{candidates:[{content:{parts:[{text:'Generated image'},{inlineData:{mimeType:'image/png',data:pixel}}]},finishReason:'STOP'}]}});
    });
    await page.evaluate(()=>window.__testGenImage('https://infistar.cc/v1','gemini-3.1-flash-image','test-key','Draw a research diagram','infistar',[],''));
    assert.equal(imageRequests.length,1);
    assert.equal(imageRequests[0].url,'https://infistar.cc/v1beta/models/gemini-3.1-flash-image:generateContent');
    assert.equal(imageRequests[0].headers.authorization,'Bearer test-key');
    assert.deepEqual(imageRequests[0].body.generationConfig.responseModalities,['TEXT','IMAGE']);
    assert.ok(imageRequests[0].body.contents[0].parts[0].text.includes('Draw a research diagram'));
    assert.equal(await page.locator('#out img').getAttribute('src'),'data:image/png;base64,'+pixel);
    await page.unroute('https://infistar.cc/**');
    await page.locator('#model').selectOption('qwen-image-plus');
    for(const resolution of ['1K','2K','4K']) for(const ratio of ['16:9','3:2','4:3','1:1']){
      await page.locator('#imageResolution').selectOption(resolution);
      await page.locator('#figureRatio').selectOption(ratio);
      assert.equal(await page.locator('#imageRatioWarn').isVisible(),true,`Infistar audit should show ${ratio} ${resolution}`);
      assert.match(await page.locator('#imageRatioWarn').innerText(),/HTTP 422/);
    }
    // Regression: Infistar GPT 2.5 must accept the selected 16:9, 2K size,
    // and the verified Step 3 bitmap download must be ready immediately.
    await page.locator('#model').selectOption('gpt-image-2.5-sunburst');
    await page.locator('#figureRatio').selectOption('16:9');
    await page.locator('#imageResolution').selectOption('2K');
    assert.equal(await page.locator('#imageRatioWarn').isVisible(),true);
    assert.match(await page.locator('#imageRatioWarn').innerText(),/已验证/);
    const widePixel=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1152;return canvas.toDataURL('image/png').split(',')[1];});
    let gptRequest;
    await page.route('https://infistar.cc/v1/images/generations',route=>{
      gptRequest=route.request().postDataJSON();
      return route.fulfill({json:{data:[{b64_json:widePixel}]}});
    });
    await page.evaluate(()=>window.__testGenImage('https://infistar.cc/v1','gpt-image-2.5-sunburst','test-key','Draw a research diagram','infistar',[],''));
    assert.equal(gptRequest.size,'2048x1152');
    assert.equal(await page.locator('#dlImg').isEnabled(),true);
    assert.equal(await page.locator('#out img').getAttribute('src'),'data:image/png;base64,'+widePixel);
    await page.unroute('https://infistar.cc/v1/images/generations');
    // Exercise recovery through the real Step 3 UI, including output disclosure.
    const upstreamError={error:{message:'context canceled',code:'read_response_body_failed'}};
    for(const scenario of ['success','reference','upstream','latest-error','unauthorized']){
      const attempts=[];
      await page.route('https://infistar.cc/v1/images/edits',async route=>{
        const req=route.request();
        const form=await new Response(req.postDataBuffer(),{headers:{'Content-Type':req.headers()['content-type']}}).formData();
        assert.equal(form.getAll('image[]').length,10);
        assert.equal(form.get('image[]').type,'image/png');
        assert.equal(form.get('image[]').size,1);
        attempts.push({image:true,size:form.get('size'),prompt:form.get('prompt')});
        if(scenario==='unauthorized') return route.fulfill({status:401,json:{error:{message:'bad key'}}});
        if(scenario==='reference') return route.fulfill({status:422,json:{error:{message:'现在没有线路支持这次要求的生成方式（用参考图生成）'}}});
        if(scenario!=='success' && attempts.length===1) return route.fulfill({status:500,json:upstreamError});
        if(scenario==='latest-error') return route.fulfill({status:422,json:{error:{message:'FINAL_REQUEST_ID: text route unavailable'}}});
        return route.fulfill({json:{data:[{b64_json:widePixel}]}});
      });
      const error=await page.evaluate(async()=>{
        try{await window.__testGenImageRefs('https://infistar.cc/v1','gpt-image-2.5-sunburst','test-key','Draw a research diagram','infistar',['test-ref'],'layout description');return '';}
        catch(e){return e.message;}
      });
      assert.equal(attempts.length,['upstream','latest-error'].includes(scenario)?2:1,scenario);
      assert.ok(attempts[0].image);
      if(attempts[1]){
        assert.equal(Boolean(attempts[1].image),true);
        assert.equal(attempts[1].size,attempts[0].size);
        assert.equal(attempts[1].prompt,attempts[0].prompt);
      }
      if(scenario==='latest-error')assert.match(error,/FINAL_REQUEST_ID/);
      else if(scenario==='unauthorized'||scenario==='reference')assert.ok(error);
      else{
        assert.equal(error,'');assert.equal(await page.locator('#dlImg').isEnabled(),true);
        assert.match(await page.locator('#out .hint').innerText(),/多图参考输入/);
      }
      await page.unroute('https://infistar.cc/v1/images/edits');
    }
    console.log('PASS Step 3 multipart edits with 10 references, bounded recovery without dropping references, final errors and auth failures');
    if(process.env.INFISTAR_IMAGE_TEST_KEY){
      await page.evaluate(async key=>window.__testGenImage('https://infistar.cc/v1','gemini-3.1-flash-image',key,'Draw two boxes labelled Input and Output, connected by an arrow.','infistar',[],''),process.env.INFISTAR_IMAGE_TEST_KEY);
      const result=await page.locator('#out img').evaluate(async img=>{await img.decode();return {width:img.naturalWidth,height:img.naturalHeight,srcLength:img.src.length}});
      assert.ok(result.width>1 && result.height>1);
      console.log('LIVE Gemini image generation and browser decode passed:',JSON.stringify(result));
      await page.locator('#out img').screenshot({path:path.join(root,'work/infistar-gemini-live.png')});
    }
    if(process.env.INFISTAR_TEST_KEY){
      await page.locator('#key').fill(process.env.INFISTAR_TEST_KEY);
      await page.locator('#refreshModels').click();
      await page.waitForFunction(()=>document.querySelector('#parseModel').options.length>20,{},{timeout:45000});
      const result=await page.evaluate(async()=>{
        const response=await fetch('https://infistar.cc/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+document.querySelector('#key').value},body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'user',content:'Reply with exactly FORGE_OK'}],max_tokens:20,stream:false})});
        const data=await response.json();
        return {status:response.status,reply:data.choices?.[0]?.message?.content,error:data.error?.message};
      });
      assert.equal(result.status,200,JSON.stringify(result));
      assert.match(result.reply,/FORGE_OK/);
      console.log('LIVE browser CORS, model discovery and chat passed:',JSON.stringify(result));
    }
    fs.mkdirSync(path.join(root,'work'),{recursive:true});
    await page.screenshot({path:path.join(root,'work/provider-ui-desktop.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS provider cleanup, saved-provider migration, control styling, mobile layout, credential isolation, model filtering and Gemini image generation');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
