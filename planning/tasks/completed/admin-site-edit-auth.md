# Admin site-edit auth + separate create route

## Objective

Split `editSite.jsx` so that:
- **Create site** (`${adminPath}/create`) — public, no login required, accessible on a fresh deployment before any auth pattern exists
- **Edit site** (`${adminPath}`) — protected, requires the user to be in the `${app} Admin` group or have access granted via the auth pattern's permissions

## Root cause / motivation

`editSite.jsx` rendered the create form inline when no site existed and had no auth protection on the edit page. The standard DMS `reqPermissions` mechanism can't be used here because on a fresh deployment there's no auth pattern → no login page → `defaultCheckAuth`'s redirect to `/auth/login` would 404. Auth must be enforced in-component, redirecting to `/create` (not `/login`) when there's no site.

After site creation the auth pattern exists, so `/auth/login` is available for subsequent visits.

## Files changed

- `src/dms/packages/dms/src/patterns/admin/siteConfig.jsx`
- `src/dms/packages/dms/src/patterns/admin/pages/editSite.jsx`
- `src/dms/packages/dms/src/patterns/admin/pages/createSite.jsx`
- `src/dms/packages/dms/src/patterns/admin/utils.js` (new)
- `src/dms/packages/dms/src/dms-manager/wrapper.jsx`
- `src/dms/packages/dms/src/render/spa/dmsSiteFactory.jsx`
- `src/dms/packages/dms/src/render/spa/utils/index.js`

## Implementation checklist

- [x] **siteConfig.jsx** — import `NewSite`; add `path: "create"` child route (no auth) inside `adminConfig`; accept `authPermissions` param and pass it into `AdminContext`
- [x] **editSite.jsx** — remove `NewSite` import + inline `<NewSite>` fallback; add `useNavigate` + `useNavigation` auth guard; use `hasAccess = isAdmin || isUserAuthed(user, authPermissions)` for redirect decisions
- [x] **createSite.jsx** — get `app` + `baseUrl` from `AdminContext`; add `setUser` from `AuthContext`; auto-login after creation then navigate to `baseUrl`; fixed auth pattern `authPermissions` initial format to `{ groups: { "${app} Admin": ['*'] }, users: {} }`
- [x] **admin/utils.js** — new file; `isUserAuthed(user, authPermissions)` checks `groups` + `users` against `*` or `view-page`; follows pattern of `patterns/auth/utils.js`
- [x] **wrapper.jsx** — extract `useLoaderData()` into `loaderResult`; all hooks always run; `if (!loaderResult) return null` placed after all hooks (before final return) to prevent rendering when loader hasn't completed
- [x] **dmsSiteFactory.jsx** — initialize `loading` to `true` when no localStorage cache (`!localStorePatterns?.length && !defaultData?.length`); `if (loading && !dynamicRoutes.length)` shows Loading… instead of falling through to 404 on first visit
- [x] **utils/index.js** — find auth pattern row from siteData (`pattern_type === 'auth'`), use its `authPermissions` for `AdminPattern.authPermissions` instead of hardcoded `"{}"`

## Auth guard logic (editSite.jsx)

```
dataItems === undefined / loaderResult null  → return null (loading)
isLoading (navState === 'loading')           → return null (router transition)
!item.id                                     → navigate(${baseUrl}/create)
!user.authed                                 → navigate(${authPath}/login, { state: { from: baseUrl } })
!hasAccess                                   → navigate('/')
otherwise                                    → render PatternList
```

`hasAccess = isAdmin || isUserAuthed(user, authPermissions)`

`isAdmin` = user is in `${app} Admin` group (bootstrap, always grants access).
`isUserAuthed` checks the auth pattern's `authPermissions` (groups/users) — managed via `/list/manage_pattern/:auth_id/permissions`.

## Auth permissions flow

```
DB auth pattern row (authPermissions field)
  → pattern2routes: AdminPattern.authPermissions = authPattern?.authPermissions || "{}"
  → resolveSubdomainAuthPermissions(authPermissions, subdomain)
  → adminConfig({ authPermissions }) param
  → AdminContext.authPermissions
  → editSite.jsx: isUserAuthed(user, authPermissions)
```

Admin users configure who else can access the list page at `/list/manage_pattern/:auth_id/permissions` — the existing permissions editor, no new UI needed.

## Auto-login logic (createSite.jsx)

After `initSetup` + site + auth pattern creation succeed:
1. `AuthAPI.callAuthServer('/login', { email, password, project: PROJECT_NAME })`
2. Store token in `localStorage`
3. Call `setUser(...)` with authed state
4. `navigate(baseUrl)`

## Hooks ordering fix (wrapper.jsx)

React counts `useMemo` inside a `return` statement as a hook call. The early-return check must come after all hooks. Fix: pull the return `React.useMemo(...)` into a variable `rendered`, then:
```js
const rendered = React.useMemo(() => <EditComponent .../>, [data, item])
if (!loaderResult) return null;
return rendered;
```

## Verification

1. Fresh deployment (no site, no localStorage): `${adminPath}` → shows Loading… then redirects to `${adminPath}/create` (no login prompt)
2. Create site: fill form → submit → auto-login → land on PatternList
3. Unauthenticated with site: `${adminPath}` → `/auth/login`
4. Authenticated non-admin without configured access: `${adminPath}` → `/`
5. Authenticated admin: `${adminPath}` → PatternList
6. User granted access via auth pattern permissions editor → `${adminPath}` → PatternList
7. Create page still accessible when site exists: `${adminPath}/create` → renders form
