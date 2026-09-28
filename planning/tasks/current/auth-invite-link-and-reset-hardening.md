# Auth: invite-link add-user flow + password-reset hardening

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [tes_self_service_signup](../../../../../planning/initiatives/tes_self_service_signup.md) · **Status:** blocked:decision (was: "NOT STARTED — design under review (user thinking it over, 2026-09-24)") · **Created by:** ssangdod@albany.edu · **Edited by:** —

## Status: NOT STARTED — design under review (user thinking it over, 2026-09-24)

Nothing is implemented. The "Open Questions" section lists the decisions still to make before Phase 1.

## Objective

1. **Close two account-takeover holes in dms-server auth** (Phase 1, urgent whatever happens to the rest).
2. **Replace "admin adds user → user gets a plaintext password by email" with an invite link.** The link
   carries a token valid for 6 hours and opens a page where the invitee picks their own password.
3. **Move password reset onto the same link-based "set your password" page**, so no flow emails a password.

## Scope

- **In:** `dms-server/src/auth/handlers/auth.js` (the `/signup/assign/group`, `/password/reset`, `/invite`,
  `/invite/accept` handlers, plus a new `/invite/verify`), `auth.routes.js`, auth pattern client pages
  (`authUsers.jsx`, `authForgotPassword.jsx`, a new set-password page, `siteConfig.jsx`), and
  `dms-server/tests/test-auth.js`.
- **Out:**
  - Self-signup UX for users who already have an account. `/signup/assign/group` raises a raw `duplicate key`
    error for them; that's tracked in `tenant-signup-production-readiness.md` (Stage 5). Phase 1 here only
    changes *who may call* that endpoint and *which groups* they may join.
  - Email verification for self-signup (`signupRequest` / `verifyEmail`). It uses the same token-link
    pattern, so it can reuse the Phase 3 page later.
  - JWT hardening beyond what's listed under "Related findings".

## Current State (read from code 2026-09-24)

### Admin "Add user" today

`authUsers.jsx:118` `handleAddUser(email)` → `POST /signup/assign/group` with
`{ token, email, url: origin+baseUrl+'/login', project }`. **The admin's `token` is sent but ignored.**

`signupAssignGroup` (`auth.js:558`):
- `group` defaults to `${project} Public` but **the caller can set it to any name**. If the group doesn't
  exist, the handler creates it and attaches it to the project.
- With no `password`, it generates one with `passwordGen()` (uses `Math.random`) and emails it in plain text,
  with a "Sign In" button linking to the caller-supplied `url`.
- Self-signup (`authSignup.jsx:285`) uses the same endpoint *with* a password.

### Password reset today

The name `password/reset` means two different things:
- **Client route `password/reset`** → `authResetPassword.jsx` → `POST /password/update`
  (`auth.js:391`). This requires a login token **and** the current password. Safe.
- **Server endpoint `POST /password/reset`** (`auth.js:416`) is called by `authForgotPassword.jsx:55`
  and the admin "Reset password" modal (`authUsers.jsx:397`). It takes only `{ email, project_name, url }`,
  **needs no login**, sets a new random password, emails it, **and returns it in the response** (`auth.js:444`):
  ```js
  return { message: '...', password: newPassword, token: newToken };
  ```

### Invite endpoints (exist, unused by any client)

- `POST /invite` — `sendInvite` (`auth.js:310`):
  - Requires a login token with authLevel ≥ 5 on `project_name`.
  - Refuses if the user already exists, or if *any* `signup_requests` row exists for (email, project), in any state.
  - Inserts an `awaiting` row and signs
    `{ group, project, email, invited_by, from: 'invite-request' }` with a 24h expiry.
  - Sends **no email** (`// Phase 5` placeholder) and returns `{ message, token }`.
  - Does **not** check that `group_name` belongs to the project, or that the inviter's level ≥ the group's
    level (`signupAccept` at `auth.js:227` does both).
- `POST /invite/accept` — `acceptInvite` (`auth.js:339`):
  - Takes `{ token, password }` and verifies `from === 'invite-request'`.
  - Requires the `awaiting` row, then in one transaction: creates the user, assigns the group, and marks the
    request `accepted`.
  - Returns a full user object, so the invitee is logged in.
