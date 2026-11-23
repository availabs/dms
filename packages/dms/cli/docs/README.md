# DMS CLI

Command-line interface for DMS data management. Read, write, and automate DMS content (sites, patterns, pages, sections, datasets) from the terminal.

## Installation

The CLI lives inside the DMS package at `packages/dms/cli/`. It shares API code with the web client via direct relative imports.

```bash
cd packages/dms/cli
npm install

# Run directly
node bin/dms.js --help

# Or link globally
npm link
dms --help
```

**Requirements:** Node.js >= 18.0.0

## Configuration

The CLI resolves config from three sources (highest priority first):

### 1. CLI Flags

```bash
dms site show --host http://localhost:4444 --app my-app --type my-site
```

### 2. Environment Variables

```bash
export DMS_HOST=http://localhost:4444
export DMS_APP=my-app
export DMS_TYPE=my-site
export DMS_AUTH_TOKEN=your-token
```

### 3. Project Config File (`.dmsrc`)

Create a `.dmsrc` file in your project directory (searched up from cwd):

```json
{
  "host": "http://localhost:4444",
  "app": "my-app",
  "type": "my-site",
  "authToken": "optional-token"
}
```

### Required Fields

| Field | Flag | Env Var | Description |
|-------|------|---------|-------------|
| `host` | `--host` | `DMS_HOST` | API server URL (e.g., `http://localhost:4444`) |
| `app` | `--app` | `DMS_APP` | App namespace (e.g., `avail-dms`) |
| `type` | `--type` | `DMS_TYPE` | Site type identifier (e.g., `pattern-admin`) |
| `authToken` | `--auth-token` | `DMS_AUTH_TOKEN` | Auth token (optional, for protected operations) |
| `pagePublishHook` | — | `DMS_PAGE_PUBLISH_HOOK` | Optional. A host app's module that `page publish` runs after publishing (a `.dmsrc` path is relative to that file, an env path to the cwd). Its default export gets `{ falcor, config, pattern, page, helpers }`, and the object it returns is added to the output. E.g. dms-template's `src/plugins/qa/cli/onPagePublish.js`. |
| `commands` | — | — | Optional, `.dmsrc` only. A host app's own command modules, each path relative to the `.dmsrc` (see [App commands](#app-commands)). E.g. dms-template's `src/plugins/qa/cli/commands.js`, which adds `dms qa`. |
| `via` | — | — | Optional. How writes are marked in a dataset's change history: `cli` (the default) or `agent`. Sent as the `X-DMS-Via` header. App commands set it, e.g. `dms qa … --via agent`. |

The `host` field is required for all commands. The `app` and `type` fields are required for content-aware commands (site, pattern, page, section, dataset) but not for raw commands.

## Global Options

```
--host <url>          API host URL
--app <name>          App namespace
--type <type>         Site type identifier
--auth-token <token>  Authentication token
--format <fmt>        Output format: json, summary, tree (default: json)
--output <file>       Write output to file instead of stdout
--pretty              Pretty-print JSON (default when stdout is a TTY)
--compact             Compact JSON (default when piped)
--no-room-sync        Don't sync a page's live-edit room after writing its draft_sections
```

## Commands

### Site

```bash
# Show site info (name, pattern count, theme refs)
dms site show

# List all patterns registered on the site
dms site patterns

# Show full site hierarchy: patterns -> pages -> sections, datasets
dms site tree

# Give every page its own copy of a section it shares with another page, or borrows from another
# pattern. Prints the plan unless --apply; --pattern limits the edits to one pattern's pages
dms site unshare-sections
dms site unshare-sections --apply [--pattern <name>] [--backup <file>]
```

