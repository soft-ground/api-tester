# Security checklist for public release / production

This tool is currently built for a **local, self-hosted setup with no built-in authentication**.
These are the items to review before opening it up (open source) or extending it to a
multi-user service.

> Priority: **[P0] required** (before any service) / **[P1] recommended** / **[P2] optional**

---

## 1. Authentication & authorization [P0]
- [ ] Add login/authentication (currently anyone can access all data)
- [ ] Per-user data isolation (separate collections, environments, history, scenarios per user)
- [ ] Session/token management, CSRF protection
- [ ] Admin vs regular roles (if needed)

## 2. Secret storage [P0]
- [ ] **Tokens, API keys, passwords, and card numbers are stored in the DB in plaintext** — encryption needed
      (includes environment variable values, `authConfig`, and request/response history bodies)
- [ ] Encryption at rest + TLS in transit
- [ ] Option to mask sensitive headers/bodies in history
- [ ] Backup export files contain secrets — warn on download/storage, offer optional masked export

## 3. Proxy abuse prevention (SSRF) [P0]
The backend executor makes requests to **arbitrary URLs on the caller's behalf**. As a public
service this could be abused:
- [ ] Block internal/private IP ranges (169.254.*, 10.*, 192.168.*, 127.*, cloud metadata endpoints, etc.)
- [ ] Restrict allowed schemes (http/https only), limit redirect following
- [ ] Request size / timeout / concurrency limits (currently only a 30s timeout)
- [ ] Target domain allowlist/denylist (per policy)

Note: the unused inbound urlencoded body parser was removed and CORS is not opened, which closes
the cross-origin trigger path — but full internal-address blocking is still needed for a public
multi-user deployment.

## 4. Input validation & execution safety [P1]
- [ ] Expression evaluation uses `expr-eval` (a safe parser) — keep avoiding `eval`
- [ ] Validate JSONPath/substitution input, review regexes for ReDoS
- [ ] File upload (import) size limits and JSON schema validation
- [ ] Rate limiting (login, execution, proxy calls)

## 5. Infrastructure & deployment [P1]
- [ ] Manage `.env` secrets such as the DB password (currently `.env` is gitignored) — use a secret manager
- [ ] Run containers with least privilege (non-root)
- [ ] CORS is intentionally not opened; if you later expose the API cross-origin, restrict it to known origins
- [ ] Production logging/monitoring; never expose secrets in error responses
- [ ] Dependency vulnerability scanning (`npm audit`, Dependabot, etc.)

## 6. Data & privacy [P1]
- [ ] Prevent backup file leaks (`*backup*.json` is in `.gitignore`)
- [ ] Personal/sensitive data handling policy, retention and deletion policy
- [ ] History data retention limits (automatic cleanup)

## 7. Legal & docs [P2]
- [ ] LICENSE (open-source license) — done (MIT)
- [ ] For commercialization: terms of service, privacy policy, business registration
- [ ] Third-party license notices (THIRD-PARTY-NOTICES) — see `docs/dependency-licenses.md`
- [ ] Security vulnerability reporting channel (SECURITY.md)

---

### The three most urgent items given the current code
1. **Plaintext secret storage** — top priority to encrypt for multi-user/hosted use.
2. **SSRF** — restrict proxy call targets.
3. **No authentication** — add login/isolation before a public deployment.

> This document is a general guide, not legal or professional security advice. A professional
> review is recommended before commercialization.
