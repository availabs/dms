# Nav items can't link across subdomains — `sub://` works in authored content but not in nav

> **Status:** DONE 2026-07-29 — implemented and live-verified · BC · driven by the TransportNY landing
> secondary nav (link the three product sites: NPMRDS, TSMO, Freight Atlas).

## Objective

Let a **nav item** use the same environment-portable cross-subdomain scheme that authored lexical
content already has, so a secondary nav can point at another product site.

## Current state

`sub://<subdomain>/<path>` shipped 2026-07-13 for lexical **ButtonNode** only (see
[`lexical-subdomain-links-and-icon-chips.md`](../completed/lexical-subdomain-links-and-icon-chips.md)).
It resolves against the current host's base domain at click time, so one authored value works in dev
(`npmrds.localhost:5173`) and prod (`npmrds.devtny.org`). The TransportNY landing page's product cards
already use it: `sub://npmrds/`, `sub://tsmo2/`, `sub://freightatlas2/`.

**Nav items get no such treatment.** `dataItemsNav` (`utils/nav.js:60-63`) builds every item's path as:

```js
const url = `${d.url_slug || d.path || d.id}`;
path: `${edit ? `${baseUrl}/edit` : baseUrl}${url?.startsWith('/') ? `` : `/`}${url}`
```

Anything not starting with `/` is treated as a slug relative to the pattern's `baseUrl`, so
`sub://tsmo2/` becomes `/sub://tsmo2/` and an absolute `https://…` becomes `/https://…`. There is **no**
external-link branch anywhere in the nav pipeline — verified: no `startsWith('http')`, `window.open`,
`target=` or `isExternal` in `utils/nav.js`, `pages/_utils/index.js`, `SideNav.jsx` or `TopNav.jsx`.

The three products are separate subdomains (`npmrds`, `tsmo2`, `freightatlas2`; landing itself is `*`),
so a relative path cannot reach them. The landing nav's existing "Freight Atlas" item is
`path: "/fa"` — a landing-subdomain path, which is not the Freight Atlas site.

## What does NOT need building

**react-router already handles the final hop.** In 7.17.0 `Link` calls `parseToInfo`, which parses an
absolute `to`, compares origins, and sets `isExternal: true` when they differ; the render then uses
`href: parsed.absoluteURL` with `onClick: onClick` instead of the SPA click handler
(`isSpaLink = !(parsed.isExternal || reloadDocument)`) — i.e. a real anchor doing a full page
navigation. Different subdomains are different origins, so once a nav item carries a resolved absolute
URL, `SideNav`/`TopNav` need no change at all.

So the whole fix is: **resolve `sub://` and stop prefixing `baseUrl` onto absolute URLs.**

## Proposed change

1. **Extract `resolveSubdomainPath`** out of `ButtonNode.tsx` (where it is a private function) into
   `utils/subdomainPath.js` and import it there. Pure move — no behavior change. It is 13 lines of real
   host-parsing logic with two consumers, so this is a genuine shared util, not a convenience wrapper.
2. **`dataItemsNav`**: resolve `sub://` first, then skip the `baseUrl` prefix when the result is an
   absolute URL. Everything else takes the existing path untouched.

SSR note: `resolveSubdomainPath` returns its input unchanged when `typeof window === 'undefined'`, so a
server render emits the raw `sub://…` and hydration replaces it with the resolved URL. That is exactly
how ButtonNode has behaved since July; nav items inherit the same property rather than a new one.

## Files requiring changes

| File | Change |
|---|---|
| `…/utils/subdomainPath.js` | **new** — `resolveSubdomainPath`, moved verbatim from ButtonNode |
| `…/lexical/editor/nodes/ButtonNode.tsx` | drop the local copy, import the util |
| `…/utils/nav.js` | in `dataItemsNav`: resolve `sub://`, then don't prefix `baseUrl` on an absolute URL |

## BC check

