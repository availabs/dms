# Datasets pattern — lifecycle-aware default listing + sandbox-by-default with a promotion step

> Split out of the MitigateNY DaMa audit
> ([`planning/mitigateny/tasks/current/hazmit-dama-source-audit.md`](../../../../../planning/mitigateny/tasks/current/hazmit-dama-source-audit.md)),
> Phase 6 recommendations 2 and 3. Sibling of
> [`datasets-exclude-file-upload-sources.md`](./datasets-exclude-file-upload-sources.md), which
> established the server-side-exclusion shape these two reuse.

**STATUS (2026-09-17): BUILT + TESTED. Uncommitted, not deployed.**
Server suite green (**114 UDA tests, +17 new**, repeatable across consecutive runs with zero row
leakage); production build clean. **No env changes behaviour on deploy** — both new settings keys
default to "off", so an env that has not opted in is byte-identical to today.
Implementation plan written from a read of the live code, not from the recommendation text.
Design: [`datasets-settings.html`](../../../../src/themes/transportny/TransportNY%20Design%20System/dms_design_system_v2/pages/datasets-settings.html)
(authored in `dms-template/`; the transportNY copy follows via the theme sync).

## Settled with the owner (2026-09-17)

1. **`hidden_categories` is PER PATTERN, with library defaults.** Stored as a **delta**, not an
   absolute list — see A1.
2. **Part A approved as written**, with the per-pattern change above.
3. **The settings UI is redesigned as part of this task**, not left as-is. Design page authored.
4. **Promotion is self-service with a gate** — no approval queue. The win being bought is "uploads
   stop dumping into the list by default"; an approval workflow can be added later if the county
   rollout needs it.

## Why these two are one task

They are separable features but they touch the same three files and share one settings schema. Doing
them separately means editing `DatasetsList/index.jsx`, `SettingsPage.jsx` and `uda.controller.js`
twice, and the second pass would have to re-open the first's decisions. **Part A** defines what
"hidden" means; **Part B** makes `Sandbox` — one of the hidden names — the default for new sources,
which is only coherent once A exists.

## The measured problem

From the `hazmit_dama` audit (2,630 GB env, 367 data sources, 5 consuming apps):

- **67 of 81 category top-levels are in `filtered_categories`.** Only 14 are visible, and the two
  largest visible buckets (`BILD` 83 sources, `Fusion` 25) are ETL pipelines no plan author should be
  browsing. The catalog is curated by subtraction and the subtraction has eaten it.
- **54 of 367 sources are dev/test leftovers** that reached the catalog because nothing stood between
  "upload succeeded" and "everyone sees it".
- **137 sources (37%) have NULL `categories`** and 45% have no description.

## Root cause in the code — the hide rule is `every`, not `some`

`packages/dms/src/patterns/datasets/pages/DatasetsList/index.jsx` → `visibleSources` (~line 205):

```js
const cats = (Array.isArray(source?.categories) ? source.categories : []).map(c => c[0]);
if (!cats.length) return false;                              // uncategorized → hidden
if (!filteredCategories.length) return true;
return !cats.every(c => filteredCategories.includes(c));     // ← the bug-by-design
```

**A source is hidden only when EVERY one of its top-levels is on the deny list.** That is why the list
grew to 67 entries: to hide one source an admin has to deny *all* of its categories, which drags in
every neighbouring subject name, which hides more sources, which needs more names. It is a ratchet.

It also makes the proposed vocabulary impossible as-is. Under it a source carries both a subject path
and a lifecycle path — e.g. `[["Built Environment","BILD"], ["Data Processing","Buildings (BILD)"]]`.
With `every`, hiding it would require `Built Environment` on the deny list too, which would hide the
whole area. **The semantics have to invert before the vocabulary can land.**

Two more facts from the same read:

- The filter is **client-side**, after the fetch. `filtered_categories` records the admin's intent but
  saves no work — the same finding that drove the `file_upload` task.
