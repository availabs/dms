# QA on MitigateNY: collapsible site cards, and a look that belongs to the site

**Initiatives:** [dms_qa_ticketing](../../../../../planning/initiatives/dms_qa_ticketing.md) (primary), [mny_sow_deliverables](../../../../../planning/initiatives/mny_sow_deliverables.md) · **Status:** doing · **Created by:** rdubowsky@albany.edu · **Edited by:** —

Two follow-ups from [`qa-pattern-type.md`](./qa-pattern-type.md) (Phases 6–7, "Follow-ups (owner, 2026-10-07)"),
picked by the owner on 2026-10-07. The ticket system is a generic library feature, and MitigateNY is its first real
install: build for MNY's needs, but every mechanism stays generic (library), and only MNY's values (colours, fonts,
card look) live in MNY's theme folder.

**Status: Part 1 BUILT, owner reviewed live, committed `eec8278c`. Part 2 BUILT 2026-10-07 and checked on `qa_test` (uncommitted); MNY switch waits on deploy.**

**Owner answers 2026-10-07:** site cards start collapsed; the header menu is QA's own pages; drop Search from QA's
nav (precedent: `/actions/dashboard` has none).

## Glossary

- **Install:** a `qa` pattern row. MNY's is 2824062 `QA`, at `/qa`.
- **Site card:** on the Overview, one block per covered site: its name, stage bar and tickets bar, then a table of
  its pages. Each card is one section group (a "band").
- **Chrome:** the site's frame around a page: header bar with logo and menus, page background, content card.

## Where things stand (checked 2026-10-07)

- **The Overview is one long scroll on MNY.** Four site cards list 71 + 6 + 160 + 44 pages, 50 rows a page each.
- **`/qa` on MNY renders on the library default theme.** The install row stores MNY's nav settings (Logo, Oswald nav
  title, UserMenu) but `selectedTheme` is null, so the Theme-tab step (task doc steps, "Theme tab") looks half done.
  Result: a generic star-and-"Admin" logo, beige library palette, IBM Plex type. Even `/list` (admin) shows the MNY
  logo, through `theme.admin.logo`.
- **Selecting `mnyv1` alone isn't enough (expected, not yet verified live):**
  - MNY's top nav floats over the page, so its content band pads `lg:pt-[118px]`. QA's bands (`qa_header`,
    `qa_content`) have no such clearance, so the QA header would sit under the nav.
  - Every QA colour is a shared `--t-*` token, and `mnyv1` defines none, so QA keeps the library palette.
  - The shared type classes (`.t-proseSM`, `.t-metaXS`, …, `ui/defaultTheme.js:146-160`) hard-code IBM Plex. They
    read no font variable, so no theme setting moves them.
  - QA's titles (`h4`, `h5`) would already follow MNY: `mnyv1`'s are `font-display`.
- **Tried live 2026-10-07 13:55 EDT (owner):** `mnyv1` selected on 2824062's Theme tab looked bad, and a probe
  capture logged 18 page errors. Reverted at 13:56 (theme dropdown back to `default`, then save; re-read by SQL:
  `selectedTheme` = `default`, nav settings unchanged). So the install must stay on `default` until the skin is
  built and checked somewhere else first (see "Testing without touching the live install").
  The install's access is now `AVAIL`, user 1 and `mitigat-ny-prod Admin`, with no `DHSES`. That was the owner's own
  change, not a side effect.
- **The override path already exists:** `withQaTheme` (`patterns/qa/qa.theme.js`) lets a site's same-name styles,
  text keys and flat keys win over QA's.
- **The stored nav lists `{type: "Search"}`**, a name no widget has (the registered one is `SearchButton`), so it renders
  an empty spacer.

## Part 1: collapsible site cards (library; any page can use it)

**What you'll see:** each site card on the Overview opens collapsed: name, stage bar and tickets bar, with a small
chevron at the card's top right. Clicking it shows the pages table; clicking again hides it.

**How (generic: a section-group option, not QA-only code):**
- Two new section-group settings in the page editor's Section Groups pane, beside "Is Modal":
  - **Collapsible** (toggle).
  - **Starts collapsed** (toggle, shown when Collapsible is on).
- One new section setting: **Show when collapsed.** Sections with it stay visible; the rest hide.
- `SectionGroup` keeps the open/closed state and renders the chevron button (themeable:
  `pages.sectionGroup` keys `collapseToggle`, `collapseIcon`). A group with no "show when collapsed" section gets a
  header row with its display name instead, so a plain collapsible band still has something to click.
- In edit mode every section shows, so authors can see what they're editing.
- Not remembered between visits in v1: each visit starts at the group's default.
- **Gotcha to handle:** the Section Groups pane rebuilds group objects from a fixed field list when you drag
  (`sectionGroupsPane.jsx` ~267 and ~315). New fields must be added there, or a drag silently drops them.

**QA's use of it (`patterns/qa/pages/overview.js`):**
- Each site group: Collapsible on, Starts collapsed on. The title and tickets sections: Show when collapsed.
- The card outline moves from per-section borders onto the band (a new `qa_site` layout-group style in
  `qa.theme.js`). Today the bottom edge and rounded corners belong to the pages table, so hiding the table would
  leave the header box open at the bottom.

