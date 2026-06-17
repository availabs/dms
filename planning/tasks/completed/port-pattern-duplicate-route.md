# Port the pattern "duplicate" route to dms-server (new type model)

> Origin: duplicating the freight-atlas pattern (1411749) via the pattern editor's **Duplicate** button
> creates an empty pattern — none of the original's pages come across.

## Root cause
The Duplicate button posts to **`POST {API_HOST}/dama-admin/dms/{app}+{instance}/duplicate`**
(`patterns/admin/components/patternList.jsx` `duplicate()`, also `patterns/admin/pages/editSite.jsx`), but
**that route is not implemented on dms-server.** `dama/upload/index.js` registers `/dms/:appType/publish`
and `/dms/:appType/validate` only — **no `/duplicate`**. The deep-clone existed solely in the legacy
**avail-falcor** server (`dama/routes/data_types/dms/duplicate/{duplicate.js,update.js}` → `cloneType()`)
and was never ported in the avail-falcor → dms-server move.

Two defects:
1. **Missing endpoint** — the request 404s; the server-side copy of pages + sections never runs.
2. **Silent client failure** — `duplicate()` does `await fetch(...)` with **no `res.ok` check**, then calls
   `addNewValue(item)` regardless. So the new pattern row is added client-side (→ a pattern appears) while
   the 404'd deep-copy is invisible. A 404 looks like a partial success.

## Reference (avail-falcor, OLD type model — adapt, don't copy)
`avail-falcor/dama/routes/data_types/dms/duplicate/update.js` `cloneType(origin, destination, format)`:
finds `dms-format` ref columns on the pattern, fetches the referenced rows (pages), re-inserts them under
the new app/type with `data.ref = '{newApp}+{newType}|{origType}'`, builds an old→new id map, then clones
the pattern remapping its ref arrays. **1-level-deep**, ref-array based, keyed on the old `doc_type`/`type`
scheme — does NOT translate directly to the new model.

## New type-model reality (why a re-implementation is needed)
- Pattern row: `type = '{site}|{instance}:pattern'` (e.g. `dev2|freightatlas2:pattern`), instance
  `freightatlas2`, `data.name`.
- Pages: separate rows `type = '{instance}|page'` (e.g. `freightatlas2|page`) — **not** an embedded array on
  the pattern.
- Components/sections: rows `type = '{instance}|component'`.
- Cross-refs: a page's `draft_sections`/`sections` (and `draft_section_groups`) hold `{id, ref}` to its
  components; each section's `data.parent` (JSON string) + `ref` point back at its page. History rows too
  (`{instance}|page-edit` etc.).

## Proposed implementation
- [ ] **Route:** `app.post('/dama-admin/dms/:appType/duplicate', createDuplicateHandler(controller))` in
      `dama/upload/index.js` (sibling to publish/validate). `:appType` = `{app}+{oldInstance}`; body
      `{ newApp, newType }` (newType = new instance slug).
- [ ] **Handler / deep-clone (new model):** in a new `dama/upload/dms-duplicate.js` (or the dms controller):
      1. Clone the **pattern** row → `type='{site}|{newInstance}:pattern'`, `data.name` = new name,
         `data` instance fields updated; insert → new pattern id.
      2. Clone every **page** (`type='{oldInstance}|page'`, same app) → `type='{newInstance}|page'`; collect
         **old→new page-id map**.
      3. Clone every **component** (`type='{oldInstance}|component'`) → `type='{newInstance}|component'`;
         collect **old→new section-id map**.
      4. **Rewrite refs** on the cloned pages: `draft_sections`/`sections`/`draft_section_groups` ids+refs
         via the section-id map (+ `{newApp}+{newInstance}|component` ref strings); on cloned sections:
         `data.parent` (stringified `{id,ref}`) + `ref` via the page-id map.
      5. Decide history handling (clone `*-edit`/history rows or start fresh — fresh is simpler + safe).
      6. Use the dms-server **db adapter** (`db.query`, pg/sqlite) + the type utils
         (`buildType`/`parseRowType`), not raw avail-falcor SQL. Respect split tables (components are not
         `:data`, so they stay in `data_items`).
