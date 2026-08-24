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

const PG_USER = 'apitester';
const PG_PASSWORD = 'apitester-local'; // local-only; the cluster binds to 127.0.0.1
const PG_DB = 'apitester';

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
    onError: (e: unknown) => console.error('[postgres]', e),
  });

  // initialise() runs initdb; only needed the first time (empty data dir).
  if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
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
