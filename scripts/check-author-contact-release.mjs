// Publish only the requested Step 1 author contact UI and supplied QR image.
// The frozen workflow manifest/checker and all existing published files are preserved.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const baseCommit='51e7b351fdd7061f3ab5aa9b24b004cf207be54f';
const baseRun=43859330805;
const baseTree='bcb9ce44796f4647ffd43d89761378763d488c85';
const baseProofSha256='b47e788f1c6f682b54590b9198a00cc28ff6f90ddae8f5fa63743ebcc1a2fc3d';
const payload=['forge/index.html','forge/assets/author-wechat.jpg'].sort();
const allowed=[...payload,'.github/workflows/deploy.yml','scripts/check-author-contact-release.mjs'].sort();
const insertions=[
  [
    "  .nonelinear-support{",
    "  /* Author contact in the Step 1 heading. */\n  #card1 > .step{flex-wrap:wrap}\n  .author-contact-link{margin-left:auto;color:var(--purple);font-size:22px;font-weight:800;line-height:1.5;white-space:nowrap;text-decoration:underline;text-underline-offset:5px}\n  .author-contact-link:hover{color:var(--indigo)}\n  .author-contact-link:focus-visible{outline:3px solid var(--indigo);outline-offset:5px;border-radius:3px}\n  .author-contact-dialog{margin:auto;border:0;border-radius:18px;padding:20px;width:min(420px,calc(100vw - 32px));max-height:90vh;max-height:90dvh;overflow:auto;box-shadow:0 16px 64px #0004}\n  .author-contact-dialog::backdrop{background:#11182788}\n  .author-contact-dialog header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:8px}\n  .author-contact-dialog h2{font-size:20px}\n  .author-contact-dialog button{border:0;border-radius:8px;background:#f3f4f6;font-size:28px;line-height:1;min-width:44px;min-height:44px;color:#374151}\n  .author-contact-dialog img{display:block;width:100%;height:auto;max-height:calc(90vh - 108px);max-height:calc(90dvh - 108px);object-fit:contain}\n  @media(max-width:720px){#card1 > .step .step-note{flex:1;min-width:140px}.author-contact-link{flex-basis:100%;margin-left:33px;font-size:20px}}\n"
  ],
  [
    "    </div>\n\n    <div class=\"s1-grid\">",
    "      <a class=\"author-contact-link\" id=\"authorContactOpen\" href=\"./assets/author-wechat.jpg\" aria-haspopup=\"dialog\" aria-controls=\"authorContactDialog\">有问题可联系作者</a>\n"
  ],
  [
    "<dialog id=\"nonelinearSupportDialog\"",
    "<dialog id=\"authorContactDialog\" class=\"author-contact-dialog\" aria-labelledby=\"authorContactTitle\">\n  <header><h2 id=\"authorContactTitle\">微信联系作者</h2><button type=\"button\" id=\"authorContactClose\" aria-label=\"关闭作者微信二维码\" autofocus>×</button></header>\n  <img src=\"./assets/author-wechat.jpg\" alt=\"作者 folklore 的微信二维码，扫一扫添加作者为好友\" loading=\"lazy\" width=\"960\" height=\"1418\">\n</dialog>\n<script>\n{\n  const authorContactDialog = document.getElementById('authorContactDialog');\n  document.getElementById('authorContactOpen').addEventListener('click', event => {\n    event.preventDefault();\n    authorContactDialog.showModal();\n  });\n  document.getElementById('authorContactClose').addEventListener('click', () => authorContactDialog.close());\n  authorContactDialog.addEventListener('click', event => {\n    if (event.target !== authorContactDialog) return;\n    const bounds = authorContactDialog.getBoundingClientRect();\n    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) authorContactDialog.close();\n  });\n}\n</script>\n"
  ]
];
const qrSha256='6d787a7e5a7084de4766044ca92404673993c2e22838c80680c4b1c7eefa3d29';

