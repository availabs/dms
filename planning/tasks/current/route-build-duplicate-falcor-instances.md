# Perf: fast-path + full-fetch route rebuilds duplicate the entire page data fetch (separate Falcor instances)

## Status

NOT STARTED (scoped 2026-09-02). Split out from
[perf-auth-revalidate-duplicate-fetch.md](./perf-auth-revalidate-duplicate-fetch.md)
after that task's scoped-invalidate fix (deployed to devmny.org, confirmed
live via asset-hash match) produced **zero measurable change** across two
back-to-back production Lighthouse runs. Root-cause investigation (agent +
direct code read, cited below) found the actual duplicate-fetch mechanism is
architecturally unrelated to that task's auth-token retry logic — it's a
structural issue in how `dmsSiteFactory.jsx` builds routes, and reproduces
independent of login state. This task tracks that separate problem.

## Objective

Eliminate the duplicate full-page-data network fetch that occurs on page
loads where cached/default route data is available (returning visitor with
`localStorePatterns`, or an SSR-prerendered page) by ensuring the two route-
build passes in `dmsSiteFactory.jsx` share one Falcor cache instead of each
instantiating (and therefore fetching into) its own.

## Root cause (confirmed via code read, not just Lighthouse inference)

1. **`dmsPageFactory()` creates a brand-new Falcor `Model` instance with an
   empty cache on every call.**
   `packages/dms/src/render/dmsPageFactory.jsx:26`:
   ```js
   const falcor = falcorGraph(API_HOST);
   ```
   This is inside the factory function body, not shared/module-level — every
   call gets its own Model, its own cache, and (incidentally) its own
   `lastAuthToken`/`lastRevalidateAttemptToken` closures.

2. **`dmsSiteFactory.jsx` calls `pattern2routes()` (which calls
   `dmsPageFactory()` once per pattern, `render/spa/utils/index.js:374`) at
   least twice by design**, for the common case of a returning visitor or an
   SSR-prerendered page:
   - **Fast path** — `dmsSiteFactory.jsx:71-78` (and the lazy-themes variant
     at `:94-109`) builds routes synchronously from `localStorePatterns` or
     SSR `defaultData`, specifically so something renders immediately
     without waiting on the network.
   - **Full-fetch path** — `dmsSiteFactory.jsx:111+` unconditionally re-does
     the full API fetch afterward. The comment at `:116-118` states the
     intent explicitly: *"Always do the full API fetch — defaultData may
     only contain a subset of routes... The fetch fills in any missing
     routes."* This is deliberate — `defaultData`/cached patterns can be
     partial (e.g. SSR only pre-rendered one pattern but the site has
     others) — not a bug in isolation.

   Because each pass builds its routes through a brand-new
   `dmsPageFactory()` → brand-new `falcorGraph()`, **the full-fetch pass's
   loader has no way to see what the fast path already fetched** — it has
   no shared cache to hit, so it re-fetches the entire page graph from the
   network from scratch, even for patterns the fast path just finished
   loading a moment earlier.

3. **This explains the specific Lighthouse pattern precisely**: two
   sequential, non-overlapping full fetches of the same `byId` chunk(s) —
   not one instance retrying, but two independent Falcor Model instances
   each doing a genuine first fetch. It also explains why the auth-token
   gates in `dmsPageFactory.jsx`'s loader retry branch and the `DMS()`
   component's `revalidator.revalidate()` effect never fire on this path:
   each `dmsPageFactory()` call reads
   `window.localStorage.getItem('userToken')` fresh into its own closure,
   so there is no "previous token" *within that call's lifetime* for the
   comparison to ever observe changing.

4. **Why this correlated with "logged in" in the original Lighthouse
   data**: a returning/authenticated visitor is more likely to have
   `localStorePatterns` populated (or land on an SSR-prerendered page) than
   a first-time anonymous visitor, so the fast-path + full-fetch double
   build is more likely to actually trigger for them. But the mechanism
   itself has nothing to do with auth state — it should reproduce for *any*
   page load where cached/default route data exists, logged in or not. This
   should be verified (see Testing checklist) since it changes who's
   affected and how to reproduce for local testing.