- [ ] **Client fix:** in `patternList.jsx` + `editSite.jsx` `duplicate()`, check `res.ok` / parse `{err}`
      and surface failures (don't blind-`addNewValue` on a 4xx/5xx). Consider letting the server create the
      pattern row too (so a failed clone doesn't leave a half-made pattern).
- [ ] **Response contract:** return `{ data: ... }` / `{ newPatternId }`; client refreshes the pattern list.

## Files
- `dms-server/src/dama/upload/index.js` (route) + new `dms-server/src/dama/upload/dms-duplicate.js` (handler/clone).
- (maybe) `dms-server/src/routes/dms/dms.controller.js` if the clone belongs with the other DMS data ops.
- `packages/dms/src/patterns/admin/components/patternList.jsx` + `patterns/admin/pages/editSite.jsx` (res.ok).

## Testing checklist
- [ ] Duplicate the freight-atlas pattern (1411749, `freightatlas2`) → new pattern with **all** pages copied,
      each page's sections present and correctly cross-referenced (open `/edit/<slug>` on the new pattern;
      sections render, not blank/ungrouped).
- [ ] New page/section ids are fresh; no ref points back at the original pattern's rows.
- [ ] Duplicate of a pattern with **zero** pages still works (empty but valid).
- [ ] SQLite + Postgres adapters both work; split-table types untouched.
- [ ] Client surfaces a server error instead of silently adding an empty pattern.

## Notes
- Part of the broader avail-falcor → dms-server port (cf. the `## dama` topic). Additive — new route +
  client guard; no change to existing publish/validate.
- Deep-clone is data-touching: develop against a test DB / SQLite first; avoid running unverified clones
  against shared prod pgEnvs.

## Status — IMPLEMENTED & SERVER-VERIFIED (2026-06-10)
- [x] **Route:** `app.post('/dama-admin/dms/:appType/duplicate', createDuplicateHandler(controller))` in
      `dama/upload/index.js`.
- [x] **Handler:** new `dama/upload/dms-duplicate.js` — clones pages + components only (the **pattern row
      is created by the client's `addNewValue`**, so the server intentionally doesn't touch it). Remaps the
      page↔section refs (`draft_sections`/`sections` → new ids + `…|component` ref), section `parent`
      (stringified `{id,ref}` → new page, when present), and `data.id` mirrors; drops `history`. Built on
      the controller (`getRowsByTypes`/`createData`/`setDataById` → split-mode safe), `buildType` for the
      new instance types.
- [x] **Client guard:** `patternList.jsx` + `editSite.jsx` `duplicate()` now check `res.ok`/`body.err` and
      surface failures (no more silent empty pattern).
- [x] **Verified:** cloned `freightatlas2` → **7 pages / 195 components** with matching section counts
      (home 27 · maps_gallery 10 · about_the_plan 15 · …); section types + page→section refs remapped to the
      clone instance; fresh ids; `data.id` mirrors set. (Sections in this DB carry no `parent` field — link
      is via the page's `draft_sections`, which is correctly remapped; `remapParentRef` is a safe no-op when
      absent.) Throwaway test rows deleted.
- **Not done (deliberate / notes):** end-to-end via the **UI** is the user's to confirm (server half proven;
  the client `addNewValue` already created the pattern row before this fix). The duplicated pattern keeps the
  source's `subdomain`/`base_url` (client appends `_copy` to base_url) — adjust to avoid route shadowing.

## Follow-up (2026-06-10, after user UI test)
- **Third client call site found + guarded:** `patterns/admin/pages/patternEditor/default/settings.jsx`
  `handleDuplicate` (the `manage_pattern/:id` page) also calls `/duplicate` with no `res.ok` check — added
  the same guard (alert now includes `API_HOST`). So all three call sites (patternList, editSite,
  patternEditor) are covered.
- **Why the user's UI test came back blank (not a code bug):** the **transportNY** frontend
  (`www.localhost:5174`) reads `API_HOST` from `transportNY/src/config.js` = **`https://dmsserver.availabs.org`
  (production)** — the local override (`http://localhost:3001`) is commented out. The `/duplicate` fix lives
  only on the **local** dms-server (:3001). So the Duplicate hit **prod** (no fix) → 404 → 0 pages; the
  pattern row was still created because prod shares the **`dms-mercury-3`** DB with local (so `freightatlas2_copy`
  / id 2175232 + a stray empty page 2175025 are visible locally). To exercise the fix: point transportNY at
  local (`config.js`), or use the dms-template frontend (`:5173`, already local), or **deploy the dms-server
  change to production**. Leftover blank `freightatlas2_copy` pattern + empty page are in the shared DB —
  clean via UI/CLI when convenient.

## Progress log
- 2026-06-10 — Task created (root cause: missing `/duplicate` route + silent client 404).
- 2026-06-10 — Implemented the route + `dms-duplicate.js` deep-clone + client guards; verified server-side
  against freightatlas2 (7 pages / 195 components, refs remapped) and cleaned up the test rows. Ready for
  UI confirmation.
