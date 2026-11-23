# Login tokens carry a stamp of the password, not the password hash

**Initiatives:** [shared_server_security](../../../../../planning/initiatives/shared_server_security.md) · **Status:** built and tested on the hub 2026-11-22; not committed or deployed · **Created by:** amuro@albany.edu · **Edited by:** amuro@albany.edu

## Objective

A login token must not reveal anything about the user's password. Found 2026-11-21 while building the
session cookie ([rsc-view-pages.md](./rsc-view-pages.md) phase 1): `createUserToken` signed
`{ email, password: <bcrypt hash>, project }`, so the hash sat, base64-encoded, in every token. The token is in
the browser's `localStorage`, in the `dms_session` cookie, in `Authorization` headers and in anything that
logs them; anyone holding one could read the hash and attack it offline.

## Why the hash was there

Token checks (`auth/jwt.js` `verifyAndGetUser`, `auth/handlers/auth.js` `verifyAndGetUserData`) compare it
with the user's current hash, so a token stops working when its user's password changes. That property
stays; it only needs something that changes with the password, not the password hash itself.

## The fix (built)

- `auth/utils/crypto.js`: `passwordStamp(hash)` = HMAC-SHA256 of the hash under `JWT_SECRET`, base64url,
  22 characters. `createUserToken` signs `{ email, pw: <stamp>, project }`. `tokenMatchesPassword(decoded,
  hash)` is the one check: the stamp when the token has one; a token from before the change (with
  `password`) still matches its hash **until it expires** (`JWT_EXPIRY`, 6 h by default), so a deploy signs
  nobody out. A user with no password matches no token.
- `auth/jwt.js` and `auth/handlers/auth.js` use `tokenMatchesPassword`.
- avail-falcor verifies tokens the old way, but tokens don't need to work across the two servers (owner,
  2026-11-22: "We don't need to support avail falcor").

## Testing

- [x] `tests/test-jwt-failures.js`: 4 new cases (no hash in a new token; a token from before a password change
      is refused; a legacy token still works and a wrong legacy hash doesn't; a user with no password matches
      nothing): 12 of 12 pass
- [x] `test-auth-users` 27/27, `test-auth-groups` 22/22, `test-auth-platform` 14/14
- [x] Hub: sign-in, signed-in pages, `/_session`, PDF export with the new tokens (rsc-view-pages.md S9 checks)
- [ ] After deploy: existing sessions keep working; a password change signs out other sessions

## Follow-ups

- [ ] Remove the legacy `password` branch of `tokenMatchesPassword` one release after this ships.
- Tokens issued before the deploy still carry the hash until they expire (6 h). Rotating `JWT_SECRET` would
  end them at once, at the cost of signing everyone out; not done.
