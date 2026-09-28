# Per-project admin logo via a theme's `admin` key (selected by the auth pattern)

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** built (was: "IMPLEMENTED + verified live 2026-09-22 (SPA). Uncommitted. Open: SSR check, and the theme-editor che…") · **Release:** review — live logo sizing pass with the owner + SSR check, then commit · **Created by:** ssangdod@albany.edu · **Edited by:** —

**Status: IMPLEMENTED + verified live 2026-09-22 (SPA). Uncommitted. Open: SSR check, and the theme-editor check for a pattern-level `theme.admin`.** Split out of
[`admin-pattern-v6-port.md`](./admin-pattern-v6-port.md)'s "Not started / next steps" item 1 (MNY
admin reskin).

> **Revision history (2026-09-22).**
> 1. The first draft put an `admin_theme` field on the site row with a picker. The user replaced
>    that: the **auth pattern's existing theme selection is the source**. Login pages use that
>    theme's `auth` key; admin and auth-manage pages use its `admin` key, as targeted overrides on
>    the default theme. Every theme gets an `admin` key with its logo.
> 2. The second draft also gave MNY scoped color tokens and fonts (CSS variables under a
>    `data-admin-theme` attribute, and a `.t-*` font-variable refactor). The user cut this: **colors
>    and fonts stay default (tessera_v6); only each theme's logo is used.** All the
>    token/font/scope machinery is dropped. If it's wanted later, the design is recoverable from
>    this file's git history.
> 3. There is only ever one auth pattern per site, so there is no multi-auth-pattern divergence to
>    handle.
> 4. Decisions: a theme that doesn't define its own logo gets no `admin.logo` and stays blank (avail,
>    catalyst). With no admin logo, the Pattern Editor is blank too, matching Sites; its current
>    tessera mark goes away.

## Objective

Admin surfaces keep the shared tessera_v6 look (the `default` theme) exactly as it is. The only
per-project difference is **the logo** in the sidenav header. It comes from the `admin` key of the
theme the site's auth pattern already uses. Nothing else in that theme is applied to admin.

Surfaces in scope, all built by one new resolver:

- **Admin pattern:** Sites, Create, Themes, ThemeEdit (`patterns/admin/siteConfig.jsx`
  `adminConfig`), plus the Pattern Editor (`patternConfig`, `/list/manage_pattern/...`).
- **Auth manage pages:** Users, Groups, Profile (`patterns/auth/siteConfig.jsx` `manageAuthConfig`
  / `AdminLayout`).

**Out of scope, and must not change:** the auth login/signup/forgot/reset pages. They keep
`getPatternTheme(themes, pattern)` as now (the full theme plus its `auth` key). Colors, fonts,
layout and spacing of admin pages are also out of scope.

## The model

- **Login pages:** `default` ← the auth pattern's theme (whole) ← pattern-level overrides. This is
  unchanged.
- **Admin + manage pages:** `default` ← **only the `admin` key** of the auth pattern's theme ← the
  auth pattern's own `theme.admin` overrides (if an author set any).

The `admin` key's `logo` sub-key replaces today's blanked logo. The key's other sub-keys are the
existing per-page override objects the admin components already read (`patternEditor`, `editSite`,
...). This task doesn't use them, but the resolver passes them through for free.

## Hard constraint: nothing else changes

1. **Adding an `admin` key to a theme is a no-op for every non-admin page and login page using it.**
   `theme.admin.*` is read only under `patterns/admin/**`, plus one `theme?.admin?.navOptions`
   fallback in `patterns/auth/siteConfig.jsx:298` (the manage pages, which are in scope). No theme
   will set `admin.navOptions` in this task.
2. **An auth pattern with no theme, or a theme with no `admin.logo`, renders exactly as today:** no
   logo, "Admin" title.
3. **No CSS, token, font or layout change anywhere.**

## Current State

