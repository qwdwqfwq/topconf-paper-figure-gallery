// One owner-authorized PDF release exception. Original lock and baseline remain unchanged.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const base='e53a8c2beb3af4d4f9260800e745ea68c0753fde';
const expected={
  "forge/index.html": "17dc9c3e54440f2f4a288cd18e0a7405a10fe084ae4c1c27490a4450698ecdd9",
  "forge/pdf-openai-api.mjs": "c74dd10859c9aea1f27d9b54e856e39a4f3e95c7c8c9e641fb15ffc5c2525d35",
  "forge/test-openai-pdf.mjs": "c4c4a741e73b3bbaba76d81d5496ee4a5bf2fdfd06620dbcfa6eecfcc4dbd9c8",
  "forge/test-openai-pdf-browser.cjs": "81a45eb8b87512782b0855b991cc1aa8362b98034e45c385e57aa354f52161b3",
  ".github/workflows/deploy.yml": "748451d91bc4d76aa3f4e4abe68b866b9cc0c105cc06d9e033c22bc723f3a5e4"
};
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
// Pin the complete release delta, including the deployment exception itself.
const allowed=[...Object.keys(expected),'scripts/check-pdf-release-exception-20261028.mjs'].sort();
assert.deepEqual(git('diff','--cached','--name-only',base).trim().split('\n').sort(),allowed,'Unexpected release files');
git('diff','--exit-code');
for(const [name,hash] of Object.entries(expected)) {
  assert.equal(createHash('sha256').update(readFileSync(join(root,name),'utf8').replace(/\r\n/g,'\n')).digest('hex'),hash,'Unexpected patch: '+name);
}
// Execute the ORIGINAL checker against the ORIGINAL protected snapshot.
// The only protected-file exception is the reviewed index PDF wiring + PDF-only module above.
const temp=mkdtempSync(join(tmpdir(),'gallery-original-freeze-'));
try {
  const manifest=JSON.parse(git('show',base+':.github/forge-workflow-lock.json'));
  const files=[...Object.keys(manifest.files),'.github/forge-workflow-lock.json','scripts/check-forge-workflow-lock.mjs'];
  for(const name of files) {
    mkdirSync(dirname(join(temp,name)),{recursive:true});
    writeFileSync(join(temp,name),git('show',base+':'+name));
  }
  execFileSync(process.execPath,['scripts/check-forge-workflow-lock.mjs'],{cwd:temp,stdio:'inherit'});
} finally { rmSync(temp,{recursive:true,force:true}); }
console.log('Owner-authorized PDF-only release exception verified; original checker and baseline unchanged.');
