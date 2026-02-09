# Task: DMS Command-Line Interface

> **Progress tracking**: This document is the source of truth for implementation status. Update phase headers, checklists, and design notes as work is completed. See `planning/planning-rules.md` for details.

## Objective

Create a CLI tool (`packages/dms/cli/`) that provides terminal-based access to DMS data. The CLI shares the existing API code (`packages/dms/src/api/`) with the web client — the same `dmsDataLoader` and `dmsDataEditor` functions, the same Falcor path construction, the same post-processing logic. This ensures a single source of truth for data operations and prevents divergence between CLI and web client behavior.

The CLI understands the structure of the core content types: sites, patterns, pages, page sections, and datasets/internal-datasets.

Primary use cases:
- Inspect and dump DMS content to stdout or files (JSON, readable summaries)
- Edit and update DMS data from the terminal or scripts
- Enable automation workflows (CI/CD, bulk content updates, AI-assisted editing)

## Background

### DMS Data Model

All DMS content lives in a single `data_items` table with a flexible JSON `data` column. Items are namespaced by `app` + `type` pairs:

| Content Type | Type String | Key Data Fields |
|---|---|---|
| Site | `admin+pattern-admin` | `site_name`, `patterns[]`, `theme_refs[]` |
| Pattern | `admin+pattern` | `pattern_type`, `name`, `base_url`, `subdomain`, `authPermissions`, `theme` |
| Theme | `admin+theme` | Theme styling object |
| Page | `{app}+docs-page` | `title`, `url_slug`, `parent`, `index`, `sections[]`, `draft_sections[]`, `published` |
| Section | `{app}+cms-section` | `title`, `level`, `element` (`element-type`, `element-data`), `tags`, `authPermissions` |
| Dataset Source | `forms+source` | `name`, `doc_type`, `config`, `views[]` |
| Dataset View | `forms+view` | `name`, version metadata |
| Internal Dataset | `forms\|source` | DMS-managed dataset entries |

The `app` value is dynamic per site (e.g., `avail-dms`, `my-site`). The `type` value determines what kind of content an item holds. Together they form a composite key like `avail-dms+docs-page`.

### Existing API

The web client uses two core functions from `packages/dms/src/api/`:

- **`dmsDataLoader(falcor, config, path)`** — Reads data. Builds Falcor paths based on action type (`list`, `view`, `edit`, `search`), fetches via `falcor.get()`, and post-processes (flattens nested JSON, resolves `dms-format` references).
- **`dmsDataEditor(falcor, config, data, requestType)`** — Writes data. Dispatches to Falcor calls: `['dms', 'data', 'create']`, `['dms', 'data', 'edit']`, `['dms', 'data', 'delete']`.

These operate over Falcor's JSON Graph protocol, hitting the server's `POST /graph` endpoint.

### Falcor Paths (Server Routes)

Key read paths:
```
['dms', 'data', '{app}+{type}', 'length']
['dms', 'data', '{app}+{type}', 'byIndex', {from, to}, [attributes]]
['dms', 'data', '{app}+{type}', 'options', '{filterJSON}', 'byIndex', {from, to}, [attributes]]
['dms', 'data', 'byId', {id}, [attributes]]
['dms', 'data', '{app}+{type}', 'searchOne', [{searchSpec}], [attributes]]
['dms', 'data', '{app}+{type}', 'sections']
['dms', 'search', '{app}+{type}', 'tags']
```

Key write calls:
```
falcor.call(['dms', 'data', 'create'], [app, type, data])
falcor.call(['dms', 'data', 'edit'], [id, dataUpdates])
falcor.call(['dms', 'data', 'delete'], [app, type, ...ids])
```

The `data` column uses JSONB (PostgreSQL) with `->>` extraction in queries. The edit call performs a **deep merge** with existing data, so partial updates work.

## Architecture

### Package Location & Shared Code Strategy

The CLI lives at `packages/dms/cli/` — co-located inside the DMS package rather than as a separate top-level package. This is a deliberate choice to **share the existing API code** (`packages/dms/src/api/`) between the web client and CLI via direct relative imports.

