import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const forge = join(root, 'forge');
const manifestPath = join(root, '.github', 'forge-workflow-lock.json');
const protectedNames = readdirSync(forge)
  .filter((name) => /\.(?:html|js|mjs|json)$/.test(name) && !name.startsWith('test-'))
  .sort();
const digest = (name) => createHash('sha256')
  .update(readFileSync(join(forge, name), 'utf8').replace(/\r\n/g, '\n'))
  .digest('hex');
const snapshot = Object.fromEntries(protectedNames.map((name) => [`forge/${name}`, digest(name)]));

if (process.argv.includes('--record')) {
  writeFileSync(manifestPath, `${JSON.stringify({
    description: 'Owner-approved FigureForge Step 3 and Step 4 workflow baseline. Changes require explicit owner consent.',
    algorithm: 'sha256',
    files: snapshot,
  }, null, 2)}\n`);
  console.log(`Recorded ${protectedNames.length} protected files in ${relative(root, manifestPath)}.`);
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const expected = manifest.files ?? {};
const allNames = new Set([...Object.keys(expected), ...Object.keys(snapshot)]);
const changed = [...allNames].filter((name) => expected[name] !== snapshot[name]);
if (changed.length) {
  console.error('FigureForge Step 3 / Step 4 workflow lock failed. Owner consent is required before changing the protected baseline:');
  for (const name of changed) console.error(`  ${name}: ${name in expected ? (name in snapshot ? 'modified' : 'removed') : 'added'}`);
  process.exit(1);
}
console.log(`FigureForge workflow lock verified (${protectedNames.length} protected files).`);
