# DMS CLI

Command-line interface for DMS data management. Reads, writes, and automates DMS content (sites, patterns, pages, sections, datasets) from the terminal.

## Quick Start

```bash
cd packages/dms/cli
npm install
npm link          # makes `dms` available globally
dms --help
```

## Architecture

```
cli/
├── bin/dms.js              # Entry point (Commander.js command wiring)
├── src/
│   ├── client.js           # Falcor HTTP client (Node-native fetch, POST /graph)
│   ├── config.js           # Config resolution (.dmsrc > env vars > CLI flags)
│   ├── commands/
│   │   ├── raw.js          # Low-level CRUD (get/list/create/update/delete)
│   │   ├── site.js         # Site show/patterns/tree
│   │   ├── pattern.js      # Pattern list/show/dump
│   │   ├── page.js         # Page list/show/dump/create/update/publish/unpublish/delete
│   │   ├── section.js      # Section list/show/dump/create/update/delete
│   │   └── dataset.js      # Dataset list/show/views/dump/query
│   ├── formatters/
│   │   ├── json.js         # JSON output (pretty/compact)
│   │   ├── summary.js      # Human-readable summary lines
│   │   └── tree.js         # Box-drawing tree (site hierarchy, page trees)
│   └── utils/
│       ├── data.js         # Shared Falcor helpers (fetchAll, fetchById, resolveIdOrSlug, etc.)
│       └── output.js       # Output routing (stdout/file, format dispatch)
├── test/
│   ├── run.js              # Integration test runner (21 tests)
│   ├── harness.js          # Test harness (server lifecycle, CLI runner, assertions)
│   ├── seed.js             # Seed script (populates test DB via Falcor HTTP)
│   └── fixtures/           # Test data (site, patterns, pages, sections, datasets)
├── docs/
│   ├── README.md           # Full command reference
│   ├── TYPES.md            # Content type reference (fields, relationships, type strings)
│   └── EXAMPLES.md         # Cookbook and common workflows
└── package.json
```

## Key Concepts

### Configuration

Config is resolved from three sources (highest priority first):
1. CLI flags (`--host`, `--app`, `--type`, `--auth-token`)
2. Environment variables (`DMS_HOST`, `DMS_APP`, `DMS_TYPE`, `DMS_AUTH_TOKEN`)
3. `.dmsrc` file (JSON, searched upward from cwd)

### Falcor Client

`client.js` is a standalone HTTP client that speaks the Falcor JSON Graph protocol over `POST /graph`. It maintains an internal cache and supports `get()`, `call()`, `getCache()`, and `invalidate()`. No browser dependencies.

### Type Resolution

Content types are resolved automatically from pattern configuration:
- **Site:** `{app}+{type}` (from config)
- **Pattern:** `{app}+{type}|pattern`
- **Page:** `{app}+{doc_type}` (doc_type read from the page pattern)
- **Section:** `{app}+{doc_type}|cms-section`
- **Dataset source:** `{app}+{doc_type}|source`
- **Dataset view:** `{app}+{doc_type}|source|view`

`getPageType()` and `getDatasetType()` in `utils/data.js` handle this resolution.

### Update Semantics: `--set` vs `--data`

This is the most important behavioral distinction in the CLI:

**`--set` (partial update — read-modify-write):**
The CLI fetches current data from the server, deep-merges changes client-side using lodash `merge`, and sends the complete result. Sibling keys in nested objects are preserved.

```bash
dms raw update 42 --set theme.layout.options.topNav.size=full
# Fetches current data → merges {theme:{layout:{options:{topNav:{size:"full"}}}}} → sends complete data
```

**`--data` (full replacement — sent as-is):**
Data is sent directly to the server without fetching first. The server does a **shallow merge** (PostgreSQL `||` / SQLite `json_patch`) which replaces entire nested objects at the first nesting level.

```bash
dms raw update 42 --data ./backup.json
# Sends file contents directly — good for restores
```

**Why this matters:** If an item has `{"theme": {"layout": {...}, "navOptions": {...}}}` and you send `--data '{"theme": {"layout": {"new": 1}}}'`, the server replaces the entire `theme` key — `navOptions` is lost. Use `--set` for partial updates to avoid this.

For `page update`, the `--title` and `--slug` convenience flags also trigger read-modify-write (same as `--set`).

The conditional logic lives in each command's `update()` function:
- `raw.js:238` — `if (options.set)`
- `page.js:235` — `if (options.set || options.title || options.slug)`
- `section.js:222` — `if (options.set)`

### Slug/Name Resolution

Pages resolve by `url_slug`, datasets resolve by `name`. Numeric strings are treated as IDs. Resolution uses the Falcor `searchOne` path with a `wildKey` filter.

