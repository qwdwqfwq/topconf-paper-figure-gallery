// Verifies serialized browser requests, without spending API credits.
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  let pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.endsWith('/')) pathname+='index.html';
  const filename=path.resolve(root,'.'+decodeURIComponent(pathname));
  if(!filename.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(filename,(err,data)=>{
    if(err){res.writeHead(404);return res.end();}
    if(pathname==='/forge/index.html') data=Buffer.from(data.toString().replace(/\r\n/g,'\n')
      .replace("import * as T from './vendor/transformers.min.js';",'const T={};')
      .replace('window.__ffReconstruct = () => runReconstruction();',`window.__test={parse:callPdfParser,refs:analyzeReferences,scene:requestEditableScene,labels:requestRegionLabels,seed(){pdfContext={fileName:'test.pdf',dataUri:'data:application/pdf;base64,dGVzdA=='};}};`)
      .replace("await boot();\ninitProviders();\nsyncSubCount();\nawait Promise.all([populateModels(), populateParserModels()]);\n$('#manifestHint').textContent = tt('manifest.hint',{d:MAN.updated});","MAN=FALLBACK;\ninitProviders();\nsyncSubCount();"));
    res.writeHead(200,{'Content-Type':/\.m?js$/.test(filename)?'text/javascript':filename.endsWith('.html')?'text/html':'application/octet-stream'});res.end(data);
  });
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage({serviceWorkers:'block'}),requests=[],errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    let reject=false,truncateOnce=false;
    await page.route(/\/(chat\/completions|responses)$/,async route=>{
      requests.push(route.request().postDataJSON());
      if(truncateOnce){
        truncateOnce=false;
        return route.fulfill({json:{choices:[{finish_reason:'length',message:{content:'',reasoning_content:'unfinished analysis'}}]}});
      }
      const content=JSON.stringify({selectedSections:[{section:'Method',summary:'Test paper method.'}],nodes:[{id:'box',type:'rect',x:10,y:10,w:40,h:40,fill:'#ffffff'}],labels:['test']});
      await route.fulfill({status:reject?400:200,contentType:'application/json',body:JSON.stringify(reject?{error:{message:'Unsupported reasoning_effort xhigh'}}:{choices:[{message:{content}}],output:[{type:'message',content:[{type:'output_text',text:content}]}]})});
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/forge/`);
    assert.equal(await page.evaluate(()=>typeof window.__test),'object',JSON.stringify(errors));
    await page.evaluate(()=>{
      document.querySelector('#provider').value='infistar';
      document.querySelector('#key').value='test-key';
      document.querySelector('#useRelay').checked=true;
      document.querySelector('#baseOverride').value='https://test.invalid/v1';
      for(const id of ['parseModel','analyzeModel','model']){const el=document.getElementById(id);el.add(new Option('gpt-6.1-sol','gpt-6.1-sol'));el.value='gpt-6.1-sol';}
      window.__test.seed();
    });
    for(const endpoint of ['https://test.invalid/v1','https://api.openai.com/v1']){
      await page.evaluate(value=>{
        const official=value.includes('openai.com');
        document.querySelector('#provider').value=official?'oai':'infistar';
        document.querySelector('#useRelay').checked=!official;
        document.querySelector('#baseOverride').value=official?'':value;
      },endpoint);
      for(const effort of ['','medium','high','xhigh']){
        await page.selectOption('#parseReasoningEffort',effort);
        for(const mode of ['text','img','doc']){
          await page.evaluate(mode=>window.__test.parse(mode,{text:'test paper',pages:1,total:1,imgs:['data:image/png;base64,dGVzdA==']}),mode);
          const body=requests.at(-1),responses=endpoint.includes('openai.com');
          assert.equal(responses?body.reasoning?.effort:body.reasoning_effort,effort||undefined);
          if(effort){assert.equal(body.temperature,undefined);if(!responses){assert.equal(body.max_tokens,undefined);assert.equal(body.max_completion_tokens,5000);}}
        }
      }
    }
    await page.evaluate(()=>{
      document.querySelector('#provider').value='infistar';
      document.querySelector('#useRelay').checked=true;
      document.querySelector('#baseOverride').value='https://test.invalid/v1';
    });
    await page.selectOption('#parseReasoningEffort','medium');
    for(const effort of ['','medium','high','xhigh']){
      await page.selectOption('#visualReasoningEffort',effort);
      for(const stage of ['refs','scene','labels']){
        await page.evaluate(async stage=>{
          if(stage==='refs') return window.__test.refs();
          if(stage==='labels') return window.__test.labels([{x:10,y:10,w:40,h:20}],null);
          const c=document.createElement('canvas');c.width=100;c.height=100;
          return window.__test.scene(c.toDataURL(),100,100,{objectRepair:true,catalog:{canvas:{width:100,height:100},nodes:[{id:'box',type:'rect',x:10,y:10,w:40,h:40}]}});
        },stage);
        assert.equal(requests.at(-1).reasoning_effort,effort||undefined,stage);
      }
    }
    truncateOnce=true;
    const beforeRepair=requests.length;
    const repaired=await page.evaluate(()=>window.__test.parse('text',{text:'PAPER_FIXTURE_MUST_SURVIVE',pages:1,total:1}));
    assert.ok(repaired.selectedSections[0].summary);
    assert.equal(requests.length,beforeRepair+2);
    const first=requests[beforeRepair],second=requests[beforeRepair+1];
    assert.equal(second.max_completion_tokens,12000);
    assert.equal(second.reasoning_effort,first.reasoning_effort);
    assert.equal(second.model,first.model);
    assert.deepEqual(second.messages.slice(0,-1),first.messages);
    assert.match(JSON.stringify(second.messages),/PAPER_FIXTURE_MUST_SURVIVE/);
    reject=true;
    const before=requests.length;
    const failure=await page.evaluate(async()=>{try{await window.__test.labels([],null);return '';}catch(e){return e.message;}});
    assert.match(failure,/Unsupported reasoning_effort/);
    assert.equal(requests.length,before+1,'no downgrade request after rejection');
    assert.equal(requests.at(-1).reasoning_effort,'xhigh');
    await page.reload();
    assert.equal(await page.locator('#parseReasoningEffort').inputValue(),'medium');
    assert.equal(await page.locator('#visualReasoningEffort').inputValue(),'xhigh');
    assert.deepEqual(errors,[]);
    console.log(`PASS: ${requests.length} actual browser API requests; parsing text/image/PDF, Responses, visual analysis/reconstruction/labels, independent persisted choices and explicit rejection.`);
  }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