- **Single use and revocation already work without a token table.** Once the row is `accepted`, the token is
  dead, and deleting the row revokes a pending invite.

### Schema

`users` = `id, email, password, created_at` (both `auth_tables.sql` and `auth_tables.sqlite.sql`). No
must-change flag. The proposed design **needs no schema change**.

### Tokens

`utils/crypto.js`: `signToken(payload, expiresIn)` wraps `jsonwebtoken` with `JWT_SECRET` (falls back to a
hard-coded dev secret). `createUserToken` puts `{ email, password: <bcrypt hash>, project }` in the payload.
`verifyAndGetUserData` treats a token as valid only while its embedded hash still equals the stored one, so
**any password change already invalidates every older login token**.

## Proposed Changes

### Phase 1 — Close the takeover holes (server only) — NOT STARTED

- [ ] **`passwordReset`: stop returning `password` and `token`.** Return only `{ message }`. This one-line
  change stops remote account takeover and can ship alone, before anything else here. (Phase 4 then replaces the
  handler's behaviour entirely.)
  - The admin Reset modal only shows `res.message`, and `authForgotPassword.jsx` doesn't read either field.
    Grep again before shipping to confirm no other client reads them.
- [ ] **`signupAssignGroup`: restrict unauthenticated use.** Two options (see Open Questions):
  - With no valid admin token: only `${project} Public` (or any group at auth_level 0 in that project) is
    allowed, a `password` is required (no generated password), and creating a missing group is not allowed.
  - Creating groups on the fly and choosing the group stay available only to a verified caller with
    authLevel ≥ 5 whose level is ≥ the group's level. Or remove them, since admin add-user moves to `/invite`
    in Phase 2.
- [ ] Tests in `test-auth.js`:
  - `/password/reset` response has no `password` or `token`.
  - Anonymous `/signup/assign/group` with `group: 'AVAIL'` (or any group with level > 0) is rejected.
  - Anonymous call without a password is rejected.
  - Self-signup into `<project> Public` still works.

### Phase 2 — Invite endpoints, finished (server) — NOT STARTED

- [ ] `sendInvite`:
  - Expiry `'6h'`. Consider a constant `INVITE_EXPIRY`, overridable by env.
  - Accept `url` and `emailTheme` (same convention as `signupAssignGroup`/`passwordReset`: `url` is absolute or
    resolved against `emailTheme.siteOrigin`).
  - Send the email with `buildEmailHtml`, CTA "Set your password" → `${url}?token=${inviteToken}` (or a
    `#token=` fragment, see Open Questions).
  - Validate: `group_name` is linked to `project_name` in `groups_in_projects`, and inviter authLevel ≥ the
    group's auth_level (copy the check from `signupAccept`).
  - **Re-invite:** if an `awaiting` row exists, replace it (new token, fresh 6h) instead of refusing. Keep
    refusing for a `pending` row, which is a self-signup request. The admin should accept that one instead.
  - **Existing user** (accounts are global across projects/tenants): add them to the group directly, mark any
    request accepted, and send a "you've been added to <project>" notice with a Sign In CTA. No password step.
  - Return `{ message, inviteUrl }` to the (authenticated) admin as a "copy link" fallback. Open question
    whether to expose it.
- [ ] `acceptInvite`:
  - Enforce the shared password policy (see Phase 3).
  - Clear error for an expired token ("This invite has expired — ask your administrator to resend it.")
    instead of the generic `'Token cannot be verified'`.
  - Clear error for an already-used token.
- [ ] **New `POST /invite/verify`** `{ token }` → `{ email, project, group }` or an error (expired / used /
  invalid). It's read-only. The page uses it to show "link expired" before asking for a password.
- [ ] Revoke: an admin deletes an `awaiting` row. Either extend `deleteSignup` (currently only `rejected`
  rows) to allow `awaiting`, or add `/invite/revoke`.
- [ ] Tests:
  - invite → verify → accept → login.
  - A token used twice is rejected.
  - An expired token is rejected (sign one with `'1ms'` expiry in the test).
  - Revoked invite is rejected.
  - Level-5 admin inviting into a level-10 group is rejected.
  - Re-invite replaces the old token (old one fails, since its row is gone).

### Phase 3 — Client: set-password page + admin UI — NOT STARTED

- [ ] **New page `AuthSetPassword`** (`patterns/auth/pages/authSetPassword.jsx`), route `password/set` in
  `siteConfig.jsx`, **no login required**:
  - Reads `token` from the query string (or fragment), then calls `/invite/verify` on mount.
  - Invalid or expired → message + link to login. No form.
  - Valid → shows the email read-only, with **New password** and **Confirm password** fields on the same form.
  - Submit → `/invite/accept` → `setUser(res.user)` → redirect to `defaultRedirectUrl`.
  - Theming: reuse `theme.auth.authPages.sectionGroup` classes like `authResetPassword.jsx` does. Don't
    hardcode classes.
  - Phase 4 points the reset flow here too. The page picks endpoints from the token's `from` (returned by
    verify) or from a `mode` param.