- `SettingsPage.jsx` (~line 124) maintains the hidden list as a union with `filtered_categories` so a
  name stays un-hideable even when no loaded source carries it. That behaviour must survive.

## Part A — Lifecycle-aware default listing

### A1. Per-pattern hidden categories, stored as a delta

**Scope split — this is the load-bearing decision:**

| setting | scope | why |
|---|---|---|
| `hidden_categories` | **per pattern** (`pattern.hidden_categories`) | one env feeds five apps. A curated MNY catalog at `/cenrep` and a developer's view of `hazmit_dama` want different hide sets; with 63 counties coming, "which lifecycles does this catalog show" is a per-catalog question. |
| `hidden_source_types` (existing) | per env | uploads are noise everywhere; nobody wants them per-pattern. |
| `default_new_source_categories` (Part B) | **per env** | a source is created in an env *before* it belongs to any pattern. There is no pattern to read at `createDamaSource` time. |

**Store a delta, not an absolute list.** The pattern records only what it *changes*:

```js
// pattern.hidden_categories
{ hide: ["Internal QA"], show: ["Archive"] }     // ⊕ against the library default
```

Resolution: `LIFECYCLE_DEFAULTS ∪ delta.hide \ delta.show`.

The reason is drift, which is the disease this whole task is curing. If a pattern stored an absolute
`["Sandbox","Archive","Data Processing","Uploaded File"]` at creation, then adding a fifth lifecycle
name later would reach **no existing pattern** — every catalog created before the change silently
starts showing the new bucket. With a delta, a new default propagates everywhere and only deliberate
departures stay pinned. It also makes the settings UI honest: every row can say `default` or
`overridden` with a one-click reset, which is what the design does.

```js
// library default — the closed set, defined once
const LIFECYCLE_DEFAULTS = ['Sandbox', 'Archive', 'Data Processing', 'Uploaded File'];
```

**`Sandbox` is a required member of the resolved set.** A pattern may put it in `delta.show`, but the
UI marks it `required` and warns, because Part B makes it the landing place for every new dataset:
un-hiding it means every upload is public the moment it finishes. This is the one coupling between
the two parts and it must not be silently breakable.

**Legacy key stays working.** `filtered_categories` (per env) is read unchanged with its `every`
semantics and marked deprecated. A source is hidden if the resolved `hidden_categories` matches
**any** of its top-levels, **or** the legacy list matches **all** of them. Strictly additive: an env
with no pattern delta and no new key behaves exactly as today, so **nothing changes on deploy**.

### A2. Server-side exclusion (the performance half)

Push the predicate into the enumeration, as `hiddenTypeClause` already does for types.
`categories` is `jsonb` array-of-arrays; the top-level of each path is `c->>0`:

```sql
-- alongside the existing type clause
AND NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(categories) AS c
  WHERE c->>0 = ANY($n)
)
```

There is already a working precedent for this walk in `uda.controller.js` `getViewBySrcCategories`
(~line 305) — **and a latent bug next to it worth fixing in passing**: that query hardcodes
`data_manager.sources` in its subquery even when `db.type !== 'postgres'`, so it cannot work on the
SQLite adapter.

**SQLite branch required.** `jsonb_array_elements` does not exist there; the adapter's own precedent is
`json_each(data, '$.sources')` (`uda.tasks.controller.js` ~line 391). Follow
`getSourcesLength`/`getSourceIdsByIndex`'s existing `db.type === 'postgres'` split rather than
inventing a third pattern.

`includeHidden` already threads through `getSourcesLength` / `getSourceIdsByIndex` and the
`sourcesAll` Falcor route — **the "show everything" escape hatch exists and needs no new plumbing.**

**Scope caveat — the server can only apply the ENV floor.** The Falcor route is keyed
`uda[env].sources`, not by pattern, so a per-pattern hide set cannot be pushed into that SQL without a
new pattern-scoped collection. **Don't add one.** The split that falls out is the right one anyway:

- **server-side = the volume lever.** `hidden_source_types` (uploads) is what turns 11,423 rows into
  367. Optionally an env-level `hidden_categories` floor for names no pattern ever wants.
