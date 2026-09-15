# Auth pattern: make the hardcoded page chrome themeable (BC)

**Status:** DONE 2026-09-12 · **Topic:** patterns/auth · **Started:** 2026-09-12
**Driver:** WCDB auth pages (`planning/wcdb/tasks/current/auth-pages-wcdb-theme.md` in dms-template) —
the manage pages' header row and a handful of notices cannot be styled by a site theme.

## Objective

Every visual class in the auth pattern's fixed components should come from a theme key, so a
site theme can restyle the pages without forking them. Today most of the login form already
does (`auth.authPages.sectionGroup.default.*`), but the **manage pages** (users / groups /
profile), the **login error strip**, the **signup notices**, the **user menu** and the
`/auth/*` placeholder carry literal Tailwind classes.

## Scope

- Additive, key-gated, **byte-identical by default**: each new key's default in
  `patterns/auth/defaultTheme.js` is the exact string the component hardcodes now.
- No markup changes, no new slots, no behaviour changes. Where two pages differ structurally
  (groups puts its Add button outside the header row; profile has no `gap-3`), they keep their
  own key rather than being unified — unifying is a visual change and out of scope.
- Out of scope: remember-me slot, button icon slot, redirecting the `/auth/*` placeholder.

## Current state → keys

`theme.auth` is `ui/defaultTheme.js` merging `patterns/auth/defaultTheme.js` (line 60); a site
theme's `auth` key deep-merges over it (`getPatternTheme` → `mergeTheme`).

### `auth.authPages.manage.*` — users / groups / profile (`AdminLayout` pages)

| Key | Default (= today's literal) | Used by |
|---|---|---|
| `pageWrapper` | `flex flex-col gap-3` | authUsers, authGroups outer div |
| `profileWrapper` | `flex flex-col` | profile outer div |
| `headerOuter` | `w-full flex` | authGroups — wraps header row + button |
| `headerRow` | `w-full flex justify-between border-b-2 border-blue-400` | all three |
| `headerTitle` | `text-2xl font-semibold text-gray-700` | all three |
| `headerAction` | `shrink-0` | the "Add new" `<Button className>` (NB: `className` REPLACES the Button style) |
| `tableHeaderCell` | `flex gap-3 items-center` | header `displayFn` wrapper (users, groups) |
| `modalBody` | `flex flex-row gap-3` | AddUserModal, reset-password modal, add-group modal |
| `notice` | `` (none today) | "To access this page, you need to login." |
| `profileLink` | `` (none today) | profile's Reset Password `<Link>` |

### `auth.authPages.sectionGroup.default.*` — additions

| Key | Default | Used by |
|---|---|---|
| `error` | `text-red-500 bg-red-50 rounded-md px-2 py-1` | authLogin error strip |
| `disabledNotice` | `text-sm text-gray-500` | authSignup "Sign up is not available…" |
| `status` | `text-sm text-red-600 mt-2` | authSignup status line |

### `auth.authPages.landing` — the `/auth/*` placeholder in `siteConfig.jsx`

Default `flex flex-col gap-3`.

### `auth.userMenu.*` — `components/menu.jsx`

| Key | Default |
|---|---|
| `avatar` | `h-[47px] w-[47px] border border-[#E0EBF0] rounded-full flex items-center justify-center` |
| `avatarIcon` | `size-6 fill-[#37576b]` |
| `loginLink` | `flex items-center px-8 text-lg font-bold h-12 text-slate-500` |
| `header` | `py-2` |
| `headerEmail` | `text-md font-thin tracking-tighter text-left` |
| `headerGroup` | `text-xs font-medium -mt-1 tracking-widest text-left` |
| `trigger` | `px-1` |

## Files

- `packages/dms/src/patterns/auth/defaultTheme.js` — the keys above, defaults = literals.
- `packages/dms/src/patterns/auth/pages/authUsers.jsx`, `authGroups.jsx`, `profile.jsx`,
  `authLogin.jsx`, `authSignup.jsx`; `components/menu.jsx`; `siteConfig.jsx` — read the key,
  fall back to the default string inline (`?? DEFAULT`) so a theme that ships an older
  `auth` object still renders unchanged.
- `skills/implementing-an-auth-login-page.md` — document the new surface.

## Testing checklist

- [x] `npx eslint` on the touched files — no new errors (the pre-existing prop-types / unescaped-entity noise is unchanged).
- [x] Vite serves every touched module (200) on the running dev server.
- [x] `/auth/login` renders identically before/after on wcdb (no `auth` overrides yet): the
      1440px CDP screenshots are byte-identical (`cmp`) to `login-before-2026-09-12.png`.
- [ ] A theme override of `auth.authPages.manage.headerRow` changes the users page header —
      verified by the WCDB task's Phase 2 (dms-template `planning/wcdb/…/auth-pages-wcdb-theme.md`).

## Implementation notes

- Each page resolves its keys as `{ ...LITERAL_DEFAULTS, ...(theme?.auth?.authPages?.manage || {}) }`
  (or `key ?? 'literal'` for single keys), so a site theme that ships an older `auth` object —
  or a consumer that never picks up the new `defaultTheme.js` — still renders unchanged.
- `authUsers.jsx`'s header `displayFn` is memoised; `m.tableHeaderCell` joined its dependency
  list so a theme swap re-renders the header cells.
- The `/auth/*` placeholder's dead `linkClass` const went with the change; nothing read it.

## Follow-up — 2026-09-13, found on the first live wcdb render

- **The manage pages ignored the pattern's theme.** `manageAuthConfig` hardcoded
  `getPatternTheme(themes, {...pattern, theme: {selectedTheme: 'mny_admin'}})`, so
  `/auth/manage/*` rendered MitigateNY's admin theme on every site. Now uses the pattern's
  own `selectedTheme`, with `mny_admin` as the fallback when the pattern sets none (that was
  the effective value before, so a site that never set one is unchanged).
- **Two more keys, both unset by default (BC):** `auth.authPages.manageLayoutStyle` /
  `manageLayoutGroupStyle` — the named Layout / LayoutGroup styles `AdminLayout` asks for
  (unset = the pattern's default options, which on wcdb was the public two-column cutaway);
  `auth.authPages.manage.menuItems` — replaces the manager's Sites / Themes / Auth rail
  items (they point at pages a client site does not have).
- **Second pass, same day:** `manage.rowAction` / `modalAction` / `headerInput` (the View As /
  reset-password buttons, dialog submit buttons and header search inputs — unset = the
  library Button / `theme.input` as before), and the Table's sticky header / footer bands:
  `components/table/components/Virtual.jsx` hardcoded `bg-white`; now `headerClassName` /
  `bottomClassName` props fed from the table theme's `stickyHeader` / `stickyBottom`
  (defaults documented in `table.theme.jsx`, equal to the old literals).