- [ ] Shared client-side password rules (length ≥ N, confirm matches), mirrored on the server. Per the
  "mirror, don't import, into dms-server" convention, the server keeps its own copy with a cross-reference
  comment.
- [ ] **`authUsers.jsx` Add-user modal:**
  - email + **group select** (groups from `/groups/byproject`, which the page already loads) → `POST /invite`
    with `url: origin+baseUrl+'/password/set'` and `emailTheme` (build it the way `authResetPassword.jsx`
    does).
  - Success message "Invite sent to x, link valid for 6 hours". Optional "Copy link".
- [ ] **Pending invites:** the requests list (`/requests/byProject` already returns non-accepted rows) shows
  `awaiting` rows as "Invited — pending", with **Resend** (calls `/invite` again) and **Revoke**.
  - The `signup_requests` table has no `created_at` / expiry column. Check the schema; if missing, the UI
    can't say "expired" without decoding a token, and it has none. Either show plain "pending", or add the
    column. That would be the only schema change; decide in Open Questions.

### Phase 4 — Password reset by link — NOT STARTED

- [ ] `passwordReset` no longer changes the password. It signs
  `{ email, from: 'password-reset', pwh: <first 10 chars of current bcrypt hash> }` (~1h expiry) and emails
  `${url}?token=…` pointing at `password/set`.
  - **Single use without storage:** the new `/password/reset/confirm` `{ token, password }` checks `pwh`
    against the current hash. Once the password changes, the token no longer matches.
  - Always return the same message whether or not the email exists, so the endpoint can't be used to check
    which emails have accounts.
- [ ] **Admin "Reset password" modal:** calls the same endpoint, and the user gets the link. The admin never
  sees a password.
- [ ] `authForgotPassword.jsx`: send `url: origin+baseUrl+'/password/set'`, and show "check your email".
- [ ] Rate-limit `/password/reset` per IP and per email. The `failed_logins` lockout exists for login; reuse
  or mirror it. Note: `tenant-signup` / `sync-bring-up-to-date` found that table missing in both dialects.
  Verify first.
- [ ] Tests: the reset token works once, fails after use, fails after expiry, and an unknown email gets the
  same response.

### Phase 5 — Cleanup — NOT STARTED

- [ ] Remove the generated-password branch from `signupAssignGroup`, and `passwordGen` if nothing else uses it.
  `signupAccept` has a generated-password branch too (`auth.js:260`, email never sent). Switch it to an invite
  link or leave it (Open Questions).
- [ ] Rename the client route `password/reset` → `password/change` (it's "change my password while logged
  in"). The name clash is what made the server endpoint's behaviour easy to misread. Keep a redirect from the
  old path, and update `profile.jsx:91`.
- [ ] Update the auth docs in `src/dms/documentation/` if any describe these flows.

## Open Questions (for the user)

1. **`/signup/assign/group` admin path:** keep an authenticated admin mode (choose any group, create a group),
   or make it strictly self-signup into public groups, now that admin add-user goes through `/invite`?
   Recommended: self-signup only.
2. **Token in `?token=` vs `#token=`:** a fragment never reaches servers, proxies or `Referer` headers. It's
   slightly safer at a small cost in client parsing. Recommended: fragment.
3. **Show the invite link to the admin** ("Copy link") as a fallback when email fails? Handy, but it means the
   admin could set the user's password themselves.
4. **Invite expiry visible in the admin list:** add `created_at` to `signup_requests` (if absent), or just show
   "pending" and let Resend handle stale ones?
5. **Existing-user invite:** add silently plus a notice email (proposed), or require the user to accept?
6. **`signupAccept`'s generated-password branch:** convert to an invite link in this task, or leave it (no
   client calls it; the approve UI in `authUsers.jsx` is commented out)?