- **client-side = the curation lever.** After the upload fix the enumeration is ~367 rows; filtering
  ~150 of those in the browser costs nothing measurable.

If a per-pattern collection is ever genuinely needed, `uda[env].sourcesFor[patternId]` is the shape —
but it should be driven by a measurement, not by symmetry.

### A3. Client-side rule

Replace the `every` line. Keep `filteredCategories` for the legacy path:

```js
const hiddenTops = resolveHidden(LIFECYCLE_DEFAULTS, parent?.hidden_categories);  // delta ⊕ default
const cats = (Array.isArray(source?.categories) ? source.categories : []).map(c => c[0]);
if (!cats.length) return showUncategorized;                   // unchanged default: false
if (cats.some(c => hiddenTops.has(c))) return false;          // ← new rule
if (!filteredCategories.length) return true;
return !cats.every(c => filteredCategories.includes(c));      // ← legacy, untouched
```

The same `hiddenTops` set has to be applied to the `categories` memo below it, or a hidden top-level
still renders as an empty sidebar entry.

`parent` is the pattern object and is **already** in `DatasetsContext` (`siteConfig.jsx` passes
`parent: pattern`), and `DatasetsList` already destructures it — so the per-pattern read needs no new
plumbing either.

### A4. Settings UI — redesign (owner-requested)

**Design:** `src/themes/transportny/TransportNY Design System/dms_design_system_v2/pages/datasets-settings.html`
(authored in `dms-template/`, registered in that design system's `ds-nav.js`; the transportNY copy
follows via the theme sync — never edit it there).

**What it replaces.** Two flat columns of category buttons — *Categories Hidden* / *Categories Shown*,
click to move — over one env-wide list. At 81 categories with 67 hidden that is a wall of names with
no hierarchy, no indication of *why* anything is hidden, and no preview of the effect. It also
presents a lifecycle decision and a subject decision as the same kind of thing, which is the
conceptual error the whole task exists to fix.

**Four moves:**

1. **Separate the facets.** Lifecycle is four switches over a closed set. Subject areas are a
   browsable tree. They stop sharing a list.
2. **Show the effect, not the mechanism.** A sticky live panel — *"49 / 367 datasets visible at
   `/cenrep`"*, broken down by hidden-lifecycle / hidden-area / uncategorized, updating as switches
   move. The admin is editing a catalog, not maintaining a deny list.
3. **Make inheritance visible.** Every row is labelled `default` or `overridden` with a one-click
   *reset to default* — the delta model from A1 made legible. Without this, per-pattern settings are
   a debugging nightmare ("why does this catalog differ?").
4. **Hierarchy.** Areas render with their subcategories — the two levels the sidebar actually draws —
   instead of a flat list of top-levels.

Plus: scope is stated on every panel (`this pattern` vs `environment-wide`), because the two now
genuinely differ; a standing reassurance that **hiding never deletes** (hidden datasets still load on
their own page and still serve tiles); and the legacy filter gets its own deprecated panel with a
**guided migration** — the proposed target per legacy name, reviewable before applying. For
`hazmit_dama` that mapping is already computed: `scratchpad/hazmit-dama-audit/category_map.md`, all 81
top-levels, asserted complete.

## Part B — Sandbox by default + a promotion step

### B1. Where a source is born

`packages/dms-server/src/dama/upload/metadata.js` → `createDamaSource(values, pgEnv)` is the single
INSERT into `data_manager.sources`. Callers:

| caller | route | categories today |
|---|---|---|
| `dama/upload/file-upload-route.js:110` | `POST /dama-admin/:pgEnv/file_upload` | `JSON.parse(req.body.categories)` — **client-supplied** |
| `dama/upload/gis-routes.js:185` | GIS publish | from `source_values` |
| `dama/upload/gis-routes.js:228` | GIS publish (second path) | from `source_values` |

Because the value comes from the caller it is a convention, not a guarantee — the same weakness the
`file_upload` task called out for `type`. **One server-side default in `createDamaSource` fixes all
three callers at once**, which is the argument for putting it there rather than in each route.

