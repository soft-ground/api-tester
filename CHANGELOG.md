# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Published images for each release are on GHCR (`ghcr.io/soft-ground/api-tester-web`,
`…-server`); `latest` follows the newest tag.

## [Unreleased]

### Added
- **Duplicate an array item** in the Fields view — each list item has a **⧉** button that deep-copies
  the item (its whole nested structure, values, and `{{variables}}`) and inserts the copy right below.
  Shown on array items only, not on object fields (duplicating a field would create a duplicate key).

### Fixed
- A per-use (**New value on each use**) `expression` rule that wraps a sequence now yields a fresh
  value for each `{{name}}` occurrence in one request — the referenced sequence advances per
  occurrence — instead of repeating the same value (e.g. `concat(currentDate, currentTime, pad(seq,6))`
  used three times now produces three distinct transaction numbers).

## [1.5.0] - 2026-08-12

### Added
- **Export a JSON response to Excel (.xlsx)** — an Excel button on the JSON response toolbar downloads
  a multi-sheet workbook. Every array-of-objects (at any depth) becomes a table sheet named after its
  key, with nested row objects flattened into dot-path columns (`data.bankCode`); remaining scalars go
  to a `Summary` sheet; anything deeper is kept as a JSON string so nothing is lost.

### Fixed
- Keep the value-type dropdown aligned for `null` values in the Fields view.

## [1.4.0] - 2026-08-12

### Added
- **Per-use dynamic values** — a dynamic-value rule can emit a fresh value for every `{{name}}`
  occurrence in one request (e.g. a unique id per line), toggled per rule.
- **Light / dark theme toggle**, persisted and applied before first paint; follows the OS preference
  on first run.
- **History multi-select** — checkbox + Shift-range selection to move or delete many entries at once.
- **Body Fields improvements** — free comments are preserved (toggling a badge no longer deletes a
  note), `required` / `optional` markers apply to object and array fields (not just leaves), and each
  leaf value has a type picker (`string` / `number` / `boolean` / `null`) so unquoted numbers,
  booleans, and null can be sent.

### Changed
- `required` / `optional` is recognized only as the **first token** of a trailing comment, so prose
  such as `// not required here` stays a plain note.
- Fields view no longer shows the object/array element count; the scenario-extract group name is
  localized instead of showing the raw stored name.
- Removed dead code (`isPrimitive`, an unused style).

### Documentation
- Documented body comments and markers, the Fields view, `baseUrl` auto-prefixing, the expression-rule
  helpers, additive (never-destructive) import, and the request timeout / body-size limits.

## [1.3.1] - 2026-08-06

### Added
- Adopted **Prisma Migrate** with a non-destructive baseline for existing `db push` databases.
- **GitHub Actions CI** (server/web tests + Docker build) and **GHCR image publishing** on version tags.

### Documentation
- README badges, prebuilt-image quickstart, and a screenshots section.

## [1.3.0] - 2026-08-05

Initial public open-source release (SOFT GROUND, MIT).

### Added
- Collections and endpoints with multi-level drag-and-drop groups.
- Proxy execution model (browser → server → target API) with full request/response history
  (search / filter / folders).
- Environments and dynamic-value rules (`fixed` / `sequence` / `expression` / `timestamp` / `uuid` /
  `random`), with `{{variable}}` substitution across URL, query, headers, body, and auth.
- Scenarios (chained requests with value extraction and assertions) and data-driven runs.
- Request bodies: `none` / `json` / `form` / `raw` / `multipart` (file upload); auth helpers
  (Bearer / Basic / API Key).
- Response viewer with lossless binary storage, download, and opt-in preview.
- Import from OpenAPI (Swagger) and curl; full-workspace backup import/export (merge-only).
- Self-hosted Docker deployment and a bilingual (English / Korean) UI.

[Unreleased]: https://github.com/soft-ground/api-tester/compare/v1.5.0...HEAD
[1.5.0]: https://github.com/soft-ground/api-tester/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/soft-ground/api-tester/compare/v1.3.1...v1.4.0
[1.3.1]: https://github.com/soft-ground/api-tester/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/soft-ground/api-tester/releases/tag/v1.3.0
