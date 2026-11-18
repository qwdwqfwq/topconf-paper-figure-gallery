import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {allowed,payload,assertScope,assertArtifact,verifyPrevious,verifyPatch} from './check-infistar-reference-hk-release.mjs';
import {ANALYSIS_JOB_BASE,requestReferenceAnalysis} from '../forge/step3-analysis-job.mjs';
test('only the isolated reference patch is publishable',()=>{assertScope(allowed);assertArtifact(payload);for(const p of ['forge/index.html','forge/image-api.mjs','forge/revision-gallery.mjs','forge/sw.js','.github/forge-workflow-lock.json']){assert.throws(()=>assertScope([...allowed,p]));assert.throws(()=>assertArtifact([...payload,p]));}assert.throws(()=>assertScope(allowed.slice(1)));assert.throws(()=>verifyPrevious(Buffer.from('{}')));});
test('exact reviewed patch, unchanged source and any extra edit are distinguished',()=>{const p=payload[0];const original=execFileSync('git',['show','4add693a0095674b05d830b1f3e5108aa6887aaa:'+p]);const candidate=readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n');verifyPatch(p,original,candidate);assert.throws(()=>verifyPatch(p,original,original));assert.throws(()=>verifyPatch(p,original,candidate+'\n// extra'));assert.throws(()=>verifyPatch('forge/index.html',original,candidate));});

const taskId='12345678-1234-1234-1234-123456789abc';
const providerUrl='https://infistar.cc/v1/chat/completions';
const authorization='Bearer fixture-key';
const body=JSON.stringify({model:'gpt-6.2-sol',reasoning_effort:'xhigh',messages:[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,AAAA'}}]}]});
const init={method:'POST',headers:{Authorization:authorization,'Content-Type':'application/json'},body};
const completed={choices:[{finish_reason:'stop',message:{content:'completed'}}]};

function client(fetchImpl){
  const records=new Map();
  let clock=1000;
  return {
    provider:'infistar',url:providerUrl,init,fetchImpl,
    uuid:()=>taskId,now:()=>clock,deadlineMs:30,sleep:async()=>{clock+=10;},
    storage:{getItem:key=>records.get(key),setItem:(key,value)=>records.set(key,value),removeItem:key=>records.delete(key)}
  };
}

test('a fresh Infistar .cc task posts once via Hong Kong and resumes after the result connection is lost',async()=>{
  const jobPath=ANALYSIS_JOB_BASE+'/jobs/'+taskId;
  const requests=[];
  const config=client(async (url,options)=>{
    requests.push([options.method||'GET',url]);
    if(url===ANALYSIS_JOB_BASE+'/health'){
      assert.equal(options.headers,undefined);
      return Response.json({ready:true});
    }
    assert.equal(options.headers.get('Authorization'),authorization);
    assert.equal(options.headers.get('X-Analysis-Upstream'),'infistar-cc');
    if(options.method==='PUT'){
      assert.equal(url,jobPath);
      assert.equal(options.body,body);
      return Response.json({state:'running'},{status:202});
    }
    assert.equal(url,jobPath+'/result');
    throw TypeError('Failed to fetch');
  });
  await assert.rejects(requestReferenceAnalysis(config),error=>{
    assert.equal(error.analysisJobDiagnostic.requestId,taskId);
    assert.equal(error.analysisJobDiagnostic.accepted,true);
    return true;
  });
  assert.deepEqual(requests,[
    ['GET',ANALYSIS_JOB_BASE+'/health'],['PUT',jobPath],
    ['GET',jobPath+'/result'],['GET',jobPath+'/result'],['GET',jobPath+'/result']
  ]);
  config.fetchImpl=async (url,options)=>{
    assert.equal(url,jobPath+'/result');
    assert.equal(options.method,undefined);
    return Response.json(completed);
  };
  assert.deepEqual(await (await requestReferenceAnalysis(config)).json(),completed);
});

test('old Infistar .cc browser-direct records recover cached completions or stay uncertain without another paid call',async()=>{
  const config=client(async ()=>assert.fail('A legacy browser-direct record must issue no network request'));
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(providerUrl+'\n'+authorization+'\n'+body));
  const slot='gallery.reference-analysis.v1.'+Buffer.from(hash).toString('hex');
  const record={id:taskId,created:config.now(),transport:'direct'};
  config.storage.setItem(slot,JSON.stringify({...record,state:'pending'}));
  await assert.rejects(requestReferenceAnalysis(config),error=>error.name==='AnalysisDirectError');
  config.storage.setItem(slot,JSON.stringify({...record,state:'complete',text:JSON.stringify(completed),status:200}));
  assert.deepEqual(await (await requestReferenceAnalysis(config)).json(),completed);
});
