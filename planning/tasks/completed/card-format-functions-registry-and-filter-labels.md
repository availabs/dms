# Card `formatFn` — a registry, and apply it to filter option labels

**Initiatives:** [dms_author_primitives](../../../../../planning/initiatives/dms_author_primitives.md) · **Status:** done · **Created by:** amuro@albany.edu · **Edited by:** —

**Project:** DMS platform · **Topic:** ui/card · **Started:** 2026-10-20

## Objective

Two coupled changes so a Card column's `formatFn` is both **author-applicable** and **consistently
applied**:

1. Make `formatFunctions` an **extendable registry** — mirroring `theme.columnTypes` /
   `registerColumnType` — and derive the per-column **Format** control's options from it, so a
   theme/app can add its own formatter and an author can pick it in the section menu's column editor.
2. Apply the column's `formatFn` to **`filter_control` / multiselect option labels** (the option
   *value* stays raw), so a `filter_control` on a formatted column shows the formatted value.

## Driver

WCDB's show page (`project-planning/wcdb/tasks/current/build-wcdb-show-page.md`, Phase 3). The
`card:show-playlists` picker is a `filter_control` on the new `airing_key` column — a raw value
`680:2026-09-14`. The design's `<select>` must read `Mon, Sep 14, 2026` **while the page variable
keeps the raw key**. A JS format function is the correct shape, but today it reaches neither the
picker's labels nor a theme-registered function. Decision made with the owner 2026-10-20.

## Current State

- `formatFunctions` — a **hardcoded object** in
  `patterns/page/components/sections/components/dataWrapper/utils/utils.jsx:247`, keyed by name
  (`abbreviate`, `comma`, `percent`, `zero_to_na`, `date`, `time`, `datetime`, `minutes_clock`,
  `decimal_2`, `icon`, `color`, `combine`, …).
- It is applied **only to the rendered value**: `ui/components/Card.jsx:445-456`
  (`formatFunctions[attr.formatFn](rawValue, attr.isDollar)`), and the Table's
  `ui/components/table/components/TableCell.jsx` (same idea — verify its exact branch; it also has a
  trailing `.replaceAll`, or not).
- The **Format control is a hardcoded option list**:
  `…/ComponentRegistry/Card.config.jsx:214` (and duplicated in `spreadsheet/config.jsx`). It sits in
  the `columns:` control group, so `sectionMenu.jsx` → `ColumnManager.jsx` (`ColumnRow` maps
  `resolvedControls.columns`) renders it **per column, inside the section menu**. The *affordance*
  already exists; the *list* is closed, with no way to register a custom formatter.
- The picker's labels come from `useColumnOptions` → `parseDataOptions`
  (`patterns/page/components/sections/ConditionValueInput.jsx:21,167,201`): the option *label* is the
  **raw value**, or a server `meta_lookup` label for a `meta-variable` column. `formatFn` is never
  consulted.
- `Card.jsx:456`'s generic branch does `formatFunctions[fn](value, isDollar).replaceAll(' ', '')`,
  **stripping spaces** from the result; only `combine` is exempt. A label formatter returning
  `"Mon, Sep 14, 2026"` would come out `"Mon,Sep14,2026"`.
- Precedent for theme extensibility: `patterns/page/siteConfig.jsx` registers
  `Object.entries(theme.columnTypes).forEach(([k, v]) => registerColumnType(k, v))`
  (`ui/columnTypes/index.jsx` is a mutable registry), and `Card.config.jsx` builds its column-type
  options from `Object.keys(columnTypes)`. There is **no** equivalent for format functions.

## What was implemented (2026-10-20)

All five changes are in the working tree (submodule `src/dms`) — not yet committed or deployed.

- **Registry** — `dataWrapper/utils/utils.jsx`: added `formatFunctionLabels`,
  `registerFormatFunction(name, fn, { label, preserveSpaces })`, `getFormatFunction(name)`,
  `getFormatFunctionOptions({ exclude })`. `formatFunctions` stays the (now mutable) value map.
- **Theme hook** — `patterns/page/siteConfig.jsx`: registers `theme.formatFunctions` (entry is a `fn`,
  or `{ fn, label, preserveSpaces }`), mirroring the `theme.columnTypes` line.
- **Format control** — `ComponentRegistry/Card.config.jsx` builds its options from
  `getFormatFunctionOptions()`; `spreadsheet/config.jsx` does the same with
  `exclude: ['icon','color','combine']` (its table cell has no row/Icon context for those).
- **Option labels** — `ConditionValueInput.jsx`: `parseDataOptions(data, reqName, formatFn)` runs each
  option label through the column's `formatFn`; `useColumnOptions` resolves it via `getColumnRef`.
  React-element results (`icon`/`color`) and throws fall back to the raw label; the option **value** is
  untouched.
- **Spaces** — `Card.jsx`: the generic branch's `.replaceAll(' ', '')` is skipped only when the
  formatter set `fn.preserveSpaces`; all built-ins keep the strip (BC). `TableCell.jsx` never stripped,
  so it is unchanged.

**Evidence:** all six files parse (`@babel/parser`); the registry was exercised at runtime
(`scratchpad/wcdb/registry-test.mjs`, esbuild-bundled `utils.jsx`) — 12/12 assertions: built-ins
intact, `getFormatFunctionOptions()` order/labels, a custom `airingLabel` with `preserveSpaces`,
append + idempotent re-register, `exclude` filter, non-function ignored. `ConditionValueInput.jsx`
bundles clean. `npm run build` is blocked by a **pre-existing** missing `use-immer` (declared in
`package.json`, absent from `node_modules`) in `src/patterns/qa/admin/configureTab.jsx` — unrelated.

## Proposed Changes (reference)

