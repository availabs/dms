# View As

## Objective

Let admins impersonate any project user client-side so they can see the site exactly as that user would — permission-gated UI, visible pages, nav — without making any real data changes.

## Scope

- Admin-only by default (user must be in the `${app} Admin` group); can also be granted to non-admins by adding `'view-as'` permission to their group in the auth groups editor
- Users selectable from the current project only (scoped by `PROJECT_NAME`)
- Works for both single-tenant and multi-tenant deployments (PROJECT_NAME is already set correctly per tenant)
- The effective user for **all client-side permission checks** (`isUserAuthed`, `adminGroup` checks) switches to the viewAs user's groups
- **No server-side impersonation**: the admin's real JWT token is still sent on every Falcor request; the server sees the admin, not the viewAs user. This means the admin may see server-side-gated content that the viewAs user would not — a documented limitation, acceptable for v1.
- All write/mutate operations (`dmsDataEditor`) are silently blocked during view-as mode; mock UI interactions (open edit pane, draft a new section) still work visually but nothing persists
- A fixed banner is always visible when in view-as mode

## Current Auth Flow

```
authProvider (providers.jsx)
  └─ AuthContext.Provider { user, setUser, AUTH_HOST, PROJECT_NAME, AuthAPI, ... }
       └─ RouterProvider
            └─ withAuth(DmsManager)
                 └─ DmsManager gets user = authContext.user
                      └─ pagesConfig CMSContext.Provider { user, isUserAuthed, ... }
```

`isUserAuthed` in CMSContext uses the `user` from the prop chain. All client-side gating (edit pencil, page visibility, publish button, permissions pane) flows through this user.

`dmsDataEditor` in `api/index.js` makes Falcor CALL mutations. It runs outside React component context (called from React Router `action` functions), so it cannot read from `AuthContext` directly.

## Design Decisions

| Decision | Choice | Why |
|---|---|---|
| Where to store viewAsUser | `AuthContext` (alongside `user`) | Centralised; all consumers already reach this context |
| How `user` prop changes | `withAuth` passes `viewAsUser ?? user` | Minimal blast radius; components don't change |
| Blocking mutations | `globalThis.__dmsViewAsActive` flag | Same pattern as sync API (`globalThis.__dmsSyncAPI`); survives module-boundary issues in Vite dev |
| Where to trigger view-as | Per-user "View As" button in `authUsers.jsx` | Natural admin flow; user is already on that page |
| Exit mechanism | Fixed `ViewAsBar` banner (always visible) | Can't be lost; clear affordance |
| Server-side | No change | V1 scope; full impersonation would require JWT forwarding in Falcor requests |
| Multi-tenant | No special handling | `PROJECT_NAME` is already the tenant app when on a subdomain |
| `public` group | Always injected when building viewAs user object | Raw `/users/byProject` rows omit the synthetic `public` group that `getUser()` appends; without it, users with only `public` access would have no permissions during view-as |
| `isUserAuthed` location | `utils/auth.js` (shared utility) | Previously in `patterns/page/auth.js`; cross-pattern imports are forbidden, so moved to the shared `utils/` layer and deleted the old re-export file |

## Files Changed

| File | Change |
|---|---|
| `packages/dms/src/utils/auth.js` (new) | Canonical home for `isUserAuthed` — moved here from `patterns/page/auth.js`; full-featured version with named params `{user, reqPermissions, authPermissions}` |
| `packages/dms/src/patterns/page/auth.js` | **Deleted** — was a re-export stub; all consumers updated to import from `utils/auth` |
| `packages/dms/src/patterns/auth/context.js` | Add `viewAsUser: null`, `setViewAsUser: () => {}` to default context shape |
| `packages/dms/src/patterns/auth/providers.jsx` | Add `viewAsUser` state; `setViewAsUser` wrapper via `React.useCallback` that sets `globalThis.__dmsViewAsActive` and calls `setViewAsUserState`; `withAuth` uses `viewAsUser ?? user`; render `ViewAsBar` |
| `packages/dms/src/patterns/auth/components/ViewAsBar.jsx` (new) | Fixed amber banner: email, group pills, "Exit View As" button; reads from `AuthContext` |
| `packages/dms/src/patterns/auth/components/ViewAsBar.theme.js` (new) | Theme keys for the banner |
| `packages/dms/src/patterns/auth/defaultTheme.js` | Add `viewAsBar` key from `ViewAsBar.theme.js` |
| `packages/dms/src/api/index.js` | Guard top of `dmsDataEditor` with `globalThis.__dmsViewAsActive` check |
| `packages/dms/src/patterns/auth/siteConfig.jsx` | `manageAuthConfig` destructures `authPermissions` + `app`; threads both into `<AuthUsers>` |
| `packages/dms/src/patterns/auth/pages/authUsers.jsx` | Accepts `app` + `authPermissions` props; imports `isUserAuthed` from `../../../utils/auth`; `canViewAs = g === \`${app} Admin\` \|\| isUserAuthed(['view-as'])`; "View As" button column; `public` group injected into viewAs user object |
| `packages/dms/src/patterns/page/components/userMenu.jsx` | Imports `isUserAuthed` from `../../../utils/auth`; `canViewAs` check uses `g === \`${app} Admin\` \|\| isUserAuthed(['view-as'], authPermissions)`; "View As User…" / "Exit View As" menu items |

