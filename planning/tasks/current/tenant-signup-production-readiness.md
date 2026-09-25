# Tenant Signup — Production Readiness

## Objective

Make the multi-tenant journey production ready, from an anonymous visitor landing on the root domain,
through signup and provisioning, to their first real session on their own site. The goal is a flow
people finish without help and enjoy using, not just a working signup form.

## Scope

- **In:** root-domain landing → signup → provisioning → subdomain login → first use of the tenant
  site. Covers correctness, security, abuse, speed, and first-run UX.
- **Out (deliberately dropped 2026-09-23, per user):** logging people straight in on the new site
  after signup (cross-domain token handoff), choosing public/private at signup, inviting teammates,
  and a "My sites" page on the root domain.
- **Not a problem (reviewed 2026-09-23, per user):**
  - Root-domain landing / how people find signup: fine as is.
  - Members who sign up on a tenant subdomain get no view access: intended. The tenant admin grants
    access in the pattern permissions settings.
- **Out (tracked elsewhere, only cross-referenced here):**
  - Privacy/Terms pages + signup consent checkbox → `site-completeness-legal-gaps.md`
  - `[object Object]` server error messages → `tenant-subdomain-uniqueness.md` (Open Issue: Error Display)
  - Removed tenants permanently burn their subdomain → `tenant-subdomain-uniqueness.md` (Open Issue, suspend-vs-delete undecided)
  - Expired token shows "no permission" instead of login → `expired-session-shows-no-permission.md` (same root as the Stage 5 flash)

## Current State — the journey, stage by stage

All findings come from reading the code on 2026-09-23 unless marked **(live)**. Site checked:
`tessera-test+test` on `https://tributarylab.com`.

### Stage 1 — Anonymous visitor lands on the root domain

- The root domain serves the master site's own patterns (`dmsSiteFactory.jsx`, `!subdomain` branch).
  On tessera-test that is Auth at `/auth`, Pages at `/` (published "Page 1" + "Features") and Docs at
  `/docs` **(live, CLI)**.
- Signup lives only at `/auth/signup`. The one built-in way to reach it is the small "sign up" link
  on the login page (`authLogin.jsx:129`). Any "create your site" button on the home page has to be
  authored by hand; nothing in the platform provides one. *(Reviewed: fine as is. Authors add their own CTA.)*

### Stage 2 — Signup form (`patterns/auth/pages/authSignup.jsx`, tenant branch)

- One form: organization name, subdomain, email, password, verify password, template picker.
- Subdomain validation is format and reserved words only (11 reserved names). Whether a name is
  taken is only discovered after submit, deep in provisioning.
- **An empty password is accepted.** The only check is `password === verifyPassword`, so `'' === ''`
  passes, and `initSetup` → `bcrypt.hashSync('')` happily stores it (`dms-server/src/auth/utils/crypto.js:7`).
  No minimum length or strength rule anywhere.
- No email verification, CAPTCHA or rate limit. Anyone can create unlimited tenants and auth projects.

### Stage 3 — Provisioning (runs in the browser)

Sequence in `handleTenantSignup` (+ `utils/tenantProvisioning.js`), roughly 7–15 sequential round trips
depending on the template:

1. `POST /init/setup`: auth project, `<slug> Admin/Public` groups, first user
2. `dms/data/create`: tenant row in the master app
3. Read the master site, append the tenant ref to `tenants`, write the whole array back
4. Create the tenant's site row in the tenant app
5. Create the tenant auth pattern
6. `provisionTemplatePatterns`: pattern(s), page(s), dmsEnv/source/view/rows, site ref syncs
7. Final site update, then a full-page redirect

Problems:
- **No atomicity.** A closed tab or failed call part-way leaves a half-built tenant. Step 1 runs first,
  so the auth project already exists and the subdomain is used up for good (see the burned-subdomain
  open issue).
- **Lost-update race in step 3.** Two concurrent signups both read `tenants`, both append, and the
  second write drops the first tenant's ref. That tenant is created but unreachable ("Tenant not
  found"), and its subdomain is burned.
- **Anyone can write data.** `dms/data/create` has no auth check (noted in `tenant-subdomain-uniqueness.md`
  Phase 1), and provisioning's design depends on that: an anonymous browser writes to the master app and
  a brand-new tenant app. The same route lets anyone edit the master site from the console.
- Slow: each step waits on the one before it, so users watch a disabled button for the whole chain.

### Stage 4 — Redirect and login on the subdomain

- The redirect is a full cross-origin navigation to `<slug>.<host>/auth/login`. The session doesn't carry
  over (localStorage is per origin), so the brand-new user types their password again. *(A token handoff
  was considered and dropped from scope.)*
- A tenant subdomain boot loads the **entire master site first** just to find the tenant ref, then loads
  the tenant site (`dmsSiteFactory.jsx`, Steps 1→4). That is two full sequential site loads on every cold
  load of every tenant page, and the master's snapshot gets persisted on the tenant origin too.
