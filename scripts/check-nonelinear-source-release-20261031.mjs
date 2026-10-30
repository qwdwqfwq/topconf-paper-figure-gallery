// Narrow owner-authorized transport exception; original freeze manifest stays unchanged.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const base='a0900603f1dc839a5a4be1caf384594087a77b60';
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:10*1024*1024});
const expected={
  "forge/index.html": "69ae53d7b875ffa742f54673b493b2c74394dc9b0b63a19e1e8114fb705e4efe",
  "forge/nonelinear-source.mjs": "a29c9c38cee32289280871c6c33e5e090996e606d12f0614fd07250a21047aab",
  "nonelinear-relay/worker.mjs": "e59432d926052a23b8d6ddad397db914789b79b2270b79618039ab11d274793b",
  "nonelinear-relay/source-image.mjs": "d8acca3b12fe9f24a5911f16a15a891af8f5e09db380ce37d0d2e8532855788a",
  "nonelinear-relay/test-source-image.mjs": "77f88576e58a45edf9cf8e2d2ecfa77cb31b8b6c1f1fd83848b6aeaf8c4a3ec0",
  "nonelinear-relay/chat-stream.mjs": "1dbce6166a29a9544fa870ff272b8855e54858bd26621823cd04ba1c4c462860",
  "nonelinear-relay/test-chat-stream.mjs": "24a251e9f2b8de10afbe41592829e608c001c20da3e232da514a85fa935e4593",
  ".github/workflows/deploy.yml": "f9171e0fd7714c51662327a17ec9aaed90895338e94fd72cf9ad3480a1376599",
};
const self='scripts/check-nonelinear-source-release-20261031.mjs';
const normalize=s=>s.replace(/\r\n/g,'\n');
const hash=s=>createHash('sha256').update(normalize(s)).digest('hex');
assert.deepEqual(git('diff','--cached','--name-only',base).trim().split(/\r?\n/).sort(),[...Object.keys(expected),self].sort(),'Only authorized transport and release files may change');
git('diff','--exit-code');
for(const [name,digest] of Object.entries(expected)) assert.equal(hash(readFileSync(join(root,name),'utf8')),digest,name);
let original=normalize(git('show',base+':forge/index.html'));
function replaceOnce(before,after){assert.equal(original.split(before).length,2);original=original.replace(before,after);}
replaceOnce("import * as T from './vendor/transformers.min.js';","import * as T from './vendor/transformers.min.js';\nimport {fetchBitmapSource} from './nonelinear-source.mjs';");
replaceOnce('const r = await fetch(src);',"const r = await fetchBitmapSource(src,{provider:$('#provider').value,base:baseURL(),key:$('#key').value.trim()});");
assert.equal(normalize(readFileSync(join(root,'forge/index.html'),'utf8')),original,'No reconstruction, dimensions, or export changes allowed');
const manifest=JSON.parse(git('show',base+':.github/forge-workflow-lock.json'));
for(const [name,digest] of Object.entries(manifest.files)) if(name!=='forge/index.html')assert.equal(hash(readFileSync(join(root,name),'utf8')),digest,name);
assert.deepEqual(readdirSync(join(root,'forge')).filter(n=>/\.(html|js|mjs|json)$/.test(n)&&!n.startsWith('test-')).sort(),[...Object.keys(manifest.files).map(n=>n.slice(6)),'nonelinear-source.mjs'].sort());
const temp=mkdtempSync(join(tmpdir(),'nonelinear-original-lock-'));
try{
 for(const name of [...Object.keys(manifest.files),'.github/forge-workflow-lock.json','scripts/check-forge-workflow-lock.mjs']){const dst=join(temp,name);mkdirSync(dirname(dst),{recursive:true});writeFileSync(dst,git('show',base+':'+name));}
 execFileSync(process.execPath,['scripts/check-forge-workflow-lock.mjs'],{cwd:temp,stdio:'inherit'});
}finally{rmSync(temp,{recursive:true,force:true});}
console.log('Verified isolated NoneLinear original-image transport exception; reconstruction and four exports unchanged.');
