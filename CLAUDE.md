# DMS Library

The `@availabs/dms` library providing a pattern-based routing system for React applications.

## Packages

- **`packages/dms-server`** - Express.js server providing Falcor JSON Graph API (see `packages/dms-server/CLAUDE.md`)

## Data Model: `app` and `type`

All DMS content lives in `data_items` rows identified by two columns: `app` (text) and `type` (text). Together they form a composite namespace — queries use the concatenated key `app || '+' || type` (e.g., `avail-dms+pattern-admin`).

### `app`

The application name. All content for a DMS site shares the same `app` value (e.g., `avail-dms`, `transportny`, `wcdb`). Set once when the site is created; every item under that site inherits it.

### `type`

Encodes the content kind and its position in the hierarchy using `|` as a separator:

```
{siteType}                    → Site        (e.g., pattern-admin)
{siteType}|pattern            → Pattern     (e.g., pattern-admin|pattern)
{doc_type}                    → Page        (e.g., docs-page)
{doc_type}|cms-section        → Section     (e.g., docs-page|cms-section)
{doc_type}|source             → Dataset     (e.g., my-datasets|source)
{doc_type}|source|view        → View        (e.g., my-datasets|source|view)
{doc_type}-{view_id}          → Dataset row (e.g., traffic_counts-1)
{doc_type}-{view_id}-invalid-entry → Invalid row (validation rejects)
```

The `siteType` is the site's base type string (set in admin). The `doc_type` is set per-pattern — each page or datasets pattern has a `doc_type` that namespaces its child items.

### `doc_type`

A string identifier that links a pattern to its child content. Each pattern stores a `doc_type` in its data:

- **Page patterns**: `doc_type` is typically a descriptive slug like `docs-page`. Pages of that pattern have type `{doc_type}`, sections have type `{doc_type}|cms-section`.
- **Dataset patterns**: `doc_type` is a UUID (for `internal_dataset`) or a sanitized name (for `internal_table`). Dataset row data has type `{doc_type}-{view_id}`, where `view_id` is the numeric version identifier.

The `doc_type` appears in the type string of every child item, so it determines the table name for split tables (dataset rows). For readability, `internal_table` datasets derive `doc_type` from the source name (e.g., `"Traffic Counts"` → `traffic_counts`) rather than generating a UUID.

### Split tables (dataset row data)

Dataset rows can be large (millions of rows) so they are routed to per-type split tables instead of the main `data_items` table. The server's `table-resolver.js` detects split-eligible types:

- **UUID pattern**: `{uuid}-{view_id}` — e.g., `550e8400-e29b-41d4-a716-446655440000-42`
- **Name pattern**: `{name}-{view_id}` — e.g., `traffic_counts-1` (name starts with a letter, contains only `[a-z0-9_]`)

Split types are routed to `data_items__{sanitized_type}` (e.g., `data_items__traffic_counts_1`). The table is auto-created on first write. All other DMS content (sites, patterns, pages, sections, sources, views) stays in the main `data_items` table.

### Type hierarchy summary

```
Site:    app=myapp  type=my-site-type
  └─ Pattern:  app=myapp  type=my-site-type|pattern
       ├─ Page:     app=myapp  type={doc_type}
       │   └─ Section: app=myapp  type={doc_type}|cms-section
       └─ Source:   app=myapp  type={doc_type}|source
           ├─ View:    app=myapp  type={doc_type}|source|view
           └─ Data:    app=myapp  type={doc_type}-{view_id}  [split table]
```

## Data Fetching Rules

**Falcor should only be used directly inside the `api/` layer.** Pattern components and pages must never call `falcor.get()`, `falcor.call()`, or `falcor.invalidate()` directly. Instead, data should flow through:

1. **Route configuration in `siteConfig.jsx`** — the primary way. Configure `action`, `filter`, and `format` on routes so that the DMS manager (EditWrapper/ViewWrapper) loads the right data and passes it as `item`/`dataItems` props. Think carefully about what data each route needs and set up the route config to provide it.

2. **`apiLoad`** — when a component genuinely needs to fetch data that isn't available from the route config (e.g., loading related items on demand). `apiLoad` wraps `dmsDataLoader` and returns data through the proper API layer.

3. **`apiUpdate`** — for mutations. Wraps `dmsDataEditor` which handles `dms-format` attribute processing (`updateDMSAttrs`), Falcor cache invalidation, and navigation.

This keeps Falcor as an implementation detail of the API layer, making components testable and ensuring data flows through a single well-understood path.

## Task Management

All tasks are tracked in the `planning/` directory following a consistent workflow.

### Directory Structure

```
planning/
├── todo.md              # Active tasks organized by topic
├── completed.md         # Completed tasks with dates
├── planning-rules.md    # Full documentation of structure
└── tasks/
    ├── current/         # Detailed task documents for work in progress
    └── completed/       # Archived task documents
```

### Workflow

When creating a new task:

1. **Add to todo.md** - Add a checkbox entry under the appropriate topic:
   ```markdown
   ## dms-server

   - [ ] Fix createData dropping data argument
   ```

2. **Create task file** - Create a detailed task document in `planning/tasks/current/`:
   ```
   planning/tasks/current/fix-createData-drops-data.md
   ```

   Task files should include:
   - Objective
   - Root cause analysis
   - Proposed fix
   - Files requiring changes
   - Testing checklist

3. **Work on the task** - Update the task file as you progress

4. **Complete the task**:
   - Move the task file to `planning/tasks/completed/`
   - Update `todo.md` - change `[ ]` to `[x]`
   - Add entry to `completed.md` with date and link to task file

### Topic Hierarchy

Tasks are organized under these topics in todo.md:

- **api** - Backend API changes, data loading
- **dms-manager** - Admin interface, site management
- **dms-server** - Server, Falcor routes, database
- **ui** - Shared UI components
- **patterns** - Pattern implementations
  - patterns/page
  - patterns/datasets
  - patterns/forms
  - patterns/admin
  - patterns/auth

### Important

**Before implementing any task, read `planning/planning-rules.md`** — it defines the full workflow including how to track progress in task files during implementation.

When asked to create a task or plan work:
1. Always create the task file in `planning/tasks/current/`
2. Always add a todo entry to `planning/todo.md`
3. Keep the todo list updated as work progresses
4. Move completed tasks to `planning/tasks/completed/` and update `completed.md`

When implementing a task:
1. Read the task file in `planning/tasks/current/` before starting
2. **Update the task file as you complete each phase/step** — mark items `[x]`, add status to phase headers, note deviations
3. The task file is the **source of truth** for what has been done and what remains — future sessions depend on it
