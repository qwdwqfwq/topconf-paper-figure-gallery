// Scoped browser regression for the authorized patch. No provider requests.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {chromium}=require(process.env.REVISION_PLAYWRIGHT||'C:/Users/黎枭/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const before=execFileSync('git',['show','878022a63a36d1ce11aad3a62e41f3fc3b4a3842:forge/revision-local.mjs'],{cwd:root}).toString();
 const after=fs.readFileSync(path.join(root,'forge/revision-local.mjs'),'utf8');
 const browser=await chromium.launch({headless:true,...(process.env.REVISION_BUNDLED_BROWSER==='1'?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'})});
 try{
  const page=await browser.newPage();
  const report=await page.evaluate(async({before,after})=>{
   const mod=async text=>import(URL.createObjectURL(new Blob([text],{type:'text/javascript'})));
   const old=await mod(before),fixed=await mod(after);
   const make=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
   const load=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});
   const pixels=async src=>{const i=await load(src),c=make(i.width,i.height);c.getContext('2d').drawImage(i,0,0);return c.getContext('2d').getImageData(0,0,c.width,c.height).data;};
   const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
   const source=make(640,400),x=source.getContext('2d');x.fillStyle='#eaf2fb';x.fillRect(0,0,640,400);x.fillStyle='#3479ba';x.fillRect(20,100,580,220);
   const original=await load(source.toDataURL());
   const cases=[[{x:20,y:130,width:180,height:100}],[{x:0,y:0,width:40,height:35}],[{x:600,y:370,width:40,height:30}],[{x:30,y:40,width:90,height:80},{x:480,y:290,width:120,height:70}]];
   let count=0,inside=0;
   for(const regions of cases)for(const native of [false,true]){
    const a=old.prepareLocalEdit(original,regions,native),b=fixed.prepareLocalEdit(original,regions,native);
    if(a.image!==b.image||a.target!==b.target||JSON.stringify(a.crop)!==JSON.stringify(b.crop)||JSON.stringify(a.regions)!==JSON.stringify(b.regions)||a.ratio!==b.ratio)throw Error('Target, framing or coordinates changed');
    const clean=await pixels(b.image),guide=await pixels(b.guide),tinted=await pixels(a.guide);
    if(!equal(clean,guide)||equal(clean,tinted))throw Error('Clean guide pixel invariant');
    const edited=make(b.crop.width,b.crop.height),e=edited.getContext('2d');e.drawImage(await load(b.guide),0,0);e.fillStyle='#114422';e.fillRect(0,0,edited.width,edited.height);
    const result=await fixed.compositeLocalEdit(original,edited,regions,b.crop,load);
    if(result.width!==640||result.height!==400||result.changedOutside!==0||result.changedInside===0)throw Error('Composition invariant');
    const originalPixels=await pixels(original.src),outputPixels=await pixels(result.image);
    for(let y=0;y<400;y++)for(let x=0;x<640;x++)if(!regions.some(r=>x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height)){
     const i=(y*640+x)*4;for(let k=0;k<4;k++)if(originalPixels[i+k]!==outputPixels[i+k])throw Error('Decoded outside pixel changed');
    }
    let rejected=false;try{await fixed.compositeLocalEdit(original,await load(b.guide),regions,b.crop,load);}catch(error){rejected=error.message.includes('没有像素变化');}
    if(!rejected)throw Error('Unchanged response must remain rejected');
    inside+=result.changedInside;count++;
   }
   return {cases:count,cleanReferencePixelDifferences:0,changedOutside:0,changedInside:inside,targetAndCoordinatesUnchanged:true,noOpGuardPreserved:true,liveAPICalls:0};
  },{before,after});
  assert.equal(report.cases,8);console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
