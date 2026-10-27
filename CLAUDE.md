# DMS Library

The `@availabs/dms` library providing a pattern-based routing system for React applications.

## Packages

- **`packages/dms-server`** - Express.js server providing Falcor JSON Graph API (see `packages/dms-server/CLAUDE.md`)

## Data Model: `app` and `type`

All DMS content lives in `data_items` rows identified by two columns: `app` (text) and `type` (text). Together they form a composite namespace — queries use the concatenated key `app || '+' || type` (e.g., `avail-dms+prod:site`).

### `app`

The application name. All content for a DMS site shares the same `app` value (e.g., `avail-dms`, `transportny`, `wcdb`). Set once when the site is created; every item under that site inherits it.

### `type`

Encodes the row kind, instance name, and parent relationship in a uniform format:

```
{parent}:{instance}|{rowKind}
```

- `|` = hierarchy separator ("belongs to")
- `:` = instance name separator ("is named")
- Row kind is always the last segment after the final `|` (or after `:` if no `|`)
- Any segment can be omitted when not needed

### Type map

| Row kind | Type format | Example |
|----------|------------|---------|
| Site | `{name}:site` | `prod:site` |
| Theme | `{name}:theme` | `catalyst:theme` |
| Pattern | `{site}\|{name}:pattern` | `prod\|my_docs:pattern` |
| Page | `{pattern}\|page` | `my_docs\|page` |
| Component | `{pattern}\|component` | `my_docs\|component` |
| dmsEnv | `{site}\|{name}:dmsenv` | `prod\|my_env:dmsenv` |
| Source | `{dmsenv}\|{name}:source` | `my_env\|traffic_counts:source` |
| View | `{source}\|{name}:view` | `traffic_counts\|v1:view` |
| Data row | `{source}\|{view_id}:data` | `traffic_counts\|10:data` |

Instance names are human-readable slugs derived from user-provided names via `nameToSlug()` (lowercase, underscores, no special chars). UUIDs are no longer used in type strings.

### Parsing

Use shared utilities from `utils/type-utils.js` (client ESM) or `db/type-utils.js` (server CJS):

```js
parseRowType(type) → { parent, instance, kind, raw }
getKind(type)      → 'site' | 'pattern' | 'page' | 'component' | 'source' | 'view' | 'data' | ...
getParent(type)    → parent prefix string
getInstance(type)  → instance name string
isSplitType(type)  → type.endsWith(':data')
buildType({ parent, instance, kind }) → type string
nameToSlug(name)   → sanitized slug
```

### Common queries

| Query | SQL |
|-------|-----|
| All sites | `type LIKE '%:site'` |
| All patterns for site | `type LIKE 'prod\|%:pattern'` |
| All pages for pattern | `type = 'my_docs\|page'` |
| All components for pattern | `type = 'my_docs\|component'` |
| All sources in dmsEnv | `type LIKE 'my_env\|%:source'` |
| All views for source | `type LIKE 'traffic_counts\|%:view'` |
| All data rows | `type LIKE '%:data'` |

### Split tables (dataset row data)

Dataset rows can be large (millions of rows) so they are routed to per-type split tables instead of the main `data_items` table. Split detection is simple: `type.endsWith(':data')`.

Split types are routed to `data_items__{sanitized_type}` (e.g., `data_items__traffic_counts_10_data`). The table is auto-created on first write. All other DMS content (sites, patterns, pages, components, sources, views) stays in the main `data_items` table.

### Invalid data rows

Invalid rows share the same type and split table as valid rows. They are distinguished by `data.isValid = false` (not by a separate type suffix).

### Type hierarchy summary

```
Site:      app=myapp  type=prod:site
  ├─ Theme:    app=myapp  type=catalyst:theme
  ├─ dmsEnv:   app=myapp  type=prod|my_env:dmsenv
  │   └─ Source:   app=myapp  type=my_env|traffic_counts:source
  │       ├─ View:     app=myapp  type=traffic_counts|v1:view
  │       └─ Data:     app=myapp  type=traffic_counts|10:data  [split table]
  └─ Pattern:  app=myapp  type=prod|my_docs:pattern
       ├─ Page:      app=myapp  type=my_docs|page
       └─ Component: app=myapp  type=my_docs|component
```