const gitBytes=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:40*1024*1024});
const git=(...args)=>gitBytes(...args).toString().trim();
const blobId=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const normalize=bytes=>bytes.toString().replace(/\r\n/g,'\n');
async function api(suffix){
 assert.ok(process.env.GH_TOKEN,'GitHub read token required');
 const response=await fetch('https://api.github.com/repos/qwdwqfwq/topconf-paper-figure-gallery'+suffix,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});
 assert.ok(response.ok,'GitHub HTTP '+response.status);return response.json();
}
const working=process.argv.includes('--working');
const prepare=process.argv.includes('--prepare-pages');
if(!working){assert.equal(git('show','-s','--format=%P','HEAD'),baseCommit,'Release must directly follow reviewed live release');assert.equal(git('status','--porcelain','--untracked-files=all'),'','Dirty checkout');}
const paths=working?[...new Set([...git('diff','--name-only','--no-renames',baseCommit,'--').split('\n').filter(Boolean),...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean)])]:git('diff','--name-only','--no-renames',baseCommit,'HEAD').split('\n').filter(Boolean);
assert.deepEqual(paths.sort(),allowed,'Only contact UI, supplied QR and its publisher may change');
const proofBytes=readFileSync(process.argv[2]);assert.equal(sha256(proofBytes),baseProofSha256,'Previous proof must match successful deployment');
const previous=JSON.parse(proofBytes);assert.equal(previous.artifactTree,baseTree);assert.equal(previous.allOtherPublishedBytesIdentical,true);
if(prepare){
 assert.equal(working,false);assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REF,'refs/heads/main');assert.equal(process.env.GITHUB_SHA,git('rev-parse','HEAD'));
 const run=await api('/actions/runs/'+baseRun);assert.equal(run.conclusion,'success');assert.equal(run.head_sha,baseCommit);
 const deployments=await api('/deployments?environment=github-pages&per_page=10');
 const states=await Promise.all(deployments.map(async deployment=>({deployment,status:(await api('/deployments/'+deployment.id+'/statuses'))[0]})));
 const current=states.find(value=>value.status?.state==='success');assert.ok(current,'Successful current deployment required');assert.equal(current.deployment.sha,baseCommit,'Another release has been published');assert.ok(current.status.log_url.includes('/runs/'+baseRun+'/'));
}
const before=gitBytes('show',baseCommit+':forge/index.html');
assert.equal(previous.entries.find(e=>e.path==='forge/index.html')?.blob,blobId(before),'Source must match published entry');
let expected=normalize(before);
for(const [marker,block] of insertions){assert.equal(expected.split(marker).length,2,'Insertion marker must occur exactly once');expected=expected.replace(marker,block+marker);}
const readCandidate=p=>working?(p.endsWith('.html')?Buffer.from(normalize(readFileSync(join(root,p)))):readFileSync(join(root,p))):gitBytes('show','HEAD:'+p);
const html=readCandidate('forge/index.html');assert.equal(normalize(html),expected,'No existing HTML, style or script may change');
const qr=readCandidate('forge/assets/author-wechat.jpg');assert.equal(sha256(qr),qrSha256,'Use the exact user-provided QR image');
for(const match of normalize(html).matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){
 if(match[1].includes('src=')||!match[2].trim())continue;
 execFileSync(process.execPath,['--check','--input-type='+(/type="module"/.test(match[1])?'module':'commonjs')],{cwd:root,input:match[2]});
}
const candidates=new Map([['forge/index.html',html],['forge/assets/author-wechat.jpg',qr]]);
const temp=mkdtempSync(join(tmpdir(),'author-contact-'));
try{
 const env={...process.env,GIT_INDEX_FILE:join(temp,'index')};
 const indexGit=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:40*1024*1024}).trim();
 const seen=new Set();
 for(const e of previous.entries){assert.ok(['100644','100755'].includes(e.mode));assert.match(e.blob,/^[0-9a-f]{40}$/);assert.ok(![9,10,13,92].some(code=>e.path.includes(String.fromCharCode(code)))&&!e.path.startsWith('/')&&!e.path.split('/').some(p=>p==='..'||p==='.git'));assert.ok(!seen.has(e.path));seen.add(e.path);}
 assert.equal(seen.has('forge/assets/author-wechat.jpg'),false,'QR must be a new file');
 indexGit('read-tree','--empty');
 execFileSync('git',['update-index','--index-info'],{cwd:root,env,input:previous.entries.map(e=>e.mode+' '+e.blob+'\t'+e.path+'\n').join(''),maxBuffer:40*1024*1024});
 assert.equal(indexGit('write-tree','--missing-ok'),baseTree,'Previous tree must be reconstructed exactly');
 for(const [p,bytes] of candidates){const blob=execFileSync('git',['hash-object','-w','--stdin'],{cwd:root,input:bytes}).toString().trim();assert.equal(blob,blobId(bytes));indexGit('update-index','--add','--cacheinfo','100644',blob,p);}
 const artifactTree=indexGit('write-tree','--missing-ok');
 assert.deepEqual(git('diff','--name-only','--no-renames',baseTree,artifactTree).split('\n').sort(),payload,'Only two published files may differ');
 const entries=previous.entries.map(e=>candidates.has(e.path)?{...e,blob:blobId(candidates.get(e.path))}:e);
 entries.push({mode:'100644',blob:blobId(qr),path:'forge/assets/author-wechat.jpg'});entries.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 const result={baseCommit,baseRun,baseTree,artifactTree,changedOnline:payload,unchangedFiles:previous.entries.length-1,allOtherPublishedBytesIdentical:true,existingEntryBytesPreserved:true,step3Unchanged:true,step4Unchanged:true,originalFrozenCheck:'Unchanged; preexisting failures remain failures',entries};
 if(prepare){
  const output='/tmp/author-contact-pages';assert.equal(existsSync(output),false,'Refuse overwrite');mkdirSync(output);
  indexGit('-c','core.autocrlf=false','checkout-index','--all','--prefix='+output+'/');
  for(const e of entries)assert.equal(blobId(readFileSync(join(output,e.path))),e.blob,'Export mismatch: '+e.path);
  writeFileSync('/tmp/author-contact-proof.json',JSON.stringify(result,null,2));assert.equal(git('status','--porcelain','--untracked-files=all'),'');
 }
 console.log(JSON.stringify({...result,entries:undefined},null,2));
}finally{
 assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep));rmSync(temp,{recursive:true,force:true});
}