- **Admin pattern.** `render/spa/utils/index.js:245` synthesizes `AdminPattern` in memory, with no
  DB row. It already looks up `authPattern` (`:238`) for `authPermissions` and the auth base URL,
  so reusing it here follows the existing precedent.
- **Admin theme and logo.** `patterns/admin/siteConfig.jsx:104` builds the admin theme with
  `getPatternTheme(themes, {...patternData, theme:{selectedTheme:'default'}})`. Its logo branch
  (`:121`) reads `patternData?.theme?.selectedTheme`. That is always undefined, because
  `AdminPattern.theme` is a whole theme object. So admin always renders
  `{img:'', logoAltImg:'', title:'Admin'}`, and the project-logo code is dead.
- **Pattern Editor.** `patternConfig` (`siteConfig.jsx:243`) uses
  `mergeTheme(defaultTheme, {layout overrides})`, with no project input. Its sidenav
  `topMenu: [{type:'Logo'}]` shows the default tessera mark, which is **inconsistent** with Sites
  (blank).
- **Manage pages.** `manageAuthConfig` (`patterns/auth/siteConfig.jsx:~265`) has the auth pattern
  (`pattern`), but forces `{...pattern, theme:{selectedTheme:'default'}}` and blanks the logo "for
  continuity with admin". The comments there are stale (they mention an old `mny_admin` fallback).
- **Theme loading.** `collectThemeNames` (`render/spa/utils/index.js:110-123`) already collects the
  auth pattern's `selectedTheme`, so the auth theme is **already loaded** for admin. It also still
  hardcodes `if (p?.pattern_type === 'auth') names.add('mny_admin')`, a leftover from the old
  manage-page hardcode.
- **The default theme's `admin` key.** `ui/defaultTheme.js:243` holds the per-page admin override
  objects. Components do `{ ...xTheme, ...(theme?.admin?.x || {}) }` for `adminUi`, `chrome`,
  `createSite`, `editSite`, `editTheme`, `errorPage`, `filterEditor`, `menu`, `navOptions`, `page`,
  `patternEditor`, `patternList`, `patternPicker`, `permissionsEditor`, `sectionGroup`,
  `settingsEditor`, `themeEditor` and `themeList`. Nothing reads `theme.admin.logo` yet.
- **Existing `admin` keys in themes.** `tessera-theme.js:1423` and `tessera-theme-v6.js:1948`
  already have `admin: adminTheme`. All its keys are **flat** (`kpiStrip`, `typeBadge*`,
  `permBadge*`, `themeCard*`, `pageHeader`, `pageTitle`, `toolbar`, `permMatrix*`, ...), and no
  component reads them, so merging them is inert. `mny_admin` (`mny/admin.theme.js`) spreads
  `...mny`, so it **inherits mnyv1's `admin` key**.
- **Admin sidenav header chrome.** The default `logoTheme` has
  `logoWrapper: 'flex w-full items-center gap-2.5 h-14 px-4 border-b border-[var(--t-rule)]
  bg-[var(--t-paper)]'`, which is light in light mode and dark in dark mode. The default tessera
  mark is a CSS **mask** over `bg-[var(--t-cobalt)]` (`logoAltImg`), so it recolors per mode.
- **Each theme's own logo today.** Several are white-on-dark assets and can't be copied as-is:

| theme | current `logo` | as-is on admin chrome? |
|---|---|---|
| `mnyv1` (`mny/theme.js:694`) | `img: /themes/mny/mnyLogo.svg` (single fill `#37576b`, **no viewBox**), `imgClass: min-h-12` | light mode only |
| `mny_admin` | inherits mnyv1's `admin` key via `...mny` | same as mnyv1 |
| `wcdb` (`wcdb_theme.js:386`) | `img: /themes/wcdb/logo_white.svg`, `imgClass: h-9 wcdb-logo-img` | no (white) |
| `transportny` (`:484`) | `img: /themes/transportny/nys_logo_white.svg`, `logoAltImg: hidden` | no (white) |
| `transportnyv2` | flat logo keys (see header comment ~line 22) | audit |
| `landbank` (`:678`) | `const logo`: the ACLB mark in a white chip, "never recolored" | probably yes (chip); audit |
| `avail` (`:390`) | `logo` block, `logoWrapper: 'h-8 ...'` | audit: the mark isn't obvious from code |
| `catalyst` | sidenav-embedded `logo` objects (`:132`, `:195`) | audit: the mark isn't obvious from code |
| `tessera`, `tessera_v6` | the library default (tessera mask) | yes |