### B2. The default

In `createDamaSource`, after the existing `categoriesJson` line:

```js
// A source with no categories is invisible in the default listing and impossible to
// govern. Give it the sandbox lifecycle so it is *somewhere* — findable under
// "Sandbox", excluded from the curated catalog until a human promotes it.
// Config: settings.default_new_source_categories; an explicit [] opts out.
const hasCats = Array.isArray(categories) && categories.length;
const effectiveCategories = hasCats ? categories : await getDefaultNewSourceCategories(pgEnv);
```

**The default category is `Sandbox`** — and because A1 made hiding per-pattern, that choice now
carries a constraint it would not otherwise have: **`Sandbox` must resolve to hidden in every
pattern**, or B inverts. A pattern that un-hid it would show every fresh upload in its catalog,
labelled "Sandbox" — clutter *plus* a confusing label, strictly worse than today's uncategorized-and-
invisible behaviour. Hence the `required` marking in A1 and the warning in the UI.

`default_new_source_categories` is **per env**, not per pattern: `createDamaSource` runs before the
source belongs to any pattern, so there is no pattern to read. Default `[["Sandbox"]]`; an explicit
`[]` restores today's behaviour (new sources arrive uncategorized and therefore invisible).

**Do not apply it when the row is already a hidden type** (`file_upload`
carries `[["Uploaded File"]]` and is excluded server-side anyway) — adding `Sandbox` there would be
noise on 11,067 rows.

### B3. Promotion

Promotion = remove the `Sandbox` path, add at least one shown subject path. The editing surface
already exists: `SourceCategories` (`DatasetsList/categories.jsx`) is rendered from
`dataTypes/default/overview.jsx` (~line 206) behind an admin pencil and writes through
`updateSourceData` → `updateSource`. So this is **not new write plumbing** — it is a guarded action on
top of an existing editor.

**The gate is the point.** A `Promote` button that refuses until the source has:

1. at least one category whose top-level is **not** in `hidden_categories`,
2. a non-empty `description`,
3. a `display_name`.

That is where the audit's metadata gaps get fixed — at the one moment someone actually wants something
from the system. Retrofitting descriptions onto 204 already-public sources is a chore nobody does;
requiring one to publish costs thirty seconds.

Include a **Return to sandbox** inverse, so promotion is not a one-way door.

### B4. Making the sandbox visible to its owner

A hidden source the uploader cannot find is worse than the current state. Needs:

- A **Sandbox** entry in the datasets sidebar, outside the normal category list, showing the caller's
  own sandbox sources (`user_id`) with everyone's behind an admin toggle.
- A count badge — "7 datasets awaiting promotion" — on the datasets landing page for admins.

## Files

| file | part | change |
|---|---|---|
| `dms-server/src/routes/uda/uda.controller.js` | A2 | `getHiddenCategories()` next to `getHiddenSourceTypes()`; `hiddenCategoryClause()` with a postgres/sqlite split; wire into `getSourcesLength` + `getSourceIdsByIndex` |
| `dms-server/src/routes/uda/uda.controller.js` | A2 | fix `getViewBySrcCategories`'s hardcoded `data_manager.sources` while in there |
| `dms-server/src/dama/upload/metadata.js` | B2 | `createDamaSource` default categories + `getDefaultNewSourceCategories(pgEnv)` |
| `dms/src/patterns/datasets/pages/DatasetsList/index.jsx` | A3, B4 | new hide rule; fetch `hidden_categories`; sandbox sidebar entry |
| `dms/src/patterns/datasets/pages/SettingsPage.jsx` | A4 | **rebuild** against `datasets-settings.html`: lifecycle switches, live-effect panel, area tree, inherited/overridden rows, legacy migration panel |
| `dms/src/patterns/datasets/pages/SettingsPage.theme.js` | A4 | tokens for the new layout (the page is theme-driven; TransportNY and mny must both skin it) |
| `dms/src/patterns/datasets/utils/lifecycle.js` *(new)* | A1 | `LIFECYCLE_DEFAULTS` + `resolveHidden(defaults, delta)`, shared by the list, the settings page and the server |
| `dms/src/patterns/datasets/pages/dataTypes/default/overview.jsx` | B3 | Promote / Return-to-sandbox action + gate |
| `dms-server/tests/test-uda.js` | A, B | see below |