### 1 — Make `formatFunctions` a registry (`dataWrapper/utils/utils.jsx`)

Keep the built-ins exactly as they are; add a small public API beside them:

```js
// mutable registry seeded with the built-ins above
export function registerFormatFunction(name, fn, { label } = {}) { … }   // idempotent replace
export function getFormatFunction(name) { return formatFunctions[name] } // already the shape Card.jsx uses
export function getFormatFunctionOptions() {
  return Object.entries(formatFunctions).map(([value, f]) => ({ value, label: f.__label || value }))
}
```

`__label` (or a parallel label map) carries the display name for the dropdown; built-ins get their
current dropdown labels. Registration is additive and idempotent.

### 2 — Theme hook (`patterns/page/siteConfig.jsx`)

Mirror the `columnTypes` line:

```js
Object.entries(theme.formatFunctions || {}).forEach(([name, def]) =>
  registerFormatFunction(name, typeof def === 'function' ? def : def.fn, { label: def.label }))
```

Document `theme.formatFunctions` in `src/themes/CLAUDE.md` / `src/dms/skills/card-layout.md`.

### 3 — Format control from the registry (`Card.config.jsx`, `spreadsheet/config.jsx`)

Replace the hardcoded `options` array with `getFormatFunctionOptions()` prefixed by
`{ label: 'No Format Applied', value: ' ' }`. This is the "section-menu way to apply a format function
to a column": the control already renders per column in `ColumnManager`; it just becomes registry-driven.

### 4 — Apply `formatFn` to option labels (`ConditionValueInput.jsx`)

In `useColumnOptions`, resolve the column (it already has `getColumnRef`); when it carries a
`formatFn`, run each option's `label` through `getFormatFunction(formatFn)` and keep `value` raw.
Apply it in `parseDataOptions` (pass the resolved column) or immediately after, for both the
`withCounts` and plain `getData` branches. **Guard React elements:** if the formatter returns a
non-string (`icon`, `color`), keep the raw label so a render element is never stringified in a
`<select>`.

### 5 — Stop stripping spaces for label formatters (`Card.jsx`, `TableCell.jsx`)

The trailing `.replaceAll(' ', '')` is a numeric-formatter cleanup. Make it conditional so a
string-returning formatter keeps its spaces — e.g. skip it when the result is a string, or add a
`preserveSpaces` flag to the registration. Built-ins must render byte-identically (BC).

## Files Requiring Changes

| File | Change |
|---|---|
| `patterns/page/components/sections/components/dataWrapper/utils/utils.jsx` | registry API |
| `patterns/page/siteConfig.jsx` | register `theme.formatFunctions` |
| `patterns/page/components/sections/components/ComponentRegistry/Card.config.jsx` | Format options from the registry |
| `patterns/page/components/sections/components/ComponentRegistry/spreadsheet/config.jsx` | same (dedupe) |
| `patterns/page/components/sections/ConditionValueInput.jsx` | apply `formatFn` to option labels |
| `ui/components/Card.jsx`, `ui/components/table/components/TableCell.jsx` | spaces handling |
| `src/dms/skills/card-layout.md`, `src/themes/CLAUDE.md` | document `theme.formatFunctions` |

## Consumer (WCDB — outside this task)

Register `airingLabel` in the WCDB theme (`theme.formatFunctions`): parse `680:2026-09-14` →
`Mon, Sep 14, 2026`, using a **pinned** locale + `America/New_York` (not the machine locale), so the
label is stable across render hosts. Set `formatFn: 'airingLabel'` on the `airing_key` column in the
`card:show-playlists` picker cell. The rows Card keeps filtering on the raw `airing_key`.

## Testing Checklist

**Programmatic (done 2026-10-20 — `scratchpad/wcdb/registry-test.mjs`):**

- [x] Built-in formats unchanged: `comma` / `date` / `combine` / `icon` behave as before.
- [x] A registered function appears in `getFormatFunctionOptions()` (append, not replace) and
      `getFormatFunction` returns it; `preserveSpaces` is honored; re-register is idempotent.
- [x] `getFormatFunctionOptions({ exclude })` drops the named formatters.

**Live (pending a frontend rebuild):**

- [ ] A `theme.formatFunctions` entry appears in the **Format** dropdown in the section menu's column
      editor, per column.
- [ ] A `filter_control` on a column with `formatFn: 'airingLabel'` shows **formatted option labels**;
      the value written to the page variable (and the URL token) stays the **raw** `airing_key`.
- [ ] A formatter registered with `preserveSpaces` renders its spaces intact in a Card cell.
- [ ] `icon` / `color` option labels are unaffected (React elements not stringified).
- [ ] WCDB live: `/show?show_id=183`'s picker lists `Mon, May 4, 2026` … newest first; picking one
      filters the rows and sets `?airing=`.

## Closed 2026-10-20

Marked `done` at the owner's instruction. Note the **Live** checklist above is not green yet: the
submodule changes are uncommitted and need a frontend rebuild/deploy, and live verification is
carried with the WCDB consumer step (`project-planning/wcdb/tasks/current/build-wcdb-show-page.md`
Phase 3).

## Design notes

- This is option **D** from `build-wcdb-show-page.md` (the library route), chosen by the owner
  2026-10-20 over storing a denormalized `airing_label` column.
- **Backwards compatibility is a hard requirement.** The registry is additive; the Format list gains
  entries and loses none; the spaces change affects only formatters that already returned spaces
  (none of the built-ins do except `combine`, which was already exempt).
- The graph stack has a separate format registry (`graph_new/utils.js` `ValueFormats`). This task is
  scoped to the **Card/Table** `formatFunctions`; reconciling the two is out of scope and would be
  its own task.
