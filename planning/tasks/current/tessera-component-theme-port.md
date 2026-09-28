# Port tessera_v6 into the library's own default component themes

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** doing (was: "Current status (2026-09-15) — … NOT started: Phase B") · **Created by:** ssangdod@albany.edu · **Edited by:** —

## Objective

Make "no theme selected" (and every gap any OTHER project's theme leaves unfilled) resolve to
tessera_v6's actual look, by editing the CONTENT of the library's own per-component `.theme.js`
files — not by adding an indirection layer. Per the user: "the way we want to default theme is
update the places where defaultTheme is built from. that should in theory make it so that if no
theme is provided, default theme (tessera) is used" and "that way we don't need the default loader."

This supersedes the loader-registry approach in
[`collect-theme-names-default-sentinel.md`](../completed/collect-theme-names-default-sentinel.md) (reverted) and
[`planning/shared/tasks/completed/tessera-default-theme.md`](../../../../../planning/shared/tasks/completed/tessera-default-theme.md)
(superseded) — both left in place with pointers here, not deleted.

## Current status (2026-09-15) — read this first before resuming

**DONE this session, in order:**
1. Phase A: 24 of 30 UI-primitive `.theme.js` files ported (see "Phase A" section below for the 6
   left untouched and why).
2. Critical fix: `mergeTheme()`'s `fonts`-array index-merge bug (now concatenates) + a new base
   `fonts` entry in `ui/defaultTheme.js` injecting tessera's CSS-variable/type-token layer — without
   this, every ported class would've resolved to nothing for the "no theme" case.
3. Follow-up: `table`/`nestable`/`map`/new-`nestableInHouse` rewritten in `tessera-theme-v6.js` ITSELF
   to match the real component shapes (they'd shared zero real keys with what those components read —
   a tessera-side bug, independent of the port).
4. Dark-mode `ThemeToggle` enabled by default in every project's SideNav (`Layout.theme.jsx`'s
   `sideNav.bottomMenu`), plus `Sun`/`Moon` icons added to the library's own base icon registry (was
   missing, would've rendered a blank button everywhere non-tessera).
5. **Cross-project regression audit + full insulation pass** (triggered by a live MNY-logo regression
   report): found and fixed 2 genuine functional breaks (MNY logo `imgClass`, filters
   `toggleButton`/`toggleIcon` disappearing for MNY/WCDB) plus, per the user's explicit "patch
   everything found" direction, patched every cosmetic silent-dependency gap across all 6 non-tessera
   projects (mny, mny_admin via inheritance, transportny v1, transportny v2, wcdb, avail) — each now
   fully insulated from any future shared-default change. `landbank` confirmed already self-contained.
6. **Recovered a `git stash` data-loss incident**: parallel agents stashing the same working tree
   concurrently silently erased `Layout.theme.jsx`'s edits; reconstructed both, re-verified against
   the full expected file list. See `[[feedback_no_concurrent_git_stash_parallel_agents]]` memory —
   never let parallel agents `git stash` the same tree again.

Final state verified: `npm run build` clean, `npx eslint` across every touched file in the repo shows
only pre-existing, unrelated errors (confirmed via `git show HEAD:<path>` on each, never assumed).

