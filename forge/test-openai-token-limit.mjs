import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import {requestChat} from './chat-api.mjs';

const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const normalization=html.slice(html.indexOf('function normalizeChatTokenLimit('),html.indexOf('for(const [id,key] of',html.indexOf('function withReasoning(')));
const transport=html.slice(html.indexOf('function postJSON('),html.indexOf('function fetchWithTimeout('));
const generation=html.slice(html.indexOf('async function genOaiSVG('),html.indexOf('async function genAnthropicSVG('));
function fixture(effort='',dependencies={}){
  const context=vm.createContext({reasoningEffort:()=>effort,...dependencies});
  vm.runInContext(normalization+transport+generation,context);
  return context;
}
const plain=value=>JSON.parse(JSON.stringify(value));

test('default and selected reasoning normalize OpenAI limits without mutating prompts or input',()=>{
  for(const model of ['gpt-5','gpt-4o','gpt-6-astra','o1','o3-mini','o4-mini','chatgpt-4o-latest']){
    for(const effort of ['','medium','high','xhigh']){
      const context=fixture(effort);
      const body={model,max_tokens:8192,temperature:0.3,top_p:0.8,thinking:{type:'disabled'},messages:[{role:'user',content:'original image/prompt'}]};
      const before=structuredClone(body);
      for(const scope of ['parse','visual','recon']){
        const result=context.withReasoning(body,scope);
        assert.equal(result.max_completion_tokens,8192);
        assert.equal(Object.hasOwn(result,'max_tokens'),false);
        assert.deepEqual(plain(result.messages),body.messages);
        assert.equal(result.reasoning_effort,effort||undefined);
        assert.equal(result.temperature,effort?undefined:0.3);
      }
      assert.deepEqual(body,before);
    }
  }
});

test('preserve explicit modern limits, native Anthropic, Responses and other providers',()=>{
  const context=fixture();
  const body={model:'gpt-5',max_tokens:5000,max_completion_tokens:12000};
  assert.deepEqual(plain(context.normalizeChatTokenLimit(body)),{model:'gpt-5',max_completion_tokens:12000});
  for(const unchanged of [
    {model:'claude-sonnet',system:'native',max_tokens:5000},
    {model:'gpt-5',system:'native',max_tokens:5000},
    {model:'gpt-5',input:'Responses input',max_output_tokens:5000},
    {model:'deepseek-chat',max_tokens:5000},
    {model:'gemini-2.5-pro',max_tokens:5000},
    {model:'gpt-5',messages:[]}
  ]) assert.equal(context.normalizeChatTokenLimit(unchanged),unchanged);
  const reasoning=fixture('high');
  assert.throws(()=>reasoning.withReasoning({model:'claude',system:'native',max_tokens:5000},'parse'),/Anthropic/);
  const responses=reasoning.withReasoning({model:'gpt-5',input:'paper',max_output_tokens:5000},'parse');
  assert.deepEqual(plain(responses),{model:'gpt-5',input:'paper',max_output_tokens:5000,reasoning:{effort:'high'}});
});

test('real postJSON transport fixes previously rejected SVG/edit/probe requests with default settings',async()=>{
  const sent=[];
  const context=fixture('',{requestChat:(url,options,timeout)=>requestChat(url,options,timeout,async(url,init)=>{
    const body=JSON.parse(init.body);sent.push({url,body});
    if('max_tokens' in body) return new Response(JSON.stringify({error:{message:'Unsupported parameter: max_tokens'}}),{status:400});
    return new Response(JSON.stringify({choices:[{message:{content:'mock success'},finish_reason:'stop'}]}));
  })});
  for(const budget of [96000,32000,1]){
    const input={model:'gpt-5',max_tokens:budget,messages:[{role:'user',content:'unchanged'}]};
    const response=await context.postJSON('https://api.openai.com/v1','/chat/completions',input,'fake-offline-key');
    assert.equal(response.status,200);
    assert.equal(sent.at(-1).body.max_completion_tokens,budget);
    assert.equal(input.max_tokens,budget);
    assert.equal(sent.at(-1).url,'https://api.openai.com/v1/chat/completions');
  }
});

test('actual Step 3 streaming branch receives the normalized limit before bypassing postJSON',async()=>{
  let captured,rendered=false;
  const context=fixture('',{
    refs:new Set(),buildPrompt:()=> 'original prompt',relayBase:()=>'',SVG_SYS:'system',
    requestStep3Svg:async options=>{captured=options.modelBody;return {code:'<svg/>',truncated:false};},
    DOMParser:class {},setGenNote(){},window:{GAL_I18N:{lang:'zh'}},
    auditAndRepair:async svg=>({svg}),revisionGallery:{leave(){}},renderSVG:()=>{rendered=true;}
  });
  await context.genOaiSVG('https://fixture.invalid/v1','gpt-5','fake-offline-key','paper','nonelinear',[],'');
  assert.equal(captured.max_completion_tokens,96000);
  assert.equal(Object.hasOwn(captured,'max_tokens'),false);
  assert.equal(rendered,true);
});