### Legacy format (backward compat)

The server still accepts old-format types during migration. Old format used `doc_type` in data, `cms-section` instead of `component`, UUID-based type prefixes, and `{docType}-{viewId}` for data rows. These are detected by the absence of `:` in the type string. Legacy support will be removed after all databases are migrated.

## UI Component Access Convention

**Always access UI components through `ThemeContext`, never via direct imports.** Each pattern's `siteConfig.jsx` wraps its children with `ThemeContext.Provider` containing the shared `UI` object. Components then destructure what they need from context:

```jsx
// In siteConfig.jsx — provide UI through ThemeContext
import UI from "../../ui"
import { ThemeContext } from "../../ui/themeContext"

// ...
<ThemeContext.Provider value={{ theme, UI }}>
  {children}
</ThemeContext.Provider>

// In any child component — consume UI from context
import { ThemeContext } from "path/to/ui/themeContext"

const MyComponent = () => {
  const { UI } = React.useContext(ThemeContext) || {};
  const { Button, DndList, Modal } = UI;
  // ...
}
```

**Do not** import UI components directly from the `ui/` directory or create local component files. The context pattern ensures components are themeable and consistent across the application. All shared UI components live in `packages/dms/src/ui/` and are exported via the `UI` object in `ui/index.js`.

## Navigation Rules

**Never use `window.location` for navigation.** Always use React Router's `useNavigate` hook. Using `window.location.assign()`, `window.location.href`, or `window.location.replace()` causes a full page reload, losing all React state and triggering unnecessary re-fetches. Use `navigate(path)` from `useNavigate()` for client-side navigation instead.

## Data Fetching Rules

**Falcor should only be used directly inside the `api/` layer.** Pattern components and pages must never call `falcor.get()`, `falcor.call()`, or `falcor.invalidate()` directly. Instead, data should flow through:

1. **Route configuration in `siteConfig.jsx`** — the primary way. Configure `action`, `filter`, and `format` on routes so that the DMS manager (EditWrapper/ViewWrapper) loads the right data and passes it as `item`/`dataItems` props. Think carefully about what data each route needs and set up the route config to provide it.

2. **`apiLoad`** — when a component genuinely needs to fetch data that isn't available from the route config (e.g., loading related items on demand). `apiLoad` wraps `dmsDataLoader` and returns data through the proper API layer.

3. **`apiUpdate`** — for mutations. Wraps `dmsDataEditor` which handles `dms-format` attribute processing (`updateDMSAttrs`), Falcor cache invalidation, and navigation.

This keeps Falcor as an implementation detail of the API layer, making components testable and ensuring data flows through a single well-understood path.

## DMS Interprets Data — It Never Knows Types

**The core library, client and server, must contain no knowledge of any specific type, format,
pattern, or app.** It interprets data that describes those things. Customization lives in **patterns,
components and themes**; when behaviour has to vary by type, that variation is *exported as data*
from one of those three places and interpreted by the core. It never lands in the core itself.

The test is deployment: **can a new pattern, type or app be added without editing anything under
`packages/dms` or `packages/dms-server`?** If it cannot, the design is wrong — not inconvenient,
wrong. A library `switch` on a type name is a deployment blocker wearing a readable face.

### The registry is the model to copy

`packages/dms/src/patterns/registry.js` already does this properly, and says so: patterns register
metadata and *"the admin lists read the entries' metadata instead of hard-coding types"*. A pattern
declares a **capability**; the core checks the capability, never the name:

```js
// RIGHT — the core asks what a pattern can do
registry[type].providesDatasources        // → this type's rows are datasources
registry[type].admin.duplicable           // → Duplicate is offered
registry[type].pageComponents             // → section types it ships

// WRONG — the core asks what a pattern is called
pattern.pattern_type === 'datasets'
switch (getKind(row.type)) { case 'page': ... }
if (format.type === 'source') { ... }
```

Every `=== 'datasets'` is a missing capability flag. Reach for a new registry or format field before
reaching for a name comparison.

### Where the core still knows too much

Current debt, so this reads as a standard and not an aspiration:

| Location | Violation |
|---|---|
| `render/spa/utils/index.js` | seven `pattern_type === 'admin' / 'auth' / 'datasets'` checks in the router |
| `utils/adminPermissions.js` | `permissionOptionsFor` switches on pattern type to pick a vocabulary |
| `dms-server/routes/dms/dataAuth.js` | `judge()` — a `switch` over eleven row kinds, each with hand-written rules |
| `dms-server/auth/utils/permissions.js` | auth-row rules keyed by type name |

### Auth is the live case

Authorization is where this matters most right now, because getting it wrong is silent. A hardcoded
`judge()` means a pattern with new auth rules cannot be deployed without a library release, and — far
worse — a kind nobody added a `case` for falls through to a default. **The default must be
inheritance, never permission.** An unrecognised row resolves through its parent; it is never "signed
in is enough", which silently opens every pattern the library has not been taught about.

Two kinds of knowledge get hardcoded in auth, and each already has a data home:

| Hardcoded | Belongs in |
|---|---|
| *"a page's grants merge with its pattern's"* — relationships between rows | the row's **parentage** (`parent_id`, falling back to the type path), reconstructed by walking it |
| *"changing `authPermissions` needs `edit-page-permissions`"* — which verb governs which field | the pattern's **format**, beside the `permissionDomain` that already declares its vocabulary |

Formats are rows in the `formats` table keyed by `app+type`, which the server already reads
(`dms.controller.js` `getFormat`). So patterns can declare their own auth rules and the server can
aggregate them across every registered pattern, with no new storage and no new transport. A judging
function is then an **interpreter over that aggregate** — it gains no branch when a pattern is added.

**Prefer rules that reconstruct over rules that enumerate.** Parent/child relationships plus per-row
grants reproduce most of what per-kind cases spell out by hand, with one rule instead of eleven. A
vocabulary larger than `read`/`edit` is fine; a vocabulary whose *application* is hand-wired per type
is not.

## Task Management

All **library** tasks are tracked in the `planning/` directory following a consistent workflow.

> Cross-project planning for the AVAIL lab (client/site tasks, weekly plans, the portfolio and the
> initiatives) lives in the consuming app's hub, `dms-template/planning/` (see its
> `planning-rules.md`). Library tasks stay here and link to that hub rather than copying from it.
>
> **Creating or updating a library task?**
> - Link it to an initiative in `dms-template/planning/initiatives/` and tell the user which one. If
>   nothing fits clearly, ask.
> - Add the one-line header under the title: Initiatives · Status · Created by (the session's Claude
>   account email) · Edited by.
> - Run `node planning/shared/scripts/refresh_initiatives.mjs` from the dms-template root.
>
> See this folder's `planning/planning-rules.md`, section "Initiatives, the header line and Created by".

### Directory Structure

```
planning/
├── todo.md              # Active tasks organized by topic
├── completed.md         # Completed tasks with dates
├── planning-rules.md    # Full documentation of structure
└── tasks/
    ├── current/         # Detailed task documents for work in progress
    └── completed/       # Archived task documents
research/                # Exploratory analysis, tech evaluations, refactor proposals
documentation/           # System reference docs, schema docs, architecture overviews
skills/                  # Indexed how-to guides for recurring authoring tasks — see skills/README.md
```

**Check `skills/README.md` before starting non-trivial authoring or live-page-verification work** — it's an indexed set of how-to guides (building a section component, theming, creating pages/reports/routes, navigating a live page's DOM) that sits alongside `planning/` and `documentation/`. A few, notably `traversing-dms-pages.md` and `traversing-report-pages.md`, are explicitly living documents — update them in the same session whenever a live check turns up a new fact, and fix anything stale.

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
  - patterns/admin
  - patterns/auth

### Important

**Before implementing any task, read `planning/planning-rules.md`** — it defines the full workflow including how to track progress in task files during implementation.

When asked to create a task or plan work:
1. Always create the task file in `planning/tasks/current/`
2. Always add a todo entry to `planning/todo.md`
3. Keep the todo list updated as work progresses
4. Move completed tasks to `planning/tasks/completed/` and update `completed.md` and `todo.md`


When implementing a task:
1. Read the task file in `planning/tasks/current/` before starting
2. **Update the task file as you complete each phase/step** — mark items `[x]`, add status to phase headers, note deviations
3. The task file is the **source of truth** for what has been done and what remains — future sessions depend on it
