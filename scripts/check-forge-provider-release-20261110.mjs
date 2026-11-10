import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const parent = '7226ad650102ed44d21134abadafb6d8aaf4addf';
const liveBase = '7e089379d187af99271d0d7de8ae50c2b128dc2f';
const publishedBlobs = {
  'forge/index.html': 'ef1fc92fb8d7891b59e91a734206021b1e811e20',
  'assets/i18n_gallery.js': '380c280fb901123af09fc3bef22cf309327df6b9',
  'index.html': 'bf4213892c8adda0d737d8ad4f14fa67e415e0fd',
};
const published = Object.keys(publishedBlobs).sort();
const releaseSupport = [
  '.github/workflows/deploy.yml',
  '.github/workflows/forge-workflow-lock.yml',
  'scripts/check-forge-provider-release-20261110.mjs',
];
const changed = (...revs) => git('diff', '--name-only', '--no-renames', ...revs, '--').split('\n').sort();

assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
assert.ok(['push', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME));
assert.equal(process.env.GITHUB_SHA, git('rev-parse', 'HEAD'));
assert.equal(git('show', '-s', '--format=%P', 'HEAD'), parent);
assert.equal(git('status', '--porcelain', '--untracked-files=all'), '');
assert.deepEqual(changed(parent, 'HEAD'), ['forge/index.html', ...releaseSupport].sort());
for (const [path, blob] of Object.entries(publishedBlobs)) {
  assert.equal(git('ls-files', '--stage', '--', path), `100644 ${blob} 0\t${path}`);
}

if (process.argv[2] === '--prepare-pages') {
  // Rebuild the last published tree with the approved provider selector change.
  const unpublished = changed(liveBase, 'HEAD').filter(path => !published.includes(path));
  git('restore', `--source=${liveBase}`, '--staged', '--worktree', '--ignore-skip-worktree-bits', '--', ...unpublished);
  assert.deepEqual(changed('--cached', liveBase), published);
  for (const [path, blob] of Object.entries(publishedBlobs)) {
    assert.equal(git('rev-parse', `:${path}`), blob);
  }
  git('diff', '--exit-code');
}

console.log('Verified the one-time FigureForge provider selector release.');