## Estimated impact if fixed

From the live logged-in Lighthouse trace this task is based on
(`https://www.devmny.org/playground/blank_page?name=name123`, 2026-09-02):

- **Bytes**: the duplicated fetches account for ~1.75–1.8MB of the 5.71MB
  total (`byId,[2243673,2333718,2334035]` alone is ~1.64MB duplicated, plus
  three smaller duplicated chunks and a duplicated nav/searchOne lookup).
  Fixing this should cut total byte weight from **~5.71MB → ~3.9MB** (~31%
  reduction). It won't reach the ~2.2MB anonymous baseline — authenticated
  users genuinely load extra data (dataset sources, jurisdictions,
  capabilities catalogue) anonymous visitors never touch.
- **LCP**: `lcp-breakdown-insight` shows `resourceLoadDelay` — time spent
  waiting *before the LCP image even starts loading* — at 3.7–4.5s out of
  the 4.7s total LCP, almost the entire metric, consumed by the two serial
  full-page-data fetch cycles saturating the network/main thread one after
  the other. Removing one cycle should recover a large share of that delay.
  Rough estimate: **LCP drops from ~4.7s to somewhere in the 2.5–3.2s
  range** (not fully to the 2.1s anonymous baseline, for the same
  extra-data reason as above).
- **Performance score**: currently 46–47. LCP (25% weight) and TBT (30%
  weight) are the two heaviest-weighted metrics in Lighthouse's scoring;
  TBT should also improve somewhat (less main-thread JSON-parsing work from
  a second full payload). Expect the score to climb back toward the
  **55–65 range** — close to, not fully matching, the ~61 anonymous
  baseline.

This is arithmetic from one trace, not a guarantee — actual results depend
on which fix approach is taken and how common the "fast-path data was
actually incomplete" case turns out to be in practice.

## Must work across all four configurations: SSR × sync

This fix must hold for **SSR and non-SSR**, and **sync (`VITE_DMS_SYNC=1`)
and non-sync**, independently (four combinations). Confirmed via code read
that the underlying bug is present in all four — `dmsPageFactory()`
unconditionally does `falcorGraph(API_HOST)` (`dmsPageFactory.jsx:26`)
regardless of caller, so no configuration is naturally exempt — but each
configuration reaches the bug via a different path, which any fix has to
account for:

- **SSR already has real, working plumbing for exactly this kind of shared
  cache — it just doesn't reach far enough.** `render/ssr2/handler.jsx:66-94`
  pre-warms one `falcor` instance (`dmsDataLoader(falcor, ...)` at `:82`),
  then passes that *same instance* into `dmsSiteFactory({ ..., falcor, ...
  })` (`:87`), with the comment at `:84` stating the intent explicitly:
  *"Falcor cache makes dmsSiteFactory's internal dmsDataLoader call
  instant."* That works for `dmsSiteFactory`'s own top-level
  site/pattern-list fetch — but `DmsSite`'s `falcor` config prop
  (`dmsSiteFactory.jsx:29`, threaded into `routeProps` at `:49`) dead-ends
  there: the per-pattern `dmsPageFactory()` call
  (`render/spa/utils/index.js:374`) is invoked with a fixed prop list that
  does **not** include `falcor`, so every per-pattern page loader still
  gets its own fresh, empty-cache Falcor instance even during SSR route
  building, and again on the client after hydration (App.jsx never passes a
  `falcor` prop at all, so the client's `dmsSiteFactory` mount always starts
  cold at the `DmsSite`-prop level, independent of anything SSR pre-warmed).
  **The natural fix for the SSR case is threading this already-existing
  `falcor` prop the rest of the way into `dmsPageFactory()`** — not new
  plumbing, closing a gap in plumbing that already exists.
