# Link pages: a page whose only job is to be a nav entry pointing somewhere else

## Status: IMPLEMENTED 2026-09-08 — all five phases; unit-tested + live-verified

Live verification ran against `npmrdsv5/dev2` (throwaway `page_test` pattern, temporary
page created and deleted) and `mitigat-ny-prod` `county_template` for the BC pass.
14 new unit tests in `tests/navLinkPages.test.js`; full suite 293/293 green; production
build clean. See the Testing Checklist at the bottom for exactly what was and wasn't
exercised.

## Objective

Let an author create a **page that is only a link**. It appears in the page tree and in the
site nav exactly like any other page — same title, icon, parent, index, `hide_in_nav` — but it
has no sections, and clicking it navigates to a destination the author typed instead of
rendering content.

The motivating need: a page pattern's nav must be able to point at **another pattern's pages**
while nav authoring stays in the page tree, where authors control it. Today the only way to do
that is to hand-author `theme.navOptions.secondaryNav.navItems` on the pattern row (see
[nav-rootpath-items.md](./nav-rootpath-items.md)), which takes the nav out of the author's hands
and has to be re-hand-maintained in every cloned pattern.

Consumer: [MitigateNY county template ⇄ actions pattern](../../../../../../planning/mitigateny/tasks/current/county-template-actions-nav-links.md),
which is **blocked on this task**.

## Scope

**In scope** — a new page attribute, the `utils/nav.js` branches that turn it into a nav path
(top level *and* children), a view-mode redirect when someone lands on the page directly, and the
author-facing control in the page settings pane.

**Out of scope** — changing how `theme.navOptions.secondaryNav.navItems` works (that mechanism
stays, unchanged and BC); any MitigateNY data edits; deprecating the actions pattern's existing
hardcoded secondary nav (a possible follow-on, noted at the bottom).

---

## Current State

### `utils/nav.js` is the single nav builder, and it already does most of this

`dataItemsNav(dataItems, baseUrl, edit, getInPageMenuItems)` (nav.js:64-116) builds the nav from
**both** page dataItems and authored theme navItems — `patterns/page/pages/view.jsx:64-72` calls
it twice, once with `dataItems` (main nav) and once with
`theme?.navOptions?.secondaryNav?.navItems` (secondary nav).

It already understands four destination forms, but **only authored navItems ever carry them**,
because nothing writes them onto a page row:

| Field | nav.js | Behaviour |
|---|---|---|
| `rootPath: true` | 22-25, 45-47, 92-96 | `toRootUrl()` → full URL on `window.location.origin`, skipping `baseUrl` and the `/edit` prefix. SSR emits the bare path; hydration upgrades. |
| absolute URL | 15, 92-93 | `ABSOLUTE_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i` → emitted verbatim. |
| `sub://<subdomain>/<path>` | 85 → `utils/subdomainPath.js:28-36` | Resolved against the current host's base domain at render time. |
| `noLink` / `type: 'label'` | 74-84 | An unlinked header/divider row: `{id, name, className, sectionClass, hideInNav}`, no `path`. |
| `path` | 85 | Fallback for `url_slug`. |

So this task is mostly **"let a page row carry what an authored navItem can already carry"**, not
a new mechanism.

### Two asymmetries in nav.js that this task has to deal with

1. **`getChildNav` (nav.js:36-59) is a separate code path from `dataItemsNav` (nav.js:64-116).**
   It honours `rootPath` but has **no `ABSOLUTE_URL` branch and no `noLink` branch** — a child
   navItem with an `http(s)://` value today gets `baseUrl` glued to the front and produces a
   broken link. That is a pre-existing bug, and it is directly load-bearing here because the
   motivating MitigateNY link pages are **children** (under "Track Progress"), not roots.
2. **`getChildNav` filters `hide_in_nav` itself (nav.js:37); root items don't.** Roots keep
   `hideInNav` on the object and `ui/components/Layout.jsx:63` drops them. Note Layout only
   filters the `"main"` nav — `"secondary"` is passed through raw.

### How a nav item becomes a link

`ui/components/Layout.jsx:58-90` is the fan-out. `"main"` goes through `resolveNav` →
`nav2Level` (`patterns/page/pages/_utils/index.js:71-89`), which is what implements `navDepth` /
`navTitle`; `"secondary"` does not. Both `SideNav` and `TopNav` read **`item.path`** and nothing
else (`item.url` / `item.to` do not exist anywhere).

