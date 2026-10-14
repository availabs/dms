# Button + pill + table consistency audit — one look per kind, across every pattern

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** in progress · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** shaunak.sangdod@gmail.com

**Started 2026-10-13** (owner: "start the inventory"). One look per kind of control (buttons, pills,
switches, tabs, fields, tables) across every pattern, in the library default theme only.
Review page for the inventory: https://claude.ai/artifact/6v1t9R9v9yXJge6zV4RmVm.

## Resume here (handoff, 2026-10-13 end of session)

**Files in this effort:**
| File | What | State |
|---|---|---|
| this file | hub: decisions, rules, resume notes | in progress |
| [ui-control-inventory.md](./ui-control-inventory.md) | Deliverable 1: every button / pill / table found, by kind | done |
| [ui-control-spec-and-mockups.md](./ui-control-spec-and-mockups.md) | the spec page `ui-controls.html`, the mockup re-skin, the owner's later calls (tabs ink, batch 2, 32px fields) | done |
| [ui-control-library-port.md](./ui-control-library-port.md) | porting the spec into the library default, area by area | steps 1, 2a, 2b done; 2d auth partly |
| [ui-control-classname-to-activestyle.md](./ui-control-classname-to-activestyle.md) | moving buttons off `className={t.key}` onto `activeStyle` | 25 admin + 7 auth done |
| [default-theme-color-variant.md](./default-theme-color-variant.md) | a second, more colourful default theme | not started, after this |

**Git state.** Both repos are on `design-wip`. The last commits are the merges of master
(root `10b93f70`, library `99843c43`), unpushed. **Uncommitted in the library:** step 2b (admin
theme files), the lens-count fix, all className → activeStyle swaps (admin + auth manage pages + datasets), the
task-file splits. Root: `_legacy/ui.js` (new names + DERIVED), `_legacy/datasets.js`, TNY v1 dead keys, mockup scripts, submodule pointer, initiative table. Commit rules:
the owner's message only, no Co-Authored-By / Claude attribution, no project names; commit only when
asked. Root `stash@{0}` "design new" is an old backup the owner may drop (ask first).