## Tests

Follow `test-uda.js`'s existing `hidden_source_types` block (~line 1050) — same shape, same file.

- default `hidden_categories` hides a `Sandbox` source from `sources`, `sourcesAll` still returns it
- explicit `[]` honours "hide nothing"; malformed value falls back to the default
- **`some` not `every`**: a source carrying `Built Environment` *and* `Data Processing` is hidden
- **legacy coexistence**: an env with only `filtered_categories` set behaves exactly as before
- `sources.byId` is NOT filtered — a hidden source still loads on its own page
- SQLite parity for every one of the above
- `resolveHidden`: delta `{hide,show}` ⊕ defaults; an empty delta resolves to the defaults; a later
  addition to `LIFECYCLE_DEFAULTS` reaches a pattern with a stored delta (the drift guarantee)
- `createDamaSource` with no categories gets `[["Sandbox"]]`; with categories is untouched; a
  `file_upload` row does not get `Sandbox`
- promotion gate rejects a source with no description / no display_name / no shown category

## Rollout

1. **A2+A3 behind the default that matches nothing.** Ship; no env changes behaviour. Verify on
   `hazmit_dama` that the listing is identical.
2. **Set `hidden_categories` on one env** (`hazmit_dama`, after the tagging apply lands the
   vocabulary) and confirm the 67-entry legacy list can be emptied.
3. **B2 last.** It changes what new uploads look like everywhere, so it wants the sandbox UI (B4) in
   place first or uploads start disappearing from people's view with nowhere to find them.

## Open questions

- [x] **Per-pattern, with library defaults stored as a delta** (owner, 2026-09-17). See A1.
- [x] **Self-service with a gate** (owner, 2026-09-17). No approval queue for now.
- [ ] `show_uncategorized` already exists in settings but is not read by `DatasetsList`. Wire it into
      the new rule or remove it — right now it is a setting that does nothing.

---

## What was built (2026-09-17)

### Shared — `patterns/datasets/utils/lifecycle.js` *(new)*
The vocabulary and every rule that acts on it, so the list, the settings page and the source page
cannot disagree. `LIFECYCLE_DEFAULTS`, `resolveHiddenCategories` (delta ⊕ defaults),
`resolveHiddenForPattern` (two-layer), `isPatternOverride`, `toggleHidden`/`resetHidden` (which keep
the stored delta **minimal** — toggling a name back to its default removes the pin rather than
storing a redundant one), `isSourceHidden` (the ANY rule + the untouched legacy EVERY rule),
`promotionBlockers` + `PROMOTION_CHECKS`.

**Design change from the plan — where the per-pattern delta lives.** The plan said
`pattern.hidden_categories`. There is **no safe write path to a pattern row from inside the pattern's
own pages**, and patterns carry routing — a bad write breaks the site. So both layers live in the env
settings blob, which already has a working, tested read/write path:

```js
settings.hidden_categories                       // env-wide delta — also what the SERVER enforces
settings.hidden_categories_by_pattern[patternId]  // this catalog's own delta
```

Same semantics, no new write plumbing, and the env layer turns out to be a genuinely useful middle
tier. Resolution is `LIFECYCLE_DEFAULTS ⊕ env delta ⊕ pattern delta`.

### A2 — server (`uda.controller.js`)
`getHiddenCategories` + `hiddenCategoryClause` (postgres `jsonb_array_elements` / SQLite `json_each`
branches) combined with the existing type clause by `hiddenSourceClause`, wired into
`getSourcesLength` and `getSourceIdsByIndex`. **Default is `[]`, not the lifecycle list** — the env
floor is opt-in; the client applies the defaults. Param ordering is compatible with the SQLite
adapter's positional `= ANY($n)` → `IN (?,…)` rewrite (verified by the suite, which runs on SQLite).

