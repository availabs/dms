# Register patterns at multiple locations (subdomain + baseUrl mounts)

**Status: COMPLETE 2026-07-13** (uncommitted, pending review) · Owner ask: a pattern should be registrable at more than one
location — e.g. `freightatlas2_copy` at `subdomain: freightatlas2, base_url: /` AND at
`subdomain: www, base_url: /freightatlas`. Implemented in dmsSite/dmsManager with UI in the
pattern editor; **completely backwards compatible**.

## Design

- **Data (additive)**: pattern rows gain `locations: [{ subdomain, base_url }, …]` — *additional*
  mounts beyond the primary `subdomain`/`base_url` pair. Absent/empty → exactly today's behavior.
  Stored as a `json` attribute on the admin `pattern` format.
- **Routing** (`render/spa/utils/index.js` `pattern2routes` — also the SSR2 path, since
  `handler.jsx` routes through `dmsSiteFactory`): each pattern expands to its **mount list**
  (primary + parsed `locations`, deduped on `subdomain|base_url`, invalid rows dropped). The
  existing per-pattern subdomain filter becomes a per-mount filter with identical semantics
  (`(!SUBDOMAIN && !mount.subdomain) || mount.subdomain === SUBDOMAIN || mount.subdomain === '*'`).
  Each matching mount registers a full route set with THAT mount's `baseUrl`; the passed
  `pattern.base_url` is rewritten to the mount's so downstream link-building uses the right base.
  Content identity (`type`) still derives from `getInstance(pattern.type)`/`doc_type`/**primary**
  base_url — both mounts serve the same pages.
  Per-mount nuance that falls out for free: subdomain-keyed `filters` / `authPermissions`
  resolve against the mount's subdomain (fallback `'*'` unchanged).
- **UI** (`patterns/admin/components/patternList.jsx` edit modal): new "Locations" editor —
  rows of `subdomain` + `base URL` inputs with add/remove, stored to `locations`. Rendered via a
  special-cased EditComp (same approach as `filters`' RenderFilters).

## BC analysis
- No `locations` → mount list = [primary] → byte-identical routing to today.
- `type`/format resolution unchanged (primary-derived), so content, auth project, and dmsEnv
  bindings don't vary by mount.
- Admin format gains an optional attribute (json, default []) — existing rows unaffected.

## Files
- `src/patterns/admin/admin.format.js` — `locations` attribute.
- `src/render/spa/utils/index.js` — mount expansion in `pattern2routes`.
- `src/patterns/admin/components/patternList.jsx` — Locations editor in the edit modal +
  `locations` in `attrToAddNew`.

## Testing checklist
- [x] freightatlas2_copy with `locations:[{subdomain:"www", base_url:"/freightatlas"}]`:
      `www.localhost:5173/freightatlas/maps_gallery` renders the gallery; `/freightatlas` = Home
- [x] Primary mount unchanged: `freightatlas2.localhost:5173/maps_gallery` identical
- [x] Unrelated subdomain (npmrds.localhost/freightatlas) unaffected
- [x] Patterns without `locations` behave identically (marketing site on www, npmrds pages)
- [x] Editor: add/remove location rows + Save round-trips (verified via CLI re-read; test row
      cleaned up; pattern data otherwise untouched)

## Progress log
- 2026-07-13 — task opened; recon complete (pattern2routes loop, admin format, edit modal).

- 2026-07-13 — **BUILT & VERIFIED**. Implementation notes:
  - `render/spa/utils/index.js`: `getPatternMounts()` (primary + parsed `locations`, dedup on
    subdomain|normalized base_url) + per-mount route registration; the passed `pattern.base_url`
    is rewritten per mount for downstream link-building; content `type` stays primary-derived.
  - **Gotcha found en route**: pattern2routes aliases `www` (and `hazardmitigation`) to the ROOT
    domain (`SUBDOMAIN = ''`). A `www` location would never match; fixed by applying the same
    alias to LOCATION mounts only (`ROOT_SUBDOMAIN_ALIASES`) — primary matching stays
    byte-identical, so a legacy pattern whose primary subdomain is literally "www" (previously
    unreachable, dead config) does NOT change behavior.
  - UI landed in BOTH editors: the current pattern-editor page (`patternEditor/default/
    settings.jsx` — `LocationsEditor` under Pattern Settings, saved by the section's Save) and
    the legacy patternList modal (RenderLocations, special-cased like filters).
  - The freightatlas2_copy pattern carries the owner's example location
    ({subdomain: www, base_url: /freightatlas}) — live on www.localhost:5173/freightatlas.
  - Minor UI wart (pre-existing): `UI.Input` drops the `placeholder` prop, so the location row
    placeholders don't render — cosmetic only.

- 2026-07-13 (follow-up) — **mount-aware secondary-nav links (`navPrefix`)**: owner mounted the
  freight_data datasets pattern at `www:/fa/freight_data` + the FA page pattern at `www:/fa`;
  the shared secondary nav's site-absolute links (`/home`, `/freight_data?cat=…`) broke on the
  prefixed mounts. pattern2routes now computes a per-mount `navPrefix` = the mount's extra path
  prefix vs the primary base (`/freight_data`@`/fa/freight_data` → `/fa`; `/`@`/fa` → `/fa`;
  primary mounts → `''`), passed on the pattern object. The page pattern needed no change (its
  nav already uses the mount baseUrl); the 7 datasets pages' `dataItemsNav(items, '', …)` call
  sites now pass `parent?.navPrefix || ''` (DatasetsContext). BC: primary mounts get `''` →
  byte-identical links (verified: freightatlas2 primary nav unchanged; /fa mounts fully
  prefixed incl. Data & Downloads `?cat` link; datasets list loads on the mount).
  Gotcha fixed en route: error.jsx referenced bare `parent` (window.parent!) — destructured
  from DatasetsContext.
- **Open question (pre-existing, not mounts)**: anonymous visitors get the login screen on the
  freight_data pattern even after granting public `view-sources` on its authPermissions — some
  additional gate (route action/authLevel?) redirects unauthenticated users. Works logged-in.
  Worth its own look if the public no-login catalog is wanted.
