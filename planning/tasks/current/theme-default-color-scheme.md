# Per-theme default color scheme (light / dark)

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** built · **Release:** commit — uncommitted, awaiting review · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** —

## Objective

Let each theme pick the color scheme a viewer gets before they've used the ThemeToggle. If a theme doesn't
set one, keep today's logic: the viewer's saved toggle choice, else the OS `prefers-color-scheme`.

## Current State (before)

`applySavedColorScheme()` in `ui/components/ThemeToggle.jsx` decided dark/light from
`localStorage['dms-color-scheme']`, falling back to the OS. It ran at module load in `dmsSiteFactory.jsx`
(edit-pane-dark-mode.md, 2026-09-30) and in every toggle's mount effect. No theme input, so viewers with a
dark OS always got dark.

## Changes — DONE

- [x] **Theme key `defaultColorScheme: 'light' | 'dark'`** (top-level, not under `themeToggle`: it applies
      on pages with no toggle too). Anything else, including a cleared editor value `[]`, means unset.
      Precedence: saved toggle choice → theme default → OS.
- [x] `ThemeToggle.jsx`: `applySavedColorScheme(defaultColorScheme)` takes the default and now also
      *removes* `data-theme` when the answer is light (needed when the OS fallback at module load said dark).
      The toggle's mount effect no longer re-applies anything; it only reads `data-theme`, so the route
      wrapper below is the one source of the default.
- [x] `render/spa/utils/PatternColorScheme.jsx`: `getPatternColorScheme(themes, pattern)` (pattern's own
      `theme.defaultColorScheme` override, else the selected theme's; same selection paths as
      `getPatternTheme`) + a `PatternColorScheme` component that applies it in a layout effect (before paint,
      before the toggle's passive effect). Mounted next to `PatternTitle` in `pattern2routes`
      (`render/spa/utils/index.js`), so every pattern route applies its theme's default and switching
      patterns re-applies.
- [x] Theme editor: `themeToggleSettings` now registered in `ui/themeSettings.js` as `themeToggle`, with a
      "Color Scheme → Default mode" single-select (Light / Dark, deselect = follow OS) writing
      `defaultColorScheme`, plus the existing toggle class textareas.
- Module-load call in `dmsSiteFactory.jsx` unchanged (no theme known yet; prevents the light flash for
      saved/OS-dark viewers). A theme default then corrects it before the routed page paints.

**Design note — admin:** the admin pattern's route reads `themes.default`; its toggle renders under
`getAdminTheme`, but since the toggle no longer applies a default this can't disagree.

Code themes (`src/themes/*`) set it as `defaultColorScheme: 'light'` in the theme object. None set yet.

## Testing

- [x] `packages/dms/tests/themeDefaultColorScheme.test.js`: precedence, removal, invalid values, pattern
      selection paths, JSON-string pattern theme (9 tests pass); `adminThemeLogo` / `patternThemeCache` pass.
- [x] `npx vite build` passes.
- [ ] Live: theme with `defaultColorScheme: 'light'` on an OS-dark browser loads light; toggle still flips
      and persists; clearing localStorage returns to the theme default; pattern with no default follows OS.
