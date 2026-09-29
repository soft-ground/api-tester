# Privacy Policy

API Tester is a **local-first, self-hosted** tool. This policy covers both ways it's distributed:
the Docker-based web app and the standalone desktop app.

## What we collect

**Nothing.** There is no account system, no analytics, no crash reporting, and no telemetry built
into this project. We (SOFT GROUND) do not operate any server that the app talks to, and we have
no access to your data.

## Where your data lives

Everything you create — saved requests, environments, call history, scenarios — is stored in a
Postgres database **you control**:

- **Docker deployment**: the `postgres` container's own volume, on your infrastructure.
- **Desktop app**: an embedded Postgres instance in a local per-user data folder on your machine
  (see the main [README](./README.md) for exact paths per OS). Nothing leaves your machine.

## Network calls the app makes on its own

- **Desktop app auto-update check**: on startup, the app asks GitHub's public Releases API
  whether a newer version exists. This is a plain, unauthenticated request for release metadata —
  no personal or usage data is sent. See [desktop/src/main.ts](./desktop/src/main.ts)
  (`initAutoUpdater`).
- **Your own API calls**: when you send a request through the app, the server calls the target
  URL **you specify**, on your behalf (that's the whole point of the tool — see
  [README § Why this exists](./README.md#why-this-exists)). That's traffic you directed, not
  something the app sends about you.

Nothing else phones home. If you distrust that claim, the project is MIT-licensed and the full
source — including the CI workflows that build the published binaries — is public at
https://github.com/soft-ground/api-tester.

## Third-party services

GitHub (hosting the repository, Releases, and CI) has its own privacy policy for that
infrastructure: https://docs.github.com/site-policy/privacy-policies/github-privacy-statement.
We don't add anything on top of it.

## Changes

If this policy ever changes (e.g., an opt-in telemetry feature is added in the future), it will
be reflected here and called out in [CHANGELOG.md](./CHANGELOG.md).

## Contact

Questions: **admin@soft-ground.com**