`unshare-sections` reads every page of every pattern in the site's list. A section listed by two or
more pages stays with the lowest-id page of its own pattern; every other page gets a copy (same
`data`, `trackingId` included, in that page's pattern, `parent_id` = the page) and its list entry is
repointed, in both lists if the page lists the row in both. A page listing another pattern's section
always gets its own copy. Before writing, the changed pages' two lists are saved to `--backup`
(default `./dms-unshare-sections-<app>-<time>.json`); restore one with `dms raw update <id> --data`.
Writes go through the server, and each page whose `draft_sections` changed has its live-edit room
synced. **Run it as a user who can read every page**: rows it can't read are reported as
`unreadable`, and `--apply` refuses while there are any.

### Pattern

```bash
# List all patterns
dms pattern list

# Show pattern details (by name or ID)
dms pattern show <name-or-id>

# Dump full pattern data as JSON
dms pattern dump <name-or-id>
```

### Page

```bash
# List pages (with optional filters)
dms page list [--published] [--draft] [--limit 50] [--offset 0]

# Show page metadata
dms page show <id-or-slug>

# Dump full page data (optionally with expanded sections)
dms page dump <id-or-slug> [--sections]

# Create a new page
dms page create --title "My Page" --slug my-page [--parent <id>]

# Update a page
dms page update <id-or-slug> --title "New Title"
dms page update <id-or-slug> --set key=value
dms page update <id-or-slug> --data '{"title": "New Title"}'
dms page update <id-or-slug> --data ./page-data.json
dms page update <id-or-slug> --data -    # read from stdin

# Publish / unpublish
dms page publish <id-or-slug>
dms page unpublish <id-or-slug>

# Delete a page and its child pages (recursively). Without --yes it only prints
# every page that would go, with its section count; --yes deletes them all in one call
# (all or nothing: one page you may not delete refuses the whole delete)
dms page delete <id-or-slug>
dms page delete <id-or-slug> --yes

# Check / repair a page's live-edit room against its draft_sections
dms page sync-room <id-or-slug> --check   # report only; exits 1 if "stale"
dms page sync-room <id-or-slug>           # repair
```

**Live-edit room sync.** With local-first sync on, a page opened in edit mode joins a shared Yjs room holding its `draft_sections`, and once that room has content the browser trusts it over the database: the next section save sends the room's list back as `draft_sections`. So every CLI write that changes a page's `draft_sections` — `section create`, `section delete --page`, `page update`, and `raw update` on a page row — also updates that room, and reports the result as `room_sync` in its output:

| `room_sync.status` | Meaning |
|---|---|
| `no_room` | Nobody has edited the page with sync on yet; the browser will seed from the database. Nothing to do. |
| `in_sync` | Room already matched. |
| `repaired` | Room was replaced with the database's list. |
| `stale` | (`sync-room --check` only) Room differs; not written. |
| `failed` | Room couldn't be synced (see `error`). The database write still happened — the command warns on stderr and exits 0; run `dms page sync-room <id>`. |

Skipping it (`--no-room-sync`) is for bulk runs: do the writes, then one `dms page sync-room <id>` at the end. Don't leave a page un-synced — a browser save would silently revert it. Rich-text section content (`section update`) lives in a different room type the CLI can't rebuild and is **not** covered.

**Slug resolution:** Pages can be referenced by numeric ID or URL slug. Numeric values are treated as IDs; strings are resolved via `url_slug` search.

**Pattern selection:** Most page commands auto-detect the page pattern (first pattern with `pattern_type: "page"`). Use `--pattern <name-or-id>` to target a specific pattern when multiple page patterns exist.

### Section

```bash
# List sections for a page
dms section list <page-id-or-slug> [--draft]

# Show section metadata (element-type, title, tags)
dms section show <section-id>

# Dump full section data
dms section dump <section-id>

# Create a section and attach to a page
dms section create <page-id-or-slug> --element-type lexical [--title "Hero"]

# Update a section
dms section update <section-id> --data '{"element-data": "..."}'
dms section update <section-id> --data ./section.json
dms section update <section-id> --data -    # read from stdin
dms section update <section-id> --set element-type=Card

# Delete a section. Its id first leaves `sections` and `draft_sections` of every page of the site
# that lists it, in any pattern (output: `pages`), or only of --page's page
dms section delete <section-id> [--page <page-id-or-slug>]
```

**Always pass `--pattern <name>` explicitly on a multi-pattern site** to `section list`/`create`/`delete`.
(`section update` writes by section id, so it has no `--pattern` option and refuses one.) Without it,
`section list`/`create`/`delete` resolve the page's pattern via `findPatternByKind(..., 'page')`, which
silently picks WHATEVER page-kind pattern comes first for the app — not necessarily the one the
page id/slug you gave actually belongs to. On a site with several page patterns (dev/sandbox
patterns included), this can create/attach a section under the wrong pattern's type string (e.g.
`sandbox|component` instead of `npmrds_sub|component`) with no error — the command reports success,
but the section won't resolve correctly when the real page renders. Confirmed live 2026-08-19; caught
via `dms raw get` on the newly created row, not from any CLI-reported failure.

### Dataset

```bash
# List dataset sources
dms dataset list [--limit 50] [--offset 0]

# Show dataset source details
dms dataset show <id-or-name>

# List views for a dataset source
dms dataset views <id-or-name>

# Dump data rows for a dataset source
dms dataset dump <source-id> [--limit 100] [--offset 0]

# Query with filters and ordering
dms dataset query <source-id> --filter status=active --order name:asc
dms dataset query <source-id> --filter category=docs --filter status=active
```