**Why co-locate?**

- **Single source of truth**: The CLI uses `../src/api/dmsDataLoader` and `../src/api/dmsDataEditor` directly. No code duplication, no version drift.
- **Zero configuration**: No workspace/monorepo tooling needed. Relative imports just work.
- **Guaranteed consistency**: Any fix or change to the API code immediately applies to both CLI and web client.
- **Better testing**: Code used in two contexts (browser + Node) gets exercised more thoroughly, catching environment-specific issues early.

The abstraction boundary is the **Falcor client**: the web client provides a browser-based Falcor client (via `@availabs/avl-falcor`), while the CLI provides a lightweight Node HTTP client. Both pass the same `falcor` interface to the shared API functions.

```
packages/dms/
  src/
    api/                    # ← SHARED: used by both web client and CLI
      index.js              #   dmsDataLoader, dmsDataEditor
      _utils-core.js        #   getActiveConfig, configMatcher (Node-safe, extracted from _utils.jsx)
      _utils.jsx            #   React-specific utils (imports _utils-core.js)
      ...
    patterns/               # Web client patterns (not used by CLI)
    ui/                     # Web client UI (not used by CLI)
    ...
  cli/
    package.json
    bin/
      dms.js                # Entry point (#!/usr/bin/env node)
    src/
      client.js             # Falcor HTTP client (POST /graph, Node-native)
      config.js             # Config loading (.dmsrc, env vars, CLI flags)
      commands/
        site.js             # Site inspection commands
        pattern.js          # Pattern listing/inspection
        page.js             # Page CRUD and content dump
        section.js          # Section-level operations
        dataset.js          # Dataset/internal-dataset operations
        raw.js              # Raw data_items access by id or app+type
      formatters/
        json.js             # JSON output (pretty, compact, jq-compatible)
        summary.js          # Human-readable summaries
        tree.js             # Tree views (site → patterns → pages → sections)
      utils/
        types.js            # Type string helpers, known type registry
        resolve.js          # Resolve dms-format refs, load nested data
    docs/
      README.md             # Usage guide for humans and AI agents
      TYPES.md              # Reference: all content types, their fields, relationships
      EXAMPLES.md           # Cookbook of common operations
```

### Shared API Compatibility

The API code in `packages/dms/src/api/` is ~95% Node-safe already. The functions `dmsDataLoader` and `dmsDataEditor` are pure data operations — they take a `falcor` object, build paths, call `falcor.get()` / `falcor.call()`, and post-process results. No DOM, no React.

**One blocker**: `api/index.js` dynamically imports `_utils.jsx` (line ~49), which has React imports at the module level (`matchRoutes` from `react-router` and React-specific utilities). The fix is a prep step (Phase 0):

- Extract `getActiveConfig` and `configMatcher` from `dms-manager/_utils.jsx` into a new `_utils-core.js` (pure functions, no React imports)
- Have `_utils.jsx` re-export from `_utils-core.js` so existing web client code is unchanged
- The CLI imports `_utils-core.js` directly when it needs config matching

After this extraction, the CLI can import and use the full API layer with no browser dependencies.

### Falcor Client

The CLI needs a lightweight Falcor client that speaks the JSON Graph protocol over HTTP. It should NOT depend on the full `@availabs/avl-falcor` browser package. Instead, build a minimal client that:

1. Takes a `host` URL (e.g., `http://localhost:4444`)
2. Sends `POST /graph` requests with Falcor-format JSON bodies
3. Parses JSON Graph responses, unwrapping `$atom`, `$ref`, following refs
4. Supports both `get` (query) and `call` (mutation) operations
5. Handles auth tokens (cookie/header) for authenticated operations

This client implements the same interface that `@availabs/avl-falcor` provides to the web client, so the shared API functions (`dmsDataLoader`, `dmsDataEditor`) work identically — they just receive a different `falcor` implementation.

### Configuration

The CLI should resolve config from (highest priority first):