- **Non-SSR (pure CSR) hits the same bug with no `falcor` prop involved at
  all.** The fast path also triggers from `localStorePatterns`
  (`dmsSiteFactory.jsx:56-58, 71-78`) — a returning visitor's cached
  pattern list in `localStorage`, independent of any server pre-render.
  Since a plain client-only app (`App.jsx` never passes a `falcor` prop)
  still runs the fast-path + full-fetch double build whenever
  `localStorePatterns` is populated, the fix must also cover the case where
  no external `falcor` is supplied at all — i.e. `DmsSite`/`dmsSiteFactory`
  needs to create and hold **one** instance itself (e.g. `useRef`/`useMemo`,
  falling back to `falcorGraph(API_HOST)` when no `falcor` prop is given)
  and pass that same instance into every `pattern2routes()` call it makes,
  not just thread through an externally-supplied one.
- **Sync mode is additive/orthogonal, not a replacement path — but must not
  be broken by whichever fix is chosen.** `DMS_SYNC_ENABLED` gates a
  separate `useEffect` (`dmsSiteFactory.jsx:174-193`) that initializes
  *after* `dynamicRoutes` already exists, via the same fast-path/full-fetch
  mechanism as non-sync mode — sync does not bypass or replace route
  building, it layers real-time invalidation on top via `initSync`/
  `_setSyncAPI`. There is also a route-revalidation effect further down
  (`:196+`, "Revalidate routes when sync receives remote changes") that
  likely triggers *another* route rebuild on remote change — **not yet
  traced whether that rebuild goes through `pattern2routes()` again (and
  would therefore need the same shared-instance treatment) or through some
  other mechanism.** Confirm before implementing (see Testing checklist).

## Design question to resolve before implementing (not a quick patch)

Two candidate approaches, not yet decided between:

1. **Share one Falcor instance across the fast-path and full-fetch route
   rebuilds**, so the full-fetch pass's Model already has the fast path's
   cached entries and only fetches what's actually missing/stale. Less of a
   from-scratch refactor than it first looks: `DmsSite` already accepts a
   `falcor` config prop (`dmsSiteFactory.jsx:29`, into `routeProps` at
   `:49`) and SSR already constructs and hands in exactly this kind of
   shared instance (`ssr2/handler.jsx:66-94`) — the gap is that
   `render/spa/utils/index.js:374`'s `dmsPageFactory()` call never forwards
   it, so `dmsPageFactory.jsx:26` always makes its own regardless. The fix
   is (a) make `dmsPageFactory()` accept and reuse an injected `falcor`
   instance when given one, falling back to creating its own only when
   none is supplied, and (b) at the `DmsSite` level, create one instance
   when no `falcor` prop is given (covering the plain-CSR case, see below)
   and pass that same instance into **every** `pattern2routes()` call the
   component makes — fast path and full-fetch alike — not just thread
   through an externally-supplied one. Need to check all `pattern2routes()`
   call sites (`dmsSiteFactory.jsx:75, 105, 262, 272, 318`) for whether they
   can safely share one instance or need scoping (e.g. per-subdomain/tenant,
   see the tenant-branch call at `:318`).
2. **Skip the full-fetch pass entirely when the fast-path data is confirmed
   complete/fresh** (e.g. a version/ETag/length check against the live
   site data before deciding a re-fetch is needed) — avoids the Falcor-
   instance-sharing refactor, but changes the "always full-fetch to catch
   missing routes" guarantee the `:116-118` comment describes as
   deliberate. Would need to confirm that guarantee can be safely relaxed
   (or replaced with a cheaper freshness check) without reintroducing the
   missing-routes bug it exists to prevent.

Recommend picking one after reading `dmsSiteFactory.jsx` in full (both
`useEffect`s, `useState` initializers, and all 5 `pattern2routes()` call
sites) and understanding why there are two passes in the first place well
enough to judge which approach preserves that guarantee. Do not start
coding before that read.

## Not yet confirmed (do before implementing)

