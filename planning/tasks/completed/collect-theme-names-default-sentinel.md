> **SUPERSEDED, reverted 2026-09-15.** The user redirected: instead of making the `'default'`
> sentinel resolve to a named theme module via the loader registry, tessera_v6's actual values are
> being ported directly into the library's own `.theme.js` component files (the ones
> `ui/defaultTheme.js` and each pattern's `defaultTheme.js` aggregate from) — "update the places
> where defaultTheme is built from." That makes tessera *be* the library baseline outright, so this
> loader-registry indirection is unnecessary ("that way we don't need the default loader"). The
> `collectThemeNames` change described below has been reverted to its original form. See
> [`tessera-component-theme-port.md`](../current/tessera-component-theme-port.md) for the actual work.

# `collectThemeNames` never requests the `'default'` theme sentinel

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** dropped (was: "SUPERSEDED, reverted 2026-09-15.") · **Created by:** ssangdod@albany.edu · **Edited by:** —

## Objective

Make the `'default'` theme name — the sentinel `getPatternTheme()` falls back to when a pattern has
no `theme.selectedTheme`, and what `patterns/admin/siteConfig.jsx` hardcodes for every project's admin
pattern — actually resolvable to a real theme module, instead of always silently resolving to `{}`.

Triggered by a dms-template-side task
([`planning/shared/tasks/completed/tessera-default-theme.md`](../../../../../planning/shared/tasks/completed/tessera-default-theme.md))
that wants `src/themes/index.js`'s loader registry to map `default` → the tessera_v6 theme module. That
change alone turned out to be a no-op — this is why, and the fix.

## Current State (root cause)

`getPatternTheme()` (`ui/useTheme.js:110-120`) computes:

```js
let patternSelection = (
  pattern?.theme?.selectedTheme ||
  pattern?.theme?.settings?.theme?.theme ||
  'default'
)
let baseTheme = mergeTheme(defaultTheme, themes?.[patternSelection] || {})
```

`themes` here is an **already-resolved** `{name: themeModule}` map, built earlier by
`resolveThemes(themesConfig, siteData)` → `themesConfig(collectThemeNames(siteData))`
(`render/spa/utils/index.js:99-119`), where `themesConfig` is the host app's lazy loader (e.g.
dms-template's `src/themes/index.js`'s `loadThemes`).

`collectThemeNames` only ever added a name when a pattern row's own `theme.selectedTheme` was
truthy:

```js
patterns.forEach(p => {
    if (p?.theme?.selectedTheme) names.add(p.theme.selectedTheme);
    if (p?.pattern_type === 'auth') names.add('mny_admin');
});
```

Two real gaps:
1. A pattern with **no** `selectedTheme` at all contributes nothing — `'default'` is never added on
   its behalf, even though that's exactly the name `getPatternTheme` will look for at render time.
2. The **admin pattern** isn't a stored pattern row in `siteData` in the first place — it's
   constructed at runtime by `adminConfig()`, which passes `theme: { selectedTheme: "default" }`
   directly into its own `getPatternTheme()` call, reusing whatever `themes` map was already resolved
   for the site's *other* patterns. So admin's need for `'default'` was never captured either.

Net effect: `themes.default` was always `undefined`, `themes?.[patternSelection] || {}` always fell
through to `{}`, and `mergeTheme(defaultTheme, {})` was just the library's own baked-in `defaultTheme`
object — regardless of what any host app's loader registry mapped `default` to (nothing did, until
now, but it wouldn't have mattered).

I confirmed all 3 `pattern2routes(...)` call sites that matter (`render/spa/dmsSiteFactory.jsx:105`,
`:302`/`:314`, `:366`) receive `themes: resolvedThemes` from `resolveThemes()` — i.e. this same
`collectThemeNames` path, for both the client SPA (cold load and cached/fast-path) and SSR (same
`dmsSiteFactory` code, no separate name-collection logic). The one synchronous fast path
(`dmsSiteFactory.jsx:71-77`) only fires when `themes` was already a **pre-resolved plain object**
(SSR hydration), which itself was built via the same chain upstream. So this is the single choke
point — no other place independently decides which theme names to load.

I also checked `pattern2routes`'s own merge (`utils/index.js:157`,
`themes = themes?.default ? {...themes, ...dbThemes} : {...themes, ...dbThemes, default: {}}`) — this
is a **truthy-value** check, not a key-existence check, so once `collectThemeNames` actually requests
`'default'` and gets back a non-empty module, this line's first branch fires correctly and preserves
it. No change needed there.

## Proposed / Implemented Change

`render/spa/utils/index.js` — seed `collectThemeNames`'s result set with `'default'` unconditionally:

```js
export function collectThemeNames(siteData) {
    const patterns = (siteData || []).reduce((acc, row) => [...acc, ...(row?.patterns || [])], []);
    const names = new Set(['default']);
    patterns.forEach(p => {
        if (p?.theme?.selectedTheme) names.add(p.theme.selectedTheme);
        if (p?.pattern_type === 'auth') names.add('mny_admin');
    });
    return [...names];
}
```

Always requesting it is cheap (one extra name in a `Set`, deduped, and the loader itself
memoizes/dedupes concurrent loads — see `src/themes/index.js`'s `resolved`/`inflight` maps) and covers
every case: patterns with no `selectedTheme`, the admin pattern's hardcoded selection, and the legacy
`theme.settings.theme.theme` path.

Also updated the function's JSDoc (had explicitly documented the *old*, soon-to-be-false rationale:
"admin... uses selectedTheme: 'default', which needs no theme module").

**STATUS: DONE.** Also see `planning/shared/tasks/completed/tessera-default-theme.md` for the
host-app-side change (`src/themes/index.js`'s new `default` loader entry) this unblocks.

## Files Requiring Changes

- `src/dms/packages/dms/src/render/spa/utils/index.js` — `collectThemeNames` (done).

## Testing Checklist

- [ ] A pattern with no `selectedTheme` set resolves `themes['default']` to whatever the host app's
      loader registry maps `'default'` to (verify via a host app that actually registers one — see
      the shared-project task).
- [ ] A pattern that explicitly sets some other `selectedTheme` is unaffected (still resolves its own
      name; `'default'` is fetched alongside but unused for that pattern).
- [ ] Admin pattern picks up the same resolved `'default'` theme (no separate wiring needed there —
      it reuses the site's already-resolved `themes` map).
- [ ] No regression for a host app whose loader registry has **no** `default` entry at all — falls
      through to `{}` exactly as before (the `Set` requesting the name doesn't change behavior for a
      loader that can't satisfy it; `loadThemes`/`loadOne` already return `null`/omit unknown names).
- [ ] Bundle-size sanity check: confirm the extra always-requested `'default'` import doesn't pull in
      an unexpectedly heavy chunk for apps that don't need it (see
      `planning/shared/bundle-size-log.md`) — for dms-template specifically it's the same tessera_v6
      chunk already loaded by any tessera pattern, so no new chunk, but a future host app pointing
      `default` at something heavy should be aware this is now eagerly requested on every site.
