import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const parent = 'b444aa79795f1dd8d91e98f1ee2304325baee6e5';
const liveRelease = 'c8f26bc17383a60ddb23be0f2665dfa539990cf9';
const liveBase = '7e089379d187af99271d0d7de8ae50c2b128dc2f';
const copy = {
  'assets/i18n_gallery.js': '380c280fb901123af09fc3bef22cf309327df6b9',
  'index.html': 'bf4213892c8adda0d737d8ad4f14fa67e415e0fd',
};
const homepage = Object.keys(copy);
const releaseSupport = [
  '.github/workflows/deploy.yml',
  '.github/workflows/forge-workflow-lock.yml',
  'scripts/check-gallery-home-copy-release-20261110.mjs',
];
const changed = (...revs) => git('diff', '--name-only', '--no-renames', ...revs, '--').split('\n').sort();

assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
assert.ok(['push', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME));
assert.equal(process.env.GITHUB_SHA, git('rev-parse', 'HEAD'));
assert.equal(git('show', '-s', '--format=%P', 'HEAD'), parent);
assert.equal(git('status', '--porcelain', '--untracked-files=all'), '');
assert.deepEqual(changed(parent, 'HEAD'), [...homepage, ...releaseSupport].sort());
for (const [path, blob] of Object.entries(copy)) {
  assert.equal(git('ls-files', '--stage', '--', path), `100644 ${blob} 0\t${path}`);
}

if (process.argv[2] === '--prepare-pages') {
  // Use the same published tree as the previous release, with only the two new homepage blobs.
  const published = [...homepage, 'forge/index.html'].sort();
  const unpublished = changed(liveBase, 'HEAD').filter(path => !published.includes(path));
  git('restore', `--source=${liveBase}`, '--staged', '--worktree', '--ignore-skip-worktree-bits', '--', ...unpublished);
  assert.deepEqual(changed('--cached', liveBase), published);
  assert.equal(git('rev-parse', ':forge/index.html'), git('rev-parse', `${liveRelease}:forge/index.html`));
  for (const [path, blob] of Object.entries(copy)) {
    assert.equal(git('rev-parse', `:${path}`), blob);
  }
  git('diff', '--exit-code');
}

console.log('Verified the one-time homepage copy release.');
