// Fail the build if a packaged app is missing the files it cannot start without.
//
// embedded-postgres ships its Postgres binaries as per-platform *optional* npm dependencies
// (@embedded-postgres/<platform>-<arch>). npm treats a failed optional install as non-fatal, so a
// flaky install produces an installer that builds, uploads and publishes fine — and then fails at
// every launch ("Cannot find package '@embedded-postgres/windows-x64'"). That happened once: the
// 0.1.8 Windows installer was 30 MB smaller than 0.1.7 and nothing in CI noticed. Because the
// updater only starts after a successful boot, such a release cannot even update itself — so the
// check has to happen before it is published.
//
// Checks every unpacked app under release/: the platform package must exist, with the actual
// postgres binary inside it, and match the architecture of the folder it was built for.
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const releaseDir = join(here, '..', 'release');

// electron-builder's unpacked output folder -> [where node_modules lives, expected engine package]
const TARGETS = [
  { dir: 'win-unpacked', app: 'resources/app', pkg: 'windows-x64', bin: 'postgres.exe' },
  { dir: 'linux-unpacked', app: 'resources/app', pkg: 'linux-x64', bin: 'postgres' },
  { dir: 'mac', app: 'API Tester.app/Contents/Resources/app', pkg: 'darwin-x64', bin: 'postgres' },
  { dir: 'mac-arm64', app: 'API Tester.app/Contents/Resources/app', pkg: 'darwin-arm64', bin: 'postgres' },
];

const checked = [];
const problems = [];
for (const t of TARGETS) {
  const root = join(releaseDir, t.dir);
  if (!existsSync(root)) continue;
  const base = join(root, t.app, 'node_modules', '@embedded-postgres', t.pkg);
  const bin = join(base, 'native', 'bin', t.bin);
  checked.push(t.dir);
  if (!existsSync(base)) {
    problems.push(`${t.dir}: missing @embedded-postgres/${t.pkg} (${base})`);
  } else if (!existsSync(bin)) {
    problems.push(`${t.dir}: @embedded-postgres/${t.pkg} is present but ${t.bin} is missing`);
  }
}

if (checked.length === 0) {
  console.error(`[verify-package] no unpacked app found under ${releaseDir} — nothing was verified`);
  process.exit(1);
}
if (problems.length) {
  console.error('[verify-package] FAILED — the package would not start:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`[verify-package] ok: ${checked.join(', ')}`);
