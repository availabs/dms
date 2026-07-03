# Using a DMS dataWrapper Card section

How to create a data-bound `Card` page section by **reusing an
existing card's data settings**, or by binding to a Source from
scratch. The `dataWrapper` is the shared loader/state used by
`Card`, `Spreadsheet`, `Graph`, `FilterComponent`,
`UploadComponent`, `ValidateComponent`, and `mnyHeader` — the
binding shape (`externalSource` + `columns` + `filters` +
`display` + `data` + `join` + `pivot`) is identical across all of
them, so the recipe in this skill applies to any of those section
types just by changing `element-type`.

> **Audience:** an engineer or AI that needs to add a Card
> section to an existing DMS page, bound either to the same
> Source as a reference card the user pointed at, or to a Source
> the user has chosen from the site's configured environments.
>
> **Read first:**
> - [`card-layout.md`](./card-layout.md) — every column/cell layout knob.
> - [`creating-pages-from-a-design-pattern.md`](./creating-pages-from-a-design-pattern.md) — page + section CLI surface, the `element` wrapper shape, the draft-only discipline.
> - [`creating-page-section-components.md`](./creating-page-section-components.md) — only if the existing primitives genuinely can't express the design (the bar is high).
>
> **Cross-cutting principle** (from
> [`src/themes/CLAUDE.md`](../../themes/CLAUDE.md)): default to
> **configuring the Card**, not writing a custom column type or
> section. Most "the design has X" answers are spans, format
> functions, theme tokens, or `cardHints` — not new code.

---

## **If you take nothing else** — the source/version rule

Card sections are data bindings, and the binding is the part that
breaks silently. **Always look at the site's configured
environments first, and always confirm the source and version
with the user before writing data into a section** — unless the
user has handed you a specific reference (an existing card ID, a
source name + view, or a Postgres table on a known pgEnv) that
unambiguously names both source and version.

The mistake to avoid: picking a "looks-right" source ID from a
recent card, a spreadsheet config, or a fixture, and seeding the
section with it. Sources mutate (columns renamed, views
deprecated, `srcEnv` shifted to a staging table). A binding that
worked last week may render zeros today. **Read the available
environments, propose, ask. The conversational round-trip is
small; debugging a section bound to the wrong view is large.**

### Two kinds of environments to read

| Where it lives | Holds | How to read it |
|---|---|---|
| **pgEnv(s)** — external Postgres environments | Non-DMS sources (DAMA / legacy AVAIL Postgres tables), each loaded via the falcor `/datasources` route | `.env` → `VITE_DMS_PG_ENVS` (comma-separated). Each pgEnv has a list of sources accessible via the falcor host's `/datasources/source/<source_id>` paths. |
| **dmsEnv(s)** — internal DMS-managed sources | DMS sources whose schema and views are stored as DMS rows under the site | `dms raw get <site-id>` → `data.dms_envs[]`. Each dmsEnv row (`<site-instance>\|<env-name>:dmsenv`) has `data.sources[]` refs pointing at source rows (`<env-name>\|<source-instance>:source`). Each source has `data.views[]` refs pointing at view rows. |

In code, both are merged into a single `datasources` array on the
DMS site config (see
`src/dms/packages/dms/src/patterns/page/pages/_utils/datasources.js`).
A source row from a pgEnv has `type: 'external'` + `env: '<pg-env>'`
+ `baseUrl: '/datasources'` + `isDms: false`; a source row from a
dmsEnv has `type: 'internal'` + `env: '<app>+<pattern-instance>'` +
`isDms: true`.

### The decision flow

```
┌────────────────────────────────────────────────────────────────┐
│ User pointed at an existing card / source / view?              │
└─────────────┬──────────────────────────────────────────┬──────┘
              │ yes                                       │ no
              ▼                                           ▼
   Reuse the externalSource exactly as-is.    Read pgEnvs and dmsEnvs.
   Modify only columns/filters/display/data.  Propose a candidate list.
   No clarification needed.                   Ask the user to pick.
```

Whenever you reach for `dms raw create` or `dms section create`
with a Card payload, the `externalSource` block inside should
either be (a) copied verbatim from a card the user pointed at, or
(b) produced after a confirmed pick from the available
environments.

---

## 1. The binding shape

A Card section's persisted row (one `data_items` row, app
`<app>`, type `<pattern>|component`) has this `data`:

```json
{
  "type": "<pattern>|component",
  "group": "<section-group-uuid>",
  "parent": "{\"id\":\"<page-id>\",\"ref\":\"<app>+<pattern>|page\"}",
  "element": {
    "element-type": "Card",
    "element-data": "<JSON STRING of the binding>"
  },
  "trackingId": "<uuid>",
  "is_draft": true
}
```

The `element-data` JSON string holds the
[`v2 dataWrapper config`](../packages/dms/src/patterns/page/components/sections/components/dataWrapper/schema.js):

```js
{
  externalSource: {
    source_id, view_id, isDms,
    env, srcEnv, baseUrl,             // identifying the data home
    type,                             // source-type slug (DAMA: e.g. "map_21_extended"; DMS: dataType key)
    name, view_name, app,             // human-readable / display
    columns: [                        // schema of the source (ALL available columns)
      { name, type, display_name, desc }, ...
    ],
    updated_at,                       // timestamp of the snapshot
  },
  columns: [                          // SELECTED columns + per-column display props
    { name, show, fn, group, sort, formatFn, customName, valueFontStyle,
      cellSpan, cellRowSpan, justify, hideHeader, hideValue, isLink, ... },
    ...
  ],
  filters: {                          // user-authored filter tree
    op: 'AND',
    groups: [
      { col, op: 'filter', value: [], usePageFilters?: true, searchParamKey?: '...' },
      ...
    ]
  },
  display: {                          // grid + pagination + chrome
    usePagination, pageSize, totalLength, striped,
    cardsGridSize, cardsGridGap, cellsGridSize, cellsGridGap,
    cardBorder, cellBorder, reverse, headerValueLayout, ...
  },
  data: [...],                        // cached rows (view-mode immediate render)
  join: { sources: {} },              // optional — populated when joining additional sources
  pivot: {...}                        // optional — populated when pivot is enabled
}
```

Three details that trip up new authors:

1. **`element-data` is a *JSON string*, not an object.** The
   `JSON.stringify` happens once; never leave it un-stringified
   or the renderer will dump `[object Object]`.
2. **`parent` is *also* a JSON string** (one extra layer of
   stringification) — match the existing shape verbatim.
3. **`externalSource.columns` is the full source schema** (every
   column available to select), while the top-level `columns` is
   the *selected* projection with per-cell layout. Don't conflate
   them. An **empty** `externalSource.columns` → the renderer can't
   resolve field names → **blank card**; copy the real source schema.
4. **A column's `name` is a raw SQL expression — two silent NULL-ers.**
   (a) **`round(double precision, int)` does not exist in Postgres** —
   only `round(numeric, int)`. Any double-producing expression
   (`percentile_cont(...)`, `… / 1e6`, `… / 1440.0`, divisions) must be
   cast **`::numeric` before `round(...,n)`**, e.g.
   `round((percentile_cont(0.5) within group (order by x))::numeric/1440.0, 1)`.
   An un-cast `round(double,int)` errors and the whole row comes back
   as an error object. (b) **A `;` inside a SQL string literal silently
   NULLs the cell** — write `'a · b'`, never `'a; b'`, in a calculated
   column's literal text.
5. **`display.pageSize` is REQUIRED, even with `usePagination: false`.**
   getData computes the fetch range as
   `toIndex = min(length, currentPage * pageSize + pageSize) − 1`
   (`getData.js` ~271). An undefined `pageSize` → `NaN` range → the
   **length query fires but the data request silently never does** —
   the card renders blank with zero console errors. Every seeded
   dataWrapper section (Card, Spreadsheet, Graph) must carry a
   `pageSize`. Corollary for **whole-table aggregate cards** (a KPI
   strip of `count(*) FILTER …` cells, no GROUP BY): the length query
   still returns the raw row count (e.g. 1,314), so `pageSize: 10`
   renders your one real aggregate row followed by 9 all-zero clones —
   set **`pageSize: 1`** on aggregate-only cards.
