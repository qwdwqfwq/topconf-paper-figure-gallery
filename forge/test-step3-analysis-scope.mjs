import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {requestStep3Analysis} from './step3-analysis-request.mjs';

const original=execFileSync('git',['show','5f1ea4a:forge/index.html'],{cwd:new URL('..',import.meta.url),maxBuffer:4*1024*1024}).toString().replace(/\r\n/g,'\n');
const current=readFileSync(new URL('./index.html',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const newImport="import {requestStep3Analysis} from './step3-analysis-request.mjs?v=20261117-diagnostics1';\n";
const start='async function analyzeReferences(){',end='function renderAnalyze(ordered){';
const outside=source=>source.slice(0,source.indexOf(start))+source.slice(source.indexOf(end));

test('entry bytes outside the authorized function and import match the live baseline',()=>{
 assert.equal(createHash('sha256').update(original).digest('hex'),'6a137da2f6602f8fa2cbbf019518c54ae90928cbe51b80a33875031eecdc62b8');
 assert.equal(current.split(newImport).length,2);
 assert.equal(outside(current.replace(newImport,'')),outside(original));
 const afterRequest='  const j=extractJSON(txt);';
 assert.equal(current.slice(current.indexOf(afterRequest),current.indexOf(end)),original.slice(original.indexOf(afterRequest),original.indexOf(end)));
});

async function capture(source,anthropic){
 const calls=[];
 const options={provider:'nonelinear',analyzeModel:'gemini-4-carbon',model:'gemini-nano-banana-2.1',key:'offline-fixture'};
 const response=()=>Response.json(anthropic?{content:[{type:'text',text:'{"layout":"rows"}'}]}:{choices:[{message:{content:'{"layout":"rows"}'},finish_reason:'stop'}]});
 const context={
  refs:['ref1'],refDataURIs:async()=>['data:image/png;base64,AA=='],
  cfg:()=>({proto:anthropic?'anthropic':'oai'}),relayBase:()=>'',baseURL:()=> 'https://relay.example/v1',
  internationalGalleryBase:base=>base,$:selector=>({value:options[selector.slice(1)]}),
  dataURIToParts:()=>({media:'image/png',data:'AA=='}),buildAnalyzePrompt:()=> 'frozen prompt fixture',ANALYZE_SYS:'frozen system fixture',
  mode:'image',passMode:'two',cleanKey:key=>key,withReasoning:body=>body,anthropicHeaders:key=>({'x-api-key':key}),
  GAL_I18N:{lang:'zh'},requestStep3Analysis,
  fetchWithTimeout:async(url,options)=>{calls.push({url,...options});return response();},
  postJSON:async(base,path,body,key)=>{calls.push({url:base+path,body,key});return response();},
  tt:key=>key,friendlyHttp:()=>{throw new Error('Unexpected HTTP error');},diagnoseConnection:()=>{throw new Error('Unexpected diagnostic probe');}
 };
 const prefix=source.slice(source.indexOf(start),source.indexOf('  const j=extractJSON(txt);'));
 const text=await vm.runInNewContext(prefix+'  return txt;\n}\nanalyzeReferences()',context);
 return JSON.parse(JSON.stringify({calls,text}));
}

for(const anthropic of [false,true])test(`successful ${anthropic?'Anthropic':'OpenAI-compatible'} request retains its URL, body and credentials`,async()=>{
 assert.deepEqual(await capture(current,anthropic),await capture(original,anthropic));
});
