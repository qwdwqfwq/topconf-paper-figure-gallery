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
          'window.__ffReconstruct = () => runReconstruction();\nwindow.__ffTestLongLines = filterUnsupportedLongLines; window.__ffTestMaterialize = materializeEditableScene; window.__ffTestCalibrate = calibrateEditableText; window.__ffTestGenerateBitmap = genOaiImage; window.__ffTestZip = zipStore; window.__ffTestRequestScene = requestEditableScene; window.__ffTestParseSvg = parseSvgScene; window.__ffTestParseBitmap = parseBitmapSvgScene; window.__ffTestDrawio = sceneToDrawio; window.__ffTestVsdx = sceneToVsdxFiles; window.__ffTestPptx = buildNativePptx; window.__ffTestSvgString = sceneToSvgString;')
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
    // A standalone upload works without any Step 3 result or generated-image cache.
    const uploadFixture=await page.evaluate(()=>{
      const c=document.createElement('canvas');c.width=80;c.height=40;
      c.getContext('2d').fillRect(0,0,80,40);return c.toDataURL();
    });
    await page.locator('#exportBitmapUpload').setInputFiles({name:'standalone.png',mimeType:'image/png',buffer:Buffer.from(uploadFixture.split(',')[1],'base64')});
    await page.waitForFunction(()=>document.querySelector('#exportInputStatus').textContent.includes('standalone.png'));
    assert.equal(await page.locator('#reconBtn').isEnabled(),true);
    assert.equal(await page.locator('#exportUseGenerated').isVisible(),false);
    assert.equal(await page.evaluate(()=>window.__ffLastGeneratedImage || ''),'','upload must not overwrite generated-image cache');
    await page.locator('#exportBitmapUpload').setInputFiles({name:'invalid.png',mimeType:'image/png',buffer:Buffer.from('invalid')});
    await page.waitForFunction(()=>!document.querySelector('#exportBitmapUpload').disabled);
    assert.equal(await page.evaluate(()=>window.__ffExportState.bitmap),uploadFixture,'invalid upload preserves selected input');
    await page.evaluate(()=>{window.__ffExportState.reconPending=true;window.__ffRefreshExportCard();});
    assert.equal(await page.locator('#exportBitmapUpload').isDisabled(),true);
    await page.reload({waitUntil:'domcontentloaded'});
    const colors=await page.evaluate(()=>{
      const node={type:'rect',x:10,y:10,w:80,h:40};
      const scene=window.__ffTestMaterialize({nodes:[{...node,fill:{color:'#abcdef'}},{...node,fill:{type:'linear',angle:90,stops:[{offset:0,color:'#abcdee'},{offset:1,color:'#fedcba'}]}}]},100,100);
      let rejected=false;try{window.__ffTestMaterialize({nodes:[{...node,fill:'#[object Object]'}]},100,100);}catch{rejected=true;}
      return {fills:scene.nodes.map(n=>n.fill),gradient:scene.nodes[1].gradient,rejected};
    });
    assert.deepEqual(colors.fills,['#abcdef','#abcdee']);
    assert.equal(colors.gradient.stops.length,2,'gradient objects survive materialization');
    assert.equal(colors.rejected,true,'invalid colors cannot silently export as black');
    const lineEvidence=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=500;canvas.height=300;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,500,300);
      ctx.strokeStyle='#111';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(20,80);ctx.lineTo(460,80);ctx.stroke();
      const base={nodes:[]};
      const candidate={nodes:[
        {id:'real',type:'line',x:20,y:80,x2:460,y2:80},
        {id:'invented',type:'line',x:20,y:190,x2:460,y2:190}
      ]};
      return window.__ffTestLongLines(canvas,base,candidate).nodes.map(n=>n.id);
    });
    assert.deepEqual(lineEvidence,['real'],'long lines require source-pixel support');
    const containers=await page.evaluate(async()=>{
      const {repairContainerGeometry}=await import('./container-geometry.mjs');
      const {readNativePptxScene}=await import('./editable-native.mjs');
      const canvas=document.createElement('canvas');canvas.width=500;canvas.height=400;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,500,400);
      ctx.strokeStyle='#111111';ctx.lineWidth=2;
      ctx.beginPath();ctx.roundRect(20,20,400,350,12);ctx.stroke();
      const scene={canvas:{width:500,height:400},nodes:[
        {id:'panel',type:'rect',x:20,y:20,w:400,h:350,radius:60,stroke:'#111111',strokeWidth:2,fill:'#ffffff'},
        {id:'header',type:'rect',x:20,y:20,w:400,h:40,radius:20,fill:'#506472',stroke:'none',strokeWidth:0}
      ]};
      const fixed=repairContainerGeometry(scene,canvas),again=repairContainerGeometry(fixed,canvas);
      const blob=await window.__ffTestPptx(fixed,window.__ffTestZip);
      const roundtrip=await readNativePptxScene(blob,500,400);
      const visioPage=window.__ffTestVsdx(fixed,'Arial').find(f=>f.name==='visio/pages/page1.xml');
      const visioXml=typeof visioPage.data==='string'?visioPage.data:new TextDecoder().decode(visioPage.data);
      return {fixed,again,roundtrip,visioXml,drawio:window.__ffTestDrawio(fixed)};
    });
    assert.ok(Math.abs(containers.fixed.nodes[0].radius-12)<=2,'radius measured from source rather than panel height');
    assert.equal(containers.fixed.nodes[1].type,'path','header follows shared rounded container boundary');
    assert.equal(containers.fixed.nodes[1].x,21,'fill stays inside the stroke');
    assert.deepEqual(containers.again,containers.fixed,'container geometry repair is idempotent');
    assert.ok(Math.abs(containers.roundtrip.nodes[0].radius-containers.fixed.nodes[0].radius)<.01,'PPTX radius survives native export/readback');
    assert.ok(!/<Cell N="Rounding" V="(?!0")/.test(containers.visioXml),'Visio does not round explicit rounded geometry a second time');

    const drawioCorners=await page.evaluate((containerXml)=>{
      const sizes=[{w:400,h:350,radius:1},{w:800,h:40,radius:0.375},
        {w:40,h:800,radius:12},{w:80,h:40,radius:100},{w:80,h:40,radius:0}];
      const xml=window.__ffTestDrawio({canvas:{width:1000,height:1000},nodes:sizes.map(n=>({
        type:'rect',x:20.25,y:20.5,fill:'#ffffff',stroke:'#111111',strokeWidth:1,...n}))});
      const parse=xml=>new DOMParser().parseFromString(xml,'application/xml');
      const cells=[...parse(xml).querySelectorAll('mxCell[vertex]')];
      const radii=cells.map(cell=>{
        const style=Object.fromEntries(cell.getAttribute('style').split(';').filter(Boolean).map(s=>s.split('=')));
        const g=cell.querySelector('mxGeometry');
        // Rendering contract from mxRectangleShape.paintBackground (absolute arc size).
        return {absolute:style.absoluteArcSize,rounded:style.rounded,
          radius:style.rounded==='1'?Math.min(+g.getAttribute('width')/2,+g.getAttribute('height')/2,+style.arcSize/2):0,
          x:+g.getAttribute('x'),y:+g.getAttribute('y')};
      });
      const repaired=[...parse(containerXml).querySelectorAll('mxCell[vertex]')];
      return {radii,headerStyle:repaired[1].getAttribute('style'),
        headerX:+repaired[1].querySelector('mxGeometry').getAttribute('x')};
    },containers.drawio);
    assert.deepEqual(drawioCorners.radii.map(n=>n.radius),[1,.375,12,20,0],
      'draw.io preserves small, fractional and tall-panel radii, clamping only to shape bounds');
    assert.ok(drawioCorners.radii.slice(0,4).every(n=>n.absolute==='1'));
    assert.ok(drawioCorners.radii.every(n=>n.x===20.25&&n.y===20.5),'fractional border insets survive export');
    assert.match(drawioCorners.headerStyle,/shape=stencil\(/,'repaired header keeps its explicit outline');
    assert.equal(drawioCorners.headerX,21,'draw.io header remains inside outer stroke');

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
    assert.match(svgCheck.roundtrip,/marker-end="url\(#arrow\d+\)"/,'SVG roundtrip retains arrow');
    assert.match(svgCheck.roundtrip,/stroke-dasharray=/,'SVG roundtrip retains dash');
    const multilinePptx=await page.evaluate(async()=>{
      const scene={canvas:{width:500,height:300},nodes:[{id:'table',type:'text',x:25,y:40,w:200,h:90,fontSize:16,text:'First row\nSecond row\nThird row',fill:'#000000'}]};
      const blob=await window.__ffTestPptx(scene,window.__ffTestZip);
      return new TextDecoder().decode(await blob.arrayBuffer());
    });
    assert.ok(multilinePptx.includes(`<a:off x="${Math.round(25*pptxUnit)}" y="${Math.round(40*pptxUnit)}"/>`),'multiline PPTX label starts at the top of its bounds');
    assert.ok(multilinePptx.includes(`cy="${Math.round(90*pptxUnit)}"`),'multiline PPTX label keeps enough height for its rows');
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
      document.querySelector('#provider').value='ark';document.querySelector('#key').value='test';
      const select=document.querySelector('#analyzeModel');select.add(new Option('test','gpt-6.1-sol'));select.value='gpt-6.1-sol';
      let calls=0,active=0,peak=0;
      const original=window.fetch;
      window.fetch=async(url,options)=>{
        if(!String(url).endsWith('/chat/completions'))return original(url,options);
        const body=JSON.parse(options.body);if(body.model!=='gpt-6.1-sol')throw Error('Wrong selected vision model: '+body.model);
        const prompt=body.messages[1].content[0].text;calls++;
        let output;
        if(prompt.includes('Diagnose ONLY clearly visible residual')){
          output={complete:false,defects:[0,1,2].map(i=>({x:i*100,y:0,w:90,h:100,reason:'Missing colored square',kind:'shape',objectIds:[]}))};
        }else if(prompt.includes('Return STRICT JSON {"operations"')){
          if(body.messages[1].content.filter(c=>c.type==='image_url').length!==4)throw Error('Detail reconstruction requires crop, context, render and full source');
          active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,20));active--;
          const ownership=JSON.parse(prompt.split(' Ownership: ')[1].split(' Context origin: ')[0]);
          output={operations:[{op:'add',node:{type:'rect',x:ownership.x+30,y:30,w:20,h:20,fill:'#123456',stroke:'none'}}],uncertainties:[]};
        }else output={regions:[0,1,2].map(i=>({id:'r'+i,x:i*100,y:0,w:100,h:100})),nodes:[{id:'panel',type:'rect',x:0,y:0,w:300,h:100,fill:'#ffffff',stroke:'none'}]};
        return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(output)}}]}));
      };
      const canvas=document.createElement('canvas');canvas.width=300;canvas.height=100;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,300,100);
      ctx.fillStyle='#123456';for(let i=0;i<3;i++)ctx.fillRect(i*100+30,30,20,20);
      window.__ffLastGeneratedImage=canvas.toDataURL();localStorage.setItem('test-bitmap',window.__ffLastGeneratedImage);
      const ok=await window.__ffReconstruct();return {ok,calls,peak,nodes:window.__ffExportState.scene?.nodes,audit:window.__ffApiAudit.reconstruction};
    });
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.equal(result.audit.strategy,'compare-first-object-patches');
    assert.ok(result.peak>=2,'deficient semantic regions are completed concurrently');
    assert.equal(result.calls,5);
    assert.equal(result.nodes.filter(n=>n.type==='rect'&&n.fill==='#123456').length,3);
    assert.equal(result.audit.actualPptxRenderVerified,false,'roundtrip XML is not an Office render');
    assert.equal(result.audit.state,'needs-review','actual renderer remains required');
    // Select a distinct image through the real file input and existing rebuild button.
    const generatedSource=await page.evaluate(()=>window.__ffLastGeneratedImage);
    const manualSource=await page.evaluate(async(src)=>{
      const img=new Image();img.src=src;await img.decode();
      const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
      const ctx=c.getContext('2d');ctx.drawImage(img,0,0);ctx.fillStyle='#abcdef';ctx.fillRect(0,0,1,1);
      return c.toDataURL();
    },generatedSource);
    assert.notEqual(manualSource,generatedSource);
    await page.locator('#exportBitmapUpload').setInputFiles({name:'manual.png',mimeType:'image/png',buffer:Buffer.from(manualSource.split(',')[1],'base64')});
    await page.waitForFunction(()=>document.querySelector('#exportInputStatus').textContent.includes('manual.png'));
    assert.equal(await page.evaluate(()=>window.__ffExportState.svg),'','old export is cleared on input change');
    assert.equal(await page.locator('#exportUseGenerated').isVisible(),true);
    assert.equal(await page.evaluate(()=>window.__ffLastGeneratedImage),generatedSource);
    await page.evaluate(()=>{
      window.__testOfficeRenders=0;
      const blank=document.createElement('canvas');blank.width=300;blank.height=100;
      const ctx=blank.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,300,100);
      window.__ffRenderPptx=async()=>++window.__testOfficeRenders===1?blank.toDataURL():window.__ffExportState.bitmap;
    });
    await page.locator('#reconBtn').click();
    await page.waitForFunction(()=>!window.__ffExportState.reconPending && !!window.__ffExportState.svg);
    const office=await page.evaluate(()=>{
      delete window.__ffRenderPptx;
      return {ok:!window.__ffExportState.reconFailed,renders:window.__testOfficeRenders,audit:window.__ffApiAudit.reconstruction};
    });
    assert.equal(await page.evaluate(()=>window.__ffExportState.reconBitmap),manualSource,'reconstruction must use uploaded input');
    assert.equal(office.ok,true);
    assert.equal(office.renders,1,'Office QA must not trigger automatic reconstruction');
    assert.equal(office.audit.actualPptxRenderVerified,true);
    assert.equal(office.audit.officeRetry,undefined);
    assert.equal(office.audit.state,'needs-review');
    for(const format of ['svg','pptx','vsdx','drawio']){
      await page.locator(`#exportActions [data-export="${format}"]`).click();
      const promise=page.waitForEvent('download',{timeout:30000});
      await page.locator('#exportConfirm').click();
      const download=await promise;
      assert.ok(fs.statSync(await download.path()).size>100);
    }
    await page.locator('#exportUseGenerated').click();
    assert.equal(await page.locator('#exportInputPreview').isVisible(),false);
    assert.equal(await page.evaluate(()=>window.__ffExportState.bitmap),generatedSource);
    await page.reload({waitUntil:'domcontentloaded'});
    const cached=await page.evaluate(async(src)=>{
      document.querySelector('#provider').value='ark';document.querySelector('#key').value='test';
      const select=document.querySelector('#analyzeModel');select.add(new Option('test','gpt-6.1-sol'));select.value='gpt-6.1-sol';
      window.__ffLastGeneratedImage=src;
      let calls=0;const original=window.fetch;window.fetch=async(url,options)=>{if(!String(url).endsWith('/chat/completions'))return original(url,options);calls++;throw Error('offline');};
      return {ok:await window.__ffReconstruct(),calls,audit:window.__ffApiAudit.reconstruction};
    },await page.evaluate(()=>localStorage.getItem('test-bitmap')));
    assert.equal(cached.ok,true);assert.equal(cached.audit.cacheHit,true);
    assert.equal(cached.calls,1,'cached scene is compared again; failed diagnosis must not launch blind patches'); assert.ok(cached.audit.diagnosisError);
    const failed=await page.evaluate(async()=>{
      const select=document.querySelector('#analyzeModel');select.add(new Option('different','vision-different'));select.value='vision-different';
      window.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:'{"description":"no objects"}'}}]}),{status:200});
      const ok=await window.__ffReconstruct();
      return {ok,scene:window.__ffExportState.scene,audit:window.__ffApiAudit.reconstruction};
    });
    assert.equal(failed.ok,false,'invalid whole image must not invent tile fallback objects');
    assert.equal(failed.scene,null);
    assert.equal(failed.audit.state,'failed');
    assert.deepEqual(errors,[]);
    console.log('Browser semantic regions, concurrent patches and four exports: OK');
  }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;}).finally(()=>server.close());