The investigating agent's own caveat: it confirmed the *mechanism*
(`dmsPageFactory()`'s per-call fresh Falcor instance × two route-build
passes) via static code read, but did **not** runtime-trace which specific
`pattern2routes()` call (the fast path at `:71-78`/`:94-109` vs. the
full-fetch pass at `:111+`) coincides with which of the two observed
network fetches. Confirm with a breakpoint or `console.log` against a real
page load (ideally reproduce anonymously too, per point 4 above, to isolate
auth state as a non-factor) before writing the fix.

## Files likely requiring changes

- `packages/dms/src/render/spa/dmsSiteFactory.jsx` — the two (or more)
  `pattern2routes()` call sites; whichever approach is chosen, this is
  where the fast-path/full-fetch relationship is orchestrated.
- `packages/dms/src/render/spa/utils/index.js` — `pattern2routes()`
  (`:121`, calls `dmsPageFactory()` at `:374`) — likely needs a way to
  accept/pass through a shared Falcor instance if approach 1 is chosen.
- `packages/dms/src/render/dmsPageFactory.jsx:26` — `falcorGraph(API_HOST)`
  instantiation — the actual change point if approach 1 is chosen (accept
  an optional pre-built `falcor` instance instead of always constructing
  one).

## Testing checklist

- [ ] Confirm which `pattern2routes()` call coincides with which observed
      fetch (runtime trace, not just static read) — see "Not yet confirmed"
      above.
- [ ] Reproduce the duplicate fetch **anonymously** (no login) on a page
      with cached/SSR default route data, to confirm the mechanism is
      genuinely auth-independent as reasoned above, not something this
      task's analysis is missing.
- [ ] After implementing: re-run the same Lighthouse scenario against
      `https://www.devmny.org/playground/blank_page?name=name123` (or
      equivalent) logged in, and confirm:
      - Duplicate `byId`/searchOne fetches are gone from the
        `network-requests` audit.
      - Total byte weight drops from ~5.71MB toward the ~3.9MB estimate
        above (not necessarily exact).
      - LCP drops from ~4.7s toward the 2.5–3.2s estimate above.
      - Performance score climbs from ~46–47 toward the 55–65 range.
- [ ] Confirm the "fast-path data was actually incomplete" case (the reason
      the full-fetch pass exists per the `:116-118` comment) still resolves
      correctly after the fix — i.e. a site where `defaultData`/cached
      patterns are a genuine subset of the live site's patterns still ends
      up with all routes present, not silently missing the ones the fast
      path didn't know about.
- [ ] Confirm the multi-tenant/subdomain call site (`dmsSiteFactory.jsx:318`)
      and the other `pattern2routes()` call sites (`:262`, `:272`) are
      unaffected or correctly covered by whichever fix is chosen.
- [ ] Trace whether the sync "revalidate routes when sync receives remote
      changes" effect (`dmsSiteFactory.jsx:196+`) rebuilds routes via
      `pattern2routes()` again — if so it needs the same shared-instance
      treatment as the fast-path/full-fetch pair; if not, confirm why not
      and that it's still correct.
- [ ] **Verify the fix across all four configurations independently** (SSR ×
      sync is not one dimension, each combination should be checked):
      - [ ] Non-SSR, non-sync (plain CSR, default `App.jsx` setup) — the
        `localStorePatterns` fast path on a returning visitor.
      - [ ] Non-SSR, sync (`VITE_DMS_SYNC=1`) — confirm sync init/revalidate
        still works after routes are built via the shared instance, and
        that sync's own passthrough/reactive data path is unaffected.
      - [ ] SSR, non-sync (`DMS_SSR=1`, sync off) — confirm the server's
        pre-warmed `falcor` (`ssr2/handler.jsx:66-94`) is actually reused by
        per-pattern loaders now (not just the top-level site/pattern-list
        fetch it already covered), and that client-side hydration doesn't
        reintroduce a second cold instance.
      - [ ] SSR, sync — both together; confirm no interaction/ordering bug
        between SSR hydration's route build and sync's post-mount init.