**Name resolution:** Dataset sources can be referenced by numeric ID or name string.

**Filters:** `--filter col=val` is repeatable. Multiple values for the same column are OR'd. Multiple columns are AND'd.

**Ordering:** `--order col:asc` or `--order col:desc`. Single column ordering.

### Raw

Low-level access to the `data_items` table. Works with any `app+type` combination without needing content-type awareness.

```bash
# Get any item by ID
dms raw get <id> [--attrs id,data,created_at]

# List items by app+type
dms raw list <app+type> [--limit 20] [--offset 0]

# Create a raw item
dms raw create <app> <type> [--data '{"key": "value"}']

# Update a raw item
dms raw update <id> --set key=value          # partial update (read-modify-write)
dms raw update <id> --set nested.key=value   # dot-notation for deep keys
dms raw update <id> --data '{"key": "val"}'  # full replacement (sent as-is)
dms raw update <id> --data ./backup.json     # restore from file
dms raw update <id> --data -                 # read from stdin

# Delete a raw item
dms raw delete <app> <type> <id>
```

### Formats

What the client's pattern registry declares about the site's row kinds — auth rules, permission
vocabulary, `childRefs`, attributes — lives per site in dms-server's `formats` table, where its auth
layer reads it (`dms-server/src/routes/auth/formats.js`). **Only the server's own script writes it**
(`dms-server/src/scripts/register-formats.js`, run where the server runs, dry run by default); no
client can, this CLI included. These commands read it, to check what a site holds.

```bash
# The rows a build declares (from the library checkout; --extra for a host app's own types)
node packages/dms/scripts/emit-formats.mjs > formats.json
node packages/dms/scripts/emit-formats.mjs --extra src/plugins/qa/qa.format.js > formats.json

# Register them, on the server (dry run; --apply writes; keys the file leaves out are removed)
node packages/dms-server/src/scripts/register-formats.js --db <config> --app <app> --file formats.json [--apply]

# Read-only check from anywhere: stored rows vs the file (exit code 1 when they differ)
dms formats diff formats.json

# The stored rows
dms formats list [--format summary]
```

### Plugin

Offline: a plugin package folder (`planning/tasks/current/dms-plugin-system.md`). The rules are dms-server's
(`src/plugins/index.js` `validateManifest`), the same ones its installer will apply.

```bash
dms plugin build <dir> [--host <app>] # build dms.source into dms.entries.client (and dms.entries.classes)
dms plugin validate <dir>            # package.json `dms` key valid, every entry exists; exit 1 otherwise
dms plugin pack <dir> [--out <file>] # write the release index.json: the manifest + every file's size and sha512
```

`build` is a Vite library build of `dms.source` (e.g. `plugin.jsx`) into one ES module at `dms.entries.client`
(e.g. `dist/plugin.js`; point `dms.entries.ssr` at the same file). React, react-dom, `react/jsx-runtime` and
react-router are **not bundled**: their imports become shims that read the host's own copies from
`globalThis.__DMS_PLUGIN_PEERS__` (set by the library's `plugins/peers.js` before it loads a plugin), so a page keeps
one React. Any other React or router module (`react-dom/client`, `react-router/dom`) is refused. The library itself
is not imported either: everything a plugin needs from it comes through `register(host)` (`host.contexts`,
`host.getPatternType`, `host.defaultCheckAuth`, the `register…` methods). Vite and React come from `--host` (the app
the plugin runs in, e.g. dms-template), by default found from `<dir>` upward. With `dms.entries.classes` set, the
Tailwind class names in the plugin's source files are written there, for the server's per-site CSS.

`pack` lists `package.json` and npm's `files` entries (folders whole) when the package has a `files` list, else
every file but `node_modules`, hidden files and a previous `index.json`.

`dms.settings` (optional) declares what a site may set in its activation's `config`, as a small subset of JSON
Schema: `properties` (each with a `type`: `string`, `number`, `integer`, `boolean`, `array` with scalar `items`, or
`object`, plus `enum`, `default`, `title`, `description`, `minLength`/`maxLength`, `minimum`/`maximum`,
`minItems`/`maxItems`), `required` and `additionalProperties` (false unless set: unknown keys are refused). No
`pattern`. `pack` carries it into `index.json`; dms-server refuses an activation whose config doesn't fit the
version's settings, and with no `settings` a plugin takes only an empty config. `dms.permissions` (`schemas`,
`egress`, `taskTypes`, `requires`) is what a site accepts when it activates the plugin; a later version that asks
for more needs the site to accept again before it can switch.

