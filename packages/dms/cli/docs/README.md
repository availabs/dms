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
```

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

# Delete a page
dms page delete <id-or-slug>
```

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

# Delete a section (optionally remove ref from page)
dms section delete <section-id> [--page <page-id-or-slug>]
```

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

# Update a raw item (deep merge)
dms raw update <id> --data '{"key": "new-value"}'
dms raw update <id> --set key=value
dms raw update <id> --set nested.key=value
dms raw update <id> --data -    # read from stdin

# Delete a raw item
dms raw delete <app> <type> <id>
```

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

Commands that accept data (`create`, `update`) support three input methods:

### Inline JSON

```bash
dms page update home --data '{"title": "Updated Home"}'
```

### File Path

```bash
dms section update 42 --data ./section-data.json
```

### Stdin

```bash
echo '{"title": "From stdin"}' | dms page update home --data -
cat section.json | dms section update 42 --data -
```

### Key=Value Pairs

```bash
dms page update home --set title="New Title"
dms page update home --set config.sidebar=true
dms raw update 42 --set data.status=active
```

Dot notation creates nested objects. Values are parsed as JSON when possible, otherwise treated as strings.

## Testing

The CLI includes an integration test suite that runs against a local SQLite-backed dms-server:

```bash
cd packages/dms/cli
npm test          # Run all 21 integration tests
npm run test:seed # Just run the seed script
```

The test suite:
1. Deletes any existing test database
2. Starts dms-server with `DMS_DB_ENV=cli-test`
3. Seeds test data via Falcor HTTP
4. Runs CLI commands and verifies output
5. Stops the server

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
