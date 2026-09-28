# Datasets pattern — stop loading `file_upload` sources in the default source list

**Initiatives:** [mny_dama_hygiene](../../../../../planning/initiatives/mny_dama_hygiene.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** built (was: "STATUS (2026-09-17): BUILT + VERIFIED against live envs; uncommitted, not deployed.") · **Release:** deploy — commit + dms-server deploy; transportNY vendored copy syncs after · **Created by:** amuro@albany.edu · **Edited by:** —

> Split out of the MitigateNY DaMa audit
> ([`planning/mitigateny/tasks/completed/hazmit-dama-source-audit.md`](../../../../../planning/mitigateny/tasks/completed/hazmit-dama-source-audit.md)),
> where the file-upload population was measured: **11,057 of 11,423 `hazmit_dama` sources are
> `file_upload` rows** — 97% of the catalog, and the reason the datasets landing page is slow on that
> env. Owner call (2026-09-17): don't inventory them, fix the loader.

**STATUS (2026-09-17): BUILT + VERIFIED against live envs; uncommitted, not deployed.**
`hazmit_dama`'s datasets list now enumerates **366 sources instead of 11,423** — a 3.08 MB Falcor
response became 196 KB. Server test suite green (97 UDA tests incl. 4 new ones). See Progress log for
the measurements and the one scope change (DAMA-only, not DMS-internal).

## Problem

The datasets landing page loads **every source in the env** before it renders anything:

- `pages/DatasetsList/index.jsx` → `getSources()` does `falcor.get(['uda', env, 'sources', 'length'])`
  then `falcor.get(['uda', env, 'sources', 'byIndex', {from: 0, to: len-1}, srcAttributes])` — one
  request for `len` $refs plus the `byId` attribute fan-out behind them.
- On `hazmit_dama` that is **11,423 sources** (366 real datasets + 11,057 `file_upload` rows), each
  with the list attribute set. It is a multi-megabyte Falcor response on a page that then throws 97%
  of it away.
- The throwing away happens **client-side, after the fetch**: `visibleSources` filters on
  `settings.filtered_categories` (index.jsx ~line 205) — and `Uploaded File` is already in that list on
  `hazmit_dama`. So the admin's intent ("hide these") is already recorded; it just isn't applied where
  it would save any work.
- Every lexical/Card image upload adds another row, so the page gets monotonically slower. Related
  hazard: [[project_dms_falcor_string_limit_crash]] — big source fan-outs are how that env blew the
  512MiB string limit.

Uploads are already tagged at creation — `ui/columnTypes/image.jsx` and the lexical InlineImage path
both POST `type=file_upload` + `categories=[["Uploaded File"]]` to `/dama-admin/:pgEnv/file_upload` —
but the tag is **client-supplied**, so it is a convention, not a guarantee.

## Objective

1. Uploaded-file sources are **excluded server-side** from the default source list (length + byIndex),
   so the landing page never transfers them.
2. They are **reliably marked at creation** by the server, not by the caller.
3. An admin can still **see them on purpose** via an explicit setting/toggle, not by loading everything
   every time.
4. No regression for the surfaces that legitimately need upload sources (SourcePage for a single
   upload, the image-column picker, the file_upload CreatePage's "append to existing source" flow).

## Current state (verified 2026-09-17)

**Write path — two upload routes, both create a source row:**
- `packages/dms-server/src/dama/upload/file-upload-route.js` — `POST /dama-admin/:pgEnv/file_upload`;
  reads `type` (default `'file_upload'`) and `categories` straight from the multipart fields
  (`JSON.parse(categories)`) and hands them to `createSource` in
  `packages/dms-server/src/dama/upload/metadata.js` (`INSERT INTO data_manager.sources (…, categories,
  auth_permissions)`).
- `packages/dms-server/src/dama/upload/file-upload-dms-route.js` — `POST /dms-admin/:app/file_upload`,
  the DMS-backed (no-pgEnv) variant; writes `type: 'file_upload'` data_items rows.
- Callers: `packages/dms/src/ui/columnTypes/image.jsx` (Card image column) and
  `ui/components/lexical/editor/nodes/InlineImageComponent.tsx` (lexical inline image); the
  `patterns/datasets/pages/dataTypes/file_upload/CreatePage.jsx` page posts to the DMS-backed route.

**Read path — the unfiltered list:**
- `packages/dms-server/src/routes/uda/uda.controller.js`
  - `getSourcesLength(env)` → `SELECT COUNT(1)::INTEGER FROM data_manager.sources` (no WHERE).
  - `getSourceIdsByIndex(env, {from,to})` → `SELECT source_id FROM data_manager.sources ORDER BY 1
    LIMIT … OFFSET …` (no WHERE).
- `packages/dms-server/src/routes/uda/uda.route.js` — routes `uda[{keys:envs}].sources.length` and
  `…sources.byIndex[{integers:indices}]` (byIndex returns `$ref` into `sources.byId`).
- `packages/dms/src/patterns/datasets/pages/DatasetsList/index.jsx` — `getSources()` (top of file),
  `visibleSources`/`categories`/`categoriesCount` memos, the `isListAll` ("Show all") toggle, and the
  module cache in `patterns/datasets/utils/datasetsListCache.js`.
- `packages/dms/src/patterns/datasets/pages/SettingsPage.jsx` — writes
  `pgEnv.settings.filtered_categories` (top-level category names) and already knows
  `show_uncategorized`.

**Known consumers that must keep working:** `patterns/admin/pages/patternEditor/pages/sourcesTab.jsx`
(already does `.filter(s => s.name && s.type !== 'file_upload')` client-side — i.e. a second place
paying for the same wasted fetch), `patterns/datasets/pages/SourcePage.jsx` (single source by id —
unaffected), the image-column/lexical upload flows (they post, then use `dl_url` — they don't list).

## Proposed change

### 1. Server stamps the marker (creation) — DONE
In `dama/upload/file-upload-route.js` (and the DMS-backed route), when a **new** source is created for
an upload, the server — not the client — sets both:
- `type = 'file_upload'` (already the default; make it authoritative, ignore a client-supplied override
  for this endpoint), and
- the marker category `[["Uploaded File"]]`, merged in rather than trusted from the field.

Design note: keep `Uploaded File` as the marker rather than inventing a new one — all 11,057 existing
rows already carry it *and* `type='file_upload'`, so no backfill is needed and the exclusion predicate
can be belt-and-braces (`type = 'file_upload' OR categories @> '[["Uploaded File"]]'`).

### 2. Exclude server-side by default (read) — DONE
Add the exclusion to `getSourcesLength` + `getSourceIdsByIndex`, driven by a **new narrow setting** on
the env rather than by `filtered_categories`:
- `settings.hidden_source_types` — default `['file_upload']` when unset.
- Rationale for a new key: `filtered_categories` on `hazmit_dama` already holds ~70 entries; applying
  *that* server-side would silently change the sidebar, the counts and the "Show all" toggle's meaning.
  Hiding by *type* is a narrow, predictable change; category-level hiding stays a client concern.
- Both functions must apply the same predicate or `length` and `byIndex` disagree and the list ends in
  `null` holes.

### 3. Opt-in visibility — DONE
The default list must not be the only way to see uploads:
- Expose an unfiltered sibling collection — `uda[{keys:envs}].sourcesAll.length` /
  `.sourcesAll.byIndex[{integers:indices}]`, returning `$ref`s into the existing `sources.byId` so no
  attribute plumbing is duplicated — and have the datasets list request it only when the admin asks.
  (Falcor routes are static path patterns, so a per-request flag has to be a path segment, not an arg.)
- Wire it to the existing **"Show all"** (`isListAll`) affordance in `DatasetsList/index.jsx`, and add a
  `SettingsPage` toggle for the env default (writes `hidden_source_types`).
- **Resolved (own toggle).** "Show all" stays on the filtered collection and keeps its current
  meaning (reveal hidden categories + uncategorized); uploads get a **separate** authed-only toolbar
  button. Reaching for a category filter should not trigger an 11k-row fetch. `visibleSources` also
  short-circuits for upload rows while the toggle is on, or the client category filter
  (`Uploaded File` is in `filtered_categories` on hazmit_dama) would immediately re-hide what the
  toggle just fetched and the button would look broken.

### 4. Cheap wins to fold in while here — DONE (one kept deliberately)
- `sourcesTab.jsx`'s client-side `type !== 'file_upload'` filter is **kept, deliberately**: an env can
  set `hidden_source_types: []`, and the pattern editor still shouldn't offer image uploads as a
  pattern data source. It costs one `.filter()` and is now belt-and-braces rather than the only guard.
- Confirm the module cache (`datasetsListCache.js`) keys on the collection used, so toggling
  show-all doesn't serve a stale filtered array.

## Files requiring changes

| File | Change |
|---|---|
| `packages/dms-server/src/dama/upload/file-upload-route.js` | server-authoritative `type` + marker category on new-source create |
| `packages/dms-server/src/dama/upload/file-upload-dms-route.js` | **no change needed** — it already hardcodes `type: 'file_upload'` server-side (line ~161) |
| `packages/dms-server/src/routes/uda/uda.controller.js` | `getSourcesLength` + `getSourceIdsByIndex`: exclusion predicate from `settings.hidden_source_types` (default `['file_upload']`); add unfiltered variants |
| `packages/dms-server/src/routes/uda/uda.route.js` | new `sourcesAll.length` / `sourcesAll.byIndex` routes ($ref into `sources.byId`) |
| `packages/dms/src/patterns/datasets/pages/DatasetsList/index.jsx` | `getSources()` picks the collection; `isListAll` wiring; counts/sidebar unchanged in the default view |
| `packages/dms/src/patterns/datasets/pages/SettingsPage.jsx` | toggle for `hidden_source_types` |
| `packages/dms/src/patterns/datasets/utils/datasetsListCache.js` | **no change needed** — the key is the caller's; DatasetsList now passes `…-${collection}` |
| `packages/dms/src/patterns/admin/pages/patternEditor/pages/sourcesTab.jsx` | **unchanged** — filter kept as a second guard (see 4) |
| `packages/dms-server/tests/test-uda.js` | new `testDamaHiddenSourceTypes()` — 4 assertions |
| `packages/dms/src/patterns/datasets/pages/settingsPage.theme.js` | `togglePanel` / `togglePanelLabel` / `toggleLabel` / `toggleHint` keys |

## Testing checklist

- [x] **Measured first.** Against live `hazmit_dama`, via a real dms-server on a spare port, issuing
      the exact request the list page makes (`byIndex[0..len-1]` + `['name','type','categories',
      'description']`):

      | | rows | Falcor payload | server response (3 runs) |
      |---|---|---|---|
      | before (`sourcesAll`) | 11,423 | **3,081,280 B** | 0.78 / 0.71 / 1.23 s |
      | after (`sources`) | 366 | **195,679 B** | 0.29 / 0.23 / 0.28 s |

      15.7× smaller payload, ~3× faster response — and that is *before* the browser-side saving, which
      is the bigger one: Falcor no longer merges 11.4k refs + ~45k attribute values into its cache and
      React no longer diffs them. Raw SQL was never the bottleneck (2–12 ms either way).
- [x] `sources.length` and `sources.byIndex` agree under the exclusion — asserted in the new test, and
      re-checked live on both envs (366 = 366, 426 = 426). A mismatch is what would leave `null` holes.
- [x] `hazmit_dama` default list returns **366**, not 11,423.
- [ ] ~~`npmrds2` byte-for-byte unchanged~~ — **it isn't, and that's correct.** npmrds2 has 12
      `file_upload` sources (438 → 426): `img test`, `test image` (both already tagged
      `Inactive › to_delete` by the npmrds2 tagging pass), plus 10 docs/QA image-upload rows
      (`npmrdsv5+dev2|npmrds2 docs images`, `coverage_example_diagram`, …). All are genuine image
      uploads, so hiding them from lists is the intended effect. Nothing else about npmrds2 moves.
- [x] An env with `hidden_source_types: []` explicitly set still lists uploads (asserted in the test —
      the default must not win over an explicit empty list).
- [x] Show-uploads toggle reveals uploads: `sourcesAll` returns 11,423 / +1 in the test, and the
      category-filter short-circuit keeps them visible once fetched.
- [ ] A fresh lexical image upload and a fresh Card image-column upload — land with server-set
      `type='file_upload'` + `[["Uploaded File"]]`, stay out of the default list, `dl_url` still
      renders. **Needs a browser**; the write path is inspected but not exercised.
- [ ] `file_upload` CreatePage append-to-existing-source flow — code-checked (it posts an explicit
      `source_id` and navigates by `json.source_id`; no enumeration involved), not clicked.
- [ ] SourcePage for an upload source still loads by id — `sources.byId` is deliberately unfiltered,
      code-checked, not clicked.
- [x] SQLite DAMA path handled: the predicate is `NOT (type = ANY($1))` with no cast, which is what the
      sqlite adapter's `= ANY($n)` → `IN (?, …)` rewrite matches; the empty-list case skips the WHERE
      entirely (`IN ()` isn't portable). The new test runs on `dama-sqlite-test`.
- [x] BC sweep of every consumer of `uda[env].sources.length`/`byIndex`: `DatasetsList`,
      `SettingsPage`, mapeditor `SourceSelector/index.jsx` + `SourceList.jsx`,
      `LinkedDataControl/JoinSetup.jsx`, admin `sourcesTab.jsx`. All are "pick a dataset" surfaces
      where an image upload was never a wanted option — they all get faster and cleaner. No other
      caller exists in `dms-template/src`, `transportNY/src` or `avail-falcor`.
- [x] `npm test` (28 + 12 + 16 + 23 passing suites) and `npm run test:uda` (97 passed, 0 failed) green,
      plus `test:tasks` (22) and `test:upload` (12) since settings and the upload route were touched.

## Progress log

- 2026-09-17 — Task created out of the `hazmit_dama` audit's Phase-0 owner decision ("don't inventory
  the uploads — stop loading them"). Read path, write path and existing tagging convention verified in
  code (paths above); `hazmit_dama` measured at 11,057/11,423 upload rows.
- 2026-09-17 — **Implemented.** Server: `getHiddenSourceTypes()` + `hiddenTypeClause()` in
  `uda.controller.js`, applied to `getSourcesLength`/`getSourceIdsByIndex` (both take
  `{includeHidden}`); new `uda[env].sourcesAll.length` / `.byIndex` routes `$ref`ing the existing
  `sources.byId`; `file-upload-route.js` now sets `type` + merges the `Uploaded File` marker itself
  instead of trusting the multipart fields (the unused `type` field is gone from the destructure).
  Client: `getSources({collection})`, a `showUploads` toggle (authed-only) with its own cache key, and
  a `SettingsPage` switch writing `hidden_source_types`.
- 2026-09-17 — **Two bugs found and fixed while here, both in `SettingsPage`:** (1) `saveSettings`
  serialized `{filtered_categories}` alone, so every category click **dropped every other settings
  key** — it would have silently erased `hidden_source_types` (and `show_uncategorized`) the first time
  an admin hid a category. Now the page keeps the rest of the blob in state and merges. (2) The hidden
  list was derived only from loaded sources, so a hidden category that no *visible* source carries
  (exactly what `Uploaded File` becomes now) had no chip to click and was un-unhideable; it is now the
  union with `filtered_categories`.
- 2026-09-17 — **Scope narrowed after a BC check: the filter applies to the DAMA enumeration only,
  not DMS-internal sources.** The original plan filtered both. But the two populations have different
  provenance: DAMA `file_upload` rows are created *implicitly* by every lexical InlineImage and Card
  image-column upload (both POST `/dama-admin/:pgEnv/file_upload`), whereas DMS-internal ones come
  from the datasets "add a file" CreatePage — a deliberate document-as-dataset authoring act. Counted
  them: 4 internal upload sources in `npmrdsv5` (incl. `Freight Atlas QA screenshots`,
  `QA ticket screenshots`) and 2 in `mitigat-ny-prod` (`LHMP Template Seal`) — single digits, zero
  performance benefit, and hiding them would have quietly removed curated documents (the Freight Atlas
  plan PDFs are the same shape) from their pages. `getSiteSources()` was reverted to its original
  form as a result.
- 2026-09-17 — Note for the audit: running the controller against `hazmit_dama` triggers dms-server's
  normal `initDama` / `initDamaTasks` / `initDamaSchedules` on connect. Verified inert — same 18
  `data_manager` tables, same 11,423/11,786 counts, and `sources.auth_permissions` still has no
  default (the `ADD COLUMN IF NOT EXISTS` no-ops on the existing column), which is one of the gaps
  Phase 7 of the audit records.
- 2026-09-17 — Swept every caller of `POST /dama-admin/:pgEnv/file_upload` before making the type
  server-authoritative: `ui/columnTypes/image.jsx`, the lexical `InlineImageComponent.tsx`, and
  TransportNY's legacy `src/pages/DataManager/DataTypes/file_upload/CreatePage.jsx` — **all three
  already send `type=file_upload`**, so forcing it changes no behaviour. That legacy page is the one
  caller that uses the endpoint deliberately ("upload a file as a dataset" against a pgEnv), so a
  document uploaded through it now sits behind the toggle rather than in the default list; empirically
  none exist — all 12 npmrds2 and all 11,057 hazmit_dama upload rows are image/test uploads — and any
  such row stays reachable by link, by id, and via the toggle.
- 2026-09-17 — Reminder for whoever deploys: `transportNY/src/modules/dms/` vendors its own copy of
  all of these files and is synced **from** dms-template — do not hand-edit it (see the workspace
  CLAUDE.md and the `reference_transportnyv2_theme_sync` recipe).
