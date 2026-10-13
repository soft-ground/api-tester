// Electron main process for the desktop build of API Tester. Fully standalone — no Docker.
//
// Lifecycle: show a window immediately with a local loading screen -> start an embedded
// Postgres under userData -> run `prisma migrate deploy` -> start the NestJS server (the same
// server/ code the Docker build uses) as a child process, pointed at that DB and serving the
// web UI (STATIC_DIR) -> wait for /api/health -> swap the same window over to the real app.
// A failed boot is retried once automatically (self-heals a stale lock / a leftover process
// from a previous crash); if it fails again the loading screen shows the error with actions
// (retry / open logs / quit) instead of a silent hang or a raw stack trace.
//
// The server + prisma CLI run on Electron's bundled Node (ELECTRON_RUN_AS_NODE=1 +
// process.execPath), so the package does not need a separate Node runtime.

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { startEmbeddedPostgres, type EmbeddedDb } from './db';
import { installAppMenu } from './menu';

// A development run (`electron .`) must never share the installed app's user data. Electron derives
// the userData folder from package.json's "name", so both resolve to %APPDATA%\api-tester-desktop —
// meaning a dev run would boot against the real embedded database, and routine "reset my test
// data" cleanup would wipe the user's actual collections and history. Must run before anything
// reads userData (the single-instance lock, the log file, the Postgres data dir).
if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'api-tester-desktop-dev'));
}

let serverProc: ChildProcess | null = null;
let embeddedDb: EmbeddedDb | null = null;
let mainWindow: BrowserWindow | null = null;
let logFd: number | null = null;

// --- logging -----------------------------------------------------------------------------
// Everything main.ts logs itself, plus the server child's stdout/stderr (piped to the same
// fd instead of 'inherit', which is unreliable for a GUI-subsystem app with no console), goes
// to one file the "open logs" boot-error action can point the user at.
function logPath(): string {
  return path.join(app.getPath('userData'), 'logs', 'main.log');
}

function openLog(): number {
  const p = logPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  logFd = fs.openSync(p, 'a');
  return logFd;
}

function log(line: string): void {
  const stamped = `[${new Date().toISOString()}] ${line}\n`;
  console.log(line);
  if (logFd !== null) fs.appendFileSync(logFd, stamped);
}

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

// The local loading screen shown until the server passes its health check.
function loadingHtmlPath(): string {
  return path.join(__dirname, 'loading.html');
}

