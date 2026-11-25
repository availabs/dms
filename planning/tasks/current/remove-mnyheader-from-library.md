# The page pattern's section catalog: built-ins only; MNY's header, footer and PDF Generator ship with the mny theme

**Initiatives:** [mny_county_template_r2](../../../../../planning/initiatives/mny_county_template_r2.md) · **Status:** built (2026-11-25, not committed; widened by the owner from the mnyHeader deletion to the whole catalog; the other-app pre-flight is the owner's to run, below) · **Created by:** amuro@albany.edu · **Edited by:** amuro@albany.edu

**Topic:** patterns/page — ComponentRegistry · **Status:** READY, blocked only on a pre-flight ·
**Raised:** 2026-09-09

Step 2 of work item A in
[`planning/mitigateny/tasks/completed/mny-lhmp-home-live-build.md`](../../../../../planning/mitigateny/tasks/completed/mny-lhmp-home-live-build.md).
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

> **Re-linked 2026-10-13** from `mny_county_sites` (closed at the initiative review) to `mny_county_template_r2`.

## Widened and built (owner, 2026-11-25; not committed)

**Owner:** "Header: default and Item should be deleted and Header: Mny, Footer: mny and pdf generator should all be
moved as components into the mny theme, so the only default system components are Rich Text, Card, Spreadsheet,
Filter and Graph, and the mapeditor pattern can add Map." For the PDF Generator the owner chose **MNY theme only**
over keeping it in the library as an opt-in (TransportNY's themev2 has PDF Generator colours, `tnyPdfExport`, from
2026-10-31; they now style nothing unless a TransportNY theme registers the section).

**The library's catalog** (`ComponentRegistry/index.jsx`): `lexical` (Rich Text), Card, Spreadsheet, Filter, Graph,
plus the hidden "AVL Graph" alias (the same component, for sections saved under the old name). Map comes from the
map editor's `pageComponents`, as before.

**Deleted from the library:** `header.jsx` + `header.config.js` ("Header: Default Header"), the `Item` stub, the
`mnyHeader/` folder (the theme's copy, registered since 09-09, is newer: islands `serverStatic`, plan facts, the
county note, WebP heroes), and the `pages.pdfExport` key of the page pattern's default theme.

**Moved into `src/themes/mny/components/`, keys unchanged** and registered in the mny theme's `pageComponents`:
- `footer/` ("Footer: MNY Footer": `footer.jsx`, `footer.config.js`)
- `pdfGenerator/` ("PDFGenerator": `ExportPdf.jsx`, `.config.js`, `.theme.js`, and the non-UI half `pdfExport.js` with its
  test, from `patterns/page/components/saveAsPDF/`). The component still spreads its own default theme under the
  theme's `pages.pdfExport` (MNY's colours), as before.

**The core no longer names these types:**
- A page's Header setting inserts a Rich Text section (`lexical`) where it inserted "Header: Default Header"
  (`editFunctions.jsx` `toggleSidebar`, `settingsPane.jsx`, `sectionGroupsPane.jsx`).
- When an old page gets section groups, its Footer setting adds the section type the theme names in
  `pages.footerSectionType` (mny: "Footer: MNY Footer"); a theme that names none gets the footer group empty
  (`pages/_utils/index.js` `sectionsEditBackill`, `sectionsBackill`). Documented in `extension-points.md`.

**Docs:** `extension-points.md`, `skills/creating-page-section-components.md` (the minimal reference is now
`FilterComponent.config.js`), `dms-server/docs/api.md` (the PDF export's client), the hero-WebP task's note.

**Checked:** library suite 973 pass, the same 15 known failures in 7 files (the PDF helper's 7 tests moved out
and pass from the theme: `npx vitest run src/themes/mny/components/pdfGenerator/pdfExport.test.js`); eslint on the
changed files: only unused-variable findings the moved files already had.

### The pre-flight, for the owner (a read-only database census was refused to the agent)

Which saved sections use the removed or moved types, per app and pattern, with the theme each pattern selects.
Read only; counts only:

    node scratchpad/component-census/census.cjs dms-mercury-3
    node scratchpad/component-census/census.cjs hub-dms

What to look for:
- any `Header: Default Header` or `Item` row: those sections now render as an unknown type;
- any `Header: MNY Data`, `Footer: MNY Footer` or `PDFGenerator` row on a pattern whose theme is not `mnyv1`: those
  render as an unknown type too (TransportNY's PDF Generator, if it has any).
