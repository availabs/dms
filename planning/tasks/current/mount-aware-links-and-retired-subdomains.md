# Mount-aware site-absolute links + retired-subdomain redirects

> **Status: BUILT & LIVE-VERIFIED 2026-08-27** (uncommitted) · **BC** · driven by the TransportNY
> subdomain→path consolidation
> ([`planning/transportny/tasks/current/subdomain-to-path-consolidation.md`](../../../../../planning/transportny/tasks/current/subdomain-to-path-consolidation.md)
> in the workspace root). Two additive library capabilities that any multi-mount site needs.

## Why

`locations` (2026-07-13) let one pattern be served at several `{subdomain, base_url}` mounts, and
`navPrefix` (2026-07-29) taught the **nav** to follow the mount. Two gaps were left, and both bite the
moment a pattern that lives at `/` is also mounted at a path:

1. **Authored link VALUES don't follow the mount.** A lexical `ButtonNode` hands its `path` straight
   to `navigate()`, and a Card/table `isLink` column hands its cell value straight to `<Link to>`. A
   page authored with `/congestion_v2` therefore works on the `/` mount and 404s on `/tsmo`.
   This was already broken in production on the Freight Atlas `www:/fa` mount — its 22 maps-gallery
   `/freight_atlas?layers=…` links all pointed outside the mount.
2. **Retiring a subdomain 404s every old link.** Moving a pattern from `tsmo2:/` to `www:/tsmo`
   strands every bookmark. Hosting-level 301s are the right primary mechanism but must be configured
   per deployment and per hostname, and cannot cover local development at all.

## What shipped

### 1. `resolveMountPath` — site-absolute links follow the mount

`utils/mountPath.js` (new, pure). A site-absolute authored value is written against the pattern's
PRIMARY layout, so it is resolved against the **current mount's `baseUrl`**. Left alone:

- **another pattern's path** — `siteRootPaths` carries every pattern mount's first path segment
  (`/auth`, `/datasources`, `/docs`, `/list`, …), built in `pattern2routes` from the same mount list
  the router registers, so it cannot drift from the live route table. This is what keeps
  `/auth/login` reachable from inside a prefixed mount. It also covers a pattern based at a non-root
  path whose authored links repeat that base (`/docs/...` inside npmrds_docs).
- **anything already on the mount** — makes the helper idempotent, which is what lets the TransportNY
  cutover flip a pattern's primary from `/` to `/tsmo` without the links doubling up.
