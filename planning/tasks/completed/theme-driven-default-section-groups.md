# Task: Theme-driven default section groups (seed content + sidebar on page creation)

**Topic:** patterns/page (page creation / section groups) + pages theme
**Status:** ✅ **DONE 2026-06-09** — implemented + verified live (new-page backfill seeds
`default`+`sidebar`; rail renders when toggled on; map_21 regression clean).

## Objective

New pages should be seeded with their default **section groups** from the **pages pattern
theme**, and that default set must always include a **`sidebar`** group so the in-page-nav
rail has an author-reachable content area on every page. Today there is no theme-driven (or
even creation-time) scaffold — groups are created lazily by a backfill with hardcoded
literals, and a `sidebar` group is never part of it.

Follow-on from `in-page-nav-themeable-sidebar.md`: the rail's "add content here" area is a
`SectionArray` scoped to a `sidebar` section group; that group currently only exists on pages
where it was created by hand (CLI). The section-groups pane (`SECTION_TARGETS =
["top","content","bottom"]`) deliberately hides `position:'sidebar'`, so authors can't create
it — hence it must be seeded automatically.

## Decision (user, 2026-06-09)

**"Content + sidebar from a theme style"** — keep header/footer conditional as today, but page
creation always creates a `content` group **and** a `sidebar` group, using a **sane simple
default-theme setting** for the layoutGroup style. (Not the full "whole scaffold array in the
theme" option — that's a heavier future refactor.)

## Current state

- `newPage` (`editFunctions.jsx:70`) creates a **bare** page (no `section_groups`).
- The de-facto group creator is the lazy **`sectionsEditBackill`** (`_utils/index.js:174`),
  which runs on first edit when `!item.draft_section_groups` and hardcodes
  `[{name:'default', position:'content', index:0, theme:'content'}]` (+ conditional
  header/footer). Called from `edit/index.jsx:99`, where `theme` is in scope.
  (`sectionsBackill`, the view-mode twin, is commented out — ignore.)
- The section-groups pane hides `position:'sidebar'` groups (intentional — they're not bands).

## Changes

1. **`sectionGroup.theme.js` (default theme)** — add the sane simple setting:
   `defaultStyle: 'content'` (the layoutGroup style name used for the seeded content + sidebar
   groups; unknown names resolve to layoutGroup style 0, so it's safe on any theme).
2. **`_utils/index.js` `sectionsEditBackill`** — accept `theme`; read
   `theme?.pages?.sectionGroup?.defaultStyle`; seed BOTH a `default` content group **and** a
   `sidebar` group (`position:'sidebar'`). Keep the content group **named `default`** (BC: the
   `SectionArray` `!v.group && group.name==='default'` fallback depends on it — do NOT rename
   to `content`).
3. **`edit/index.jsx:99`** — pass `theme` into `sectionsEditBackill`.
4. **`sectionGroup.jsx`** — synthesize a `sidebar` group object when the page doesn't have one
   (so existing pages predating change 2 still get the rail content area), and make the rail
   render whenever `item.sidebar` is set even with no `navLabel`s (`railGroupName` falls back
   to the first content band, then `'default'`).

## BC notes

- Content group stays `name:'default'` → ungrouped sections still render there.
- Backfill only adds the sidebar group to pages that have no groups yet; existing pages get
  the rail content area via the render-time synthesis (change 4), no migration needed.
- The sidebar group is `position:'sidebar'` → never drawn as a band; invisible in the pane by
  design (accepted).

## Testing checklist

- [x] A freshly created page, opened in edit, gets `default` + `sidebar` groups (backfill).
      Verified live: throwaway page → `draft_section_groups: [{default,content},{sidebar,sidebar}]`.
- [x] Toggling the rail on with NO `navLabel`s still renders the rail. Verified: rail column
      renders (x=1346, w=302) on the empty page; `InPageNav` returns null (no card) until a
      section has a `navLabel`.
- [x] Existing page (map_21) still renders the rail correctly (regression). Verified: 6 nav
      items + "Related" card, no page errors.
- [x] Existing page without a real `sidebar` group gets the rail content area via synthesis —
      by code path (`sidebarGroup = find(...) || {synthesized}`, always passed to the rail's
      `SectionArray`).
- [ ] `defaultStyle` override in a brand theme changes the seeded groups' style (not separately
      tested; `theme?.pages?.sectionGroup?.defaultStyle` read, falls back to `'content'`).

## Status: implemented + verified 2026-06-09 (ready to close pending review)