6. **A SQL-expression column must be *marked* calculated or it won't
   fetch.** `isCalculatedCol` (`buildUdaConfig.js`) recognizes a column
   as SQL only when `display === 'calculated'` || `type === 'calculated'`
   || `origin === 'calculated-column'` || the name contains `" as "`.
   The robust seed shape is both together:
   `{ name: "count(*) FILTER (WHERE status = 'X') as x_total",
   origin: 'calculated-column' }` — the ` as alias` also gives getData's
   `colKey` a clean response-row key (and `normalName: '<alias>'` is what
   avlGraph series read). A bare expression with neither marker is
   treated as a (nonexistent) plain column and drops out of the fetch.
   **In a GROUP BY card** (any column has `group: true`), a calculated
   aggregate column additionally needs **`fn: 'exempt'`** ("already
   aggregated server-side") or the data request silently never fires —
   same rule as avlGraph calc series (`authoring-graphs.md`). Worked
   example: a per-group share bar
   `round(count(*) * 100.0 / max(count(*)) over (), 1) as bar_pct`
   with `{ fn: 'exempt', type: 'data_bar', barMax: 100 }` — the
   window-over-aggregate runs fine under UDA's GROUP BY.

Field-by-field reference: the
[schema.js header doc](../packages/dms/src/patterns/page/components/sections/components/dataWrapper/schema.js).
Layout knobs: [`card-layout.md`](./card-layout.md).

---

## 2. Recipe A — reuse an existing card's data settings

This is the path the user almost always wants when they say
"build a section like card X but showing Y." Card 2173044 in
`npmrdsv5+dev2` is the running example below: a year-by-year
MAP-21 PM3 compliance card bound to a non-DMS source in the
`npmrds2` pgEnv.

### Step 1 — Dump the reference card

```bash
node src/dms/packages/dms/cli/bin/dms.js raw get <reference-card-id> \
  --host <DMS_HOST> --app <APP> --type <TYPE> \
  --pretty --output /tmp/ref-card.json
```

Then parse `element-data`:

```bash
python3 -c "
import json
d = json.load(open('/tmp/ref-card.json'))
ed = json.loads(d['data']['element']['element-data'])
print(json.dumps(ed['externalSource'],
                 indent=2, default=str)[:1500])
"
```

Confirm the source matches what the user has in mind:
`externalSource.name`, `view_name`, `env`, `view_id` are all
human-checkable. If anything seems off, **ask** rather than
proceeding.

### Step 2 — Build the new section's `element-data`

Start from the reference card's config, then change only what's
different. The four pieces you usually touch:

| Piece | Change for "same source, different view" |
|---|---|
| `externalSource` | **Copy verbatim.** (You're keeping the same source binding.) |
| `columns` | Strip down to the columns the new section actually renders; rewrite per-column `valueFontStyle` / `formatFn` / `cellSpan` to match the new design. |
| `filters` | Add or strip filter groups to narrow the new section's slice (e.g., add a `year_record = 2025` group, or remove `usePageFilters` if the section shouldn't react to page filters). |
| `display` | Override grid sizes (`cellsGridSize`, `cardsGridSize`), pagination, totals to match the new layout. |
| `data` | Either drop it (renderer will load on first paint) or refresh it after creating the section to populate the view-mode cache. |

Build the payload with a small Node script (escaping nested JSON
inside JSON is painful from the shell):

```js
// /tmp/seed-compliance-summary.mjs
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const ref = JSON.parse(/* paste /tmp/ref-card.json's contents */);
const refED = JSON.parse(ref.data.element['element-data']);

const elementData = {
  externalSource: refED.externalSource,  // <- verbatim reuse
  columns: [
    // …select-only columns for the new section…
    { name: 'lottr_interstate', show: true, fn: 'exempt',
      customName: 'Interstate reliable', valueFontStyle: 'textXLBold',
      formatFn: ' ', justify: 'center' },
    // …
  ],
  filters: {
    op: 'AND',
    groups: [
      // …page-filter passthroughs to inherit county/MPO/year selectors…
      { col: 'year_record', op: 'filter', value: ['2025'] },
    ],
  },
  display: {
    usePagination: false,
    cellsGridSize: 4, cellsGridGap: 12,
    cardsGridSize: 1, cardsGridGap: 0,
    cardBorder: false, cellBorder: true,
    readyToLoad: true,
  },
  data: [],  // let the renderer load on first paint
  join: { sources: {} },
};

const section = {
  type: ref.data.type,                         // same pattern|component type
  group: '<target-section-group-uuid>',
  parent: JSON.stringify({ id: '<page-id>', ref: ref.app + '+' + ref.data.type.replace('component', 'page') }),
  element: {
    'element-type': 'Card',
    'element-data': JSON.stringify(elementData),
  },
  is_draft: true,
  trackingId: randomUUID(),
};

writeFileSync('/tmp/new-section.json', JSON.stringify(section, null, 2));
```

### Step 3 — Create the section as a draft

```bash
node src/dms/packages/dms/cli/bin/dms.js raw create \
  <APP> '<PATTERN>|component' \
  --data "$(cat /tmp/new-section.json)" \
  --host <DMS_HOST> --app <APP> --type <TYPE>
```

The section lands as a draft (the renderer reads
`page.draft_sections[]`, but you also need to add the new
component's ID to the page's `draft_sections` array — see
§4 of [`creating-pages-from-a-design-pattern.md`](./creating-pages-from-a-design-pattern.md)
for the page update step). **Never publish from a seed
script.** Humans run `dms page publish`.

### Step 4 — Verify in the admin UI

Open the page in edit mode, locate the new section, and click
"Apply" on the toolbar to trigger a data refresh. If the table
renders with values, the binding is healthy.

> **One-shot tip — clone a whole working card, then re-filter.** For a section
> that mirrors a proven binding (e.g. cloning a MAP-21 KPI card onto a new page),
> don't re-derive its SQL — `raw get <section_id>`, take its `element-data`
> verbatim (source, columns, **join**, the 1.5 KB CASE expressions), then change
> only `filters.groups` (swap in your page-variable leaves) and clear `data: []`.
> Reliability §01 cloned cards 2173919/20/21 this way.

---

## 2.6 Joining a second source (targets / crosswalk / labels)

The `join` slot is empty by default; populate it to pull columns from a second
source (a targets table, a label crosswalk) onto each row. The main source is
aliased **`ds`**; each joined source gets its own alias. Worked example — the
MAP-21 KPI cards join the reliability view to a small FHWA-targets `csv_dataset`
on `year_record`:

```jsonc
"join": {
  "operator": "=",
  "sources": {
    "t": {                                   // alias used in SQL as t.<col>
      "source": 2027, "view": 3460, "env": "npmrds2", "srcEnv": "npmrds2",
      "type": "left", "mergeStrategy": "join",
      "joinColumns": [ { "dsColumn": "year_record", "joinSourceColumn": "year_record" } ],
      "sourceInfo": { /* the joined source's full {source_id, view_id, env, type, name, columns[]} */ }
    }
  }
}
```

- In `columns`/`filters`, reference the joined table's fields with the alias
  (`max(t.lottr_interstate_applicable_target)`); bare names resolve to `ds`.
- Under a join, qualify ambiguous base columns explicitly (`ds.year_record`,
  `ds."county_code"` inside a CASE). See `creating-interactive-pages.md` Gotcha 1.
- The join is 1:1 per row when the join key is unique on the joined side (a
  per-year targets table, a county→region crosswalk) — it won't multiply rows.
  This is the clean way to add a **region/label column a view lacks** (an
  alternative to the pass-through-leaf "option A") *if* you have/upload a crosswalk
  source.

---

## 3. Recipe B — bind to a Source from scratch (no reference card)

When the user wants a Card on a topic that has no existing
section to copy from, you do need to construct `externalSource`
yourself. **This is the path that requires the source/version
confirmation step.**

### Step 1 — Inventory the environments

```bash
# pgEnvs (external DAMA / Postgres)
grep VITE_DMS_PG_ENVS .env
# → VITE_DMS_PG_ENVS=npmrds2          (e.g., one or more comma-separated)

# dmsEnvs (internal DMS-managed sources)
node src/dms/packages/dms/cli/bin/dms.js raw get <site-id> \
  --host <DMS_HOST> --app <APP> --type <TYPE> --pretty \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d['data']['dms_envs'], indent=2))"
```

Each `dms_envs[].id` is the row ID of a dmsEnv. Fetch each to see
the sources it holds:

```bash
node src/dms/packages/dms/cli/bin/dms.js raw get <dmsenv-id> ...
# → data.sources[] → list of source row refs
```

For pgEnvs, you can't list available sources via the DMS CLI
(they live on the AVAIL falcor host, not the DMS server). Two
options:

- **If a reference card already binds to that pgEnv**, dump
  any card to crib its source identity shape:
  `externalSource.{source_id, view_id, env, srcEnv, type, name, view_name}`.
- **If not**, ask the user to provide the source ID and (where
  applicable) a view, or to point at a card on a sibling page
  that's already bound to the source they want.

### Step 2 — Propose to the user and confirm

State what you found and ask for the pick. A typical exchange:

> I see two configured environments:
> - `npmrds2` (pgEnv) — used by card 2173044 (Map 21 Extended,
>   view `all_years 2016-2025`)
> - `datasets_env` (dmsEnv) — DMS-managed; has 4 sources (`<list>`).
>
> Which source and view should the new section bind to?

Don't proceed until the user names both the source (or row of
the dmsEnv it lives in) **and** the view/version. Sources almost
always have multiple views; picking silently is the failure
mode.