The two renderers differ, and the difference matters for this design:

- `SideNav.jsx:250-254` — `<Link to={To[0]}>`; active state from
  `useMatch({ path: `${subTos[0]}/*` })` at **SideNav.jsx:184**, with **no absolute-URL
  handling**. Give SideNav a full `https://host/...` path and the item never highlights.
- `TopNav.jsx:194-202` — a div + click handler: `if (isAbsolute(To[0])) window.location.assign(...)
  else navigate(...)`, with `matchBase` (TopNav.jsx:155-164) reducing a same-origin absolute URL
  to its pathname so `useMatch` still works.

### Routing: all patterns share one flat router

`render/spa/utils/index.js:288-399` returns a **flat array** of routes — one set per pattern per
mount — spread into `createBrowserRouter` (`render/spa/dmsSiteFactory.jsx:162-172`). React Router
ranks by specificity before matching, so a pattern at `/actions` (`path: "/actions/*"`, score 12)
always wins over a pattern at `/` (`path: "/*"`, score 1) regardless of array order.

**Consequence for this design:** a plain site-absolute path (`/actions/dashboard`) is already a
valid in-app route on any subdomain where the target pattern is mounted. It works as a normal
`<Link>`, keeps SPA navigation, and `useMatch` highlights it. That makes a **path** strictly
better than `rootPath` for the sidenav case.

### There is no page-level link/redirect concept today

No `redirect`, `external`, `href`, `link_only`, or `isLink` attribute exists in
`patterns/page/page.format.js`, and nothing in `pages/view.jsx` branches on one. The only
first-class external-link concept in DMS is `isLink` / `isLinkExternal` on **Card and table
column** attributes (`ui/components/Card.jsx:402,459,620-624`,
`ui/components/table/components/TableCell.jsx:32-37,108`,
`.../ComponentRegistry/Card.config.jsx:341-358`).

---

## Proposed Changes

### The field

One new page attribute, **`nav_link`** (text, default unset).

Declared properly in `page.format.js` rather than following the `icon` / `show_in_footer` /
`is_cover_page` precedent of runtime-only undeclared keys — this one changes routing behaviour,
so it should be greppable from the format.

Accepted value forms, all of which the existing downstream code already handles:

| Value | Resolves to | Use |
|---|---|---|
| `/actions/dashboard` | same path, no `baseUrl` prefix | **the primary case** — another pattern on this host; client-side `<Link>`, working active state |
| `sub://county_template/the_plan` | `https://county_template.<basehost>/the_plan` | cross-subdomain |
| `https://example.org/x` | verbatim | external |

**Design note — path, not `rootPath`.** `rootPath` was an owner call for authored secondary navs
(nav.js:17-21: cross-pattern nav links should be a normal document load). It is kept as-is and
stays available, but `nav_link` deliberately emits a **plain path** so the SideNav `<Link>` and
`useMatch` both work. A link page that genuinely needs a document load can use a `sub://` or
fully-qualified value.

**Design note — `baseUrl` is never prefixed onto `nav_link`.** The value is site-absolute by
definition. `dataItemsNav`'s existing top-level branch (nav.js:96) would leave a `/`-leading value
alone when `baseUrl` is `''`, but would corrupt it on a prefixed mount, so the new branch bypasses
the prefix logic entirely rather than relying on that.

### Phase 1 — attribute plumbing — DONE

- [x] `patterns/page/page.format.js` — add `{ key: "nav_link", type: "text" }` to the `//nav
      settings` block next to `hide_in_nav` (line 151).
- [x] `patterns/page/siteConfig.jsx` — add `"nav_link"` to the **list**-route `filter.attributes`
      (line 211-218) **and** the **view**-route `filter.attributes` (line 235-240).

      **This is the step that silently breaks everything if missed.** `filter.attributes` is what
      the loader requests; a field not in the list route's list never reaches `dataItems`, which
      is where the nav is built from — the feature would appear to do nothing with no error.

### Phase 2 — `utils/nav.js` — DONE

- [x] `dataItemsNav` (nav.js:64-116): when `d.nav_link` is set, use it as the destination —
      `resolveSubdomainPath(d.nav_link)`, then emit as-is (no `baseUrl`, no `/edit` prefix).
      Branch above the existing `url_slug` handling, below the `noLink`/`label` branch.
- [x] `getChildNav` (nav.js:36-59): **mirror the same branch.** Required — the motivating case is
      a child item.
- [x] `getChildNav`: while in there, add the missing `ABSOLUTE_URL` branch so a child with an
      absolute destination stops getting `baseUrl` prepended. Pre-existing bug, same few lines.
- [x] Keep the whole thing behind `if (d.nav_link)` — no page carries the field today, so every
      existing nav is byte-identical.

### Phase 3 — direct visits — DONE

A link page still has a `url_slug`, so `/<slug>` is a reachable route that would render an empty
page. Redirect instead.

- [x] `patterns/page/pages/view.jsx` — if the resolved `item.nav_link` is set, redirect:
      `<Navigate to={...} replace />` for an in-app path, `window.location.assign` for a foreign
      origin (mirror `TopNav.jsx:155-164`'s `isAbsolute` test rather than inventing a second one).
- [x] **View mode only.** `patterns/page/pages/edit/index.jsx` must keep rendering the page or the
      author can never edit the link again. The edit-pane page tree navigates by slug
      (`editPane/pagesPane.jsx:92`), so a link page stays reachable at `/edit/<slug>`.
- [x] In edit, render a short "this page is a link to X" stub in place of the section canvas
      rather than an empty section list.
- [ ] **NOT DONE — deliberately deferred.** Edge case: `siteConfig.jsx:216` notes the 0th page is
      used as `/` when no page is registered there. A link page sitting at index 0 on a pattern
      with no root page would therefore make the site root a redirect. Left alone because the
      fallback lives in the dms-manager wrapper rather than the page pattern, and no current site
      is in that shape. Revisit if someone hits it.

### Phase 4 — author-facing control — DONE

- [x] `patterns/page/pages/edit/editPane/settingsPane.jsx` — a `DebouncedInput` labelled
      **"Nav Link"** immediately under the existing "Hide in Nav" switch (line 349), writing
      `togglePageSetting(item, 'nav_link', v, apiUpdate)`.
- [x] Helper text naming the three accepted forms, since none of them are guessable.

### Phase 5 — polish — DONE (all four items shipped with the rest)

- [x] `patterns/page/components/PageTemplatePicker.jsx` — a **"Link"** entry so `+ Add Page`
      (`editPane/pagesPane.jsx:28`) can create one directly. `newPage`
      (`pages/edit/editFunctions.jsx:62-100`) now copies `nav_link` off the template.

      **Design note — the template seeds `nav_link: '/'`, not `''` as specced.** A page counts as
      a link page only while `nav_link` is non-empty (clearing the field is how you turn one back
      into an ordinary page). An empty seed would have produced an indistinguishable blank page,
      and the author would never see the canvas telling them what the page is. `/` is a valid,
      harmless placeholder they replace. The entry is **appended** to the theme templates, never
      prepended — the picker preselects `themeTemplates[0]`, and `+ Add Page` must keep defaulting
      to a real content page.
- [x] `.../ComponentRegistry/ExportPdf.jsx:109-152` carries a **hand-rolled duplicate** of
      `dataItemsNav`/`getChildNav` (no `noLink`, no `rootPath`, no `ABSOLUTE_URL`, no child
      `hide_in_nav` filter). Skip link pages there — they have no sections to print. Longer term
      this duplicate should just call the shared builder.
- [x] `ui/components/SideNav.jsx:184` — port `TopNav`'s `matchBase` so a same-origin absolute path
      highlights in the sidenav too. Not needed for `nav_link` (it emits a path), but it closes
      the `rootPath`-in-sidenav gap and stops the two renderers diverging further.
- [x] `patterns/page/components/search/SearchPage.jsx:133` — confirm link pages don't produce
      empty search hits.

---

## Files Requiring Changes

| File | Change |
|---|---|
| `packages/dms/src/patterns/page/page.format.js` | declare `nav_link` (near line 151) |
| `packages/dms/src/patterns/page/siteConfig.jsx` | `nav_link` into **both** `filter.attributes` lists (211-218, 235-240) |
| `packages/dms/src/utils/nav.js` | `nav_link` branch in `dataItemsNav` **and** `getChildNav`; add missing `ABSOLUTE_URL` branch to `getChildNav` |
| `packages/dms/src/patterns/page/pages/view.jsx` | redirect on `nav_link` (view only) |
| `packages/dms/src/patterns/page/pages/edit/index.jsx` | link-page editor stub |
| `packages/dms/src/patterns/page/pages/edit/editPane/settingsPane.jsx` | "Nav Link" input |
| `packages/dms/src/patterns/page/components/PageTemplatePicker.jsx` | *(P5)* "Link" page kind |
| `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/ExportPdf.jsx` | *(P5)* skip link pages in the duplicate nav builder |
| `packages/dms/src/ui/components/SideNav.jsx` | *(P5)* `matchBase` parity with TopNav |

### Files actually changed (2026-09-08)

Everything above, plus:

| File | Change |
|---|---|
| `packages/dms/src/patterns/page/components/LinkPageNotice.jsx` | **new** — the edit-mode canvas replacement |
| `packages/dms/src/patterns/page/components/LinkPageNotice.theme.js` | **new** — its theme sibling |
| `packages/dms/src/patterns/page/defaultTheme.js` | register `linkPageNotice` |
| `packages/dms/src/patterns/page/pages/edit/editFunctions.jsx` | `newPage` copies `nav_link` off a template |
| `packages/dms/tests/navLinkPages.test.js` | **new** — 14 tests |

**Design note — a shared `navPath()` helper, rather than the branch written twice.** The spec said
"mirror the branch into `getChildNav`". Mirroring is exactly how the two copies drifted in the
first place (that is the missing-`ABSOLUTE_URL` bug), so instead both call one module-local
`navPath(d, baseUrl, edit)` in `utils/nav.js`. This is not a convenience wrapper of the kind
`packages/dms/CLAUDE.md` warns about — it is five branches of real, previously-duplicated logic
with two call sites in the same file. Side effect: children now also get the `d.path` fallback and
`sub://` resolution, which they silently lacked.

**Design note — `nav_link` was NOT added to the edit route's `filter.attributes`.** The `edit/*`
child route in `siteConfig.jsx` carries no `filter` at all, and `api/createRequest.js:12-14` falls
back to requesting the whole `data` blob when `filter.attributes` is absent. The edit side already
sees the field.

**Incidental fix — `DebouncedInput` now forwards `...rest`.** It destructured `rest` and dropped it,
so a field config could not set `placeholder` (or anything else) on the underlying input. Needed for
the Nav Link hint text. `Input` destructures `label`/`description`/`activeStyle` out of its own
props, so the FieldSet config keys riding along are absorbed rather than leaked onto the DOM node.

---

## Backwards compatibility

Every change is an added branch gated on `d.nav_link`, which no existing row carries. Authored
`secondaryNav.navItems`, `rootPath`, `noLink`, and `ABSOLUTE_URL` behaviour are all unchanged. The
one behaviour change to existing data is the `getChildNav` `ABSOLUTE_URL` fix, which turns a
currently-broken link (`/baseUrl/https://…`) into a working one.

---

## Testing Checklist

### Verified — unit (`tests/navLinkPages.test.js`, 14 tests, full suite 293/293 green)

- [x] `nav_link` becomes the destination and does **not** pick up `baseUrl`, at the top level.
- [x] Same for a **child** — the `getChildNav` path, which is the MitigateNY shape.
- [x] No `/edit` prefix in edit mode.
- [x] Emitted as a plain path, not a full URL (what keeps SPA nav and `useMatch` working).
- [x] External `https://` passes through verbatim; `sub://` is left unresolved without a `window`
      (the SSR path — hydration upgrades it).
- [x] `nav_link` wins over `url_slug` when both are set.
- [x] `hide_in_nav`, draft filtering and `icon` behave as on any other page.
- [x] Regression: an absolute **child** destination is no longer prefixed with `baseUrl`.
- [x] BC: ordinary pages, authored `rootPath` items, `noLink` labels, and the id fallback are
      all unchanged.

### Verified — live (`npmrdsv5/dev2`, throwaway `page_test` pattern; page created and deleted)

- [x] Visiting the link page's own `/<slug>` in **view** redirects to an in-app destination.
- [x] An external `nav_link` leaves the app entirely (`window.location.assign` → example.com).
- [x] `/edit/<slug>` does **not** redirect and renders the "This page is a link" canvas naming
      the destination.
- [x] The nav entry's `href` is the destination, not the page's own slug.
- [x] The **Nav Link** field renders in the settings pane with its hint placeholder, next to
      "Hide in Nav". No new console errors (the one `customTheme` warning present is pre-existing,
      from `FilterSettings`, and was A/B-confirmed to predate this change).

### Verified — live BC (`mitigat-ny-prod`, `county_template`, anonymous view)

- [x] The real two-level county nav renders intact: 42 anchors, correct parent/child paths, no
      mangled hrefs, zero console errors. This exercises `dataItemsNav` + `getChildNav` + the
      `navDepth: 2` / `nav2Level` path on production data.

### Verified — build

- [x] `npm run build` clean.
- [x] Fast Refresh boundaries respected — `LinkPageNotice.jsx` exports only a named default
      component, and `LINK_PAGE_TEMPLATE` is module-local rather than a non-component export.

### Round 2 — 2026-09-09, two bugs found by the first real consumer

The MitigateNY conversion
([county-template-actions-nav-links.md](../../../../../../planning/mitigateny/tasks/current/county-template-actions-nav-links.md))
exercised this on a page with real history and broke it twice. Both fixed here.

- [x] **A link page's leftover url-bound page variables cancel the redirect.** The MNY county
      Actions Dashboard still carries the 12 `useSearchParams` page variables it had as a real
      dashboard. `pages/view.jsx`'s `initNavigateUsingSearchParams` effect navigates to
      `${baseUrl}/${item.url_slug}?<params>` — back onto the link page — which beat the
      `<Navigate>` and left the old URL rendering **nothing** (body length 1) instead of
      redirecting. That effect is now skipped when `navLink` is set.

      Worth noting *why the unit tests missed it*: they cover `utils/nav.js`, which was correct.
      The failure was an interaction between two effects in `view.jsx`, and only a page with
      pre-existing url-bound filters shows it — a freshly created link page (which is what the
      2026-09-08 live pass used) redirects fine.
- [x] **The MNY footer ignored `nav_link`.**
      `.../ComponentRegistry/footer.jsx` builds its own `<Link to={'/' + url_slug}>` instead of
      going through `utils/nav.js`, so the footer kept linking to a slug that now only exists to
      redirect. It now resolves `nav_link` first (via a small `footerHref` helper), matching the
      nav. Same class of duplicate-link-builder as `ExportPdf.jsx`.

      Left alone deliberately: `mnyHeader/mnyHeaderDataDriven.jsx`'s breadcrumb also hand-builds
      `/${url_slug}`, but a link page can never be an *ancestor* in a breadcrumb chain — you
      cannot land on a child of a page that redirects — so the case is unreachable.

**Lesson for the pattern:** every hand-rolled link builder outside `utils/nav.js` is a place this
feature has to be re-taught. There are now three known (`footer.jsx`, `ExportPdf.jsx`,
`mnyHeaderDataDriven.jsx`); folding them onto the shared builder would retire the whole class.

### NOT yet verified — worth a pass when the MitigateNY task runs

- [ ] Active-state highlighting on the destination page (the new `SideNav` `matchBase`). Ported
      verbatim from `TopNav` but not exercised live. *(Still open after the 2026-09-09 MNY pass —
      client-side navigation to the destination was confirmed, the highlight was not asserted.)*
- [ ] `sub://` resolution **in a browser** (client-side branch). Only the no-`window` path is
      covered.
- [ ] An external link clicked from the nav in **each** renderer — SideNav (`<Link>`) vs TopNav
      (`window.location.assign`) are different code paths; only the view-redirect route was
      exercised live.
- [ ] The **"Link"** card in the page-template picker, end to end through `+ Add Page`.
- [ ] `ExportPdf` skipping link pages.
- [ ] The MNY **actions** pattern `2265530` (`secondaryNav.navItems` + `rootPath`) rendering
      unchanged — only `county_template` was checked live.
- [ ] A pattern on a **prefixed mount** (e.g. `/npmrds`) with a link page among its pages.

### Correction to the original checklist

`npm run lint` clean was never an achievable bar: the repo reports ~12,573 pre-existing problems.
The real check is "no new errors", which holds — the only finding on the new files is
`react/prop-types`, which is the dominant pre-existing class across the whole codebase (no
component here declares propTypes). One dead `|| ''` was removed from the `SideNav` line this
change rewrote.

---

## Follow-on this unlocks (not part of this task)

The actions pattern `2265530` currently carries a **20-item hand-generated snapshot** of the
county template's nav in `theme.navOptions.secondaryNav.navItems`, regenerated by
`scratchpad/mitigat-ny-prod-prod/set_actions_secondary_nav.cjs` whenever the template's pages
change. Once link pages exist, those entries could become real link pages in the actions
pattern's own page tree — author-editable, visible in the page tree, no snapshot to regenerate.
Worth doing only after the county-template direction is proven.
