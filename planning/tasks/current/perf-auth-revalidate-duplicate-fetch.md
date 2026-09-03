# Perf: page-load root-causing (mitigateny.org/devmny.org) + auth-revalidate duplicate-fetch regression

> Root-cause performance investigation, verified against real production
> Lighthouse data (not asserted from code reading alone) per standing
> project preference — see [[feedback_fix_root_cause_not_loading_ui]] in
> user memory: shorten the actual wait, don't mask latency with loading UI.

## Status

Six fixes shipped + verified this session (2026-09-02), all committed.
**A seventh fix — the scoped-invalidate change — is implemented, deployed to
production (devmny.org), and confirmed via asset-hash match to be live.
Two Lighthouse runs against the same deploy show it made ZERO measurable
difference** (same duplicated ~1.64MB `byId` chunk, same ~5.71MB total, same
~4.7s LCP, both before and — per two separate live runs — after). Root-cause
investigation (below, "Root cause, corrected") found the scoped-invalidate
fix is real and correct for what it targets, but **targets the wrong
mechanism** — the actual duplicate fetch is caused by an unrelated
architectural pattern in `dmsSiteFactory.jsx`, not by the loader's
auth-token retry branch at all. The scoped-invalidate fix should stay (it's
a legitimate improvement to `setCache({})`'s blast radius) but does not
close this task. See "Root cause, corrected" for the real mechanism and open
questions before attempting a fix.

**The actual fix for the measured duplicate-fetch/LCP regression is split
out to a new task**:
[route-build-duplicate-falcor-instances.md](./route-build-duplicate-falcor-instances.md)
— `dmsSiteFactory.jsx` builds routes twice (a fast path from cached/SSR
data, then an unconditional full-fetch pass), and each pass's
`dmsPageFactory()` call constructs its own fresh, empty-cache Falcor
instance, so the full-fetch pass can never see what the fast path already
fetched. This task (the auth-token retry logic) stays open only for the
narrower `setCache({})`-blast-radius concern; it does not by itself resolve
the Lighthouse-measured regression.

## Fixes shipped this session (DONE, verified)

All in submodule `src/dms`, commits `77c2bf4d` and `11d57a66` ("perf + fix"),
plus root-repo commit `739a322` and uncommitted `index.html`.

1. **Loader retried on every anonymous load, not just post-login** —
   `render/dmsPageFactory.jsx` loader. A blocked row's every field (including
   `id`) comes back as the literal string `'no-access'` — including rows
   pulled in only for site-nav, unrelated to the page being viewed. So
   `data.some(d => d.id === 'no-access')` was true on almost any anonymous
   load of a site restricting *any* nav page, and the loader unconditionally
   did `falcor.setCache({}); ` + refetched — a duplicate full data fetch on
   nearly every anonymous page load. Fixed: gate the retry on
   `currentAuthToken !== lastAuthToken` (module-scoped closure var), so it
   only fires when a user has actually just logged in, not on every
   anonymous load. (commit `77c2bf4d`)

2. **Cross-origin logo redirect hurting LCP** — `src/themes/mny/theme.js`:
   `sidenav.logo.img` pointed at `https://mitigateny.org/themes/mny/mnyLogo.svg`
   (absolute, cross-origin from the CDN/edge serving the page), forcing a full
   DNS+TCP+TLS handshake for the LCP image. Changed to a same-origin relative
   path `/themes/mny/mnyLogo.svg`. (commit `739a322`)