## Design

### Resolver: `getAdminTheme(themes, authPattern, ssrCollect)` (new, `ui/useTheme.js`)

```js
export const getAdminTheme = (themes, authPattern, ssrCollect) => {
  const theme = getPatternTheme(themes, { theme: { selectedTheme: 'default' } }, ssrCollect);
  const name = authPattern?.theme?.selectedTheme
            || authPattern?.theme?.settings?.theme?.theme;          // same precedence as getPatternTheme
  const brand = mergeTheme(
    (name && themes?.[name]?.admin) || {},
    authPattern?.theme?.admin || {},                                 // pattern-level author overrides
  );
  const { logo, ...adminOverrides } = brand;
  if (Object.keys(adminOverrides).length) theme.admin = mergeTheme(theme.admin, adminOverrides);
  theme.logo = logo
    ? mergeTheme(theme.logo, logo)
    : { ...theme.logo, img: '', logoAltImg: '', title: 'Admin' };   // today's behavior
  return theme;
};
```

- **The logo is merged over the default `logoTheme`.** A theme's `admin.logo` therefore only needs
  to set what differs (usually `img` or `logoAltImg`, `imgClass`, `title`). `logoWrapper` is
  inherited, so the h-14 header band stays identical across projects.
- **`adminOverrides` pass-through.** This task doesn't use it, but it keeps the `admin` key a
  general "targeted admin override" slot, consistent with how `auth` works for login pages.
  - **Tessera's dead flat keys:** they get merged here too, which is inert (Current State).
  - **Merge rule:** use `mergeTheme`, not a spread, so a theme can't wipe a whole default sub-object
    by accident.
- **Pattern-level `theme.admin`** lets an author adjust the admin logo from the pattern theme
  editor, which is the author-empowerment principle. **Verify** that `themeEditor.jsx` can reach and
  persist a top-level `admin` key on the auth pattern. If it can't, the resolver is still correct
  and only code themes supply the logo for now; note it here.

### Wiring

- **`render/spa/utils/index.js`:**
  - Add `authPattern` to `AdminPattern` (the object already found at `:238`) and pass it into the
    admin configs (`adminConfig`, `patternConfig`) as a config param.
  - Drop the misleading `AdminPattern.theme: themes['default']` if a grep confirms nothing reads it.
  - `collectThemeNames`: remove the stale `names.add('mny_admin')` and fix the doc comment.
    - **Pre-check:** run a `dms raw list` check on mitigat-ny-prod and dms_avail. Any pattern that
      wants `mny_admin` must name it in `selectedTheme` or the old settings path so it's still
      collected. Record the result here.
    - **Optional:** this is independent of the logo work. If the check is inconclusive, leave it.
- **`patterns/admin/siteConfig.jsx`:**
  - `adminConfig`: replace `getPatternTheme(...)` and the dead logo block (`~104-123`) with
    `let theme = getAdminTheme(themes, authPattern, ssrCollect)`. Keep the `bottomMenu` override
    after it.
  - `patternConfig`: the base becomes `getAdminTheme(themes, authPattern, ssrCollect)` instead of
    raw `defaultTheme`, then its existing `layout.options` override is applied with `mergeTheme`
    exactly as now. The Pattern Editor then shows the same logo as Sites, which fixes today's
    tessera-mark-vs-blank inconsistency. Thread `authPattern` and `ssrCollect` in, since neither is
    received today.