// Apply pending Prisma migrations to the embedded DB before the server starts (mirrors the
// Docker entrypoint's `prisma migrate deploy`). Runs the prisma CLI on Electron's Node.
function runMigrations(databaseUrl: string): Promise<void> {
  const prismaCli = path.join(serverDir(), 'node_modules', 'prisma', 'build', 'index.js');
  return new Promise((resolve, reject) => {
    const fd = logFd ?? undefined;
    const proc = spawn(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      cwd: serverDir(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DATABASE_URL: databaseUrl },
      stdio: ['ignore', fd ?? 'pipe', fd ?? 'pipe'],
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
  const fd = logFd ?? undefined;
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
    stdio: ['ignore', fd ?? 'pipe', fd ?? 'pipe'],
  });
  serverProc.on('exit', (code) => log(`[server] exited with code ${code}`));
  await waitForHealth(port);
}

// Undo whatever a failed/partial boot attempt started, so a retry begins from a clean slate.
async function teardown(): Promise<void> {
  serverProc?.kill();
  serverProc = null;
  await embeddedDb?.stop().catch((err) => log(`[postgres] stop failed during teardown: ${err}`));
  embeddedDb = null;
}

function sendBoot(stage: 'db' | 'migrate' | 'server' | 'retry'): void {
  mainWindow?.webContents.send('boot:status', { stage });
}

function sendBootError(message: string): void {
  mainWindow?.webContents.send('boot:error', { message });
}

async function bootAttempt(port: number): Promise<void> {
  sendBoot('db');
  embeddedDb = await startEmbeddedPostgres(await freePort());
  sendBoot('migrate');
  await runMigrations(embeddedDb.databaseUrl);
  sendBoot('server');
  await startServer(port, embeddedDb.databaseUrl);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Boot the backend, retrying (after a full teardown) on failure — this alone recovers from the
// most common transient failures: a leftover Postgres/server process or lock file from a
// previous crash or force-quit, or a file the OS/antivirus briefly held onto. The backoff delay
// gives that kind of transient condition a moment to clear before the next attempt.
//
// The error screen is a dead end the user has to read and act on, so it must only appear once
// there is truly nothing left to try automatically — never while a retry is still queued, or
// the user is asked to intervene in a problem that was about to fix itself.
const MAX_BOOT_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [1000, 2500];

async function boot(): Promise<void> {
  const check = preflight();
  if (!check.ok) {
    sendBootError(check.message);
    log(`[boot] preflight failed: ${check.message}`);
    return;
  }
  const port = Number(process.env.SERVER_PORT) || (await freePort());
  for (let attempt = 1; attempt <= MAX_BOOT_ATTEMPTS; attempt++) {
    try {
      await bootAttempt(port);
      await mainWindow?.loadURL(process.env.VITE_DEV_SERVER_URL ?? `http://127.0.0.1:${port}`);
      initAutoUpdater();
      return;
    } catch (err) {
      log(`[boot] attempt ${attempt}/${MAX_BOOT_ATTEMPTS} failed: ${(err as Error).message}`);
      await teardown();
      const isLastAttempt = attempt === MAX_BOOT_ATTEMPTS;
      if (isLastAttempt) {
        sendBootError((err as Error).message);
        return;
      }
      await delay(RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]);
      sendBoot('retry');
    }
  }
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    // Without this the title bar / taskbar show Electron's own icon in development and on Linux
    // (Windows and macOS packaged builds take it from the exe / app bundle, but this is harmless).
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(loadingHtmlPath());
  return win;
}

// The releases LIST, not /releases/latest: this repo publishes web/server (vX.Y.Z) and desktop
// (desktop-vX.Y.Z) releases side by side, so "latest" can resolve to the other product's release.
const RELEASES_URL = 'https://github.com/soft-ground/api-tester/releases';

// Silent self-install (download in the background, install on restart) only works on Windows
// here:
//  - macOS needs a signed .zip asset for Squirrel.Mac to apply the update; we only publish a
//    .dmg (see electron-builder.yml), so a real download attempt fails with
//    ERR_UPDATER_ZIP_FILE_NOT_FOUND.
//  - Linux's .deb path exists in electron-updater, but it installs via `dpkg`/`apt` and pops a
//    graphical sudo/polkit password prompt to do it — the opposite of the quiet, no-interruption
//    update this app aims for. (.tar.gz has no self-update path at all.)
// Both still get a version *check*: autoDownload is left off, so checkForUpdates() only asks the
// GitHub Releases feed "is there something newer" and never attempts a platform download that
// would throw or prompt. The renderer is told to point the user at the releases page instead.
const SUPPORTS_SILENT_SELF_INSTALL = process.platform === 'win32';

// Check the GitHub Releases feed for a newer version. On Windows, download it fully in the
// background — no interruption, no native OS notification — and once it's ready tell the
// renderer via 'update:status' so it can show its own small "restart to update" affordance; the
// user decides when to act on it. On macOS/Linux, just tell the renderer a newer version exists
// so it can point the user at the releases page for a manual download. Deliberately non-fatal: a
// failed check (offline, no release yet) is logged and ignored so it never affects the running app.
function initAutoUpdater(): void {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = SUPPORTS_SILENT_SELF_INSTALL;
  autoUpdater.on('error', (err) => log(`[updater] ${err}`));
  if (SUPPORTS_SILENT_SELF_INSTALL) {
    autoUpdater.on('update-downloaded', (info) => {
      publishUpdateStatus({ status: 'ready', version: info.version });
    });
  } else {
    autoUpdater.on('update-available', (info) => {
      publishUpdateStatus({ status: 'manual', version: info.version });
    });
  }
  void autoUpdater.checkForUpdates().catch((err) => log(`[updater] ${err}`));
}

// The updater events fire exactly once, so the renderer can't be the source of truth: a page
// reload or a React remount would lose the status and nothing would ever resend it. Remember it
// here and let the renderer ask ('update:get-status') whenever it mounts.
type UpdateStatus = { status: 'ready' | 'manual'; version: string };
let lastUpdateStatus: UpdateStatus | null = null;

function publishUpdateStatus(s: UpdateStatus): void {
  lastUpdateStatus = s;
  mainWindow?.webContents.send('update:status', s);
  applyAppMenu(); // adds the "apply update" Help item once an update is ready
}

function applyAppMenu(): void {
  const ready = lastUpdateStatus?.status === 'ready' ? lastUpdateStatus.version : null;
  installAppMenu({
    logsDir: path.dirname(logPath()),
    releasesUrl: RELEASES_URL,
    update: ready ? { version: ready, restart: () => autoUpdater.quitAndInstall() } : null,
  });
}

ipcMain.handle('update:get-status', () => lastUpdateStatus);

ipcMain.on('boot:retry', () => {
  void boot();
});
ipcMain.on('boot:open-logs', () => {
  void shell.openPath(path.dirname(logPath()));
});
ipcMain.on('boot:quit', () => {
  app.quit();
});
ipcMain.on('update:restart', () => {
  autoUpdater.quitAndInstall();
});
ipcMain.on('update:open-releases', () => {
  void shell.openExternal(RELEASES_URL);
});

// Some Windows machines deny Chromium's separate GPU process (exit 0xC0000022 ACCESS_DENIED —
// typically security software or a graphics-driver issue). Electron then kills the app on
// launch after repeated GPU crashes ("GPU process isn't usable. Goodbye."), so no window ever
// appears. Running GPU work in-process with software rendering avoids spawning that denied
// subprocess entirely; the cost is negligible for this lightweight (forms/tables/JSON) UI.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('in-process-gpu');

// Only one instance may run — a second launch would fight over the embedded Postgres data
// dir. The primary instance brings its window to the front when another launch is attempted.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (gotSingleInstanceLock) {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

app.whenReady().then(async () => {
  openLog();
  if (!gotSingleInstanceLock) {
    // Second instance: tell the user instead of silently disappearing, then quit. The primary
    // instance focuses its window via the 'second-instance' handler above.
    dialog.showMessageBoxSync({
      type: 'info',
      title: 'API Tester',
      message: 'API Tester is already running.',
      detail:
        'Only one instance can run at a time because they share one local database. ' +
        'The existing window has been brought to the front.',
      buttons: ['OK'],
    });
    app.quit();
    return;
  }
  applyAppMenu();
  mainWindow = createMainWindow();
  mainWindow.webContents.once('did-finish-load', () => {
    void boot();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();
  });
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
    .catch((err) => log(`[postgres] stop failed: ${err}`))
    .finally(() => app.quit());
  if (!embeddedDb) app.quit();
});
