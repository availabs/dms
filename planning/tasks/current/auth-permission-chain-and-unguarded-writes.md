# Auth: the route-chain ACL is overwritten not merged, and `dms.data.edit` has no authorization

> **Status:** DIAGNOSED 2026-07-29, **not fixed** · surfaced while working TransportNY QA ticket row
> 2197778 (landing page links to two sign-in-walled destinations). Defect B is security-relevant and
> deserves triage ahead of the original ticket. **Defect D added 2026-09-05**: a concrete, fully
> reproduced real-world consequence of this same territory — `report_build.mjs`/the DMS CLI silently
> corrupts a page's sections when run without an auth token against a permission-gated pattern. See
> that section for the mechanism, evidence, and mitigation options. **Its script-level mitigation
> (report_build.mjs auto-mints an auth token) is APPLIED + verified 2026-09-05** — the general
> CLI-level fix is not.
>
> **Nothing here has been changed for defects A-C.** They need an owner decision first (auth behaviour
> change). Defect D's script-level mitigation is applied (see its section); its general CLI-level fix
> is not — flagged for Ryan's prioritization.

## Provenance of every claim below

- **Confirmed by reading the code in this repo (me, directly):** defect A's mechanism, defect B's
  absence of any authorization on the write path, and the placement of `authPermissions` in the
  datasets vs page `siteConfig`.
- **Measured by a subagent, not independently re-verified:** the anonymous falcor read volumes, the
  "any logged-in user passes" leak, the unguarded `uda.sources.*` routes, the upload `user_id`
  handling, and the 8-pattern/5-app blast radius. Treat these as strong leads, not settled facts.

---

## Defect A — `authPermissions` is overwritten down the route chain (the ticket's root cause)

`dms-manager/_auth.js:3-13`, in `defaultCheck`'s `getReqAuth` reduce:

```js
return configs.reduce((out, config) => {
  let reqPermissions  = config.reqPermissions  || [];
  let authPermissions = config.authPermissions || {};
  return {
    reqPermissions: [...new Set([...reqPermissions, ...out.reqPermissions])],  // UNIONED
    authPermissions                                                            // OVERWRITTEN
  }
}, { reqPermissions: [], authPermissions: [] })
```

`reqPermissions` accumulates across the chain; **`authPermissions` is a bare assignment**, so the last
config wins. `getActiveConfig` (`dms-manager/_utils-core.js:26-42`) returns `[parent, ...children]`, so
**any child route that omits `authPermissions` blanks the pattern's whole ACL to `{}`.**

`defaultCheckAuth` (`_auth.js:40-53`) then evaluates the accumulated requirement against an empty ACL,
resolves no permissions, and `navigate('/auth/login')`.

The datasets pattern sets `authPermissions` **only** on its top route, next to the requirement
(`patterns/datasets/siteConfig.jsx:103-104`, `reqPermissions: ['view-sources']`), and never repeats it
on children. The page pattern works **only because it repeats it** on its children
(`patterns/page/siteConfig.jsx:150`, and per the subagent :194 and :212).

**Two symptoms, opposite directions:**

1. Anonymous users are walled out of routes that were meant to be public — the reported bug. Proof the
   obvious data-side fix is a dead end: pattern **2186526** already grants
   `public: ["view-sources"]` (set 2026-07-27) and is *still* walled.
2. Because the two branches of `defaultCheckAuth` disagree — `sendToLogin` requires **all** of the
   unioned requirement (`.every`, `_auth.js:41`) while `sendToHome` requires only **any** (`.some`,
   `:46`) — a child route's extra `reqPermissions` blocks anonymous correctly but still **admits any
   logged-in user** holding just one permission from the union. Subagent-measured (module level) for
   `/auth/manage/users`, `/auth/manage/groups`, and datasets `/create`, `/settings`, `/tasks`.

Fixing A is not a one-liner precisely because it moves behaviour in both directions at once: routes
that currently redirect would start rendering, and routes that currently admit any signed-in user
would start refusing. It needs the product decision below plus per-route intent.

## Defect B — `dms.data.edit` performs no authorization at all

**This is the finding to look at first.**

`routes/dms/dms.route.js:421-435` — the `dms.data.edit` handler passes `this.user` straight into
`controller.setDataById(id, data, this.user, app, type, this.reqMeta)` with no check of any kind.

`routes/dms/dms.controller.js:689-727` — `setDataById` uses `user` for exactly one thing:

```js
const userId = get(user, "id", null);   // …then only ever used as `updated_by`
```

…and runs `UPDATE ${table} SET data = jsonMerge(...) WHERE id = $3` unconditionally. So **the identity
of the caller affects only the audit column, never whether the write is allowed.** An unauthenticated
caller yields `userId = null` and the UPDATE still executes.

Note the asymmetry: the *read* path `dataByIdResponse` (`dms.route.js:30-55`) does gate, but only for
`kind === 'pattern'` and `kind === 'page'`. So a write is applied and only the echoed response is
filtered — the damage is already done.