### Stack

A preview stack (dms-template `deploy/stacks.mjs`) is a whole copy of production's DMS data on its own server.
`stack diff` lists what a stack changed since its copy and, for each of those rows, whether production changed it
too after the copy. **It only reads, on both sides.** `stack apply` then writes those rows to production
(dms-template `planning/shared/tasks/current/stack-content-promotion.md`).

```bash
# Production is the usual host (--host / DMS_HOST / .dmsrc); --stack is the stack's API address
dms stack diff --stack https://preview3.weatherenterprise.com --format summary
dms stack diff --stack https://preview3.weatherenterprise.com --output diff.json
dms stack diff --stack <url> --since 2026-11-09T23:50:03Z      # a stack deployed before 2026-11-12
```

**What it reads:**
- **The stack's changes:** its change feed (`/sync/delta`). A stack's change log starts empty at the copy, so the
  feed lists exactly the rows changed there: pages, sections, themes, patterns. Dataset rows aren't in it.
- **The copy time:**
  - `--since`, if given;
  - otherwise the stack's `/_stack.json`, written by `stacks.mjs` with each new database. It tries the stack's
    address, then `www.` in front of it. The time is the content backup's dump start, from its archive header, or,
    when that's missing, the backup names less 10 minutes.
  - With neither, it refuses (exit 1).
- **Production:** each changed row's `type` and `updated_at`.

**What each row is labelled:**

| Result | Meaning |
|---|---|
| `new` | Created in the stack. A promotion creates it with a production id. A note says when that id is already another row in production |
| `change` | Changed in the stack; production hasn't touched it since the copy. For a page, `fields` lists the changed draft-side fields, settings, and published-side fields (never promoted) |
| `delete` | Deleted in the stack; production hasn't touched it since the copy |
| `conflict` | Production changed it after the copy, deleted it, or holds a different row under that id. A promotion refuses while there is any |
| `skip` | Not carried: created and deleted in the stack, or a section copy that publishing in the stack made (production makes its own) |

A note also marks a row pointing at a file on the stack's own storage, which a promotion can't carry.

**Exit codes:**
- **3:** there is at least one conflict. Every row is still checked and every conflict listed first.
- **0:** none.
- **1:** an error.

#### `stack apply`

`stack apply` writes a saved diff's rows to production. **It's a dry run unless given `--apply`.**

```bash
dms stack diff --stack https://preview3.weatherenterprise.com --output diff.json   # review this
dms stack apply diff.json --format summary       # the plan: nothing written
dms stack apply diff.json --apply --site https://www.example.org   # write it; --site makes the publish links full addresses
```

**It runs the diff again first** and refuses unless the result is the file's:
- `--host` and `--app` must be the file's `production` and `app`;
- any conflict refuses the whole promotion (exit 3), with every conflict listed;
- the stack must be at the file's revision. If it changed after the diff, run the diff again and review it;
- every row must be a page, section, theme, pattern or the site row. Dataset settings aren't carried;
- no row may point at a file on the stack's own storage.

It reads the rows' data from the stack, so **the stack has to exist when it runs**.

**What it writes, in order:**
1. **New rows**, sections before the pages that list them. Each gets production's own id, and the ids in a page's
   `draft_sections` (any `{id, ref}`) and a page's `parent` are swapped to match.
2. **Changed sections, themes, patterns and the site row:** the top-level keys that differ. A key the stack removed
   is written as `null`.
3. **Changed pages, draft side only.** `sections`, `section_groups`, `dataSources` and `published` are never
   written. A new page is created with `published: 'draft'`. `has_changes` is set, and the page's live room is put
   in step.
4. **Deleted rows.**

**It never publishes.** The output lists each page to publish with its edit address
(`<base_url>/edit/<url_slug>`), where a person clicks Publish. With `--site <the production site's address>` that's
a full address; without it, a path. The addresses need the site's type (`--type` / `DMS_TYPE`).

Before each write to an existing row it reads the row's `updated_at` again and stops (exit 3) if it changed. The
writes already made stay, and each step in the output says `done` or not.

After a promotion the same stack diffs as conflicts, because production's rows are now newer than the copy.

### App commands

A host app can add its own command groups, so a pattern type that lives in the app ships its
commands and the CLI holds none of its code. List the modules in the app's `.dmsrc`:

```json
{ "commands": ["src/plugins/qa/cli/commands.js"] }
```

