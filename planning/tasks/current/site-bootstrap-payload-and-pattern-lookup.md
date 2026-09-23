# Page load — the site bootstrap payload (and two related fetch problems)

> Diagnosis task, opened 2026-09-17 after the `file_upload` exclusion
> ([`datasets-exclude-file-upload-sources.md`](./datasets-exclude-file-upload-sources.md)) cut the
> MitigateNY datasets list from 11,423 sources to 366 and the page was **still** slow. Measured with
> a real logged-in Chromium against a local dms-server + vite on the live mercury DB, so these are
> observed numbers, not estimates.

**STATUS (2026-09-22): findings 1, 2, 4 SHIPPED + the trigram index APPLIED TO LIVE `dms3`.
Finding 3 still open.** Production-build first card on `/cenrep`: **1216 ms → 726-735 ms**.
Data requests on `/cenrep` went from **1,350,149 B to 453,318 B per load (−66%)**, and the
`getSitePatterns` lookup from **123 ms to 1.0 ms**. Code uncommitted, not deployed; the MitigateNY
site-row cleanup IS applied to the live row (owner-authorized, backup on disk). See "What shipped".

⚠ **Correction to the first version of this doc:** the per-request byte figures below were read off a
`2×`-grouped dev trace, where React `StrictMode` fires each request twice — they were the *sum across
the pair*, not one request. Halved throughout now. The ranking never changed; the bootstrap was
~1.35 MB per production load, not ~2.05 MB.

## How it was measured (reproducible)

```bash
# server (this repo's code) on a spare port, live mercury DB
cd dms-template/src/dms/packages/dms-server
PORT=3099 node --max-http-header-size=1048576 --env-file-if-exists=../../../../.env src/index.js

# vite pointed at it, on a spare port (5199 is often already taken by a dev server)
cd dms-template
VITE_API_HOST=http://localhost:3099 VITE_DAMA_HOST=http://localhost:3099 npx vite --port 5299 --strictPort
```
Then a Playwright script logs in as `availabs@gmail.com` / `test123` (**user id 1**, which
`prod|datasets:pattern`'s `authPermissions` grants `*` — anonymous is redirected to `/auth/login`
and measures nothing), navigates to `/cenrep`, and records every `/graph` request with size, timing
and body, plus time-to-first-card. Script kept at
`dms-template/scratchpad/page-load-probe/probe-cenrep.mjs`.

**Watch out:** in dev, React `StrictMode` (`src/main.jsx`) double-invokes effects, so every figure
below appears **twice** in a dev trace. Production pays each once. The per-request numbers here are
per fetch.

## What `/cenrep` actually loads (MitigateNY datasets pattern, id 1499610)

Timeline, warm local server:

| | at |
|---|---|
| DOMContentLoaded | 960 ms |
| site row request | 1,290 ms |
| all-patterns request | 1,393 ms |
| theme rows request | 1,720 ms |
| **datasets sources request** | 2,123 ms |
| first dataset card painted | **2,611 ms** |

It is a **serial waterfall** — the datasets query cannot start until the site → patterns → themes
chain finishes, so ~2.1 s of the 2.6 s is bootstrap, not datasets.

Payload per fetch (dev doubles all of these):

| request | bytes per load | what it is |
|---|---|---|
| `dms.data[app+prod:site]` length + byIndex | **492,447** | the one site row |
| `dms.data[app].byId[4 theme ids]` | **416,275** | the 4 themes, via `theme_refs` expansion |
| `dms.data[app].byId[110 pattern ids]` | **208,956** | every pattern's full `data` |
| `uda[hazmit_dama].sources.byIndex[0..365]` | 195,679 | the datasets list (was 3,081,280) |
| `uda[app+datasets].sources.byIndex[0..51]` | 24,709 | the internal env's 52 sources |
| dmsEnvs, settings, form-manager, lengths | ~12,000 | small |

**Total 1,350,149 B per load in production** (≈2.5 MB in dev, where StrictMode doubles most of it).
The datasets list — the thing this page is *for* — is the 4th largest item.

