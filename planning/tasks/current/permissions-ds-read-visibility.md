# Datasets: enforce `view-sources` / `view-source` on reads (catalog, source, views, data, tiles)

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** next · **Created by:** ssangdod@albany.edu · **Edited by:** —

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

## Proposed changes

- [ ] Phase 1: hide `auth_permissions` (and secret-bearing `statistics` keys) from non-editors in `sources.byId`.
- [ ] Phase 2: per-row filtering for catalog lists and `sources.byId`/`views.*` by `view-source` (with the pattern's
  `view-sources` as the entry gate).
- [ ] Phase 3: data and tile reads, per the page-section decision above.
- [ ] Client: `DatasetsList` filters nothing today (`getSources`, `DatasetsList/index.jsx:75+`); once the server
  filters, it needs nothing more, but the hidden-bucket toggle (`:456`) moves to a real permission (client task).

## Testing checklist

- [ ] A source with `public: []` and no grant for user X is absent from X's catalog, counts and lineage, and its
  `byId` returns nothing; an editor still sees it.
- [ ] Published pages that chart sources render unchanged for anonymous viewers (inventory those pages first).
- [ ] Switching users in one tab doesn't show the previous user's rows.
