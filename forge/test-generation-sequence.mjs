import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';

test('SVG then bitmap keeps selected references and passes fresh two-stage analysis to both outputs',async()=>{
  const source=readFileSync(new URL('./index.html',import.meta.url),'utf8');
  const handler=source.slice(source.indexOf("$('#genBtn').onclick = async ()=>{"),
    source.indexOf('\nasync function genOaiSVG('));
  const nodes=new Map();
  const $=selector=>{
    if(!nodes.has(selector)) nodes.set(selector,{value:'',style:{},hidden:false});
    return nodes.get(selector);
  };
  for(const [id,value] of Object.entries({paper:'paper content',provider:'infistar',key:'test-key',
    target:'basic',model:'svg-model',figureRatio:'16:9',imageResolution:'4K'})) $('#'+id).value=value;
  const refs=new Set(['a','b','c','d','e','f','g','h','i']);
  const calls=[];
  let analyses=0;
  const analysis={repIds:['a','b','c','d'],imageRefIds:['b','c','d'],
    refinedPrompt:'SVG guide',refinedPromptImage:'bitmap guide'};
  const context={$ ,refs,mode:'svg',passMode:'two',
    cfg:()=>({proto:'openai'}),cleanKey:s=>s,baseURL:()=> 'https://example.invalid',
    relayBase:()=>'',kindOf:()=> 'image',usesInfistarGemini:()=>true,imageRequestDimensions:()=>{},
    selectImageRoute:()=>{},tt:s=>s,setStep:()=>{},showErr:msg=>assert.fail(msg),
    analyzeReferences:async()=>{analyses++;return analysis;},
    genOaiSVG:async(...args)=>calls.push(['svg',...args]),
    genOaiImage:async(...args)=>calls.push(['image',...args])};
  runInNewContext(handler,context);
  await $('#genBtn').onclick();
  context.mode='image';$('#model').value='gemini-3.1-flash-image';
  await $('#genBtn').onclick();
  assert.equal(analyses,2);
  assert.deepEqual([...refs],['a','b','c','d','e','f','g','h','i']);
  assert.deepEqual(calls.map(c=>[c[0],Array.from(c[6]),c[7]]),[
    ['svg',['a','b','c','d'],'SVG guide'],
    ['image',['b','c','d'],'bitmap guide']
  ]);
  assert.deepEqual(analysis.imageRefIds,['b','c','d']);
  assert.equal($('#genBtn').disabled,false);
});