Each module's default export is called before the command line is parsed, as
`register({ program, helpers })`. `program` is the CLI's commander program, and `helpers` are the
CLI's own: `getConfig`, `getOutputOptions`, `validateConfig`, `makeClient`, `resolvePattern`,
`parseData`, `fetchById`, `loadDatasetRows`, `output` and `outputError`. A module that fails to load
is reported on stderr and skipped, and the CLI's own commands still run.

The connection settings stay the CLI's own (flags, `DMS_*` variables, `.dmsrc`). dms-template's
`.dmsrc` adds `dms qa` (installs, tickets, ticket, set, comment): see `dms qa --help` and
dms-template's `src/plugins/qa/skills/agent-ticket-run.md`.

## Output Formats

### JSON (default)

Pretty-printed when stdout is a TTY, compact when piped. Override with `--pretty` or `--compact`.

```bash
dms page list                    # pretty-printed to terminal
dms page list | jq '.items[]'   # compact for piping
dms page list --compact          # force compact
```

### Summary

Human-readable format with key fields highlighted.

```bash
dms page list --format summary
```

### Tree

Hierarchical display with box-drawing characters.

```bash
dms site tree
dms page list --format tree
```

### File Output

Write to a file instead of stdout.

```bash
dms page dump home --sections --output page-backup.json
```

## Data Input

Commands that accept data (`create`, `update`) support multiple input methods.

### `--set` (Partial Updates — Read-Modify-Write)

The `--set` flag is for **partial updates**. The CLI fetches the current data from the server, deep-merges your changes client-side, and sends the complete result. This prevents the server's shallow merge from clobbering sibling keys in nested objects.

```bash
dms page update home --set title="New Title"
dms page update home --set config.sidebar=true
dms raw update 42 --set theme.layout.options.topNav.size=full
```

Dot notation creates nested objects. Values are parsed as JSON when possible, otherwise treated as strings. Repeatable — use multiple `--set` flags in one command.

For `page update`, the `--title` and `--slug` convenience flags also trigger read-modify-write.

### `--data` (Full Replacement — Sent As-Is)

The `--data` flag sends data **directly to the server** without fetching current data first. Use this for full replacements or restores from backup.

```bash
# Inline JSON
dms page update home --data '{"title": "Updated Home"}'

# File path
dms section update 42 --data ./section-data.json

# Stdin
echo '{"title": "From stdin"}' | dms page update home --data -
cat backup.json | dms raw update 42 --data -
```

**Warning:** With `--data` alone, the server's shallow merge replaces entire nested objects at the first nesting level. If the item has `{"theme": {"layout": {...}, "navOptions": {...}}}` and you send `{"theme": {"layout": {"newKey": 1}}}`, the server will replace the entire `theme` object — `navOptions` will be lost.

### Combining `--data` and `--set`

When both are used, `--set` takes precedence: the CLI does a read-modify-write with the combined data.

```bash
# Reads current data, merges file contents + set overrides, sends complete result
dms page update home --data ./partial.json --set title="Override Title"
```

## Testing

The CLI includes an integration test suite that runs against a local SQLite-backed dms-server:

```bash
cd packages/dms/cli
npm test          # Run all integration tests (29)
npm run test:seed # Just run the seed script
```

The test suite:
1. Deletes any existing test database
2. Starts dms-server with `DMS_DB_ENV=cli-test`
3. Creates a test admin (`POST /init/setup`) and logs in — deletes require an authenticated user
4. Seeds test data via Falcor HTTP
5. Runs CLI commands and verifies output (Phase 4 drives the live-edit room over the sync WebSocket via `test/room-client.js`)
6. Stops the server

The server also starts task polling for **every** `dama`-role config in `dms-server/src/db/configs/`. If your local configs point at a shared/remote database, point the harness at a dms-server copy whose `db/configs` holds only local sqlite configs: `DMS_TEST_SERVER_DIR=/path/to/dms-server-copy NODE_PATH=<repo>/node_modules npm test`.

Tests cover all commands across all phases (raw, site, pattern, page, section, dataset).

## Error Handling

The CLI provides actionable error messages:

| Error | Message |
|-------|---------|
| Server not running | `Connection refused — is the server running at <host>?` |
| Missing config | `Missing required configuration: host. Set via --host, DMS_HOST, or .dmsrc` |
| Item not found | `Page not found: <slug>` / `Item not found: <id>` |
| Invalid JSON | `Invalid JSON data: <parse error>` |
| No page pattern | `No page pattern found. Use --pattern to specify one.` |
