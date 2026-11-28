# Data sections in view mode load only their own source, not the whole catalogue

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** done (2026-11-27, owner: committed and deployed) · **Created by:** amuro@albany.edu · **Edited by:** amuro@albany.edu

Follow-up 1 from the RSC measurement (`rsc-view-pages.md`, 2026-11-22): the next cheapest page-load win.

## Objective

A data section on a view page should fetch the metadata of the source it is bound to, and nothing else. The
full source catalogue (every source in every env, with column metadata and categories, plus each env's
settings, each source's authority record, and the bound source's version list) is only needed by the
Source / Version pickers, which exist only while a section is being edited.

## Root cause

`dataWrapper/index.jsx` calls `useDataSource({state, setState})` in both `Edit` and `View`. On mount,
`useDataSource` (300 ms debounce):

1. `uda[envs].sources.length`, then per env `sources.byIndex[0..n-1][srcAttributes + row_type + categories]`
   (the full catalogue, `metadata` included for external envs);
2. `uda[externalEnvs].settings` (hidden lifecycle sets);
3. `uda[env].sources.byId[allIds].authority`;
4. once the catalogue arrives: the bound source's `views.length` and `views.byIndex` (and the same for each
   join source).

In the final RSC runs (2026-11-21/22, 84 pages) one of these is the slowest request on 74 pages: about
150–420 ms each, in sequence, after the page has appeared, and every page view repeats them on the server.

What View actually uses from it:

- **The column reconciliation**: when the bound source is found, its fresh fields (columns, `isEditable`,
  `env`, `srcEnv`, name, …) are merged into the section's in-memory `externalSource` (and, with a join, the
  join columns are rebuilt). This changes what View renders (e.g. `allowEdit` reads `externalSource.isEditable`),
  so it must stay.
- **The section menu in view mode** (editors only): the Dataset item's value is the bound source's label from
  `sources`, and the Join item names each join source from `sources`. The Source / Version / join pickers
  themselves are `isEdit`-only.

## Fix

`useDataSource` gets an option `loadCatalogue` (default `true`, so every existing caller is unchanged).
`View` passes `false`. With `loadCatalogue: false`:

- the bound source and the join sources are fetched by id, grouped by env:
  `uda[env].sources.byId[ids][srcAttributes (+ row_type for DMS envs)]`. `sources.byIndex` on the server is a
  `$ref` to `sources.byId`, so the attributes and the per-source read check are the same;
- each row is built with the same mapping as the catalogue (one shared function), so the reconciliation merges
  exactly what it merged before;
- `sources` holds just those rows, so the view-mode menu still shows the Dataset and join names;
- no settings, authority or version requests (picker-only);
- **a saved `srcEnv` the page doesn't list** (a DMS source saved under a datasets pattern that this page dedupes
  by `dmsEnvId`, e.g. MitigateNY's `mny+test` / `mny+test_meta_forms` beside `mny+datasets`; or a since-renamed
  env): the source is looked up by id in every page env of the same kind (DMS or external), first hit wins. The
  catalogue matched by id across all envs, and the server's DMS `sources.byId` reads the row by id within the
  app (`uda.controller.js getSourceById`), so this finds what the catalogue found. Only when the page has no env
  of that kind does it load the full catalogue, as today. (The first build fell back to the catalogue for any
  unknown env; on MitigateNY that was 3 of 5 pages, hence the change.)

Not found by id (deleted, or not readable) → no reconciliation, as when the catalogue didn't list it.

Small known difference: `sources.byIndex` hides the env's hidden source types (`file_upload` by default) and
`byId` doesn't, so a section bound to a `file_upload` source now gets its columns refreshed in view mode, as
it already does in edit mode. That's the intended behaviour anyway.

## Files

- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/useDataSource.js`
- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/index.jsx` (View passes the option)
- `packages/dms/tests/` (unit test with the fake falcor: view mode requests only `byId`, reconciliation identical)

## Checklist

- [x] `loadCatalogue` option + shared row mapping (`toSource`) + by-id fetch (`boundSourcesOf`, `getBoundSources`)
- [x] View passes `loadCatalogue: false`; Edit unchanged
- [x] Unit test `tests/dataWrapperViewBoundSource.test.js` (8): view mode makes only the by-id request and merges
      the same `externalSource` as the catalogue path; join names; unknown env looked up by id; no env of the
      kind → catalogue; deleted source → state untouched; no source → no request. With
      `datasetsLifecycleVisibility.test.js`: 29 pass
- [x] Live check, production build `vsrc` (RSC on) on port 5557, headless loads counting graph requests: before
      (build `rscsi2`) the MitigateNY drought page made `sources.length` 1, `byIndex` 3, `authority` 3, `settings` 2,
      `views.length` 1; after, on MitigateNY drought / energy / snowstorm risk profile, County Template drought /
      jurisdictional annexes, TransportNY npmrds2 / status: no catalogue, settings, authority or views requests,
      only `sources.byId` of the bound sources (1–6 per page), no page errors
- [ ] Edit mode still lists every source: code path unchanged apart from the `toSource` extraction, covered by the
      picker tests; not clicked through live
- [x] Measure (`chain_followups.sh`, 12:18–14:16): A = old build `rscsi2` + the `perf-slow-query-indexes.md`
      indexes (`idx2-rsc-on`, `si-idx2-rsc-on`) on 5556; B = this build (`vsrc-rsc-on`, `si-vsrc-rsc-on`) on 5557.
      This task's effect = B vs A (below)

## Measured (2026-11-22, phase tier, 9 sites signed out + 8 signed in, 84 warm visits, 44 clicks)

`dms perf compare --json` A → B per site (`scratchpad/perf-rsc/logs/followups/*-A-vs-B.txt`):

| | A (old build + indexes) | B (this build) |
|---|---|---|
| data requests, all warm visits | 1,260 | 746 (−41 %) |
| data requests, all clicks | 637 | 523 |
| "Complete" summed over the 84 warm visits | 184.1 s | 173.5 s (−6 %) |
| "Complete" summed over the 44 clicks | 106.7 s | 94.0 s (−12 %) |
| first byte summed over the warm visits | 44.7 s | 44.3 s (unchanged: the catalogue loaded after the page appeared) |

Pages with a data section lose 10–16 requests each (e.g. TransportNY npmrds2 15 → 3 on all five pages, status
14 → 2, freight atlas home 14 → 4, MitigateNY home 15 → 4, drought 17 → 7). Clear wins where the catalogue sat on
the critical path: MitigateNY home 3.23 → 2.28 s (click 1.70 s → 0.86 s), energy 4.85 → 3.68 s, snowstorm risk
profile 5.02 → 3.07 s, freight atlas home 2.68 → 2.10 s; signed in, County Template jurisdictional annexes click
7.00 → 2.73 s and extreme heat click 14.5 → 5.6 s. Pages without data sections: no change beyond noise. A few
single pages moved slower within run-to-run noise (e.g. MitigateNY glossary, `/status/status` signed in, whose
first byte is the transcom count, see `perf-slow-query-indexes.md`); no page got more requests.
