# Adding an in-page-nav rail ("on this page" sidebar)

**Outcome:** give a page a sticky right- (or left-) hand rail that lists the page's
sections as jump links, highlights the section you're scrolled to (scroll-spy), and can
host authored "related" content below the nav — all author-toggleable and brand-themeable,
no per-page code.

This is the page pattern's in-page nav. It is a **distinct layout region** (an `<aside>`
beside the content), not a section on the content grid. Worked example: the MAP-21 page
`map_21` (2173915) in `npmrdsv5+npmrds_sub`.

---

## The four moving parts

| Part | Where | What |
|---|---|---|
| **Toggle** | page field `item.sidebar` = `'left'` / `'right'` / unset | turns the rail on + picks the side. Author UI: page settings → **"Show Content Sidebar"**. |
| **Nav items** | per-section field `navLabel` (+ optional `anchorId`) | a section with a `navLabel` shows in the rail and gets a clean DOM anchor id. Decoupled from `title`/`level`, so empty-title `h2`-headed sections work. Author UI: section menu → Display → **"Page Nav Label"**. |
| **Custom rail content** | a section group named `sidebar`, `position: 'sidebar'` | any section assigned to that group renders in the rail **below** the nav. Ordinary lexical/Card sections — fully editable. |
| **Styling** | theme `pages.sectionGroup.*` | the rail is themed entirely here (card, label, items, active state, the two-column layout). Brand overrides under its own `pages.sectionGroup`. |

Scroll-spy is automatic (a `useScrollSpy` IntersectionObserver in `InPageNav`); no wiring.

## Recipe (via the DMS CLI)

`navLabel`/`group` live on the **section component row** (the stored `draft_sections` are
just `{id, ref}`; the full section — incl. `group` = band id and `navLabel` — is hydrated
at render). So set `navLabel` on the section, not the page.

```bash
# 1. turn the rail on (right side)
dms page update <page> --set sidebar=right

# 2. label the sections you want in the nav (one per § header)
dms section update <sectionId> --set navLabel="Compliance snapshot"
#   anchorId is auto-slugged from navLabel; override with --set anchorId=custom-slug

# 3. (optional) custom rail content — add a `sidebar` group, then a section in it
#    add {name:'sidebar', position:'sidebar', index:N} to the page's
#    draft_section_groups AND section_groups (page update --set ...=<json>)
dms section create <page> --pattern <pat> --element-type lexical
dms section update <newId> --data '{"group":"sidebar", "element":{...}, ...}'
#    NB: `section create` makes a bare row — set the full data (size/group/element/
#    parent/border/...) with a --data replace, cloning a working section's shape.
```

Draft-only: this never publishes. `navLabel`s set on **draft** rows show the rail in
**edit** mode; publish (humans do that) to carry them to the published view.

## Gating (which band the rail attaches to)

The rail renders next to the band that holds the nav sections — specifically the group of
the **first section carrying a `navLabel`** (`sections.find(s => s.navLabel)?.group`), with
a `'default'` fallback for legacy docs pages. This is robust to pages whose bands all share
`position: 'content'` (differing only by `theme`), where "first content group" would wrongly
land on a header band.

## Theme keys (`pages.sectionGroup`)

Layout (owns the content↔rail two columns — **this lives in the pages theme, not the shared
`layoutGroup` style**; rendered inside the band, so a band that doesn't opt into a rail is
byte-identical):
- `contentRow` — the flex row wrapping `[content][rail]`. **Must be `items-stretch`** so the
  rail column is full band height and its inner `sticky` has room to pin (`items-start`
  collapses the column and kills sticky).
- `contentCol` — `flex-1 min-w-0` (content takes the remaining width).
- `sideNavContainer1/2/3` — rail width + responsive (`hidden xl:block`), the **sticky**
  wrapper (`sticky top-[Npx] h-[calc(100vh-…)]` — tune `top` for the page header offset),
  and the vertical stack of rail blocks.

Nav card:
- `navWrapper` (card chrome), `navLabelText` (the label string, e.g. `"On this page"`),
  `navLabel` (label classes), `navList`, `navItem`, `navItemActive` (scroll-spy highlight).

Minimal neutral defaults ship in `patterns/page/components/sections/sectionGroup.theme.js`
(plain links, no card, empty label) so a site without a brand `pages.sectionGroup` still
gets a working rail. transportny's block is the worked brand example (white card, mono
"ON THIS PAGE" label, slate items, amber active).

## Source of truth

- `patterns/page/components/sections/sectionGroup.jsx` — renders `contentRow` →
  `[contentCol | rail]`; rail = `<InPageNav>` + the `sidebar`-group sections.
- `patterns/page/components/sections/InPageNav.jsx` + `useScrollSpy.js` — the nav + active state.
- `patterns/page/pages/_utils/index.js` `getInPageNav` — collects nav items (the `navLabel`
  branch + the legacy title/level-1 branch) and `slugifyAnchor`.
- `patterns/page/components/sections/section.jsx` — emits the clean `id={anchorId}` + scroll-mt.
- Task: `planning/tasks/completed/in-page-nav-themeable-sidebar.md` (full build log + BC notes).
