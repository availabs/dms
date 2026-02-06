# DMS Content Types Reference

All DMS content lives in a single `data_items` table. Items are namespaced by `app` + `type` pairs, where `app` is the site's application name and `type` determines the content kind.

## Type String Format

Type strings follow the pattern `{app}+{type}[|suffix]`:

```
avail-dms+pattern-admin           # Site item
avail-dms+pattern-admin|pattern   # Pattern item
avail-dms+docs-page               # Page item
avail-dms+docs-page|cms-section   # Section item
avail-dms+my-datasets|source      # Dataset source
avail-dms+my-datasets|source|view # Dataset view
```

The `app` value comes from your CLI config (`--app` / `DMS_APP` / `.dmsrc`).
The base type comes from the site config (`--type` / `DMS_TYPE`).
Suffixes like `|pattern`, `|cms-section`, `|source` are appended by the CLI based on context.

## Content Types

### Site

The top-level container. Each DMS site has exactly one site item.

**Type string:** `{app}+{type}` (e.g., `avail-dms+pattern-admin`)

**Key fields:**

| Field | Type | Description |
|-------|------|-------------|
| `site_name` | string | Display name of the site |
| `patterns` | array | References to pattern items (`[{ ref, id }]`) |
| `theme_refs` | array | References to theme items |

**CLI commands:**
```bash
dms site show       # Show site info
dms site patterns   # List patterns
dms site tree       # Full hierarchy
```

### Pattern

Patterns define a routing unit within the site. Each pattern has a type (page, auth, datasets, forms) and a base URL.

**Type string:** `{app}+{type}|pattern` (e.g., `avail-dms+pattern-admin|pattern`)

**Key fields:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Pattern display name |
| `pattern_type` | string | One of: `page`, `auth`, `datasets`, `forms` |
| `base_url` | string | URL prefix (e.g., `/`, `/data`, `/auth`) |
| `subdomain` | string | Subdomain filter (`*` for all) |
| `doc_type` | string | Document type for child items (e.g., `docs-page`) |
| `authPermissions` | object | Permission configuration |
| `theme` | object | Pattern-level theme overrides |

**CLI commands:**
```bash
dms pattern list
dms pattern show <name-or-id>
dms pattern dump <name-or-id>
```

### Page

Pages are the primary content units within a `page`-type pattern. Each page has a URL slug, optional parent (for hierarchy), and references to sections.

**Type string:** `{app}+{doc_type}` (e.g., `avail-dms+docs-page`)

The `doc_type` is resolved from the page pattern's `doc_type` field. The CLI auto-detects this from the first pattern with `pattern_type: "page"`.

**Key fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Page title |
| `url_slug` | string | URL slug (used for routing and CLI slug resolution) |
| `parent` | string/number | Parent page ID (for hierarchy) |
| `index` | string | Sort order among siblings |
| `published` | string | `"published"` or `"draft"` |
| `has_changes` | boolean | Whether draft differs from published |
| `sections` | array | Published section references (`[{ ref, id }]`) |
| `draft_sections` | array | Draft section references |
| `section_groups` | array | Section grouping/layout info |
| `draft_section_groups` | array | Draft section grouping |
| `theme` | object | Page-level theme overrides |

**CLI commands:**
```bash
dms page list [--published] [--draft]
dms page show <id-or-slug>
dms page dump <id-or-slug> [--sections]
dms page create --title "Title" --slug slug
dms page update <id-or-slug> --title "New Title"
dms page publish <id-or-slug>
dms page unpublish <id-or-slug>
dms page delete <id-or-slug>
```

**Slug resolution:** The CLI accepts either numeric IDs or URL slugs. Strings are resolved via `searchOne` on the `url_slug` field.

### Section

Sections are content blocks within pages. Each section has an element type (e.g., `lexical`, `Card`, `Spreadsheet`) and element data.

**Type string:** `{app}+{doc_type}|cms-section` (e.g., `avail-dms+docs-page|cms-section`)

