# `*.netlify.app` hosts serve the root site

**Initiatives:** [plat_qa_automation](../../../../../planning/initiatives/plat_qa_automation.md) · **Status:** built · **Release:** commit + push (owner), then redeploy the `qatest` draft; the dms-server copy takes effect at the next server deploy · **Created by:** rdubowsky@albany.edu · **Edited by:** —

**Project:** DMS library · **Topic:** dms-manager (site routing) · **Built:** 2026-10-16

## Objective

Make Netlify's own addresses usable. On `<site>.netlify.app` and on deploy previews
(`<id>--<site>.netlify.app`, which is what the new deploy tool's drafts are), every page 404'd. The fix lets a
person (or, later, an agent) open a draft deploy and check a change before it goes live. Split out of the
deploy task, [`one-command-deploys.md`](../../../../../planning/shared/tasks/current/one-command-deploys.md).

## Cause

`getSubdomain()` (`packages/dms/src/render/spa/utils/index.js`) takes the hostname and, in production, returns
its first label when it has 3 or more parts. It assumes the last two labels are the domain (`devtny.org`).
`localhost` already had an exception, as a one-label domain. The router then shows only patterns whose
subdomain matches; `www` and `hazardmitigation` count as the root.

For `6ad255f…--avail-dms-qa-test.netlify.app` it returned `6ad255f…--avail-dms-qa-test`. Live check on
`qa_test`, 2026-10-16:
- Root-bound patterns (Auth 2, Pages 3/5/7, QA 251) didn't match, so they 404'd.
- `*` patterns (Admin 125, Datasets 194) matched, but sent a signed-out visitor to `/auth/login`, which 404'd.
- The API worked throughout. It was routing only.

## Change (owner, 2026-10-16: hard-code it the same way `localhost` is, no new `.env` setting)

A hostname ending in `.netlify.app` has no subdomain, so it serves the root site. The same one-line exception
goes into every copy of the rule, since two of them say they mirror `getSubdomain()`:

- [x] `packages/dms/src/render/spa/utils/index.js` `getSubdomain()`: routing.
- [x] `packages/dms/src/utils/subdomainPath.js` `getBaseHost()`: `sub://` links and the retired-subdomain
  redirect. There's nothing to strip on a Netlify host.
- [x] `packages/dms/src/patterns/admin/pages/editSite.jsx` `getSubdomainFromHost()`: multi-tenant admin.
- [x] `packages/dms-server/src/index.js` `getSubdomain(req)`: the subdomain the server reads from a request's
  Origin. It takes effect only when dms-server is redeployed. Until then, the production server still reads a
  draft's origin as subdomain `<id>--<site>`. That's harmless for `qa_test`, whose patterns have no
  per-subdomain permissions.

**Scope of the behavior change:** only hosts ending in `.netlify.app`. On those, root pages 404'd before, so
nothing that worked can break, unless a site binds a pattern to its own Netlify site name. None is known; that
wasn't checked against the DB (VPN off).

## Testing

**Verified (2026-10-16):**
- [x] `packages/dms/src/render/spa/utils/getSubdomain.test.js`, new, 6/6 pass
  (`npx vitest run src/dms/packages/dms/src/render/spa/utils/getSubdomain.test.js`). It covers today's
  behavior (production hosts, `localhost`, ports, bare IPv4) and the Netlify cases, for `getSubdomain()` and
  `getBaseHost()`.
- [x] `node --check` on `dms-server/src/index.js`.
- [x] **End to end, without a server.** A working-tree `qa_test` build was served by Playwright request
  interception at the fake host `6ad255f063360337c704f7bc--avail-dms-qa-test.netlify.app`, with API calls going
  through to `dmsserver.availabs.org`. The harness is `netlify_host_check.mjs`, in the 2026-10-16 session's
  scratch folder.

  | Path | `master` build (no fix) | Working tree (fix) |
  |---|---|---|
  | `/` | 404 | sign-in page (redirect, signed out) |
  | `/auth/login` | 404 | sign-in page |
  | `/qa_move_check` | 404 | sign-in page (redirect) |
  | `/list` | 404 | sign-in page (redirect) |

  The "no fix" column reproduces exactly what the owner saw on the real draft.

**Still to check:**
- [ ] After the owner pushes: `npm run deploy -- qatest` (add `--dms <branch>` if pushed to a branch), then sign
  in on the real draft and open `/qa_move_check`.
