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

So the plan is to **bundle a Postgres binary** and manage it as a child process pointing at a
data directory under the app's `userData`. This keeps the schema, migrations, and server code
**identical** to the Docker build — one codebase for both distributions. (`src/db.ts`,
milestone 2, will own that lifecycle: init the data dir on first run, start/stop `postgres`,
run `prisma migrate deploy`.)

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
| 1 | Electron boots Nest as a child process, health-gated window | **scaffolded here** |
| 2 | Embedded Postgres (`src/db.ts`) + Nest serves the UI (`STATIC_DIR`) | planned |
| 3 | `electron-builder` installers + code signing / notarization + auto-update | draft config |

## Run the milestone-1 scaffold (dev)

```bash
# 1) build the server and web once (from the repo root)
cd server && npm install && npm run build && cd ..
cd web    && npm install && npm run build && cd ..

# 2) install + build the desktop shell
cd desktop && npm install && npm run build

# 3) provide a Postgres to point at for now (milestone 2 makes this embedded).
#    e.g. reuse the Docker db:  docker compose up -d db
export DATABASE_URL="postgresql://apitester:<pw>@localhost:8473/apitester?schema=public"

# 4) launch — for now this shows the served API; wiring the UI is milestone 2
npm start
```

## Packaging (draft, milestone 3)

`electron-builder.yml` assembles `../server/dist` and `../web/dist` into the app as
`extraResources`. Producing warning-free installers needs an Apple Developer account
(notarization) and a Windows code-signing certificate — process/cost, not code.

```bash
npm run dist   # once signing + embedded Postgres are wired
```