### Step 3 — Build `externalSource`, then continue at Recipe A §2

Once you have a confirmed pick, construct the `externalSource`
block:

```js
// For a DAMA/pg source (isDms: false):
{
  source_id: 2001,
  view_id:   3394,
  isDms:     false,
  env:       'npmrds2',
  srcEnv:    'npmrds2',
  baseUrl:   '/datasources',
  type:      'map_21_extended',     // DAMA source-type slug
  name:      'Map 21 Extended',
  view_name: 'all_years 2016-2025',
  columns:   [/* schema rows from the source */],
}

// For a DMS-managed source (isDms: true):
{
  source_id: <source-row-id>,
  view_id:   <view-row-id>,
  isDms:     true,
  env:       '<app>+<pattern-instance>',
  srcEnv:    '<app>+<pattern-instance>',
  baseUrl:   '<datasets-pattern-baseUrl>',
  type:      '<dataType-key>',
  name:      '<source-name>',
  view_name: '<view-name>',
  columns:   [/* schema rows from the source's metadata */],
}
```

Then proceed with `columns` / `filters` / `display` / `data` as in
Recipe A.

---

## 2.8 Grouped-list recipes: exclude-nulls + "All others" tail-collapse

Two recurring needs when a grouped Card mirrors a design's ranked list:

