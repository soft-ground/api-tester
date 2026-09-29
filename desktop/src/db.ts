import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Minimal surface of embedded-postgres (ESM-only) that we actually use.
interface PgCluster {
  initialise(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  createDatabase(name: string): Promise<void>;
}
type PgCtor = new (opts: Record<string, unknown>) => PgCluster;

// Load an ESM-only module from this CommonJS bundle. Written via the Function constructor so
// TypeScript (module: CommonJS) does not downlevel it to require(), which would throw
// ERR_REQUIRE_ESM on Node 20.
const importEsm = new Function('s', 'return import(s)') as (s: string) => Promise<unknown>;

// Also used by scripts/build-pg-template.mjs, which must initialise a template cluster with
// these exact same credentials — otherwise a copied template's baked-in superuser won't match
// what startEmbeddedPostgres() connects with.
export const PG_USER = 'apitester';
export const PG_PASSWORD = 'apitester-local'; // local-only; the cluster binds to 127.0.0.1
export const PG_DB = 'apitester';

// Identifies which machine a pre-built pg-template belongs to. initdb bakes in the exact
// Postgres build (and its locale/encoding decisions), so a template built for one platform+arch
// must never be reused on another — see startEmbeddedPostgres()'s check against this.
export function archTag(): string {
  return `${process.platform}-${process.arch}`;
}

export interface EmbeddedDb {
  databaseUrl: string;
  stop: () => Promise<void>;
}

// Is a process with this pid currently running? (signal 0 = existence check)
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'; // exists but not ours
  }
}

// After an ungraceful exit (crash / force-kill), Postgres can leave a postmaster.pid behind.
// If the pid in it is dead, remove the stale lock so the cluster can start again. (A live
// instance is prevented by the single-instance lock in main.ts, so a dead pid here is safe
// to clear.)
function clearStaleLock(dataDir: string): void {
  const pidFile = path.join(dataDir, 'postmaster.pid');
  if (!fs.existsSync(pidFile)) return;
  const pid = Number(fs.readFileSync(pidFile, 'utf8').split('\n')[0]?.trim());
  if (!pid || !isAlive(pid)) {
    fs.rmSync(pidFile, { force: true });
  }
}

// resources/pg-template when packaged (bundled by build-pg-template.mjs + electron-builder's
// extraResources), desktop/resources/pg-template in dev. Absent entirely for a dev checkout that
// hasn't run `npm run build:pg-template` — seedFromTemplate() treats that the same as an
// arch mismatch and falls back to a normal initdb.
function templateDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'pg-template');
  }
  return path.join(__dirname, '..', 'resources', 'pg-template');
}

// initdb (pg.initialise()) is the slow, variable part of first launch — it's what makes a fresh
// install's first start take noticeably longer than every one after. Copying a pre-initialised
// template built for this exact platform+arch skips it entirely. Only used when the template's
// ARCH_TAG matches this machine exactly (see archTag()) — a mismatched template would mean a
// data directory initialised by a different Postgres build, which is unsafe to open, the same
// class of bug as the Intel Mac Prisma engine mismatch this app already hit once. Falls back to
// a normal initdb whenever the template is missing, mismatched, or the copy itself fails, so
// this is always safe, never a hard dependency.
function seedFromTemplate(dataDir: string): boolean {
  const template = templateDir();
  const tagFile = path.join(template, 'ARCH_TAG');
  if (!fs.existsSync(tagFile)) return false;
  if (fs.readFileSync(tagFile, 'utf8').trim() !== archTag()) return false;
  try {
    fs.cpSync(template, dataDir, { recursive: true });
    fs.rmSync(path.join(dataDir, 'ARCH_TAG'), { force: true });
    return true;
  } catch (e) {
    console.error('[postgres] failed to seed from template, falling back to initdb', e);
    fs.rmSync(dataDir, { recursive: true, force: true });
    return false;
  }
}

// Start (initialising on first run) an embedded Postgres cluster under the app's userData dir
// and ensure the app database exists. This is what makes the desktop build fully standalone:
// no external Postgres and no DATABASE_URL to set by hand.
export async function startEmbeddedPostgres(port: number): Promise<EmbeddedDb> {
  const mod = (await importEsm('embedded-postgres')) as { default: PgCtor };
  const EmbeddedPostgres = mod.default;

  const dataDir = path.join(app.getPath('userData'), 'pgdata');
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: PG_USER,
    password: PG_PASSWORD,
    port,
    authMethod: 'scram-sha-256',
    persistent: true, // keep data between launches
    // Deterministic regardless of the host OS's locale (matches build-pg-template.mjs, so a
    // template-seeded and a freshly-initdb'd cluster are never subtly different) — and avoids
    // initdb warnings like "could not find suitable text search configuration for locale
    // Korean_Korea.949" on non-English Windows installs.
    initdbFlags: ['--locale=C', '--encoding=UTF8'],
    // PostgreSQL 18 defaults to async I/O worker subprocesses; under Electron's process
    // management (job object) those workers crash ("io worker terminated by exception
    // 0xFFFFFFFF"), taking the server down mid-startup. Force synchronous I/O so no worker
    // subprocesses are spawned — stable, at a negligible cost for a local single-user DB.
    postgresFlags: ['-c', 'io_method=sync'],
    onError: (e: unknown) => console.error('[postgres]', e),
  });

  // First run only (empty data dir): seed from a pre-built template if one matches this exact
  // platform+arch, otherwise fall back to running initdb ourselves.
  if (!fs.existsSync(path.join(dataDir, 'PG_VERSION')) && !seedFromTemplate(dataDir)) {
    await pg.initialise();
  }
  clearStaleLock(dataDir); // self-heal after a previous ungraceful exit
  await pg.start();

  // Ensure the app database exists (created once; ignore "already exists").
  try {
    await pg.createDatabase(PG_DB);
  } catch {
    /* already exists */
  }

  const databaseUrl =
    `postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${port}/${PG_DB}?schema=public`;
  return { databaseUrl, stop: () => pg.stop() };
}
