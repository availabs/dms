# Datasets: enforce `view-sources` / `view-source` on reads (catalog, source, views, data, tiles)

**Initiatives:** [dms_permissions_move](../../../../../planning/initiatives/dms_permissions_move.md) (primary), [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** built + verified (2026-10-26), uncommitted; `enforce` waits for each site's would-deny log · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

Part of [auth-levels-to-permissions.md](./auth-levels-to-permissions.md) (hub). Depends on
[permissions-server-source-auth-core.md](./permissions-server-source-auth-core.md) and on defect A of
[auth-permission-chain-and-unguarded-writes.md](./auth-permission-chain-and-unguarded-writes.md) (route checks
must merge down the chain, or the client `view-sources` gate means "logged in"). **Do this last of the datasets
tasks**: it's the one most likely to blank pages that work today.

## Objective

The decision of 2026-09-30 (auth-permission-chain, "Decision") is that each source's grants decide who can read
it, inheriting the pattern's when it has none. No server read path checks that today, and the client checks it
nowhere except the outer route.

## Read paths with no check (all `dms-server/src/routes/uda/uda.route.js` unless noted)

- Catalog: `sources.length` `:41`, `sources.byIndex` `:64`, `sourcesAll.length` `:97`, `sourcesAll.byIndex` `:120`
- Source: `sources.byId[][attr]` get `:152` (also returns `auth_permissions` to anyone), `pkeyInfo` `:229`,
  source lineage `:257`
- Views: `views.length` `:278`, `views.byIndex` `:305`, `views.byId` `:337`, view lineage `:403`,
  `views.bySourceCategory` `:424`
- Data: `viewsById.options.length` `:451`, `options.dataByIndex` `:479`, `options.byIndex` `:514`,
  `viewsById.dataById` `:783`; `uda.colorDomain.route.js:6`
- Tiles: `dama/upload/tiles.rest.js:300`
- DMS internal source/view/data rows via `dms.data.*` (`routes/dms/dms.route.js` gates only pattern and page rows)
- Sync bootstrap/delta return internal sources too: [sync-per-user-permission-filtering.md](./sync-per-user-permission-filtering.md)

## The hard parts

- **Page sections read sources.** A public page showing a chart of a source the viewer can't `view-source` would
  go blank. Decide: does a page's `view-page` imply read of the sources its sections bind (the author published it),
  or must the source be readable too? Recommendation: sections read through the page's grant, i.e. the server
  checks "can view a page that binds this view", or authors grant `public: ['view-source']` on published sources.
  This needs a product decision before any data-read check ships.
- **Lists are per row.** `sources.length` / `byIndex` must count and index only readable sources, consistently,
  or pagination breaks. Cache per user.
- **Falcor caching:** the client cache and the server's 5-minute user cache must not leak one user's rows to the
  next (logout must clear).
- `auth_permissions` and `statistics` (holds now_playing's webhook secret) should be returned only to
  `edit-source-permissions` / `update-source` holders.

## Owner decisions (2026-10-26)

1. **Reads go behind a mode flag, log first.** Every phase (catalog, source / view metadata, data
   rows, tiles) sits behind `DMS_READ_AUTH_MODE` = `legacy` | `log` | `enforce`, default `log`.
   - Under `log` nothing is refused, and each would-deny is logged with the source and user.
   - That shows on prod which pages would blank, so their grants can be fixed before `enforce`.
   - This answers "the hard parts": page sections read through the source's own grants. Authors
     grant `public: ['view-source']` where a public page needs it, and the log finds every such
     source first.
2. **Grant lists.** Holders of `edit-source-permissions` / `update-source` get the full
   `auth_permissions`. Everyone else gets only the entries naming them or their groups, plus a
   placeholder entry, so the lenient rule doesn't read a trimmed list as "no grants set".
3. **Secrets in `statistics`** (`webhook_secret`, `*_secret`, `*_token`) are dropped for readers
   without `update-source`, but only if no feature breaks. Checked: nothing on the client reads them.
   now_playing's server reads the secret from the database, and its admin page gets the webhook URL
   from REST.

## Findings (2026-10-26)

- **Hole (corrected):** `GET /dama-admin/:pgEnv/now_playing/streams/:id` already needs a login and
  `update-source` (task 9). Under `log` / `legacy`, though, a signed-in non-updater passes with a
  would-deny line and gets `webhook_url` and the raw `statistics`, secret included. Fix: those callers
  get the status without the secret (new plugin helper `holdsSourcePermission`). The public never
  calls this route: WCDB's pages read the playlist through page sections (uda data routes).
- **Public pages and private defaults.** `createDamaSource` makes new sources private (creator `*`,
  `public: []`). A public page charting such a source (WCDB's now_playing playlist, very likely)
  would go blank under `enforce` unless the source grants `public: ['view-source']`. `log` lists
  these first. **Do not set `enforce` on a site before its would-deny log is clean.**

## Plan

- `routes/uda/readAuth.js`:
  - The mode.
  - A per-env grant snapshot, cached for a short time: each source's own grants, its pattern's
    grants (internal sources), and view → source.
  - `canRead(user, env, sourceId)`, on the write path's rule: `view-source`, or any source
    permission that implies reading it (`update-source`, `edit-source-permissions`, `*`…), pattern ⊕
    source, lenient, `${app} Admin`.
  - Mode-aware gates for one source, one view and a list of ids, with deduplicated would-deny logging.
- External sources: first planned as the source's own grants only (Falcor GETs named no pattern).
  Owner, 2026-10-26: the datasets pattern names itself on its Falcor requests and external sources
  inherit its grants (see Built). Internal sources: pattern ⊕ source, as for writes.
- Routes:
  - catalog `sources.length` / `byIndex` and `sourcesAll.*` (filtered under `enforce`);
  - `sources.byId` attributes, `pkeyInfo`, `rulesInfo`, `lineage`, `views.length` / `byIndex`;
  - `views.byId` and its lineage, `views.bySourceCategory`;
  - data: `viewsById.options.*`, `dataById`, `colorDomain`;
  - tiles (REST).
  A refused read returns null values, not errors.
- Redaction in `sources.byId`: grant lists under `enforce`; secrets under `log` and `enforce`.
- now_playing `GET /streams/:id`: `webhook_url` only for `update-source`.
- Not in scope here: internal source rows read through `dms.data.*`, and sync bootstrap / delta
  ([sync-per-user-permission-filtering.md](./sync-per-user-permission-filtering.md)).

## Built (2026-10-26)

- **`routes/uda/readAuth.js`:**
  - `readMode()` (`DMS_READ_AUTH_MODE`, default `log`).
  - Per-env grant snapshots, kept 30 s and refreshed once when a view is missing.
  - `allowSourceRead` / `allowViewRead` / `filterReadableSources`, mode-aware, with would-deny lines
    deduplicated per user / source / kind for ten minutes.
  - `holdsOnSource`, the bare decision; `redactSourceRow` / `trimGrants` / `dropSecrets`.
  - `READ_PERMISSIONS`: every source permission implies reading.
- **`uda.route.js` reads:**
  - `sources.length` / `byIndex` and `sourcesAll.*`: under `enforce`, from the readable catalog, so
    length and index agree. Under `log`, the catalog pass only logs.
  - `sources.byId` (refused → null attributes; redacted), `pkeyInfo`, `rulesInfo`, `lineage`,
    `views.length` / `byIndex`.
  - `views.byId` and its lineage; `views.bySourceCategory` filtered per row.
  - `viewsById.options.length` / `dataByIndex` / `byIndex`, and `dataById`.
- **`uda.colorDomain.route.js`:** a refused read gets an empty domain.
- **`dama/tiles/tiles.rest.js`:** the view (and a joined view) is judged, but **log only** (owner, 2026-10-26):
  tiles are exempt from `enforce` (`logOnly`, `readMode({ logOnly })`), so would-denies log as kind `tiles` and
  no tile is refused. See "Tiles (deferred)" below.
- **now_playing `GET /streams/:id`:** `webhook_url` and `statistics.webhook_secret` only for
  `update-source` holders, through the new plugin helper `holdsSourcePermission(req, sourceId, perms)`
  (`dama/datatypes/auth.js`, wired in through `pluginHelpers`).
- **Docs:** `dama/CLAUDE.md` gains a "Reads" section and the helper row; `data-types/CLAUDE.md` the
  auth note; the `index.js` helper comment.
- **External sources inherit the named datasets pattern's grants** (owner, 2026-10-26):
  - Client: `tagFalcorRequests(falcor, pattern)` (`utils/authedFetch.js`) wraps the Falcor data source's
    `onBeforeRequest` to add `dms_pattern=<app>/<id>` to every request URL. `render/dmsPageFactory.jsx`
    applies it when the pattern's config has `requestPattern`, which only the datasets `siteConfig.jsx`
    sets. Each pattern route has its own Falcor model, so page sections and other patterns send nothing.
  - Server: `/graph` passes `requestPatternRef(req)` to the router (`router.patternRef`, `routes/index.js`).
    `readAuth.js` reads the named pattern through `sourceAuth.readNamedPattern` (now exported), cached as
    long as a snapshot. For external sources the decision is pattern ⊕ source and `${app} Admin` of the
    named pattern's app, as `decideSource` does for writes. Internal sources ignore the name.
  - Also threaded through `colorDomain`, `redactSourceRow` and `holdsSourcePermission` (now_playing).
  - Trust: as for writes (owner, 2026-10-20), any existing datasets pattern is accepted. A pattern-to-pgEnv
    check isn't possible: nothing in the db links them (pgEnvs are a client build setting).
  - **Placeholder (owner, 2026-10-26):** the client's pattern can't be trusted blindly. Kept because it's
    better than no inheritance; see "Open (owner)".

## Results (2026-10-26)

- **`tests/test-read-auth.js` (new, 25):**
  - trim and secrets;
  - external sources: open / private / public / implied permissions / views / unknown view;
  - internal sources: pattern inheritance, `[]` revocation, `${app} Admin`, stray source;
  - named pattern: lends its grants to external sources; a page pattern, an unknown id or no name lends
    none; a source `[]` revokes; internal sources ignore it; a Falcor read with `router.patternRef`;
  - modes: log once, legacy silent, tiles `logOnly` under `enforce`; snapshot refresh;
  - Falcor routes: catalog under enforce and under log, null attributes, redaction, data length and
    `views.byId`.
- **`src/utils/authedFetch.test.js` (new, 3, vitest):** `withPatternParam`; `tagFalcorRequests` tags URLs and
  keeps the source's own token hook.
- **Regression green:** uda 144, uda-auth 28, source-auth 50, upload-auth 37, data-auth 49, graph,
  workflow, delete-cascade 16, change-history 22, pattern-stub 28; plugin-auth sweep 36/36.
- **Live, on the rig** (:3458), catalog over HTTP. Both rig sources are creator-only plus Downloaders.
  - **`log`:** anon, viewer@ and admin@ all list `[1, 2]`, and the log holds one would-deny line per
    source for anon and viewer@.
  - **`enforce`:** anon and viewer@ list `[]`; downloader@ (`download-source`, implied) and admin@ list
    `[1, 2]`.
  - **The datasets client-gates flow** under `enforce`: viewer@ sees no DAMA tabs; downloader@ is
    unchanged.
  - **Named pattern, `enforce`** (rig pattern 4 temporarily granting Viewers `view-source`, restored after):
    over HTTP, viewer@ lists `[]` without `dms_pattern` and both sources with `dms_pattern=v6test/4`; an
    unknown pattern id lends nothing; mgr@ (no grant) lists `[]` either way. In the browser
    (`flows/flow-readpattern.mjs`) every uda GET from `/datasets` carries `dms_pattern=v6test/4`, none from
    the page pattern; viewer@ gets the source 1 tabs (overview | table | map), mgr@ none.
  - Rig left in the default mode (`log`).
- **Found, not this task's:** on `/datasets/source/2/admin`, downloader@ hits two unhandled page errors
  (a thrown Falcor error array). Same under `legacy` read mode, so it predates this task. Look at it
  with the task 10 client gates.

## Tiles (deferred: owner, 2026-10-26)

**Decision:** vector tiles are exempt from `enforce` for now, and can be moved under it later.
MapLibre fetches tiles itself without `Authorization`, so the tile route can only judge an anonymous
reader. Enforcing would blank every map of a non-public source, editors' included.

- **Cost of the exemption:** anyone who knows a view id (small integers) can read a private source's
  geometry and any column (`cols=`) through its tiles.
- **`.pmtiles` files** are served as static files and never pass the tile route at all; moving them
  behind a checked route is its own piece of work.
- **To move tiles under `enforce` later** (about a day's work):
  - Server: `GET /dama-admin/tile-token` returns a signed token naming the user (about an hour,
    tiles only, not the session token). The tile route reads a valid `tt=` as that user, otherwise anon.
  - Client: `AvlMap` (`ui/components/map/avl-map.jsx`) adds `tt=` to our own tile URLs in MapLibre's
    `transformRequest`, reading the current token from a ref, renewed before it expires. A URL
    change only, so no CORS preflight. Every map screen (map editor, the page Map section, the
    datasets Map tab) goes through `AvlMap`, and saved symbology keeps clean URLs, so the map
    editor pattern needs no change.
  - Drop `logOnly` from the two `allowViewRead` calls in `tiles.rest.js`.
  - Costs: signed-in users' tile URLs differ per user, so no shared browser cache, and tiles on
    screen re-download at each renewal. Anon URLs stay as today.
  - **Trigger:** a site's would-deny log shows kind `tiles` lines for a source that must stay private.

## Open (owner)

- **The client names the pattern; the server can't verify it** (owner, 2026-10-26: placeholder until a
  solution is found). With two datasets patterns granting different permissions, a caller can name
  whichever is looser, on reads and on writes alike (sourceAuth.js `patternRef`, since 2026-10-20). Today
  the server only checks the name is an existing datasets pattern. Directions to weigh:
  - Store the link server-side: the pattern row records its pgEnv(s), so only patterns that serve the
    env count, and limit those to the request's site / subdomain.
  - When several patterns still qualify, take their intersection (or require the source's own grants)
    instead of the named one.
  - Or drop inheritance for external sources: grants go on the source only, set by the grant migration
    (task 18) from each pattern's grants.

- **Not covered here (owner: fine, 2026-10-26):** internal source rows read through `dms.data.*`, and
  sync bootstrap / delta ([sync-per-user-permission-filtering.md](./sync-per-user-permission-filtering.md)).
  Both still return internal sources (and their `auth_permissions`) to anyone, so until that task
  lands `enforce` is a real boundary for external sources only.

## Proposed changes

- [x] Phase 1: hide `auth_permissions` (and secret-bearing `statistics` keys) from non-editors in `sources.byId`.
- [x] Phase 2: per-row filtering for catalog lists and `sources.byId`/`views.*` by `view-source` (with the pattern's
  `view-sources` as the entry gate).
- [x] Phase 3: data and tile reads, per the page-section decision above.
- [ ] Client: `DatasetsList` filters nothing today (`getSources`, `DatasetsList/index.jsx:75+`); once the server
  filters, it needs nothing more, but the hidden-bucket toggle (`:456`) moves to a real permission (client task).

## Testing checklist

- [ ] A source with `public: []` and no grant for user X is absent from X's catalog, counts and lineage, and its
  `byId` returns nothing; an editor still sees it.
- [ ] Published pages that chart sources render unchanged for anonymous viewers (inventory those pages first).
- [ ] Switching users in one tab doesn't show the previous user's rows.