## What shipped (2026-09-17)

| | before | after |
|---|---|---|
| site row request | 492,447 B | **11,429 B** |
| theme rows request | 416,275 B | **232 B** (name-only projection; content fetched only if selected) |
| pattern rows request | 208,956 B | 208,956 B (unchanged — finding 3's sibling, still open) |
| datasets sources | 195,679 B | 195,909 B (unchanged) |
| **total data per load** | **1,350,149 B** | **453,318 B (−66%)** |
| `getSitePatterns` query | 123 ms (seq scan, 377,807 rows / 5.6 GB) | **1.0 ms** (trigram bitmap index scan) |

Verified in a logged-in Chromium against a local server on the live DB: 354 source links render, 177
datasets / 14 categories, page correctly themed (screenshot taken). `npm test` (28+12+16+23),
`test:uda` (97), `test:schema-drift` (23) all green.

**Wall-clock caveat, stated plainly:** time-to-first-card in *dev* did not improve (~2.6 s before and
after). Dev wall-clock is dominated by vite serving hundreds of unbundled modules (DOMContentLoaded
alone is ~1 s) and by the waterfall's *depth*, which these changes don't shorten — site → patterns →
sources is still three serial hops. The win is 0.9 MB less transfer per load, which is worth much
more over a real network with a production bundle than it is on localhost. Shortening the waterfall
is separate work.

### Files
- `render/spa/utils/index.js` — `collectThemeNames` now also reads the legacy
  `theme.settings.theme.theme` path; new `resolveDbThemes()`; `resolveThemes(config, siteData, opts)`
  takes `{falcor, app}`; `pattern2routes`' own `dbThemes` derivation skips content-less refs.
- `render/spa/dmsSiteFactory.jsx` — sets `refAttributes: ["data ->> 'name'"]` on the routing load's
  `theme_refs` (its own deep clone, so the admin theme editor still gets full expansion), and passes
  `{falcor, app}` to all three `resolveThemes` call sites (master, tenant, cached fast path).
- `api/proecessNewData.js` — `dms-format` ref expansion honours a per-attribute `refAttributes`
  projection and normalizes `data ->> 'x'` result keys to `x`.
- `patterns/admin/admin.format.js` — the dead `themes` attribute is gone (with a note explaining why
  there isn't one).
- `patterns/admin/pages/themes/list.jsx` — trimmed the commented-out `item.themes` debug dump.
- `db/sql/dms/migrate_dms_core.sql` — pg_trgm + `ix_data_items_type_trgm` per schema (see finding 4).
- `scratchpad/page-load-probe/drop-site-themes.mjs` — the row cleanup, dry-run by default.

### Live data change (owner-authorized)
`dms_mitigat_ny_prod.data_items` id 566430 (`prod:site`): `data.themes` deleted.
**486,511 B → 6,143 B**; `theme_refs` (4) and `patterns` (106) intact. Full pre-edit backup:
`dms-template/scratchpad/page-load-probe/site-row-backup-dms_mitigat_ny_prod-566430.json` — restore by
re-putting that JSON as the row's `data`. Done with `data = data - 'themes'` in SQL because
`setDataById` merges and so cannot delete a key; that bypasses `change_log`, hence the file backup.

**Still carrying the dead field, not yet touched** (same one-line fix, run with `--all`):
`dms_avail` 1400985 (444 kB) and `dms_npmrdsv5` 1163627 (55 kB).

### Note on `pg_trgm`
While validating the migration inside a rolled-back transaction on `dms3`, the `CREATE EXTENSION
pg_trgm` survived the rollback — so the extension (1.6) is now installed on `dms3`. Additive and
harmless (trigram functions/operators only), no indexes or schemas were left behind, and the
migration installs it anyway — but it happened as a side effect of validation, not deliberately.

## Finding 1 — 480 KB of the 486 KB site row is a dead `themes` array ⭐ — FIXED

The site row (`dms_mitigat_ny_prod.data_items` id 566430) is 486,511 B. Broken down:

| key | bytes |
|---|---|
| **`themes`** | **480,832** (4 full theme objects, inline) |
| `patterns` | 5,051 (106 `{id, ref}` refs) |
| `theme_refs` | 189 (the same 4 themes as `{id, ref}`) |
| `dms_envs` | 185 |
| everything else | ~150 |

`themes` is the pre-refactor inline copy; `theme_refs` is the ref-based replacement. **The renderer
reads `theme_refs`, never `themes`** — `render/spa/utils/index.js:150` builds `dbThemes` from
`siteData[0].theme_refs`, and the admin theme pages (`patterns/admin/pages/themes/list.jsx`,
`editTheme.jsx`) all read/write `theme_refs`. The only reader of `item.themes` in the entire package
is a debug dump: `themes/list.jsx:194` → `<pre>{JSON.stringify(item.themes, null, 3)}</pre>`.

So every page load of every MitigateNY page ships a half-megabyte of theme JSON that nothing
consumes — and then ships the same themes **again** as their own rows (finding 2). It's declared as
a plain `json` attribute in `patterns/admin/admin.format.js:188`.

Not MitigateNY-specific, and demonstrably legacy — newer sites don't have it:

| site row | row size | dead `themes` |
|---|---|---|
| `dms_avail` 1400985 `site:site` | 445 kB | **444 kB** (4 themes / 4 refs) |
| `dms_mitigat_ny_prod` 566430 `prod:site` | 476 kB | **470 kB** (4 / 4) |
| `dms_npmrdsv5` 1163627 `dev2:site` | 56 kB | **55 kB** (1 / 1) |
| `dms_dms_site` 967186 | 486 B | none |
| `dms_tessera` 1, `dms_landbank` 1 & 10 | ~300 B | none |

Other readers, checked: nothing server-side reads it (`migrate-type-system.js:363` only tests the
key's *existence* to recognise a site row), and no SSR path touches it.

**Fix (two halves, do both):**
- **Code** — drop the `themes` json attribute from `admin.format.js` so it stops being round-tripped
  on save, and replace `themes/list.jsx`'s debug `<pre>` with `theme_refs` (or delete it).
- **Data** — remove `data.themes` from the three affected site rows via the blessed write path
  (`dms raw`/apiUpdate, not SQL). ⚠ **Owner sign-off needed** — it edits live site rows, and the
  site row is the single most load-bearing row in an app. Take a backup of each row first; the
  rollback is a re-put of the same key.

Expected effect: the 985 KB request becomes ~30 KB, i.e. **~47% off the total bootstrap**, with no
behaviour change.

## Finding 2 — the DB themes are fetched in full on every page, and MitigateNY selects none of them ⭐ — FIXED

**Owner's question, 2026-09-17: "we end up using neither `themes` nor `theme_refs`, is that your
understanding?" — for MitigateNY, correct.** Verified against every pattern in every app.

`getPatternTheme()` (`ui/useTheme.js:110`) picks a theme **by name** from the merged registry:
`pattern.theme.selectedTheme`, else the legacy `pattern.theme.settings.theme.theme`, else
`'default'`. The registry is the code loaders in `dms-template/src/themes/index.js` (`default`,
`catalyst`, `transportny`, `transportnyv2`, `mnyv1`, `mny_admin`, `wcdb`, `avail`, `tessera`,
`tessera_v6`, `landbank`) merged with `dbThemes`, keyed by each DB theme row's `name`.

What MitigateNY's 110 patterns actually select:

| path | values |
|---|---|
| `selectedTheme` | `mnyv1` ×79 · `mny_admin` ×3 · unset ×28 |
| legacy `theme.settings.theme.theme` | `mny` ×10 · `mnyv1` ×3 · `default` ×1 · `mny_admin` ×1 |

Every one of those is a **code** theme (`mny` matches nothing at all and falls through to
`defaultTheme`). MitigateNY's DB theme rows are named `default-db`, `mny-db`, `mny-admin-db`,
`AVAIL Theme` — **no pattern names any of them.** So MNY ships ~1.3 MB of theme JSON per page load
(470 kB inline via finding 1 + 832 kB of theme rows here) and consults none of it. Same story on
`npmrdsv5`: its one DB theme is `NYSDOT theme` (297 kB, ~609 kB on the wire — visible in the prod
trace) while its patterns select `transportnyv2`/`transportny`.

**⚠ But the DB-theme path is genuinely live in two other apps, so the code path must stay:**

| app | pattern | selects | matching DB row |
|---|---|---|---|
| `dms_asm` (b3nson) | `b3` 1059748, `auth` 1676371 | `"b3 Theme"` (`selectedTheme`) | `"b3 Theme"` 131 kB |
| `dms_avail` | 2 patterns | `mny-admin-db` (**legacy** path) | `mny-admin-db` 176 kB |

**Fix — make DB themes lazy by name, exactly like code themes already are.** The machinery exists:
`resolveThemes()` → `collectThemeNames(siteData)` (`render/spa/utils/index.js:100`) already walks the
patterns and dynamically imports *only* the code themes whose names are selected. `theme_refs`, by
contrast, is a `dms-format` array attribute on the site format, so the loader expands **every** theme
row before anything asks which are needed. Collect the names first, then fetch only those rows.
Result: MNY and npmrdsv5 fetch **zero** theme rows, asm fetches one, avail fetches one.

**Trap to avoid in that change:** `collectThemeNames` currently reads only `selectedTheme` (plus a
hardcoded `mny_admin` for auth patterns), while `getPatternTheme` *also* honours the legacy
`theme.settings.theme.theme`. Reusing the collector as-is would silently strip the DB theme from the
two `dms_avail` patterns that select `mny-admin-db` through the legacy path. The collector must cover
both selection paths.

## Production-build measurement (2026-09-17) — where the ~1.2 s actually goes

Everything above was measured against the **dev** server, where wall-clock is dominated by vite
serving hundreds of unbundled modules. Owner asked for the production case, so: `vite build` → `dist`
served by `vite preview`, logged in, pointed at a local dms-server (LAN IP, since `App.jsx` rewrites a
localhost `VITE_API_HOST` to the prod host in PROD builds) on the live DB. Network latency ≈ 0 here,
so this isolates client work + server time; a real user adds one RTT per waterfall level.

| | |
|---|---|
| FCP | 568 ms |
| DOMContentLoaded | 350 ms |
| **first dataset card** | **1216 ms** (cold) · 1430 ms (warm, before the fix below) |
| JS | 7 files, 1,459,482 B encoded — `index` 745,850 · `vendor` 340,548 · `maplibre` 284,755 · themes ~88 k |
| main-thread long tasks | **6, 609 ms total** (@224+126 @382+152 @622+55 @743+113 @1157+73 @1230+90) |

Two roughly equal halves:

**a) ~570 ms of client boot before the first data request fires.** All three big chunks are on the
wire by 64 ms on localhost, so this is parse + eval + first render — the 609 ms of long tasks. Note
`maplibre` (284,755 B encoded, 1,053,382 B raw) loads eagerly on a page with no map.

**b) ~620 ms of serial data waterfall — 5 levels deep:**

```
@373→399   site row                                    (26 ms)
@545→566   dmsEnvs          @553→587 form-manager      (21/35 ms)
@577→622   110 pattern rows                            (45 ms)
@700→734   theme names      @702→829 sources.length    (35/127 ms)  ← the seq scan
@860→969   sources.byIndex (367)  @861→993 internal    (109/132 ms)
```

Each level waits on the one above it. On localhost the levels cost ~620 ms; at a 40 ms RTT a real user
pays ~+200 ms on top, at 150 ms RTT ~+750 ms. **Cutting levels matters more in production than cutting
bytes.**

### Result of the two fixes below, same harness

| | before | after |
|---|---|---|
| first card, cold | 1216 ms | **947-1005 ms** |
| first card, warm (returning visit) | 1430 ms | **~1170 ms** (3 runs: 1170/1165/1273) |
| data per load, warm | 644,651 B | **453,318 B** (identical to cold) |
| `getSources` calls | 2× warm / 1× cold | **1× always** (6/6 runs) |
| main-thread long tasks | 6, 609 ms | **4, 404-432 ms** |

Warm loads are now as fast as cold ones, and they render correctly themed from the first paint
instead of default-themed-then-remounted.

### FIXED here: the warm-load double mount (+200-300 ms, +191 kB, every returning visit)

`getSources` ran **twice** on any visit with a localStorage site snapshot: the fast path builds routes
from the snapshot and mounts the page, then the full fetch calls `setDynamicRoutes` with an equivalent
array, which recreates the router (`createBrowserRouter` memo) and **remounts the whole tree** — so
every page refetches its data and renders twice.

Fix: `dmsSiteFactory` now records the site data its mounted routes were built from
(`appliedSiteDataRef`) and skips the replacement when the full fetch returns identical data. It
compares the *whole* site payload, not route paths, so a genuinely changed pattern/theme still
replaces the routes as before.

**That exposed a second bug — a fix from 2026-07-02 that never actually worked in the field:**
`hasNoAccessPatterns()` (`render/spa/utils/snapshot.js`) is meant to stop an auth-blocked boot from
persisting a snapshot of the server's routing *stubs*. It checks `p?.id === 'no-access'` — but ref
expansion in `api/proecessNewData.js` writes `id: ref.id` **last**, overwriting exactly that marker,
so the check never matched and stub snapshots were persisted anyway. Consequence: the snapshot written
by the unauthenticated `/auth/login` boot holds patterns with no `type` and no real `theme`
(200,870 B of stubs vs 209,895 B of real rows), so every subsequent boot rendered from stub data,
default-themed, and then remounted when the real fetch landed — the precise failure that file's
comment says it prevents. The expansion now carries a `no_access: true` flag that survives, and
`hasNoAccessPatterns` checks it.

This closes fix 3 of
[`no-access-stub-default-theme.md`](./no-access-stub-default-theme.md) (marked DONE 2026-07-02).
Its test — `packages/dms/tests/siteSnapshot.test.js` — passed all along because it built stubs in the
**unexpanded** server shape (`id: 'no-access'`), which is not the shape the guard ever sees. Two cases
in the ref-expanded shape are added there now (8 tests, green); they fail against the old guard.

### With the index live (2026-09-22) — final trace

Owner granted permission, so `ix_data_items_type_trgm` was built on all **106** `dms3` schemas with
`CREATE INDEX CONCURRENTLY` (no write lock on `data_items`), 0 invalid, largest 17 MB
(`dms_mitigat_ny_prod`). On the live table the `getSitePatterns` query went **123 ms → 1.219 ms**
(Bitmap Index Scan, `Index Cond: (type ~~ '%|datasets:pattern')`), 2-4 ms per round trip, same 1 row.

Page effect, same harness:

| | before this task | after themes+mount fixes | + index live |
|---|---|---|---|
| first card | — | 947-1005 ms | **726-735 ms** |
| FCP | — | 584-644 ms | **488-500 ms** |
| `sources.length` | 127-164 ms | 120 ms | **20 ms** |
| internal `sources.byIndex` | 132 ms | 103 ms | **42 ms** |
| long tasks | 609 ms | 404-432 ms | 403 ms |

```
   0→ 267ms   JS parse/eval/boot · FCP ~496 ms · 403 ms long tasks
 267→ 275ms   site row (8 ms)
 284→ 296ms   dmsEnvs (12 ms)
 300→ 320ms   110 pattern rows (20 ms)
 328→ 341ms   theme names (13 ms)
 490→ 513ms   form-manager length (23 ms)
 561→ 581ms   sources.length (20 ms)      ← was 120 ms
 589→ 641ms   sources.byIndex 368 (51 ms) + internal 52 (42 ms)
      ~735ms  first card painted
```

Client boot is now the majority of the remaining time.

### Where the ~1.0 s went before the index

```
   0→ 390ms   JS download (49 ms on localhost) + parse/eval/boot · FCP 584-644 ms · 404 ms long tasks
 384→ 391ms   site row                                    (7 ms)
 399→ 412ms   dmsEnvs                                     (13 ms)
 416→ 441ms   110 pattern rows                            (25 ms)
 452→ 463ms   theme names                                 (11 ms)
 631→ 650ms   form-manager length                         (19 ms)
 709→ 829ms   sources.length          ← 120 ms = the pattern seq scan
 832→ 936ms   sources.byIndex (367) + internal (52)       (42 / 103 ms)
     ~1005ms  first card painted
```

Roughly 40% client boot, 40% a six-level waterfall, 12% the one un-indexed query, and the rest render.

### Still on the table, in order

1. **One less waterfall level for the source list.** `sources.length` then `sources.byIndex[0..len-1]`
   is two serial hops for one list, and `length` is the request that triggers the pattern seq scan
   (127-164 ms of the trace above). A single "give me the sources" route removes a whole level.
2. ~~The trigram index on the live DB~~ — **DONE 2026-09-22** (see above).
3. **`maplibre` out of the eager graph** — 285 kB encoded / 1.05 MB raw parsed on every page,
   map or not.
4. **The `index` chunk** — 746 kB encoded / 2.5 MB raw is most of the 609 ms of long tasks.
5. Finding 3 below, and the 110-pattern projection.

## Finding 3 — `dataWrapper` pulls `metadata` for every source in the env — STILL OPEN

Separate from `/cenrep`, and it hits **page** patterns (the county pages):
`patterns/page/components/sections/components/dataWrapper/useDataSource.js` enumerates the whole
pgEnv with the datasources config's `srcAttributes: ['name', 'metadata']`
(`render/spa/utils/index.js:249`) — and `metadata` is the full column-definition blob per source.

Observed on a production trace: **4,412,718 B in 979 ms**, one request. Today's `file_upload` fix
takes it to **2,368,322 B** (366 sources instead of 11,423), but the remainder is real datasets'
metadata, and a section needs the metadata of *the source it is bound to* — not all of them.

**Fix:** split the fetch — `['name']` (plus `row_type` where it's already requested) for the picker
list, and `metadata` only for the bound source id(s), which `byId` already serves. That is roughly
2.3 MB off every data-bound page. BC surface: everything that reads `useDataSource`'s output shape,
so it needs its own task and a careful pass ([[feedback_primitive_change_tasks_bc]]).

## Finding 4 — the pattern lookup seq-scans a 5.6 GB table, twice per datasets page — FIXED (trigram, not a partial index)

`getSitePatterns()` (`routes/uda/utils.js:257`) does:

```sql
SELECT id FROM dms_mitigat_ny_prod.data_items WHERE app = $1 AND type LIKE '%|' || $2 || ':pattern'
```

A leading-wildcard `LIKE` can't use `ix_data_items (app, type)`, and `app` isn't selective — it is a
per-app schema, so *every* row matches it. `EXPLAIN ANALYZE`:

```
Parallel Seq Scan on data_items (actual time=75.844..83.643 rows=0 loops=3)
  Filter: ((type ~~ '%|datasets:pattern') AND (app = 'mitigat-ny-prod'))
  Rows Removed by Filter: 125935   (×3 workers = 377,807 rows)
Execution Time: 96.478 ms
```

377,807 rows / 5,663 MB scanned to find one pattern row, ~96 ms, and the datasets page does it
**twice** (`sources.length` and `sources.byIndex` each call it) — the observed 114 ms and 102 ms
requests in the trace. Every DMS app pays this in proportion to its content.

**Fix as shipped — a trigram GIN index, not a partial index.** My first proposal here was a partial
index `(app, type, id) WHERE type LIKE '%:pattern'`. **That does not work**, measured on a 377k-row
reproduction: Postgres cannot prove `type LIKE '%|x:pattern'` implies `type LIKE '%:pattern'` (LIKE
isn't a btree operator), so the planner ignores it — still a seq scan, still ~110 ms. A covering
`(app, type, id)` btree is ignored too, for the same reason plus `app` being non-selective.

What the planner *will* use for a leading-wildcard LIKE is a trigram index, and it needs no query
change. Added to `sql/dms/migrate_dms_core.sql`, per schema (split mode gives each app its own
`data_items`), with the same warning-not-failure wrapper the postgis block in
`sql/dama/migrate_dama_core.sql` uses, since `CREATE EXTENSION` needs elevated privileges:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS ix_data_items_type_trgm
    ON <schema>.data_items USING gin (type gin_trgm_ops);
```

Validated against `dms3` inside a **rolled-back** transaction, on a 377,807-row table built to match
the real type distribution:

| | before | after |
|---|---|---|
| plan | Parallel Seq Scan, 377,807 rows / 5,663 MB | Bitmap Index Scan, `Index Cond: (type ~~ '%\|datasets:pattern')` |
| time | 123 ms | **1.006 ms** |

Build cost 2.1 s for the extension + a **9.8 MB** index on that table; the second run of the block was
a 4 ms no-op (idempotent). It fixes every other leading-wildcard `type` lookup at the same time.
It builds on the next server start against a given database — worth knowing before deploying, since
a GIN build takes a SHARE lock on `data_items` for those seconds.

## Not a finding: dev-only doubling

Every request appears twice in a dev trace because `src/main.jsx` wraps the app in `StrictMode`.
Don't chase it, and don't quote dev totals as production ones.

## What's left

1. **Finding 3** (`useDataSource` fetching `metadata` for every source) — the biggest remaining win,
   and it hits the county pages rather than `/cenrep`. Own task, BC pass.
2. **The 110 pattern rows (208,956 B)** — now the single largest item on `/cenrep`. `createRequest`
   already supports a `filter.attributes` projection (`data ->> 'key'`), so the routing load could ask
   for just the keys the router reads instead of each pattern's whole `data`. Needs the key list
   enumerated carefully: miss one and routing breaks silently, which is why it wasn't done here.
3. **The waterfall depth** — site → patterns → sources is three serial hops (~2.1 s before the
   datasets query starts even on localhost). Nothing above shortens it.
4. **The two remaining dead `themes` arrays** — `dms_avail` (444 kB) and `dms_npmrdsv5` (55 kB), one
   command away (`drop-site-themes.mjs --all`).
5. **DB themes are slated for deprecation** (owner, 2026-09-17: "nothing important currently uses
   it"). When that lands, the `theme_refs` load path and `resolveDbThemes` can be deleted outright
   rather than kept lazy — the lazy version is deliberately the shape that makes that deletion easy.

## Progress log

- 2026-09-17 — Diagnosed with a real browser trace on `/cenrep` (logged in as user 1) against a
  local server on the live DB. Confirmed the datasets list is no longer the bottleneck (196 KB of a
  2.05 MB production bootstrap); found the dead `themes` array (480 KB), the duplicate theme fetch
  (832 KB), the full-pattern fetch (418 KB), the serial waterfall (datasets query starts at 2.1 s,
  first card at 2.6 s), the `dataWrapper` metadata enumeration (4.41 MB → 2.37 MB after today's fix),
  and the pattern-lookup seq scan (377,807 rows / 5.6 GB / ~96 ms, twice per page). Nothing changed.
- 2026-09-17 — **Finding 2 corrected after the owner pushed back** ("we end up using neither"). My
  first pass said the renderer "reads `theme_refs`", which was true of the code path but missed the
  question that matters: whether any pattern *selects* a DB theme. Swept `selectedTheme` and the
  legacy `theme.settings.theme.theme` across every pattern in every app — MitigateNY and npmrdsv5
  select only code themes, so both fields are dead weight there; `dms_asm` (`"b3 Theme"`) and two
  `dms_avail` patterns (`mny-admin-db`, via the legacy path) do select DB themes, so the load path
  has to stay and the fix is lazy-by-name rather than deletion. That also makes finding 2 a ⭐
  alongside finding 1 instead of "design work, revisit later".
- 2026-09-17 — **Findings 1, 2, 4 implemented, measured and verified.** Data per `/cenrep` load
  1,350,149 B → 453,318 B (−66%); `getSitePatterns` 123 ms → 1.0 ms. The DB-theme two-phase path was
  verified against the app that actually uses one (`asm`: 90 B of names → pattern selects
  `"b3 Theme"` → one 134,746 B row fetched, parsed, 30 top-level keys), so b3nson keeps its theme and
  just stops fetching it on sites that don't select it. MitigateNY `/cenrep` re-checked in a browser:
  354 source links, 177 datasets / 14 categories, correctly themed. Corrected this doc's per-request
  byte figures, which had been read off a StrictMode-doubled dev trace.
- 2026-09-17 — **Production-build measurement + 2 more fixes.** Built `dist` and served it (owner's
  request) to see the real production case rather than dev-server wall-clock. First card 1216 ms cold /
  1430 ms warm → **947-1005 ms cold / ~1170 ms warm**, long tasks 609 → ~420 ms, warm-load data
  644,651 → 453,318 B, `getSources` 2× → 1× on every run. Two fixes: the snapshot fast path's
  redundant route replacement (remount → refetch), and the `no_access` marker that
  `hasNoAccessPatterns` needs but ref expansion was erasing — the second is why fix 3 of the
  2026-07-02 no-access task never worked, and why warm boots rendered default-themed.
  `siteSnapshot.test.js` gains the expanded-stub cases (8 green).
  **Measurement caveat worth remembering:** my first prod probe reported 4.1 s and 500-1000 ms server
  times — both artifacts of the probe itself, which awaited `response.body()` on every asset
  (including the 2.5 MB chunk) and backpressured the server. Passive `performance.getEntriesByType`
  numbers are the trustworthy ones.
  **Blocked:** applying the trigram index to the live `dms3` was refused by the sandbox
  (`Modify Shared Resources`), so the 120 ms `sources.length` seq scan is still in the trace above. It
  needs an owner-run `CREATE INDEX CONCURRENTLY` (or just a deploy, which runs the migration).
  Unrelated pre-existing reds: `syncDeltaConvergence.test.js` 2/7 (imports only sync-manager →
  yjs-store/sync-scope/type-utils; nothing this work touches).
- 2026-09-22 — **Trigram index applied to live `dms3`** with owner permission: 106 schemas,
  `CREATE INDEX CONCURRENTLY` (no write lock), 0 invalid, 17 MB on the biggest table, live query
  123 ms → 1.219 ms. `/cenrep` first card **947-1005 ms → 726-735 ms**, FCP → ~496 ms,
  `sources.length` 120 ms → 20 ms.
- 2026-09-22 — **Index added to the startup SQL, not just the migration** (owner request):
  `db/sql/dms/dms.sql` (fresh shared `dms.data_items`) and `db/table-resolver.js`
  `buildCreateTableSQL` (fresh per-app table in split mode), each in its own `DO ... EXCEPTION`
  block so a database that cannot install pg_trgm still gets its table with a warning.
  **Restricted to `data_items` content tables** — the same builder creates split dataset-row tables
  (`data_items__{type}`) holding millions of rows with ONE constant `type` value, where a trigram
  index indexes nothing and taxes every bulk insert. Generated DDL verified against `dms3` in a
  rolled-back transaction (runs, idempotent, correct indexes).
- 2026-09-22 — Note for whoever measures next: `.env` now points at `npmrdsv5/dev2` and `dist/` is an
  npmrdsv5 build, so the MNY harness builds to `dist-mny/` (`vite build --outDir dist-mny`) and is
  served with `vite preview --outDir dist-mny`. Pre-existing red in `test:splitting`
  (`resolveTable` naming assertion) is unrelated — both table-resolver hunks here are inside
  `buildCreateTableSQL`.