- **`patterns/auth/siteConfig.jsx`:**
  - `manageAuthConfig`: `let theme = getAdminTheme(themes, pattern, ssrCollect)`. Delete the forced
    `'default'` `managePattern`, the logo blanking and the stale comments. Keep the `bottomMenu` and
    `navOptions` lines.
  - `authConfig` (login pages): **untouched.**
- **SSR** (`render/ssr2/handler.jsx`): verify the admin routes get `authPattern` through the same
  `pattern2routes` path, so the logo is in the server-rendered HTML with no flash.

## Per-theme `admin.logo` (dms-template)

Add a small `admin: { logo: {...} }` to each theme. Keep it inline in the theme file; it's a few
lines. MNY can instead follow `auth: mny_auth` with its own file if that's preferred. Don't name
that file `admin.theme.js`, which is already the separate `mny_admin` theme.

### Logo rules

- **Single-color marks:** use a **mask**, the same technique as the default tessera mark:
  `logoAltImg: "inline-flex h-<n> w-<n> bg-[var(--t-ink)] [mask:url('<svg>')_left_center/contain_no-repeat] [-webkit-mask:url('<svg>')_left_center/contain_no-repeat]"`
  with `img: ''`. The mask ignores the SVG's own fill, so white-on-dark assets work and recolor
  with light/dark mode. Use `--t-ink` for a neutral wordmark, or `--t-cobalt` to match tessera's
  own mark.
- **Multi-color or "never recolor" marks** (landbank): use `img` plus `imgClass` in a chip that
  reads on both a light and a dark header.
- **`title: ''`** unless the project wants a text name next to the mark.
- **Never edit an asset the public site uses.** If a mask needs a `viewBox` fix, add a new
  `public/themes/<theme>/<name>_mask.svg`.