## Commands

| Group | Commands |
|-------|----------|
| `site` | `show`, `patterns`, `tree` |
| `pattern` | `list`, `show`, `dump` |
| `page` | `list`, `show`, `dump`, `create`, `update`, `publish`, `unpublish`, `delete` |
| `section` | `list`, `show`, `dump`, `create`, `update`, `delete` |
| `dataset` | `list`, `show`, `views`, `dump`, `query` |
| `raw` | `get`, `list`, `create`, `update`, `delete` |

## Dependencies

- **commander** — CLI framework
- **lodash-es** — `merge`, `cloneDeep` for deep merge in update commands
- **react-router** — `matchRoutes` used by shared API utils (`_utils-core.js`)

The CLI shares API code with the web client via relative imports into `../../api/` and `../../_utils-core.js`. These files are Node-safe (no browser APIs).

## Testing

```bash
npm test          # Run all 21 integration tests
npm run test:seed # Just run the seed script
```

Tests start a local dms-server with `DMS_DB_ENV=cli-test` (SQLite), seed test data, run CLI commands via `execSync`, and verify JSON output. The test database config lives at `packages/dms-server/src/db/configs/cli-test.config.json`.

## Common Patterns

### Adding a new command

1. Create or edit a file in `src/commands/`
2. Export async functions following the signature `(args..., config, options)`
3. Use `makeClient(config)` to get a Falcor client
4. Use `output(result, options)` for output and `outputError(error)` for errors
5. Wire the command in `bin/dms.js` with Commander

### Adding a new formatter

1. Add a format function in `src/formatters/`
2. Register it in `src/utils/output.js`'s format dispatch

### Section Data Format

Sections store their content inside a nested `data.element` wrapper — **not** at the top level of `data`:

```json
{
  "group": "default",
  "parent": {
    "id": "<page-id>",
    "ref": "<app>+<pattern-name>"
  },
  "element": {
    "element-type": "lexical",
    "element-data": "<JSON string of element content>"
  },
  "trackingId": "<uuid>"
}
```

The `element-data` value is a **JSON string** (not an object). For `lexical` type sections, it contains a Lexical editor state:

```json
{
  "bgColor": "rgba(0,0,0,0)",
  "text": {
    "root": {
      "children": [ ...lexical nodes... ],
      "direction": "ltr",
      "format": "",
      "indent": 0,
      "type": "root",
      "version": 1
    }
  },
  "isCard": ""
}
```

#### Lexical Node Types

| Type | Key fields | Example |
|------|-----------|---------|
| `heading` | `tag`: `"h1"`, `"h2"`, `"h3"` | `{type:"heading", tag:"h2", children:[{type:"text", text:"Title"}]}` |
| `paragraph` | `textFormat`, `textStyle` | `{type:"paragraph", children:[{type:"text", text:"Body"}]}` |
| `code` | `language` | `{type:"code", language:"javascript", children:[{type:"code-highlight", text:"..."}]}` |
| `quote` | — | `{type:"quote", children:[{type:"text", text:"..."}]}` |
| `list` | `listType`: `"bullet"`/`"number"`, `tag`: `"ul"`/`"ol"` | Children are `{type:"listitem", value:1}` nodes |
| `text` | `format` (0=normal, 1=bold, 2=italic), `mode`, `style` | Leaf node inside other blocks |
| `linebreak` | — | Used inside `code` blocks between lines |
| `icon` | `iconName` | `{type:"icon", iconName:"Hurricane"}` |

Code blocks use `code-highlight` children (not `text`) with `linebreak` nodes between lines.

#### Creating Sections via CLI

The `--data` flag on `section create` accepts inline JSON. For large payloads, use shell substitution:

```bash
# Write section data to a file (use a script for nested JSON escaping)
node -e "
  const data = {
    group: 'default',
    parent: { id: '<page-id>', ref: '<app>+<pattern>' },
    element: {
      'element-type': 'lexical',
      'element-data': JSON.stringify({ bgColor:'rgba(0,0,0,0)', text:{root:{children:[...], ...}} })
    },
    trackingId: crypto.randomUUID()
  };
  fs.writeFileSync('/tmp/section.json', JSON.stringify(data));
"

# Create via CLI with shell substitution
dms section create <page-id> --pattern <pattern-id> --data "$(cat /tmp/section.json)"
```

The `--element-type` flag sets `data['element-type']` at top level, which is the **old** format. For production sections, pass the full nested structure via `--data` instead.

Other element types: `Spreadsheet`, `Card`, `Header`, `Graph`, `Selector`.
