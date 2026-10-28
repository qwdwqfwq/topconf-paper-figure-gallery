// Browser integration against mocked official Responses HTTP requests. No API credits used.
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  let pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.endsWith('/'))pathname+='index.html';
  const filename=path.resolve(root,'.'+decodeURIComponent(pathname));
  if(!filename.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(filename,(err,data)=>{
    if(err){res.writeHead(404);return res.end();}
    if(pathname==='/forge/index.html')data=Buffer.from(data.toString().replace(/\r\n/g,'\n')
      .replace("import * as T from './vendor/transformers.min.js';",'const T={};')
      .replace('window.__ffReconstruct = () => runReconstruction();',`window.__pdfTest={parse:callPdfParser,select:selectPdfContext,seed(){pdfContext={fileName:'test.pdf',dataUri:'data:application/pdf;base64,PDF_FIXTURE'};}};`)
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
    let scenario='complete',attempt=0;
    await page.route('https://api.openai.com/v1/responses',async route=>{
      requests.push(route.request().postDataJSON());attempt++;
      if(scenario==='quota')return route.fulfill({status:429,json:{error:{code:'insufficient_quota',message:'Test quota exhausted'}}});
      if(scenario==='key')return route.fulfill({status:401,json:{error:{code:'invalid_api_key',message:'Test invalid key'}}});
      if(scenario==='incomplete'||(scenario==='recover'&&attempt===1))return route.fulfill({json:{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[]}});
      return route.fulfill({json:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({selectedSections:[{section:'Method',summary:'Browser fixture summary.'}]})}]}]}});
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/forge/`);
    assert.equal(await page.evaluate(()=>typeof window.__pdfTest),'object',JSON.stringify(errors));
    await page.evaluate(()=>{
      document.querySelector('#provider').value='oai';
      document.querySelector('#key').value='test-key';
      document.querySelector('#useRelay').checked=false;
      for(const id of ['parseModel','analyzeModel']){const el=document.getElementById(id);el.add(new Option('gpt-6.1-sol','gpt-6.1-sol'));el.value='gpt-6.1-sol';}
      document.querySelector('#parseReasoningEffort').value='high';
      window.__pdfTest.seed();
    });
    for(const mode of ['doc','text','img']){
      scenario='recover';attempt=0;
      const start=requests.length;
      const result=await page.evaluate(mode=>window.__pdfTest.parse(mode,{text:'PAPER_FIXTURE',pages:1,total:1,imgs:['data:image/jpeg;base64,PIXEL_FIXTURE']}),mode);
      assert.equal(result.selectedSections[0].summary,'Browser fixture summary.');
      assert.equal(requests.length,start+2);
      const [first,second]=requests.slice(start);
      assert.equal(first.max_output_tokens,25000);assert.equal(second.max_output_tokens,100000);
      assert.equal(second.model,first.model);assert.deepEqual(second.reasoning,{effort:'high'});
      assert.deepEqual(second.input.slice(0,-1),first.input);
      assert.equal(first.input[0].content[0].type,{doc:'input_file',text:'input_text',img:'input_image'}[mode]);
    }
    for(const kind of ['quota','key','incomplete']){
      scenario=kind;attempt=0;
      const start=requests.length;
      await page.evaluate(async()=>{
        document.querySelector('#contentMode').value='intent';
        await window.__pdfTest.select();
      });
      assert.equal(requests.length,start+(kind==='incomplete'?2:1),'no text/image fallback on '+kind);
      assert.equal(await page.locator('#contentModeHint').getAttribute('data-state'),'error');
      const visibleError=await page.locator('body').innerText();
      assert.match(visibleError,kind==='quota'?/额度不足/:kind==='key'?/API Key/:/输出额度耗尽/);
    }
    scenario='complete';attempt=0;
    await page.evaluate(()=>window.__pdfTest.select());
    assert.equal(await page.locator('#contentModeHint').getAttribute('data-state'),'success');
    assert.match(await page.locator('#paper').inputValue(),/Browser fixture summary/);
    assert.deepEqual(errors,[]);
    console.log(`PASS: ${requests.length} mocked official browser requests; PDF/text/images recovery, preserved settings, terminal failures, summary UI.`);
  }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
