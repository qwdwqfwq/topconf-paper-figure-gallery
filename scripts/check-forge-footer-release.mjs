// Owner-approved FigureForge footer presentation release, 2026-11-24.
// Overlay only the two footer files onto the exact current published tree.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const baseCommit = 'b67d37de39274bdbe3b13c8d08b98193d1466541';
const baseRun = 45304981743;
const baseTree = '9055a260c7323fe757ba9f206608b14494c3f512';
const proofHash = '3872a0213e86e4a666db418decd8f6f7d9a90b8117cc0597a120005405b01582';
export const payload = ["forge/i18n_forge.js", "forge/index.html"];
const allowed = [...payload, '.github/workflows/deploy-forge-footer.yml',
  'scripts/check-forge-footer-release.mjs', 'scripts/test-forge-footer-release.mjs'].sort();
const reviewed = {
  "forge/i18n_forge.js": "b8a310b534e292de2466ca83a953b197d0c973a87881027329e582a5973e1549",
  "forge/index.html": "7fb47c41523accf896141191708089a20f3415cca2b3543b1218beb1adf1fe30"
};
const gitBytes = (...args) => execFileSync('git', args, {cwd: root, maxBuffer: 128 * 1024 * 1024});
const git = (...args) => gitBytes(...args).toString().trim();
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const blobId = bytes => createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
export function assertScope(paths) {
  assert.deepEqual([...paths].sort(), allowed, 'Only approved footer files and their isolated publisher may change');
}
export function assertArtifact(paths) {
  assert.deepEqual([...paths].sort(), payload, 'Every other published file must remain byte-identical');
}
export function verifyCandidate(path, bytes) {
  assert.ok(Object.hasOwn(reviewed, path), 'Unapproved publication path');
  assert.equal(sha256(bytes), reviewed[path], 'Unreviewed footer content: ' + path);
}
export function verifyPrevious(bytes) {
  assert.equal(sha256(bytes), proofHash, 'Current publication proof must remain unchanged');
  const previous = JSON.parse(bytes);
  assert.equal(previous.artifactTree, baseTree);
  assert.equal(previous.entries.length, 3752);
  assert.equal(previous.allOtherPublishedBytesIdentical, true);
  const seen = new Set();
  for (const e of previous.entries) {
    assert.ok(['100644', '100755'].includes(e.mode));
    assert.match(e.blob, /^[0-9a-f]{40}$/);
    assert.ok(!/[\t\r\n\\]/.test(e.path) && !e.path.startsWith('/') &&
      !e.path.split('/').some(p => p === '..' || p === '.git'));
    assert.ok(!seen.has(e.path)); seen.add(e.path);
  }
  return previous;
}
async function api(suffix) {
  assert.ok(process.env.GH_TOKEN, 'GitHub read token required');
  const r = await fetch('https://api.github.com/repos/qwdwqfwq/topconf-paper-figure-gallery' + suffix, {
    headers: {Authorization: 'Bearer ' + process.env.GH_TOKEN, Accept: 'application/vnd.github+json'},
    signal: AbortSignal.timeout(30000)
  });
  assert.ok(r.ok, 'GitHub HTTP ' + r.status); return r.json();
}
async function checkPublishedBase() {
  const run = await api('/actions/runs/' + baseRun);
  assert.equal(run.conclusion, 'success'); assert.equal(run.head_sha, baseCommit);
  const deployments = await api('/deployments?environment=github-pages&per_page=20');
  const statuses = await Promise.all(deployments.map(async deployment => ({
    deployment, status: (await api('/deployments/' + deployment.id + '/statuses'))[0]
  })));
  const current = statuses.find(s => s.status?.state === 'success');
  assert.ok(current); assert.equal(current.deployment.sha, baseCommit, 'Another release has been published; stop');
  assert.ok(current.status.log_url.includes('/runs/' + baseRun + '/'));
}
export function transformFooter(path, bytes) {
  let text = bytes.toString('utf8');
  const replaceOnce = (before, after) => {
    assert.equal(text.split(before).length - 1, 1, 'Expected footer markup: ' + path);
    text = text.replace(before, after);
  };
  if (path === 'forge/index.html') {
    replaceOnce(GUIDE, ''); replaceOnce(DEMOS, '');
  } else {
    assert.equal(path, 'forge/i18n_forge.js');
    replaceOnce('"tut3":"③ Export with every detail editable"', '"tut3":"Export with every detail editable"');
    replaceOnce('"tut3":"③ 导出可编辑所有细节"', '"tut3":"导出可编辑所有细节"');
  }
  return Buffer.from(text);
}
const GUIDE = "    <div class=\"step\"><span data-i18n=\"guide.t\"></span><span class=\"step-note\" data-i18n=\"guide.note\"></span></div>\n    <section class=\"box b-slate\">\n      <ul class=\"guide\">\n        <li data-i18n-html=\"g1\"></li>\n        <li data-i18n-html=\"g2\"></li>\n        <li data-i18n-html=\"g3\"></li>\n        <li data-i18n-html=\"g4\"></li>\n        <li data-i18n-html=\"g5\"></li>\n      </ul>\n    </section>\n";
const DEMOS = "      <h4><span class=\"bi\" aria-hidden=\"true\">📐</span><span data-i18n=\"box.demo\"></span></h4>\n      <div class=\"step\" style=\"margin-bottom:8px;font-size:13px\" data-i18n=\"tut1\"></div>\n      <img src=\"tutorial/02_pick_refs.png?v=20261001c\" data-i18n-aria=\"tut1\" style=\"width:100%;border:1px solid var(--line);border-radius:11px\">\n      <div class=\"step\" style=\"margin:16px 0 8px;font-size:13px\" data-i18n=\"tut2\"></div>\n      <img src=\"tutorial/compare.png?v=20261002\" data-i18n-aria=\"tut2\" style=\"width:100%;border:1px solid var(--line);border-radius:11px\">\n";
async function publishedBytes(entry) {
  try { return gitBytes('cat-file', 'blob', entry.blob); } catch {}
  const r = await fetch('https://qwdwqfwq.github.io/topconf-paper-figure-gallery/' + entry.path + '?footer-base=' + baseCommit, {signal: AbortSignal.timeout(30000)});
  assert.ok(r.ok); const bytes = Buffer.from(await r.arrayBuffer());
  assert.equal(blobId(bytes), entry.blob, 'Published base differs: ' + entry.path);
  execFileSync('git', ['hash-object', '-w', '--stdin'], {cwd: root, input: bytes});
  return bytes;
}
async function main() {
  const working = process.argv.includes('--working');
  assert.equal(git('rev-parse', working ? 'HEAD' : 'HEAD^'), baseCommit);
  if (!working) {
    assert.equal(git('show', '-s', '--format=%P', 'HEAD'), baseCommit);
    assert.equal(git('status', '--porcelain', '--untracked-files=all'), '');
  }
  const paths = git('diff', '--name-only', '--no-renames', baseCommit, ...(working ? [] : ['HEAD'])).split('\n').filter(Boolean);
  if (working) paths.push(...git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean));
  assertScope(paths);
  const previous = verifyPrevious(readFileSync(process.argv[2]));
  const candidates = new Map();
  for (const p of payload) {
    const prior = previous.entries.find(e => e.path === p); assert.ok(prior);
    
    const bytes = working ? Buffer.from(readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n')) : gitBytes('show', 'HEAD:' + p);
    verifyCandidate(p, bytes);
    assert.deepEqual(bytes, transformFooter(p, gitBytes('show', baseCommit + ':' + p)), 'Only approved footer deletion is allowed in source');
    const published = await publishedBytes(prior);
    assert.equal(blobId(published), prior.blob);
    candidates.set(p, transformFooter(p, published));
  }
  await checkPublishedBase();
  if (process.argv.includes('--check-published-base') || process.argv.includes('--validate-only')) {
    console.log('Verified approved footer changes and unchanged publication base.'); return;
  }
  assert.ok(process.argv.includes('--prepare-pages'));
  assert.equal(working, false); assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main'); assert.equal(process.env.GITHUB_SHA, git('rev-parse', 'HEAD'));
  const checked = execFileSync('git', ['cat-file', '--batch-check'], {
    cwd: root, input: previous.entries.map(e => e.blob + '\n').join(''), encoding: 'utf8', maxBuffer: 128 * 1024 * 1024
  }).trim().split('\n');
  for (let i = 0; i < checked.length; i++) if (checked[i].endsWith(' missing')) {
    const e = previous.entries[i];
    const r = await fetch('https://qwdwqfwq.github.io/topconf-paper-figure-gallery/' + e.path.split('/').map(encodeURIComponent).join('/') + '?release=' + baseCommit, {signal: AbortSignal.timeout(30000)});
    assert.ok(r.ok); const bytes = Buffer.from(await r.arrayBuffer());
    assert.equal(blobId(bytes), e.blob, 'Published base blob differs: ' + e.path);
    assert.equal(execFileSync('git', ['hash-object', '-w', '--stdin'], {cwd: root, input: bytes}).toString().trim(), e.blob);
  }
  const temp = mkdtempSync(join(tmpdir(), 'forge-footer-'));
  try {
    const env = {...process.env, GIT_INDEX_FILE: join(temp, 'index')};
    const indexGit = (...args) => execFileSync('git', args, {cwd: root, env, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024}).trim();
    indexGit('read-tree', '--empty');
    execFileSync('git', ['update-index', '--index-info'], {cwd: root, env,
      input: previous.entries.map(e => e.mode + ' ' + e.blob + '\t' + e.path + '\n').join(''), maxBuffer: 128 * 1024 * 1024});
    assert.equal(indexGit('write-tree'), baseTree);
    const entries = previous.entries.map(e => {
      if (!candidates.has(e.path)) return e;
      const bytes = candidates.get(e.path);
      const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], {cwd: root, input: bytes}).toString().trim();
      assert.equal(blob, blobId(bytes)); indexGit('update-index', '--add', '--cacheinfo', e.mode, blob, e.path);
      return {...e, blob};
    });
    const artifactTree = indexGit('write-tree');
    assertArtifact(git('diff', '--name-only', '--no-renames', baseTree, artifactTree).split('\n'));
    const output = '/tmp/forge-footer-pages'; assert.equal(existsSync(output), false); mkdirSync(output);
    indexGit('-c', 'core.autocrlf=false', 'checkout-index', '--all', '--prefix=' + output + '/');
    for (const e of entries) assert.equal(blobId(readFileSync(join(output, e.path))), e.blob, 'Export mismatch: ' + e.path);
    const result = {baseCommit, baseRun, baseTree, artifactTree, changedOnline: payload,
      unchangedFiles: entries.length - payload.length, allOtherPublishedBytesIdentical: true,
      figureForgeRuntimeUnchanged: true, originalFrozenCheck: 'Unchanged; preexisting failures remain failures'};
    writeFileSync('/tmp/forge-footer-proof.json', JSON.stringify({...result, entries}, null, 2));
    assert.equal(git('status', '--porcelain', '--untracked-files=all'), '');
    console.log(JSON.stringify(result, null, 2));
  } finally { rmSync(temp, {recursive: true, force: true}); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
