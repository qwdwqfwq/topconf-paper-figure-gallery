// Authorized isolated Step 3 image jobs release. The prior production artifact is
// reconstructed with its original checks; all other online blobs are retained.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export const anchor='a72641224b23164fbf3142feb9e2428e99c61018';
export const publishedTree='817a9c9a1f05d007b0722d43b90f25429dee7444';
export const payload=["forge/index.html","forge/step3-image-capabilities.mjs","forge/step3-image-protocol.mjs","forge/step3-infistar-job.mjs"];
export const allowed=[".github/forge-workflow-lock.json",".github/workflows/step3-image-jobs-release.yml","forge/index.html","forge/step3-image-capabilities.mjs","forge/step3-image-protocol.mjs","forge/step3-infistar-job.mjs","forge/test-step3-image-capabilities-browser.cjs","forge/test-step3-image-capabilities.mjs","forge/test-step3-image-protocol.mjs","forge/test-step3-image-recovery-browser.cjs","forge/test-step3-infistar-job.mjs","infistar-image-relay/.gitignore","infistar-image-relay/README.md","infistar-image-relay/browser-image-fetch.mjs","infistar-image-relay/image-result.mjs","infistar-image-relay/test-image-result.mjs","infistar-image-relay/test-worker.mjs","infistar-image-relay/worker.mjs","infistar-image-relay/wrangler.jsonc","scripts/check-step3-image-jobs-release.mjs","scripts/test-step3-image-jobs-release.mjs"];
const expected={
  ".github/forge-workflow-lock.json": "101c8d448d1978760ecc7f0200def87935d5be57a8cdfdee1eb1a14189b33877",
  ".github/workflows/step3-image-jobs-release.yml": "adf4ed1965025270f782de78b3f7cd20eeebdb095b894ac1903b0d507f39c010",
  "forge/index.html": "cf09be5355bb41fb2c10eeab36e72ff8a1dc1e270a18c069dd623ac6937bc1e5",
  "forge/step3-image-capabilities.mjs": "f6d51a756e0dbbe8d017371a438fa8eca3a74c48a6ec1ad851c17d09e0224d24",
  "forge/step3-image-protocol.mjs": "3255a0b47423b37368df64d3b116d47d1de5cab99e4ead95492c8b5b9aa87b02",
  "forge/step3-infistar-job.mjs": "1007fce94912a02b2fecf1bd19ccf756ebac54644983267ec54fcf781ccb2962",
  "forge/test-step3-image-capabilities-browser.cjs": "587eb41d1722d1db5632d93660ce9d2438a0c7ffcba9cf9d721d279b1af0b398",
  "forge/test-step3-image-capabilities.mjs": "5be5c86781289786b9b741c4128fdf677406ff5f5472c35b8dc8bf1a96cc1c4b",
  "forge/test-step3-image-protocol.mjs": "431c864254dfd055442cfb9dacd1cd276c7ce794ead87bb0e1d1b8c6244c4f29",
  "forge/test-step3-image-recovery-browser.cjs": "315805e83f5b93d0e5458409bf9ace3eb619c4d91a996316b32fbb0687158874",
  "forge/test-step3-infistar-job.mjs": "d6f3f75757b667a75a8adc993ed981f1d9bb9ce18ba8107ccd86755125930313",
  "infistar-image-relay/.gitignore": "c21095028bd6352744bb7189281f1f4aaf53081c8241ec7fb55a90491d7eacda",
  "infistar-image-relay/README.md": "fc5a05bd2396c777be3e7fd8b5b3f0ab5ea291faac1898e21cc18c3e5e7befaa",
  "infistar-image-relay/browser-image-fetch.mjs": "197879cb761543615aa469e06c740141304ed53e3d4132810e0bd1433e53f9ed",
  "infistar-image-relay/image-result.mjs": "6c9d053bf1a7ceadda95ada9282c1437692d64d7a33b27408e61fdb7a4c97ab6",
  "infistar-image-relay/test-image-result.mjs": "eb228d46a1964de96a278e89d227e392e20b219af3f318ce74e4d05c0c42278b",
  "infistar-image-relay/test-worker.mjs": "b4577db06b7485f4fd21bb75eeb96b52375cc659dc69f5221537d3584eae4b1f",
  "infistar-image-relay/worker.mjs": "1b6123bfef7b8c6db40e0f12746ef987e9fd3a446ab47772106592f319c32989",
  "infistar-image-relay/wrangler.jsonc": "cc5f80d465d82820bced9f18e4b5a856df2e247e2527e3b7139bde633c300905",
  "scripts/test-step3-image-jobs-release.mjs": "c155f4ba0c527b8411f74a0901ab424bea027179878cd7fae19827ed165b1940"
};
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
const changed=(a,b)=>git('diff','--name-only','--no-renames',a,b,'--').split('\n').filter(Boolean).sort();
export function assertAllowedPaths(paths){assert.deepEqual([...paths].sort(),[...allowed].sort(),'Unexpected repository scope');}
export function assertArtifactDiff(paths){assert.deepEqual([...paths].sort(),payload,'Only the approved Step 3 entry regions and three private modules may change online');}
export function assertFrozenEntry(before,after){assert.equal(after,before,'Frozen shared entry changed');}
export function verifyBlob(path,data){assert.ok(expected[path],'Unreviewed path');assert.equal(createHash('sha256').update(data.toString().replace(/\r\n/g,'\n')).digest('hex'),expected[path],'Unreviewed content: '+path);}