| theme | planned `admin.logo` |
|---|---|
| `mnyv1` (→ `mny_admin` inherits) | mask of the MNY mark in `--t-ink`, e.g. `h-8 w-[122px]`. `mnyLogo.svg` has **no viewBox** (paths at x≈234 outside its 190×50 box), so expect to add `public/themes/mny/mnyLogo_mask.svg` with a proper `viewBox` |
| `wcdb` | mask of `logo_white.svg` |
| `transportny`, `transportnyv2` | mask of `nys_logo_white.svg` (audit v2's own asset) |
| `landbank` | `img` = the ACLB mark in its white chip (from `const logo` at `:678`) |
| `avail`, `catalyst` | **none** — user decision 2026-09-22: themes that don't define their own logo get no `admin.logo` and stay blank ("Admin" title) |
| `tessera`, `tessera_v6` | `logo: {}`. Any truthy `logo` stops the blanking, so the default tessera mask shows. The existing flat `admin` keys stay (inert); removing dead keys is out of scope |

DB `:theme` rows get no `admin` key from this task. They render as today (no logo, "Admin"), and an
author can add one later through the theme editor.

## Files Requiring Changes

**Library (`src/dms/packages/dms/src/`):**

- `ui/useTheme.js`: `getAdminTheme`, exported.
- `render/spa/utils/index.js`: `AdminPattern.authPattern` + the config param, and the optional
  `collectThemeNames` `mny_admin` cleanup.
- `patterns/admin/siteConfig.jsx`: `adminConfig` and `patternConfig` switch to `getAdminTheme`.
- `patterns/auth/siteConfig.jsx`: `manageAuthConfig` switches to `getAdminTheme`; `authConfig` is
  untouched.
- `render/ssr2/handler.jsx`: verify only.
- Tests for `getAdminTheme`:
  - no auth pattern / no selected theme: blanked logo, "Admin"
  - a theme without `admin`: blanked logo
  - a theme with `admin.logo`: merged over the default
  - pattern-level `theme.admin.logo`: beats the theme's own
  - `admin.logo: {}`: default tessera mark
  - other `admin` sub-keys merge without clobbering the defaults
- `ui/THEMING_GUIDE.md`: a short "Admin logo" section covering the `admin.logo` contract, the
  selection rule (the auth pattern's theme), and the mask-vs-img rules.

**dms-template (`src/themes/`):** `admin.logo` in `mny/theme.js`, `wcdb/wcdb_theme.js`,
`transportny/theme.js`, `transportny/themev2.js`, `landbank/theme.js`, `tessera/tessera-theme.js` and `tessera/tessera-theme-v6.js`, plus
`*_mask.svg` files where needed.

**Data:** none. **Confirm** with `dms raw get` that MitigateNY's auth pattern selects `mnyv1` or
`mny_admin`; either works.

## Phases

### Phase 1: Resolver + wiring (library) — DONE
- [x] `getAdminTheme` (`ui/useTheme.js`) + `tests/adminThemeLogo.test.js` (8 tests, passing).
- [x] **Design note:** `authPattern` is passed as a config param to *every* pattern config call in
      `pattern2routes` (it was already in scope there), not stored on `AdminPattern`; only
      `adminConfig`/`patternConfig` read it. `patternConfig` now also destructures `ssrCollect`.
- [x] `adminConfig`, `patternConfig`, `manageAuthConfig` switched over; stale comments and the dead
      logo block removed; the unused `defaultTheme` import dropped from admin `siteConfig.jsx`.
- [ ] Check whether the pattern theme editor can persist `theme.admin`; note the result. (Not done;
      the resolver supports it and it's unit-tested.)
- [ ] SSR check. (Not done: verified in SPA dev only. The SSR path goes through the same
      `pattern2routes` config call, so `authPattern` reaches it, but it hasn't been exercised.)
- [ ] ~~`collectThemeNames` `mny_admin` removal~~ **REVERTED 2026-09-22.** The user found that removing
      it hides the Pattern Editor's sidenav tabs for mitigat-ny-prod pattern 566466 ("admin", which
      selects `mny_admin`) at `/list/manage_pattern/566466`; restoring the line fixes it. The
      mechanism is NOT understood: 566466 names `mny_admin` itself, so the collected set should
      be unchanged, and the same toggle on shaun-test-app (a pattern selecting `mny_admin`)
      showed all tabs either way. Leave the line in until someone traces it. **Update:** the user reports a plain refresh brings the tabs back, which points at the
      site-snapshot fast path in `dmsSiteFactory.jsx`: routes are first built from the localStorage copy,
      and that copy may carry no `theme` / stub patterns, so the always-load line was the only thing
      loading `mny_admin` for that first build. Still unverified. Original CLI check on mitigat-ny-prod (2026-09-22): the auth
      pattern (1427078) selects `mnyv1`; the only `mny_admin` users (1499610 datasets, 2177054
      status via `selectedTheme`, 1626133 putnamcsc_admin via the legacy settings path) all name it
      explicitly, so they're still collected. dms_avail not checked (no CLI config at hand), but
      the implicit load had no consumer left once manageAuthConfig stopped hardcoding it.

### Phase 2: Per-theme `admin.logo` (dms-template) — DONE (live sizing pass pending with user)
- [x] Audit each theme's brand mark (the table above). avail and catalyst are excluded (they stay
      blank, per the user).
- [x] `admin.logo` added to mnyv1, wcdb, transportny, transportnyv2, landbank, tessera, tessera_v6.
      Masks: mny (`bg-[#37576B] dark:bg-[#C5D7E0]`, its brand slate), wcdb + transportny
      (`bg-[var(--t-ink)]`), landbank = png in a white chip, tessera = default mark + title
      'Tessera' (`admin: { ...adminTheme, logo: {title:'Tessera'} }`). New mask copies with a tight
      `viewBox` (bbox measured in Chromium): `public/themes/mny/mnyLogo_mask.svg` (0 0 188 48),
      `wcdb/logo_mask.svg` (8 46 543 228), `transportny/nys_logo_mask.svg` (68 68 660 399).
      Originals untouched.
- [ ] Live pass with the user on sizing (expect pixel feedback).
- [x] **Found during verification:** `mny_admin` did NOT inherit mnyv1's `admin` key. It defines its
      own `admin` (navOptions + page, values identical to the library defaults), which replaces
      mnyv1's in the shallow spread. Fixed with `"logo": mny.admin.logo` inside it
      (`mny/admin.theme.js`). Its navOptions/page now merge into the admin theme, but they equal
      the defaults, so nothing changes.

### Phase 3: Docs — DONE
- [x] `ui/THEMING_GUIDE.md` "Admin logo (`admin.logo`)" section. (`admin-pattern-v6-port.md`
      item 1 already points here.)

## Testing Checklist

Local recipe: `shaun-test-app` on the local dms-server, with a temporary admin pattern created,
linked, then unlinked and deleted, as in `admin-pattern-v6-port.md`. Temporarily point the test
site's auth pattern `selectedTheme` at each theme under test, and restore it afterward (clear with
an explicit `null`; see the nested-merge memory).

- [ ] **BC:** an auth pattern with no theme, or with a theme lacking `admin.logo`, gives Sites,
      Themes, ThemeEdit, all Pattern Editor tabs, Users, Groups and Profile pixel-identical to
      before. The one intended exception: the Pattern Editor's tessera mark becomes blank, matching
      Sites (**confirmed by the user 2026-09-22**).
- [ ] **Per theme** (mnyv1, mny_admin, wcdb, transportny, transportnyv2, landbank, tessera_v6;
      avail and catalyst stay blank): the logo shows on Sites, the Pattern Editor and Users, and is legible in **light
      and dark**.
- [ ] Nothing but the logo differs: the header band height, borders, colors and fonts are identical
      to the default.
- [ ] SSR hard refresh on `/list` and `/auth/manage/users`: the logo is in the server HTML, with no
      flash.
- [ ] A pattern-level `theme.admin.logo` on the auth pattern overrides the theme's own logo (if the
      editor supports it).