7. **Password policy:** minimum length? Any complexity rule? None exists today.
8. **Reset link expiry:** 1h proposed. The invite is 6h.

## Alternatives considered

- **Temporary password + forced change on first login.** Needs a `must_change_password` column and a login
  gate, and still emails a password in plain text. Rejected in favour of the link.
- **One-time code (OTP) typed from the email.** Survives email scanners that pre-open links, but adds friction
  and needs storage for codes and attempts. Not needed unless scanners turn out to consume links. They
  wouldn't here, because verify is read-only and only accept (a POST) uses the token.
- **Magic-link login without passwords.** A bigger shift in the auth model. Out of scope.

## Related findings (not fixed here, flag separately if wanted)

- Login JWTs carry the user's bcrypt hash in the payload (`createUserToken`), and a JWT payload is
  base64-readable. A leaked token exposes a hash that can be brute-forced offline. The "hash in token"
  mechanism is what invalidates old tokens on password change, so replacing it needs a substitute (e.g. a
  `token_version` column, or an HMAC of the hash instead of the hash itself).
- `JWT_SECRET` falls back to `'dms-dev-secret-change-in-production'`. Consider refusing to start in production
  when it's unset.
- `passwordGen` uses `Math.random`. This stops mattering once generated passwords are gone (Phase 5).

## Files Requiring Changes

| File | Change |
|------|--------|
| `packages/dms-server/src/auth/handlers/auth.js` | Phase 1: `passwordReset` response, `signupAssignGroup` guard. Phase 2: `sendInvite`/`acceptInvite`, new `verifyInvite`. Phase 4: link-based reset + confirm |
| `packages/dms-server/src/auth/routes/auth.routes.js` | `/invite/verify`, `/invite/revoke` (or an extended `/signup/delete`), `/password/reset/confirm` |
| `packages/dms-server/src/auth/utils/email.js` | Maybe nothing (`buildEmailHtml` already supports a CTA) |
| `packages/dms-server/tests/test-auth.js` | Tests per phase |
| `packages/dms/src/patterns/auth/pages/authSetPassword.jsx` | **New.** Token → verify → new + confirm password form |
| `packages/dms/src/patterns/auth/siteConfig.jsx` | `password/set` route. Later `password/change` rename + redirect |
| `packages/dms/src/patterns/auth/pages/authUsers.jsx` | Add-user → `/invite` with a group select. Pending invites with Resend/Revoke. Reset modal → link |
| `packages/dms/src/patterns/auth/pages/authForgotPassword.jsx` | `url` → `password/set`, "check your email" copy |
| `packages/dms/src/patterns/auth/pages/profile.jsx` | Link to the renamed change-password route (Phase 5) |
| `packages/dms/src/patterns/auth/defaultTheme.js` | Tokens for the new page, if it needs any beyond `sectionGroup` |

## Testing Checklist

- [ ] Phase 1: `/password/reset` response has no `password`/`token` (server test)
- [ ] Phase 1: anonymous `/signup/assign/group` into a group with level > 0 is rejected; self-signup still works
- [ ] Phase 2: invite → verify → accept → login round trip (server test)
- [ ] Phase 2: reused, expired, revoked and replaced tokens are all rejected
- [ ] Phase 2: level-5 admin can't invite into a level-10 group
- [ ] Phase 3 (live): admin adds a user → email arrives → link opens `password/set` → password set →
      logged in and redirected
- [ ] Phase 3 (live): the link opened after 6h shows "expired", Resend sends a working link, the old link is dead
- [ ] Phase 3 (live): the page works in single-tenant and on a tenant subdomain (`url` resolves against the
      tenant origin)
- [ ] Phase 4: forgot password → link → new password; the link fails a second time; an unknown email gets
      the same response
- [ ] Phase 4 (live): admin Reset sends a link; the admin never sees a password