**Rejected:** making only the pages table collapsible (a section-level toggle with its own title row). The click
target would be a row in the middle of the card, not the card.

**Tests:** collapsed filtering in `sectionArray`, the pane keeping the new fields through a drag, and QA's Overview
groups carrying the settings.

**Built 2026-10-07 (committed by the owner, `eec8278c`):**
- [x] Library: `group.collapsible` / `group.startCollapsed` + `section.showWhenCollapsed`. `sectionGroup.jsx` holds
  the state and renders the toggle (corner button, or a header row when no section stays visible);
  `sectionArray.jsx` View keeps hidden sections mounted under the `hidden` attribute.
  Theme keys `collapseToggle`, `collapseHeader`, `collapseHeaderTitle`, `collapseIcon` (`CaretDown`),
  `collapseIconClass`, `collapseIconCollapsed` in `sectionGroup.theme.js`.
- [x] Editor: "Collapsible" and "Starts Collapsed" in the Section Groups pane (both fields carried through a drag);
  "Show When Collapsed" in the section's settings menu, only in a collapsible band; a blue "Shown When Collapsed"
  pill in edit mode.
- [x] QA: site groups collapsible + start collapsed on the new `qa_site` band style (the band draws the card);
  title and tickets sections `showWhenCollapsed`; the pages table keeps only a top rule.
- [x] Tests: `tests/sectionGroupCollapsible.test.jsx` (5, SSR, section stubbed) and one Overview test in
  `qaOverviewPages.test.js`. QA + new: 154/154.
- [x] Live check on MNY `/qa`, owner reviewed 2026-10-07 ("looks good"). Fixes from that review:
  - **Card width:** the band-drawn card first spanned the whole band, wider than the other boxes. `qa_site`'s card is
    now the section grid's width less its 16px gutters (`w-[calc(100%-2rem)] max-w-[988px]`, centred), and the card's
    sections set no gutter of their own. Measured: the card and "How delivery works" both span 744–1732px.
  - **Preloaded tables (owner):** hidden sections first unmounted, so a site's table fetched only when opened. They
    now stay mounted under the `hidden` attribute (Tailwind's base CSS hides `[hidden]`). The table's row count was
    confirmed loaded before opening; the owner judged the result live.
  - **10 rows (owner: Overview only):** the site tables' `pageSize` 50 → 10. Tickets (25) and Page QA (50, 25)
    unchanged.
- **Caveat for other pages:** a section that sizes itself on mount (a map) inside a band that starts collapsed mounts
  at zero size. Nothing uses that yet.
- [ ] Editor check: the pane's two switches and the section switch save, and survive a drag.
- **Found, not fixed:** the pane's drag rebuild already drops `modalSize` and `railHost` (any field not in its list).

## Part 2: QA looks like part of MitigateNY

**What you'll see on `/qa`:** MNY's floating header with the MitigateNY logo and QA's pages (Overview, Tickets) as
its menu; the topographic grey background; QA's content in one white rounded card, like `/actions/dashboard`;
Oswald headings, Proxima Nova text, MNY's ink/slate palette, pill buttons, amber main action. Severity, status and
stage colours keep their meanings, drawn from MNY's palette.

**Theme structure (owner, 2026-10-07): match the page and datasets patterns.** QA's defaults move into
`patterns/qa/defaultTheme.js`, registered in the library default theme under a `qa` key (as `pages`, `datasets`,
`auth`, `admin` are). QA renders on the install's selected theme (the page/datasets model, not admin's
library-look-plus-one-key). A site customises QA through its theme's `qa` key, listing only differences
(`mnyv1.qa`, in `src/themes/mny/qa.theme.js`). On QA pages, `withQaTheme` still lifts `theme.qa`'s named styles
into the shared components' style lists (Card, bands, pills read only their own keys). Accepted cost, same as
every other pattern: a theme row saved from the admin theme editor stores a copy of `qa`, which then shadows later
library changes to existing QA values. This ships together with MNY's look.

**Steps:**
1. **Library, generic (small):** QA pages render inside a scope marker, `<div class="dms-qa-page contents">` in
   `pages/view.jsx` (`contents`: no box, so layout is unchanged). A host theme can then re-skin QA without touching
   any other page on its site.
2. **MNY theme, new file `src/themes/mny/qa.theme.js`**, imported into `theme.js`:
   - A `fonts` style entry that applies only while a QA page is on screen (`:root:has(.dms-qa-page)`, which also
     reaches pop-up menus rendered outside the page): MNY's palette on the `--t-*` tokens (ink `#2D3E4C`, slate
     `#37576B` as the accent, mid `#6D96AE`, rules `#E0EBF0` / `#C5D7E0`, panel `#F3F8F9`, amber `#EAAD43`), Proxima
     Nova on the prose classes, Oswald on the display classes, and Proxima Nova bold uppercase on the meta classes
     (MNY has no monospace).
   - Same-name overrides of QA's band styles (`qa_header`, `qa_content`, `qa_content_end`, `qa_site`): clear the
     floating nav, and put the page in one white card on the topo background.
   - Same-name text keys for QA's buttons (`qaButton`, `qaButtonPrimary`, `qaButtonSM`) in MNY's pill style, and a
     same-name `qa_list` table style with MNY's table header look.