- [x] **Zero authored destinations are affected.** `dataItemsNav` shapes page dataItems as well as
      theme nav items, so both populations were audited against the exact regex the change uses:
      **35 nav items** across the 5 patterns carrying `navOptions`, and **133 page slugs** across 11
      patterns — **0** of 168 match `sub://`, `http(s)://`, `//`, or any other scheme. (The near-miss
      worth knowing: a slug like `docs:overview` *would* match, since the regex only needs
      `[a-z][a-z0-9+.-]*:` from the start. Nothing uses one, and the repo's underscore naming
      convention keeps `_`-containing slugs out of the pattern. Deliberately kept identical to
      react-router's own `ABSOLUTE_URL_REGEX` so a value `Link` treats as absolute is never given a
      prefix.)
- [x] ButtonNode behavior byte-identical — function moved, not edited; same single call site.
      Re-verified live: clicking the landing page's "Open NPMRDS" CTA still opens
      `npmrds.localhost:5173`.
- [x] `edit` mode still prefixes `${baseUrl}/edit` for ordinary items (observed `/edit/home` on
      freightatlas2); an absolute URL correctly gets neither prefix.
- [x] No new theme keys, config keys or schema. Nothing to migrate.
- [x] No change to `SideNav`/`TopNav` — react-router does the external-link rendering.

## Testing checklist

Measured on the dev server @1500×1050.

- [x] Landing secondary nav renders exactly the label + three product items, each with its product
      mark (`ProductNpmrds`/`ProductTsmo`/`ProductFreightAtlas` — all present in the transportny icon
      registry, which is a plain keyed object, so the names resolve directly):

      Platform         icon=no  href=null
      NPMRDS           icon=yes href="http://npmrds.localhost:5173/"
      TSMO             icon=yes href="http://tsmo2.localhost:5173/"
      Freight Atlas    icon=yes href="http://freightatlas2.localhost:5173/"

- [x] Each is a real anchor with a **resolved absolute URL** on the current base host; zero anchors
      match `/sub:` or a double-prefixed `/https?:`.
- [x] Clicking TSMO landed on `http://tsmo2.localhost:5173/` and the TSMO site rendered.
- [x] Slug-based nav unchanged — tsmo2 `/home /congestion_v2 /reliability_v2 /incidents_v2
      /workzones_v2 /incident_search /corridor_view /about /methodology`, 13 anchors, 0 malformed.
- [x] `/`-rooted and query-string paths still work — `/datasources`, `/docs`, and
      `/freight_data?cat=Freight%20Atlas` intact on the Freight Atlas pattern.
- [x] No console errors or pageerrors on any of the above.

Two pre-existing `no-unused-vars` lint errors in `nav.js` (unused `i` map params at lines 28 and 54)
are untouched by this change.

## The data change this enabled

Landing pattern **1700630** (`dev2|landing:pattern`), `theme.navOptions.secondaryNav.navItems`:

| before | after |
|---|---|
| Platform · Home (`landing`) · Freight Atlas (`/fa`) · Data Sources (`/datasources`) · Documentation (`/docs/npmrds/overview`) | Platform · NPMRDS (`sub://npmrds/`) · TSMO (`sub://tsmo2/`) · Freight Atlas (`sub://freightatlas2/`) |

- Destinations are the **same `sub://` values the landing page's own product cards already use**, so
  the rail and the cards agree and nothing new had to be invented. Note the npmrds product is the
  `npmrds` subdomain (pattern `npmrds_sub`), not `npmrds2`.
- Order matches the page's product cards (2174587/2174588/2174589 = NPMRDS, TSMO, Freight Atlas).
- The `Platform` **label row is kept** — it is a heading, not a link, so "only the three product
  links" still holds. Trivially removable.
- The old `Freight Atlas` item pointed at `/fa`, a *landing*-subdomain path, so it never reached the
  Freight Atlas site.
- Full pre-change row backed up to `scratchpad/backup_landing_pattern_1700630.json`.

## Sync

Core change — rides the transportNY vendored-dms git sync (owner-run). The landing pattern's nav is
**data**, so it took effect immediately; the resolution fix is what needs the sync. **Checked at
completion: transportNY's core already contains both `utils/subdomainPath.js` and the `nav.js` change,
and `diff -rq` over the two core trees is empty** — the owner's sync channel had already picked it up.
