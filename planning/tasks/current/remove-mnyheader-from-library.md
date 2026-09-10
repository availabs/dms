# Delete `mnyHeader` from the library — it now ships with the mny theme

**Topic:** patterns/page — ComponentRegistry · **Status:** READY, blocked only on a pre-flight ·
**Raised:** 2026-09-09

Step 2 of work item A in
[`planning/mitigateny/tasks/current/mny-lhmp-home-live-build.md`](../../../../../planning/mitigateny/tasks/current/mny-lhmp-home-live-build.md).
**Step 1 is done and live**: the component has been copied to `src/themes/mny/components/mnyHeader/`
and registered through `theme.pageComponents` under the unchanged key `"Header: MNY Data"`. Because
`componentRegistry.js` seeds from the built-ins and then `Object.assign`s the theme's entries, the
theme copy already wins and the library copy is dead code that still ships.

Verified 2026-09-09 on a local Vite server against `county_template`: the theme copy is the one
rendering (the DOM carries the theme copy's corrected wrapper class, not the library's).

## Why it should not be in the library

`Header: MNY Data` is brand-specific code sitting in `@availabs/dms` because it predates
theme-provided components. Its `consts.js` is the giveaway: `overlayImageOptions` /
`insetImageOptions` are lists of **mny asset paths** shipped inside the shared library.

## What to delete

- `src/patterns/page/components/sections/components/ComponentRegistry/mnyHeader/`
  (`config.js`, `consts.js`, `mnyHeaderDataDriven.jsx`)
- `ComponentRegistry/index.jsx` line 9 — `import MnyHeaderDataDriven from "./mnyHeader/config";`
- `ComponentRegistry/index.jsx` line 32 — the `"Header: MNY Data": MnyHeaderDataDriven,` entry
- `ComponentRegistry/index.jsx` line 5 — the commented-out `// //import MNYHeader from './mnyHeader';`

## ⚠ Pre-flight before deleting

**Confirm no other app uses the key.** The library is shared with TransportNY, Landbank, WCDB and
Tessera, and a grep only proves no other *theme* references it — it cannot see live section data in
other apps. Query each app's patterns for components whose stored `element-type` is
`Header: MNY Data` before deleting.

Within MitigateNY the count is known: **142 live components** across the four county patterns —
`county_template` 1300890: 35, `suffolk_draft` 2249247: 35, `schenectady_draft` 2304223: 36,
`delaware_draft` 2323808: 36 (from `src/themes/mny/design/reports/county-template-qa-t6-fetchmode.csv`).
All 142 are served by the theme copy now.

Also note `transportNY/src/modules/dms/` **vendors its own copy** of this library, synced from
dms-template (root `CLAUDE.md`), so the deletion reaches TransportNY at the next sync.

## ⚠ The registry key must not change

The key is **`"Header: MNY Data"`** and that exact string is the stored `element-type` on those 142
components. Note the mismatch that already exists and must be preserved: the registry **key** is
`Header: MNY Data` while the config's internal **`name`** is `'Header: MNY'`. Keep both as they are.

## Note: the overflow fix already landed in the theme copy

`mnyHeaderDataDriven.jsx:113`'s `overlay: 'full'` variant set `lg:w-[1440px]` on its inner wrapper,
so every MNY page using a full-overlay header scrolled sideways at any viewport between 1024px and
1440px (measured: `scrollWidth` 1440 in a 1024 viewport). The theme copy now uses
`w-full lg:max-w-[1440px]` — identical at 1440, correct below it, and the same shape the inset
variant on line 135 already used. **The library copy still carries the bug**, which is one more
reason to delete rather than leave it.

## Testing Checklist

- [ ] Other-app pre-flight done: no live `element-type` of `Header: MNY Data` outside MitigateNY
- [ ] Folder and both `index.jsx` lines removed (plus the stale comment on line 5)
- [ ] All 142 MitigateNY components still render — sweep the four county patterns
- [ ] Submodule commit (the user owns this)