const normalize=value=>String(value).replace(/\r\n/g,'\n');
function maskEntry(value,updated){
 let text=normalize(value),count=0;
 text=text.replace(/^import .*from ['"]\.\/step3-(?:image-capabilities|image-protocol|infistar-job)\.mjs[^'"\n]*['"];?\n/gm,()=>{count++;return '';});
 assert.equal(count,updated?3:0,'Only the three reviewed Step 3 imports are authorized');
 for(const [start,end,label] of [
  ['function syncImageRatioSupport(){',"$('#model').onchange",'model capabilities'],
  ['async function genOaiImage(', '  await revisionGallery.addInitial({image:exportImgSrc','generation prefix']
 ]){
  assert.equal(text.split(start).length,2,'Unique '+label+' start required');
  const a=text.indexOf(start),b=text.indexOf(end,a);assert.ok(b>a,'Missing '+label+' boundary');
  text=text.slice(0,a)+'[approved Step 3 '+label+']\n'+text.slice(b);
 }
 return text;
}
export function assertEntryIsolation(before,after){assert.equal(maskEntry(after,true),maskEntry(before,false),'Step 4 or another unapproved entry region changed');}
export function assertManifestScope(before,after){
 const permitted=new Set(payload);const b=structuredClone(before),a=structuredClone(after);
 for(const p of permitted){delete b.files[p];delete a.files[p];}
 assert.deepEqual(a,b,'An unapproved manifest baseline changed');
 for(const p of payload)assert.match(after.files[p]||'',/^[0-9a-f]{64}$/,'Missing approved manifest hash');
}

function main(){
 // Preserve the pushed implementation commit; only this reviewed locale-test correction follows it.
 const reviewedImplementation='46de131dd3d6a03c9f0b9192e967e4bb14a3afdc';
 assert.equal(git('show','-s','--format=%P',reviewedImplementation),anchor,'Implementation must directly follow the original production anchor');
 const working=process.argv.includes('--working');
 if(working)assert.equal(git('rev-parse','HEAD'),reviewedImplementation,'Unexpected working base');
 else {assert.equal(git('show','-s','--format=%P','HEAD'),reviewedImplementation,'Release must directly follow the reviewed implementation commit');assert.equal(git('status','--porcelain','--untracked-files=all'),'','Dirty checkout');}
 const paths=working?[...new Set([...git('diff','--name-only','--no-renames',anchor,'--').split('\n').filter(Boolean),...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean)])]:changed(anchor,'HEAD');
 assertAllowedPaths(paths);assert.equal(Object.keys(expected).length,allowed.length-1);
 for(const p of Object.keys(expected))verifyBlob(p,readFileSync(join(root,p)));
 assertEntryIsolation(execFileSync('git',['show',anchor+':forge/index.html'],{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024}),readFileSync(join(root,'forge/index.html'),'utf8'));
 assertManifestScope(JSON.parse(execFileSync('git',['show',anchor+':.github/forge-workflow-lock.json'],{cwd:root,encoding:'utf8'})),JSON.parse(readFileSync(join(root,'.github/forge-workflow-lock.json'),'utf8')));
 const temp=mkdtempSync(join(tmpdir(),'step3-image-jobs-release-')),prior=join(temp,'previous');let added=false,proof;
 try{
  git('worktree','add','--detach',prior,anchor);added=true;
  const previous=JSON.parse(execFileSync(process.execPath,['scripts/check-step3-catalog-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024}));
  assert.equal(previous.artifactTree,publishedTree,'Previous production artifact changed');
  execFileSync(process.execPath,['--test','scripts/test-step3-catalog-release.mjs'],{cwd:prior,encoding:'utf8',maxBuffer:4*1024*1024});
  const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
  const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
  indexGit('read-tree',publishedTree);
  for(const p of payload){const blob=working?git('hash-object','-w',p):git('rev-parse','HEAD:'+p);indexGit('update-index','--add','--cacheinfo','100644',blob,p);}
  const artifactTree=indexGit('write-tree');assertArtifactDiff(changed(publishedTree,artifactTree));
  const entries=git('ls-tree','-r',artifactTree).split('\n').filter(Boolean).map(line=>{const m=line.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/);assert.ok(m,'Unsupported entry');assert.ok(['100644','100755'].includes(m[1]),'Symlinks forbidden');return {mode:m[1],blob:m[2],path:m[3]};});
  assertEntryIsolation(execFileSync('git',['show',publishedTree+':forge/index.html'],{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024}),readFileSync(join(root,'forge/index.html'),'utf8'));
  proof={independentAcceptance:true,originalFrozenCheck:'Unchanged; historical failures remain failures',anchor,publishedTree,artifactTree,changedOnline:payload,unchangedFiles:entries.length-payload.length,step4AndAllOtherEntryRegionsIdentical:true,previousAcceptanceAndTests:true,entries};
  if(process.argv.includes('--prepare-pages')){
   assert.equal(working,false);assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
   const output='/tmp/isolated-step3-image-jobs-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
   indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
   for(const e of entries){const bytes=readFileSync(join(output,e.path));assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),e.blob,'Artifact mismatch: '+e.path);}
   writeFileSync('/tmp/isolated-step3-image-jobs-proof.json',JSON.stringify(proof,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'','Export changed checkout');
  }
 }finally{
  assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep),'Cleanup must remain in the temporary directory');
  assert.ok(resolve(prior).startsWith(resolve(temp)+sep),'Worktree cleanup must remain in the release directory');
  if(added)git('worktree','remove','--force',prior);rmSync(temp,{recursive:true,force:true});
 }
 console.log(JSON.stringify({...proof,entries:undefined}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