- **`/`** → the mount root (a link to the pattern's own home).
- relative slugs, `sub://`, `http(s)://`, and protocol-relative `//host/path`.

Delivered to consumers through a new **`ui/mountContext.js`** (`{ baseUrl, siteRootPaths }`), provided
by the page pattern in `siteConfig.jsx`. Deliberately provider-optional: `ui/` must not import from
`patterns/`, and a missing provider reads `{}` → today's behavior. The context value is built once per
config, not inline in the provider, so its identity is stable under the React Compiler (same reason
`App.jsx` memoizes `dmsConfig`/`pgEnvs`).

Consumers: `ButtonNode.tsx` (after `resolveSubdomainPath`), `table/components/TableCell.jsx`
(`LinkComp`), and `ui/components/Card.jsx` — **Card.jsx has its own copy of the link-URL builder and
does not route through TableCell**, which the live check caught after the TableCell change alone left
the gallery links unprefixed.

### 2. `retired_subdomains` — a pattern can redirect its old hosts

`utils/retiredSubdomain.js` (new) + a `retired_subdomains` json attribute on the admin pattern format
+ a "Retired Subdomains" editor in the pattern-settings section (next to Locations). A pattern lists
the subdomains it used to answer on; each resolves to that pattern's current primary mount on
`www.<base domain>`, preserving path, query and hash, and reusing `resolveMountPath` so the shared
patterns keep their own paths.

Two safety properties, both tested:

- **A subdomain some pattern still MOUNTS is never redirected** — the live route always wins, so a
  half-applied cutover degrades to "the old URL keeps working" rather than to a loop.
- **A host with no subdomain label to strip is never redirected**, so the target of a redirect can
  never itself redirect. `resolveRetiredSubdomainRedirect` is a pure function over location parts;
  `applyRetiredSubdomainRedirect` is the thin `window.location.replace` wrapper (`replace`, not
  `assign`, so Back doesn't bounce the user).

Applied in `pattern2routes` before route construction (guarded by `typeof window`, so SSR is
unaffected); it returns `[]` when redirecting, which is safe because `dmsSiteFactory` always appends
`PageNotFoundRoute`.

`getBaseHost` was extracted from `subdomainPath.js`'s inline host-splitting for the second consumer —
a genuine shared 6-line rule (single-depth subdomain, port rides along), not a wrapper.

## Files

| File | Change |
|---|---|
| `src/utils/mountPath.js` | **new** — `resolveMountPath`, `collectSiteRootPaths`, `firstSegment` |
| `src/utils/retiredSubdomain.js` | **new** — `buildRetiredSubdomainMap`, `resolveRetiredSubdomainRedirect`, `applyRetiredSubdomainRedirect` |
| `src/ui/mountContext.js` | **new** — `MountContext` |
| `src/utils/subdomainPath.js` | extract + export `getBaseHost` (pure move) |
| `src/render/spa/utils/index.js` | build `siteRootPaths`; pass it per pattern; apply the retired-subdomain redirect |
| `src/patterns/page/siteConfig.jsx` | accept `siteRootPaths`, provide `MountContext` |
| `src/ui/components/lexical/editor/nodes/ButtonNode.tsx` | resolve the mount path after `sub://` |
| `src/ui/components/table/components/TableCell.jsx` | resolve in `LinkComp`; `mount` in the `useMemo` deps |
| `src/ui/components/Card.jsx` | resolve in the card cell's link branch |
| `src/patterns/admin/admin.format.js` | `retired_subdomains` json attribute |
| `src/patterns/admin/pages/patternEditor/default/settings.jsx` | `RetiredSubdomainsEditor` |
| `tests/mountPath.test.js`, `tests/retiredSubdomain.test.js` | **new** — 31 tests |

## BC analysis

- [x] **A `/` or empty mount baseUrl is an explicit no-op.** That is every mount in the npmrdsv5 site
      except the Freight Atlas `www:/fa` pair — where the links are broken today and this fixes them.
      Live-verified: `freightatlas2.localhost/maps_gallery` renders all 36 anchors exactly as before
      (`/freight_atlas?layers=…` unprefixed), while `www.localhost/fa/maps_gallery` renders all 22
      gallery links prefixed and leaves `/` `/auth/login` `/datasources` `/docs` alone. Lexical
      buttons verified by clicking: `/fa/home` → `/fa/freight_atlas`, `/fa/maps_gallery`,
      `/fa/about_the_plan`, and `/auth/login` **unprefixed**; the same six buttons on
      `freightatlas2.localhost/home` still go to the unprefixed paths.
- [x] **No provider → no change.** `MountContext` defaults to `{}`; every consumer outside the page
      pattern (admin `patternList`, datasets, forms) resolves to the input value untouched.
- [x] **No `retired_subdomains` → the redirect module is inert.** No pattern in any site sets it
      today, so `buildRetiredSubdomainMap` returns `{}` and `applyRetiredSubdomainRedirect` returns
      false before touching `window`.
- [x] Admin format gains one optional json attribute (default `[]`) — existing rows unaffected.
- [x] No theme keys, no new config on sections, nothing to migrate.
- [x] Full suite: **821 tests pass** (was 801; +20 new). The 29 failing test FILES are the
      pre-existing vendored mocha specs under `dms-server/src/utils/falcor-router/test/**`
      (`describe is not defined`), untouched by this change.
- [x] Lint: the three new source files and both test files are clean.
      `RetiredSubdomainsEditor` reports the same two `react/prop-types` errors as the
      `LocationsEditor` beside it — the file's existing house style, no new rule class.

## Testing checklist

- [x] 18 `mountPath` tests over the REAL authored values swept from npmrdsv5 (13 distinct
      site-absolute values in tsmo2, 16 in npmrds_sub, 26 in freightatlas2_copy, 6 in landing)
- [x] 13 `retiredSubdomain` tests incl. the `/auth/login` carve-out, dev hosts with ports,
      no-loop and fixed-point properties
- [x] Live: `/fa` and `/fa/maps_gallery` and `/fa/home` on a spare-port dms-template vite
      (`VITE_DMS_APP=npmrdsv5 VITE_DMS_TYPE=dev2 VITE_API_HOST=http://localhost:3001`, port 5187)
- [x] Live BC: `freightatlas2.localhost:5187` primary mount byte-identical
- [ ] Retired-subdomain redirect live — needs a `retired_subdomains` value on a pattern row (a DB
      write; blocked pending owner approval, see the TransportNY task)
- [ ] A prefixed mount for a pattern with MANY lexical links (tsmo2 / npmrds_sub) — needs the Phase 1
      `locations` rows, same block

## Sync

Core change — rides the transportNY vendored-dms git sync (owner-run). Production
(`www.transportny.org`) builds from the `transportNY/` repo, so it does not pick these up until that
sync + deploy happens; the pattern-row half of the TransportNY cutover is live on prod immediately.
Deploy the code first.

## Follow-up: `sub://` links no longer force a new tab (2026-08-31)

`resolveSubdomainPath` returns an absolute URL, and ButtonNode's click handler treated *every*
absolute URL as external — `window.open(_blank)`. That is wrong for `sub://`, which by definition
names another product on the SAME platform; it only looks absolute because the scheme resolves
against the current base domain. Users moving between products accumulated tabs.

`handleClick` now branches three ways:

| destination | behavior |
|---|---|
| relative / site-absolute | `navigate()` — SPA, unchanged |
| resolved from `sub://` | `window.location.assign()` — same tab, full load (still a different origin, so react-router cannot route it) |
| any other absolute URL | `window.open(_blank)` — **byte-identical to before** |

BC: the external branch is untouched, and only paths authored as `sub://` take the new branch.
Verified by A/B on one button: the deployed build fires `POPUP https://www.devtny.org/npmrds` for the
landing page's `Open NPMRDS`; the patched build navigates the same tab.

## Progress log

- 2026-08-27 — Built and live-verified. Gotcha found en route: **Card.jsx duplicates TableCell's
  link-URL builder**, so fixing `LinkComp` alone left the Freight Atlas gallery's 22 data-carried
  links unprefixed; caught by clicking through the live `/fa` mount rather than by the unit tests.
  Second gotcha: protocol-relative `//host/path` starts with `/` and was being prefixed — caught by
  the test that asserts absolute URLs pass through, and fixed with the same carve-out `nav.js`
  already makes.