---

## Phases

### Phase 1 — Auth context + withAuth — DONE

- [x] `context.js`: added `viewAsUser: null` and `setViewAsUser: () => {}` to the `AuthContext` createContext default value
- [x] `providers.jsx`:
  - Added `const [viewAsUser, setViewAsUserState] = React.useState(null);`
  - Added `setViewAsUser` wrapper via `React.useCallback` that sets `globalThis.__dmsViewAsActive` and calls `setViewAsUserState`
  - Added `viewAsUser` and `setViewAsUser` to `AuthContext.Provider` value
  - Modified `withAuth` to pass `viewAsUser ?? user` as `effectiveUser` prop

### Phase 2 — ViewAsBar component — DONE

- [x] Created `ViewAsBar.jsx` — fixed amber banner reading from `AuthContext`; shows email, non-public groups as pills, "Exit View As" button; returns null when no `viewAsUser`
- [x] Created `ViewAsBar.theme.js` — keys: `bar`, `label`, `email`, `groupPills`, `groupPill`, `spacer`, `exitButton`; default amber-100/300/900 colors
- [x] Added `viewAsBar` key to `defaultTheme.js` (imports from `ViewAsBar.theme.js`)
- [x] `ViewAsBar` rendered at end of `AuthProvider` return (inside `AuthContext.Provider`, so it has access to context)

### Phase 3 — Mutation blocking — DONE

- [x] Added guard at top of `dmsDataEditor` in `api/index.js`:
  - Checks `globalThis.__dmsViewAsActive`
  - Logs `console.warn` and dispatches `dms-view-as-blocked` CustomEvent (for future toast wiring)
  - Returns `{ data: [] }` early without any Falcor calls

### Phase 4 — User picker in authUsers page — DONE

- [x] `manageAuthConfig` in `siteConfig.jsx` destructures `authPermissions` and `app`; passes both as props to `<AuthUsers>`
- [x] `UsersAdmin` accepts `app` and `authPermissions` props
- [x] Imported `isUserAuthed` from `../../../utils/auth`
- [x] Computed `canViewAs = (user.groups.some(g => g === \`${app} Admin\`)) || isUserAuthed({ user, authPermissions, reqPermissions: ['view-as'] })`
- [x] Added `view_as` column with `show: canViewAs`; clicking toggles view-as on/off; active user shows "Viewing As"
- [x] ViewAs user object includes synthetic `public` group: `groups: [...new Set([...(row.groups || []), 'public'])]`; also sets `authed: true, isAuthenticating: false`

### Phase 5 — User menu integration — DONE

- [x] Destructured `viewAsUser, setViewAsUser` from `AuthContext` and `authPermissions` from `CMSContext` in `userMenu.jsx`
- [x] Imported `isUserAuthed` from `../../../utils/auth`
- [x] `isAdmin = (user.groups.some(g => g === \`${app} Admin\`)) || isUserAuthed({ user, authPermissions, reqPermissions: ['view-as'] })`
- [x] Added `viewAsMenuItems` to `NavigableMenu` config (before the logout separator):
  - When in view-as mode: separator + inline "Viewing as [email]" label + "Exit View As" `onClick` item
  - When `isAdmin` (not in view-as): separator + "View As User…" link to `/auth/manage/users`
  - Note: `NavigableMenu` items with `onClick` (no `type` field) render as clickable divs — verified by reading the MenuItem source

### Phase 6 — Shared utility consolidation — DONE

- [x] Created `packages/dms/src/utils/auth.js` as the canonical home for `isUserAuthed`
  - Full-featured version: `{ user, reqPermissions, authPermissions }` named params
  - Handles public-only auth setups gracefully (returns `true` when no non-public groups configured)
- [x] Deleted `packages/dms/src/patterns/page/auth.js` (was a re-export stub for `isUserAuthed`)
- [x] Updated all consumers that previously imported from `patterns/page/auth.js`:
  - `userMenu.jsx` → `../../../utils/auth`
  - `authUsers.jsx` → `../../../utils/auth`
  - Any other page-pattern consumers updated to use the utils path

---

## Testing Checklist

- [ ] Admin can see "View As" button on users page (other non-admin users cannot)
- [ ] Clicking "View As" for user with no edit permissions → edit pencil disappears
- [ ] Clicking "View As" for user with edit permissions → edit pencil still shows
- [ ] ViewAsBar appears with correct email and groups
- [ ] Clicking "Exit View As" in banner restores admin's own view
- [ ] Attempting to save a section while in view-as mode → no data change (check via network inspector)
- [ ] In multi-tenant mode: users shown are from the current tenant project only
- [ ] In single-tenant mode: works identically
- [ ] "View As" button disabled/highlighted for the currently viewed-as user
- [ ] Page refresh clears view-as mode (state is not persisted — expected; document if needed)

---

## Known Limitations

- **Server-side content gating** is not impersonated: the admin's token is sent; server auth sees the admin user. The admin may see content the viewAs user would be blocked from.
- **Page refresh exits view-as**: `viewAsUser` lives in React state; not persisted to localStorage. This is intentional for v1 — keeps admin from accidentally staying in view-as mode.
- **No toast notification** when mutations are blocked (just a silent no-op + console.warn). A toast system could be wired later via the `dms-view-as-blocked` custom event.
