# pattern-filter-sync — full coverage (published scope, pageFilters, clearKeys)

## Objective

Make one `sync-filters` run leave **no trace of the source pattern's filter values** in a freshly
duplicated pattern. Driven by the MitigateNY county rollout
(`planning/mitigateny/tasks/current/county-site-mass-deployment.md`), where the Hamilton pilot
showed 111 of 1,771 draft sections still carrying Sullivan's `36105` after a clean sync, plus every
published section untouched.

All four changes are **opt-in and backward compatible** — every new field defaults to today's
behaviour, so the existing "Sync Pattern Filters" button is unaffected.

## Background

v1 (`planning/tasks/completed/pattern-filter-sync.md`) deliberately scoped itself to
`draft_sections` (Decision 2) and to three filter representations. That is right for the button's
original job — reconciling a *live* pattern whose pages get published individually. It is wrong for
a **freshly duplicated** pattern, where nothing has been published yet in the copy and the published
`sections` rows are verbatim clones of the source's.

## Gaps found by the Hamilton pilot (2026-09-10)

| Gap | Evidence | Fix |
|---|---|---|
| **Published sections never touched** | 354 published sections still `36105`; sync reported only draft counts | `scope` option |
| **`symbology.pageFilters[]` not walked** | 43 sections. Shape is `symbologies[id].symbology.pageFilters = [{ searchKey, values }]` — a **fourth** representation, sibling to `layers[].dynamic-filters`, keyed `searchKey` (not `searchParamKey`/`column_name`) | new patcher in `filter-leaf-walk.js` |
| **No way to CLEAR a key** | 100 `geoid_juris` leaves (all `usePageFilters:true`) still point at a Sullivan *town* (`3610506310`). A fresh county has no equivalent jurisdiction, and `applyPageFilters`' rule — "a fully-emptied substitution keeps the saved value" — deliberately preserves them | `clearKeys` option |
| **Stale request memos** | ~276 `dataRequest` / `lastDataRequest` echoes retain the old `filterGroups`. Derived state the dataWrapper overwrites on its next fetch, so harmless at runtime — but they dominate any grep for the old value and make verification unreadable | `dropRequestCache` option |
| **`dynamic-filters[].defaultValue` not mirrored** | A static map's `values` and `defaultValue` must agree or the page-filter sync wipes the value on load | patch both |

## API

`POST /dama-admin/dms/:appType/sync-filters` body gains four optional fields:

```jsonc
{
  "patternId": 2491695,
  "filterGroupKey": "*",
  "scope": "both",              // 'draft' (default, = today) | 'published' | 'both'
  "clearKeys": ["geoid_juris"], // searchKeys whose leaves are EMPTIED rather than substituted
  "dropRequestCache": true      // delete dataRequest/lastDataRequest from patched sections
}
```

`clearKeys` wins over substitution when a key appears in both the group and the list.

## Design notes

- **`scope` picks ref arrays, nothing else.** Published and draft sections are *different rows*
  (verified on the Hamilton copy: 1,757 published / 1,771 draft, **0 shared**), so patching both is
  two independent passes over disjoint row sets — no risk of double-writing a row, and Tier-2
  recompute cost simply doubles.
- **`scope: 'published'` writes rows that are live immediately.** Draft-only was a safety property;
  callers opting into `'both'` are stating that the copy has no meaningful published content yet.
  The pattern-level `has_changes` bookkeeping still only makes sense for drafts, so it stays keyed
  to the draft pass.
- **`clearKeys` is explicit rather than "empty value means clear".** Overloading an empty value
  would silently invert `applyPageFilters`' documented rule for every existing caller.
- **`dropRequestCache` deletes rather than rewrites.** Reconstructing a valid `dataRequest` server-
  side would duplicate the client's request-building logic — a mirror we would have to keep in sync
  forever. Deleting is safe: the dataWrapper treats a missing memo as a cache miss.

## Plan

- [x] `filter-leaf-walk.js`: `patchSymbologyPageFilters`, `defaultValue` mirroring, `clearKeys`
- [x] `pattern-filter-sync.js`: `scope`, `clearKeys`, `dropRequestCache` threaded into the worker
- [x] Re-verified against the MNY county template + a real duplicate
- [ ] Client: expose `scope` on the pattern admin's Sync button (currently draft-only from the UI)
- [ ] Tests

## Gotchas

- **A deployed dms-server can be far behind this source.** `dmsserver.availabs.org` accepted
  `sync-filters` (route present) but did not patch Map `dynamic-filters` at all, while the same
  section patched correctly against local source. Verify which build is answering before concluding
  a representation is unhandled.
