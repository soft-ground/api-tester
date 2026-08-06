# API Tester

[![CI](https://github.com/soft-ground/api-tester/actions/workflows/ci.yml/badge.svg)](https://github.com/soft-ground/api-tester/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

A **self-hosted web API testing tool** that runs locally with Docker.
It replaces the ad-hoc "call things one by one with Swagger/curl" workflow with **saved and
re-inspectable requests/responses**, **environment variables and dynamic values**, and
**scenario / data-driven testing**.

> The browser never calls the target API directly. The backend acts as a **proxy executor** and
> calls it on your behalf. That avoids CORS problems and records every request/response in history —
> this is the core value of the tool over Swagger/curl.

---

## Screenshots

_Screenshots live in [`docs/images/`](./docs/images) — see
[docs/images/README.md](./docs/images/README.md) for the recommended captures. Once added,
uncomment the block below._

<!--
| Request builder + Fields view | Scenario run |
|---|---|
| ![Fields view](docs/images/fields-view.png) | ![Scenario run](docs/images/scenario-run.png) |
-->

---

## Features

- **Collections & endpoints** — save and reuse APIs. Build **multi-level groups (folders)** by
  drag-and-drop (e.g. System > Domain > API, any depth).
- **Proxy execution + history** — the server makes the call for you and stores a snapshot of the
  request/response in the DB. History has **search/filter (method/status/text) and folders**.
- **Environment variables & dynamic values** — per-environment variable sets (with an active
  environment) plus rules (`fixed` / `sequence` / `expression` / `timestamp` / `uuid` / `random`).
  `{{variable}}` is substituted into URL, query, headers, body, and auth.
- **Scenarios** — run several requests in sequence, with **value extraction chained into the next
  step** and **assertions**.
- **Data-driven runs** — give it a CSV/JSON table and a scenario runs once per row, injecting each
  row's values via `{{column}}`, with per-iteration pass/fail.
- **Request body** — `none` / `json` / `form` (urlencoded) / `raw` / **`multipart` (file upload)**.
- **Auth helpers** — Bearer / Basic / API Key (header or query) injected automatically.
- **Response viewer** — status, duration, size, JSON highlighting, Pretty/Raw, and **lossless
  binary storage + download + (opt-in) preview**.
- **Import / export** — import from OpenAPI (Swagger) and curl, copy as curl, export/import a
  full-workspace backup JSON.
- **Conveniences** — quick request (call once without saving), global search (Ctrl/Cmd+K), and
  bilingual UI (English / Korean).

---

## Prerequisites

| Item | Version | Purpose | Check |
|------|---------|---------|-------|
| **Docker Desktop** | latest (with Compose v2) | run everything (required) | `docker --version`, `docker compose version` |
| Git | any | clone the source | `git --version` |
| Node.js | 20+ | optional, only for local dev without Docker | `node -v` |

> **Docker is all you need.** Node.js runs inside the containers, so you do not have to install it
> locally if you only run via Docker.

---

## Getting started (Docker)

### 1. Clone the repository

```bash
git clone https://github.com/soft-ground/api-tester.git
cd api-tester
```

### 2. Create the environment file

`.env` holds passwords and is not committed to git. Copy the sample to create it.

```bash
# macOS / Linux / Git Bash
cp .env.example .env
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

Optionally edit values such as `POSTGRES_PASSWORD` in `.env`. See [.env.example](./.env.example)
for what each variable is for.

### 3. Build & run

```bash
docker compose up --build
```

The first run takes a few minutes to build the images. Add `-d` to run in the background.

### 4. Verify

| Service | Address | Notes |
|---------|---------|-------|
| **Web UI** | http://localhost:8471 | open in a browser |
| API server | http://localhost:8472/api/health | healthy if it returns `{"status":"ok","db":"up"}` |
| PostgreSQL | localhost:8473 | for a DB client (DBeaver, etc.) |

> A **green** health badge in the bottom-left of the UI means everything is up. The DB schema is
> applied automatically when the container starts (no manual migration needed).

### 5. Stop / clean up

```bash
docker compose down        # stop containers (DB data is kept)
docker compose down -v     # also delete DB data (the volume)
```

### Run with prebuilt images (no build)

To skip the local image build, use the images published to GitHub Container Registry (GHCR):

```bash
git clone https://github.com/soft-ground/api-tester.git
cd api-tester
cp .env.example .env
docker compose -f docker-compose.ghcr.yml up -d
```

Images are published on each release. Pin a specific version by replacing `:latest` with `:1.3.0`
in [docker-compose.ghcr.yml](./docker-compose.ghcr.yml).

---

## Ports

Non-standard ports are used to avoid clashing with other projects. If a port is already in use,
change the left-hand number under `ports` in [docker-compose.yml](./docker-compose.yml).

| Service | Host port | Container port |
|---------|:---------:|:--------------:|
| web (UI) | 8471 | 80 |
| server (API) | 8472 | 3000 |
| postgres | 8473 | 5432 |
| test-api (optional) | 8474 | 3000 |

---

## Usage (quick tour)

**1) Send your first request**
In the APIs view: `+ Collection` -> the group's `+` (add API) -> enter method and URL -> **Send**.
To just try something without saving, use the **Quick request** button at the top.

**2) Use variables**
In the **Environments** view, define an environment (e.g. `dev`), its variables (`baseUrl`,
`token`, ...), and dynamic-value rules. Use them anywhere in a request as `{{name}}`. Type `{{`
for autocomplete.

**3) Scenarios**
In the **Scenarios** view, add steps (endpoints). For each step configure **extraction**
(pull a value from the response with a [JSONPath](#concepts) such as `$.data.token` and inject it
into the next step as `{{token}}`) and **assertions**, then run.

**4) Data-driven runs**
In a scenario's **Data (iterations)** section, paste CSV or JSON (array of objects):

```
amount,expectStatus
100,200
-1,400
```

Each row becomes one run, and `{{amount}}` / `{{expectStatus}}` are injected into the request and
expected values. Running shows per-iteration pass/fail.

**5) Import / export**
The `...` menu in the APIs view -> import API (OpenAPI/curl), export/import backup. A request can be
exported with `Copy as curl`.

---

## Concepts

A few things that help you understand the tool:

**Proxy execution model**
Browser -> **server (executor)** -> target API. The server container is what actually makes the call.
- So the URL must be reachable **from the server's perspective**. Other containers in Docker are
  addressed by service name (e.g. the test server below is `http://test-api:3000`). From inside the
  server container, `localhost` means the server itself.
- If any `{{variable}}` is left unresolved, the tool **blocks the request** (and tells you which
  variables were not resolved) to avoid sending a malformed call.

**Variable resolution order** (later wins)
```
shared group  <  active environment  <  dynamic-value rules  <  (scenario extracts / data row)
```
`{{name}}` is a placeholder that resolves if it exists in the run-time context. It does not have to
be an environment variable — a **data row or an extracted value** can fill it, and the data row has
the highest priority.

**JSONPath (subset)**
Extraction and assertion paths use JSONPath notation. Supported: root `$`, dot access `$.a.b`,
array index `$.items[0].id` (the `$` is optional). **Not supported**: wildcard `[*]`, recursive
descent `..`, filters `[?()]`, slices `[0:2]`.

---

## Local test API server (optional)

A small server is bundled for trying things like file upload and echo without external
dependencies. It does not start by default — it runs **only via a profile**.

```bash
docker compose --profile test up -d --build test-api
```

- In the API tester, use the target URL `http://test-api:3000/...` (the executor calls it over the
  same Docker network).
- Inspect uploaded files in a browser at `http://localhost:8474/files`.

| Endpoint | Purpose |
|----------|---------|
| `ALL /echo` | echoes method, headers, query, and body (general GET/POST testing) |
| `POST /upload` | stores the file and returns a summary (name, size, hash) |
| `POST /mirror` | returns the uploaded file with its original Content-Type (to check image preview) |
| `GET /files`, `GET /files/:name` | list / download uploaded files |
| `GET /health` | health check |

---

## FAQ

**Q. Why use `test-api:3000` instead of `localhost` in the URL?**
The server container is what makes the call, and inside it `localhost` is the server itself. Other
containers are addressed by their Docker service name.

**Q. `{{amount}}` works even though I never created an `amount` environment variable.**
In a data-driven run, each row's columns are injected as variables for that iteration (highest
priority). If it is not found in the data, environment, rules, or extracts, the request is blocked.

**Q. Is there a cancel button for in-flight requests?**
No. Cancelling leaves the outcome "unknown" (the server may already have processed it), so it does
not provide safety; navigating away stops the wait, the result is still recorded in history, and it
is restored when you return. See the security/design notes below.

**Q. The response image preview does not appear.**
Preview only shows when the **response body is an image** (e.g. `image/png`), and it is **opt-in**
(you click to reveal it). If an upload API returns a JSON summary, that is not an image, so there is
no preview (check it by fetching the file back).

---

## Local development without Docker (optional)

For hot-reloading the frontend and backend separately. **Running the DB in Docker is recommended.**

```bash
docker compose up -d db      # DB in Docker only

# Backend (terminal 1)
cd server && npm install
# DATABASE_URL example: postgresql://apitester:change_me@localhost:8473/apitester?schema=public
npm run prisma:generate
npx prisma migrate deploy    # apply migrations to the DB
npm run start:dev            # http://localhost:3000

# Frontend (terminal 2)
cd web && npm install
npm run dev                  # http://localhost:5173 (proxies /api to the Docker server)
```

If you run the backend locally on port 3000, adjust the proxy target in
[web/vite.config.ts](./web/vite.config.ts).

### Database migrations

The schema is managed with **Prisma Migrate**. Migration files live in
[`server/prisma/migrations/`](./server/prisma/migrations) and are applied automatically when the
server container starts (`migrate deploy`). A database first created with `db push` by an older
image is **baselined automatically on upgrade** — the initial migration is marked as applied without
recreating tables, so existing data is never dropped.

To change the schema, edit [`server/prisma/schema.prisma`](./server/prisma/schema.prisma) and create
a migration:

```bash
cd server
npm run prisma:migrate       # prisma migrate dev: creates a new migration and applies it
```

Commit the generated folder under `server/prisma/migrations/` along with the schema change.

### Tests

The core pure logic (expression engine, JSONPath, assertions, curl/OpenAPI parsers) has unit tests
(Vitest).

```bash
cd server
npm install
npm test            # run once
npm run test:watch  # watch mode
```

---

## Stack & structure

- **server**: NestJS + Prisma + PostgreSQL — modules per domain (endpoints/executor/variables/history/scenarios/import/backup).
- **web**: React (Vite) + nginx — reverse-proxies `/api/*` to the server.

```
api-tester/
├── docker-compose.yml     # db + server + web (+ test-api, via profile)
├── .env.example           # sample environment variables
├── server/                # NestJS + Prisma backend
│   ├── prisma/schema.prisma
│   └── src/               # modules per domain
├── web/                   # React (Vite) frontend + nginx
├── test-api/              # local test API server (optional)
└── docs/                  # security checklist, dependency licenses
```

---

## Security & design notes

- This is a **local, self-hosted tool with no built-in authentication** — anyone who can reach the
  UI can see all data. The web app talks to the server only through the same-origin (`/api`) proxy,
  and CORS is intentionally not opened so the server does not expose stored secrets cross-origin.
- Exposing hosts ports `8472` (API) and `8473` (DB) is **optional and for debugging**. Do not expose
  them on an untrusted network.
- Request/response history is stored **in plaintext in the local DB**. Backup JSON can contain tokens
  and auth data, so be careful when sharing it (`*backup*.json` is gitignored).
- See [docs/security-checklist.md](./docs/security-checklist.md) for details, and the items to review
  before a public/multi-user deployment.

---

## Troubleshooting

- **Port conflict (`port is already allocated`)**: change the host ports (8471/8472/8473) in `docker-compose.yml`.
- **Red health badge / API 500**: check `docker compose logs server`. Make sure the server starts after the DB is healthy.
- **Ran without `.env`**: empty `POSTGRES_*` values make DB init fail. Do step 2 (create `.env`) first.
- **`entrypoint.sh` error on Windows**: line endings are pinned to LF via `.gitattributes`. Make sure your editor does not convert to CRLF.
- **UI still shows the old version after a redeploy**: nginx serves `index.html` with no-cache, but a hard refresh (Ctrl/Cmd+Shift+R) guarantees a refresh.

---

## License

[MIT](./LICENSE) — Copyright (c) 2026 SOFT GROUND
