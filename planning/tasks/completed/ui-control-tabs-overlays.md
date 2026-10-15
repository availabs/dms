# UI controls — tabs ink + modal / dialog / drawer check

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** done · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** ssangdod@albany.edu

Part of [ui-control-consistency-audit.md](./ui-control-consistency-audit.md), the hub. Owner 2026-10-14: other UI
elements must look the same before [ui-raw-html-to-ui-components.md](../current/ui-raw-html-to-ui-components.md); run in
parallel agents ("go ahead, run multiple agents to parallel work on next steps").

## Objective

Owner 10/13: tabs ink in the default theme (`Tabs.theme.jsx` default selected is still cobalt). Then check Modal / Dialog / Drawer against spec batch 2 ("Modal and drawer") and fix gaps; project themes frozen.

Rules: only the default theme changes; project themes keep their look via `src/themes/_legacy/ui.js` (verify
with the HEAD-baseline pixel diff on MNY / TNY v2 / landbank); no className looks (activeStyle only); mirror
real changes into `design_system_v6/scripts/`.

## Progress

### 2026-10-14 — agent E

**Tabs**
- `Tabs.theme.jsx` styles[0] → spec: ink active tab (`aria-selected` ink border + text + medium), `TAB_BAR`
  (inset-shadow rule, `overflow-x-auto overflow-y-hidden`, tabs `flex-none`), and the tab row ON TOP
  (`tabGroup` `flex flex-col-reverse`; DOM is panels → tabs) with a content-sized panel (was `h-screen`,
  which pushed the row below the viewport — same bug `editDrawerLegacy` documents). No page renders style 0
  today (drawer = `editDrawer`, metadata = `compact`, map editor = `panel`); seen in the theme editor
  preview. Pre-v6 frozen in `_legacy/ui.js` `tabs` (MNY / WCDB define their own `tabs`).