1. CLI flags: `--host`, `--app`, `--auth-token`
2. Environment variables: `DMS_HOST`, `DMS_APP`, `DMS_AUTH_TOKEN`
3. Project config file: `.dmsrc` (JSON) in cwd or parent directories

```json
// .dmsrc
{
  "host": "http://localhost:4444",
  "app": "avail-dms",
  "defaultType": "docs-page"
}
```

## Commands

### Global Flags

```
--host <url>        API host (default: from config)
--app <name>        App namespace (default: from config)
--format <fmt>      Output format: json, summary, tree (default: json)
--output <file>     Write to file instead of stdout
--pretty            Pretty-print JSON (default when stdout is TTY)
--compact           Compact JSON (default when piped)
```

### Site Commands

```bash
# Show site configuration (patterns, themes)
dms site show

# List all patterns registered on the site
dms site patterns

# Show site tree: site → patterns → pages (with hierarchy)
dms site tree
```

### Pattern Commands

```bash
# List all patterns
dms pattern list

# Show pattern details (config, permissions, base_url)
dms pattern show <pattern-name-or-id>

# Dump full pattern config as JSON
dms pattern dump <pattern-name-or-id>
```

### Page Commands

```bash
# List all pages (title, url_slug, id, published status)
dms page list [--pattern <name>] [--published | --draft]

# Show page metadata
dms page show <id-or-slug>

# Dump full page with all sections expanded
dms page dump <id-or-slug> [--sections] [--output <file>]

# Create a new page
dms page create --title <title> --slug <slug> [--parent <id>]

# Update page metadata
dms page update <id-or-slug> --title <new-title>
dms page update <id-or-slug> --set key=value

# Publish / unpublish
dms page publish <id-or-slug>
dms page unpublish <id-or-slug>

# Delete a page
dms page delete <id-or-slug>
```

### Section Commands

```bash
# List sections of a page
dms section list <page-id-or-slug>

# Show section metadata + element-type
dms section show <section-id>

# Dump section element-data (the component payload)
dms section dump <section-id> [--output <file>]

# Update section element-data from file or stdin
dms section update <section-id> --data <file>
dms section update <section-id> --data -   # read from stdin

# Update section element-data via JSON merge
dms section update <section-id> --set element-type=Message
dms section update <section-id> --merge '{"element-data": "..."}'

# Create a new section on a page
dms section create <page-id-or-slug> --type <element-type> [--title <title>]

# Delete a section
dms section delete <section-id>
```

### Dataset Commands

```bash
# List dataset sources
dms dataset list

# Show dataset source details (columns, views, config)
dms dataset show <source-id-or-name>

# List views for a source
dms dataset views <source-id-or-name>

# Dump dataset data (from internal dataset)
dms dataset dump <source-id> [--view <view-id>] [--limit <n>] [--output <file>]

# Query dataset with filters
dms dataset query <source-id> --filter 'column=value' [--order 'column:asc']
```

### Raw Access Commands

```bash
# Get any item by ID
dms raw get <id> [--attrs <comma-separated>]

# List items by app+type
dms raw list <app+type> [--limit <n>] [--offset <n>]

# Create a raw item
dms raw create <app> <type> [--data <json-or-file>]

# Update a raw item (deep merge)
dms raw update <id> --data <json-or-file>
dms raw update <id> --set key=value

# Delete a raw item
dms raw delete <app> <type> <id>
```

## Type Awareness

The CLI should understand the structural relationships between types. This enables:

### Slug Resolution

Pages are commonly referenced by `url_slug` not `id`. The CLI should resolve slugs transparently:

```bash
dms page show home          # looks up by url_slug
dms page show 42            # looks up by id (numeric)
```

Uses the `searchOne` Falcor path: `['dms', 'data', '{app}+docs-page', 'searchOne', [{"wildKey": "data->>'url_slug'", "params": "home"}]]`

### Section Expansion

When dumping a page with `--sections`, the CLI should resolve the `sections` array (which contains IDs) into full section objects by fetching each via `byId`.

### Tree Building