Subagent-reported (not re-verified here): `uda.sources.update` / `delete` / `hardDelete`
(`uda.tasks.route.js:248,275,295`) are likewise unguarded, and `dama/upload/file-upload-route.js:50`
takes `user_id` from the request body.

**Before believing the worst case, verify safely:** the subagent's test targeted a *nonexistent* id, so
"the call returned normally" does not prove a real row would be written. The code reading says it would.
Confirm on a throwaway row in a scratch app — **not** on live content — before deciding severity.

## Defect C — the permission vocabulary has no way to grant `view-sources`

`view-sources` appears in exactly one place in the codebase: as a *requirement*
(`patterns/datasets/siteConfig.jsx:104`). It exists in **no** grant vocabulary — the pattern permission
editor (`patterns/admin/admin.format.js:117-127`, bound to a constrained multiselect at
`ui/components/Permissions.jsx:148`) offers only page permissions regardless of pattern type. So even
with defect A fixed, an author cannot grant this through the UI; the 2186526 grant had to be written
directly to the row. Per this repo's author-empowerment principle, that gap is itself a defect.

## The product decision this is blocked on

**Is the data-source catalog meant to be publicly readable?** The TransportNY landing page promises it
twice ("free for public read"; "Public-read access requires no account") and the Freight Atlas card
advertises "the full freight data catalog". But the datasets pattern is a dual-role surface that also
hosts creation, uploads, settings and the ETL task queue. Until the owner answers, "make datasets
public" is not a safe instruction.

A read-only public subset **is** feasible: keep `view-sources` on the parent, fix the ACL drop, and gate
the admin pages in-component with `isUserAuthed([...])` the way `SourcePage` already does. Routes that
would need gates added (subagent-reported as currently ungated in-component): `create` (CreatePage),
`settings` (SettingsPage), `tasks` / `task/:task_id` (UdaTasks/UdaTaskPage), plus a decision on
`internal_source/:id/...`. Already gated in-component: `source/:id/...` (`overview.jsx:69`, `Map.jsx:42`,
`table.jsx:144`, `ExternalVersionControls.jsx:404`, `SourceAccessEditor.jsx:22`). Note
`DatasetsList/index.jsx:320,323` hides Settings/Add behind `user?.authed` only — presence of a session,
not a permission.

## Recommended sequencing

1. **Triage defect B on its own merits** — it is independent of the product question and of defect A.
   Any read-gating work is moot while writes are unauthenticated.
2. **Answer the product question**, then fix A with per-route intent + in-component gates for the admin
   pages, and close C so the grant is expressible in the UI.
3. **Unblock the landing page separately and immediately** — see ticket 2197778. The front-door fix
   (stop offering anonymous visitors two links that demand a login, and qualify the "no account" copy)
   has zero blast radius and does not wait on any of this.

## Blast radius if A or C is changed in the library

Subagent-reported: 8 datasets patterns across 5 apps — npmrdsv5 `1700711` / `2100298` / `2186526`,
mitigat-ny-prod `1499610` / `2248246`, dms-site `1676363`, landbank "Data", wcdb `1685618`. Confirm
before touching shared code.

## Defect D — 2026-09-05: a concrete, reproduced consequence — the CLI silently corrupts pages when
its own internal reads get gated by defect A/B's read-side check

Found and fully reproduced (not theorized) 2026-09-05 while verifying `dynamic-reports-authoring-gaps.md`
item 1 against a scratch page built via `scripts/npmrds-reports/report_build.mjs`. Directly caused
`report_build.mjs` (a heavily-relied-on TransportNY script) to silently build a page missing its
header/RRL sections, with zero errors anywhere in the pipeline.

**Mechanism, confirmed end-to-end:**

1. `dms section create` (`src/dms/packages/dms/cli/src/commands/section.js:181`) attaches a new
   section to a page by doing its own read-modify-write: `fetchById(falcor, app, pageId, ['id','data'])`
   → read current `draft_sections` → push the new entry → write the whole array back. Several other
   CLI commands do the identical shape — `page.js` (lines 98/137/251/274/292), `raw.js:32/162`,
   `section.js`'s own `delete`/`update` (lines 90/120/234/264) — all exposed to the same failure mode.
