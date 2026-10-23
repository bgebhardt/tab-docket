// Builds dist/tab-docket-vX.Y.Z.zip: only the files the browser needs, inside one top-level
// folder so that unzipping gives a single folder to "Load unpacked". No dependencies; needs the
// `zip` command (macOS and Linux have it).
//
//   npm run release

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const manifest = JSON.parse(read('manifest.json'));
const pkg = JSON.parse(read('package.json'));
const version = manifest.version;

// ---- sanity checks: refuse to ship an inconsistent release ----
const problems = [];
if (pkg.version !== version) problems.push(`package.json is ${pkg.version} but manifest.json is ${version}`);
if (!read('CHANGELOG.md').includes(`## [${version}]`)) problems.push(`CHANGELOG.md has no entry for ${version}`);
if (!/Copyright \(c\) \d{4} Bryan Gebhardt/.test(read('LICENSE'))) problems.push('LICENSE copyright line is missing');

const referenced = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  manifest.options_ui?.page,
  ...Object.values(manifest.icons ?? {}),
].filter(Boolean);
for (const file of referenced) if (!existsSync(join(root, file))) problems.push(`manifest references missing file ${file}`);
if (problems.length) {
  console.error('Cannot build a release:\n- ' + problems.join('\n- '));
  process.exit(1);
}

// ---- stage the runtime files ----
const include = [
  'manifest.json',
  'background.js',
  'LICENSE',
  'PRIVACY.md',
  'README.md',
  'CHANGELOG.md',
  'lib',
  'popup',
  'board',
  'options',
  'styles',
  'icons',
];
const name = `tab-docket-v${version}`;
const dist = join(root, 'dist');
const stage = join(dist, name);
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const entry of include) cpSync(join(root, entry), join(stage, entry), { recursive: true });

// Defensive: never ship editor/OS junk.
const strip = (dir) => {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    if (f.name === '.DS_Store') rmSync(join(dir, f.name));
    else if (f.isDirectory()) strip(join(dir, f.name));
  }
};
strip(stage);

// ---- zip + checksum ----
const zip = join(dist, `${name}.zip`);
rmSync(zip, { force: true });
execFileSync('zip', ['-r', '-X', '-q', `${name}.zip`, name], { cwd: dist });
rmSync(stage, { recursive: true, force: true });

const sha = createHash('sha256').update(readFileSync(zip)).digest('hex');
writeFileSync(`${zip}.sha256`, `${sha}  ${name}.zip\n`);
console.log(`Built ${zip}\nSHA-256 ${sha}`);