**Note:** after this session's edits, `Layout.theme.jsx`'s `sideNav.bottomMenu` order was adjusted
externally to `[ThemeToggle, UserMenu]` (this task's own edit had it `[UserMenu, ThemeToggle]`) — left
as-is, functionally equivalent, not reverted.

**NOT started:** Phase B (the ~32 `patterns/page`/`datasets`/`auth` pattern-specific component files —
see the Phase B checklist further down, still accurate/unstarted).

**Admin's port — now has its own dedicated task file:**
[`admin-pattern-v6-port.md`](./admin-pattern-v6-port.md) (split out 2026-09-20, per this file's own
earlier note that a task this size needed one). Themes list/edit, Users/Groups/Profile, and — as of
2026-09-20 — the Pattern Editor's Overview/Access pages, sidenav restructure, and a real
access-control bug fix are all done there. Pages/Activity/Data tabs, Create-site flow, and the MNY
admin reskin remain. Read that file, not this section, for current status on admin.

## Live visual verification — DONE 2026-09-16, no regressions found

Ran two local Vite dev servers in turn (only one at a time — running two concurrently hit the OS
`ENOSPC` file-watcher limit) and screenshotted with a throwaway Playwright script
(`scratchpad/_tmp_verify/`, not committed):

1. **`mitigat-ny-prod` (`.env`'s current default, `VITE_API_HOST=https://dmsserver.availabs.org`)** —
   home page (`/`) and an inner content page (`/assess_risk`, reached via a real topnav click, not a
   guessed URL) both render exactly as MNY's own brand — navy/orange palette, correct logo size (the
   `imgClass` fix from the earlier insulation pass holds), cards/pills/buttons all themed correctly, zero
   console errors. This is the specific project with the live logo-regression report from earlier in
   this task — confirmed fixed and stable on a fresh page beyond the one originally reported.
2. **`tessera-test` (env override: `VITE_DMS_APP=tessera-test VITE_DMS_TYPE=test
   VITE_API_HOST=https://tributarylab.com VITE_DAMA_HOST=https://tributarylab.com`)** — home page
   renders cleanly in tessera's own voice (blueprint-grid background, cobalt accent, mono type), zero
   console errors. Confirms the shared-default changes underneath tessera's own explicit theme selection
   are still a no-op for tessera itself, as expected.

Not checked this pass (lower priority, didn't block the above): a page with genuinely NO
`selectedTheme` at all (both pages above belong to projects with their own explicit theme, so neither
actually exercises the tessera-fallback path this whole task targets), and the `ThemeToggle` sidenav
button specifically (`/assess_risk` uses a topnav-only layout with no sidenav visible in this pattern).
If picking this up again, a bare/newly-created pattern with no theme override would be the more direct
test of the actual fallback mechanism.

Dev servers used for this check were stopped afterward; pre-existing long-running dev servers found on
ports 5173/5201/4173 (from prior sessions, dated Aug24/Sep02/Sep15) were left untouched.

## MNY Users/Groups manage-page fix — DONE 2026-09-16

User-reported: on `/auth/manage/users` and `/auth/manage/groups` (MNY), page content started
immediately under the nav card with no clearance, instead of below it. Root cause (confirmed via live
DOM inspection, not guessed): `patterns/auth/siteConfig.jsx`'s `AdminLayout` renders
`<LayoutGroup activeStyle={theme.auth.authPages.manageLayoutGroupStyle}>`, and MNY's `theme.js` topnav
for this context (`topnav.styles[0]`) is a `position:fixed` floating card (out of document flow) —
correct for MNY's public pages too, which compensate via `layoutGroup.styles[1]` ("content",
`lg:pt-[118px]`). But `mny/auth.js`'s `authPages` never set `manageLayoutGroupStyle`, so it fell back
to `layoutGroup.styles[0]` ("default", `pt-2` only) — no clearance under the fixed nav. **Fix**: added
`manageLayoutGroupStyle: "content"` to `src/themes/mny/auth.js`'s `authPages` object (one line, well-
commented). Verified live: re-screenshotted both pages after a dev-server restart (theme edits don't
hot-rebuild reliably) — content now starts correctly below the nav on both. `npx eslint` on the touched
file shows only 2 pre-existing unrelated errors (`React`/`Link` unused imports, present before this
edit). This bug and fix are **unrelated to the tessera port** — pre-existing gap in MNY's own auth
theme, not something Phase A/insulation touched (confirmed via `git diff` showing zero prior changes to
`mny/theme.js`'s topnav/layoutContainer keys).

Checked whether `landbank/theme.js` and `transportny/themev2.js` (the only other two projects with an
`authPages` block) have the same gap: yes, neither sets `manageLayoutGroupStyle`/`manageLayoutStyle`
either — but neither defines a `topnav` style that's `position:fixed` the way MNY's is (their fixed
elements are all left-sidebar SideNav styles, unrelated), so this specific bug is unlikely to reproduce
for them. Not verified live — flagged here in case a future session touches their manage pages.

**Separately flagged, NOT fixed, per explicit user direction ("leave it... even on prod the side nav is
missing")**: the Users/Groups pages' own nav (`manageAuthConfig`'s hardcoded Sites/Themes/Auth menu
array) renders completely empty — confirmed via direct DOM inspection, both before and after the
padding fix above (`centerMenuContainer` and the mobile-menu list both have 0 children client-side).
This is a **pre-existing bug present on the live prod site too**, not introduced by anything this
session touched. Leading hypothesis, not confirmed: `getPatternTheme()`'s per-pattern-row persisted
`theme.layout.options` mechanism (`ui/useTheme.js:136-139` — if the auth pattern's own data row already
has a saved `theme.layout.options`, it wins over the theme file's `topNav.nav`/`.size` entirely) may
have a stale/divergent value on this specific pattern row. Confirming would require CLI/DB access to
the actual pattern row (the CLI hung mid-session against `dmsserver.availabs.org`, unresolved — see
below). User explicitly said not to chase this further this session.

**CLI note**: `dms site tree` against `https://dmsserver.availabs.org` (mitigat-ny-prod) hung
indefinitely mid-session and was killed as a background task — never diagnosed. `dms page
list`/direct screenshotting worked fine over plain HTTP, so this seems CLI/site-tree-specific, not a
general host connectivity issue. **Resolved workaround** (found later same session): wrapping any CLI
call in `timeout 20 ...` avoided the hang entirely and `dms page list` returned instantly — worth doing
by default rather than re-diagnosing the root cause.

## Table dark-mode fix + a real Tailwind dark: wiring bug found — DONE 2026-09-16

User-reported: on the admin "Sites" list page (`/list`, `patterns/admin`), dark mode looked correct
everywhere except the Table and its outer card container. Root cause had **three separate layers**,
all fixed:

1. **`ui/components/table/table.theme.jsx` (shared library) was never actually ported to tessera in
   Phase A** — despite the task file's "Phase A" section listing table as one of the "NOT ported, zero
   name overlap" files, and the later follow-up section explicitly saying tessera's OWN `table` object
   was fixed to unblock a still-outstanding library-file port — that library-file port itself was never
   done. Confirmed by reading the file: still 100% original neutral grays (`bg-white`, `text-gray-600`,
   etc.), zero `var(--t-*)` tokens. **Fixed**: ported its ~65 keys from tessera-theme-v6.js's now-correct
   `table` object (key names already matched 1:1 from the earlier follow-up), substituting `${c.xxx}` →
   literal `var(--t-xxx)` and `${FONT_MONO}/${FONT_SANS}` → `font-mono`/`font-sans`. Also swapped
   `headerCellMenuIcon` `ArrowDown`→`ChevronDown`, matching the same icon substitution already made for
   SideNav/TopNav.
2. **The admin page's own outer card wrapper** (`patterns/admin/siteConfig.theme.js`'s
   `sectionGroupTheme.inner`) hardcoded `bg-white` — a completely separate file from both the table and
   `editSite.theme.js`, and the actual visible "white card" the user meant by "table container that
   packages table, search bar and a sites label." Fixed: `bg-[var(--t-panel)] border border-[var(--t-
   rule)]`.
3. Also ported **`patterns/admin/pages/editSite.theme.js`** (the "Sites" page's own local
   wrapper/header/searchBar/button/modal theme — never fed through `getComponentTheme`, a local
   fallback object) to the same `var(--t-*)` tokens, since it's part of the same always-tessera admin
   surface. Per user direction this was explicitly folded in even though it's technically inside the
   already-deferred "admin's port" scope.
4. **Also fixed MNY's OWN table style** (`src/themes/mny/theme.js`'s `table.styles[0]`, name `"mny"`) —
   per explicit user direction ("make sure it's fixed for default AND mny both"). MNY doesn't use
   tessera's CSS-variable system at all; added plain Tailwind `dark:` classes throughout, matching the
   zinc-based dark palette MNY's OWN theme already establishes elsewhere (e.g. `topnavContent`'s
   `dark:bg-zinc-900`, `navitemName_level_3`'s `dark:text-zinc-300`) — not invented from scratch.

**Real, previously-unknown bug found while verifying the MNY table fix**: `ThemeToggle.jsx` only ever
sets/removes a `data-theme="dark"` **attribute** on `<html>` — it never adds a `.dark` **class**. But
`src/index.css`'s Tailwind config had `@custom-variant dark (&:where(.dark, .dark *));` — keyed to the
class, not the attribute. **This meant every plain `dark:` Tailwind class in the whole codebase was
silently inert**, including all ~50 pre-existing `dark:` usages already in `mny/theme.js` (topnav
dropdowns, submenus, etc.) — they never activated regardless of the toggle. Only `var(--t-*)`
CSS-custom-property-based styling (tessera's own mechanism, keyed directly off `[data-theme="dark"]` in
`_shared.css`) ever actually responded to the toggle — which is exactly why "everything else looked
fine" to the user (everything that looked fine was CSS-variable-based, not `dark:`-based). **Fixed**:
`src/index.css`'s custom-variant now also matches `[data-theme="dark"]` (`@custom-variant dark
(&:where(.dark, .dark *, [data-theme="dark"], [data-theme="dark"] *));`). Verified directly (not just
visually) — a `page.evaluate` test creating a `dark:bg-zinc-900` element confirmed the computed
background flips from white to zinc-900 exactly when `data-theme="dark"` is set, both before (failed)
and after (passed) this fix.

**Verified live**: admin `/list` page screenshotted in both light and dark mode after the fix —
title/search bar/table header/rows all now match the surrounding dark chrome instead of staying a
bright white card; light mode confirmed unchanged (no regression). **Not independently pixel-verified**:
MNY's own `table.styles[0]` dark: classes on an actual live MNY page using that style — slug-guessing a
few candidate URLs (`actions_index`, a "Policies Spreadsheet" forms page) both fell back to the home
page (wrong pattern/mount per the known "unresolvable slug falls back silently" gotcha) rather than
landing on a real Table-using page; not worth further chasing this session. The dark:-variant CSS fix
itself is mechanism-verified directly (see above), so the MNY table's new `dark:` classes should work
correctly wherever they render — just not eyeballed on a real page yet.

**Also note**: MNY's public-facing site is NOT dark-mode-ready beyond scattered dropdown/submenu
styling — most visible chrome (main topnav bar, hero card, feature cards) has zero `dark:` classes at
all. That's a much larger, separate scope than what was asked here (table + admin list page only) —
flagged, not undertaken.

`npm run build` clean (36s) and `npx eslint` clean on every touched file after all of the above.

## Current State — the mechanism (confirmed by reading the actual files, not inferred)

`ui/defaultTheme.js` is **not** a monolithic style object — it's a pure aggregation of named imports,
one per themed component, each from a `.theme.js`/`.theme.jsx` sibling file next to that component
(the documented convention in `src/dms/packages/dms/CLAUDE.md`). `getPatternTheme()`
(`ui/useTheme.js:110-129`) does `mergeTheme(defaultTheme, themes?.[patternSelection] || {})` — i.e.
this aggregated object is **always** the base, for every pattern, regardless of which named theme
(if any) it selects. Editing the content of these sibling files therefore:
1. Becomes the actual rendered result for any pattern with no `selectedTheme` (the literal ask).
2. Becomes the fallback for any key an explicitly-themed pattern's own theme (transportny,
   mitigateny, landbank, wcdb, mny) doesn't itself override — confirmed mechanically: `mergeTheme`
   deep-merges override onto base, so an unset key falls through to base verbatim.

Point 2 is a real, deliberate consequence — every project's theme gaps will start reading as tessera
instead of neutral-library. Flagged, not avoided; matches the user's direction so far (they already
confirmed wanting uniform tessera-styled admin panels across all projects for the same reason).

Three separate aggregation trees feed into the final merged theme:
- `ui/defaultTheme.js` — UI primitives, imported directly (list below).
- `patterns/page/defaultTheme.js`, `patterns/datasets/defaultTheme.js`, `patterns/auth/defaultTheme.js`
  — imported into `ui/defaultTheme.js` as `components.pages` / `.datasets` / `.auth`.
- `patterns/admin/defaultTheme.js` — imported as `theme.admin` (spread with 2 inline nav-chrome keys).
  **Deferred — see Scope below.**

Source of truth for the new content, throughout: `src/themes/tessera/tessera-theme-v6.js` (in this
outer repo, NOT importable from the submodule — its values must be **duplicated/ported**, never
imported across the submodule boundary; the submodule must stay reusable without this repo's
`src/themes/`). Its top-level exports already mirror almost every key named below 1:1 (`layout`,
`layoutGroup`, `topnav`, `sidenav`, `navigableMenu`, `nestable`, `logo`, `button`, `input`,
`multiselect`, `tabs`, `switch`, `field`, `label`, `filters`, `dialog`, `dialogActions`, `modal`,
`dataCard`, `card`, `pill`, `icon`, `iconStyles`, `lexical`, `graph`, `avlGraph`, `map`, `table`,
`pages` (→ `pagesTheme`), `datasets` (→ `datasetsTheme`), `auth` (→ `authTheme`), `admin` (→
`adminTheme`, deferred), `textSettings`).

## Scope

**In scope (Phase A, this pass):** the 32 files feeding `ui/defaultTheme.js` directly (UI primitives
— universal chrome used by every pattern) — see checklist below.

**In scope (Phase B, next pass):** the 12 `patterns/page/defaultTheme.js` files + 19
`patterns/datasets/defaultTheme.js` files + the 1 `patterns/auth/defaultTheme.js` file (mostly
inline, one external import).

**Deliberately OUT of scope for now:** `patterns/admin/defaultTheme.js` and its sub-files. Blocked on
two prerequisites tracked separately: (1) ~10 admin pages/tabs have no v6 mockup yet (create-site
flow, themes list/edit, pattern editor's Theme/Filters/Page-Templates/Format-Manager tabs, Users +
Groups in the `auth` pattern); (2) tessera-theme-v6.js's existing `adminTheme` object is a flat
token bag (`kpiStrip`, `typeBadge`, `tabStrip`, `permMatrix*`, …) that does **not** match the real
namespaced keys `patterns/admin/defaultTheme.js` actually exports (`menu`, `errorPage`,
`patternList`, `patternPicker`, `createSite`, `editSite`, `patternEditor`, `settingsEditor`,
`filterEditor`, `permissionsEditor`, `themeEditor`, `themeList`, `editTheme`, `adminLayout`,
`adminUi`, `sectionGroup`, `pagesEditor`) — it needs real design + rewiring work first, not a
mechanical port. Needs its own task file once the admin design pass (tracked as directive #1 from
the same conversation, not yet filed) lands.

## How to port each file (the pattern to follow, every time)

For each `Foo.theme.js`/`.jsx` below:
1. Read the current file in full — note its exact export shape: named export(s), any `styles[]`
   array (named-style variants an author can pick via `activeStyle`), any `*Settings(theme)`
   function (drives the in-admin theme editor's controls — must keep working), any `docs` object.
2. Read tessera-theme-v6.js's corresponding top-level key.
3. If the library file has a flat object (no `styles[]`): replace its class-string VALUES with
   tessera's equivalents, preserving every key the library file currently defines — for a key
   tessera's object doesn't have an equivalent for, leave the library's own current value in place
   (don't delete functionality tessera's design never covered).
4. If the library file has a `styles[]` array: replace **only `styles[0]`'s** content (the default
   style — what `getComponentTheme` resolves to absent an explicit `activeStyle`). Never reorder,
   insert, or remove array entries — other themes/patterns may reference a non-default style by
   numeric index, and shifting the array would silently reassign their look.
5. Leave `*Settings()` functions and `docs` structurally alone — they describe controls/documentation
   for the ADMIN theme editor UI, not visual output; only touch them if a control's default/label
   text needs updating to match new values (rare).
6. `npx eslint <file>` after editing; confirm no new errors (2 pre-existing unrelated errors in
   `render/spa/utils/index.js` are known-stale, not from this task).

## Phase A — DONE 2026-09-15 (24 of 30 files ported; 6 deliberately left untouched, no safe match)

Executed via 4 parallel agents, one per sub-batch below. Every file: `styles[0]` only where a
`styles[]` array exists (other named styles never touched/reordered); flat objects got matching keys
replaced by value; unmatched keys (either direction) left as the library's prior value, nothing
invented; `*Settings()`/`docs` functions left structurally alone. Every touched file re-verified
lint-clean against its pre-edit state (via `git stash` diffing) — the only lint errors present
post-port are pre-existing and unrelated (unused `React`/`_` imports, missing `prop-types` on
`Label.jsx` — same errors existed before this task touched these files).

**Nav/chrome batch — all 7 ported:**
- [x] `ui/components/SideNav.theme.jsx` → tessera `sidenav` — full 1:1 key match, all 42 keys.
- [x] `ui/components/TopNav.theme.jsx` → tessera `topnav` — full key match.
- [x] `ui/components/Layout.theme.jsx` → tessera `layout` — `styles[0]`'s 5 keys only; `options` block
      was already identical to tessera's.
- [x] `ui/components/LayoutGroup.theme.jsx` → tessera `layoutGroup` — `styles[0]` ("content") only;
      also added the `decorations` key (joint-corner accents), which the file's own doc comment
      already documented as a supported mechanism — not an invented key. **Note:** the class names
      this adds (`t6-joint-rail-*`) are NOT defined by the CSS this task injects into the base (see
      "Critical fix" below) — they'll render as inert, invisible `aria-hidden` spans on any site with
      no tessera CSS loaded. Harmless (no visual break), just inert decoration. Deliberate: those
      classes are brand-specific chrome, not generic tokens.
- [x] `ui/components/Logo.theme.js` → tessera `logo` (its one `default` style, file is flat) — full
      match, including `title: 'Admin'` → `'Tessera'`. **Flagged consequence, accepted deliberately**
      per this task's objective: any site with no theme override on `logo.title` now reads "Tessera"
      in its wordmark.
- [x] `ui/components/ThemeToggle.theme.js` → tessera `themeToggle` — full match.
- [x] `ui/components/navigableMenu/theme.jsx` → tessera `navigableMenu` — matching keys only; several
      library-only keys (menu header/breadcrumb chrome) left untouched, no tessera equivalent.
- [x] `ui/widgets/index.jsx` (`defaultWidgets`) — **confirmed no change needed.** Read the file: it's a
      pure component registry (`{label, component}` pairs), zero class strings. All visual output
      comes from `Logo.theme.js`/`ThemeToggle.theme.js` above.

**Form/interaction batch — all 8 ported:**
- [x] `ui/components/Tabs.theme.jsx` → tessera `tabs` — `styles[0]` only (styles[1]/[2] untouched);
      tessera's separate `tab`/`tabActive` keys merged into the one `tab` class this component's
      `aria-selected:` variant mechanism expects. `tabpanels` (outer scroll container) has no tessera
      equivalent, left as-is.
- [x] `ui/components/Button.theme.jsx` → tessera `button` — `styles[0]` ("default Buttons") only.
- [x] `ui/components/Input.theme.js` → tessera `input` — flat, all 7 keys matched 1:1.
- [x] `ui/components/Icon.theme.js` → tessera `icon` — `icon`/`iconWrapper` mapped (semantic, not
      exact-name, but confirmed safe: `iconWrapper` was dead/unused code in `Icon.jsx` before this).
- [x] `ui/components/FieldSet.theme.js` → tessera `field` — `field`/`label`/`description` matched;
      `labelRow` has no tessera equivalent, left as-is.
- [x] `ui/components/Label.jsx` (only the `labelTheme` const touched) → tessera `label` — `label`
      matched; `labelWrapper` left as-is (no tessera equivalent).
- [x] `ui/components/Pill.theme.js` → tessera `pill` — `styles[0]` ("default") only; 9 other named
      color-variant styles (gray/orange/blue/…/status_*) untouched.
- [x] `ui/components/MultiSelect.theme.js` → tessera `multiselect` — `styles[0]` only, ~23 of 25 keys
      matched and replaced; `disabled`/`singleClearWrapper` have no tessera equivalent, left as-is.

**Overlay/container batch — 4 of 7 ported, 3 left untouched (no safe key match):**
- [x] `ui/components/Dialog.theme.jsx` → tessera `dialog` — flat, all 4 keys matched.
- [x] `ui/components/DialogActions.theme.js` → tessera `dialogActions` — flat, 1 key matched.
- [x] `ui/components/Modal.theme.jsx` → tessera `modal` — `styles[0]`'s only key (`panel`) matched;
      `styles[1]` ("wide") untouched. Tessera's richer `modal` shape (`wrapper`/`header`/`title`/…)
      has no other name-match in this file at all.
- [x] `ui/components/card.theme.jsx` (`dataCardTheme`) → tessera `dataCard` — `styles[0]` only; 4 of
      ~20 keys matched (`header`, `value`, `headerValueWrapper`, `headerValueWrapperFullBleed`);
      `styles[1]` ("v2") untouched.
- [ ] **`ui/components/table/table.theme.jsx` — NOT ported, zero name overlap.** Tessera's `table`
      (13 simple keys) vs. this file's `styles[0]` (65+ granular keys: `tableContainer`,
      `headerCellContainer`, `cellBgOdd`, `openOutInlineRow`, …). Tessera's design system modeled a
      much simpler table than the library's real Table component surface. **Real follow-up needed:**
      a semantic (not literal-name) mapping pass — this is one of the most visually pervasive
      components (every dataset/Card table) and currently gets ZERO tessera styling from this task.
- [ ] **`ui/components/draggableNav.jsx` (`nestableTheme`) → tessera `nestable` — NOT ported, zero
      name overlap.** Tessera's `nestable.styles[0]` (`wrapper`/`item`/`handle`/`dropZone`) vs. this
      file's flat `container`/`navListContainer`/`navItemContainer`/`navLink`/`subList`/… — no
      matching names. Same follow-up need as table.
- [ ] **`ui/components/nestableInHouse/index.jsx` — NOT ported, no tessera equivalent at all.**
      Confirmed via case-insensitive grep of `tessera-theme-v6.js` for "nestable" — only one hit,
      the same `nestable` const already checked against `draggableNav.jsx` above (no match there
      either). Left completely untouched.

**Rich-content/text batch — 5 of 8 ported, 3 left untouched:**
- [x] `ui/themes/textSettings.js` (`textSettingsTheme`) → tessera `textSettings` — full 1:1 match,
      **the single highest-leverage file** in this pass (drives text everywhere). `button: ''` left
      as-is, no tessera counterpart.
- [x] `ui/components/lexical/theme.js` → tessera `lexical` — `styles[0]` ("default") only, ~18 of
      ~40+ keys matched (paragraph/heading/list/link/code/layout chrome); toolbar/dropdown/table-cell/
      sticky-note/icon-registry keys have no tessera equivalent, left as-is. `styles[1]` ("Dark")
      untouched.
- [x] `ui/components/graph_new/theme.js` (`avlGraphTheme`) → tessera `avlGraph` — near-zero key
      overlap between tessera's graph-chrome theme and the library's editor-chrome `ChartDefaults`
      shape; ported just the color palette, scoped to `styles[0]`'s own `chartDefaults` override
      (NOT the shared `ChartDefaults` const both Light/Dark styles derive from, to avoid leaking into
      Dark Mode) — 5-color palette only.
- [x] `patterns/page/components/sections/components/dataWrapper/components/Attribution.theme.js` →
      tessera `pagesTheme.attribution` (nested, not top-level) — `wrapper`/`link` matched; `label`/
      `divider` left as-is.
- [x] `patterns/page/components/sections/components/dataWrapper/components/filters/RenderFilters.theme.js`
      → tessera `filters.styles[0]` ("panel") — 14 of the library's keys matched and replaced
      (including `toggleButton`/`toggleIcon` both mapped to `hidden`, faithfully matching tessera's
      panel style); tessera's `chip` style (`styles[1]`) not used, per the styles[]-array rule; several
      library-only keys (active-token chips, inline-switch row, search-key styling) left as-is.
- [ ] **`ui/components/map/map.theme.js` — NOT ported.** Tessera's `map` (5 flat keys, `legend` as one
      class string) vs. the library's `styles[]`-based shape where `legend`/`popup`/`hover` are deep
      ~30-key nested objects actively consumed by `useMapLegendTheme.js`/`HoverComponent.jsx`. The one
      shared key name (`legend`) holds incompatible types (string vs. object) — porting it would wipe
      out real functionality. **Needs a real design pass**, not a mechanical port.
- [ ] **`ui/pageTemplates.js` (`defaultPageTemplates`) — NOT ported, no tessera equivalent exists.**
      Confirmed via grep — tessera has never designed page-template chrome.
- [ ] **`ui/siteTemplates.js` (`defaultSiteTemplates`) — NOT ported, same reason as above.**

## Follow-up — conformed tessera_v6 itself to the real component shapes (2026-09-15)

Per the user: fix the *source*, not just the port. `table`, `nestable`, and `map` in
`src/themes/tessera/tessera-theme-v6.js` were design-system reference shapes that shared little to
no key names with what the real library components actually read (documented above as "NOT ported,
zero name overlap") — meaning tessera's own site themed none of these correctly either, independent
of this library-port task. Rewrote all three in place, key-for-key against the real component files,
in tessera's established visual voice (`c.*` palette, `FONT_MONO`/`FONT_SANS`, hairline borders,
cobalt accent):
- `nestable` — full 8-key match (`ui/components/draggableNav.jsx`'s `nestableTheme`).
- **New** `nestableInHouse` const added (didn't exist before) — matches `ui/components/nestableInHouse`'s
  1-key, 2-style shape; wired into the composed `tesseraThemeV6` object (was missing entirely).
- `table` — full ~65-key match across both `default` and `below-row` styles
  (`ui/components/table/table.theme.jsx`) — the single highest-impact fix in this follow-up, since
  Table is used on every dataset/Card page.
- `map` — full nested `legend`/`popup`/`hover` match (`ui/components/map/map.theme.js`'s `default`
  style) — previously a flat, type-incompatible 5-key placeholder.
- **Correction (caught same session):** initially flagged `compassIcon`/`mapStyleIcon`/`loadingIcon`
  (map) and the `headerCell*Icon` set (table) as missing tessera glyphs — wrong. `theme.Icons` merges
  the library's own base icon registry (`ui/icons/index.jsx`) with a theme's own set rather than
  replacing it, and the library registry already has every one of these names (`NavigationArrow`,
  `MapLayers`, `Spinner`, `TallyMark`, `LeftToRightListBullet`, `Sum`, `Avg`, `Group`, `SortAsc`,
  `SortDesc` all confirmed present in `iconList`). No gap; comments in `tessera-theme-v6.js` corrected
  to say so. Only real substitution made: `headerCellMenuIcon` `ArrowDown`→`ChevronDown` (tessera has
  no `ArrowDown`; same swap already established for SideNav/TopNav).
- Build verified clean (`npm run build`, 36s, no new errors) and `npx eslint` clean (1 pre-existing
  unrelated `FONT_NOTE` unused-var error, confirmed via diff untouched by this change).

**This unblocks, but does not itself complete, the Phase A port for these 3 files** — `table`,
`nestable`, `nestableInHouse`, `map` in the LIBRARY's own `.theme.js` files can now be ported from
tessera the same way the other 24 were, since tessera's shapes are correct now. Not yet done —
tracked as a remaining Phase A item below.

## Dark-mode toggle enabled by default, library-wide (2026-09-15)

Per the user: no site gets a dark-mode toggle by default (tessera's own site only has one because a
prior pass hand-wrote `{type:'ThemeToggle'}` into its live pattern DATA, not the theme). `ThemeToggle`
was already a fully-built, brand-neutral registered widget (`ui/widgets/index.jsx`) with its styling
already ported to tessera in Phase A — the only gap was that no site's default NAV CONFIG actually
included it.

- `ui/components/Layout.theme.jsx` — the single library-wide default `options.sideNav.bottomMenu`
  (every project inherits this unless its own theme overrides it) changed from `[{type:'UserMenu'}]`
  to `[{type:'UserMenu'}, {type:'ThemeToggle'}]` — next to the user's own menu, as asked. Any project
  that doesn't want it can still override `bottomMenu` wholesale (already a `_replace` key, so this
  isn't a merge that's hard to undo).
- **Found and fixed a real gap this surfaced:** `ThemeToggle.jsx` renders a `Sun`/`Moon` icon by name
  — neither existed in the library's own base icon registry (`ui/icons/`), only in tessera's separate
  design-system icon file, so the toggle would have rendered as a blank button for every non-tessera
  project. Added both as generic (non-brand) hand-drawn SVGs to `ui/icons/icon_defs.jsx` +
  registered in `ui/icons/index.jsx`'s `iconList`, matching the file's existing convention.
- **Correction to Phase A's follow-up (above):** while investigating the icon gap, discovered
  `theme.Icons` merges the library's base icon registry with a theme's own set (deep `mergeTheme`,
  not a replace) — so several icon names I'd flagged as "missing, needs a future icon-drawing pass"
  for `table`/`map` (TallyMark, Sum, Avg, Group, SortAsc, SortDesc, NavigationArrow, MapLayers,
  Spinner) were never actually missing; they're in the base registry already. Comments in
  `tessera-theme-v6.js` corrected.
- Verified: `npm run build` (35.57s, clean) + `npx eslint` on every touched file (4 pre-existing,
  unrelated errors confirmed via `git stash` diffing — none introduced).

## Cross-project regression audit + a git-stash data-loss incident (2026-09-15)

Triggered by the user reporting MNY's logo looked wrong (`localhost:5173` vs `devmny.org`).

**Root cause of the logo bug:** `src/themes/mny/theme.js`'s own `logo` object never set `imgClass` at
all, silently relying on the shared library default (`min-h-12`, sized for MNY's 48px `imgWrapper`) —
which Phase A changed to tessera's `h-7 w-auto`. Fixed by adding `imgClass: "min-h-12"` explicitly to
MNY's own theme file (self-contained fix; the shared default stays tessera's value, correctly, for
projects with no opinion).

**Full 4-way audit launched** (one per Phase A batch) to find every OTHER place a project's theme
silently relies on a key Phase A changed, across mny, mny_admin, transportny (v1 + v2), landbank,
wcdb, avail. Findings:
- **Confirmed functional break, fixed:** `RenderFilters.theme.js`'s `toggleButton`/`toggleIcon` had
  been ported to tessera's `'hidden'` (correct for tessera's OWN filter panel, which has no
  expand/collapse control at all) — but MNY's default filter style and WCDB (no `filters` override at
  all) actively use a visible toggle. Reverted to the pre-port visible-button values in the shared
  library file. This is the only OTHER hard functional break found (vs. purely cosmetic color/type
  shifts) — everything else below is a visual-only gap.
- **Everything else found is a cosmetic silent-dependency gap** (a project doesn't set some key, so it
  now inherits tessera's color/typography/spacing instead of the old neutral default) — NOT fixed yet,
  pending user direction on which (if any) to patch vs. accept as the intended fallback effect:
  - `navigableMenu` missing entirely (whole component inherited) in `mny/theme.js`, `mny/admin.theme.js`,
    `wcdb_theme.js`, `avail/theme.js`.
  - `textSettings` (h1-h6/body/bodySmall/caption/label) missing in `transportny/theme.js` (v1 — has
    almost NO theme keys of the ~30+ audited, by far the highest exposure) and `avail/theme.js`.
  - `multiselect`/`input` styles[0] are literally empty placeholder objects in `mny/theme.js` (comment
    says "empty default = library look" — written before Phase A changed what that means); `button`
    missing entirely in `wcdb_theme.js`; `tabs`/`field`/`label`/`icon` missing entirely in
    `wcdb_theme.js`; `pill`/`multiselect`/effectively-`tabs` missing in `avail/theme.js`.
  - `dialog`/`dialogActions`/`modal` missing in various combinations across `mny/theme.js`,
    `mny/admin.theme.js`, `transportny/theme.js` (v1), `transportny/themev2.js`, `wcdb_theme.js`,
    `avail/theme.js` — `dialogActions.wrapper` alone is inherited by 6 of 7 (only landbank sets it).
  - `avlGraph.chartDefaults.colors` (chart series palette) missing in `wcdb_theme.js`,
    `transportny/theme.js` (v1), `avail/theme.js`.
  - `lexical` code-block/list/link styling gaps in `mny`, `wcdb`, and fully-empty `lexical: {}` in
    `transportny/theme.js` (v1) and `avail/theme.js`.
  - Assorted SideNav `sectionDivider`/`sectionHeading` and TopNav level-3/flyout-submenu sub-keys, most
    prominently in `avail/theme.js` (9 unset keys — the single most-exposed file for this category).
  - `landbank/theme.js` and `transportny/themev2.js` came through nearly unscathed (near-complete
    explicit coverage) — **transportny/theme.js (v1) and avail/theme.js are the two highest-risk
    projects overall**, missing most of the audited keys across almost every file.
- **Separately noted, not caused by this task:** `transportny/themev2.js`'s `tabs` theme uses key names
  (`wrapper`/`tabList`/`tabActive`/`tabPanel`) that `Tabs.jsx` never reads (`tabGroup`/`tablist`/`tab`/
  `tabpanel`) — a pre-existing bug, tabs there were never themed at all, unrelated to Phase A.

**Data-loss incident, caught during this audit:** the nav/chrome audit agent reported `Layout.theme.jsx`
had "zero diff" — contradicting this file's own "DONE" record. Confirmed via direct `git diff`: BOTH
edits to that file (Phase A's `styles[0]` port AND the later ThemeToggle-default-nav addition) had been
silently erased from disk, with no error at any point. Root cause: multiple Phase A batch agents (and
this session itself, once) each independently ran `git stash`/`git stash pop` against the same shared
working tree, at overlapping times, to check whether a lint error pre-existed — a classic stash-stack
race that silently drops a file's uncommitted changes. **Recovered**: reconstructed both edits from the
conversation's own record of their exact content; re-verified via `git diff --name-only` against the
full expected 31-file list (all present), `npx eslint` (only the same pre-existing unrelated errors),
and `npm run build` (clean, 35.5s). See `[[feedback_no_concurrent_git_stash_parallel_agents]]` memory —
future sessions must not let parallel agents `git stash` the same tree concurrently.

## Full insulation pass — every project patched (2026-09-15)

Per the user's explicit direction ("patch everything found"): every gap surfaced by the 4-way audit
above was fixed, one project file at a time (to avoid concurrent-write conflicts), each restoring the
exact pre-port value via read-only `git show`/`git diff` against `src/dms` HEAD — never `git stash`.

- **`src/themes/mny/theme.js`** — all 12 gaps patched (`navigableMenu` added whole; `sidenav`/`topnav`
  sub-keys; `multiselect`/`input` styles[0] filled in from empty placeholders; `icon.iconWrapper`;
  `field` added whole; `dialog`/`dialogActions`/`modal` added whole; `lexical` code/list keys;
  `textSettings` h1-h6/body/caption/label). `mny/admin.theme.js` confirmed to inherit all of these
  automatically via its `{...mny, ...theme, Icons}` spread — no separate edit needed there.
- **`src/themes/transportny/theme.js` (v1)** — **audit correction found during patching**: 5 of the 8
  "missing" form-control keys (`button`/`input`/`icon`/`field`/`label`) were actually already explicit
  in this file — the earlier audit was wrong about those 5, they were never at risk. Patched the 8
  genuine gaps: `pill`, `multiselect`, `tabs`, `dialogActions`, `modal`, `textSettings`, `lexical`
  (was `{}`), `avlGraph` (added whole, `SharedThemeOptions`/`ChartDefaults` inlined since they aren't
  separately importable into a plain data file).
- **`src/themes/wcdb/wcdb_theme.js`** — all 10 gaps patched (`navigableMenu`, `sidenav`/`topnav`
  sub-keys, `button.styles[0]` filled from empty, `multiselect` icon-key gaps, `tabs`/`field`/`label`/
  `icon` added whole, `dialog`/`dialogActions`/`modal` added whole, `dataCard.styles[0].value`,
  `avlGraph`, `attribution`, `lexical` code/list/link/layout/hr keys).
- **`src/themes/avail/theme.js`** — all 9 gaps patched, including the largest single per-file exposure
  found (9 TopNav submenu/flyout keys) — `navigableMenu`, `sidenav`/`topnav` sub-keys, `pill`/
  `multiselect`/real-`tabs` added whole (the file's pre-existing `"tabs"` docs/demo blob left alone),
  `dialogActions`/`modal` added whole, `textSettings`, `avlGraph`, `lexical` (was `{}`).
- **`src/themes/transportny/themev2.js`** — the only 2 gaps found (`navigableMenu.styles[0]`'s
  `menuCloseIconWrapper`/`valueSubmenuIconWrapper`) patched directly (small enough not to warrant a
  dedicated agent).
- **`src/themes/landbank/theme.js`** — spot-checked, confirmed genuinely fully self-contained already
  (references its own `textSettings`/`navigableMenu`/`dialogActions`/`avlGraph` throughout). No changes
  needed.

**Final verification (whole session, all 6 theme files + the library):** `git diff --stat -- src/themes/`
shows all 6 files with substantial, expected diffs (2208 insertions total); `npx eslint` across all 6 —
only 2 errors, both confirmed pre-existing via `git show HEAD:<path>` (tessera-theme-v6.js's unrelated
`FONT_NOTE` unused-var; transportny/themev2.js's pre-existing duplicate `proseSMClamp1` key, nothing to
do with the `navigableMenu` edit); `npm run build` — clean, 35.85s.

**Net effect:** every one of the 6 non-tessera projects now renders its pre-port look exactly as it did
before Phase A, fully insulated from the shared default going forward — while any FUTURE unthemed
project (or key neither tessera nor any of the 6 named projects ever touches) still gets tessera's
fallback, which was the original goal.

## Critical fix — CSS custom properties weren't loaded for the fallback case (found + fixed same pass)

**The gap:** every ported class string above references `var(--t-*)` CSS custom properties (colors)
and/or `.t-*` type-token classes. Those are only DEFINED when tessera_v6's own CSS is injected via
its `fonts` array (`loadThemeFonts`, `ui/useTheme.js`) — which only happens when a pattern
**explicitly** selects `tessera_v6`. For the exact case this whole task targets (no theme selected),
those variables/classes would not exist — the ported class strings would resolve to invalid/no-op
styling (transparent colors, unstyled text), not tessera's actual look. This would have made Phase A
non-functional for its own stated goal.

**Root cause #2, found while fixing #1:** `mergeTheme()` (`ui/useTheme.js`) merges a `fonts` array by
lodash's default array-merge — BY INDEX, not by concatenation. So even after adding a `fonts` entry
to the base `defaultTheme`, any project whose own selected theme ALSO has a `fonts` array would have
had its own font/CSS entries silently collide index-by-index with the base's, with whichever side's
value came later in the merge chain winning per overlapping index — fragile, and would likely have
dropped the base's injected CSS for any themed project (exactly the projects that most need the new
base classes' fallback-filled gaps to render correctly).

**Fixes shipped (both in `src/dms`):**
1. `ui/useTheme.js`'s `mergeTheme()` — added a special case: when both `base[key]` and
   `override[key]` are arrays AND `key === 'fonts'`, concatenate them (`[...base, ...override]`)
   instead of the default index-merge. `loadThemeFonts`'s own per-`id` DOM dedup makes any duplicate
   entry harmless. This is a generically useful correctness fix, not tessera-specific — any theme
   layering (base + named theme + pattern override) needed this.
2. `ui/defaultTheme.js` — added a new `fonts` entry (`id: 'dms-default-tokens'`) containing ONLY the
   non-decorative "token layer" duplicated from `design_system_v6/_shared.css` sections 2 (light+dark
   `:root`/`[data-theme="dark"]` custom properties) and 4 (the 15 `.t-*` type-token classes +
   responsive step-down). **Deliberately excludes** section 1 (`.font-*` classes — would collide with
   Tailwind's own generated `font-sans`/`font-mono` utilities since IBM Plex isn't loaded here),
   section 3 (drafting-sheet grain/hatch/joint decorative chrome), section 5 (signature interaction
   utilities — caret/mark/lift/drag), and the Google Fonts network request (`fonts.googleapis.com`) —
   those are tessera-brand flourishes an unrelated project shouldn't silently start downloading/
   rendering. Font-family declarations keep their system-font fallback stacks, so text still renders
   correctly (just not in IBM Plex) without the webfont.

**Still open / worth knowing:** the `LayoutGroup.theme.jsx` `decorations` addition and any other
ported reference to `.t6-*` classes (band-sheet, joints, center-bands, logo-mark mask — all defined
only inside `tessera-theme-v6.js`'s own injected "theme-extras" style block, not in `_shared.css`)
will render as inert/invisible on any site without tessera's full theme loaded. Not a visual break
(elements are `aria-hidden` and empty), just decoration that silently does nothing outside tessera's
own site. Not fixed — these are genuinely brand-specific, correctly excluded from the generic base.

## Users/Groups/Profile designed + implemented for default theme — DONE 2026-09-16

Per user direction: design these 3 auth-manage pages for tessera default first (MNY reskin is a
separate, not-yet-started follow-up). This is genuinely new design work — confirmed zero existing v6
mockup for any of these three pages, and `patterns/auth/defaultTheme.js`'s `authPages.manage` object was
still 100% original neutral placeholders (gray-700/blue-400), completely unstyled, before this pass.

### Mockups

Built `src/themes/tessera/design_system_v6/pages/admin-users.html`, `admin-groups.html`,
`admin-profile.html`, matching the existing `admin-pattern-*.html` visual language exactly (same
sidenav shell — left as-is per user direction, a "people" sub-section was added beneath the existing
site-level nav for users/groups/profile). Registered in `ds-nav.js`. Grounded in the REAL component DOM
(`patterns/auth/pages/authUsers.jsx`/`authGroups.jsx`/`profile.jsx`), not invented layouts — Profile in
particular is genuinely just an email + reset-password link in the live code today, and the mockup
matches that rather than inventing fields.

Add User / Add Group modals were made genuinely closable (dev-scaffolding inline `onclick`, matching
the existing light/dark-toggle convention in these mockups) — closed by default, opens via "add new",
closes via the X or clicking the scrim.

### Translation to theme.js — what's theme-only vs. what needed real component changes

Before writing `patterns/auth/defaultTheme.js`, traced the exact live DOM of each component (including
`Modal.jsx`, `Button.jsx`, `Input.jsx` — confirmed `className` on `UI.Button`/`UI.Input` is a full
REPLACEMENT of the theme default, not additive, so `headerAction`/`rowAction`/`modalAction`/
`headerInput` are literal complete class strings, not partial overrides). Found several mockup elements
don't exist in any live component and can't be added via theme.js alone:
- Page subtitles, the Groups annotation callout, Profile's "why this page is small" note, the "just
  added — no groups yet" status pill — all invented in the mockup, correctly **dropped** from the
  implementation (not present in the real pages, no code path produces them).
- **Modal.jsx itself renders no title and no close button at all** — just a bare theme-styled panel
  around whatever children are passed. Confirmed closing already worked via click-outside
  (`useModalOverlay`), just with zero visual affordance.

Per explicit user approval, added the following as small, justified JSX changes (not just theme):
1. **Modal title + working close button** — added to all 3 modal usages (`AddUserModal` and the Reset
   Password modal in `authUsers.jsx`, the Add Group modal in `authGroups.jsx`): a `modalHeader` row
   with `modalTitle` text and a `modalCloseBtn` `<Icon icon="XMark">` button calling the same
   `setOpen`/`setEditUser`/`setAddingNew` the component already uses.
2. **Real stat counts** on Users' header (`users.length`/`groups.length`, already-loaded state — no new
   data fetch) via new `headerStats`/`headerStatsItem`/`headerStatsValue`/`headerStatsLabel` keys.
3. **Profile avatar** — a new `<span className={m.avatar}>` showing the email's first letter, default
   value `"hidden"` so a theme that doesn't opt in renders nothing (backward compatible).

**Separately found and fixed** (a real, previously-unknown bug, unrelated to this translation but found
while building it): `Modal.jsx`'s backdrop was **hardcoded** `bg-gray-500/75` directly in the component
— never read from the theme at all, so no theme edit could ever have fixed its dark-mode look. Added a
`backdrop` key to `Modal.theme.jsx`'s default style (`var(--t-scrim)`, already defined and used
elsewhere) and wired `Modal.jsx` to use it — fixes the scrim for every modal in the app, not just these
three pages.

`patterns/auth/defaultTheme.js`'s `authPages.manage` object now has the full var(--t-*)-token
implementation: `pageWrapper`/`profileWrapper` are now the bg-panel/border-rule "card" (matching the
`SectionGroup`/`editSite.theme.js` card convention already established for the Sites-list admin page),
`headerRow`/`headerOuter` are a bordered header strip, `headerAction`/`modalAction` are the cobalt
primary-button look, `rowAction` is a quiet outline style (deliberately distinct from the primary
actions), `headerInput` is a compact table-header search box, `tableHeaderCell` stays a simple inline
layout (the mockup's stacked label-over-search-box was NOT carried over — risked overflow against the
Table component's real fixed header-row height, a deliberate simplification from the mockup).
`manageLayoutStyle`/`manageLayoutGroupStyle` were left `undefined` — confirmed unlike MNY, tessera's own
TopNav is `sticky` (not `fixed`), so there's no nav/content collision to compensate for; the site-wide
`layout.options.topNav.size: 'none'` + compact `SideNav` default (both already tessera-correct) apply
with no override needed.

### Live verification — fully local (not the flaky remote)

Set up a **fully local** verification environment per explicit user direction (the remote
`dmsserver.availabs.org` was intermittently down this session):
- Local `dms-server` against `cli-test.sqlite` (a pre-existing, checked-in-as-gitignored empty test
  fixture with one auth user, `admin@availabs.org`, and no site content).
- Reset that user's password to a known bcrypt hash of `test123` (direct sqlite write — local, throwaway
  fixture, not shared/remote).
- Granted it project access by reusing a project/group pair that already existed in the fixture
  (`avail_auth`/`AVAIL`) rather than fighting `NOT NULL created_by` constraints on a fresh insert.
- Created a minimal `shaun-test-app`/`test` site + a `page`-type pattern (per user direction to use this
  app name specifically) via the CLI's `raw create`.
- **Key unlock, worth remembering**: `/auth/*` routes (login, manage/users, manage/groups, manage/profile
  — literally everything under the auth pattern) **do not register at all** unless the site has an
  actual pattern row with `data.pattern_type === 'auth'` in its `patterns` list
  (`render/spa/utils/index.js:169`) — this isn't gated by `authPath`/`AUTH_PATH`, which is always set
  regardless; the auth pattern's mere *existence* is what makes `pattern2routes` build those routes at
  all. A site created without one (as this one initially was) 404s on `/auth/login` itself, not just
  the manage pages — easy to misdiagnose as a bug in whatever page you're actually testing.
- Also independently found (not fixed, out of scope, already noted elsewhere): a fresh site/pattern with
  no `theme.selectedTheme` set on its auth pattern falls back to a **hardcoded `'mny_admin'`** theme
  name (`patterns/auth/siteConfig.jsx`), not `'default'` — visible live as the AdminLayout's SideNav
  showing MNY's own logo/navy palette while the page CONTENT (governed by `authPages.manage`, which
  `mny_admin` doesn't override) correctly showed tessera's new styling. Confirms the new default theme
  values are live and correct as the true fallback; the sidenav mismatch is the pre-existing,
  already-documented "admin's port" gap, not something this pass touched.

Verified live end-to-end: Users (real 1-user/2-group stat counts, table, row actions, Add User modal
open+closable with title), Groups (real group rows, Add Group modal), Profile (avatar+email+reset link)
— all in both light and dark mode. `npm run build` clean, `npx eslint` shows only pre-existing
prop-types/unused-var noise (this codebase has no PropTypes anywhere; confirmed nothing new introduced).

### Follow-up round — user found real gaps by comparing against the mockup (2026-09-16)

User reported dark mode, fonts, group pill color, "Created" column color, capitalization, and the
sidenav all looked off vs. the mockup. Investigated each rather than guessing:

**The big one — a test-methodology bug, not a real bug**: the local test pattern (`shaun-test-app`'s
auth pattern) had no `theme.selectedTheme` set, so it fell into the exact `'mny_admin'` hardcoded
fallback this task file already flagged as a known gap (`patterns/auth/siteConfig.jsx`). What wasn't
previously appreciated: `mny_admin`'s actual export is `{...mny (the FULL mny/theme.js), ...admin
overrides}` (`src/themes/mny/admin.theme.js`'s own `import mny from "./theme"` + `export default
{...mny, ...theme, Icons}`) — so the fallback pulls in **MNY's entire real theme** (its own Table
style, fonts, sidenav, everything), not a neutral/tessera baseline. That's what explained nearly every
symptom reported. Fixed for testing purposes by setting `theme.selectedTheme: "default"` explicitly on
the test auth pattern (a local-only change, `raw update` via the CLI) — re-verified everything and
dark mode, fonts, and the modal all looked correct under the real default theme. **The `mny_admin`
fallback bug itself is unfixed** (still deliberately out of scope, same as before) — just no longer
contaminating verification.

**Two real gaps found and fixed even under the correct default theme:**
1. **Group pill wasn't cobalt-accented like the mockup.** Traced the real render path: `authUsers.jsx`'s
   `groups` column (`type: 'multiselect'`) renders through `ui/columnTypes/index.jsx`'s `multiselect` →
   `MultiSelectView` (`ui/components/MultiSelect.jsx`), which reads `MultiSelect.theme.js`'s
   `tokenWrapper` — already tessera-toned (`bg-well`/`text-ink`/`border-rule`) but neutral, by design,
   since it's a **shared primitive used by every multiselect in the app**, not something
   `authPages.manage` controls. Recoloring the shared default would have changed every multiselect chip
   app-wide. Fixed properly: added a new named style (`MultiSelect.theme.js`'s `styles[1]`, `name:
   'accent'`, cobalt `tokenWrapper` only — everything else inherits from `styles[0]`), and opted just
   this one column into it via `activeStyle: 'accent'` in its column config (confirmed this forwards
   through generically — `TableCell.jsx` spreads the whole column object as props, and
   `MultiSelectView`/`MultiSelectEdit` already accept `activeStyle`). Zero blast radius on any other
   multiselect in the app.
2. **Created/Last Login column text was ink, not the intended muted graphite/pencil.** Root cause:
   those two columns' `Comp` functions rendered a bare `<span>{fmtDate(...)}</span>` with no className
   at all — confirmed via computed-style inspection (`color: rgb(24,26,31)` = `--t-ink`, inherited from
   an ancestor, not `cellInner`'s intended `--t-graphite`). Per explicit user direction ("use existing
   theme... so mny can still have its colors while using mny, and admin theme can use defaults") fixed
   through the theme system, not a hardcoded color: added a new `metaText` key to `authPages.manage`
   (tessera value: `t-metaSM text-[var(--t-pencil)]`) and applied it as `className` on both spans. MNY's
   own `manage` object doesn't exist yet (that's the not-yet-started MNY reskin pass) — when it does,
   `metaText` is already there as MNY's own override point.

**Sidenav now has icons, matching the mockup.** The plain-text sidenav wasn't a theme bug either — the
real `menuItems` array (`patterns/auth/siteConfig.jsx`'s `manageAuthConfig`) never had `icon` fields at
all, and `SideNav.jsx` only renders an icon when `navItem.icon` is set. Added `icon` to every entry
(`Home`/`Fill`/`AccessControl`/`UserCircle`/`User`/`Group` — all pre-existing names in the base icon
registry, confirmed via `ui/icons/icon_defs.jsx`, no new icons drawn). This is a **shared-library
change** — every project's Sites/Themes/Auth nav gets these icons now, not just tessera's default.
Insulation check: none of the 6 previously-audited projects (mny, transportny v1/v2, wcdb, avail,
landbank) override this `menuItems` array themselves (it's always the shared hardcoded one unless a
theme sets `authPages.manage.menuItems`, which none currently do), so this is a uniform, low-risk
addition — worth a quick look if any project ever complains about unexpected new sidenav icons.

Re-verified all of the above live (light + dark, both fixes visible together on the Users page
screenshot) before wrapping up. `npm run build` clean, `npx eslint` shows only the same pre-existing
noise as before (confirmed `MultiSelect.theme.js` itself is fully lint-clean).

### Not done yet (per the user's stated sequencing: default first, then MNY)

MNY reskin of Users/Groups/Profile — not started. `mny/auth.js`'s `authPages` doesn't have a `manage`
key at all yet (only the `manageLayoutGroupStyle` fix from earlier this session). MNY's own manage pages
currently render via this SAME new tessera-default `manage` object (since MNY doesn't override it) —
confirmed by the earlier-this-session live check showing MNY's Users page with the padding fix; that
check was BEFORE this design pass landed, worth a fresh look now that `manage.*` has real content.

## Phase B checklist — pattern-level component files (next pass, not started)

**`patterns/page/defaultTheme.js`'s 12 imports:** `sections/sectionGroup.theme`,
`sections/sectionArray.theme`, `sections/section.theme`, `userMenu.theme`, `search/theme`
(searchButton + searchPallet, 2 exports), `pages/edit/editPane/sectionGroupsPane.theme`,
`sections/ComplexFilters.theme`, `sections/TemplateManager.theme`,
`sections/components/dataWrapper/components/filters/TimePicker/timePicker.theme`,
`PageTemplatePicker.theme`, `LinkPageNotice.theme`,
`sections/components/ComponentRegistry/map/map.theme`. Cross-reference against tessera's `pages`
export (`pagesTheme` in `tessera-theme-v6.js`) — per the landing-pages task's Progress Log, tessera
already has `pages.editorMockup`, `pages.userMenu` (tightened during the "Card fidelity pass") —
confirm which of these 12 tessera already covers vs. still needs porting from scratch.

**`patterns/datasets/defaultTheme.js`'s 19 imports:** `Breadcrumbs.theme`, `sourceTable.theme`,
`DatasetsList/datasetsList.theme`, `DatasetsList/categories.theme`,
`MetadataComp/metadataComp.theme`, `validateComp.theme`, `ExternalVersionControls.theme`,
`upload.theme`, `dataTypes/default/sourceOverview.theme`, `dataTypes/default/admin.theme` (careful —
this is `datasets`' own internal `admin` key, unrelated to the `patterns/admin` pattern),
`sourcePage.theme`, `createPage.theme`, `settingsPage.theme`, `Tasks/UdaTaskPage.theme`,
`dataTypes/file_upload/CreatePage.theme`, `dataTypes/gis_dataset/pages/Create/gisCreate.theme`,
`dataTypes/gis_dataset/pages/Map/gisMap.theme`, `dataTypes/gis_dataset/pages/gisPages.theme`,
`dataTypes/gis_dataset/pages/Uploads/uploads.theme`. tessera's `datasets` export (`datasetsTheme`)
coverage unknown — check before assuming a 1:1 match; this pattern is far more niche/low-traffic than
`page`, likely lower priority within Phase B.

**`patterns/auth/defaultTheme.js`:** mostly inline (not split into sibling files) — only
`components/ViewAsBar.theme.js` is external. The inline content (`emailTheme`, `authPages`,
`userMenu`, `field`) would be edited directly in this one file. Note: `authPages.manage.*` covers the
Users/Groups pages named in directive #1 — this file is where THAT porting work actually lands, once
tessera has a design for those pages (currently deferred with admin, see Scope above, even though
this file itself isn't `patterns/admin/`).

## Testing Checklist

- [ ] Phase A: after each file (or small batch), `npm run dev`, load a pattern with NO
      `selectedTheme` set, confirm the touched component now renders tessera-styled.
- [ ] Confirm an explicitly-themed project (e.g. transportny) still renders correctly — spot-check
      that its own overrides still win, and that any key it DIDN'T override now shows tessera's
      look instead of the old neutral default (expected, not a bug).
- [ ] `npx eslint` clean on every touched file.
- [ ] No regression in the admin theme-editor UI (`themeEditor.jsx`) — it reads `*Settings()`
      functions from several of these files; confirm the settings panel still renders/edits properly
      for at least Button and Input after their port.
- [ ] tessera's own site (`tessera_v6` explicitly selected) — spot check no regression, since it
      still merges its OWN theme on top of this now-tessera-flavored base (should be a no-op
      visually, but the base changing under it is worth one look).
