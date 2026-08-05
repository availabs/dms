# Map plugins: theme-driven registration

## Objective

Map plugins (the `PluginLibrary`/`RegisterPlugin` system used by the report-page `Map` section
and the `mapeditor` pattern's authoring UI) are only reachable today via a `damaMapPlugins` prop
passed to `<DmsSite>` — mirroring `damaDataTypes`. dms-template's own `App.jsx` never sets this
prop, so no site built on dms-template can activate a map plugin at all, even though the
consuming machinery (`PluginLayer`, `ExternalPluginPanel`, `InternalPluginPanel`) is already fully
wired into the `Map` section.

Add a `theme.mapPlugins` key, auto-registered the same way `theme.pageComponents` and
`theme.sectionHeaderExtensions` already are, so a theme can declare map plugins declaratively
without any `App.jsx`/site-config changes.

## Scope

In scope: the registration plumbing only (2 files). Out of scope: the actual plugin
implementations being ported in from transportNY — tracked separately in this repo's root
`planning/transportny/tasks/completed/port-transportny-map-plugins.md`.

## Current State (before this task)

- `patterns/page/siteConfig.jsx` and `patterns/mapeditor/siteConfig.jsx` both already accept a
  `damaMapPlugins` prop and call `RegisterPlugin` for each entry — but only from that prop, never
  from `theme`.
- `theme.pageComponents` / `theme.sectionMenuExtensions` / `theme.sectionHeaderExtensions` are
  auto-registered from the resolved `theme` object in both files already — the pattern to copy.

## Proposed Changes — DONE

Added, in both files, right after the existing `theme.sectionHeaderExtensions` auto-registration
block (page) / right after `theme = getPatternTheme(...)` (mapeditor):

```js
if (theme.mapPlugins) {
  Object.entries(theme.mapPlugins).forEach(([name, plugin]) => RegisterPlugin(name, plugin))
}
```

A theme can now do:

```js
// theme.js
import { RoutecreationPlugin } from './components/mapPlugins/routecreation/routecreation.plugin'
const theme = {
  mapPlugins: { routecreation: RoutecreationPlugin },
  ...
}
```

## Files Requiring Changes

- [x] `src/dms/packages/dms/src/patterns/page/siteConfig.jsx` — added `theme.mapPlugins` block
- [x] `src/dms/packages/dms/src/patterns/mapeditor/siteConfig.jsx` — added `theme.mapPlugins` block

## Testing Checklist

- [x] `report_probe.mjs` against an existing report page (`converted_reports/madison_ave_vs_western_ave_downtown`)
      — zero console errors, zero page errors, zero bad responses. Confirms the additive change
      doesn't regress anything even with `theme.mapPlugins` unset (2026-07-29).
- [x] Live-verify a plugin actually activates via this path once one is ported in (see
      `planning/transportny/tasks/completed/port-transportny-map-plugins.md` at the repo root) — both
      `routecreation` and `macroview` registered and confirmed live via `theme.mapPlugins` the
      same day (2026-07-29).
