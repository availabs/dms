# Merge mny and mny_admin themes — eliminate duplication, verify against defaultTheme

## Objective

`src/themes/mny/theme.js` (public site) and `src/themes/mny/admin.theme.js` (admin console,
`export default {...mny, ...theme, Icons}`) accumulated large amounts of duplicated and stale
theme content over time. Already fixed in a prior session: `heading`, `button`, `label`,
`attribution`, `filters`, `graph`, `pageOptions`, `levelClasses`, `pageControls`, `navPadding`
(dropped from mny_admin, identical to mny, inherited via spread), `table` (mny was stale —
missing keys the component reads; hoisted mny_admin's complete version into `mny`, mny_admin now
inherits), `lexical` (mny_admin's copy used a pre-refactor nested-key schema the renderer no
longer reads at all — removed, now inherits mny's modern flat-key version), top-level
`sectionArray` in mny_admin (dead code — component only reads `pages.sectionArray`; deleted, no
gap since every "missing" key was already provided by the shipped component default
`sectionArrayTheme` via `ui/defaultTheme.js`'s `pages: pagesTheme` merge).

This task finishes the sweep across the **remaining** top-level keys (and `pages.*` sub-keys).

## Method (per key/subtree)

1. **Find actual use** — grep the consuming component(s) for every theme field it reads (not
   just the top-level key name — the specific `getComponentTheme(theme, '<path>')` path and every
   sub-field accessed).
2. **Check against defaultTheme** — find the component's own shipped default (`ui/defaultTheme.js`
   for generic UI components; `patterns/page/defaultTheme.js`, `patterns/admin/defaultTheme.js`,
   etc. for pattern-specific ones — remembering `ui/defaultTheme.js` itself merges the page
   pattern's `pagesTheme` in under `pages:`). `mergeTheme()` deep-merges the site theme on top of
   this default, so **any key whose site-theme value is absent is silently backfilled from the
   default** — that's not a gap, just something to note for the final report.
3. **Decide, per differing key**:
   - Value differs from default **and is identical between `mny` and `mny_admin`** → keep/move it
     to live in `mny` only; delete the duplicate from `mny_admin` (inherits via `...mny` spread).
   - Value differs from default **and only `mny_admin` customizes it** → leave it in `mny_admin`
     only.
   - Value differs from default **and only `mny` customizes it** → leave in `mny` only.
   - Value is **identical to default** → do **NOT** delete it as part of this pass. Just record it
     in the final "matches defaultTheme" list — a separate, deliberate decision for later.
4. Verify every change by bundling both files with esbuild and diffing the resolved objects
   before calling it done (established pattern from the table/lexical/sectionArray fixes).

## Checklist

### Top-level keys still needing the treatment

- [x] `layout` — mny and mny_admin values genuinely differ from each other AND from
  `Layout.theme.jsx`'s default. Public site vs admin console legitimately need different page
  wrapper layout. No consolidation possible; left as-is in both files.
- [x] `sidenav` — same finding: mny/admin/default all three differ (admin console nav structure
  is genuinely different from the public site's). Left as-is.
- [x] `topnav` — same finding: all three differ. Left as-is.
- [x] `layoutGroup` — same finding: all three differ. Left as-is.
- [x] `logo` — same finding: all three differ. Left as-is.
- [x] `tabs` — **correction, consolidated (not "differs by design" as first logged).** mny_admin's
  `styles[]` was actually a near-duplicate of mny's, just missing mny's middle (unnamed) entry —
  mny has 3 styles (`[0]` default, `[1]` unnamed `#37576B`/`aria-selected` variant, `[2]`
  `'pages-pane'`), mny_admin only had 2 (`[0]` identical default, `[1]` `'pages-pane'`).
  `getComponentTheme` resolves `styles[activeStyle]` by **raw array index before** falling back to
  name-matching, so a numeric `activeStyle: 1` would have silently resolved to different content
  in mny vs mny_admin (mny's unnamed style vs. mny_admin's `'pages-pane'`) — a real landmine from
  the earlier dedup pass. Verified no consumer ever passes a numeric `activeStyle` for tabs — the
  three real call sites (`editPane/index.jsx:128`, `LayerEditor/index.jsx:72`,
  `Metadata.jsx:190`) use only name-based lookups (`'pages-pane'`, `'panel'`) or the default
  `options.activeStyle: 0`, and no admin UI control exists to set a numeric tabs style either.
  Safe to merge: deleted mny_admin's `tabs` key entirely — it now inherits mny's full 3-entry
  array via the `...mny` spread, so index `[1]` going forward means whatever mny's theme says.
- [x] `dataCard` — same finding: all three differ. Left as-is.
- [x] `icon` — mny_admin's copy had an extra `iconWrapper: ''` sub-key (matches
  `Icon.theme.js` default exactly, backfilled either way) but the substantive `icon` class string
  was byte-identical to mny's. Consolidated: deleted mny_admin's `icon` object entirely — it now
  inherits mny's value via the `...mny` spread, with `iconWrapper` correctly backfilled from
  `ui/defaultTheme.js`'s `iconTheme`.

### `pages.*` sub-keys

- [x] `pages.sectionGroupsPane` — lives only in `mny`, differs from
  `sectionGroupsPane.theme.js`'s `sectionGroupControlTheme` default (different colors/spacing).
  mny_admin's `pages` block is `{...mny.pages, sectionGroup: {...}, userMenu: {...}}` — already
  correctly inherits this via the spread, no independent redeclaration exists. No action needed.
- [x] `pages.sectionGroup` — mny_admin-only, genuinely differs from `sectionGroup.theme.js`'s
  default (`sideNavContainer1/2/3` values are admin-console-specific). Left in mny_admin only.
- [x] `pages.userMenu` — mny_admin-only, genuinely differs from `userMenu.theme.jsx`'s default
  (different named style `mny-responsive` entirely, container-query responsive layout, different
  colors). Left in mny_admin only.

### Admin-only generic UI component keys (check against `ui/defaultTheme.js`)

- [x] `menu` — **dead code, deleted.** Grepped the entire `packages/dms/src` tree for any
  consumer of a bare top-level `theme.menu` path (`theme?.menu`, `getComponentTheme(theme,
  'menu')`) — none exists. `Icon`/`Select`/`MultiSelect`/`ButtonSelect`/`navigableMenu` all read
  different theme keys (`multiselect`, `navigableMenu`, or none at all). `theme.admin.menu` (from
  `patterns/admin/defaultTheme.js`'s `menuTheme`) is a completely different namespace. Same class
  of bug as the old top-level `sectionArray`. Removed from `admin.theme.js`.
- [x] `popover` — **dead code, deleted.** Same grep, no consumer of bare `theme.popover` anywhere.
- [x] `select` — **dead code, deleted.** Same grep, no consumer of bare `theme.select` anywhere
  (`Select.jsx` defines no theme lookup at all; `MultiSelect.jsx` reads `multiselect`, not
  `select`).
- [x] `listbox` — **dead code, deleted.** Same grep, no consumer of bare `theme.listbox` anywhere.
- [x] `input` — kept in mny_admin only. Real customization: the `input`/`inputContainer`/
  `textarea` fields deliberately use Headless-UI data-attribute variants (`data-[hover]:`,
  `data-[invalid]:`, `data-[disabled]:`) instead of `Input.theme.js`'s native pseudo-class
  variants (`hover:`, `aria-invalid:`, `disabled:`) — a genuine, deliberate admin-console
  difference, not accidental drift. Sub-fields `confirmButtonContainer`/`editButton`/
  `cancelButton`/`confirmButton` are byte-identical to the default (List B candidates, not
  deleted).
- [x] `field` — kept in mny_admin only. `field`/`label`/`description` all genuinely differ from
  `FieldSet.theme.js`'s default (different colors, added `data-[disabled]:opacity-50`). No default
  exists for `labelRow` in mny_admin's copy — silently and correctly backfilled from the shipped
  default.
- [x] `dialog` — kept in mny_admin only. `backdrop`/`dialogContainer2`/`dialogPanel` all
  genuinely differ from `Dialog.theme.js`'s default (different structure, added Headless-UI
  transition/data-state classes). `sizes` sub-object is byte-identical to default (List B
  candidate, not deleted).
- [x] `nestable` — kept in mny_admin only (mny has no `nestable` key at all — public site has no
  drag-reorder nav UI). Compared to `draggableNav.jsx`'s `nestableTheme` default: `navItemContainer`
  /`navItemContainerActive`/`navLink` genuinely differ (missing `px-2`/`px-4` variations, tweaked
  text truncation); `container`/`navListContainer`/`subList`/`collapseIcon`/`dragBefore` are
  byte-identical to default (List B candidates, not deleted).

### Admin-pattern-specific keys (check against `patterns/admin/defaultTheme.js`)

- [x] `admin` — mny_admin's `admin.navOptions` and `admin.page` are **byte-identical** to
  `ui/defaultTheme.js`'s shipped `theme.admin.navOptions`/`theme.admin.page` values. Matches
  default exactly — List B candidate, not deleted as part of this pass (per the "no deletion
  spree" rule).
- [x] `compatibility` — mny_admin's `"border-[#191919] pt-[41px]"` is **byte-identical** to
  `ui/defaultTheme.js`'s shipped top-level `compatibility` value. List B candidate, not deleted.
- [x] `docs` — **dead code, deleted (~1005 lines).** Grepped for any consumer of `theme.docs` /
  `getComponentTheme(theme, 'docs')` anywhere in `packages/dms/src` — none exists. The admin
  theme-editor's component-preview panel (`patterns/admin/pages/patternEditor/default/
  themeEditor.jsx:103`, `patterns/admin/pages/themes/editTheme.jsx`) lazy-loads sample docs from
  `ui/docs.js`'s own hardcoded `output` object (built from each component's local `.theme.jsx`
  sibling `docs` export, e.g. `Dialog.theme.jsx`'s `export const docs = {...}`) — completely
  independent of any site theme's `docs` key. mny_admin's `docs` block was a huge orphaned sample-
  data dump (a full page's edit-history/props tree under `docs.PageView`) that nothing reads.
  Deleted the entire key. File shrank from 1631 → 626 lines.

## Final report

### A. Keys/values consolidated or removed in this pass

**Dead code deleted from `mny_admin` (no consumer reads these paths at all):**
- `menu`, `popover`, `select`, `listbox` (bare top-level — different namespace from
  `admin.menu`/etc.; no component reads these paths)
- `docs` (~1005 lines — a page-preview sample-data dump; the theme editor's actual doc previews
  come from `ui/docs.js`, unrelated to a site theme's own `docs` key)

**Duplicate customization consolidated (moved to live in `mny` only):**
- `icon` — mny_admin's copy was functionally identical to mny's (only added a redundant
  `iconWrapper: ''` that already matches the shipped default); deleted from mny_admin, now
  inherited via the `...mny` spread.
- `tabs` — mny_admin's `styles[]` was a near-duplicate of mny's missing one entry (mny has 3
  styles, mny_admin had 2 — see checklist note above for why the missing entry was a real
  index-resolution landmine, not just cosmetic). Confirmed no consumer ever references tabs by
  numeric `activeStyle`; deleted mny_admin's `tabs` key entirely, now inherits mny's full array via
  the `...mny` spread.

**Confirmed already correctly deduplicated (no action needed):**
- `pages.sectionGroupsPane` — mny_admin's `pages` block already does `{...mny.pages, ...}` with no
  independent redeclaration; inherits cleanly.

*(Carried over from the prior session, already fixed before this task file was written: `table`
hoisted from mny_admin into `mny`; `lexical` — mny_admin's dead pre-refactor copy removed, now
inherits mny's modern version; top-level `sectionArray` — dead orphaned key, deleted.)*

**Confirmed genuinely admin-only or public-only (correctly stay separate, not consolidated):**
`layout`, `sidenav`, `topnav`, `layoutGroup`, `logo`, `dataCard` (all three of mny/
mny_admin/default differ from each other — legitimately different console vs. public-site
layouts), `input`, `field`, `dialog`, `nestable` (admin-only UI surfaces the public site has no
use for; each genuinely customizes its component's default), `pages.sectionGroup`,
`pages.userMenu` (admin-only page-editor chrome), `admin.navOptions`/`admin.page` structural
shape (see List B — values match default, but the key itself is admin-console-only), `docs` was
the only one worth removing wholesale — the ones above have genuine, deliberate content.

### B. Keys that remain in mny/mny_admin but are identical to the shipped `defaultTheme` value

(Informational only — **not** deleted as part of this task, per the "no deletion spree" rule.)

- `admin.navOptions`, `admin.page` (mny_admin) — byte-identical to `ui/defaultTheme.js`'s shipped
  `theme.admin.navOptions` / `theme.admin.page`.
- `compatibility` (mny_admin) — byte-identical to `ui/defaultTheme.js`'s shipped top-level value.
- `input.confirmButtonContainer`, `input.editButton`, `input.cancelButton`,
  `input.confirmButton` (mny_admin) — byte-identical to `Input.theme.js`'s defaults. (The rest of
  `input` — `input`, `inputContainer`, `textarea` — is a genuine deliberate override, so the key
  as a whole stays.)
- `dialog.sizes` (mny_admin) — byte-identical to `Dialog.theme.js`'s default `sizes` map.
- `nestable.container`, `nestable.navListContainer`, `nestable.subList`, `nestable.collapseIcon`,
  `nestable.dragBefore` (mny_admin) — byte-identical to `draggableNav.jsx`'s default
  `nestableTheme`. (`navItemContainer`/`navItemContainerActive`/`navLink` genuinely differ, so the
  key as a whole stays.)
