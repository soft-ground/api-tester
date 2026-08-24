# API Tester — Desktop shell (work in progress)

An Electron wrapper that runs API Tester as a native Windows/macOS app, **without Docker**.
It reuses the existing [`../server`](../server) (NestJS) and [`../web`](../web) (React build)
unchanged — this folder only adds the desktop lifecycle and packaging.

> Status: **milestone-1 scaffold.** The files here compile and lay out the architecture,
> but this is a new track on the `feat/desktop` branch — not yet a runnable release. Run the
> steps below on your machine (`npm install` pulls Electron, which is large).

## Why Electron (not Tauri)

The backend is Node (NestJS). Electron can host that Node process directly; Tauri's Rust core
cannot, so Tauri would mean rewriting the backend. The proxy-execution model
(browser → local server → target API) maps cleanly to desktop: the "server" is just a local
child process, so there is no CORS to fight.

## How it works

`src/main.ts` (the Electron main process):

1. picks a free local port;
2. starts the compiled Nest server (`../server/dist/main.js`) as a child process on that port,
   run with Electron's **bundled Node** (`ELECTRON_RUN_AS_NODE`), so no separate Node runtime
   is shipped;
3. waits for `GET /api/health` to return 200;
4. opens a window pointed at the server;
5. kills the server child on quit.

## The two design decisions that matter

### 1. Database — bundle Postgres, don't switch to SQLite

The Prisma schema uses the **`Json` column type in 12+ fields** (headers, authConfig,
variables, rule config/state, scenario extracts/asserts/results, …). **Prisma's `Json` type is
not supported on SQLite**, so moving to SQLite would mean converting every one of those to
`String` with manual (de)serialization across all modules — an invasive refactor that also
forks the data layer away from the Docker build (Prisma migrations are per-provider).

So we **bundle a Postgres binary** (`embedded-postgres`) and manage it as a child process
pointing at a data directory under the app's `userData`. This keeps the schema, migrations, and
server code **identical** to the Docker build — one codebase for both distributions. `src/db.ts`
owns that lifecycle: initialise the data dir on first run, start/stop `postgres`, ensure the app
database exists; `main.ts` then runs `prisma migrate deploy` against it before starting the
server. The user never sets `DATABASE_URL`. (`embedded-postgres` is ESM-only, so it is loaded
with a dynamic `import()` from the CommonJS main.)

### 2. Serving the UI — let Nest serve `web/dist`

In Docker, nginx serves the web files and proxies `/api`. The desktop app has no nginx, and the
web client calls a **relative** `/api`, so the UI must be served from the **same origin** as the
API. Milestone 2 adds a guarded static handler to the server so one port serves both:

```ts
// server/src/main.ts (guarded so the Docker build is unaffected — flag is off there)
if (process.env.STATIC_DIR) {
  const app = /* NestExpressApplication */;
  app.useStaticAssets(process.env.STATIC_DIR);           // web/dist
  // + an SPA fallback: send index.html for GET routes that aren't /api/*
}
```

Then `main.ts` sets `STATIC_DIR` to the bundled `web` resources and the window loads
`http://127.0.0.1:<port>`.

## Milestones

| # | Goal | State |
|---|------|-------|
| 1 | Electron boots Nest as a child process, health-gated window | **done** |
| 2 | Nest serves the web UI (`STATIC_DIR`) so the window shows the real app | **done** |
| 3 | Embedded Postgres (`src/db.ts`) + auto `migrate deploy` — no external DB, no `DATABASE_URL` | **done** |
| 4 | `electron-builder` installers + code signing / notarization + auto-update | draft config |

## Run (dev)

No Docker, no database setup — the app starts its own embedded Postgres.

```bash
# 1) build the server + web (once, or after they change). From the desktop folder:
cd desktop && npm install
npm run build:deps        # builds ../server and ../web
npm run build             # compiles the Electron main

# 2) launch — starts embedded Postgres, migrates it, serves the UI, opens the window
npm start
```

First launch initialises a fresh Postgres cluster under the app's `userData` dir
(Windows: `%APPDATA%\api-tester-desktop\pgdata`), so the app opens with an **empty**
workspace — separate from any Docker instance. Import a backup JSON to bring data over.

## Packaging (draft, milestone 4)

`electron-builder.yml` assembles `../server/dist` and `../web/dist` into the app as
`extraResources`. Still to wire for a real installer: bundle the server's `prisma/`
migrations + `node_modules/prisma` (the CLI) and the Prisma **query engine** for each target
OS (`binaryTargets` in `schema.prisma`), plus the `embedded-postgres` platform binary. Then
warning-free installers need an Apple Developer account (notarization) and a Windows
code-signing certificate — process/cost, not code.

```bash
npm run dist   # once the above bundling + signing are wired
```
