# Nav items can't link across subdomains — `sub://` works in authored content but not in nav

> **Status:** IN PROGRESS 2026-07-29 · BC · driven by the TransportNY landing secondary nav (link the
> three product sites: NPMRDS, TSMO, Freight Atlas).

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

- [ ] **Zero existing nav items are affected.** Audited every `navOptions` on every pattern in
      `npmrdsv5`: 5 patterns, 35 nav items, and **0** use a `sub://`, `http(s)://` or `//` path. Every
      current item is a bare slug or a `/`-rooted path, both of which keep their existing code path.
- [ ] ButtonNode behavior byte-identical (function moved, not edited; same call site).
- [ ] `edit` mode still prefixes `${baseUrl}/edit` for ordinary items; an absolute URL is correctly
      NOT given an `/edit` prefix (it leaves the app entirely).
- [ ] No new theme keys, config keys or schema. Nothing to migrate.
- [ ] No change to `SideNav`/`TopNav` — react-router does the external-link rendering.

## Testing checklist

- [ ] Landing secondary nav renders the three product items with the three product icons.
- [ ] Each renders as a real anchor whose `href` is a **resolved absolute URL** on the current base host
      (dev: `http://npmrds.localhost:5173/`), not `/sub://…`.
- [ ] Clicking one lands on that product site.
- [ ] A pattern with ordinary slug-based nav (tsmo2, 12 items) is unchanged — same hrefs as before.
- [ ] `/docs/…`-style `/`-rooted nav paths still work (npmrds_sub, Freight Atlas patterns).
- [ ] No console errors.

## Sync

Core change — rides the transportNY vendored-dms git sync (owner-run). The landing pattern's nav is
**data**, so it takes effect as soon as it is written; the resolution fix is what needs the sync.
