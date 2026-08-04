# Auth: the route-chain ACL is overwritten not merged, and `dms.data.edit` has no authorization

> **Status:** DIAGNOSED 2026-07-29, **not fixed** · surfaced while working TransportNY QA ticket row
> 2197778 (landing page links to two sign-in-walled destinations). Defect B is security-relevant and
> deserves triage ahead of the original ticket.
>
> **Nothing here has been changed.** Two of the three defects need an owner decision first, and all of
> them change auth behaviour, so none is a safe unsupervised edit.

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
