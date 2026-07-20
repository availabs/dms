# Page/section remount (visible "refresh") on search-param navigation

## Objective

Eliminate the visible full **refresh** of a page (and its map re-initializing / re-fetching tiles) that
happens whenever a page variable is written to the URL — i.e. whenever the app `navigate()`s to the same
page with new search params. The page should **re-render**, not remount, on a search-only navigation.

## Why this matters now

The map share-state → page-variable work (`map-share-state-via-page-variables.md`) made the map write
`?layers=`/`?<key>=` through `updatePageStateFilters` (→ `navigate`). That surfaced this pre-existing
issue: every such write triggers a navigation, and the navigation visibly refreshes the page. A
[fix landed](./map-share-state-via-page-variables.md) that stops the *infinite* loop (the map WRITE now
defers to the first page→state READ per mount, so a remount can't rewrite the saved default), but a
**single refresh per toggle remains** because the underlying navigation still remounts / fully re-renders
the tree. This is the same class the superseded "react-compiler-page-remount-loop" note described.

Owner (2026-07-14): "the page very obviously refreshes, it would be highly preferable if we could find a
way around this." Scope for now = **research + this task doc**, not the fix.

## Evidence

- Instrumented the map's WRITE effect: `shareWritePrimedRef` (a `useRef`) logged `null` **repeatedly** on a
  single toggle → the map section is genuinely **remounting** (a ref only resets on remount), and
  `stateVisible` (map) vs `wantedIds` (page) oscillated `[1]↔[2]` until the READ-gate fix settled it.
- Symptom persists post-fix as a single refresh per navigation (map re-inits/tiles re-fetch).

## What was ruled OUT (all stable on a search-only navigate — verified by reading)

The routing/data chain is memoized on `path` (the splat, which excludes search), so a `?layers=` change
should NOT rebuild any of it:

- **Router** (`render/spa/dmsSiteFactory.jsx:118`) — `useMemo(createBrowserRouter(...), [dynamicRoutes, …])`.
  `dynamicRoutes` is `useState`, only updated on initial load / async fetch / sync — **not per navigate**.
- **`DMS` route component** (`render/dmsPageFactory.jsx:74-87`) — `useMemo(..., [params["*"]])`, stable on search.
- **`DmsManager.RenderView`** (`dms-manager/index.jsx:77`) — `useMemo(getActiveView(...), [path, user])`; uses a
  `stableKey` (`:46`) that excludes search.
- **`Wrapper`/`EditWrapper`** (`dms-manager/wrapper.jsx`) — pins the component identity via
  `useMemo(() => Component, [])` (`:135`) and memoizes output on `[data, item]` (`:136`). So even the inline
  route components below are largely neutralized here.

So static analysis says the chain should **re-render, not remount** — yet the ref evidence shows a remount.
**The exact remount boundary is not yet pinned from reading alone** and needs runtime instrumentation (see plan).

## Confirmed contributing factors (fix candidates)

1. **No `shouldRevalidate` anywhere** in the page pattern / `dmsPageFactory`. The route `loader`
   (`dmsPageFactory.jsx:27`, → `preloadPageSections(falcor, data, request.url, …)` in
   `patterns/page/siteConfig.jsx:101`) **keys on `request.url`**, so React Router **re-runs the loader on
   every navigation including search-only ones**. That hands a fresh `loaderResult`/`item` down the tree
   (`wrapper.jsx:21,136` re-memo on `[data, item]`) → the page re-renders with a new `item` object on each
   `?layers=` write. **Leading fix:** add `shouldRevalidate` so search-only changes that the page already
   handles in-memory (URL-bound page filters) do **not** re-run the server loader. The page already syncs
   search→filters via `updatePageStateFiltersOnSearchParamChange`; re-running the loader is redundant.
2. **`view.jsx` does not memoize its sections.** `getSectionGroups('content')` is called inline in the
   render (`pages/view.jsx:198`), unlike `edit/index.jsx` which wraps it in
   `useMemo(..., [item?.draft_section_groups])`. So on every PageView re-render (e.g. each `pageState.filters`
   change from a navigate) all SectionGroups/sections are rebuilt. **Fix:** memoize
   `getSectionGroups('content')` (+ top/bottom) on `[item?.section_groups]`, matching edit.
3. **Inline route component identities** — `siteConfig.jsx:108` (CMS/Theme context wrapper),
   `:169` (`(props)=><PageEdit/>`), `:181` (`(props)=><PageView/>`), and `dmsPageFactory.jsx:92`
   (`(props)=>(<>…<DMS/></>)`). New arrow identity each time the config is built. Mostly neutralized by the
   `EditWrapper` `useMemo(()=>Component,[])` pin, but a latent remount source if the config is ever rebuilt
   mid-session. **Fix (defensive):** hoist to stable module-level named components.

## Investigation plan (do first — pin the remount boundary)

Add temporary mount/unmount logging (a `useEffect(() => { log('mount X'); return () => log('unmount X') }, [])`)
at each boundary and do ONE search-only navigate:
`DMS` → `EditWrapper` → `PageView` → `SectionGroup` → `section` → `MapSection`.
Whichever logs unmount+mount on a search-only navigate is the culprit. Likely candidates given the above:
the loader revalidation forcing a new `item` through an unmemoized path (§2), or a `key`/identity tied to
`search`/`location`/`item` somewhere in the section-render path.

## Candidate fixes (in likely-leverage order)

1. **`shouldRevalidate`** on the DMS page route/factory — skip loader re-run when only search params changed
   (or specifically when the changed keys are URL-bound page filters). Highest leverage: kills the
   revalidation→fresh-item→re-render/refresh cascade at the source for all filter writes, not just the map.
   Verify it doesn't break legitimate revalidation (data edits, cross-page nav).
2. **Memoize `view.jsx` sections** (§2) — cheap, clearly correct, matches edit.
3. **Hoist inline route components** (§3) — defensive robustness.

Re-verify after each: search-only navigate (map `?layers=` toggle) should NOT remount `MapSection`
(`shareWritePrimedRef` stays non-null across the navigate) and the map should not re-fetch tiles / flash.

## Backward-compatibility / risk

- `shouldRevalidate` is the riskiest — it changes when server data reloads. Must preserve revalidation for
  genuine data changes (apiUpdate already calls `revalidate()` explicitly in `wrapper.jsx`) and cross-page
  navigation. Scope the skip narrowly (same path + only URL-bound-filter search keys changed).
- Memoizing view sections is BC (edit already does it).
- Hoisting inline components is BC (identity-only change).

## Files

`patterns/page/siteConfig.jsx`, `render/dmsPageFactory.jsx`, `patterns/page/pages/view.jsx`,
`dms-manager/wrapper.jsx` (reference), `dms-manager/index.jsx` (reference). Mirror any changes to the
transportNY vendored copy. `map_dama/` untouched.

## DONE — 2026-07-14 (owner-verified)

**Root cause confirmed via mount/unmount instrumentation:** the route `loader` (`dmsPageFactory.jsx`)
keys on `request.url`, so a search-only navigation (the map writing `?layers=`) triggers React Router
**revalidation**, and that revalidation **remounts the whole route tree** — the probes showed
`loader run` → `PageView UNMOUNT/MOUNT` → `MapSection UNMOUNT/MOUNT` on each toggle (plus a
`No HydrateFallback` warning from `RouterProvider`). It was the loader re-run, coupled to the remount,
not a section-render key churn.

**Fix (leading candidate confirmed): `shouldRevalidate` on the DMS page route** (`render/dmsPageFactory.jsx`).
Returns `false` when only the search params changed on the same path — those are page-variable/filter
navigations the page already handles in-memory (`updatePageStateFiltersOnSearchParamChange` syncs
search→filters; sections refetch client-side via the dataWrapper). Still revalidates on cross-page
navigation (`pathname` change), mutations (non-GET `formMethod`), and explicit `revalidate()` (same URL →
`defaultShouldRevalidate`). One-line-of-intent, low blast radius. Owner-verified: the toggle no longer
refreshes the page. Mirrored to transportNY.

**The other candidates were NOT needed** (the `shouldRevalidate` fix resolved it alone) — left as optional
future hygiene, not done: memoizing `view.jsx`'s `getSectionGroups('content')` (perf nicety; edit already
does it), and hoisting the inline route components in `siteConfig.jsx`/`dmsPageFactory.jsx` (defensive).
The initial-load double-loader + StrictMode mount-replay + auth-resolution re-render seen in dev logs are
separate expected dev behavior, not this search-param bug.
