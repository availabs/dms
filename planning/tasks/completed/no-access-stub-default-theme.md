# Intermittent default theme — no-access pattern stub omits `theme`

> Reported 2026-07-02 (landbank dev2, pattern 21): intermittently on refresh —
> more often on the first load in a while — a pattern with a theme set renders
> fully functional but with the **default theme**. Root cause diagnosed the same
> day from `dms-server/logs/requests-*.jsonl`; this task tracks the fix.

**STATUS: DONE 2026-07-02.** All three fixes shipped (TDD) + one bonus
security fix found during the live smoke test (see Fix 4 below). Server:
`npm test` (sqlite/controller/graph/workflow) green, UDA 65/65, source-auth
16/16, new `test-pattern-stub.js` 7/7 + `test-jwt-failures.js` 6/6. Client:
149/149 vitest (incl. new `siteSnapshot.test.js`). Live-verified against
localhost:3001 (anonymous byId now returns the stub WITH `selectedTheme:
landbank`; `data`-only bypass closed) and browser boot on :5173 (branded
render, clean snapshot, no console errors). NOTE: the fix must also be
deployed to `dmsserver.availabs.org` for clients pointed at the remote server.

## Objective

A transient auth failure (or expired token) during site boot must never
silently strip the theme from an otherwise-working page, and a single bad
load must not poison subsequent boots via the localStorage snapshot.

## Root cause

Three cooperating pieces:

1. **Server: the no-access stub omits `theme`** —
   `dms-server/src/routes/dms/dms.route.js` (`dataByIdResponse`, ~line 84).
   When a byId request for a `pattern` row fails the server-side
   `isUserAuthed` check, the route returns a minimal data atom
   (`id: 'no-access'`, `base_url`, `pattern_type`, `subdomain`,
   `authPermissions`, `name`) so the client can still build the route and
   redirect to login. `theme` (and `config`) are not included. The client's
   `pattern2routes` → `pagesConfig` → `getPatternTheme` then finds no
   `pattern.theme.selectedTheme` and silently falls back to `'default'`.
   A logged-in user still passes the *client-side* auth check (the stub keeps
   `authPermissions`, which grant them access), and page/section requests fire
   later when auth is healthy again — so the page renders fine, just unthemed.

2. **Server: auth failures are silently swallowed** —
   `dms-server/src/auth/jwt.js:99-101`:
   ```js
   } catch (e) { user = null; }
   ```
   Two triggers funnel into this, both making the request anonymous with zero
   log output:
   - **Transient auth-DB failure.** Token verification hits the remote
     `availauth` Postgres (user lookup + groups) whenever the server's
     5-minute token cache is cold. Site boot fires a burst of concurrent
     requests; one DB hiccup makes the whole burst anonymous. Cold cache =
     "first load in a while", matching the observed bias.
   - **JWT expiry (6h).** First refresh after expiry produces the same stubs.

3. **Client amplifier: poisoned localStorage snapshot** —
   `render/spa/dmsSiteFactory.jsx:200-202` writes the loaded site data
   (including stubbed patterns) to localStorage unconditionally. The *next*
   refresh renders default-themed routes instantly from the snapshot, showing
   a default-theme flash (or full miss) even when that boot's own fetch is
   healthy.

### Evidence (kept for posterity)

`logs/requests-2026-07-02T01-57-32-800Z.jsonl` — identical pattern-resolution
request `["dms","data","landbank","byId",[11,12,21],[...]]` flapping:

| seq | time | result |
|---|---|---|
| 584 | 02:36:57 | theme present |
| 591/592 | 02:38:05 | **no-access stub** |
| 603 | 02:38:30 | theme present |
| 4832 | 03:42:42 | theme present |
| 4874/4875 | 12:39:45 | **no-access stub** |
| 4906 | 12:40:02 | theme present |
| 4940/4941 | 12:44:13 | **no-access stub** |
| 4951/4953 | 12:45:03 | theme present |

In the 12:44:13 burst, every auth-checked request (pattern byId, page
length/byIndex) failed together while non-auth-checked ones (site row, dmsEnv
byId 13) succeeded in the same second — a whole-burst auth failure, self-healed
50s later with no re-login. Confirmed by direct curl: unauthenticated byId 21 →
stub without `theme`; authed → full data with `theme`.

Why only the pages pattern shows it: pattern 21 is the only pattern that both
has a non-default theme AND is non-public (`public: []`). Public patterns are
never stubbed; unthemed patterns show no visible difference.