3. **Owner: select `mnyv1` on the MNY install's Theme tab** (a prod write), after steps 1–2 are deployed, so the
   live page never shows the overlap. In the same save, change the nav's `Search` entry to `SearchButton` or drop it
   (guess: drop it; site search from the QA pages isn't useful).

**Built 2026-10-07 (uncommitted), library part:**
- [x] `patterns/qa/defaultTheme.js`: QA's look as one object (`pageWrapper`, `vars`, `layout`, `styles` keyed by
  name per component, `text`, `components`), built from `qa.theme.js`; registered as `qa` in `ui/defaultTheme.js`.
- [x] `patterns/qa/withQaTheme.js` (moved out of `qa.theme.js`): reads `theme.qa`; adds `qa.layout` to every layout
  style when set.
- [x] `pages/view.jsx`: the page renders inside `<div class="dms-qa-page {qa.pageWrapper}" style={qa.vars}>`; the
  `--qa-*` token block is declared on `:root, .dms-qa-page`, so it resolves against a site's `qa.vars`.
- [x] `.t-*` type classes read `--t-font-display` / `--t-font-prose` / `--t-font-meta`, falling back to today's
  faces (no theme sets them).
- [x] Tests: 3 new in `qaDefaultTheme.test.js`; QA + collapsible 157/157.

**Built 2026-10-07 (uncommitted), MNY part and fixes found testing on `qa_test`:**
- [x] `src/themes/mny/qa.theme.js` (`mnyQaTheme`), set as `mnyv1.qa` in `theme.js`: MNY palette + fonts as `vars`
  (Oswald for display and labels, Proxima Nova for prose), `layout.childWrapper` = one white card under the floating
  nav, MNY title/crumb/route text and pill buttons in `text`. `qa.components` names the same `filterControlCell`,
  `stackedBar` and `dataBar` objects as MNY's general keys (lifted into `MNY_*` consts in `theme.js`, values
  unchanged).
- [x] QA's titles moved from the shared `h4`/`h5` to QA keys `qaPageTitle`/`qaCardTitle` (same classes as the
  library's h4/h5). MNY's own h4/h5 set no size, and a site shouldn't have to change its site-wide headings for QA.
- [x] Every QA band uses the library's section grid (`qaSectionArrayStyles`, `pages.sectionArray` named styles), so
  QA's sizes mean the same on any site (MNY's `'1'` is 9 of 12 columns). Page QA's rail too.
- [x] `qa_list` built on the library's default table style (MNY's default table container drew a dark outline).
- [x] On QA pages `theme.qa` now wins over a site's general keys (styles, text, components); into each named style
  when a site's component uses that shape. `qa.components.input` pins the shared Input's wrapper to the library's: MNY's
  stale input wrapper (white `before:` layer + shadow) drew boxes over QA's edit-in-place fields and hid their values.
- [x] Probed on `qa_test` (install 126 `QA`) with `mnyv1` and with `default`: Overview, Tickets, a ticket, Page QA all
  0 page errors; default theme unchanged. Tests 159/159.
- **Found, not fixed:** the Ticket page logs 14 React warnings (column props such as `customName`, `allowEditInView`
  passed to a DOM element) on both themes. The 18 page errors from the live MNY trial didn't reproduce on `qa_test`.
- **State left:** `qa_test` install 126 stays on `mnyv1` for the owner to view (undo: `dms raw update 126 --data
  '{"theme":{}}'` as the `qa_test` app; backup `scratchpad/qa_test/backup_126_20261007T143641.json`). Root `.env` is
  back on MitigateNY.

**MNY rollout (owner):** commit + client deploy (devmny, mnyprod; no dms-server change), then on MNY's install
2824062 `QA`: Theme tab → `mnyv1` → save, and drop `Search` from its nav (`topNav.rightMenu` → `[UserMenu]`; the
stored entry is the unregistered `Search` name, an empty spacer).

**Checks:** `/qa`, `/qa/tickets`, a ticket and Page QA in Chrome, side by side with `/actions/dashboard`; measure
the nav clearance from the DOM, not a screenshot. `qa_test` (default theme) unchanged, and
`tests/qaDefaultTheme.test.js` plus the QA tests pass.

## Testing without touching the live install

The install row is shared by local dev, devmny.org and mitigateny.org, so it can't sit on `mnyv1` while the skin is
built. Plan: put the `qa_test` install (126 `QA`, the test app) on `mnyv1` and check the skin there, by switching
the app block in the root `.env` to `qa_test` (the running Vite picks it up; owner, 2026-10-07: no second dev
server). Switch `.env` back to MitigateNY afterwards. The MNY install goes to `mnyv1` only after the skin passes
there and is deployed. The 18 page errors seen on the live trial are read first.

## Order

Part 1 first (smaller, standalone), then Part 2. Pause for review between them.