- SSR used to render the master app / 404 on a tenant subdomain's first load. Already fixed
  (`tasks/completed/ssr-multi-tenant-resolution.md`, confirmed by user 2026-09-24).

### Stage 5 — First use of the tenant site

- After login, `defaultRedirectUrl` is `/`, so the user lands on the template page. As of 2026-09-23 it is
  published and mounted at `/` (see `multi-tenant.md` follow-up); before that, `/` was empty.
- **Flash of the logged-out view after reload.** `AuthProvider` starts with an optimistic
  `{ authed: true, isAuthenticating: true, groups: [] }` whenever a token is in localStorage
  (`patterns/auth/providers.jsx`). Most components treat that as "logged in, no groups" and render
  without admin controls until `getUser()` resolves. Only `view.jsx`, `edit/index.jsx` and `editSite.jsx`
  wait on `isAuthenticating`. This is the likely cause of the reported `/list` flash; **hypothesis, not
  yet confirmed live.**
- Nothing guides the new admin. There's no pointer to editing the page, the admin at `/list`, theming,
  or adding data. The template's home page is titled "Page 1" (slug `page-1`).
- **Members who sign up on a tenant subdomain can't see anything.** Regular signup →
  `/signup/assign/group` puts them in `<slug> Public` (`dms-server/src/auth/handlers/auth.js:561`).
  But template patterns grant only `<slug> Admin: ['*']` and the client-side `public: []` pseudo-group
  (`tenantProvisioning.js:137`). `<slug> Public` isn't mentioned, so `isUserAuthed` gives the member no
  permissions. *(Reviewed: intended. The admin grants access in permissions settings. No change.)*
- `/signup/assign/group` with an existing email and a *different* password falls through to a plain
  `INSERT INTO users` and surfaces a raw `duplicate key` DB error. A user already in the group gets the
  same raw error from `assignUserToGroup` (plain INSERT, no `ON CONFLICT`). The root cause is the flow:
  both signup forms assume a brand-new account and never ask whether the person already has one. User
  accounts are global across tenants, so "I already have an account" is a normal case, not an edge case.
  `initSetup` does check an existing user's password; `signupAssignGroup` doesn't.

## Proposed Changes

### Phase 1 — Server-side provisioning (correctness + security core)

- [ ] New dms-server endpoint (e.g. `POST /tenants`) that takes `{ name, subdomain, email, password, templateId }`
  and does steps 1–7 in one server transaction. Mirror the client's template/`wireSection` logic into
  dms-server with a cross-reference comment rather than `require()`-ing the client package (dms-server
  has no dependency on it).
  - Idempotent on subdomain: a retry after a dropped response finishes or returns the existing result.
  - Roll back the auth project/groups if the DMS side fails, so a failure doesn't burn the name.
  - Append to the master site's `tenants` atomically on the server (fixes the lost-update race).
- [ ] `authSignup.jsx` and `editSite.jsx` TenantList both call the endpoint instead of running the chain
  themselves. `provisionTemplatePatterns` stays for `createSite.jsx` (admin, already authed) or moves too;
  decide during implementation.
- [ ] Lock down `dms/data/create` / `edit` for anonymous callers once nothing legitimate depends on them.
  **Audit first:** other anonymous write paths (forms submissions, etc.) may rely on this.
- [ ] Return readable errors from the endpoint as plain JSON, not through Falcor, so the `[object Object]`
  bug doesn't apply to signup.

### Phase 2 — Signup form and abuse protection

- [ ] **Existing user vs new user (flow change).** Both signup forms (root-domain tenant signup and
  regular signup on a tenant subdomain) get two tabs: **"I have an account"** / **"New account"**.
  - *Existing user:* email + password only. The server confirms the password against the existing
    account before creating anything (tenant, or group membership). A wrong password is a clear
    "incorrect password" with a reset-password link, never a raw DB error.
  - *New user:* email + password + verify password (and the email-verification step below applies).
    If the email already exists, tell them and switch to the existing-user tab.
  - Server: `signupAssignGroup` compares the password for an existing user and rejects it on mismatch,
    matching `initSetup`. It also uses `ensureUserInGroup`, so re-joining is a no-op. For the tenant
    signup, `POST /tenants` (Phase 1) does the same check.
  - Open question: on the existing-user tab, should an already-logged-in user (token on this origin)
    skip the password entirely?
- [ ] Live subdomain check as the user types (debounced; a small read-only server endpoint). Fill the
  subdomain in from the organization name and show the full URL preview ("acme.tributarylab.com ✓ available").
- [ ] Password rules on both client and server: required, minimum length, show/hide toggle. Reject
  empty passwords in `initSetup` and `signupAssignGroup` on the server regardless of the client.
