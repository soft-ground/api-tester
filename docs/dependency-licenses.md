# Dependency License Audit

Summary of results generated with `license-checker`. Reference this when releasing the project
as open source or commercially.

> Conclusion: **all dependencies use permissive licenses** (MIT / Apache-2.0 / ISC / BSD / 0BSD),
> and **there are no copyleft licenses** (GPL, AGPL, LGPL, etc.). Both open-source and commercial
> distribution are fine, as long as the notices are preserved.

Audit date: 2026-07-24

---

## Summary (production, including transitive dependencies)

### server (NestJS + Prisma)
| License | Count |
|---------|-------|
| MIT | 113 |
| Apache-2.0 | 9 |
| ISC | 3 |
| BSD-3-Clause | 2 |
| 0BSD | 1 |
| BSD-2-Clause | 1 |
| UNLICENSED | 1 *(our app `api-tester-server` — private, not an issue)* |

Non-MIT items: `@prisma/client`, `prisma`, `reflect-metadata`, `rxjs` (Apache-2.0);
`ieee754`, `qs` (BSD-3-Clause); `tslib` (0BSD); `webidl-conversions` (BSD-2-Clause); etc.

### web (React + Vite)
| License | Count |
|---------|-------|
| MIT | 35 |
| Apache-2.0 | `xlsx` + its SheetJS helper packages *(added 2026-08-12)* |
| UNLICENSED | 1 *(our app `api-tester-web` — private, not an issue)* |

---

## Direct dependencies (explicitly declared)

### server
| Package | License |
|---------|---------|
| @nestjs/common, @nestjs/core, @nestjs/platform-express | MIT |
| @prisma/client, prisma | Apache-2.0 |
| class-transformer, class-validator | MIT |
| expr-eval | MIT |
| reflect-metadata, rxjs | Apache-2.0 |
| (dev) @nestjs/cli, @nestjs/schematics, @types/*, eslint, vitest | MIT |
| (dev) typescript | Apache-2.0 |

### web
| Package | License |
|---------|---------|
| axios, react, react-dom, react-router-dom | MIT |
| xlsx (SheetJS, for JSON→Excel export) | Apache-2.0 |
| (dev) @vitejs/plugin-react, vite, @types/* | MIT |
| (dev) typescript | Apache-2.0 |

### Infrastructure (containers / runtime)
| Component | License |
|-----------|---------|
| PostgreSQL | PostgreSQL License (BSD-style) |
| nginx | 2-clause BSD |
| Node.js runtime | MIT |

---

## Obligations by license

- **MIT / BSD / ISC / 0BSD**: include the copyright and license notice in the distribution. Commercial sale is allowed.
- **Apache-2.0**: the above, plus state changes and, if a `NOTICE` file is included, distribute it too. Grants an explicit patent license (favorable for business use).
- **Copyleft (GPL, etc.)**: none.

When distributing the software to third parties (in particular the frontend bundle or Docker images),
it is recommended to include the notices above as a `THIRD-PARTY-NOTICES` file.

---

## How to regenerate the full list

```bash
# server
cd server && npm install
npx license-checker --production --csv > ../docs/licenses-server.csv

# web
cd web && npm install
npx license-checker --production --csv > ../docs/licenses-web.csv

# summary only
npx license-checker --production --summary
```

> Note: this audit is the output of an automated tool, not legal advice. A professional review is
> recommended before commercialization.
