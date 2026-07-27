# Card create-defaults: `defaultFrom` — derive a field from another field of the new row

## Objective

Let an add-new Card form stamp derived fields at create time, config-only. Driver:
the Control Room's Page-QA add-ticket modal prefills `page_key` (usePageParams) but
not `surface`/`page_route`, so modal-created tickets render with a blank site pill
and blank page on sitemgmt/tickets until the next cr_sync denorm pass.

## Design (BC)

New optional column-config key consumed by `applyCreateDefaults` (getData.js),
checked after `defaultValue` and before `defaultFn`:

```js
{ name: "surface",    selectOnly: true, defaultFrom: { column: "page_key", split: ":", index: 0 } }
{ name: "page_route", selectOnly: true, defaultFrom: { column: "page_key", split: ":", index: 1, prefix: "/" } }
```

- `column` — source field of the in-progress new row (present because usePageParams/
  form fields populate `newItem` before defaults run).
- `split` + `index` — optional split of the source string.
- `prefix` — optional literal prepended to the result.
- Skips (leaves empty for sync/hygiene backstops) when the source field is empty.

Like all create defaults it only fills EMPTY fields — BC, additive.

## Files

- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/getData.js` — applyCreateDefaults
- consumer: `src/themes/transportny/qa_skills/tools/builds/build_cr_page.mjs` (modal config, outside this submodule)

## Testing

- [x] unit: derive with split/index/prefix; copy without split; empty source → untouched (tests/getData.createDefaultFrom.test.js)
- [x] live (draft route): Page-QA modal ticket carries surface + page_route at create; view route pending owner publish

## Follow-up

- Expose `defaultFrom` in Card.config column controls so authors can set it from the toolbar (JSON-only for now).

## Status

- [x] Tests written (failing first — 2/6 fail pre-impl, BC cases pass)
- [x] Implemented (getData.js applyCreateDefaults; suite 9 files / 213 tests green)
- [x] Live-verified 2026-07-21 on the DRAFT sitemgmt/page modal: created ticket carries
      surface=tsmo2, page_route=/congestion_v2. NOTE: the control room is used via the
      VIEW route (published sections) — the change is staged in the draft; owner publish
      of sitemgmt/page (2185886) makes it live. Same for the tickets-page page_disp
      fallback (2185867).
