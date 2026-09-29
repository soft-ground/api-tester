// Pre-run initdb once, at build time, and bundle the result as resources/pg-template.
//
// initdb is the slow, variable part of a fresh install's first launch (locale/disk dependent).
// db.ts copies this template instead of running initdb itself whenever one exists for the
// exact platform+arch being run — see seedFromTemplate() there for the safety checks (a
// template built on the wrong machine is never used; this script only ever affects first-run
// speed, never correctness).
//
// Must run AFTER `npm run build` (tsc): it imports the compiled dist/db.js for the shared
// PG_USER/PG_PASSWORD/archTag — the template's baked-in superuser credentials and its ARCH_TAG
// marker must match those exactly, or startEmbeddedPostgres() couldn't use it.
//
// Best-effort by design: run from `pack`/`dist`, but never fails the build. A template is a
// nice-to-have (faster first launch); its absence just means db.ts falls back to a normal
// initdb, exactly like before this script existed. That matters most for the macOS x64 dmg,
// which is cross-built from an arm64 CI runner that generally can't execute an x64 postgres
// binary to build a matching template — this script detects that (spawn/exec failure) and skips
// cleanly rather than failing the whole packaging step.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(here, '..');
const outDir = join(desktopDir, 'resources', 'pg-template');

async function main() {
  const { PG_USER, PG_PASSWORD, archTag } = await import(
    pathToFileURL(join(desktopDir, 'dist', 'db.js')).href
  );
  const { default: EmbeddedPostgres } = await import('embedded-postgres');

  rmSync(outDir, { recursive: true, force: true });

  const pg = new EmbeddedPostgres({
    databaseDir: outDir,
    user: PG_USER,
    password: PG_PASSWORD,
    port: 0, // never started — only initialise() runs, so no port is actually bound
    authMethod: 'scram-sha-256',
    persistent: true,
    // Deterministic output regardless of the CI runner's own locale — must match db.ts's
    // startEmbeddedPostgres() so a template-seeded and a freshly-initdb'd cluster never differ.
    initdbFlags: ['--locale=C', '--encoding=UTF8'],
    onError: (e) => console.error('[build-pg-template]', e),
  });

  await pg.initialise();
  writeFileSync(join(outDir, 'ARCH_TAG'), archTag());
  console.log(`[build-pg-template] built template for ${archTag()} at ${outDir}`);
}

main().catch((err) => {
  console.warn(
    '[build-pg-template] skipping pre-built template (this platform likely cannot run the ' +
      "target postgres binary here, e.g. macOS x64 cross-built on an arm64 runner) — db.ts's " +
      'normal initdb fallback will handle it at first launch instead.',
    err,
  );
  // Leave an empty (tag-less) directory rather than none at all: electron-builder's
  // extraResources entry for this path expects it to exist, and seedFromTemplate() in db.ts
  // already treats "no ARCH_TAG file" the same as "no template" — falls straight back to initdb.
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  process.exit(0);
});
