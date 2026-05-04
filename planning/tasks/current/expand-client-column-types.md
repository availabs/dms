# Expand client column-types into a user-facing interaction system

## Objective

Turn `src/dms/packages/dms/src/ui/columnTypes/index.jsx` from a thin
`{ EditComp, ViewComp }` render registry into a **client-side
interaction registry** that drives sort, filter, format, edit, and view
behavior across every section that renders dataset columns
(Card, Spreadsheet, Graph, Table, Form). Wire it through dataWrapper
and the UDA server so the SQL knows when to cast.

This is the Option B path from
[research/unified-column-types.md](../../research/unified-column-types.md).

### The user model (one sentence)

**Server metadata says "this column is `TIMESTAMPTZ`"; the client column
type says "users interact with it as a `datetime`"; sections render it
with sort/filter/format options appropriate to `datetime`.** The two
type spaces are related but not the same.

### Three principles

1. **Server metadata stays Postgres-shaped.** `data_manager.sources.metadata.columns[].type` continues to carry `TEXT`, `TIMESTAMPTZ`, `INTEGER`, `JSONB`. Don't water it down — the server needs the precision for storage, casts, and analyzers. (DMS form-attribute `dataType` is unchanged too.)

2. **Client column type is user-facing and interaction-oriented.** Vocabulary like `text`, `datetime`, `number`, `select`, `multiselect`, `boolean`, `link`, `image`, `dms-format`, `lexical`. It's the answer to "how does the user interact with this column" — not "how is it stored." Vocabulary is short and stable.

3. **Per-column client type is overridable per-section-instance.** The same column from the same dataset may have type `datetime` in one Card and `text` in another Spreadsheet, depending on how the user wants to interact with it. The dataset's source metadata carries a **default** client type (so freshly-bound sections start sensible), but each section can override.

## Root cause analysis

### What works today

- `columnTypes/index.jsx:22-57` already enumerates a usable client vocabulary (`text`, `date`, `timestamp`, `select`, `multiselect`, `boolean`, `dms-format`, `lexical`, …). The shape is one entry per type with `{ EditComp, ViewComp }`.
- DAMA `metadata.columns` is authoritative for Postgres types and is read into `state.externalSource.columns` by `useDataSource.js:142-191`.
- The dataWrapper produces a flat `options.orderBy` / filter object that the UDA controller turns into SQL — there's a single seam where type-aware behavior can land.

### What's missing

1. **No `sortKind` / `filterOps` / `format` per type.** Card/Spreadsheet/Graph all hardcode `[A→Z, Z→A]` (`Card.config.jsx:208-212`, `spreadsheet/config.jsx:137-141`, `graph/config.jsx:104-106`). A `datetime` column should label them "Oldest first / Newest first" *and* the SQL should cast.
2. **`column.type` is overloaded.** Same field holds a Postgres type after metadata merge (`'TIMESTAMPTZ'`), a client render type at edit time (`'select'`), and a control kind in some configs. `buildUdaConfig.js:178` checks `'multiselect'` (control kind) on the same field that holds `'TIMESTAMPTZ'` (data type) — silent failure.
3. **No DB-type → client-type mapping.** `metadata.columns` has Postgres types; the client doesn't know how to default a `'TIMESTAMPTZ'` column to `'datetime'`.
4. **No source-level default for client type.** Plugins write `metadata.columns[].type = 'TIMESTAMPTZ'` but cannot say "and the default client interaction type is `datetime`". So even after the mapping function exists, plugins can't override the default for a custom column (e.g. `acrid` should default to `'link'`, not `'text'`).
5. **dataWrapper doesn't pass type to the server.** `orderBy` is `{ received_at: 'asc nulls last' }` — no type tag. Server has to either re-derive or be told.
6. **UDA cast logic is DMS-only.** `routes/uda/utils.js:473-486` casts `dmsAttributes.dataType` but DAMA columns reach this with `dmsAttributes=undefined`. Cast branch is dead code on DAMA path.

## Proposed design

### A. The client column-type registry

Each entry in `columnTypes/` becomes a **column-type adapter**:

```
{
  // identity
  name: 'datetime',
  label: 'Date/time',

  // server-side hint — what to cast to in SQL
  sqlCast: 'timestamptz',       // optional; null = no cast
  filterOps: ['=', '!=', '>=', '<=', 'between', 'is null', 'is not null'],
  sortLabels: { asc: 'Oldest first', desc: 'Newest first' },

  // client-side rendering / interaction
  EditComp,
  ViewComp,
  formatOptions: [               // for the per-column "Format" control
    { label: 'Default', value: '' },
    { label: 'Date only', value: 'date' },
    { label: 'Relative', value: 'relative' },
  ],
  defaultFormatFn: (val) => …,  // used when `format=''`
  formatFnByName: {              // used when `format='date'` etc.
    date: (val) => …,
    relative: (val) => …,
  },

  // validation (forms / inline edit)
  validate: (val) => null | errorString,

  // matchers — used to derive defaults
  pgTypes: ['TIMESTAMPTZ', 'TIMESTAMP', 'DATE'],
}
```

Adapters live in code (one file per type), are registered in `columnTypes/index.jsx`, and exported as a single map. Plugins can register additional adapters via the existing `registerComponents` flow (extension point — out of scope for first pass).

### B. Vocabulary split: `column.type` vs `column.inputType`

Rename ambiguous usages so the data axis is clean:

- `column.type` → **client column type** (`'datetime'`, `'select'`, `'link'`)
- `column.inputType` → **input control kind**, where it differs from type (`'multiselect'` was a control kind that masquerades as a type; same for `'radio'`, `'checkbox'`, `'switch'`)

In practice many adapters won't need `inputType` because the type *is* the control (e.g. `'datetime'` always uses the datetime input). Only the multi-vs-single, list-vs-grid choices need a separate field.

This is the **prerequisite refactor** before the registry expansion — without it any shared vocabulary has ambiguous keys.

### C. Source-default client type in DAMA metadata

Extend `metadata.columns[]` with **one optional field**:

```
{
  name: 'received_at',
  display_name: 'Received At',
  type: 'TIMESTAMPTZ',          // unchanged — Postgres type
  desc: null,
  clientType: 'datetime'        // NEW — optional default; falls back to pgTypeToClientType(type)
}
```

The fallback: a small static map (`TIMESTAMPTZ → datetime`, `INTEGER → number`, `JSONB → json`, `TEXT → text`, …). Most plugins won't set `clientType`; the auto-mapping handles them. `acrid → link` and similar custom defaults are where a plugin spends the keystrokes.

This lets existing `metadata.columns` data work unchanged — no migration needed.

### D. Per-section override

`state.columns[i]` already carries display config. Adding `type` to it (the client type) is what makes a per-section override. Lookup precedence at section render:

```
sectionState.columns[i].type
  ?? source.metadata.columns[colName].clientType
  ?? pgTypeToClientType(source.metadata.columns[colName].type)
  ?? 'text'
```

The Card/Spreadsheet/Graph "Type" control (new) lets the user pick the client type for that column **in that section**. Source-default sticks until they change it; overriding doesn't mutate the source.

### E. dataWrapper threads type to the server

`buildUdaConfig.js` currently emits `orderBy: { received_at: 'asc nulls last' }`. Extend to a richer shape **without breaking the existing one**:

```
orderBy: { received_at: { dir: 'desc', cast: 'timestamptz' } }
```

Server accepts both shapes (string for back-compat; object for new). `cast` is sourced from the resolved column-type adapter's `sqlCast`. Same treatment for filters: `{ column, op, value, cast }`.

This is the **wire-protocol change** that makes the server type-aware without it having to re-derive from `metadata.columns` on every query (though that fallback is still useful — see G).

### F. UDA server uses the cast

`routes/uda/utils.js:handleOrderBy` already has the cast branch — extend it to read from the per-orderBy entry's `cast` field, not just from `dmsAttributes`. Same for `handleFilters` `gt/gte/lt/lte`.

Backward-compat: when `cast` is absent, fall back to current behavior (no cast for DAMA, `dmsAttributes`-driven for DMS).

### G. UDA fallback: derive cast from `metadata.columns`

If the wire didn't carry a cast and the column is from a DAMA source with `metadata.columns`, the server can look up the Postgres type and derive a cast. This is the **Option A** path from the research doc — it lands as the safety net for clients that haven't been updated.

### H. Section UI: per-column "Type" control

Add a "Type" control to the per-column `inHeader` controls in Card, Spreadsheet, Graph. Options come from the column-types registry. Default value comes from the precedence rule in D.

When type changes, the section's Sort/Filter/Format options re-render against the new adapter. (This is automatic if those controls are derived from the adapter rather than hardcoded.)

## Phased plan