The `site tree` command should build the full hierarchy:

```
Site: My DMS Site (id: 1)
  Pattern: Pages (page) base_url=/
    Page: Home (/) [published] id=10
      Section: Hero (lexical) id=20
      Section: Features (Card) id=21
    Page: About (/about) [published] id=11
      Section: Team (Spreadsheet) id=22
    Page: Docs (/docs) [draft] id=12
      Page: Getting Started (/docs/getting-started) [published] id=13
        Section: Intro (Message) id=23
  Pattern: Datasets (datasets) base_url=/data
  Pattern: Auth (auth) base_url=/auth
```

This requires: site → pattern list → for each page pattern: page list → for each page: section list. The page hierarchy is built from the `parent` field.

## Implementation Phases

### Phase 0: API Compatibility Prep — DONE

- [x] Extract `getActiveConfig` and `configMatcher` from `dms-manager/_utils.jsx` into `_utils-core.js` — file created at `src/dms-manager/_utils-core.js` (kept in `dms-manager/`, not `api/`). Retains `react-router` `matchRoutes` since it's a pure function that works in Node; CLI lists `react-router` as its own dependency.
- [x] Update `_utils.jsx` to re-export from `_utils-core.js` — line 7: `export { configMatcher, getActiveConfig } from './_utils-core'`
- [x] Verify `api/index.js` can be imported in a Node environment — added `.js` extensions to all local imports (`createRequest.js`, `proecessNewData.js`, `updateDMSAttrs.js`, `_utils-core.js`) for Node ESM compatibility. Verified all 7 import chain targets resolve without error.
- [x] Audit remaining API files for any other browser-only imports — `createRequest.js`, `proecessNewData.js`, `updateDMSAttrs.js` use only `lodash-es` (Node-safe). No browser-only deps found.

**Deliverable**: The `src/api/` directory is fully importable from Node.js. ~~without React/browser dependencies.~~ `react-router` is a dependency (for `matchRoutes`), but it runs fine in Node — replacing it risked breaking edge cases the web client depends on.

**Design note**: The original spec called for removing `react-router` from `_utils-core.js`. This was revised because `matchRoutes` handles important edge cases (route scoring, tiebreaking, encoded segments) that a lightweight replacement wouldn't faithfully replicate. Since `_utils-core.js` is shared with the web client, correctness was prioritized over avoiding the dependency.

### Phase 1: Foundation — DONE

- [x] Project scaffolding — `packages/dms/cli/` with `package.json` (`"bin": { "dms": "./bin/dms.js" }`, `"type": "module"`), entry point `bin/dms.js` (Commander.js). Dependencies: `commander`, `lodash-es`, `react-router`.
- [x] Falcor HTTP client — `cli/src/client.js` exports `createFalcorClient(host, authToken)`. Implements `.get(...paths)`, `.call(callPath, args)`, `.getCache()`, `.invalidate()`. Handles `$atom`/`$ref`/`$error` sentinel unwrapping, range expansion, internal cache with deep merge.
- [x] Config resolution — `cli/src/config.js` exports `resolveConfig()` and `validateConfig()`. Priority: CLI flags > env vars (`DMS_HOST`, `DMS_APP`, `DMS_AUTH_TOKEN`) > `.dmsrc` file (searched up from cwd).
- [x] Wire up shared API — `dmsDataLoader`/`dmsDataEditor` from `../src/api/index.js` import cleanly in Node (verified). Raw commands use direct Falcor calls (appropriate for low-level CRUD); the shared API functions are available for Phase 2's content-aware commands which need route-based config matching.
- [x] `raw get`, `raw list`, `raw create`, `raw update`, `raw delete` — all 5 in `cli/src/commands/raw.js`. Features: attribute filtering (`--attrs`), pagination (`--limit`/`--offset`), `--data` JSON input, `--set key=value` with dot notation for nested keys, deep merge on update.
- [x] JSON and summary formatters — `cli/src/formatters/json.js` (TTY-aware pretty/compact), `cli/src/formatters/summary.js` (`formatItemSummary`, `formatListSummary`, `formatItemDetails`).
- [x] Basic error handling and connection diagnostics — `ECONNREFUSED` → "Connection refused, is the server running?", HTTP errors with status code, "Item not found" for missing IDs, JSON parse errors for invalid `--data`, missing config field errors with remediation hints.

