# nav: `rootPath` opt-in on authored navItems (cross-pattern secondary navs)

## Status: DONE 2026-08-26 (two additive branches in utils/nav.js)

## Objective
`theme.navOptions.secondaryNav.navItems` lets a pattern show an authored nav
(`topNav.nav: 'secondary'`), but `dataItemsNav`/`getChildNav` always prefix the CURRENT
pattern's baseUrl — so a secondary nav pointing at ANOTHER pattern's pages (the MitigateNY
actions pattern showing the county plan's nav; county plans serve at the site root of each
county subdomain) could not produce working links short of full absolute URLs (which drop SPA
navigation).

## Change (BC)
An authored nav item may set **`rootPath: true`** — its `url_slug`/`path` resolves to a **full
URL on the viewer's own origin** (`window.location.origin` + `/<path>`; SSR emits the bare root
path, hydration upgrades). Owner call 2026-08-26: cross-pattern links must be absolute, not
relative — the destination is another pattern's document, so the click should be a normal page
load that stays subdomain-correct. Both `dataItemsNav` (top level) and `getChildNav` (children)
honor it; page-derived dataItems never carry the flag, so nothing existing changes.

**TopNav absolute-URL handling (required by the above, equally BC):** `TopNavItem` now (a)
navigates absolute destinations via `window.location.assign` — react-router's `navigate()`
mangles full URLs into garbage paths — and (b) computes its active-state `useMatch` from a
same-origin absolute URL's *pathname*, so the county-nav item still highlights while browsing
that section. Submenu children render through the same `TopNavItem`, so they inherit both.
(`ABSOLUTE_URL` is now exported from `utils/nav.js`.)

## Motivating use
Actions pattern `2265530` (app `mitigat-ny-prod`): its theme now carries a generated copy of the
county template pattern's (1300890) two-level page nav as `secondaryNav.navItems` (all
`rootPath: true`) with `topNav.nav: 'secondary'` — regenerate with
`scratchpad/mitigat-ny-prod-prod/set_actions_secondary_nav.cjs` when the template's pages change
(the copy is a snapshot, not a live link).