- Datasets source page tabs (`sourcePage.theme.js` `tabActive`, agent B's area, one Edit): cobalt → ink.
  Project themes already freeze `tabActive` in `_legacy/datasets.js` (TNY v2 has its own yellow).
  `tabNav` stays `flex-wrap` (deliberate 10/07 choice: no scroll bar) — not the spec's sideways scroll.
- Already ink, untouched: drawer `editDrawer` tabs, `compact`, PageTemplatePicker tabs.

**Modal / Dialog / Drawer**
- `Modal.jsx`: the inline overlay / scroller / positioner classes → theme keys `overlay` / `scroller` /
  `positioner` (values unchanged).
- `Modal` `'wide'` (map editor pickers, TNY report / graph / route-tag pickers): `bg-white shadow-xl` → panel
  tokens + rule border + drag shadow (was white in dark mode). Pre-v6 frozen whole in `_legacy/ui.js`
  `modal` (WCDB defines its own `'wide'`).
- New `Modal` `'large'` (default panel at `max-w-2xl`).
- `Drawer.theme.jsx`: panel `shadow-lg` → drag shadow; close button gets `cursor-pointer` (inventory: no
  pointer), ink hover + focus ring. `_legacy/ui.js` `drawer` freezes panel + old close button (+ pointer).
- Dialog / DialogActions / DeleteModal / Popup: already on tokens, no colour gaps. Spec MODAL has head /
  body / foot sections; `UI.Modal` has a single padded panel — structure left as is (callers compose).

**className → activeStyle on UI.Modal (3 callers)**
- [x] `ExternalVersionControls.jsx` PM tiles modal: `className={t.pmTilesModalPanel}` ('max-w-2xl') →
      `activeStyle={t.pmTilesModalStyle}` ('large'; legacy `''`).
- [x] (2026-10-14, owner: "drop the red border") `MetadataComp/RenderField.jsx:184`, `:480`: `className={t.deleteModalBorder}` — '' in the default,
      `border border-red-500` on project themes (legacy + TNY v1). Needs a project-derived style (theme's own
      panel + red border), like `withLegacyUi`'s DERIVED for buttons. Not swapped; Modal not locked yet.

**Verified:** source page tabs ink light + dark (HEAD cobalt); MNY / TNY v2 / landbank source page —
tab rows identical to HEAD (only diffs = other agents' overview table work); theme editor Tabs preview
(tabs on top, ink). Add-pattern + add-user modals render as HEAD (diffs only in the page behind / field
widths from agent C). Not live-checked: `'wide'` / `'large'` (map editor picker / DAMA PM tiles — not
reachable on test data), drawer shadow on a page edit, 390px tab bar (overflow-y hidden by class).
Build OK; eslint = HEAD on all 9 touched files. Mockups already draw ink tabs / drag-shadow drawer — no mirror.

**Open questions**
- `deleteModalBorder` swap needs a DERIVED modal style per project theme (or drop the red border).
- Spec's sideways-scrolling source tab bar vs the current `flex-wrap` (owner chose wrap on 10/07).
- Catalog rail active row is still cobalt-soft (`datasetsList` `sidebarItemActive`, agent B's area); spec
  says ink.

### 2026-10-14 — owner decisions + Modal lock (agent E, resumed)

- Owner: **"drop the red border"**. `className={t.deleteModalBorder}` removed from both `RenderField.jsx`
  Modals (delete column / remove primary key); key deleted from `metadataComp.theme.js`, `_legacy/datasets.js`
  and TNY v1 `transportny/theme.js`. Those modals are the plain `UI.Modal` on every theme.
- **`Modal.jsx` LOCKED:** no `className` prop; the panel is `theme.panel` of `theme.modal[activeStyle]` only.
  No caller passes className (checked JSX + the one spread caller, PM tiles: open-state props only). No blockers.
- Owner: source tab bar stays `flex-wrap`; catalog rail active row left as is (no change requested).
- Verified on `/…/internal_source/4/metadata` → "remove column" / "delete": default panel unchanged; MNY /
  TNY v2 / landbank panel class strings equal HEAD minus `border border-red-500` (computed border: red 1px →
  none / the theme's rule). Build OK; eslint = HEAD (Modal.jsx one fewer).

### 2026-10-14 — main session: two Modal className callers the lock missed

- Found while answering the owner ("when you lock classname, you also remove it from props?"): two callers still
  passed `className` to Modal after the lock, so their look was silently dropped in the default theme:
  GIS map settings modal (`Map.jsx`, `max-w-3xl! text-left`) and the datasets create-download modal
  (`ExternalVersionControls.jsx`, `max-w-2xl`, plus a dead `themeOptions`). Fixed with named styles: new Modal
  `'settings'` (default panel, max-w-3xl, text-left) via `gisMap.settingsModalStyle: 'settings'`, and
  `'large'` via `externalVersionControls.createModalStyle`. Keys `settingsModalPanel` / `createModalPanel`
  removed (library + `_legacy/datasets.js`; legacy keeps `settingsModalStyle: 'wide'`, `createModalStyle: ''`
  = the panels project themes rendered before). Not live-verified: the GIS map page errors on the test data;
  build OK. A source scan finds no caller passing className to Button / Pill / Input / Textarea / Modal now.

### 2026-10-14 — external (DAMA) Delete version → UI.Button roles (owner: "yes")

- Owner: "delete version button doesn't center its text" / "internal and external delete version buttons look
  different. which one is correct?" → the internal one (v6 `dangerBtn`, = Delete Download `dangerFull`).
- `LineageControls.jsx` `DeleteVersionButton`: trigger → `UI.Button` `dangerFull` + trash icon (`verDeleteIcon` /
  `verDeleteIconClass`); inline confirm Cancel → `action`, confirm → `dangerSolid`. Keys `verDeleteBtn` /
  `verDeleteConfirm` / `verDeleteCancel` removed (library + TNY v2). Dialog text keys on tokens; old gray / red
  text frozen in `_legacy/datasets.js` `sourceOverview`. Project themes' buttons follow their own roles
  ("normalise", owner-approved): MNY / TNY now match their own Delete Download.
- Verified live on /data*/source/2/version/3: default (light + dark) identical classes to Delete Download,
  centred; MNY / TNY v2 show their danger button; confirm dialog checked. Build OK, lint = HEAD.

### 2026-10-15 — closed

All done and committed (library `ffc7566f`). Tabs ink, Modal locked, the two missed Modal `className` callers on
named styles, external Delete version on `UI.Button` roles. Owner kept the source tab bar `flex-wrap` and the
catalog rail active row as is.
