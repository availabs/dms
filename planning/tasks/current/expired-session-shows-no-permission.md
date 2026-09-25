# Auth: an expired session shows "You do not have permission" instead of redirecting to login

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** next (was: "FILED 2026-09-23, not started, not reproduced.") · **Created by:** rdubowsky@albany.edu · **Edited by:** —

> **Status:** FILED 2026-09-23, **not started, not reproduced.** Moved here from TransportNY control-room
> ticket #2224917 ("Logout Redirect", client-filed 2026-09-22, Minor), which was Closed on the ticket
> board because the fix lives in this library, not on any page.

## Objective

A visitor whose session expired (e.g. an overnight auto-logout) who then follows a link to a
permission-gated page should land on the login page, with `state.from` set so they come back
afterwards. Today they get the dead end "You do not have permission to view this page. Click here to
visit Home".

## The report (verbatim, #2224917)

> When you were automatically logged out overnight, and you try to click on a navigation link (i.e. the
> site manager) it should bring you to the login page, currently it brings you to a page that says you
> do not have permission to view this page.

Reporter was on the TransportNY dev site (Chrome 152, Windows). The ticket was keyed `npmrds:overview`,
which is not a page. The widget stamps the last path segment, and the link followed was the site
manager, so the gated page was most likely `/sitemgmt/overview` (the `sitemgmt` pattern is auth-gated).

## Current state (read from code 2026-09-23)

Both page renderers decide login vs no-permission from the CLIENT's `user.authed`:

- `patterns/page/pages/view.jsx:193-198` — when the page is denied (`isViewDenied` or the server's
  `no-access` stub): `!user.authed` → `<Navigate to={authBaseUrl}/login>`; otherwise the
  no-permission message. The login branch was added by `server-side-auth.md` (its item 3).
- `patterns/page/pages/edit/index.jsx:284-289` — the same shape for the `no-access` stub.
- `patterns/page/pages/edit/index.jsx:292-295` — **a second gap, separate from the report**: when the
  permission check (`isUserAuthed(reqPermissions…)`) fails, an authed user is redirected to the view
  page, but an UNauthed one gets the no-permission message with no login redirect at all.

## Hypothesis (unverified, the first thing to confirm)

After the server-side token expires, the client still holds the old user object with
`authed: true`: nothing re-validates it until something forces a check. The server treats the
request as anonymous and returns the `no-access` stub. The client, still believing it is logged in,
takes the "authed but not permitted" branch. If so, the fix is not in the branch itself but in what
happens when a denial arrives for a client that thinks it is authed: re-validate the token (the auth
check the app already does at boot), and if it fails, clear the user and fall through to the
login redirect.

Rule out first: whether the SPA already re-validates on route change or on window focus, and whether
`no-access-stub-default-theme.md` (completed; expired token during site BOOT → anonymous) covers boot
only and not an already-running tab.

## Proposed changes (after the hypothesis is confirmed)

- [ ] Reproduce: log in, expire or invalidate the token server-side (or wait out its lifetime), then
      follow a nav link to a gated page in the same tab. Record what `user` holds client-side at
      that moment.
- [ ] On a denied page for a client that believes it is authed, re-validate once; invalid → treat as
      logged out → login redirect with `state.from`.
- [ ] `edit/index.jsx:292-295`: the unauthed branch should redirect to login, matching `view.jsx`.
- [ ] Backward-compatible: an authed user who genuinely lacks permission must still see the
      no-permission message, not be bounced to login in a loop.

## Files likely to change

- `packages/dms/src/patterns/page/pages/view.jsx`
- `packages/dms/src/patterns/page/pages/edit/index.jsx`
- the client auth state provider (wherever `user.authed` / `isAuthenticating` are set) — not yet located

## Testing checklist

- [ ] Expired session + nav link to a gated page → login page, then back to the page after login.
- [ ] Authed user without permission → still the no-permission message (no redirect loop).
- [ ] Anonymous visitor to a gated page (never logged in) → login, as today.
- [ ] `/edit/<slug>` on a gated page while logged out → login.

## Related

- `server-side-auth.md` (current) — added the `!user.authed` → login branch in `view.jsx`.
- `no-access-stub-default-theme.md` (completed) — expired token during site boot.
- `auth-permission-chain-and-unguarded-writes.md` (current) — route-chain ACL; different defect.