### Phase 0 — Verification (no code)

- [ ] Reproduce the timestamp-sort bug with `DMS_LOG_REQUESTS=1` and capture the actual SQL. Confirm whether the column ref is `received_at` (raw column) or `data->>'received_at'` (lexicographic). This decides whether we have one bug or two — see research note Section 2.

### Phase 1 — Vocabulary split (prerequisite refactor, ~1 PR)

- [ ] Audit usages of `column.type` across `dms/src/`. Categorize each as **data-type usage** vs **control-kind usage**.
- [ ] Rename control-kind usages to `column.inputType` (`'multiselect'`, `'radio'`, `'checkbox'`, `'switch'` are the candidates).
- [ ] Update `buildUdaConfig.js:178` and any other branch that reads `column.type === <control-kind>`.
- [ ] Migration for existing saved sections: read-side compatibility — accept either `column.type` or `column.inputType` for control kinds for one release; deprecation warning on the old one.

**Acceptance:** after this phase, `column.type` exclusively means "client data type (interaction type)". No section breakage. No behavior change.

### Phase 2 — Adapter shape (additive, ~1 PR)

- [ ] Define the adapter schema (TypeScript interface or JSDoc).
- [ ] Convert existing entries (`text`, `date`, `timestamp`, `number`, `boolean`, `select`, `multiselect`, …) to the new shape, filling in `pgTypes`, `sqlCast`, `filterOps`, `sortLabels`, `formatOptions`. Keep the existing keys.
- [ ] Add `pgTypeToClientType(pgType)` helper exported from `columnTypes/`.
- [ ] **No section consumes the new fields yet.** This phase only enriches the registry.

**Acceptance:** registry exports the new shape; existing sections still render via `EditComp`/`ViewComp` only.

### Phase 3 — DAMA `metadata.columns.clientType` (additive, ~1 PR)

- [ ] Add `clientType?: string` to `metadata.columns` shape (CLAUDE.md update).
- [ ] Update CSV/GIS/now_playing writers to **optionally** set `clientType` for columns where the auto-derivation isn't right.
- [ ] Server-side: `useDataSource.js` returns the resolved client type (using the precedence rule) alongside the Postgres type.

**Acceptance:** sections receive an extra resolved field per column; nothing consumes it yet.

### Phase 4 — Section configs branch on column type (~2 PRs)

- [ ] Card / Spreadsheet / Graph Sort control: replace static `[A→Z, Z→A]` with `adapter.sortLabels`.
- [ ] Card / Spreadsheet Format control: replace static format list with `adapter.formatOptions`.
- [ ] Filter UI: filter operators come from `adapter.filterOps`.
- [ ] Add per-column "Type" control to inHeader → user can override the default client type for this section instance.

**Acceptance:** `received_at` column in a Card shows "Newest first" / "Oldest first" labels; switching the column's type to "text" reverts to A→Z. Similarly, format options for `received_at` include "Date only" / "Relative".

### Phase 5 — dataWrapper threads cast (~1 PR)

- [ ] `buildUdaConfig` emits richer orderBy/filter entries with `cast` field sourced from the adapter.
- [ ] Server accepts both shapes (string for back-compat, object for new).

**Acceptance:** wire protocol updated; both shapes work; server logs show `cast` flowing through for type-aware columns.

### Phase 6 — UDA cast (~1 PR)

- [ ] `handleOrderBy` reads `cast` from the orderBy entry; falls back to `dmsAttributes.dataType` (DMS), then `metadata.columns.type → pgTypeToClientType → adapter.sqlCast` (DAMA), then no cast.
- [ ] Same precedence for `handleFilters` gt/gte/lt/lte and any other op that needs casting.
- [ ] Regression tests per Postgres type (one per major bucket).

**Acceptance:** original timestamp-sort bug fixed end-to-end. SQL is `ORDER BY (received_at)::timestamptz DESC NULLS LAST`. Same query against a CSV-derived `TEXT` column still does lexicographic sort (correctly — that column truly is text until the analyzer is upgraded).

### Phase 7 — CSV analyzer date/boolean detection (~1 PR, optional)

- [ ] Extend `dama/upload/analyzeSchema.js` to attempt date and boolean inference per its existing TODO.
- [ ] When inferred, write `metadata.columns[].type = 'TIMESTAMPTZ' | 'BOOLEAN'` and let the auto-derivation pick the client type.

