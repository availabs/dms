# DMS Content Types Reference

All DMS content lives in `data_items` rows, namespaced by `app` + `type`.
On Postgres in per-app split mode each app has its own `dms_{app}.data_items`
table; on SQLite it's `data_items__{app}`. Dataset row data goes one level
deeper into per-source-view split tables (see "Dataset Data Rows" below).

## Type String Format

Every row's `type` column is `{parent}:{instance}|{rowKind}` (separators
are `|` for hierarchy and `:` for instance name). Reading right-to-left
lets you peel off the row kind first, then the instance, then the parent
chain.

| Row kind | Type column shape | Example |
|----------|-------------------|---------|
| Site | `{name}:site` | `nhomb:site` |
| Theme | `{name}:theme` | `catalyst:theme` |
| Pattern | `{site}\|{name}:pattern` | `nhomb\|datasets:pattern` |
| Page | `{patternInstance}\|page` | `datasets\|page` |
| Component (section) | `{patternInstance}\|component` | `datasets\|component` |
| dmsEnv | `{site}\|{name}:dmsenv` | `nhomb\|alex_data_env:dmsenv` |
| Source | `{dmsEnvInstance}\|{name}:source` | `alex_data_env\|songs:source` |
| View | `{sourceInstance}\|{name}:view` | `songs\|v1:view` |
| Data row | `{sourceInstance}\|{viewId}:data` | `songs\|1066384:data` |

The Falcor cache key for "all rows of type X under app Y" is
`{app}+{type}` (e.g. `asm+nhomb:site`, `asm+datasets|page`).

The `:data` suffix on dataset rows is what triggers split-table
routing on the server.

## Content Types

### Site

Top-level container. Exactly one site row per `{app}+{type}` pair.

**Type column:** `{name}:site`

**Key fields:**

| Field | Type | Description |
|-------|------|-------------|
| `site_name` | string | Display name |
| `patterns` | array | `[{ id, ref }]` — pattern row refs |
| `dms_envs` | array | `[{ id, ref }]` — dmsEnv row refs |
| `theme_refs` | array | `[{ id, ref }]` — theme refs |

The CLI's `--type` flag accepts either the bare instance (`nhomb`) or
the full type (`nhomb:site`).

**CLI:**
```bash
dms site show       # site info
dms site patterns   # list patterns
dms site tree       # full hierarchy (patterns → pages → sections, sources)
```

### Pattern

A routing unit on a site (page, datasets, forms, auth).

**Type column:** `{siteInstance}|{name}:pattern`

