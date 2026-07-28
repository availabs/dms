# Pattern duplicate — auto-incrementing copy names

## Objective

Duplicating a pattern always suffixed `_copy` with no collision handling. Duplicating
the same pattern (or a pattern whose `_copy` sibling already existed) a second time
produced two pattern records with the identical `type` string (`{slug}_copy`) —
not just a rejected name, but two patterns aliasing the same page/component
namespace, since pages are keyed off `{pattern_instance}|page`.

## Root cause

Three duplicate-trigger call sites, two different bugs:

- `patternEditor/default/settings.jsx` `handleDuplicate` — **no collision check at
  all**. Always computed `${value.name}_copy` and went straight to the expensive
  server-side `/duplicate` page/section-copy task, then `apiUpdate`.
- `editSite.jsx` row-action button and modal duplicate button — both inline-duplicated
  the same naive `${row.name}_copy` construction (no shared logic), and only
  `addNewValue`'s pre-existing `existingSlugs` check caught a collision — but only
  *after* the expensive server-side `/duplicate` fetch had already run, wasting the
  work and leaving orphaned duplicated pages/sections server-side before aborting.

**Follow-up (same session, user live-tested and found both flows still broken):**

- `editSite.jsx` required a manual page refresh to see a just-duplicated pattern —
  a real staleness that the first pass's theoretical trace missed. Root cause:
  `duplicate()`/`addNewValue()`'s `onSubmit(newData)` → `apiUpdate` fires without
  being awaited end-to-end, so `isDuplicating` resets well before the write settles;
  and separately, `wrapper.jsx`'s `apiUpdate` does an optimistic
  `setItem(draft => merge(draft, dataSnapshot))` using a bare `{ref, id}` stub for
  the just-created pattern (never resolved to `{type, base_url, name}`), which
  `getSiblingSlugs()` then filters out (`getInstance(undefined) || undefined.replace(...)`
  → falsy). The real resolved row only lands once the backgrounded `revalidate()`
  → loader round-trip completes.
- `settings.jsx`'s `loadSitePatterns` (below) always returned `_copy` only, never
  incrementing, because its ad hoc `format: 'admin+pattern'` string used the literal
  placeholder app name instead of the real site app. `admin.format.js`'s
  `patternAdminFormat` also hardcodes `format: 'admin+pattern'`, but that's a
  template — `siteConfig.jsx:69-71` (`adminConfig`) rewrites every `dms-format`
  attribute's `format` string to `` `${app}+${attr.format.split('+')[1]}` `` when
  building the live site format object. My hand-rolled config never went through
  that substitution, so the `subApp` used for the by-id Falcor lookup
  (`proecessNewData.js`'s `loadDmsFormats`, `dataByApp` branch) pointed at the wrong
  app namespace and every sibling resolution silently came back empty.

Given both bugs trace back to "don't trust locally-held state/config after a
mutation, fetch fresh" (user's explicit direction), both call sites now do a
live re-fetch of the sibling list immediately before computing the candidate name:

- `editSite.jsx` adds `getFreshSiblingSlugs()`, threading `apiLoad` down from
  `SiteEdit` (already provided to every `EditWrapper`-rendered component per
  `dms-manager/wrapper.jsx:147`, just not previously destructured/passed through
  this component chain) and reusing the **live** `format` prop already flowing
  through this page (already correctly app-substituted by `adminConfig`, since
  it's the same object driving the page's correct initial render) — no need to
  reconstruct or guess a format string. Both duplicate buttons now call
  `await getFreshSiblingSlugs()` instead of the local-state `getSiblingSlugs()`.
  Each duplicate button's `onClick` also now sets `isDuplicating` synchronously at
  the very start (before the async fetch), shrinking — not the goal here, but a
  cheap adjacent hardening — the pre-existing double-click race window.
  `addNewValue`'s own `getSiblingSlugs()`-based check (manual "Add site" flow) is
  untouched.
- `settings.jsx`'s `loadSitePatterns` format string fixed from the literal
  `'admin+pattern'` placeholder to `` `${app}+pattern` ``, matching the exact
  substitution `adminConfig` performs on the real format object.

## Design decision

Numbered suffixes (`_copy`, `_copy_2`, `_copy_3`, ...) instead of a UUID suffix —
`base_url` is a live, user-facing URL segment, so a UUID (`docs_copy_a3f9d21b`)
would be a poor authoring experience. Per explicit user direction: **no stripping
of an existing `_copy` suffix before appending** — duplicating an already-duplicated
pattern intentionally stacks (`foo_copy_copy`) rather than collapsing back into the
same numbered family, since the second copy may diverge from the first.

## Changes

- **`utils/type-utils.js`** — added `nextAvailableCopyName(baseName, existingSlugs)`:
  given the source name and the set of sibling slugs/instance-names already in use,
  returns `{ name, slug, suffix }` for the first unused `_copy`/`_copy_2`/... — pure,
  reused by both call sites below (identical logic, only the sibling-fetch differs).
- **`editSite.jsx`** — extracted the existing inline `existingSlugs` computation
  (previously only inside `addNewValue`) into a `getSiblingSlugs()` closure over
  `value`, reused by:
  - the row-action duplicate button
  - the modal duplicate button
  Both now call `nextAvailableCopyName(name, getSiblingSlugs())` before building
  `dataToCopy`, and use the returned `suffix` consistently for `base_url` as well
  as `name`/`slug`. `addNewValue`'s own collision check is untouched — it remains
  the safety net for the manual "Add site" flow.
- **`patternEditor/default/settings.jsx`** — added `loadSitePatterns(apiLoad, app,
  siteType)`, a read-only fetch that expands the site's `patterns` attribute
  (`{ key: 'patterns', type: 'dms-format', isArray: true, format: `${app}+pattern` }`)
  to get full sibling `name`/`base_url`/`type` records. Deliberately kept separate
  from the existing `loadSiteData()` — that helper intentionally returns bare
  `{ref, id}` patterns because its result is reused verbatim as a write payload in
  `handleDelete` and in the "add new pattern ref to site" step of `handleDuplicate`;
  changing its shape would have altered what gets written back to the site record.
  In `handleDuplicate`, the sibling list (self excluded) now feeds
  `nextAvailableCopyName` **before** the server-side `/duplicate` task is queued,
  so a collision no longer wastes that call.

## Files changed

- `src/dms/packages/dms/src/utils/type-utils.js`
- `src/dms/packages/dms/src/patterns/admin/pages/editSite.jsx`
- `src/dms/packages/dms/src/patterns/admin/pages/patternEditor/default/settings.jsx`

## Testing checklist

- [x] Lint: no new errors introduced on touched lines (`npx eslint` on all four
      files — pre-existing prop-types/unused-var noise only, unrelated to this change;
      new `apiLoad` prop shows the same undeclared-prop warning every other prop in
      this file already has, since no PropTypes exist here).
- [x] User live-tested the first pass and reported both remaining bugs (stale
      `editSite.jsx` list, always-`_copy`-only `settings.jsx`) — root-caused and
      fixed, see Root cause follow-up above.
- [ ] Live UI re-verification pending (post-fix): duplicate a pattern three times
      from `editSite.jsx` (row action) without refreshing, confirm `_copy`,
      `_copy_2`, `_copy_3`.
- [ ] Live UI re-verification pending: duplicate a pattern from the single-pattern
      `settings.jsx` page when a `_copy` sibling already exists, confirm `_copy_2`.
- [ ] Live UI re-verification pending: duplicate an already-duplicated pattern
      (e.g. `foo_copy`) and confirm it stacks to `foo_copy_copy`.