3. **SSR-hydration stuck-no-access bug** — SSR always renders anonymous
   (`render/ssr2/handler.jsx` hardcodes `localStorage.getItem` to `null` —
   the server never sees a browser's token), and client hydration reuses that
   server-rendered loader data as-is without re-running the loader. A
   genuinely authorized, already-logged-in user hard-navigating straight to a
   restricted page got stuck seeing the SSR "no-access" render forever —
   nothing else re-asked the server once the real token was available. Fixed:
   `DMS()` component effect in `dmsPageFactory.jsx` that calls
   `revalidator.revalidate()` once, when `useAuth()` reports a confirmed
   (`authed && !isAuthenticating`) user on a page whose loader data shows
   `no-access`. (commit `77c2bf4d`)

4. **Infinite revalidate loop from fix #3's first cut** — the first version
   gated the revalidate-once effect on a `useRef`, which resets on every
   fresh **mount** (not just re-render). A remount for an unrelated reason
   (there's a real one: `dms-manager/wrapper.jsx`'s `EditWrapper` resolves
   `item` in two phases on mount) let the effect refire — and since "this
   user has no access" never changes for a permanently-denied user, one real
   remount was enough to turn a single intended retry into an infinite one.
   Fixed: replaced the `useRef` with a **closure-scoped module variable**
   (`lastRevalidateAttemptToken`, declared outside the component, same
   pattern as fix #1's `lastAuthToken`) — a closure survives a remount, a
   `useRef` does not. (commit `11d57a66`)

5. **`JSON.parse`/`.filter` crashes exposed by fix #3** — once no-access
   pages started actually re-rendering (instead of being stuck), two
   pre-existing landmines got hit for the first time in practice:
   - `getPageAuthPermissions` (`patterns/page/pages/_utils/index.js`) and the
     inline duplicate in `section.jsx` did `JSON.parse(authPermissions)`
     whenever `authPermissions` was a string — but a blocked row's
     `authPermissions` field is the literal string `'no-access'`, not JSON,
     so `JSON.parse` threw and took the whole page down. Fixed: wrapped in
     try/catch, returns `undefined` on parse failure; `section.jsx`'s inline
     duplicate now calls the shared `getPageAuthPermissions` instead of
     reimplementing the (buggy) logic itself.
   - `patterns/page/pages/edit/index.jsx`'s `getSectionGroups` did
     `(item?.draft_section_groups || []).filter(...)` — a non-empty string
     (`'no-access'`) is truthy, so `|| []` didn't catch it and `.filter`
     crashed on a string. Fixed: `Array.isArray(...) ? ... : []`.
   - Same file: the `useMemo` calls building `headerChildren`/`footerChildren`/
     `contentChildren` were *below* the early `if (item?.id === 'no-access')`
     return, so a render that takes that branch calls fewer hooks than one
     that doesn't — React's "Rendered fewer hooks than expected" the next
     time a render alternates branches (a real transition here: `EditWrapper`
     resolves `item` in two phases, an initial guess then a corrective
     no-access stub). Fixed: hoisted the three `useMemo` calls above the
     early returns. (commit `77c2bf4d`, `11d57a66`)

6. **Preconnect hints added to `index.html`** (uncommitted) — `<link
   rel="preconnect">` for `cdn.jsdelivr.net`, `fonts.googleapis.com`,
   `fonts.gstatic.com` (the CDN Tailwind script + Google Fonts + the font
   files it references), so the DNS+TCP+TLS handshake starts immediately in
   parallel with parsing instead of only once the parser reaches the tags
   that use them. **Verified live in production** (Lighthouse's
   network-dependency-tree-insight recognizes all three as
   "Preconnected origins" with the correct `<link>` source nodes) but
   **showed no measurable FCP/LCP/Speed-Index improvement** — before/after
   anonymous Lighthouse runs on `https://www.devmny.org/playground/blank_page`
   were statistically flat (Performance score 61→60, LCP 2068ms→2096ms,
   Speed Index 2260ms→2411ms — the latter is actually slightly worse, within
   single-run noise). Kept as a low-risk hardening measure since it can't
   hurt, but don't expect/claim a win from it. Not yet committed —
   `git status` shows `M index.html`.

## Open problem: authenticated-session duplicate full-page fetch (FIX IMPLEMENTED, NOT YET LIVE-VERIFIED)

**Diagnosed from production Lighthouse data 2026-09-02, not yet fixed.**
Three Lighthouse runs against `https://www.devmny.org/playground/blank_page?name=name123`:

| | Before (anon) | After preconnect (anon) | **After logging in** |
|---|---|---|---|
| Performance score | 61 | 60 | **44** |
| FCP | 1688ms | 1696ms | 1658ms |
| LCP | 2068ms | 2096ms | **4757ms** |
| Speed Index | 2260ms | 2411ms | **3606ms** |
| TBT | 430ms | 428ms | 447ms |
| Total byte weight | 2,231,714 B | 2,231,683 B | **5,713,425 B** |

The anonymous before/after (preconnect) comparison is flat/noise — already
covered by fix #6 above. The **logged-in run is the new finding**: LCP more
than doubles and total payload jumps ~2.6x for an authenticated session on
the *same URL*.

### Root cause (diagnosed, not yet fixed)

The `network-requests` audit on the logged-in run shows the page's **entire
Falcor dataset fetched twice**, byte-for-byte identical, back to back:

- `.../byId,[2243673,2333718,2334035]...` → 1,640,824 B, then again 1,640,761 B
- `.../byId,{2333727,2333728}...` → 117,627 B, then again 117,618 B
- Plus the `mitigateny_playground|page` byIndex lookup and every other `byId`
  chunk for this page, all duplicated

`lcp-breakdown-insight` shows `resourceLoadDelay: 4281.9ms` — almost the
entire LCP time is spent waiting *before* the LCP image's own load even
starts, consistent with the network/main-thread being saturated by this
duplicate ~1.76MB+ transfer ahead of it.

This is the loader's fix-#1 retry mechanism (`falcor.setCache({}); data =
await dmsDataLoader(...)`) firing exactly as designed — this particular page
apparently has at least one `no-access`-sentinel entry in its anonymous
(SSR) data even though the page itself renders content, so a logged-in user
correctly triggers the one-shot retry. **The bug is not that it retries — a
retry here is correct and intentional. The bug is that `falcor.setCache({})`
wipes the ENTIRE falcor cache**, not just the blocked entries, so the retry's
`dmsDataLoader` call re-fetches everything the page already successfully
loaded on the first pass too, not just the piece that was actually blocked.
That blanket-wipe behavior predates this session's changes (fix #1 only
added the token-gate to control *how often* it fires, not *what* it wipes) —
but fix #1 makes it fire reliably once per login, so this cost is now a
real, reproducible tax on every authenticated user landing on a page with
at least one restricted section.

### Research findings (2026-09-02, via Explore agent — informs the plan below)

1. **What survives in a blocked item, and what doesn't.** Server-side
   (`dms-server/src/routes/dms/dms.route.js:73-113`), a blocked row still
   writes to the *real* graph path `["dms","data",app,"byId",idStr,att]` —
   only the **value** is scrubbed to `'no-access'` per attribute, except
   `app` and `type`, which keep their real values (lines ~90-95). Client-side,
   `api/proecessNewData.js:16-23` does `Object.values(byIdCache)` to flatten
   the cache into the `data` array — this **discards the object keys**, i.e.
   the real numeric id is lost by the time `dmsPageFactory.jsx` sees the
   item. So a blocked item arrives as `{ id: 'no-access', app: <real>, type:
   <real>, ...everything else: 'no-access' }`. **`app`/`type` are usable for
   scoping today; the real per-row id is not** (would need a small
   `processNewData` change — e.g. stash the real key as `_falcorId` — to
   scope any tighter than pattern-level).

2. **`falcor.invalidate()` exists, is scoped, and is already the codebase's
   norm.** `falcorGraph()` (`node_modules/@availabs/avl-falcor/src/falcorGraph.js:194-207`)
   only adds `get`/`chunk`/`onChange`/`remove` on top of plain `falcor`'s
   `Model` — `invalidate` and `setCache` are unmodified `Model.prototype`
   methods. `Model.prototype.invalidate(...path sets)` (`falcor/lib/Model.js:272-288`)
   walks the cache tree and removes exactly the given node(s) —
   `falcor.invalidate(['dms','data','myapp+mytype'])` or
   `falcor.invalidate(['dms','data',app,'byId',id])` are real, working calls;
   `~35 call sites` across `api/index.js`, `updateDMSAttrs.js`, map/dataset
   components already use this pattern, always scoped to a specific
   `['dms','data',...]` or `['uda',...]` subtree. `setCache({})` replaces the
   *entire* root cache — there is no partial form of it.

3. **`falcor.setCache({})` is used in exactly one place in the whole repo**
   (excluding `node_modules`): `dmsPageFactory.jsx:69`, the code this task is
   about. No other call site needs reconciling — this is a self-contained fix.

4. **Blast radius confirmed disproportionate.** A single page-view normally
   costs *one* `falcor.get()` covering 2-3 path-sets (the pattern's full nav
   list `byIndex {0..499}`, the current page's `byId`/`searchOne`, length),
   plus 0-2 more for nested dms-format refs, plus N more if `preload_data`
   triggers per-section preloading. `setCache({})` discards **all of that
   across every pattern and every site visited this session** — nav data,
   every other pattern's page lists, every dataset/source (`uda.*`) cache,
   map layer symbology — forcing a re-fetch storm on the very next render.
   A scoped invalidate only forces a re-fetch of the one pattern actually
   affected.

### Fix plan (IMPLEMENTED, uncommitted — see `git -C src/dms status`)

In `dmsPageFactory.jsx`'s `loader()`, replaced the blanket wipe with a scoped
invalidate, exactly per the plan below (implemented 2026-09-02, not yet
committed or live-verified — see the updated "Testing checklist"). Original
plan-writing notes kept for reference:

```js
// current (line ~68-72):
if (currentAuthToken !== lastAuthToken && data.some(d => d.id === 'no-access')) {
  falcor.setCache({});
  data = await dmsDataLoader(falcor, dmsConfig, `/${params["*"] || ""}`);
  lastAuthToken = currentAuthToken;
}
```

with a scoped invalidate over the distinct `app+type` pairs actually seen
among the blocked items:

```js
if (currentAuthToken !== lastAuthToken) {
  const blocked = data.filter(d => d.id === 'no-access');
  if (blocked.length) {
    const paths = [...new Set(blocked.map(d => `${d.app}+${d.type}`))]
      .map(appType => ['dms', 'data', appType]);
    falcor.invalidate(...paths);
    data = await dmsDataLoader(falcor, dmsConfig, `/${params["*"] || ""}`);
    lastAuthToken = currentAuthToken;
  }
}
```

Notes/caveats — resolved during implementation (2026-09-02):
- Used `await falcor.invalidate(...)` (matching the existing call-site
  convention in `api/index.js`, e.g. line 282's `await
  falcor.invalidate(...udaReqsToInvalidate)`), even though `invalidate` is
  synchronous per `Model.js`.
- **Confirmed `d.app`/`d.type` are present on blocked items** by reading the
  actual code paths (not just asserting from memory):
  - Server: `dms-server/src/routes/dms/dms.route.js:79-80` sets `att ===
    'app'` → `row.app || app || null` and `att === 'type'` → `row.type ||
    null` even inside the `if (blocked)` branch — only the *other* attributes
    get scrubbed to `'no-access'`.
  - Client: `api/proecessNewData.js`'s filter (`d.id && d.app === app &&
    (d.type === type || ...)`) at line ~24-29 passes blocked rows through
    (`d.id === 'no-access'` is truthy), and the flatten loop below copies
    every non-`data` column — including `app`/`type` — onto the output
    object. So `data[i].app`/`.type` are real, populated strings on every
    blocked item reaching the loader, not just in theory.
- This is **pattern-level** scoping (`['dms','data', app+type]`), not
  per-row — confirmed as the right/available granularity; per-row scoping
  remains a possible follow-up (would need `processNewData.js` to stop
  discarding the real numeric id), not a blocker.
- **Still open / not yet confirmed**: whether invalidating
  `['dms','data',appType]` also covers the `byId`/`byIndex` sub-paths under
  it in practice (vs. requiring the exact leaf path) — this needs the live
  Lighthouse re-verification below to confirm the duplicate fetch is
  actually gone, not just code-reading confidence.

## Root cause, corrected (2026-09-02, via Explore agent + direct code read — supersedes the "Root cause" section above)

The scoped-invalidate fix targets `dmsPageFactory.jsx`'s `loader()` retry
branch (`currentAuthToken !== lastAuthToken`) and the separate SSR-mismatch
`DMS()` component effect (`revalidator.revalidate()`, gated on
`lastRevalidateAttemptToken`). **Both are dead code for the duplicate seen in
these Lighthouse traces.** The real mechanism is one level up, in
`packages/dms/src/render/spa/dmsSiteFactory.jsx`:

1. **`dmsPageFactory()` creates a brand-new `falcorGraph()` Model instance
   with an empty cache on every call** (`dmsPageFactory.jsx:26`,
   `const falcor = falcorGraph(API_HOST)`) — and therefore fresh
   `lastAuthToken`/`lastRevalidateAttemptToken` closures too, per call.
2. **`dmsSiteFactory.jsx` calls `pattern2routes()` (→ `dmsPageFactory()` per
   pattern, `render/spa/utils/index.js:374`) at least twice by design** for
   the common case of a returning visitor / SSR page:
   - **Fast path** (`dmsSiteFactory.jsx:71-78`, and the lazy-themes variant
     at `:94-109`): builds routes synchronously from `localStorePatterns` or
     SSR `defaultData` — its own explicit purpose is to render something
     immediately without waiting on the network.
   - **Full-fetch path** (`dmsSiteFactory.jsx:111+`): **unconditionally**
     re-does the full API fetch afterward — the comment at `:116-118` is
     explicit: *"Always do the full API fetch — defaultData may only
     contain a subset of routes... The fetch fills in any missing routes."*
     This is deliberate (defaultData can be partial), but because each pass
     builds its routes through a brand-new `dmsPageFactory()` → brand-new
     `falcorGraph()`, **the full-fetch pass's loader can never see anything
     the fast path already fetched** — it has no shared cache to hit, so it
     re-fetches the entire page graph from the network from scratch.

This explains the Lighthouse pattern precisely: two sequential, non-
overlapping full fetches of the same byId chunk(s), because there are
literally two independent Falcor Model instances involved, not one instance
retrying. It also explains why the auth-token gates in both existing retry
mechanisms never fire on this path: each `dmsPageFactory()` call reads
`window.localStorage.getItem('userToken')` fresh into its own closure, so
there's no "previous token" to differ from within a single call's lifetime —
the token comparison literally cannot observe a change that happened before
the closure was created.

**Why this correlates with "logged in"**: a returning/authenticated visitor
is more likely to have `localStorePatterns` populated (or hit an
SSR-prerendered page) than a first-time anonymous visitor, so the fast-path
+ full-fetch double-build is more likely to actually trigger for them — but
the mechanism itself has nothing to do with auth state; it would reproduce
for any page load where cached/default route data exists, logged in or not.

**Open before attempting a fix** (this is now a different, larger-scope
question than the original task — needs a design decision, not a quick
patch):
- Should the fast path and full-fetch path share ONE `falcorGraph()`
  instance (so the full fetch's Model already has the fast path's cached
  entries and only needs to fetch what's actually missing/stale)? This
  likely requires restructuring how `pattern2routes()`/`dmsPageFactory()`
  receive their Falcor instance (currently instantiated internally per call,
  not passed in) — a broader refactor than a loader tweak.
- Alternative: skip the full-fetch pass entirely when the fast-path data is
  confirmed complete/fresh (e.g. a version/ETag check) — avoids the refactor
  but changes the "always full-fetch to catch missing routes" guarantee the
  `:116-118` comment describes as deliberate; would need to confirm that
  guarantee is still safe to relax before touching it.
- Not yet confirmed via runtime trace (only via static code read): that the
  *second* `pattern2routes()` call (line 105, or the lazy-themes variant at
  line 94-109) is what coincides with the *second* observed network fetch,
  as opposed to some other route-rebuild trigger. Should be confirmed with a
  breakpoint/log before implementing, per the investigating agent's own
  caveat.

## Testing checklist

- [x] Fixes 1-5: verified live against production (SSR no-access no longer
      sticks for authed users; no infinite revalidate loop; no JSON.parse/
      `.filter` crashes) — see prior session notes (this task file was
      written retroactively to consolidate them; original live-verification
      detail lives in this session's conversation log, not restated here)
- [x] Fix 6 (preconnect hints): confirmed live in production via Lighthouse
      network-dependency-tree-insight; confirmed NO measurable FCP/LCP/SI
      win (before/after anonymous runs statistically flat)
- [ ] **Open problem fix (once implemented)**: re-run the same three
      Lighthouse scenarios (anon before/after, logged-in) against
      `https://www.devmny.org/playground/blank_page?name=name123` (or an
      equivalent page with at least one restricted nav item) and confirm:
      - Logged-in total byte weight drops back toward the anonymous ~2.2MB
        baseline (not ~5.7MB)
      - Logged-in LCP drops back toward the anonymous ~2.1s baseline (not
        ~4.8s)
      - `network-requests` audit no longer shows duplicate identical-size
        fetches for the same `byId`/`byIndex` paths
      - Anonymous-session behavior (fix #1) is unaffected — still only
        retries on an actual post-login token change, not every load
      - A genuinely-denied user (never logs in, or logs in but still lacks
        access) still sees the correct no-access UI, not a stale/partial
        page from an under-invalidated cache
- [ ] Commit `index.html` (root repo, `M index.html`) and
      `dmsPageFactory.jsx` (submodule, `M
      packages/dms/src/render/dmsPageFactory.jsx`) — not done yet since no
      explicit request to commit was given this session, and the
      dmsPageFactory.jsx change specifically should land only after the
      Lighthouse re-verification below confirms it actually fixes the
      duplicate-fetch regression

## Files touched so far

- `packages/dms/src/render/dmsPageFactory.jsx` (submodule) — fixes 1, 3, 4,
  and now the open-problem fix too (loader retry branch, uncommitted —
  scoped `falcor.invalidate` replacing `falcor.setCache({})`)
- `packages/dms/src/patterns/page/pages/_utils/index.js` (submodule) — fix 5
- `packages/dms/src/patterns/page/components/sections/section.jsx` (submodule) — fix 5
- `packages/dms/src/patterns/page/pages/edit/index.jsx` (submodule) — fix 5
- `src/themes/mny/theme.js` (root repo) — fix 2
- `index.html` (root repo, uncommitted) — fix 6