**Key fields:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name (also matches the type's instance) |
| `pattern_type` | string | `page`, `datasets`, `forms`, `auth` |
| `base_url` | string | URL prefix |
| `subdomain` | string | Subdomain filter (`*` = all) |
| `dmsEnvId` | number | (datasets/forms) ID of the dmsEnv that owns this pattern's sources |
| `theme` | object | Pattern-level theme overrides |

There is no `doc_type` field — the slug used in downstream type
strings is the pattern's own type-instance, extracted via
`getInstance(pattern.type)`.

**CLI:**
```bash
dms pattern list
dms pattern show <name|id>
dms pattern dump <name|id>
```

### Page

Pages live under a `pattern_type: 'page'` pattern.

**Type column:** `{patternInstance}|page`

**Key fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Page title |
| `url_slug` | string | URL slug (also used by CLI slug resolution) |
| `parent` | string\|number | Parent page ID for hierarchy |
| `index` | string | Sort order among siblings |
| `published` | string | `'published'` or `'draft'` |
| `has_changes` | boolean | Whether draft differs from published |
| `sections` | array | Published section refs |
| `draft_sections` | array | Draft section refs |
| `section_groups`, `draft_section_groups` | array | Layout groups |
| `theme` | object | Page-level theme overrides |

**CLI:**
```bash
dms page list [--published] [--draft] [--pattern <name|id>]
dms page show <id|slug>
dms page dump <id|slug> [--sections]
dms page create --title "Title" --slug slug
dms page update <id|slug> --set field=value
dms page publish <id|slug>
dms page unpublish <id|slug>
dms page delete <id|slug>
```

### Section (Component)

Content blocks attached to a page.

**Type column:** `{patternInstance}|component`

The older `cms-section` form is no longer in use.

**Key fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Section title |
| `level` | string\|number | Nesting level |
| `element-type` | string | Component name: `lexical`, `Card`, `Spreadsheet`, `Graph`, `Header`, … |
| `element-data` | string\|object | Component-specific payload (often a JSON-string body of Lexical state, Card config, etc.) |
| `tags` | array | Content tags |
| `authPermissions` | object | Section-level permissions |
| `parent` | string | `{"id": "<page-id>", "ref": "<app>+<patternRef>"}` |
| `group` | string | Section group name |
| `trackingId` | string | Stable UUID for the section instance |

**CLI:**
```bash
dms section list <page-id|slug> [--draft]
dms section show <section-id>
dms section dump <section-id>
dms section create <page-id|slug> --element-type Card --data '...'
dms section update <section-id> --set element.element-data=...
dms section delete <section-id> [--page <page-id|slug>]
```

### dmsEnv

A logical environment that owns a set of sources. Patterns reference
it via `pattern.data.dmsEnvId`.

**Type column:** `{siteInstance}|{name}:dmsenv`

**Key fields:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name (also matches the type's instance) |
| `sources` | array | `[{ id, ref }]` — source row refs |

The CLI doesn't have `dmsenv` as a top-level command; dataset commands
read the dmsEnv automatically when given a `--pattern` whose
`dmsEnvId` is set.

### Source

A managed dataset under a dmsEnv.

**Type column:** `{dmsEnvInstance}|{name}:source`

**Key fields:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name |
| `categories` | array | Classification tags |
| `metadata` | object | Source-level metadata (incl. `metadata.columns` for column-aware UI) |
| `views` | array | `[{ id, ref }]` — view row refs |
| `config` | object | Source configuration |

**CLI:**
```bash
dms dataset list             # all sources under the pattern's dmsEnv
dms dataset show <id|name>
dms dataset views <id|name>
dms dataset dump <id|name>  [--view <id>] [--limit N]
dms dataset query <id|name> [--view <id>] --filter col=val --order col:asc|desc
```

### View

A saved snapshot/configuration for a source.

**Type column:** `{sourceInstance}|{name}:view`

**Key fields:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | View name (e.g. `version 1`) |
| `view_type` | string | View type identifier |

### Dataset Data Rows

The actual rows for a source view. Stored in a per-view split table on
the server, addressed via the type-key only — there is no per-row
`byId` lookup that hits the split table.

**Type column:** `{sourceInstance}|{viewId}:data`

**CLI access:** `dms dataset dump` / `dms dataset query`. Both go
through the Falcor `options` route (with `{}` filter for dump) so the
server inlines the row attributes — the bare `byIndex → ref → byId`
path doesn't hydrate split-table rows.

## Type Resolution

The CLI builds type strings by:

1. **Site:** `{app}+{config.type}` — `config.type` accepts either `nhomb` or `nhomb:site`; missing `:site` is appended.
2. **Pattern:** read the row directly via the site's `data.patterns` refs (no string concatenation).
3. **Page:** `{patternInstance(pattern)}|page` — `patternInstance` extracts the instance via `getInstance(pattern.type)`.
4. **Section (component):** `{patternInstance(pattern)}|component`.
5. **Source:** read directly via the dmsEnv's `data.sources` refs.
6. **View:** read directly via the source's `data.views` refs.
7. **Data row:** `{sourceInstance(source)}|{viewId}:data` — `viewId` defaults to the latest view, override with `--view`.

When multiple patterns share a `pattern_type`, pass `--pattern
<name|id>` to disambiguate. Without it the CLI picks the first
matching pattern.

## Raw Access

`dms raw` commands work with any `{app}+{type}` pair directly. They
honor `config.app` for `byId` lookups so they work against per-app
split tables.

```bash
# Bare type — config.app is prepended
dms raw list 'nhomb:site'
dms raw list 'datasets|page'

# Full app+type form
dms raw list 'asm+nhomb:site'

# Single row
dms raw get <id> --attrs id,type,data
```

## The `data` Column

All app-level fields live inside a JSON `data` column. The server's
edit route performs a **shallow merge** — entire nested objects are
replaced at the first nesting level.

### `--set` does client-side deep merge

`--set` fetches current data, deep-merges via lodash `merge`, and
sends the full result back:

```bash
dms page update home --set title="Updated Title"
dms raw update <id>  --set theme.layout.options.topNav.size=full
```

Dot notation creates nested objects.

### `--data` sends as-is

`--data` posts the JSON directly. Server still shallow-merges, so
top-level keys you don't include are preserved but nested objects
under keys you do include get fully replaced.

**Caution:** if the row has `{theme: {layout: {...}, navOptions: {...}}}`
and you send `--data '{"theme": {"layout": {"new": 1}}}'`, the entire
`theme` value gets replaced — `navOptions` is lost.
