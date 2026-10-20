# Default Layout: logo and user menu below lg (mobile TopNav)

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** todo · **Created by:** ssangdod@albany.edu · **Edited by:** —

Split out of [datasets-page-pattern-v6-port.md](../completed/datasets-page-pattern-v6-port.md) (owner 2026-10-15: "move
mobilenav to a separate task"). First flagged on page 1 of the port, 2026-10-06
([datasets-v6-port-pages.md](../completed/datasets-v6-port-pages.md)).

## Objective

Below `lg`, the default theme shows no logo and no user menu (nor site nav or the theme toggle). Owner
(2026-10-06): "logo and user menu must both be visible."

## Cause

They live in the SideNav (`topMenu: Logo`, `bottomMenu: ThemeToggle + UserMenu`), and the SideNav is
`max-lg:hidden`. The default theme's TopNav is `size: 'none'`, so nothing renders above the page below lg.
Same on the datasets and page patterns. `TopNav.theme.jsx` already has a `lg:hidden` `mobileButton`, but the
TopNav itself never renders in the default theme.

## Proposed approach (to confirm with the owner, mockup first)

A Layout capability, not a one-off: let the TopNav turn on only below a breakpoint (e.g. a responsive
`topNav` size / `showBelow: 'lg'` option in the Layout theme), carrying Logo + UserMenu (+ ThemeToggle, and
the mobile menu button for the site nav). Authors keep control through the Layout theme options.

1. Mockup: a 390px state of an existing v6 page (catalog, page view) with the mobile bar.
2. Library: the Layout / TopNav option; default theme turns it on below lg.
3. Project themes unchanged (they set their own `topNav`); verify with the HEAD-baseline pixel diff.

## Files requiring changes (expected)

- `packages/dms/src/ui/components/Layout.jsx`, `Layout.theme.jsx`
- `packages/dms/src/ui/components/TopNav.jsx`, `TopNav.theme.jsx`
- `src/themes/tessera/design_system_v6/scripts/` (mockup)

## Testing checklist

- [ ] Default theme at 390 / 768 / 1024 / 1440: logo + user menu visible at every width, no duplicate above lg
- [ ] Site nav reachable below lg (mobile menu)
- [ ] MNY / TNY v2 / landbank unchanged (HEAD-baseline pixel diff)
- [ ] Build clean; eslint on touched files vs HEAD
