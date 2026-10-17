# UI controls — the spec page and the mockup re-skin (2026-10-13)

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** done · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** shaunak.sangdod@gmail.com, ssangdod@albany.edu

Part of [ui-control-consistency-audit.md](./ui-control-consistency-audit.md). Reference record; the hub has the
current status.

The spec is `src/themes/tessera/design_system_v6/pages/ui-controls.html` (generator
`scripts/ui_controls.py`; mockup-only class strings in `scripts/controls.py`). The library keeps its
own copies of the strings in each component's `.theme.js` (owner: no shared controls.js).

- Generated datasets / page mockups: `ds_common` / `page_common` buttons, switch and segmented
  control now come from `controls.py` (`BTN_PRIMARY` = ink). Controls drawn in cobalt became ink:
  - pagination's current page, the catalog rail's active row, the catalog "show filtered" toggle;
  - permission tags and checkboxes, the "+ group / + person" links;
  - section-menu actions, chips and checks; the drawer tabs (ink, as live);
  - segmented controls (graph count / dollars, schedule presets, history, metadata);
  - the site side nav active row (P2);
  - the per-row Download → action (one primary per region); input focus → ink.
- Hand-written `admin-*.html` + `login.html`:
  - ink: primary buttons, the admin side nav active row (P2), the active filter chips, switches,
    checkboxes, input focus, the pages-tree selected row, the user-menu editor's segment / picker /
    select states;
  - permission and user-group chips → tags;
  - "3 attributes" → count; activity badges → r4.
- `design-system/components.html`:
  - the Button card is now the named set (links to ui-controls.html);
  - focus ring, the switch and MultiSelect selection are ink; MultiSelect chips → tags;
  - pagination's active page is ink.
- Kept cobalt on purpose: links in prose, breadcrumbs, logo marks, avatars, chart bars, progress,
  info callouts, the running status, pattern-type pills (P3), and source / catalog tabs (live tabs
  are cobalt; "keep as is").
- `check.mjs`: all generated pages + admin + components clean.

**Owner, later 2026-10-13:**
- **Tabs → ink** in the default theme: "the default theme should use ink for them". They had been
  left on my keep list without a reason. The spec page now has a Tabs section
  (`controls.py` `TAB` / `TAB_ON` / `TAB_BAR`, which scrolls sideways on a phone). In the mockups the
  source and catalog tab bars + the old catalog's tabs are ink; the drawer tabs were already ink live.
- **Group 1 (kept blue on my own call), owner: "follow your suggestions; info callouts can be
  neutral":**
  - links in text stay cobalt;
  - the current breadcrumb item → ink;
  - avatars → neutral (well, ink initial);
  - progress bars + spinner stay cobalt (activity, like running);
  - info callouts → neutral.
  Applied in the generated + admin mockups.
- **Group 2 (never inventoried) → spec batch 2** on ui-controls.html, sections Fields, Menus and
  popovers, Modal and drawer, Pagination and breadcrumbs, and Empty / loading / avatars / callouts.
  Constants are in `controls.py` under "batch 2".
  - **Field height → 32px** (owner 2026-10-13: "we can try 32px"), the same as buttons. Today's 42px
    comes from `ui/components/Input.theme.js` (`input` / `textarea`: `px-3 py-2.5 text-sm` + 1px
    border). `MultiSelect.theme.js`'s 'input' trigger copies it (`pl-3 pr-7 py-2.5`; its compact style
    is `min-h-9`). `metadataComp.theme.js` `btnInline*` / `addFieldBtn` are `min-h-[42px]` only to
    match. Port: Input / textarea / MultiSelect triggers → 32px with ink focus (Input also focuses
    cobalt + a ring today); the metadata inline buttons become the normal action button. The
    "btnInline h42" exception is dropped.
  - Polish noted, not done: the skeleton is faint on a light cell; the tooltip (board) is
    low-contrast in dark.
- **Group 3 (walk gaps):**
  - forms pattern: skipped (owner);
  - dark-mode walk of 46 page states: no new hardcoded colours beyond the known three (Switch,
    Table-tab ToggleControl, upstream's version delete + its modal); the `#000000` text hits are
    wrappers whose text sets its own colour;
  - schedule / runs: NOT reachable on the test data. Those tabs register only for loader-type
    sources; on the test CSV source they fall back to Overview, so they're still unwalked (mockup
    `datasets-schedule.html` exists);
  - section menu: opened live (real hover). The action row is blue Pill chips and the Type value is a
    boxed chip. Both are now on the spec (row icons; plain pencil value).
- `check.mjs`: all generated + admin + ui-controls + components clean.

**Rule for the port (owner 2026-10-13): "other themes shouldn't change, only default."** Every
library change lands as the library default (v6) only; each project theme keeps its current look via
the `_legacy/*.js` freezes (`withLegacyUi` / `withLegacyPages` / `withLegacyDatasets`). Verify with
the HEAD-baseline pixel diff on MNY / TNY / landbank before calling a step done.
- Tabs fix (owner: "tabs show a vertical scroll"): `TAB_BAR` drew the rule with the `-mb-px`
  underline trick inside `overflow-x-auto`, which forces `overflow-y: auto`. It now draws the rule as an
  inset shadow + `overflow-y-hidden`, and tabs are `flex-none`. Measured: no vertical overflow at 1440
  or 390; only a horizontal scroll at 390, which is intended.

### 2026-10-15 — closed

Spec page and mockup re-skin done. The polish noted above (faint skeleton on a light cell, low-contrast
tooltip in dark) is carried in [ui-raw-html-to-ui-components.md](../completed/ui-raw-html-to-ui-components.md)
"Carried over".
