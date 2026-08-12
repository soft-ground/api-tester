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
  request/response in the DB. History has **search/filter (method/status/text) and folders**, with
  **multi-select** (Shift-range) to move or delete many entries at once.
- **Environment variables & dynamic values** — per-environment variable sets (with an active
  environment) plus rules (`fixed` / `sequence` / `expression` / `timestamp` / `uuid` / `random`).
  `{{variable}}` is substituted into URL, query, headers, body, and auth. A rule can optionally emit
  a **fresh value for every occurrence** in one request (e.g. a unique id per line).
- **Scenarios** — run several requests in sequence, with **value extraction chained into the next
  step** and **assertions**.
- **Data-driven runs** — give it a CSV/JSON table and a scenario runs once per row, injecting each
  row's values via `{{column}}`, with per-iteration pass/fail.
- **Request body** — `none` / `json` / `form` (urlencoded) / `raw` / **`multipart` (file upload)**.
  The JSON body allows `//` and `/* */` **comments** (stripped before sending) and a **Fields** view
  that marks each field `required` / `optional`, excludes fields, and types values (see
  [Concepts](#concepts)).
- **Auth helpers** — Bearer / Basic / API Key (header or query) injected automatically.
- **Response viewer** — status, duration, size, JSON highlighting, Pretty/Raw, **lossless binary
  storage + download + (opt-in) preview**, and **export a JSON response to Excel (.xlsx)**.
- **Import / export** — import from OpenAPI (Swagger) and curl, copy as curl, export/import a
  full-workspace backup JSON.
- **Conveniences** — quick request (call once without saving), global search (Ctrl/Cmd+K),
  **light / dark theme**, and bilingual UI (English / Korean).

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
the highest priority. **Variable names** may contain Unicode letters (including Korean), digits, and
`_ . -` — e.g. `{{user.id}}`, `{{x-token}}`, `{{기수}}`.

**`baseUrl` and relative URLs**
If a request's URL does **not** start with `http://` or `https://` — e.g. you leave the host box
blank and fill only the path, or type a bare `/users/1` — the tool prepends the active environment's
**`baseUrl`** variable (when defined). So you can point many saved requests at one environment and
retarget them all at once by switching the active environment. A full `http(s)://` URL is always
used as-is.

**Expression rules (mini-language)**
The `expression` dynamic-value rule evaluates a small expression and can reference **other variables
by their name** — environment variables and other rules are in scope. (Scenario extracts and
data-row values resolve *after* rules, so an expression cannot read those.) Built-in helpers:

| Helper | Result |
|--------|--------|
| `now("yyyy-MM-dd HH:mm:ss")` | current time; tokens `yyyy MM dd HH mm ss SSS`. `now()` with no arg returns ISO-8601 |
| `timestamp()` | epoch milliseconds |
| `uuid()` | a random UUID |
| `randomInt(min, max)` | random integer, inclusive |
| `pad(value, len, "0")` | left-pad to length |
| `upper(s)` / `lower(s)` / `len(s)` | case / length |
| `concat(a, b, ...)` | join as strings (use this to build strings, not `+`) |

Examples: `concat(baseUrl, "/v1/", uuid())`, `pad(seq, 6, "0")`, `now("yyyyMMdd")`.

**Import and backup are additive (never destructive)**
Import **never overwrites or deletes** anything you already have. A **backup** or **OpenAPI
(Swagger)** import adds only new items: when a name already exists (collection, endpoint,
environment, or rule) the existing one is **kept** and the incoming duplicate is **skipped**. A
**curl** import always adds one new endpoint (into a `curl import` collection by default; it does not
de-duplicate). Re-importing is safe either way; to change an existing item, edit it in the UI (or
remove it first).

**JSONPath (subset)**
Extraction and assertion paths use JSONPath notation. Supported: root `$`, dot access `$.a.b`,
array index `$.items[0].id` (the `$` is optional). **Not supported**: wildcard `[*]`, recursive
descent `..`, filters `[?()]`, slices `[0:2]`.

**Request body: comments, required/optional, and the Fields view**
The JSON body is **JSONC** — `//` line and `/* */` block comments are allowed and are **stripped
before the request is sent**, so you can annotate the body without breaking it. Two conventions turn
a trailing comment into a field marker:

- A trailing comment whose **first word** is `required` or `optional` marks that field:
  ```jsonc
  {
    "accountId": "{{id}}",      // required
    "memo": "note",             // optional  free text after the keyword is kept as a note
    "hint": "value"             // not required here -> stays a plain comment, not a marker
  }
  ```
  Only the **leading** keyword counts. Anything after it is preserved as a free note, and a comment
  that does not start with the keyword (e.g. `// not required here`) is never mistaken for a marker.

- The **Fields** tab (next to **Raw**) renders the same body as a structured editor. There you can:
  toggle each field's `required` / `optional` badge; **exclude** a field from the request (unchecking
  comments it out instead of deleting it); edit nested objects and arrays; and pick each value's
  **type** — `string` / `number` / `boolean` / `null` — so you can send an unquoted `42`, `true`, or
  `null` rather than a quoted string.
- **Duplicate an array item** — each item in a list shows a **⧉** button that deep-copies that item
  (its whole nested structure, values, and `{{variables}}`) and inserts the copy right below, so
  building a list of similar objects (e.g. batch payloads) doesn't mean rebuilding every nested field
  by hand. It appears on **array items only**, not on object fields (duplicating a field would create
  a duplicate key).

**Raw and Fields are two views of the exact same text.** Switch between them freely — comments,
markers, notes, and value types round-trip losslessly. **OpenAPI (Swagger) import** fills in the
`required` markers automatically from the schema.

**Export a JSON response to Excel**
When a response body is JSON, the response toolbar shows an **Excel** button that downloads a
multi-sheet `.xlsx`. Because JSON depth is irregular, the mapping follows fixed rules:

- Every **array of objects**, at any depth, becomes its own **table sheet** named after its key.
  Each row is **flattened**, so a nested object inside an element turns into dot-path columns
  (`results[].data.bankCode` → a `data.bankCode` column); columns are the union across rows. So both
  a top-level `data: [...]` and a wrapped `{ code, data: { items: [...] } }` produce a real table.
- All remaining **scalars and nested objects** go to a **`Summary`** sheet as key/value rows, nested
  objects flattened with dot paths (`data.total`).
- Anything deeper that cannot be a column (an object, or a non-object array) is kept as a **JSON
  string** in the cell, so nothing is lost.

Example: `{ "result": "success", "data": [ {"bankCode":"001","bankName":"..."}, ... ] }` exports as a
`Summary` sheet (`result | success`) plus a `data` sheet (`bankCode | bankName` with one row each).

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

**Q. How do I mark which body fields are required, or leave notes in the JSON body?**
Add a trailing `//` comment whose first word is `required` or `optional` (e.g.
`"id": "{{id}}",   // required`), or use the **Fields** tab to toggle the badge per field. All `//`
and `/* */` comments are stripped before the request is sent. Only a leading `required`/`optional`
keyword becomes a marker; any other comment is kept as a plain note. See
[Concepts](#concepts) for the full rules.

**Q. My JSON body sends `"42"` (a string) but the API expects the number `42`.**
In the **Fields** tab, set that value's **type** to `number` (or `boolean` / `null`). Typed values
are serialized unquoted.

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
- **Limits:** each request times out after **30s**; response bodies are stored up to **25 MB**
  (larger responses are truncated and flagged). Raise the cap with the `REQUEST_MAX_BODY_BYTES`
  env var on the server container.
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
