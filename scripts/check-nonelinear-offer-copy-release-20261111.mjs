import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const parent = 'c263c72e920b6d685c9fa01885e8b40a121a82d2';
const liveBase = '7e089379d187af99271d0d7de8ae50c2b128dc2f';
const publishedBlobs = {
  'README.md': '564746dffd3e47d369e940736d38f846e565a163',
  'forge/assets/nonelinear-wechat.png': '24ece35233fea104c65298d2d530090d9403d118',
  'forge/index.html': '37207da49e234878ac74e3812ebf9935af420cb1',
  'assets/i18n_gallery.js': '380c280fb901123af09fc3bef22cf309327df6b9',
  'index.html': 'bf4213892c8adda0d737d8ad4f14fa67e415e0fd',
};
const published = Object.keys(publishedBlobs).sort();
const releaseSupport = [
  '.github/workflows/deploy.yml',
  '.github/workflows/forge-workflow-lock.yml',
  'scripts/check-nonelinear-offer-copy-release-20261111.mjs',
];
const changed = (...revs) => git('diff', '--name-only', '--no-renames', ...revs, '--').split('\n').sort();

assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
assert.ok(['push', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME));
assert.equal(process.env.GITHUB_SHA, git('rev-parse', 'HEAD'));
assert.equal(git('show', '-s', '--format=%P', 'HEAD'), parent);
assert.equal(git('status', '--porcelain', '--untracked-files=all'), '');
assert.deepEqual(changed(parent, 'HEAD'), ['README.md', ...releaseSupport].sort());
for (const [path, blob] of Object.entries(publishedBlobs)) {
  assert.equal(git('ls-files', '--stage', '--', path), `100644 ${blob} 0\t${path}`);
}

if (process.argv[2] === '--prepare-pages') {
  // Rebuild the last published tree with the owner-authorized sponsor UI change only; retain all published bitmap code.
  const unpublished = changed(liveBase, 'HEAD').filter(path => !published.includes(path));
  git('restore', `--source=${liveBase}`, '--staged', '--worktree', '--ignore-skip-worktree-bits', '--', ...unpublished);
  assert.deepEqual(changed('--cached', liveBase), published);
  for (const [path, blob] of Object.entries(publishedBlobs)) {
    assert.equal(git('rev-parse', `:${path}`), blob);
  }
  git('diff', '--exit-code');
}

console.log('Verified the one-time Nonelinear customer service offer copy release.');