**Drop the null/unclassified group** — add an `is_not_null` leaf; the client
maps it to an `exclude` op with the `'null'` sentinel (plus `''` for text
columns), which the server compiles to `... AND col IS NOT NULL`:

```js
filters: [
  { col: 'property_status', op: 'filter', value: [...] },
  { col: 'property_class', op: 'is_not_null' },
]
```

(Fixed 2026-07-02: the server's exclude branch joined the value condition and
null condition with `OR` — a tautology that silently matched every row, so
`is_not_null` leaves no-opped. `routes/uda/utils.js` now emits `AND`.)

**Collapse the tail into one "All others" row** — group by a CASE label
instead of the raw column, and pin the bucket last with a selectOnly sort
driver (orderBy preserves column order → tail first, count second):

```js
const TOP = ['South End', 'Eagle Hill', /* … */];
const LABEL = `CASE WHEN neighborhood IN (${TOP.map(h => `'${h}'`).join(', ')}) THEN neighborhood ELSE 'All others' END`;
columns: [
  { name: `${LABEL} as hood_label`, origin: 'calculated-column', show: true, group: true },
  { name: `max(CASE WHEN neighborhood IN (…same list…) THEN 0 ELSE 1 END) as tail_rank`,
    origin: 'calculated-column', fn: 'exempt', sort: 'asc', show: true, selectOnly: true },
  { name: 'ogc_fid', fn: 'count', show: true, sort: 'desc' },
]
```

