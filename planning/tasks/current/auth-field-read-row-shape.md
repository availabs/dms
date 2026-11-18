# Auth: a field-level read judges the reply's projection, not the stored row

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** built · **Release:** commit — uncommitted · **Created by:** amuro@albany.edu · **Edited by:** —

## Found

2026-11-17, on the tenant hub (`.env-hub`, `mny.localhost:5555`), during the SSR rich-text sweep
([ssr-lexical-view-html.md](./ssr-lexical-view-html.md)). Logged out, only 7 of the 159 published pages of
`MitigateNY_2025` (pattern 985070) were readable: the top-level ones. Every page with a nav parent came back as
`no-access` on every field, so the server render picked a different page for its URL and the client redirected to
sign-in. The pattern grants `public: view-page`, and a logged-out read of a page's whole `data` was allowed for all
164 pages: the grants were fine.

## Cause

The page list asks for single fields (`data ->> 'title'`, `data ->> 'parent'`, …). `controller.getDataById` returns
each one at the top level of the row (`data ->> 'parent' as "parent"`), and the read gate (`dataByIdResponse`)
passes that row to `authorize()`. Two things go wrong:

1. **Name collision.** `owners.js wrap()` copies `r.parent` from the row it is handed. In the walk, `parent` means
   "the row above me, already loaded"; only `externalRow` (pgEnv sources and views) sets it. A page's nav parent
   (`data.parent`, an id string) landed in that slot, `ruleFor` read `"1009704".data.authRules`, threw, and
   `authorize` turned the throw into a denial ("lookup failed: Cannot read properties of undefined (reading
   'authRules')"). Pages with an empty `parent` skipped the walk, hence exactly the top-level ones.
2. **Auth fields missing.** A projection has no `data`, so `wrap()` gives the row `data: {}`. The walk then can't see
   the row's own grants (`authPermissions`; the page rule is `['ancestor:pattern', 'self']`), its stamped ancestry
   (`parent_id`) or a stamped vocabulary. A page narrowing its own access was judged on its pattern alone when read
   field by field.

Nothing here is page-specific: any row kind read field by field had the same shape problem.

## Fix

1. **`owners.js wrap()` never takes `parent` from a caller's row** (`parent: null`). A database row never arrives
   with its parent loaded; the walk finds it from `data.parent_id` or the type path.
2. **The read gate judges the stored row's auth fields, not the reply's projection, without reading the whole
   `data` column.** `owners.js` exports `AUTH_DATA_KEYS`: the keys the walk reads off a row's `data`
   (`authPermissions`, `auth_permissions`, `parent_id`, `authVocabulary`). The by-id routes add those to the
   projection when `data` itself isn't requested, and `dataByIdResponse` hands `authorize()` a subject built only
   from `id`, `app`, `type` and those keys. Only those small values travel back to Node; the sections and other
   large content stay out. When the request already includes `data`, the gate uses it and fetches nothing extra.

## Files

- [x] `dms-server/src/routes/auth/owners.js` — `wrap()` drops caller `parent`; export `AUTH_DATA_KEYS`
- [x] `dms-server/src/routes/dms/dms.route.js` — `readAtts(atts)` (requested + `type` + the auth keys as
  `data ->> 'key'` unless `data` is requested) in both by-id routes; `authSubject(row, app)` builds
  `{ id, app, type, data }` from the stored `data` or the auth keys, and `dataByIdResponse` judges that
- [x] `dms-server/tests/test-field-read-auth.js` (new) — anonymous field reads of a child page; a page narrowing itself
- [x] `dms-server/package.json` — the test joins `npm test`

## Testing checklist

- [x] New test: logged out, a child page (nav `parent` set) read field by field is allowed under a public pattern
- [x] New test: a page with its own `view: false` grants is refused field by field, as it is when `data` is read.
  Without the fix 3 of its 6 checks fail (child refused; the narrowed page's title readable field by field)
- [x] `npm test` passes; `test-data-auth` 66/66, `test-read-auth` 30/30, `test-auth-permissions` 17/17,
  `test-auth-platform` 14/14, `test-auth-snapshot-reload` 6/6
- [ ] `test-pattern-stub`: 25 passed, 3 failed — the **same 3 fail without this change** (admin pattern row read
  anonymously, "Deleters", "ungranted user still blocked"); pre-existing, not touched here
- [x] Hub copy on port 5556 (same `.env-hub`, this code): logged out, a field read of all 164 `MitigateNY_2025`
  pages refuses 0 (the running 5555 server, old code: 155)
- [x] The hub on 5555 restarted with it (2026-11-17): logged out, 0 of 164 pages refused; the page lists in
  server-rendered HTML carry no `no-access` rows