### Ruled out

- Falcor cache eviction (default `maxSize` = 2^53, effectively unlimited)
- DB `theme_refs` race (landbank site has none; theme is the static code theme)
- Client token rotation (only login writes `userToken`)
- `dmsSiteFactory` itself — its only role is the snapshot amplifier (piece 3)

## Fixes (all shipped 2026-07-02, TDD — test first, watched RED, then GREEN)

- [x] **1. Include `theme` in the no-access stub** (`dms.route.js`
      `dataByIdResponse`): added `theme: row.data?.theme` to the stub atom.
      Theme is styling config, not sensitive — and the stub's stated purpose
      is a branded redirect-to-login, which *needs* the theme. `config` stays
      out (schema info, not needed for routing/branding).
- [x] **2. Stop swallowing auth failures silently** (`auth/jwt.js`): new
      `isExpectedAuthFailure(e)` — verifyToken rejects with a *string*
      ('Token cannot be verified', covers bad/expired JWT) and
      `Error('Invalid user')` covers gone-user/password-change; both stay
      quiet. Anything else (auth-DB/network) now logs
      `[auth] token verification failed (infrastructure): <cause>`.
      Middleware gained a `{ db }` override param for test injection.
      (Responding 5xx on infra failures was considered and deferred —
      warn-log is enough to diagnose; revisit if episodes persist.)
- [x] **3. Don't persist stubbed patterns to the localStorage snapshot**:
      new `render/spa/utils/snapshot.js` (`hasNoAccessPatterns` +
      `persistSiteSnapshot`); both write sites in `dmsSiteFactory.jsx`
      (master + tenant) now skip the write when any pattern is a stub, so a
      good prior snapshot survives one bad load.
- [x] **4. (Bonus, found by the live smoke test) `data`-only byId requests
      bypassed the auth check entirely** — `dataByIdResponse` keys the check
      off `row.type`, and when the caller didn't request `type` the row came
      back without it → check skipped → **full restricted data leaked to
      anonymous callers**. Both byId GET routes now always fetch `type`
      (`fetchAtts`) while still emitting only the requested attributes.

## Files changed

- `packages/dms-server/src/routes/dms/dms.route.js` — fixes 1, 4
- `packages/dms-server/src/auth/jwt.js` — fix 2
- `packages/dms/src/render/spa/utils/snapshot.js` (new) +
  `packages/dms/src/render/spa/dmsSiteFactory.jsx` — fix 3
- `packages/dms-server/tests/test-pattern-stub.js` (new) — fixes 1, 4
- `packages/dms-server/tests/test-jwt-failures.js` (new) — fix 2
- `packages/dms/tests/siteSnapshot.test.js` (new) — fix 3

## Testing checklist

- [x] Graph-harness test: unauthenticated byId GET for a restricted pattern
      returns the stub **including `theme`** and still omitting `config`;
      logged-in-but-unauthorized gets the same stub; permitted user gets full
      data (7/7 in `test-pattern-stub.js`, incl. the `data`-only bypass probe)
- [x] jwt middleware: valid token + healthy DB → user set; missing header /
      garbage token / expired token / unknown user → anonymous with NO warn;
      valid token + DB error → anonymous AND warn carrying the cause
      (6/6 in `test-jwt-failures.js`)
- [x] Client: stubbed snapshot skipped, good prior snapshot preserved,
      SSR (no storage) no-op (6/6 in `siteSnapshot.test.js`)
- [x] No regressions: dms-server `npm test` green, UDA 65/65, source-auth
      16/16, client vitest 149/149
- [x] Live smoke (localhost:3001): anonymous byId 21 → stub with
      `selectedTheme: landbank`; `data`-only request → stub (leak closed);
      browser boot on :5173 renders branded, clean snapshot, no console errors
- [ ] Deploy to `dmsserver.availabs.org` (clients pointed at the remote server
      still see the old behavior until then)

## Follow-ups noted (not this task)

- `npm run test:auth` fails on SQLite for a pre-existing reason: the committed
  "failed login lockout support" uses Postgres-only `NOW() - INTERVAL`
  SQL against `login_attempts`, breaking the login endpoint on SQLite.
  (Also required creating local gitignored `dms-sqlite.config.json` /
  `auth-sqlite.config.json` from examples to run DB-backed suites at all.)
