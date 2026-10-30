// Owner-authorized Infistar Step 4 transport exception; no baseline is rewritten.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Previously deployed and validated NoneLinear source transport release.
const base='fedc51242a08fbf6f3c2fe6cd03ab23266a6f1eb';
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024});
const normalize=s=>s.replace(/\r\n/g,'\n');
const hash=s=>createHash('sha256').update(normalize(s)).digest('hex');
const expected={
  'forge/index.html':'fa239a26404353244404a51ac65d0fe2df32e2f1950cf4f3879d4958ac6dfff9',
  'forge/infistar-reconstruction-stream.mjs':'aceedcf21fafb77a97caa1b8fb01239324376baa204515c83025aedc616b7806',
  'forge/test-infistar-reconstruction-stream.mjs':'2e2fbe5cb4cd47b1f949b5285893a2a1748e845190fabee3fe00db2aef33da33',
  '.github/workflows/deploy.yml':'b5c9ba0f3439c94b19f9bcb979f3b31935cae5f422aa1c5d8f12468a275c44d7',
};
const self='scripts/check-infistar-step4-release-20261031.mjs';
assert.deepEqual(git('diff','--cached','--name-only',base).trim().split(/\r?\n/).sort(),[...Object.keys(expected),self].sort(),'Only the five authorized transport/test/release files may change');
git('diff','--exit-code');
for(const [name,digest] of Object.entries(expected))assert.equal(hash(readFileSync(join(root,name),'utf8')),digest,name);
let original=normalize(git('show',base+':forge/index.html'));
function replaceOnce(before,after){assert.equal(original.split(before).length,2);original=original.replace(before,after);}
replaceOnce("import {fetchBitmapSource} from './nonelinear-source.mjs';","import {fetchBitmapSource} from './nonelinear-source.mjs';\nimport {fetchReconstructionStream,usesReconstructionStream} from './infistar-reconstruction-stream.mjs';");
replaceOnce("const r=await fetchTextWithTimeout(baseURL()+'/chat/completions',{","const r=await (usesReconstructionStream($('#provider').value)?fetchReconstructionStream:fetchTextWithTimeout)(baseURL()+'/chat/completions',{");
assert.equal(normalize(readFileSync(join(root,'forge/index.html'),'utf8')),original,'Reconstruction, image dimensions and four exports must remain byte-for-byte unchanged outside the two transport lines');
const inventory=git('ls-tree','--name-only',base,'forge/').trim();
const baseFiles=git('ls-tree','-r','--name-only',base,'forge/').trim().split(/\r?\n/).filter(n=>/^forge\/[^/]+\.(html|js|mjs|json)$/.test(n)&&!n.slice(6).startsWith('test-')).map(n=>n.slice(6));
assert.deepEqual(readdirSync(join(root,'forge')).filter(n=>/\.(html|js|mjs|json)$/.test(n)&&!n.startsWith('test-')).sort(),[...baseFiles,'infistar-reconstruction-stream.mjs'].sort());
console.log('Verified isolated Infistar Step 4 stream transport; other APIs, original dimensions, reconstruction and four exports unchanged.');
