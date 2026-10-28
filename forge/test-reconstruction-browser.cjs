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
          'window.__ffReconstruct = () => runReconstruction();\nwindow.__ffTestRememberRecon = rememberReconResponse; window.__ffTestPersistRecon = persistReconArchive; window.__ffTestRestoreRecon = restoreLatestReconArchive; window.__ffTestParseScene = parseEditableSceneResponse; window.__ffTestRecover = recoverBitmapResponse; window.__ffTestVisible = visibleEditableContent; window.__ffTestLongLines = filterUnsupportedLongLines; window.__ffTestEvidenceRenderer = createEvidenceRenderer; window.__ffTestMaterialize = materializeEditableScene; window.__ffTestCalibrate = calibrateEditableText; window.__ffTestGenerateBitmap = genOaiImage; window.__ffTestZip = zipStore; window.__ffTestRequestScene = requestEditableScene; window.__ffTestParseSvg = parseSvgScene; window.__ffTestParseBitmap = parseBitmapSvgScene; window.__ffTestDrawio = sceneToDrawio; window.__ffTestVsdx = sceneToVsdxFiles; window.__ffTestPptx = buildNativePptx; window.__ffTestSvgString = sceneToSvgString;')
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
    const dashedShapes=await page.evaluate(async()=>{
      const raw={nodes:[
        {id:'curve',type:'path',d:'M 10 10 Q 40 60 80 10',x:10,y:10,w:70,h:50,stroke:'#dd6600',dash:true},
        {id:'ring',type:'ellipse',x:10,y:70,w:40,h:20,stroke:'#334455',dashed:true},
        {id:'poly',type:'polyline',points:[[60,70],[80,90],[90,70]],stroke:'#334455',strokeDasharray:'8 6'}
      ]};
      const scene=window.__ffTestMaterialize(raw,100,100);
      return {nodes:scene.nodes,svg:window.__ffTestSvgString(scene),pptx:new TextDecoder().decode(await (await window.__ffTestPptx(scene,window.__ffTestZip)).arrayBuffer())};
    });
    assert.ok(dashedShapes.nodes.every(n=>n.dash),'dashed curves, ellipses and polylines retain their stroke during scene normalization');
    assert.equal((dashedShapes.svg.match(/stroke-dasharray=/g)||[]).length,3);
    assert.equal((dashedShapes.pptx.match(/<a:prstDash val="dash"\/>/g)||[]).length,2,'boolean dash strokes retain PowerPoint preset dashes');
    assert.equal((dashedShapes.pptx.match(/<a:custDash>/g)||[]).length,1,'explicit dash lengths retain a PowerPoint custom dash pattern');
    const evidenceRenderer=await page.evaluate(async()=>{
      const canvas=document.createElement('canvas');canvas.width=80;canvas.height=40;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,80,40);
      const png=canvas.toDataURL();let calls=0,measured;
      window.__ffRenderPptx=async()=>{calls++;return png;};
      const audit={},renderer=window.__ffTestEvidenceRenderer(canvas,audit,async(c,s)=>{measured=s;return {score:1};});
      const scene={canvas:{width:80,height:40},nodes:[]};
      await renderer.measure(canvas,scene);const crop=await renderer.renderCrop(scene,{x:10,y:5,w:20,h:10});
      const image=new Image();image.src=crop;await image.decode();const out=document.createElement('canvas');out.width=20;out.height=10;out.getContext('2d').drawImage(image,0,0);
      const pixel=Array.from(out.getContext('2d').getImageData(0,0,1,1).data);
      await renderer.measure(canvas,{...scene,nodes:[]});const successfulCalls=calls;
      canvas.width=1;canvas.height=1;window.__ffRenderPptx=async()=>canvas.toDataURL();
      const original=document.createElement('canvas');original.width=80;original.height=40;
      let error='';try{await window.__ffTestEvidenceRenderer(original,{}).measure(original,scene);}catch(e){error=e.message;}
      delete window.__ffRenderPptx;
      return {source:audit.evidenceRenderSource,usesPng:measured===png,pixel,successfulCalls,error};
    });
    assert.equal(evidenceRenderer.source,'host-office');
    assert.equal(evidenceRenderer.usesPng,true,'evidence metrics receive actual exported PowerPoint pixels');
    assert.deepEqual(evidenceRenderer.pixel,[255,0,0,255],'repair crop uses host render rather than the blank SVG scene');
    assert.equal(evidenceRenderer.successfulCalls,2,'reuse one Office render per immutable candidate; render changed candidates separately');
    assert.match(evidenceRenderer.error,/dimensions mismatch/,'invalid Office output must not silently fall back to SVG evidence');
    const numericRecovery=await page.evaluate(()=>window.__ffTestParseScene('{"nodes":[{"id":"card1","type":"rect","x":10,"y":10,"w":121,","h":99,"fill":"#fff"},{"id":"card2","type":"rect","x":30,"y":30,"w":121","h":99,"fill":"#fff"},{"id":"invalid","type":"unsupported"}]}',300,200));
    assert.deepEqual(numericRecovery.nodes.map(n=>n.id),['card1','card2'],'both real numeric-quote failures retain their complete objects');
    assert.equal(numericRecovery.recognitionCounts.parsed,2);
    assert.equal(numericRecovery.recognitionCounts.rejected,1,'recognition audit exposes rejected objects instead of hiding a count difference');
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
    assert.equal(svgCheck.bitmapLabel.fontSize,25,'bitmap fallback preserves the computed class font size');
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

    const fontMapping=await page.evaluate(async()=>{
      const families=['serif','sans-serif',' SERIF ','Times New Roman, serif','Georgia, serif'];
      const scene={canvas:{width:500,height:300},nodes:families.map((fontFamily,i)=>({id:'font'+i,type:'text',x:10,y:i*40,w:300,h:35,text:'Font '+i,fontSize:30,fontFamily}))};
      return new TextDecoder().decode(await (await window.__ffTestPptx(scene,window.__ffTestZip)).arrayBuffer());
    });
    assert.ok(!/typeface="(?:serif|sans-serif)"/i.test(fontMapping),'CSS generic families must resolve to installed PowerPoint fonts');
    assert.ok((fontMapping.match(/typeface="Times New Roman"/g)||[]).length>=3,'serif and concrete family stacks retain their intended face');
    assert.match(fontMapping,/typeface="Arial"/,'sans-serif maps to Arial');
    assert.match(fontMapping,/typeface="Georgia"/,'concrete families survive');
    const tightGlyph=await page.evaluate(()=>window.__ffTestMaterialize({nodes:[{type:'text',x:100,y:100,w:20,h:12,text:'Wide label',fontSize:30}]},600,400).nodes[0]);
    assert.equal(tightGlyph.fontSize,30,'tight glyph bounds must not silently shrink model font size');
    const nativeHeading=await page.evaluate(()=>window.__ffTestMaterialize({nodes:[{type:'text',x:100,y:100,w:4000,h:240,text:'Native resolution heading',fontSize:180}]},5504,3072).nodes[0]);
    assert.equal(nativeHeading.fontSize,180,'native-resolution headings must not be capped at 120 pixels');
    const textFit=await page.evaluate(async()=>{
      const node={type:'text',x:10,y:10,w:105,h:35,text:'ABCDEFGHIJ',fontSize:20,fontFamily:'Arial'};
      const scene={canvas:{width:500,height:300},nodes:[node]};
      const svg=window.__ffTestSvgString(scene),originalSvg=window.__ffTestSvgString({...scene,svgSource:true});
      const parse=s=>Number(new DOMParser().parseFromString(s,'image/svg+xml').querySelector('text').getAttribute('font-size'));
      const fitted=parse(svg),native=new TextDecoder().decode(await (await window.__ffTestPptx(scene,window.__ffTestZip)).arrayBuffer());
      return {fitted,sourceSize:parse(originalSvg),native,unchanged:node.fontSize===20};
    });
    assert.ok(textFit.fitted>=17&&textFit.fitted<20,'bitmap preview applies the bounded native-export text fit');
    assert.equal(textFit.sourceSize,20,'SVG source keeps its recognized font size');
    assert.equal(textFit.unchanged,true,'rendering never mutates recognized geometry');
    assert.ok(textFit.native.includes(`sz="${Math.max(100,Math.round(textFit.fitted*pptxUnit/914400*72*100))}"`),'PPTX and bitmap preview use the same fitted font size');

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
      const select=document.querySelector('#reconModel');
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

    const wholeContract=await page.evaluate(async()=>{
      document.querySelector('#provider').value='ark';document.querySelector('#key').value='test';
      const select=document.querySelector('#reconModel');select.add(new Option('test','gpt-6.1-sol'));select.value='gpt-6.1-sol';
      const c=document.createElement('canvas');c.width=5504;c.height=3072;const src=c.toDataURL();
      const nodes=Array.from({length:520},(_,i)=>({id:'n'+i,sourceItemId:'inventory-'+i,type:'rect',x:(i%40)*100,y:Math.floor(i/40)*100,w:20,h:20,fill:'#123456'}));
      let calls=0,mode='ok';const bodies=[],original=window.fetch;
      window.fetch=async(url,options)=>{
        if(!String(url).endsWith('/chat/completions'))return original(url,options);
        calls++;bodies.push(JSON.parse(options.body));
        if(mode==='rejected')return new Response('unsupported detail original',{status:400});
        return new Response(JSON.stringify({model:'gpt-6.1-sol',usage:{completion_tokens:65000},choices:[{finish_reason:mode==='truncated'?'length':'stop',message:{content:JSON.stringify({nodes})}}]}));
      };
      const runs=[];
      try{
        for(const effort of ['high','medium']){
          document.querySelector('#reconReasoningEffort').value=effort;
          const audit={wholeImage:true,maxAttempts:1,...(effort==='medium'?{regionalRecognition:true,region:'native-test',sourceRegion:{x:12,y:34,w:5504,h:3072},fullSourceImage:src,fullSourceWidth:6000,fullSourceHeight:4000,sharedObjectContext:[{id:'cross-panel',kind:'connector',x:0,y:200,w:6000,h:20}]}:{})};const scene=await window.__ffTestRequestScene(src,5504,3072,audit);
          runs.push({audit,count:scene.nodes.length,sourceItems:scene.nodes.map(n=>n.sourceItemId)});
        }
        const failures=[];
        for(const failure of ['rejected','truncated']){
          mode=failure;const audit={wholeImage:true,maxAttempts:1};let error='';
          try{await window.__ffTestRequestScene(src,5504,3072,audit);}catch(e){error=e.message;}
          failures.push({audit,error});
        }
        return {runs,failures,calls,bodies:bodies.map(b=>({budget:b.max_completion_tokens,legacy:b.max_tokens,effort:b.reasoning_effort,prompt:b.messages[1].content[0].text,images:b.messages[1].content.filter(c=>c.type==='image_url').map(c=>({detail:c.image_url.detail,unchanged:c.image_url.url===src}))}))};
      }finally{window.fetch=original;}
    });
    assert.equal(wholeContract.calls,4,'unsupported and truncated responses must not silently downgrade/retry');
    for(const run of wholeContract.runs){assert.equal(run.count,520);assert.deepEqual(run.sourceItems,Array.from({length:520},(_,i)=>'inventory-'+i));assert.equal(run.audit.nodeCounts.raw,520);assert.equal(run.audit.nodeCounts.parsed,520);assert.equal(run.audit.usage.completion_tokens,65000);}
    for(const [bodyIndex,body] of wholeContract.bodies.entries()){assert.equal(body.budget,128000);assert.equal(body.legacy,undefined);assert.match(body.prompt,/visibly rounded rectangle include a nonzero radius/);
    assert.match(body.prompt,/generic serif or sans-serif family instead of guessing/);
    assert.match(body.prompt,/never split a word or label into several text nodes/);assert.match(body.prompt,/clipping\/overlap/);assert.match(body.prompt,/sourceItemId is replacement lineage/);assert.match(body.prompt,/COMPOSITION REFERENCES/);
    const regional=bodyIndex===1;
    assert.deepEqual(body.images,regional?[{detail:'original',unchanged:true},{detail:'original',unchanged:true},{detail:'high',unchanged:false},{detail:'high',unchanged:false}]:[{detail:'original',unchanged:true},{detail:'high',unchanged:false}]);
    if(regional){assert.match(body.prompt,/Image 2 is the complete original/);assert.match(body.prompt,/cross-panel/);assert.match(body.prompt,/never rescale from Image 2/);
      assert.doesNotMatch(body.prompt,/WHOLE IMAGE object catalog|COMPLETE object catalog|FULL supplied canvas/,'crop requests must not inherit whole-image ownership');
      assert.match(body.prompt,/Complete every visible equation/);assert.match(body.prompt,/numerator, denominator and fraction bar/);
      assert.ok(body.prompt.length<wholeContract.bodies[0].prompt.length,'regional instructions should remove redundant global instructions');}}
    assert.deepEqual(wholeContract.bodies.slice(0,2).map(b=>b.effort),['high','medium']);
    assert.equal(wholeContract.failures[0].audit.parameterSupport,'rejected');
    assert.ok(wholeContract.failures.every(f=>f.error));
    assert.equal(wholeContract.failures[1].audit.usage.completion_tokens,65000);
    console.log('PASS: whole-image 128000/original native input, high/medium, 520-node parsing, usage and explicit rejection/truncation');
    const retained=await page.evaluate(async()=>{
      const records=window.__ffReconResponses;
      const summary=records.map(r=>({envelope:r.envelope,parsed:r.parsed?.nodes.length,error:r.error,region:r.region,sourceRegion:r.sourceRegion,regionalRecognition:r.regionalRecognition}));
      const text='完整文字'.repeat(100);
      const scene=window.__ffTestParseScene(JSON.stringify({nodes:[{id:'same',type:'rect',x:1,y:1,w:10,h:10}],texts:[{id:'same',x:20,y:20,w:200,h:100,text}],labels:[{id:'third',x:20,y:130,w:200,h:30,text:'parallel label'}]}),600,300);
      for(let i=0;i<14;i++)await window.__ffTestRememberRecon({stage:'test',content:'retained-'+i,envelope:'raw-'+i});
      await window.__ffTestPersistRecon({scene,status:'test-complete'});
      return {summary,nodes:scene.nodes,ids:scene.nodes.map(n=>n.id),count:window.__ffReconResponses.length};
    });
    assert.equal(retained.summary.length,4);
    assert.equal(retained.summary[0].parsed,520);
    assert.equal(retained.summary[1].parsed,520);
    assert.equal(retained.summary[1].region,'native-test');
    assert.deepEqual(retained.summary[1].sourceRegion,{x:12,y:34,w:5504,h:3072});
    assert.equal(retained.summary[1].regionalRecognition,true);
    assert.match(retained.summary[2].envelope,/unsupported detail original/);
    assert.ok(retained.summary[2].error);
    assert.match(retained.summary[3].envelope,/length/);
    assert.ok(retained.summary[3].error);
    assert.equal(retained.nodes.length,3);
    assert.equal(new Set(retained.ids).size,3);
    assert.equal(retained.nodes.find(n=>n.text?.startsWith('完整')).text.length,400);
    await page.reload({waitUntil:'domcontentloaded'});
    const restored=await page.evaluate(async()=>{
      await window.__ffTestRestoreRecon();
      const a=window.__ffLatestReconArchive;
      return {count:a?.responses.length,last:a?.responses.at(-1).envelope,nodes:a?.scene.nodes.length,status:a?.status};
    });
    assert.equal(restored.count,retained.count);
    assert.equal(restored.last,'raw-13');assert.equal(restored.nodes,3);assert.equal(restored.status,'test-complete');
    console.log('PASS: parallel fields, duplicate IDs, full long text and raw/error/parsed evidence retained across reload without 12-response clipping');

    const result=await page.evaluate(async()=>{
      document.querySelector('#provider').value='ark';document.querySelector('#key').value='test';
      const select=document.querySelector('#reconModel');select.add(new Option('test','gpt-6.1-sol'));select.value='gpt-6.1-sol';
      let calls=0,active=0,peak=0,qa=0;
      const items=[0,1,2].map(i=>({id:'i'+i,kind:'shape',description:'Colored square '+i,x:i*100+30,y:30,w:20,h:20,text:null,expectedCount:null,colors:[{role:'fill',value:'#123456'}]}));
      const original=window.fetch;
      window.fetch=async(url,options)=>{
        if(!String(url).endsWith('/chat/completions'))return original(url,options);
        const body=JSON.parse(options.body);if(body.model!=='gpt-6.1-sol')throw Error('Wrong selected vision model: '+body.model);
        const prompt=body.messages[1].content[0].text;calls++;
        let output;
        if(prompt.startsWith('Inspect ONLY the original')){
          qa=0;output={canvas:{width:300,height:100,units:'source-pixels'},items,layers:[],connections:[],uncertainties:[]};
        }else if(prompt.includes('This is ONE native-resolution ORIGINAL region')){
          // Deliberately incomplete regional output keeps this fixture testing
          // the one repair round, while exercising open-kind dispatch as well.
          output={nodes:[{id:'blank',type:'rect',x:0,y:0,w:1,h:1,fill:'#ffffff',stroke:'none'}]};
        }else if(prompt.includes('INDEPENDENT WHOLE-IMAGE ACCEPTANCE GATE')){
          if(!prompt.includes('Return ONE STRICT JSON object with ALL fields:'))throw Error('Whole assessment must request a complete evidence schema');
          if(prompt.includes('Return STRICT JSON {"complete":true,"defects":[]}'))throw Error('Two-field local schema must not override whole assessment evidence');
          const passed=++qa>1;
          const catalog=JSON.parse(prompt.split(' Existing catalog: ')[1]);
          output={wholeImageAcceptable:passed,summary:passed?'All squares match':'Missing squares',coverage:[{region:'all',missingGroups:passed?[]:['squares']}],complete:passed,inventoryComplete:true,unlistedSourceItems:[],uncertainties:[],evidence:items.map(item=>({itemId:item.id,status:passed?'passed':'failed',nodeIds:passed?[catalog.nodes.find(n=>n.fill==='#123456'&&Math.abs(n.x-item.x)<1).id]:[],reason:'Compared original and rendered squares'})),defects:passed?[]:[{x:25,y:25,w:230,h:30,reason:'Missing colored squares',kind:'shape',objectIds:[]}]};
        }else if(prompt.includes('Diagnose ONLY clearly visible residual')){
          output={complete:true,defects:[]};
        }else if(prompt.includes('Return STRICT JSON {"operations"')){
          if(body.messages[1].content.filter(c=>c.type==='image_url').length!==4)throw Error('Detail reconstruction requires crop, context, render and full source');
          active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,20));active--;
          const region=JSON.parse(prompt.split(' sourceRegion: ')[1].split(' defects: ')[0]);
          output={operations:items.map(item=>({op:'add',node:{type:'rect',x:item.x-region.x,y:item.y-region.y,w:20,h:20,fill:'#123456',stroke:'none'}})),uncertainties:[]};
        }else output={regions:[0,1,2].map(i=>({id:'r'+i,x:i*100,y:0,w:100,h:100})),nodes:[{id:'panel',type:'rect',x:0,y:0,w:300,h:100,fill:'#ffffff',stroke:'none'}]};
        return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(output)}}]}));
      };
      const canvas=document.createElement('canvas');canvas.width=300;canvas.height=100;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,300,100);
      ctx.fillStyle='#123456';for(let i=0;i<3;i++)ctx.fillRect(i*100+30,30,20,20);
      window.__ffLastGeneratedImage=canvas.toDataURL();localStorage.setItem('test-bitmap',window.__ffLastGeneratedImage);
      const ok=await window.__ffReconstruct();return {ok,calls,peak,nodes:window.__ffExportState.scene?.nodes,audit:window.__ffApiAudit.reconstruction};
    });
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.equal(result.audit.strategy,'source-inventory-native-regions-one-repair-round');
    assert.equal(result.peak,1,'the fixed repair round never retries or restarts');
    assert.equal(result.calls,15,'inventory, global reconstruction, three native regions, two whole QA with three regional checks each, one patch and repair QA');
    assert.equal(result.audit.nativeRecognition.results.filter(r=>r.state==='merged').length,3);
    assert.equal(result.audit.repairRounds,1);
    assert.equal(result.audit.finalValidation.state,'passed',JSON.stringify({validation:result.audit.finalValidation,regions:result.audit.regionStates}));
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
      window.__testNormalFetch=window.fetch;
      window.fetch=async(url,options)=>{
        const response=await window.__testNormalFetch(url,options);
        if(!String(url).endsWith('/chat/completions'))return response;
        const prompt=JSON.parse(options.body).messages[1].content[0].text;
        const isInventory=prompt.startsWith('Inspect ONLY the original');
        const isAssessment=prompt.includes('INDEPENDENT WHOLE-IMAGE ACCEPTANCE GATE');
        if(!isInventory&&!isAssessment)return response;
        const body=await response.json(),output=JSON.parse(body.choices[0].message.content);
        if(isInventory)output.items.push({id:'broken',description:'Invalid model item',x:-100});
        else {delete output.coverage;delete output.evidence;}
        body.choices[0].message.content=JSON.stringify(output);
        return new Response(JSON.stringify(body));
      };
      const blank=document.createElement('canvas');blank.width=300;blank.height=100;
      const ctx=blank.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,300,100);
      window.__ffRenderPptx=async()=>++window.__testOfficeRenders===1?blank.toDataURL():window.__ffExportState.bitmap;
    });
    await page.locator('#reconBtn').click();
    await page.waitForFunction(()=>!window.__ffExportState.reconPending && !!window.__ffExportState.svg);
    const office=await page.evaluate(()=>{
      delete window.__ffRenderPptx;
      window.fetch=window.__testNormalFetch;
      return {ok:!window.__ffExportState.reconFailed,renders:window.__testOfficeRenders,audit:window.__ffApiAudit.reconstruction};
    });
    assert.equal(await page.evaluate(()=>window.__ffExportState.reconBitmap),manualSource,'reconstruction must use uploaded input');
    assert.equal(office.ok,true);
    assert.equal(office.renders,3,'render initial evidence, repair candidate and final export without restarting recognition');
    assert.equal(office.audit.evidenceRenderSource,'host-office');
    assert.equal(office.audit.actualPptxRenderVerified,true);
    assert.equal(office.audit.officeRetry,undefined);
    assert.equal(office.audit.state,'needs-review');
    assert.equal(office.audit.repairRounds,1,'malformed inventory still allows the single repair round');
    assert.equal(office.audit.finalValidation.state,'failed','discarded inventory evidence cannot become a formal pass');
    for(const format of ['svg','pptx','vsdx','drawio']){
      await page.locator(`#exportActions [data-export="${format}"]`).click();
      const promise=page.waitForEvent('download',{timeout:30000});
      await page.locator('#exportConfirm').click();
      const download=await promise;
      assert.equal(download.suggestedFilename(),'figure-forge-draft-unverified.'+format);
      assert.ok(fs.statSync(await download.path()).size>100);
    }
    // A faithful host render plus complete evidence promotes the result to formal.
    const formal=await page.evaluate(async()=>{
      const blank=document.createElement('canvas');blank.width=300;blank.height=100;
      const ctx=blank.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,300,100);
      let renders=0;
      // The initial catalog contains only a frame. The host must show that
      // missing content before it shows the repaired, faithful candidate.
      window.__ffRenderPptx=async()=>++renders===1?blank.toDataURL():window.__ffExportState.bitmap;
      const ok=await window.__ffReconstruct();
      delete window.__ffRenderPptx;
      return {ok,audit:window.__ffApiAudit.reconstruction,qualityState:window.__ffExportState.recon?.qualityState,error:window.__ffExportState.reconError};
    });
    assert.equal(formal.ok,true,JSON.stringify(formal));
    assert.equal(formal.audit.finalValidation.state,'passed');
    assert.equal(formal.audit.state,'succeeded',JSON.stringify(formal.audit));
    assert.equal(formal.qualityState,'succeeded');
    await page.locator('#exportActions [data-export="svg"]').click();
    const formalDownload=page.waitForEvent('download',{timeout:30000});
    await page.locator('#exportConfirm').click();
    assert.equal((await formalDownload).suggestedFilename(),'figure-forge-editable.svg');
    await page.locator('#exportUseGenerated').click();
    assert.equal(await page.locator('#exportInputPreview').isVisible(),false);
    assert.equal(await page.evaluate(()=>window.__ffExportState.bitmap),generatedSource);
    await page.reload({waitUntil:'domcontentloaded'});
    const cached=await page.evaluate(async(src)=>{
      document.querySelector('#provider').value='ark';document.querySelector('#key').value='test';
      const select=document.querySelector('#reconModel');select.add(new Option('test','gpt-6.1-sol'));select.value='gpt-6.1-sol';
      window.__ffLastGeneratedImage=src;
      let calls=0;const original=window.fetch;window.fetch=async(url,options)=>{if(!String(url).endsWith('/chat/completions'))return original(url,options);calls++;throw Error('offline');};
      return {ok:await window.__ffReconstruct(),calls,audit:window.__ffApiAudit.reconstruction};
    },await page.evaluate(()=>localStorage.getItem('test-bitmap')));
    assert.equal(cached.ok,false);assert.equal(cached.audit.cacheBypassed,true);
    assert.equal(cached.calls,2,'inventory failure still attempts a fresh whole-image request, bypassing cached scene');
    const failed=await page.evaluate(async()=>{
      const select=document.querySelector('#reconModel');select.add(new Option('different','vision-different'));select.value='vision-different';
      window.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:'{"description":"no objects"}'}}]}),{status:200});
      const ok=await window.__ffReconstruct();
      return {ok,scene:window.__ffExportState.scene,audit:window.__ffApiAudit.reconstruction};
    });
    assert.equal(failed.ok,false,'invalid whole image must not invent tile fallback objects');
    assert.equal(failed.scene,null);
    assert.equal(failed.audit.state,'failed');
    const blank=await page.evaluate(async()=>{
      let calls=0;
      window.fetch=async()=>{calls++;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(calls===1?{items:[],layers:[],connections:[],uncertainties:[]}:calls===2?{nodes:[{id:'transparent',type:'rect',x:0,y:0,w:80,h:40,fill:'none',stroke:'none'}]}:{complete:false,defects:[],uncertainties:[]})}}]}));};
      return {ok:await window.__ffReconstruct(),calls,scene:window.__ffExportState.scene,status:document.querySelector('#reconStatus').textContent};
    });
    assert.equal(blank.ok,false);assert.equal(blank.scene,null);assert.match(blank.status,/未生成可用内容/);
    const mixedPatch=await page.evaluate(async()=>{
      window.fetch=async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({operations:[{op:'add',nodes:[{id:'valid',type:'text',x:1,y:1,w:30,h:20,text:'kept',fill:'#000000'},{id:'bad',type:'unsupported'}]}],uncertainties:[]})}}]}));
      const c=document.createElement('canvas');c.width=80;c.height=40;
      const patch=await window.__ffTestRequestScene(c.toDataURL(),80,40,{regionPatch:true,maxAttempts:1,detailCatalog:{nodes:[]},diagnosedIds:[]});
      return {nodes:patch.operations[0]?.nodes.map(n=>n.id),rejected:patch.recovery.rejected.length};
    });
    assert.deepEqual(mixedPatch.nodes,['valid']);assert.equal(mixedPatch.rejected,1);
    const truncatedDiagnosis=await page.evaluate(async()=>{
      const content='{"complete":false,"defects":[{"x":2,"y":3,"w":10,"h":8,"reason":"missing label","objectIds":[]},{"x":';
      window.fetch=async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content}}],usage:{completion_tokens:8000}}));
      const c=document.createElement('canvas');c.width=80;c.height=40;
      const audit={defectDiagnosis:true,maxAttempts:1,catalog:{nodes:[]}};
      const result=await window.__ffTestRequestScene(c.toDataURL(),80,40,audit);
      return {result,truncated:audit.outputTruncated};
    });
    assert.equal(truncatedDiagnosis.truncated,true);
    assert.equal(truncatedDiagnosis.result.defects.length,1);
    assert.equal(truncatedDiagnosis.result.complete,false);
    assert.ok(truncatedDiagnosis.result.uncertainties.length);
    if(process.env.FF_REPLAY_RESPONSE){
      const responses=JSON.parse(fs.readFileSync(process.env.FF_REPLAY_RESPONSE,'utf8')).responses.map(r=>r.content);
      const replay=await page.evaluate(async ({responses,template})=>{
        const inventory=window.__ffTestRecover(responses[0],'inventory');
        const source=document.createElement('canvas');source.width=5504;source.height=3072;
        document.querySelector('#provider').value='ark';document.querySelector('#key').value='test';
        window.fetch=async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:responses[1]}}]}));
        const scene=await window.__ffTestRequestScene(source.toDataURL(),5504,3072,{wholeImage:true,maxAttempts:1});
        window.fetch=async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:responses[2]}}]}));
        const patch=await window.__ffTestRequestScene(source.toDataURL(),5504,3072,{regionPatch:true,maxAttempts:1,detailCatalog:{nodes:[]},diagnosedIds:[]});
        const svg=window.__ffTestSvgString(scene);
        const image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);});
        const c=document.createElement('canvas');c.width=5504;c.height=3072;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);
        const pixels=ctx.getImageData(0,0,c.width,c.height).data;let ink=0;
        for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>0&&Math.min(...pixels.slice(i,i+3))<230)ink++;
        window.fetch=async()=>new Response(JSON.stringify(template));
        const blob=await window.__ffTestPptx(scene,window.__ffTestZip);
        return {inventory:inventory.items.length,nodes:scene.nodes.length,text:scene.nodes.filter(n=>n.type==='text').length,visible:window.__ffTestVisible(scene).length,operations:patch.operations.length,rejected:scene.recovery.rejected,ink,pptxBytes:blob.size};
      },{responses,template:JSON.parse(fs.readFileSync(path.join(root,'forge/pptx-template.json'),'utf8'))});
      assert.equal(replay.inventory,114);assert.equal(replay.nodes,233);assert.equal(replay.operations,141);
      assert.ok(replay.text>50);assert.ok(replay.visible>150);assert.ok(replay.ink>100000);assert.ok(replay.pptxBytes>20000);
      assert.equal(replay.rejected.length,4);console.log('Actual raw response replay:',JSON.stringify(replay));
    }
    assert.deepEqual(errors,[]);
    console.log('Browser inventory, one repair round, draft state and four exports: OK');
  }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;}).finally(()=>server.close());