- [ ] Rate limit tenant creation per IP/email; add a CAPTCHA or proof-of-work on the root signup.
- [ ] Email verification before the tenant goes live (or allow it immediately but mark it unverified and
  suspend it after N days). The existing `signupRequest`/`signupRequestVerified` handlers show a
  token-email pattern that can be reused.
- [ ] Expand the reserved subdomain list (auth, login, docs, status, support, help, billing, static,
  assets, cdn, blog, email, root, …) and keep one copy shared by client and server.
- [ ] Split into two steps: account (email/password) → site (name, subdomain, template with preview).
  People who fail on a password rule shouldn't lose their site details.
- [ ] "Find my site": a root-domain lookup that emails someone the subdomains they administer, for
  people who forget their URL. Email only, so it doesn't reveal which tenants exist.

### Phase 3 — Faster and cleaner tenant boot

- [ ] Resolve subdomain → tenant without loading the whole master site: a narrow query for the one
  matching tenant ref, or a server endpoint. This removes a full site load from every cold tenant page load.
- [ ] Stop persisting the master site snapshot on tenant origins.
- [ ] Confirm the logged-out-view flash is the `isAuthenticating` optimistic state, then fix the root
  cause: permission-dependent UI waits for confirmation, or the last confirmed groups are cached with the
  token. Don't paper over it with a loading overlay.
  **Coordinate with `expired-session-shows-no-permission.md`:** it's the same optimistic
  `authed: true` token start in `providers.jsx`, seen from the expired-token side. Fix both in one change.

### Phase 4 — First run on the new site

- [ ] First-run checklist on the home page for tenant admins: add logo and colours, edit this page, add
  a dataset, see the admin. Dismissible, and it disappears once the steps are done. It exists to point
  people at the admin UI they can use themselves.
- [ ] Better templates: preview thumbnails in `SiteTemplatePicker`, real sample content, and a home page
  titled "Home" rather than "Page 1".
- [ ] Welcome email after provisioning, with the site URL, login link and a link to the first-run checklist.

### Phase 5 — Operating it

- [ ] Tenant lifecycle: decide suspend vs delete (open issue in `tenant-subdomain-uniqueness.md`) and build it.
- [ ] Log each provisioning step with the tenant slug, and record signup funnel events (form viewed →
  submitted → provisioned → first login → first edit) to see where people drop out.
- [ ] End-to-end test of the full journey against a local multi-tenant server (Playwright, `acme.localhost`
  pattern from `sync-bring-up-to-date.md`).
- [ ] Wildcard DNS/TLS runbook for new tenant subdomains. Custom domains are a later extension.
- [ ] Quotas / billing hooks (per-tenant limits on pages, datasets, rows). Scope only; don't build yet.

## Files Requiring Changes (expected)

| File | Change |
|---|---|
| `packages/dms-server/src/routes/…` (new) | `POST /tenants` provisioning endpoint; subdomain-availability endpoint |
| `packages/dms-server/src/routes/dms/dms.controller.js` | Anonymous write lockdown (after audit) |
| `packages/dms-server/src/auth/handlers/auth.js` | Password rules; `signupAssignGroup` checks existing user's password, `ensureUserInGroup` |
| `packages/dms/src/patterns/auth/pages/authSignup.jsx` | Existing/new user tabs (both branches); call endpoint; two-step form; live subdomain check; password rules |
| `packages/dms/src/patterns/admin/pages/editSite.jsx` | TenantList calls endpoint |
| `packages/dms/src/utils/tenantProvisioning.js` | Mirrored server-side |
| `packages/dms/src/ui/siteTemplates.js`, `pageTemplates.js` | "Home" page title; preview images |
| `packages/dms/src/render/spa/dmsSiteFactory.jsx` | Narrow tenant lookup; no master snapshot on tenant origin |
| `packages/dms/src/patterns/auth/providers.jsx` | Root-cause fix for the `isAuthenticating` flash |

## Testing Checklist

- [ ] Signup with each template → tenant reachable, `/` shows the home page, admin can edit
- [ ] Kill the network mid-signup → retry with the same subdomain succeeds (no burned name)
- [ ] Two simultaneous signups with different subdomains → both tenants listed and reachable
- [ ] Two simultaneous signups with the same subdomain → exactly one succeeds, the other gets a readable error
- [ ] Empty/short password rejected client-side **and** by a direct server call
- [ ] Taken subdomain shown as unavailable before submit
- [ ] Anonymous `dms/data/create` on the master app is rejected after lockdown; existing anonymous flows still work
- [ ] Existing-user tab, correct password → tenant created / group joined, no second account; verify-password field not shown
- [ ] Existing-user tab, wrong password → "incorrect password" + reset link, nothing created
- [ ] New-user tab with an email that already exists → told to use the existing-user tab
- [ ] Re-joining a tenant you're already a member of → no error
- [ ] Reload while logged in as tenant admin → no flash of the logged-out view
- [ ] Cold load of a tenant page → master site no longer fully loaded (network panel)
- [ ] Single-tenant sites unaffected
