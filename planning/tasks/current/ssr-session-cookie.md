# The server knows who is asking for a page: a session cookie read only by SSR

**Initiatives:** [plat_tenant_hub](../../../../../planning/initiatives/plat_tenant_hub.md) · **Status:** in progress (Phase A built) · **Created by:** amuro@albany.edu · **Edited by:** amuro@albany.edu

## Objective

A signed-out visitor to a page that needs sign-in gets the sign-in screen straight from the server,
with no flash of the page first. Today the server renders every page as signed out: the token lives
in the browser's `localStorage` (`patterns/auth/api.js`, `providers.jsx`) and reaches the server only
as an `Authorization` header on API calls (`dms-server/src/auth/jwt.js`). A page request carries
nothing, so the SSR HTML is the page with no user, and the route's auth check (`dms-manager/_auth.js`)
only runs after hydration, in an effect, and redirects then. Seen on chat (owner, 2026-11-18): a cold
load shows chat's empty shell, then the login screen.

Chat's own part (a loading state until sign-in and the channel list are known) is done separately in
`dms-template/planning/tessera/tasks/current/chat-mobile.md` (Phase 2c); it stays needed after this.

## Also fixes: two whole-tree remounts on every signed-in cold load

Measured on chat (2026-11-18, `#root`'s child replaced): (1) hydration discards the SSR DOM, since the
signed-out HTML has no user menu or signed-in nav; (2) ~0.5 s later `DmsSite`'s full fetch returns the
real pattern rows where the server's `defaultData` had `no-access` stubs, so `setDynamicRoutes` rebuilds
the router (`dmsSiteFactory.jsx`; `appliedSiteDataRef` can't match: the data really differs). Both
come from the server rendering signed out; with the user known (Phase B, and the site data loaded as
that user) the first client render matches and the fetch is redundant. Check both in Testing.

## Design

### Phase A — a cookie that mirrors the sign-in

- `POST /_session` on dms-server, called by the client on the page's own host after sign-in, sign-up
  and token refresh (body: the token), and on sign-out (no token). It sets, host-only:
  `dms_session=<token>; HttpOnly; Secure (on https); SameSite=Lax; Path=/; Max-Age=<token expiry>`,
  or `dms_session=signed-out` on sign-out. Per host, like today's per-origin `localStorage` sign-in
  (tenant hosts, aliases and pattern subdomains are separate origins already). Works wherever the
  page host is served by dms-server (the hub, mercury's hosted sites).
- **Read only to render pages.** The API (`/graph`, REST routes) keeps the header and ignores the
  cookie, so no cross-site request can act as a signed-in user: no CSRF tokens needed.
- **Three states**, so nobody already signed in is bounced on the first load after the deploy:

  | Cookie | Meaning | SSR |
  |---|---|---|
  | absent | unknown | renders as today; the client writes the cookie from `localStorage`, or `signed-out` |
  | `signed-out` | signed out | redirects protected pages to sign-in |
  | a token | verify | `verifyAndGetUser` (cached, as the API's) → the user and groups |

### Phase B — SSR decides access before sending HTML

- `defaultCheck` / `defaultCheckAuth` (and every pattern's `checkAuth` override: chat, qa, …) return a
  decision (`{ redirect }` or nothing) instead of calling `navigate`; the client navigates on it, and
  the server uses the same function, so the rule lives in one place.
- The SSR middleware reads the cookie and passes the user to `handler.render(request, { user })`;
  after matching routes the handler runs the check and answers `302 <authPath>/login?from=<path>` (or
  the client's own redirect for a signed-in user without access) before any HTML.
- Pages rendered for a known user: `Cache-Control: private, no-store`, `Vary: Cookie`.

### Not in scope: per-user content in the SSR HTML

The SSR Falcor model is built once per host and shared by every request (`ssr2/handler.jsx`
`buildRoutes`): right for public data, a leak if it held one user's rows. Rendering a user's own data
on the server needs a per-request model carrying their token. Only worth it if a page must show
signed-in content with no loading state; file separately if so.

Unaffected: sites still deployed to Netlify (no SSR) and token clients (the dms CLI) — header only.

## Files (expected)

- `dms-server/src/auth/` — `/_session` route; `userFromSessionCookie(req)` for SSR only
- `dms/src/patterns/auth/api.js`, `providers.jsx` — call `/_session` on sign-in, refresh, sign-out; sync once on boot when the cookie is absent
- `dms/src/dms-manager/_auth.js`, `index.jsx` — checks return a decision
- pattern `checkAuth` overrides (dms-template `src/patterns/chat/siteConfig.jsx`, `src/patterns/qa/…`)
- `dms/src/render/ssr2/express/middleware.mjs`, `handler.jsx` — user in, redirect out, cache headers

## Testing

- [ ] Signed out, protected page: 302 to sign-in, no page HTML
- [x] Signed in: page renders; API calls unchanged (header) (2026-11-21, hub)
- [ ] Signed in without the page's permission: the same redirect the client makes today
- [x] Expired token in the cookie: treated as signed out (2026-11-21, hub)
- [x] First load after deploy with a `localStorage` token and no cookie: not bounced; cookie written (2026-11-21, hub; one hydration mismatch on that load)
- [ ] Sign-out: cookie becomes `signed-out`; next load redirects (cookie: yes, 2026-11-21; redirect: Phase B)
- [x] A cross-site POST to `/graph` with the cookie: not authenticated (the API ignores the cookie; cross-origin `/_session` 403; 2026-11-21)
- [x] Public pages: unchanged for signed-out visitors (44 pages, warm complete ×1.00 with RSC off and on; rsc-view-pages.md S5, 2026-11-21)
- [x] Signed-in cold load: no `#root` replacement at hydration, no router rebuild after the full fetch (2026-11-21, build `p1remount2`: tny and mny, one mount and one `track/visit`; needed the two S5b fixes below)

## Log

- **2026-11-18** — Planned with the owner (from chat's cold-load flash).
- **2026-11-21** — **Phase A built and checked on the hub**, as phase 1 of
  [rsc-view-pages.md](./rsc-view-pages.md) (details and results there, "Phase 1"). Beyond Phase A it also does
  what "Not in scope" left out: the server renders as the user, with a per-request Falcor model carrying their
  token (`utils/requestScope.js`), so restricted pages arrive rendered and signed-in hydration matches. The
  server render now runs inside `authProvider` (it had none: every SSR render was signed out regardless).
  Files: `dms-server/src/auth/session.js` (new), `auth/jwt.js`, `index.js`; `render/ssr2/handler.jsx`,
  `express/middleware.mjs`, `express/setup.mjs`; `render/rsc/hydrate.js`, `rscHandler.js`;
  `patterns/auth/api.js`, `providers.jsx`, `pages/authLogin.jsx`, `authLogout.jsx`;
  `patterns/admin/pages/createSite.jsx`; `render/dmsPageFactory.jsx`; `utils/requestScope.js` (new).
  Not committed or deployed. Still to do: Phase B (decisions from `checkAuth`, 302 before HTML); the PDF renderer
  setting the cookie; the "no `#root` replacement" check (the first `<div>` is replaced signed out too).
- **2026-11-21 (later)** — Measured signed in (rsc-view-pages.md S5): ×1.09 slower than the anonymous render,
  TTFB ×1.29 (the request's Falcor model starts empty). Found why the router still rebuilt after load (S5b):
  `appliedSiteDataRef` started `null` (`render/spa/dmsSiteFactory.jsx`, fixed: it starts as the first render's
  site data), and `hasNoAccessStubs` (`render/ssr2/handler.jsx`) missed the stubs, whose `id` ref expansion
  overwrites, so signed-in visitors always got the anonymous route tree (fixed: it reads `no_access`). Both
  remounts are gone. Measured: signed in ×0.94 (back to the anonymous render's time, ×1.02), signed out ×0.94
  with RSC off. Builds `p1remount2`; not committed or deployed.
- **2026-11-22** — Signed-in visitors now get the RSC path too, rendered as them (rsc-view-pages.md S9). The PDF
  renderer sets the session cookie (`dms-server/src/pdf/render.js openTab`): a `self` export of a page only
  signed-in users can open prints it. Found and fixed: the SSR middleware's template fill read `$'` in page
  content as a replacement pattern (`middleware.mjs`, replacer functions now). Split out:
  [login-form-hydration-race.md](./login-form-hydration-race.md), [login-token-password-stamp.md](./login-token-password-stamp.md).
