// Assemble a PRODUCTION-only copy of the server for packaging.
//
// electron-builder ships the server via `extraResources`, which are copied verbatim — it does
// not prune them. Pointing that at the dev `../server/node_modules` bundles build/test-only
// dependencies (typescript, @nestjs/cli, vitest, eslint, @types/*) into the installer, bloating
// it. This script stages `dist/ + prisma/ + package.json` and runs `npm ci --omit=dev` so the
// packaged server carries only runtime dependencies, then generates the Prisma client into that
// pruned tree. `prisma` (the CLI main.ts runs for `migrate deploy`) and `@prisma/client` are
// runtime `dependencies`, so they survive the prune.
import { rmSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(here, '..');
const serverDir = join(desktopDir, '..', 'server');
const stagingDir = join(desktopDir, 'staging');
const outDir = join(stagingDir, 'server');

console.log('[prep-server] staging a production-only server at', outDir);
rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const item of ['dist', 'prisma', 'package.json', 'package-lock.json']) {
  const src = join(serverDir, item);
  if (!existsSync(src)) {
    throw new Error(
      `[prep-server] missing ${src}\n` +
        `Build the server first from the desktop folder: npm run build:server`,
    );
  }
  cpSync(src, join(outDir, item), { recursive: true });
}

const run = (cmd) => {
  console.log('[prep-server] $', cmd);
  execSync(cmd, { cwd: outDir, stdio: 'inherit' });
};

// Install runtime deps only (no devDependencies), then (re)generate the Prisma client so the
// packaged tree has the query engine and client without relying on the dev install.
run('npm ci --omit=dev --no-audit --no-fund');
run('npx prisma generate');

console.log('[prep-server] done — packaged server will exclude devDependencies');