2. That `fetchById` goes through `dataByIdResponse` (`dms-server/src/routes/dms/dms.route.js:30-115`,
   this doc's defect A/B territory) — the SAME read-side gate already documented above. `npmrdsv5`'s
   `npmrds_sub` pattern (row `2100394`) restricts `view-page` via `authPermissions` to specific
   users/groups. `dataByIdResponse` gates on `if (user !== undefined && row.type)` — and
   `dms-server/src/index.js:205` always resolves `user` to `null` (never bare `undefined`) for an
   unauthenticated request, so `null !== undefined` is `true` and the gate fires for **any**
   unauthenticated caller, CLI included. A gated response returns the literal **string** `"no-access"**
   for the `data` attribute (`dms.route.js:110`), not an error and not a 403.
3. The CLI's `parseData()` (`src/dms/packages/dms/cli/src/utils/data.js:36`) does
   `JSON.parse("no-access")`, which throws, and its `catch` returns the string **unchanged** rather
   than surfacing the failure. `pageData.draft_sections` (a property read on a *string*) is
   `undefined`, silently falls back to `[]`, the new section gets pushed onto that empty array, and
   the 1-element result is written back as the page's **entire** `draft_sections` — every previously
   attached section (header, RRL, earlier graphs) is gone. No exception anywhere in the chain; both
   the section-create call and the page-edit call report success.

**Confirmed live** (`/home/ryan/.claude/jobs/13f1afb6/tmp/debug_fetch.mjs`, a throwaway script calling
the CLI's own `fetchById` directly): identical request without an auth token returns
`{"id":"no-access","data":"no-access"}`; the exact same request with a freshly minted dev token
(`scratchpad/npmrds-sub/mint_token.sh`) returns the real row, `draft_sections` included.

**Why this looked "new" but isn't — and why nothing live is currently affected:** `report_build.mjs`'s
own `dms()` helper (line 226) has **never** passed an auth token — this isn't a recent break in a
previously-safe script. Whether a past run corrupted a page has always come down to pure luck: whether
`DMS_AUTH_TOKEN` happened to be exported in whatever shell ran it. Checked directly: the ~30 real
reports built 2026-09-02 and all 12 catalog Dynamic Report templates have healthy, fully-attached
`draft_sections`/`sections`, and their `created_by`/`updated_by` columns show a real user id (993) —
whoever ran those builds had a token in their environment. My scratch page's `created_by`/`updated_by`
are both `null` — this session's shell never had one. **Nothing live was found to be corrupted** by
this pass; the exposure is to *future* runs from an environment without the token set (a fresh shell,
CI, a background agent session — exactly what happened here).

Likely why read-gating specifically bit *this* session and not earlier CLI-driven builds even before
2026-09-02: `dataByIdResponse`'s gate only fires `if (user !== undefined && row.type)` — if `type`
wasn't always included in the fetched attributes, `row.type` would be missing and the gate would
silently no-op, letting an unauthenticated read through with real data as a side effect. The
2026-09-02 commit (`21e7d011`, author Alex) added a comment right at this spot — "The auth check keys
off row.type — always fetch it... otherwise skips the check and leaks restricted rows" — i.e. it looks
like a deliberate close of that exact leak. Plausible net effect: unauthenticated CLI reads that used
to work *by accident* (missing `type` bypassing the gate) now correctly get gated — surfacing this
CLI-side landmine for the first time, rather than the gate itself being new. Not independently
confirmed by diffing pre/post behavior; flagged as the most likely explanation, not a certainty.

**This is a different angle on the same defect A/B territory above, not a separate root cause**: the
write path (`setDataById`) has zero authorization (defect B) — a corrupted write succeeds fine
regardless of auth. The read path's gating (part of defect A's territory) is what returns `"no-access"`
instead of real data for an unauthenticated caller. Defect D is what happens when CLI automation (which
was never built with a "service account" concept) collides with that read gate: silent data loss, not
a visible error, because `parseData`'s string-fallback branch has no way to distinguish "genuinely a
non-JSON string value" from "an access-denied sentinel disguised as a string."

**Mitigations:**
- **Script-level, contained — APPLIED 2026-09-05** (Ryan's call: "doesn't fix the root bug but fixes
  our stuff"). `report_build.mjs` now always mints a fresh dev token at startup
  (`execFileSync('bash', [mint_token.sh path])`, failing loudly via the script's existing `fail()` if
  minting itself fails) and passes it as `--auth-token` on every `dms` CLI call the script's `dms()`
  helper makes — no more reliance on whatever the calling shell happens to have exported. Deliberately
  mints fresh every run rather than reusing the token file if present, since a stale token risks the
  identical silent-corruption failure, just intermittently. **Verified end-to-end**: ran the script in
  a fully clean environment (`env -u DMS_AUTH_TOKEN -u DMS_HOST -u DMS_APP -u DMS_TYPE`) against a
  throwaway spec — the built page's `draft_sections` had all 3 sections attached (was 1 before the
  fix, reproduced on the same clean-env setup) and `created_by`/`updated_by` showed a real user id
  (993, not null). Test page deleted after verification. This fixes `report_build.mjs` specifically;
  it does **not** fix the underlying CLI/library gap below, which any other CLI-driven automation
  (or a future script) can still hit.
- **CLI-level, general — not yet applied, flagging for a decision**: `parseData()` and/or every
  read-modify-write call site should detect the `"no-access"` sentinel specifically (or more generally:
  assert `typeof pageData === 'object'` after parsing) and throw a clear error instead of silently
  falling through to `{}`/`[]`. This is the fix that protects every CLI command with this shape
  (`page.js`, `raw.js`, `section.js`), not just `report_build.mjs`'s call sites, and doesn't require
  resolving the broader "should the CLI have a service-account auth mode" question first.

**Cross-reference**: `planning/transportny/tasks/completed/dynamic-reports-authoring-gaps.md` (where this
was found) and its memory note
`~/.claude/projects/-home-ryan-code-dms-template/memory/project_report_build_mjs_draft_sections_gap.md`
(written before the root cause was known — superseded by this section, not deleted, since it still
records the originally-observed symptom accurately).
