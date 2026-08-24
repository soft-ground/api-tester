// Electron main process for the desktop build of API Tester.
//
// Lifecycle: pick a free local port -> start the NestJS server (the same server/ code
// used by the Docker build) as a child process on that port -> wait for /api/health ->
// open a window pointed at it. On quit, the server child is killed.
//
// The server runs on Electron's bundled Node (ELECTRON_RUN_AS_NODE=1 + process.execPath),
// so the package does not need a separate Node runtime.
//
// SCAFFOLD STATUS (milestone 1): brings up Electron + Nest and proves the lifecycle.
// It expects a DATABASE_URL in the environment (point it at any Postgres for now).
//   - Milestone 2 replaces that with an embedded Postgres managed here (see db.ts) and
//     serves the web UI from Nest (STATIC_DIR) so the window shows the real app.
//   - Milestone 3 adds electron-builder packaging + code signing/notarization.
// See README.md in this folder for the full plan.

import { app, BrowserWindow, dialog } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';

let serverProc: ChildProcess | null = null;

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

// Compiled Nest entry: server/dist/main.js in dev, resources/server/main.js when packaged.
function serverEntry(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'server', 'main.js');
  }
  return path.join(__dirname, '..', '..', 'server', 'dist', 'main.js');
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
  if (!process.env.DATABASE_URL) {
    // Milestone 1 needs an external, already-migrated Postgres. Milestone 2 embeds it.
    return {
      ok: false,
      message:
        `DATABASE_URL is not set.\n\n` +
        `Milestone 1 points at an existing Postgres. The quickest option is the Docker db:\n` +
        `  docker compose up -d db\n` +
        `then set (PowerShell):\n` +
        `  $env:DATABASE_URL = "postgresql://<user>:<pw>@localhost:8473/<db>?schema=public"\n\n` +
        `Milestone 2 will bundle Postgres so this step goes away.`,
    };
  }
  return { ok: true };
}

async function startServer(port: number): Promise<void> {
  serverProc = spawn(process.execPath, [serverEntry()], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1', // run the entry as plain Node, not a second Electron
      NODE_ENV: 'production',
      PORT: String(port),
      // Milestone 1: supply DATABASE_URL yourself, pointed at an already-migrated Postgres.
      // (The Docker entrypoint runs `prisma migrate deploy` before the server; the desktop
      //  lifecycle must do the same — milestone 2's db.ts runs it before startServer.)
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      // Milestone 2: set STATIC_DIR to web/dist so Nest serves the UI on the same origin.
      // STATIC_DIR: process.env.STATIC_DIR ?? '',
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

app.whenReady().then(async () => {
  const check = preflight();
  if (!check.ok) {
    dialog.showErrorBox('API Tester — cannot start', check.message);
    app.quit();
    return;
  }
  try {
    const port = Number(process.env.SERVER_PORT) || (await freePort());
    await startServer(port);
    await createWindow(port);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow(port);
    });
  } catch (err) {
    dialog.showErrorBox(
      'API Tester — server failed to start',
      `${(err as Error).message}\n\nCheck that DATABASE_URL points at a reachable, ` +
        `migrated Postgres. See the server output in the terminal for details.`,
    );
    serverProc?.kill();
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Make sure the server child never outlives the app.
app.on('quit', () => serverProc?.kill());
