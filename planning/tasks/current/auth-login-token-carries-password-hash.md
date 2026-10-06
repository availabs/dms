# Auth: login tokens carry the user's bcrypt hash, and `JWT_SECRET` has a hard-coded fallback

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** next · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

Stop putting the user's password hash in login JWTs, without losing the property it currently
provides: a password change invalidates every older login token. In the same pass, stop
`dms-server` from silently signing tokens with a public default secret when `JWT_SECRET` is unset.

Filed 2026-10-06 from the LHMP home sync (`dms-template/planning/mitigateny/tasks/current/mny-lhmp-home-live-build.md`,
Round 10). A token minted for the CLI against `https://dmsserver.availabs.org` decoded to
`{ email, password, project, iat, exp }`, and `password` was a 60-character `$2…` bcrypt hash. It is
already listed as a "related finding, not fixed here" in
[`auth-invite-link-and-reset-hardening.md`](./auth-invite-link-and-reset-hardening.md), and this task is
that finding broken out.

## Current state (read from code 2026-10-06)

- **Signing:** `packages/dms-server/src/auth/utils/crypto.js:27`
  `createUserToken(email, passwordHash, project)` signs `{ email, password: passwordHash, project }`.
  It is called from `handlers/auth.js:42` (`buildUserObject`, so every login, signup and invite
  accept) and at `:358`, `:371`, `:383` and `:410` (the password set, reset, update and admin paths).
- **Verifying:** `auth/jwt.js:46` (`verifyAndGetUser`, the request middleware) and
  `handlers/auth.js:28` both reject a token unless `decoded.password === <stored hash>`. **This is the
  revocation mechanism.** Changing a password changes the stored hash, so every older token fails.
  There is no token table and no version column.
- **Secret:** `crypto.js:4` uses `process.env.JWT_SECRET || 'dms-dev-secret-change-in-production'`.
  The fallback string is in the public source. A server started without the env var signs and
  accepts tokens that anyone can forge.
- **Legacy twin:** `avail-falcor/auth/handlers/utils/auth.utils.js:164` uses the same scheme
  (`decoded.password === userData.password`), and `jwt.js:35` says the dms-server verifier "matches
  the reference auth() function". **Not verified:** whether any deployment shares `JWT_SECRET` and the
  auth database between dms-server and avail-falcor so that their tokens are interchangeable. If one
  does, changing the claim on one server alone logs users out of the other.

## Why it matters

A JWT payload is only base64. Signing protects its integrity, not its secrecy. Anyone who holds a
token (from browser localStorage, a log line, a pasted curl command, a screenshot of devtools, a
Playwright `storageState` file in a scratchpad) can read the hash and attack it offline. bcrypt at cost
10 slows that down but does not stop it against weak or reused passwords. The hash also outlives the
token: the token expires in 6h (`JWT_EXPIRY`), but the hash stays valid until the password changes.

## Proposed changes

### Phase 1: replace the claim (server only), with a compatibility window

- [ ] **New claim `pwv`**: `HMAC-SHA256(JWT_SECRET, passwordHash)`, base64url, truncated to 16 bytes.
  A password change still changes it, so revocation is unchanged. It cannot be reversed and it is
  useless without the secret, and it needs **no schema change**.
  - The alternative is a `token_version` integer on `users`, bumped on every password change and
    stored in the token. It's cleaner, and it also lets an admin "sign out everywhere" without a
    password change. It costs a migration on both auth DB adapters and a bump at every password
    write site. Recommended only if "sign out everywhere" is wanted soon (see Open questions).
- [ ] `createUserToken` signs `{ email, pwv, project }` with no `password` key.
- [ ] Both verifiers (`jwt.js:46`, `auth.js:28`) accept **either** a matching `pwv` **or** a legacy
  `password` claim that equals the stored hash. The legacy branch is removed in Phase 3. Because
  `JWT_EXPIRY` is 6h, one deploy plus 6h retires every legacy token naturally, and no user is logged out.
- [ ] Keep the verifier's comparison constant-time (`crypto.timingSafeEqual` on equal-length buffers).

### Phase 2: refuse to run with the default secret

- [ ] If `JWT_SECRET` is unset and `NODE_ENV === 'production'` (or any non-dev marker the deploy
  scripts already set; check `research/production-deployment.md`), log a clear error and exit at
  startup. In dev, keep the fallback but log a one-line warning.
- [ ] **Check before shipping:** that every running dms-server (dmsserver.availabs.org, mercury, and
  any spare-port harness) has `JWT_SECRET` set. A server that was silently on the fallback would
  refuse to start after this change. That's the point, but it should be found before the deploy.

### Phase 3: remove the legacy branch

- [ ] One `JWT_EXPIRY` or more after Phase 1 is deployed everywhere, delete the `password`-claim
  branch from both verifiers.
- [ ] **avail-falcor:** decide whether its `auth.utils.js` gets the same change or is left alone. That
  depends on the shared-deployment question above. If the two share tokens, Phase 1 must land on both,
  or avail-falcor must learn to accept `pwv` first.

## Open questions

1. **Do any deployments share tokens between dms-server and avail-falcor?** This sets the rollout
   order. It's the one thing to settle before Phase 1.
2. **HMAC claim or `token_version` column?** HMAC is recommended unless an admin "sign out everywhere"
   (without a password change) is wanted on the same timeline.
3. Should Phase 2 fail closed in every non-dev environment, or only when `NODE_ENV === 'production'`?

## Files requiring changes

| File | Change |
|---|---|
| `packages/dms-server/src/auth/utils/crypto.js` | `pwv` helper; `createUserToken` payload; startup check for `JWT_SECRET` |
| `packages/dms-server/src/auth/jwt.js` | accept `pwv` (and legacy `password` until Phase 3) |
| `packages/dms-server/src/auth/handlers/auth.js` | same at `:28`; call sites unchanged (they pass the hash in, which never leaves the server) |
| `packages/dms-server/tests/test-auth.js` | tests below |
| `avail-falcor/auth/handlers/utils/auth.utils.js` | only if open question 1 says the servers share tokens |

## Testing checklist

- [ ] A freshly issued login token's decoded payload has no `password` key and contains no `$2` substring.
- [ ] A new token authenticates. After a password change it is rejected, which is the revocation
      regression lock.
- [ ] A legacy token (hand-signed `{ email, password: <hash>, project }`) still authenticates in
      Phase 1, and is rejected after Phase 3.
- [ ] A token with a wrong `pwv` is rejected.
- [ ] The server exits at startup in production mode with `JWT_SECRET` unset, and starts with a warning in dev.
