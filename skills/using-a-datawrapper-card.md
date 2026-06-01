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
   them.

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