- [ ] **Non-admin regression:**
  - [ ] a public page per theme that gained `admin.logo` is unchanged (spot-check one each)
  - [ ] MNY login/signup/forgot/reset are unchanged
  - [ ] after the optional `collectThemeNames` change, any pattern that explicitly uses `mny_admin`
        still loads it

## Verification results (2026-09-22)

- **Unit tests:** `tests/adminThemeLogo.test.js`, 8/8 pass. The full client suite has 3 failures,
  in `avlGraphThemeDefaults` and `syncDeltaConvergence`. They are **pre-existing**: they fail
  identically with this change stashed.
- **Lint:** no new errors in any touched file (error counts identical to HEAD).
- **Live check** (`shaun-test-app`, local dms-server :3001, vite :5175, Playwright at 1440px):
  - **Setup:** auth pattern id 3's `selectedTheme` was switched per theme, then **restored to
    `"default"`** (confirmed with `dms raw get 3`).
  - **Pages:** `/list`, `/list/manage_pattern/1/overview`, `/auth/manage/users`, each in light and
    dark mode.
  - **Results by theme:**
    - `default`: blank + "Admin" on all three. The Pattern Editor's old tessera mark is gone, as
      agreed.
    - `mnyv1` / `mny_admin`: MNY wordmark mask, 110×28, slate `#37576B` in light and `#C5D7E0` in
      dark.
    - `wcdb`: mask, 76×32, `--t-ink`.
    - `transportny` / `transportnyv2`: NYS mask, 46×28, plus the "TransportNY" title.
    - `landbank`: ACLB png in a white chip.
    - `tessera` / `tessera_v6`: default mark + "Tessera".
  - **All themes:** no page errors, no horizontal overflow. Screenshots were checked by eye.
- **Not verified:** SSR first paint; the login pages and public pages (their code paths are
  untouched and they don't read `theme.admin`).