⚠ **The membership list must be a static value list.** The UDA sanitizer
(`sanitizeName`, `routes/uda/utils.js`) rejects any column/groupBy expression
containing `select` (and other DML keywords, and `;`) as SQL-injection
defense — a live top-N via subquery is not expressible, and a rejected
expression is **silently dropped** from SELECT and GROUP BY (the card renders
one ungrouped row and null labels — that's the symptom to recognize). Counts
stay live; refresh the list when the ranking shifts.

---

## 3.5 Data Fetch Mode — cache / smart / force (set it deliberately)

Every dataWrapper section has `display.fetchMode` (toolbar: "Data Fetch Mode"),
governing **view-mode** loading (edit mode always fetches with dedup). Choose
per section — the default is whatever `readyToLoad` implied, which is usually
wrong for at least some cards on a page:

| Mode | View-mode behavior | Use for |
|---|---|---|
| `smart` | Renders the saved `data` rows immediately; the dedup key is seeded from them, so it **refetches ONLY when a param changes** (a page-variable filter, a config edit) — not on every page load. | Sections whose query is fixed *except* for filter params — KPI cards and sparks driven by a year/region selector. |
| `cache` | Renders the saved `data` rows; **never fetches** in view mode. Refresh by re-saving the section (or a seed script). | Sections whose data genuinely can't change between content publishes — an annual-series chart, reference tables. |
| `force` | Refetches every load (bypasses dedup). | Only sections whose underlying rows change between page loads with **no param to signal it** — live feeds ("latest event"), running counts, as-of/span panels over a growing series. |

**Decision rule:** filter-driven → `smart`; static-until-republished → `cache`;
live/growing with no params → `force`. A page full of `force` cards re-runs
every query on every visit for data that hasn't changed — the TSMO home page
runs 12 of its 15 data sections on `smart`/`cache` and only the three live
freshness/count panels on `force`.

**Seeding is part of the job.** `cache` renders nothing without saved rows, and
`smart` only skips the initial fetch if the saved rows + config produce a
matching dedup key. So when you set these modes from a seed script, also
populate `element-data.data` with the query's current rows (keyed by
`normalName || name` — same as getData). Worked example:
`scratchpad/npmrdsv5-dev2/set_fetch_modes.mjs` (classifies by config shape,
runs each card's own SQL against the source pgEnv, writes rows + mode back).
Bonus: seeded `smart` cards paint instantly even when their query is slow —
the fetch cost is only paid when a user actually changes a param.

**Seeding also fixes the cold-load same-view race.** When many sections on one
page bind the **same view** and all fire their first (cold, uncached) fetch
simultaneously, the concurrent requests contend and invalidate each other's
dedup keys → sections render **blank-until-warm** on first paint, inconsistently.
Pre-seeding `element-data.data` (so each card already has rows) means there's no
cold fetch on load — the page paints deterministically, and `smart` still
refetches when a filter actually changes. For a data-dense page (a dozen+ cards
on the same view), treat seeding as **required**, not an optimization. Pair the
build script with a seed script that runs each card's own query at the default
page-filter values and writes the rows back (keyed by `normalName || name`).

---

## 4. Common refrains

**Q: Can I just hand-build the `columns` array without going
through the admin UI first?**
A: Yes for simple cases. For anything with calculated columns
(SQL expressions in `name`), copy the exact expression from an
existing card — DAMA's SQL dialect has quoting quirks that are
hard to get right by hand.

**Q: The data array in the existing card has stale rows. Should I
copy it?**
A: No. Drop `data: []` (or omit) and let the renderer load on
first paint. The cached `data` is only useful when you want
instant view-mode rendering before the first query resolves;
seed scripts usually shouldn't pretend to know the rows.

**Q: How do I know which view a source has?**
A: For DAMA sources, every existing card pointing at that source
will record the view it used in
`externalSource.{view_id, view_name}`. For DMS sources,
`dms raw get <source-id>` → `data.views[]` lists view refs;
follow one to see name + columns. **Either way, ask the user
which view if you don't have a reference card to copy from.**

**Q: What if the section type isn't `Card` — say it's
`Spreadsheet` or `Graph`?**
A: The `element-data` shape is the same (`externalSource` +
`columns` + `filters` + `display` + `data` + `join` + `pivot`).
Only `element-type` and the per-section `display` fields change.
The skill applies; consult that section's `config.{js,jsx}` for
its specific `display` knobs.

**Q: Can I publish the section after creating it?**
A: No. This skill is draft-only by design — same rule as
[`creating-pages-from-a-design-pattern.md` §6](./creating-pages-from-a-design-pattern.md#6-draft-only-discipline).
Humans run `dms page publish` after eyeballing the page in admin.

---

## 5. Worked references

- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/schema.js` — the canonical persisted shape.
- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/migrateToV2.js` — legacy formats and how they're normalized to v2 (useful when reading older cards).
- `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/Card.config.jsx` — every Card-specific `display` control and column control.
- `src/dms/packages/dms/src/ui/components/Card.jsx` — the renderer; consult to predict how a given `display` + `columns` shape will lay out before writing the seed.
- `src/dms/packages/dms/src/patterns/page/pages/_utils/datasources.js` — how pgEnvs and dmsEnvs are merged into the `datasources` array consumed by the section renderer.