**Deliverable**: A working CLI that can read/write any `data_items` row by id or app+type.

**Design note**: Raw commands use direct Falcor calls rather than `dmsDataLoader`/`dmsDataEditor` because the shared API functions are designed for React route-based config matching and child config traversal — unnecessary overhead for low-level CRUD. The Falcor client implements the same protocol and interface, so behavior is consistent with the web client at the transport level.

### Phase 2: Content-Aware Commands — DONE

- [x] `site show`, `site patterns` — `cli/src/commands/site.js`
- [x] `pattern list`, `pattern show`, `pattern dump` — `cli/src/commands/pattern.js`
- [x] `page list`, `page show`, `page dump` (with `--sections` expansion) — `cli/src/commands/page.js`
- [x] `page create`, `page update`, `page publish`, `page unpublish`, `page delete` — `cli/src/commands/page.js`
- [x] `section list`, `section show`, `section dump` — `cli/src/commands/section.js`
- [x] `section create`, `section update`, `section delete` — `cli/src/commands/section.js`
- [x] Slug resolution for pages — `resolveIdOrSlug()` in `cli/src/utils/data.js` (numeric → ID, string → `searchOne` by `url_slug`)
- [x] Tree formatter — `cli/src/formatters/tree.js` (`formatTree`, `buildPageTree`, `formatSiteTree`, `formatPageTree`)
- [x] Shared Falcor data helpers — `cli/src/utils/data.js` (`fetchAll`, `fetchById`, `fetchByIds`, `resolveIdOrSlug`, `getPageType`, `parseData`, `parseSetPairs`, `makeClient`)
- [x] Config: added `--type` global flag and `DMS_TYPE` env var — needed to construct type strings like `{app}+{type}|pattern`
- [x] Output: added `tree` format routing in `cli/src/utils/output.js`
- [x] Wired all 19 new subcommands in `cli/bin/dms.js` (2 site + 3 pattern + 8 page + 6 section)

**Deliverable**: Full page/section workflow from the terminal.

**Design note**: Commands use direct Falcor calls (same as Phase 1 raw commands) rather than the shared `dmsDataLoader`/`dmsDataEditor`. The shared API functions expect React route-based config matching which is unnecessary overhead for CLI. The `getPageType()` helper resolves `doc_type` from patterns to construct the correct type strings (e.g., `{app}+{docType}` for pages, `{app}+{docType}|cms-section` for sections).

**Design note**: The type strings in the original task spec (`admin+pattern-admin`, `{app}+docs-page`) are the base format types before `initializePatternFormat` transforms them. Actual stored types depend on site config: site is `{app}+{type}`, pattern is `{app}+{type}|pattern`, page is `{app}+{docType}`, section is `{app}+{docType}|cms-section`. This required adding a `type` config field alongside `app` and `host`.

### Phase 3: Datasets, Automation & Testing — DONE

- [x] `dataset list`, `dataset show`, `dataset views`, `dataset dump`, `dataset query` — `cli/src/commands/dataset.js`
- [x] `site tree` command — added `tree()` to `cli/src/commands/site.js`
- [x] stdin support for `section update --data -` (also `page update` and `raw update`) — via `readFileOrJson()` in `cli/src/utils/data.js`
- [x] Tree formatter enhanced for datasets — `cli/src/formatters/tree.js` renders `Source:` nodes, dead code removed
- [x] `getDatasetType()` helper — mirrors `getPageType()` for datasets/forms patterns
- [x] Server: `DMS_DB_ENV` env var — `dms-server/src/routes/dms/dms.route.js` reads `process.env.DMS_DB_ENV`
- [x] Test SQLite config — `dms-server/src/db/configs/cli-test.config.json`
- [x] Test fixtures — `cli/test/fixtures/` (site.json, patterns.json, pages.json, sections.json, datasets.json)
- [x] Seed script — `cli/test/seed.js` (populates via Falcor HTTP, outputs ID manifest)
- [x] Test harness — `cli/test/harness.js` (server lifecycle, CLI runner, assertions)
- [x] Integration test suite — `cli/test/run.js` (21 tests covering all phases)
- [x] Wired 5 dataset subcommands + `site tree` in `cli/bin/dms.js`
- [x] Fixed `--type` option conflict: section create's `--type` renamed to `--element-type` to avoid clash with global `--type` (site type)