Also fixed in passing: `getViewBySrcCategories` hardcoded `data_manager.sources` **and**
`jsonb_array_elements` on every adapter, so it could only ever work on postgres. Both halves are now
dialect-aware.

### A3/B4 — the list (`DatasetsList/index.jsx`)
The `every` rule is gone. Hidden lifecycle top-levels are also dropped from the sidebar's category
list (otherwise they render as empty rows), and a **Hidden** group at the foot of the sidebar makes
each bucket reachable for an authed user **without needing "Show all"** — a dataset you just uploaded
should not require a mode switch to find.

### B2 — sandbox by default (`dama/upload/metadata.js`)
`createDamaSource` stamps `[["Sandbox"]]` when the caller supplied no categories. Applied there
rather than per-route because it is the single INSERT into `data_manager.sources`, so one change
covers all three upload callers and makes it a guarantee rather than a convention.
`file_upload` rows are exempt (they carry their own marker and are hidden by type).
`settings.default_new_source_categories` overrides; `[]` restores the old behaviour.

### A4 — settings page rebuilt
Against `datasets-settings.html`: a live "**N / M datasets visible in this catalog**" panel, one
switch per lifecycle with its count and a one-line statement of what hiding it costs, `default` /
`overridden` + *reset to default* per row, a warning when `Sandbox` is visible (because new datasets
land there), the new-source defaults + promotion gate, and the old two-column list demoted into a
**Legacy category filter** panel marked deprecated.

### B3 — promotion (`dataTypes/default/overview.jsx`)
Shown only while a source is actually in `Sandbox`. Lists what is still missing and disables the
button until the gate passes; **Return to Sandbox** is the inverse, so promotion is not a one-way
door.

**Bug caught in self-review:** `promote()` first stripped *every* hidden-lifecycle path. A source can
be both `Sandbox` (unreviewed) and `Data Processing` (an ETL intermediate) — promoting it out of the
sandbox must not un-mark it as pipeline. It now removes only the sandbox path.

### Tests — `test-uda.js`, +17 (97 → 114)
Ten for hidden categories, seven for the new-source default. The load-bearing one is
**"the hide rule is ANY of the top-levels, not EVERY"**: a source carrying a shown subject area *and*
a hidden lifecycle must hide — the exact case the old rule could not express, and the reason the
whole change exists. Also locked: only `categories[i][0]` matches (not subcategories), NULL
categories are left to the client, `sources.byId` is never filtered, malformed settings fall back
rather than throw, and types + categories compose in one WHERE.

Both new blocks pre-clean by name prefix **and** clean up in a `finally`. A failed assertion
previously left rows behind that poisoned not just the next run but the tests that run *before* them
— verified fixed by two consecutive full runs with zero leftovers.

## Not done / follow-ups
- [ ] **Legacy-filter migration is UI-only so far** — the panel is there and marked deprecated, but
      the guided per-name mapping action in the design is not wired. For `hazmit_dama` the mapping is
      already computed (`scratchpad/hazmit-dama-audit/category_map.md`, all 81 names).
- [ ] **Subject-area tree** (design section 2) is not built; the legacy two-column list still serves
      that job. Wanted before an env leans on per-pattern area hiding.
- [ ] `show_uncategorized` still exists in settings and is still read by nobody. Wire or remove.
- [ ] Not live-verified against a real env — no deploy. Worth a pass on `hazmit_dama` once the
      tagging apply has landed the vocabulary.

## Progress log
- 2026-09-17 — Built A1–A4 + B2–B4 and the test coverage. Server suite 114 green, build clean.
  Two design changes from the plan, both forced by what the code actually allows: the per-pattern
  delta lives in the env settings blob keyed by pattern id (no safe pattern-write path exists), and
  the server enforces only the env-level floor (the Falcor route is env-keyed). Neither changes the
  semantics the owner approved.

