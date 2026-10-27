# A default-theme SideNav style: the icon rail

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** built · **Release:** commit — `src/dms` submodule (uncommitted in the working tree) · **Created by:** amuro@albany.edu · **Edited by:** —

**For:** the chat pattern ([`chat-pattern-implementation.md`](../../../../../planning/tessera/tasks/current/chat-pattern-implementation.md)),
whose mockups narrow the site nav to icons — but it is a **default-theme style**, available to any
pattern, not chat-specific code.

## Objective

Add a third named style to the library default theme's `sideNav.styles`, matching the site rail in
the v6 chat mockups (`design_system_v6/pages/chat*.html`): the site nav narrowed to a 56px icon rail.
A site selects it per pattern in the **theme settings** — Layout's `sideNav.activeStyle` — exactly as
it selects `admin` today.

Why it belongs in the default theme rather than in the chat pattern: the default theme *is* tessera
v6, the mockups are its own design language, and any pattern whose surface wants its width (a map
editor, a console, a future workspace) has the same need.

## What was added

`packages/dms/src/ui/components/SideNav.theme.jsx` — `styles[2]`, `name: 'icon rail'`, sparse in the
shape `admin` established (only the keys that differ; `getComponentTheme` fills the rest from
`styles[0]`):

- `layoutContainer1/2` — `lg:pl-14`, a 56px fixed column
- `sidenavWrapper` — `well` ground, the furniture tone of the v6 three-tone model
- `logoWrapper` — centres the mark, hides the wordmark (`[&_a>div+div]:hidden`) and caps the image
- `itemsWrapper` / `navItemRow` — a centred column of 40px tiles
- `navitemSide` / `navitemSideActive` — hover on `paper`; **active is a raised `panel` tile with a
  border**, not an accent (see below)
- `menuIconSide*` — 20px icons, graphite → ink
- `indicatorIconWrapper`, `sectionHeading`, `navLabel`, `subMenuWrapper_*` — hidden: an icon rail has
  no room for carets, group headings or child pages
- `bottomMenuWrapper` — ThemeToggle / UserMenu stacked at the foot

## Two decisions worth knowing before reusing it

1. **Active is a raised tile, not an accent.** The rail is the furniture tone (`well`); the active
   item is a `panel` tile with a hairline — the figure/ground move the mockups use. No cobalt: on a
   chat surface the accent means *unread*, and one colour with two meanings stops being readable.
2. **The label still renders, invisibly.** `SideNavItem` puts the icon and the label-link **side by
   side** — the icon is not inside the link — so hiding the label outright leaves the icon
   unclickable. The style instead stretches the link over the whole row
   (`navItemContent: absolute inset-0 … text-transparent`) and makes its text transparent: one click
   target, and the accessible name stays in the DOM for screen readers.

## Known gap

**No hover tooltip.** The mockups show one, and this style cannot: a CSS tooltip needs the label in
an attribute (`title`, or a `data-*`), and `SideNav` renders it only as a text node. Adding
`title={navItem.name}` to the item's `Link` in `SideNav.jsx` would make it possible for every style —
worth doing, not done here, because it is a markup change to a shared component and wants its own
review.

Second-order: **an item with no icon renders as a blank tile.** `theme.forcedIcon` exists for exactly
this (`SideNav.jsx:218`) and a site can set it; this style does not, since any sensible default would
be wrong for someone.

## Testing Checklist

Verified live (sandbox site on the local server, chat pattern, `sideNav.activeStyle: 'icon rail'`):

- [x] Rail renders at **56px**; the content column offsets by the same
- [x] Nav items render as 40px tiles, icons centred; the whole tile is one click target
      (link measured 38×38) and navigates
- [x] Active item is a `panel` tile with a `rule` border — light: `#FFFFFF` on `#EFEEE6`
- [x] **Dark** (ThemeToggle in the rail): `#1B1D23` tile on `#17181D` rail — the same figure/ground
      relationship, which is the v6 tone rule holding in both lamps
- [x] `bottomMenu` widgets (ThemeToggle, UserMenu) render stacked at the foot
- [x] The accessible name is still in the DOM for each item
- [ ] Not checked: a style with **child pages** (`subMenuWrapper_*` are hidden — intended, but no
      live nav with depth was tried), a **logo with an image**, and the mobile (`max-lg`) collapse
- [ ] Not checked: the other two styles (`default`, `admin`) after this edit — the change is additive
      (a new array entry), so nothing existing should move, but nobody has re-looked at them

## Log

- **2026-10-21** — Added and verified in both lamps. Status `built`: uncommitted in the `src/dms`
  submodule, alongside the other library change from this session
  ([falcor-writes-not-broadcast.md](./falcor-writes-not-broadcast.md)).