**Deliverable**: Complete CLI covering all major content types with automation-friendly I/O and full integration test suite.

**Design note**: The `--type` global option (site type identifier) conflicted with `section create --type` (element type). Commander.js lets subcommand-local options shadow globals, which silently replaced the site type with the element type. Renamed to `--element-type` for clarity.

**Design note**: Test suite runs against a fresh SQLite database via dms-server subprocess. Each run deletes the old database, starts the server with `DMS_DB_ENV=cli-test`, seeds via Falcor HTTP calls, runs all CLI commands via `execSync`, and verifies output. Tests the full HTTP path end-to-end.

### Phase 4: Documentation — DONE

- [x] `docs/README.md` — Installation, configuration (.dmsrc, env vars, flags), global options, full command reference (site, pattern, page, section, dataset, raw), output formats, data input methods, testing, error handling
- [x] `docs/TYPES.md` — Content type reference with type string format, all 7 content types (site, pattern, page, section, dataset source, dataset view, data rows), field tables, relationship diagram, type resolution chain, raw access, deep merge behavior
- [x] `docs/EXAMPLES.md` — Cookbook for common workflows: inspect site structure, export/backup, create content, update content, publish workflow, delete content, datasets, raw access, piping/automation, multiple patterns, output formats
- [x] In-CLI help (`dms --help`, `dms page --help`, etc.) — Commander.js descriptions on all commands and options (done in Phase 1-3)

Documentation written for two audiences:
1. **Developers/operators** who want to automate DMS workflows
2. **AI agents** that need structured reference for tool use (clear field names, type strings, expected inputs/outputs)

## Technical Considerations

### Falcor Client Without Browser Dependencies

The web client uses `@availabs/avl-falcor` which wraps `falcor` + `falcor-http-datasource` with React hooks. The CLI needs a standalone equivalent that provides the same `.get()` and `.call()` interface so the shared API functions work unchanged. The core protocol is simple:

```
POST /graph
Content-Type: application/x-www-form-urlencoded
Body: method=get&paths=[["dms","data","byId",1,["id","data"]]]

Response: {"jsonGraph": {"dms": {"data": {"byId": {"1": {"id": {"$type": "atom", "value": 1}, ...}}}}}}
```

For `call`:
```
POST /graph
Content-Type: application/x-www-form-urlencoded
Body: method=call&callPath=["dms","data","create"]&arguments=["app","type",{}]
```

Implement a `FalcorClient` class that wraps this into `.get(paths)` and `.call(path, args)` methods, handling `$atom` unwrapping and `$ref` following. The key requirement is interface compatibility — `dmsDataLoader(falcor, ...)` and `dmsDataEditor(falcor, ...)` should work identically whether `falcor` is the browser client or this Node client.

### Shared API Code

The CLI imports the API layer directly via relative paths:

```js
// In cli/src/commands/page.js
import { dmsDataLoader } from '../../../src/api'
import { dmsDataEditor } from '../../../src/api'
import { createFalcorClient } from '../client.js'

const falcor = createFalcorClient(config.host, config.authToken)
const data = await dmsDataLoader(falcor, pageConfig, path)
```

This means any bug fix or feature added to the API functions automatically benefits both the web client and CLI. It also means the CLI's behavior is guaranteed to match what users see in the browser — same path construction, same post-processing, same edge case handling.

### Deep Merge on Edit