**Next steps (owner's order so far; confirm each before editing):**
1. className → activeStyle: ALL DONE and `Button.jsx` LOCKED (2026-10-13; admin, auth incl. sign-in, datasets, page, shared ui, map editor, TNY components). Next: [ui-raw-html-to-ui-components.md](./ui-raw-html-to-ui-components.md). Was: datasets DONE (2026-10-13). Owner's rule now: **no UI component lets
   className override the theme**; per-pattern keys are deleted (library + `_legacy`), project themes
   define role names in their own `button.styles`, `withLegacyUi` derives `actionFull` /
   `dangerFull` / `dangerSolid`, pre-v6 library strings are normalised. Full write-up in
   ui-control-classname-to-activestyle.md "Datasets". Next with the same recipe: page pattern,
   shared **ui (8)** (Card form buttons, Permissions removeBtn), admin filterEditor `clearAllBtn`;
   then lock `Button.jsx` (drop className / themeOptions from the class), then Input / MultiSelect /
   Table. After the lock: [ui-raw-html-to-ui-components.md](./ui-raw-html-to-ui-components.md) (raw
   `<button>` etc. → UI components; owner: lock first). Open: should TNY v2 / MNY define their own `action` / `primary` / `danger`?
2. Library port step 2e: datasets.
3. Auth leftovers: sign-in submit (`sectionGroupTheme.actionButton`) skipped by the owner;
   user-group chips in the Users table and the selected-cell outline are still cobalt (asked, no
   answer yet).
4. P4: `UI.Table` 'list' style for admin / auth lists.
5. Open questions / bugs: the dark-mode switch track is near-white (asked, no answer); "NaN rows" in
   the section menu Filters value; "Refresh Meta" renders as small-danger; landbank / avail_site
   global `:focus-visible` CSS leaks into the app; skeleton and tooltip polish.

**How to verify (all local; never touch the owner's :5173 dev server, never start dms-server with
its default env, which points at prod):**
- Scratch server: `cd <old session scratchpad>/srv/dms-server` (currently
  `/tmp/claude-1000/-home-shaun-IdeaProjects-dms-template/ef63fb11-a629-431d-9794-9e0e1eb9fa63/scratchpad/srv`;
  /tmp may be wiped, see memory `reference_local_browser_repro_setup`), then
  `NODE_PATH=$PWD/node_modules:<repo>/src/dms/node_modules:<repo>/node_modules DMS_DB_ENV=cli-test DMS_AUTH_DB_ENV=cli-test PORT=3457 node src/index.js`.
- Vite: `VITE_API_HOST=http://localhost:3457 VITE_DMS_APP=v6test VITE_DMS_TYPE=main VITE_DMS_PG_ENVS=test_dama npx vite --port 5199 --strictPort`.
- Login `admin@availabs.org` / `test123` (project `v6test`) via POST `/login`, then put the token in
  `localStorage.userToken` in Playwright. Also `viewer@test.org`.
- Test patterns: page `/p` (27), `/p-mny` (39), `/p-tny` (51), `/p-lb` (70); datasets `/data` (17),
  `/data-mny`, `/data-tny`, `/data-lb` (82); admin `/list`, `/list/themes`,
  `/list/manage_pattern/27/theme`; auth `/auth/manage/users`, `/auth/manage/groups`.
- A swap is verified when the button's live class set equals the `UI.Button` named style exactly
  (parse the named styles out of `Button.theme.jsx`) and any removed layout class changes no width.
- Project themes unchanged: the HEAD-baseline pixel diff (memory `reference_baseline_pixel_diff`;
  baseline Vite on :5198 needs its own `cacheDir`, or pages go blank with 504 "Outdated Optimize Dep").
- Lint against HEAD: `git show HEAD:<path> | npx eslint --stdin --stdin-filename <path>`; build with
  `npx vite build`.

**Rules that hold for all of this (owner):**
- Only the default theme changes; project themes keep their look via `_legacy/{ui,pages,datasets}.js`.
- Keep each const in its component's own `.theme.js`; no shared controls.js.
- className → activeStyle is per usage; only simple ones wholesale; list them for the owner first.
- Mockup first and confirm before implementing; mirror real edits into the mockups.
- Ink is primary; cobalt only for links in text, activity / running, logos, pattern-type pills.

## Decisions — answered (owner, 2026-10-13: "ink for P1, yes to P2 and P4, colors are fine for P3")

- **P1 → ink solid.** Primary = `--t-ink` fill, `--t-paper` text. The same ink marks the active filter
  chip and the active segment of segmented controls. No cobalt on controls. Re-confirmed the same
  day after discussing a cobalt primary to match the default logo (owner: "let's continue using ink,
  and for the places i think it needs to be cobalt, we'll change it"). Cobalt primaries are opt-in,
  place by place, only where the owner asks. Record each one here with its location.
- **P2 → yes.** The admin side nav's active row matches the page side nav (well + ink, no cobalt).
- **P3 → keep the colours.** Pattern-type pills keep amber / cobalt / go, in one shape in both
  places (site list + add-pattern picker).
- **P4 → yes.** `UI.Table` gets a named 'list' style (header band, row rules only), which the admin
  and auth lists opt into; datasets list tables use the same look.
- Exceptions not objected to (kept): ~~metadata `btnInline` h42~~ (dropped 2026-10-13, fields go 32px), auth full-width h40 submit, the dark
  edit bar / Publish, amber "overrides inherited" in Permissions, theme-editor preview font.

## Objective

Owner, 2026-10-07: "take a look at all buttons including in admin pages, and all patterns, they
should look the same, and they all should have a pointer cursor. the danger buttons should share the
look, the add / update too. unless it's context based to have them look different. list all the
buttons that we need to change the look of." Extended the same day: "map status pills etc which can
and should share the look." Extended again 2026-10-07 to **tables** (see "Tables" below): "the table
at overview, table and tasks pages are all different looking. do you think it's better to pick one
style for them?" → recorded here; then "make a note to compare site list page table and any other
place tables show up on admin / auth / datasets patterns."

So, in the default (v6) theme:
1. Every **button** of the same kind looks the same in every pattern (admin, page, datasets, auth,
   forms, …), and every clickable control has `cursor-pointer`.
2. Every **status pill / badge / chip** of the same kind looks the same.
3. Every **read-only list table in a card** looks the same (data grids keep their own look).
4. Differences stay only where the context calls for it — and each one is written down with why.

## Deliverable 2 — the shared look (after the owner signs off the inventory)

Proposed structure (decide when we get here):
- One set of button + pill class strings for the default theme — e.g. named styles on `UI.Button`
  (`action`, `danger`, `dangerSolid`, `addUpdate`, `ghost`, `icon`) and a `UI.Pill` / status style
  set — and have the pattern themes point at those (or reuse the same constants) instead of each
  page carrying its own copy.
- Project themes: unchanged (legacy) unless they opt in — same rule as the rest of the v6 work.
- `cursor-pointer` on every button style; `disabled:cursor-not-allowed`.

## Testing checklist

- [ ] Table inventory (site list page + admin / auth / datasets tables) reviewed with the owner, each
      table tagged data grid / list table
- [ ] All list tables on one shared style; data grids unchanged

- [ ] Inventory table reviewed + approved by the owner (kinds, exceptions)
- [ ] Every listed element restyled; live walk shows no clickable without `cursor: pointer`
- [ ] Default theme light + dark; MNY / transportny unchanged
- [ ] `npm run build` clean; eslint vs HEAD on touched files