**Key fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Section title |
| `level` | string/number | Nesting level |
| `element-type` | string | Component type: `lexical`, `Card`, `Spreadsheet`, `Message`, etc. |
| `element-data` | any | Component-specific payload (rich text JSON, card config, etc.) |
| `tags` | array | Content tags for filtering |
| `authPermissions` | object | Section-level permissions |

**CLI commands:**
```bash
dms section list <page-id-or-slug>
dms section show <section-id>
dms section dump <section-id>
dms section create <page-id-or-slug> --element-type lexical
dms section update <section-id> --data '...'
dms section delete <section-id> [--page <page-id-or-slug>]
```

### Dataset Source

Dataset sources define a managed dataset within a `datasets` or `forms` pattern. Each source has a document type, configuration, and views.

**Type string:** `{app}+{doc_type}|source` (e.g., `avail-dms+my-datasets|source`)

**Key fields:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Dataset display name |
| `doc_type` | string | Type for the actual data rows |
| `categories` | array | Classification tags |
| `metadata` | object | Configuration metadata |
| `views` | array | References to view items (`[{ ref, id }]`) |
| `config` | object | Dataset configuration |

**CLI commands:**
```bash
dms dataset list
dms dataset show <id-or-name>
dms dataset views <id-or-name>
dms dataset dump <source-id> [--limit 100]
dms dataset query <source-id> --filter col=val
```

**Name resolution:** Dataset sources can be referenced by numeric ID or name string.

### Dataset View

Views are saved queries/configurations for a dataset source.

**Type string:** `{app}+{doc_type}|source|view`

**Key fields:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | View name |
| `view_type` | string | View type identifier |

### Dataset Data Rows

The actual data items for a dataset, stored under the source's `doc_type`.

**Type string:** `{app}+{doc_type}` (where `doc_type` comes from the source's `doc_type` field)

These are accessed via `dms dataset dump` and `dms dataset query`.

## Relationships

```
Site
 └── patterns[] ──→ Pattern
                      ├── (pattern_type: "page")
                      │    └── pages (by doc_type) ──→ Page
                      │         └── sections[] / draft_sections[] ──→ Section
                      ├── (pattern_type: "datasets" | "forms")
                      │    └── sources (by doc_type|source) ──→ Dataset Source
                      │         ├── views[] ──→ Dataset View
                      │         └── data rows (by source.doc_type) ──→ Data Items
                      └── (pattern_type: "auth")
                           └── (auth configuration, no child items)
```

## Type Resolution

The CLI resolves type strings automatically based on pattern configuration:

1. **Site type:** `{app}+{type}` — from `--app` and `--type` config
2. **Pattern type:** `{app}+{type}|pattern` — appends `|pattern` to site type
3. **Page type:** `{app}+{doc_type}` — reads `doc_type` from the page pattern
4. **Section type:** `{app}+{doc_type}|cms-section` — appends `|cms-section` to page doc_type
5. **Source type:** `{app}+{doc_type}|source` — reads `doc_type` from the datasets pattern
6. **View type:** `{app}+{doc_type}|source|view` — appends `|view` to source type

When multiple patterns of the same type exist, use `--pattern <name-or-id>` to target a specific one. Without `--pattern`, the CLI uses the first matching pattern.

## Raw Access

The `dms raw` commands bypass type resolution and work directly with any `app+type` string:

```bash
# These are equivalent:
dms page show home
dms raw get <page-id>

# Access any type directly:
dms raw list avail-dms+pattern-admin|pattern
dms raw get 42 --attrs id,data,created_at
```

## The `data` Column

All content fields live inside a JSON `data` column. The server's edit route performs a **deep merge** with existing data, so partial updates work:

```bash
# This only updates the title — all other fields are preserved
dms page update home --set title="Updated Title"

# Equivalent to:
dms raw update <id> --data '{"title": "Updated Title"}'
```

The `--set` flag with dot notation creates nested objects:

```bash
dms raw update <id> --set config.sidebar.enabled=true
# Merges: { "config": { "sidebar": { "enabled": true } } }
```
