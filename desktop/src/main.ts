// Electron main process for the desktop build of API Tester. Fully standalone — no Docker.
//
// Lifecycle: start an embedded Postgres under userData -> run `prisma migrate deploy` ->
// start the NestJS server (the same server/ code the Docker build uses) as a child process,
// pointed at that DB and serving the web UI (STATIC_DIR) -> wait for /api/health -> open a
// window. On quit, the server child is killed and Postgres is stopped.
//
// The server + prisma CLI run on Electron's bundled Node (ELECTRON_RUN_AS_NODE=1 +
// process.execPath), so the package does not need a separate Node runtime.
//
// Remaining: milestone 4 — electron-builder packaging (bundle server/, web/, prisma engine +
// migrations) + code signing/notarization. See README.md.

import { app, BrowserWindow, dialog } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { startEmbeddedPostgres, type EmbeddedDb } from './db';

let serverProc: ChildProcess | null = null;
let embeddedDb: EmbeddedDb | null = null;

// Ask the OS for an unused TCP port so two instances never clash.
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

// server/ root (dist/ + node_modules/ + prisma/): the repo folder in dev, resources/server when
// packaged (electron-builder copies those into resources/server via extraResources).
function serverDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'server');
  }
  return path.join(__dirname, '..', '..', 'server');
}

// Compiled Nest entry — same relative layout in dev and packaged: <serverDir>/dist/main.js.
function serverEntry(): string {
  return path.join(serverDir(), 'dist', 'main.js');
}

// The web build the server serves as the UI (STATIC_DIR): web/dist in dev, resources/web packaged.
function webDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'web');
  }
  return path.join(__dirname, '..', '..', 'web', 'dist');
}

// Apply pending Prisma migrations to the embedded DB before the server starts (mirrors the
// Docker entrypoint's `prisma migrate deploy`). Runs the prisma CLI on Electron's Node.
function runMigrations(databaseUrl: string): Promise<void> {
  const prismaCli = path.join(serverDir(), 'node_modules', 'prisma', 'build', 'index.js');
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      cwd: serverDir(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });
    proc.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`prisma migrate deploy exited with ${code}`)),
    );
    proc.on('error', reject);
  });
}

// Poll /api/health until the server answers 200 or we time out.
function waitForHealth(port: number, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const retry = () => {
      if (Date.now() > deadline) reject(new Error('server health-check timed out'));
      else setTimeout(tick, 400);
    };
    const tick = () => {
      const req = http.get(
        { host: '127.0.0.1', port, path: '/api/health', timeout: 1500 },
        (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else retry();
        },
      );
      req.on('error', retry);
      req.on('timeout', () => {
        req.destroy();
        retry();
      });
    };
    tick();
  });
}

// Fail early with an actionable message instead of a cryptic child-process crash.
function preflight(): { ok: true } | { ok: false; message: string } {
  const entry = serverEntry();
  if (!fs.existsSync(entry)) {
    return {
      ok: false,
      message:
        `The server build was not found at:\n${entry}\n\n` +
        `Build it first (from the repo root):\n  cd server && npm install && npm run build\n\n` +
        `Or, from this folder, run: npm run build:deps`,
    };
  }
  const indexHtml = path.join(webDir(), 'index.html');
  if (!fs.existsSync(indexHtml)) {
    return {
      ok: false,
      message:
        `The web build was not found at:\n${indexHtml}\n\n` +
        `Build it first (from the repo root):\n  cd web && npm install && npm run build\n\n` +
        `Or, from this folder, run: npm run build:deps`,
    };
  }
  return { ok: true };
}

async function startServer(port: number, databaseUrl: string): Promise<void> {
  serverProc = spawn(process.execPath, [serverEntry()], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1', // run the entry as plain Node, not a second Electron
      NODE_ENV: 'production',
      PORT: String(port),
      DATABASE_URL: databaseUrl, // the embedded Postgres started above
      // Serve the web UI from the server so the window shows the real app on one origin.
      STATIC_DIR: process.env.STATIC_DIR ?? webDir(),
    },
    stdio: 'inherit',
  });
  serverProc.on('exit', (code) => console.log(`[server] exited with code ${code}`));
  await waitForHealth(port);
}

async function createWindow(port: number): Promise<void> {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // In development, load the Vite dev server if provided; otherwise the served app.
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  await win.loadURL(devUrl ?? `http://127.0.0.1:${port}`);
}

// Only one instance may run — a second launch would fight over the embedded Postgres data
// dir. If we don't get the lock, focus the existing window and quit this instance.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return; // another instance owns the DB; this one is quitting
  const check = preflight();
  if (!check.ok) {
    dialog.showErrorBox('API Tester — cannot start', check.message);
    app.quit();
    return;
  }
  try {
    embeddedDb = await startEmbeddedPostgres(await freePort());
    await runMigrations(embeddedDb.databaseUrl);
    const port = Number(process.env.SERVER_PORT) || (await freePort());
    await startServer(port, embeddedDb.databaseUrl);
    await createWindow(port);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow(port);
    });
  } catch (err) {
    dialog.showErrorBox(
      'API Tester — failed to start',
      `${(err as Error).message}\n\nSee the terminal output for details.`,
    );
    serverProc?.kill();
    await embeddedDb?.stop().catch(() => {});
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Graceful shutdown: stop the server child, then the embedded Postgres, before quitting.
let shuttingDown = false;
app.on('before-quit', (e) => {
  if (shuttingDown) return;
  e.preventDefault();
  shuttingDown = true;
  serverProc?.kill();
  void embeddedDb
    ?.stop()
    .catch((err) => console.error('[postgres] stop failed', err))
    .finally(() => app.quit());
  if (!embeddedDb) app.quit();
});