The server's edit route performs `json_patch(COALESCE(data, '{}'), $1)` (SQLite) or `COALESCE(data, '{}') || $1` (PostgreSQL), meaning updates are **deep-merged**. The CLI's `--set key=value` flag should build a partial data object, not replace the entire `data` column.

### Authentication

The DMS server supports cookie-based auth. The CLI should support:
- `--auth-token` flag or `DMS_AUTH_TOKEN` env var
- Pass token as `Authorization: Bearer <token>` header or cookie
- Graceful handling when auth is not configured (many dev setups run without auth)

### Error Handling

- Connection failures: Clear message with host URL, suggest checking `--host`
- 404/missing items: "Item not found" with the id/slug used
- Permission errors: Show which permission is needed
- Invalid JSON input: Parse error with line/column

## Testing Checklist

### Phase 0 / Phase 1 (verified via import chain test and code review)

- [x] `src/api/` imports cleanly in Node.js — all 7 import targets verified (2025-02-05)
- [ ] `dms raw get <id>` returns correct item — implemented, needs live server test
- [ ] `dms raw list <app+type>` paginates correctly — implemented, needs live server test
- [ ] `dms raw create` + `dms raw get` round-trips data — implemented, needs live server test
- [ ] `dms raw update --set` deep-merges without destroying other fields — implemented, needs live server test
- [x] `--output <file>` writes to file, stdout stays clean — implemented in `output.js`
- [x] Piped output is compact JSON, TTY output is pretty-printed — implemented in `json.js` via `process.stdout.isTTY`
- [x] Config resolution: CLI flags > env vars > .dmsrc — implemented in `config.js`, merge order verified
- [x] Auth token is sent when configured — `Authorization: Bearer` header in `client.js`
- [x] Meaningful errors on connection failure, missing items, bad input — ECONNREFUSED, HTTP status, "Item not found", JSON parse errors

### Phase 2 (implemented, needs live server testing)

- [ ] `dms site show` displays site name and pattern count
- [ ] `dms site patterns` lists patterns with types
- [ ] `dms pattern list` lists patterns
- [ ] `dms pattern show <name>` shows pattern details
- [ ] `dms page list` shows all pages with titles and slugs
- [ ] `dms page show <slug>` resolves slug to correct page
- [ ] `dms page dump <slug> --sections` expands all sections inline
- [ ] `dms page list --format tree` shows hierarchical page tree
- [ ] `dms section list <page-slug>` lists sections with element types
- [ ] `dms section show <id>` shows section metadata
- [ ] `dms section dump <id>` outputs element-data
- [ ] `dms page create --title X --slug Y` creates a draft page
- [ ] `dms page publish <slug>` copies draft_sections → sections
- [ ] `dms section create <page-slug> --type lexical` creates and attaches section

### Phase 3 (all verified by integration test suite — `cli/test/run.js`, 21 tests)

**Server prerequisites:**
- [x] dms-server supports `DMS_DB_ENV` env var to select database config
- [x] SQLite test config created (`cli-test.config.json` → `../data/cli-test.sqlite`)

**Test infrastructure:**
- [x] Seed fixture files in `cli/test/fixtures/` (site, patterns, pages, sections, datasets as JSON)
- [x] Seed script (`cli/test/seed.js`) populates a blank SQLite database from fixtures
- [x] Full test flow works: fresh DB → seed → CLI commands → verify output

**Phase 1 & 2 (live server verification):**
- [x] `dms raw get/list/create` round-trips correctly
- [x] `dms site show/patterns` returns seeded data
- [x] `dms pattern list/show/dump` returns seeded data
- [x] `dms page list/show/dump/create/update/publish/unpublish/delete` work end-to-end
- [x] `dms section list/show/dump/create/update/delete` work end-to-end
- [x] Slug resolution (`dms page show <slug>`) resolves correctly

**Phase 3 features:**
- [x] `dms section update <id> --data -` reads from stdin and updates
- [x] `dms site tree` builds full site → patterns → pages → sections → datasets hierarchy
- [x] `dms dataset list/show/views` dataset commands
