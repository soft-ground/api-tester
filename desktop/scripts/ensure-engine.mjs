// Make sure this machine's embedded-postgres engine package is really installed, repairing it if not.
//
// The engine ships as a per-platform *optional* npm package (@embedded-postgres/<platform>-<arch>,
// ~1,500 files incl. DLLs). On a Windows CI runner npm sometimes fails to extract it — the real
// 0.1.8 log shows `EPERM: operation not permitted, unlink '...\btree_gist.dll'` (a freshly written
// DLL still held by the OS, most likely real-time scanning) — and then fails to clean the folder up
// too. npm still exits 0, leaving a half-removed directory, and the installer built from it cannot
// start. The failure is transient, so retry the install instead of only detecting it: remove the
// leftovers (with retries, since the same lock can hit the removal) and install the package again.
//
// Runs before the template build and packaging. Exits 1 if the engine still is not usable, so a
// genuinely broken environment still stops the build.
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE_PACKAGE = {
  'win32-x64': { pkg: 'windows-x64', bin: 'postgres.exe' },
  'linux-x64': { pkg: 'linux-x64', bin: 'postgres' },
  'darwin-x64': { pkg: 'darwin-x64', bin: 'postgres' },
  'darwin-arm64': { pkg: 'darwin-arm64', bin: 'postgres' },
};

const host = ENGINE_PACKAGE[`${process.platform}-${process.arch}`];
if (!host) {
  console.log(`[ensure-engine] no engine package is defined for ${process.platform}-${process.arch}; skipping`);
  process.exit(0);
}

const pkgDir = join(desktopDir, 'node_modules', '@embedded-postgres', host.pkg);
const binPath = join(pkgDir, 'native', 'bin', host.bin);
const usable = () => existsSync(join(pkgDir, 'package.json')) && existsSync(binPath);

if (usable()) {
  console.log(`[ensure-engine] ok: @embedded-postgres/${host.pkg}`);
  process.exit(0);
}

// The platform packages are versioned in lockstep with embedded-postgres itself.
const version = JSON.parse(
  readFileSync(join(desktopDir, 'node_modules', 'embedded-postgres', 'package.json'), 'utf8'),
).version;
const spec = `@embedded-postgres/${host.pkg}@${version}`;

const MAX_ATTEMPTS = 4;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  console.warn(`[ensure-engine] ${spec} is missing or incomplete — repair attempt ${attempt}/${MAX_ATTEMPTS}`);
  try {
    rmSync(pkgDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 1000 });
  } catch (e) {
    console.warn(`[ensure-engine] could not clear the leftover folder yet: ${e.code ?? e.message}`);
  }
  const r = spawnSync('npm', ['install', spec, '--no-save', '--no-audit', '--no-fund', '--force'], {
    cwd: desktopDir,
    stdio: 'inherit',
    shell: true, // npm is npm.cmd on Windows
  });
  if (usable()) {
    console.log(`[ensure-engine] repaired: ${spec} (npm exit ${r.status})`);
    process.exit(0);
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 3000);
}

console.error(
  `[ensure-engine] FAILED: ${spec} is still not usable after ${MAX_ATTEMPTS} attempts ` +
    `(expected ${binPath}). The packaged app would not start.`,
);
process.exit(1);
