# `custom_buckets` branch — change summary

**Scope:** 36 commits, ~1,600 lines across 25 files, all in `src/dms`. Diffed against `master` (merge-base `656ba47b`).

## What the feature does

Lets an **author** (no code) define a *custom bucket* on a dataWrapper section: a named dimension that maps a source column's values into author-defined groups (e.g. roadway TMCs → "Interstate" / "Non-Interstate"). A bucket can be used as a **GROUP BY dimension** and as a **row filter**, can be **bound to page filters** (dynamic) or set **statically**, and ships behind a **master on/off switch** (default OFF). This is squarely in the "enrich the primitives, not a custom component" spirit from CLAUDE.md.

## Architecture at a glance

The whole thing is **frontend-driven with one server primitive**: the client compiles the author's UI config into a resolved `{ [alias]: { column, fallback, groups } }` shape and ships it to the server as `options.aliasGroups`; the server compiles each definition into a `CASE WHEN <column> IN (...) THEN '<label>' … ELSE '<fallback>' END` and substitutes it into SELECT + GROUP BY.

## Server changes (`packages/dms-server`)

| File | Change |
|------|--------|
| `routes/uda/utils.js` | **`buildAliasGroupCase(definition)`** — the core primitive (PG/SQLite). Sanitizes only the column identifier; quote-escapes labels/values/fallback; text-quotes numeric values when the column is a DMS `data->>` JSON accessor. |
| `routes/uda/query_sets/postgres.js` | Wires `aliasGroups` into `simpleFilter` / `simpleFilterLength` — builds active CASE, substitutes into SELECT (`as "<alias>"`, **double-quoted** to survive PG lowercasing) and GROUP BY. |
| `routes/uda/query_sets/clickhouse.js` + `helpers.js` | `buildAliasGroupCaseCH` + same wiring; widened `array_agg(distinct …)` regex. (CH is DAMA-only.) |
| `tests/test-uda.js` (+159) | Server query-layer tests incl. PG alias case round-trip and DMS numeric quoting. |

## Client changes (`packages/dms` — dataWrapper)

| File | Change |
|------|--------|
| `dataWrapper/buildUdaConfig.js` (+250, the heart) | `aliasGroups` passthrough (accessor-resolved per source type); **`buildCustomBucketFilters`** (the "filter to buckets" leaf builder). |
| `dataWrapper/usePageFilterSync.js` | **`resolveAliasGroups`** — single path compiling UI config → resolved shape for both static + dynamic buckets. |
| `dataWrapper/useDataWrapperAPI.js` (new, +55) | `reconcileCustomBucketColumn` — owns the synthetic `origin:'custom-bucket'` column lifecycle. |
| `dataWrapper/useDataSource.js` | Resets source-bound bucket fields on source swap; preserves the dimension column. |
| `sections/sectionMenu.jsx` (+211) | Custom Buckets JSON menu, master toggle, filter toggle, commit-on-blur draft inputs. |
| spreadsheet / table / pages wiring | Smaller supporting edits. |

## Tests

`packages/dms/tests/buildUdaConfig.test.js` (new, +366). Task file reports unit suites green (137 client / 61 server on SQLite).

## Unrelated changes also on this branch

These rode along on the branch but are **independent of custom buckets** — call them out separately in review.

### 1. New "Click: Publish Row" row interaction (spreadsheet)

A new component-interaction provider lets an author make a table row **publish a cell value to a page action param on click** — the click-driven counterpart to the existing `hover_highlight` provider.

- **`ComponentRegistry/spreadsheet/config.jsx`** — registers a new provider `click_publish` (`trigger: 'click'`, label "Click: Publish Row"). Args: a `column-select` for the column to publish, plus an **`append_params`** select ("Append" vs "Replace") controlling whether the click adds to the existing action-param values or replaces them.
- **`ComponentRegistry/spreadsheet/index.jsx`** — finds the enabled `click_publish` provider and adds an `onRowMouseClick` handler wired to the table:
  - Reads the configured column's cell value; no-ops if null.
  - **Replace mode** (default): `setActionParam(paramKey, [cellValue])`.
  - **Append mode**: reads the current `action`-type filter for that `paramKey` from `pageState`, appends the new value, and republishes the union.
  - Passed to `<Table onRowMouseClick={...} />` only when the provider is enabled.

### 2. Advanced dataset menu items nested under "Dataset" (`sectionMenu.jsx`)

Purely an **information-architecture / menu-organization change** (commit `87250f28`) — no behavior change to the features themselves. `join`, `customBuckets`, and `pivot` were previously three separate top-level entries in the section menu; they're now nested as sub-items under the existing **Dataset** menu so they stop crowding the top level.

- The three are collected into `datasetSubMenus = [join, customBuckets, pivot]`, **pre-filtered by their own `cdn()`** (visibility predicate) and appended to `dataset.items` after a separator.
- They were removed from the top-level menu array.

## Known gaps (per task file)

- **DMS-on-DMS joins** with a bucket dimension are **deferred** — the CASE column would need `ds.data->>'col'` prefixing to avoid PG's "ambiguous column reference."

The completed task doc at `planning/tasks/completed/custom-buckets.md` is detailed and worth pointing reviewers to — it documents the mechanism, every bug found, and the testing checklist.