**Acceptance:** newly uploaded CSVs with date columns sort chronologically without manual override.

### Phase 8 — Documentation

- [ ] Update `dama/CLAUDE.md` with `clientType` in the `metadata.columns` contract.
- [ ] Update `data-types/CLAUDE.md` with the same.
- [ ] Update `dms/CLAUDE.md` (or a new `columnTypes` doc) with the adapter shape and the precedence rule.

## Files requiring changes

### Phase 1 (vocabulary split)
- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js` (line 178 and others)
- Component registry configs that branch on control-kind values: `Card.config.jsx`, `spreadsheet/config.jsx`, `graph/config.jsx`
- `src/dms/packages/dms/src/ui/columnTypes/` if any entries conflate the two

### Phase 2-3 (adapter + clientType)
- `src/dms/packages/dms/src/ui/columnTypes/index.jsx` and per-type files
- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/useDataSource.js` (resolve client type at merge)
- `src/dms/packages/dms-server/src/dama/CLAUDE.md` (contract update)
- `data-types/CLAUDE.md` (contract update)

### Phase 4 (section configs)
- `Card.config.jsx`, `spreadsheet/config.jsx`, `graph/config.jsx` (Sort/Format/Filter controls)
- The shared `inHeader` controls list

### Phase 5-6 (wire + cast)
- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js`
- `src/dms/packages/dms-server/src/routes/uda/utils.js` (`handleOrderBy:473`, `handleFilters:305`)
- `src/dms/packages/dms-server/src/routes/uda/query_sets/postgres.js`
- New regression tests in `dms-server/tests/`

### Phase 7 (analyzer)
- `src/dms/packages/dms-server/src/dama/upload/analyzeSchema.js`

## Open decisions

1. **Wire protocol shape.** Object-for-new vs separate `castMap` field. Object is simpler; `castMap` keeps the serialized state smaller for big orderBy lists. Lean: object, since orderBy is rarely big.

2. **Per-section override storage.** Embed in `state.columns[i].type` (proposed) vs separate `state.columns[i].clientTypeOverride`. The former is cleaner; the latter makes "did the user override?" queryable. Lean: embed, plus a derived `wasOverridden` for UI hints.

3. **Adapter extensibility.** Should plugins register custom adapters (`registerColumnType('acrid', { … })`)? Useful for now_playing, but a much bigger surface to maintain. Lean: defer to v2; first pass keeps the registry built-in only.

4. **CSV analyzer scope creep.** Phase 7 is independently valuable but not strictly part of this task. It could ship as a separate todo. Lean: keep it here so the full timestamp-sort story (CSV uploads included) lands together.

5. **Form pattern's `dataType` field.** Forms use `data.config.attributes[].dataType`. Should that vocabulary collapse into the same client-type registry, or stay separate? They overlap. Lean: separate task — the forms pattern has its own validation/binding model and merging the two is a bigger refactor than what's needed to fix Card/Spreadsheet/Graph.

## Testing checklist

### Phase 1
- [ ] Multiselect filter still works against existing saved Card/Spreadsheet sections.
- [ ] No saved-section breakage on bug bash.

### Phase 4
- [ ] Card with `received_at` column shows "Newest first / Oldest first" sort labels.
- [ ] Switching Type to "text" in the section shows "A→Z / Z→A".
- [ ] Default sourced from `metadata.columns.clientType` when set, else from `pgTypeToClientType(type)`.

### Phase 6 (the original bug)
- [ ] WCDB now_playing Card on home page sorts `received_at DESC` chronologically.
- [ ] Filter `received_at >= '2026-04-01'` returns the right window (cast applied).
- [ ] CSV-derived `TEXT` column with date-shaped values still sorts lexicographically (expected — analyzer hasn't run yet).

### Phase 7
- [ ] Re-uploading a CSV with a date column produces `metadata.columns[].type = 'TIMESTAMPTZ'`.
- [ ] Newly bound Card on that source sorts chronologically without manual override.

## References

- Research note: [research/unified-column-types.md](../../research/unified-column-types.md)
- Triggering bug: now_playing Card on `wcdb_main` Home page sorts `received_at` lexicographically (April 30, 2026 / May 1, 2026 session)
- Existing user feedback: "I don't like code which makes the API work for weird edge cases" — applies here, prefer making the type system explicit over silent fallbacks
- Existing user preference: prefer existing components over new ones — this task **expands** the existing `columnTypes/` registry, doesn't introduce a parallel one
