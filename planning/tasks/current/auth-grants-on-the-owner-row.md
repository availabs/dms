# Grants on the owner row: retire `patterns:datasets` and put site verbs on the site row

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** built · **Release:** commit — the two sweeps run on every site before `enforce` · **Created by:** amuro@albany.edu · **Edited by:** ssangdod@albany.edu

## The rules (owner, 2026-11-05)

Three rules say how patterns, formats and rows fit together so that the auth layer stays one walk and one judge.
They are written into `src/dms/CLAUDE.md` ("Ownership and grants"), `documentation/pattern-registry.md` and the
header of `dms-server/src/routes/auth/index.js`; this task is what brings the code and the data up to them.

1. **A row's parent is named by its type path, or by a reference from a parent inside that path's container.**
   `chenango|page` belongs to the pattern `chenango` by path; a component belongs to the page whose `sections`
   lists it, by reference, stamped as `parent_id`. The reference, when present, is the nearer and wins; a
   reference to a row outside the container is refused (`routes/dms/parentId.js`). Two ways to say "belongs to",
   both first-class. Nothing moves to satisfy this rule.
2. **A rule's owner positions are resolved by walking those parents.** `self`, `parent`, `ancestor:<kind>`,
   `site`, or a list spread in order. The judge never names a kind or a pattern type.
3. **A verb is granted on the row that owns its subject.** Site-level verbs go on the site row.

## Where the code violated them (measured 2026-11-05)

- **Rule 2 — one function.** `owners.js patternsOver` resolved the position `patterns:datasets` by knowing the
  literal strings `datasets`, `dmsEnvId`, `sources`, `dmsenv` and `source`, and decided that an env no pattern
  links yet is governed by every datasets pattern of the site. The env, source, view and data rules and the
  site rule's `dms_envs` key all named the position; `ruleFor` had a second lookup through it; external
  sources needed the client to name a pattern (`?dms_pattern=`, `X-DMS-Pattern`, `patternRef` on the Falcor
  router, `patternId` through every guard) so the position had something to find.
- **Rule 3 — two reach-arounds.** `owners.js siteGrants` read the admin pattern's grants, then the auth
  pattern's, when the site row named no one: the walk going down. `auth/utils/permissions.js` judged
  `auth-users` / `auth-groups` / `view-as` on an auth pattern row the client named (`authPatternId`), with its
  own loader, cache and would-deny logger beside `authorize`. Both admin and auth types carried `publicRead`
  so their pattern rows stayed readable by type name (`undeclaredPublicRead`), because those rows held site
  verbs and so were never blank.

## The fix

Move the grants onto the owner row, as a dry-run-then-apply sweep per site, then delete the code that reached
around. The judge does not change.

### Phase 1 — site verbs on the site row (rule 3) — DONE 2026-11-05
- [x] `admin.format.js` site domain gains `auth-users`, `auth-groups`, `view-as`; `auth.format.js` user and
      group formats lose them (the auth pattern row keeps the shared pattern-row verbs only).
- [x] `patterns/index.js`: `publicRead` and `siteFallback` removed from auth and admin; the pattern rule's
      `ifOwnerBlank.unless` clause removed (a swept admin / auth row is blank, so the rule's
      `read: { anyOf: [{ blank: true }, …] }` keeps it readable with no session).
- [x] `owners.js siteGrants` = the site row's own grants. `undeclaredPublicRead` deleted.
- [x] `auth/utils/permissions.js`: `createSiteAuth({ loadSiteGrants })` replaces `createAuthGrants`; `authority`
      judges on the site row (`${app} Admin`, else the verb on the site row; under `log` a blank site row lets a
      signed-in user through with a would-deny line, as the blank auth row did). Protected groups: `*`,
      `auth-groups` or `edit-pattern-permissions` on the site row. `authPatternId` ignored.
- [x] Client: `pattern2routes` passes the site row's `authPermissions` (no admin / auth fallback); the admin
      pattern's Access tab edits the site row; `getMenuItems` and the auth manage pages gate the auth verbs with
      `siteCan`; `setAuthRequestScope({ app })`.
- [x] `scripts/sweep-site-grants.js`: admin row ∪ auth row → the site row's `data.authPermissions`
      (where every client write lands and `grantsOf` reads first), `--verify`.

### Phase 2 — retire `patterns:datasets` (rule 2) — DONE 2026-11-05
- [x] `scripts/sweep-datasets-grants.js --db --app [--apply] [--verify]`: each datasets pattern's grants →
      the env row it links (`dmsEnvId`); `edit-pattern-permissions` holders also get
      `edit-source-permissions` on the env. Additive, idempotent.
- [x] Rules: dmsenv owner `['site', 'self']` (`create: site create-pattern`, `delete: site *`, `edit`:
      `authPermissions` needs `edit-source-permissions`, else `create-source` / `delete-source`); source
      `['ancestor:dmsenv', 'self']` with `create: ['create-source']`; view and data
      `['ancestor:dmsenv', 'ancestor:source']`; site `dms_envs` key `['create-pattern']`.
      `rules.js` kept identical; fingerprint in `authRules.sync.test.js` updated.
- [x] `owners.js`: `patternsOver`, the `patterns:` branch, `ruleFor`'s second lookup and `snap.named` deleted;
      `LEGACY_POSITIONS` drop the position. New address `{ env, app }` → the env row (an internal env by the
      pattern or env instance in `app+instance`, an external one by `data.pgEnv`), for `create-source`.
- [x] `index.js` / `requestUser.js` / `routes/index.js` / `src/index.js`: `patternId`, `patternRef`,
      `requestPatternRef`, `parsePatternRef`, the `X-DMS-Pattern` header deleted. `requestApp` (`dms_app`,
      `X-DMS-App`) is the one locator.
- [x] Callers: `dama/upload/auth.js authorizePublish` judges `create-source` on the env row;
      `file-upload-dms-route.js` requires the owner to be that env (or the pattern linking it); UDA routes
      drop the `pattern` argument (still accepted, ignored).
- [x] Client: `validateAuthRules` rejects `patterns:`; `authedFetch` / `tagFalcorRequests` send `dms_app`
      only; DatasetsContext `isUserAuthed` merges the env's grants; an Access editor for the env's grants in
      the pattern settings beside the env picker.

### Phase 3 — docs and tests — DONE 2026-11-05
- [x] The three rules in `src/dms/CLAUDE.md`, `documentation/pattern-registry.md`, `routes/auth/index.js`;
      `dama/CLAUDE.md` and the format comments stop describing `patterns:` and `?dms_pattern=`.
- [x] Auth suites ported: `test-auth-permissions.js` around `createSiteAuth`; groups / users / platform
      fixtures hold grants on a site row; read / source / data / uda fixtures hold datasets grants on env rows.

## Rollout

Both sweeps are dry-run by default and leave the old data in place. Under `DMS_AUTH_MODE=log` (the default) an
unswept site keeps working: the site row is blank, so the auth handlers let signed-in users through with a
would-deny line and reads of the admin / auth rows are logged, not refused. Run on every site before switching
to `enforce`:

```
node src/scripts/sweep-site-grants.js --db <config> --app <app>            # then --apply, then --verify
node src/scripts/sweep-datasets-grants.js --db <config> --app <app>        # then --apply, then --verify
```

## Related

- [auth-layer-simplification.md](./auth-layer-simplification.md) — the walk and judge this builds on.
- [pgenv-mirror-into-dms.md](./pgenv-mirror-into-dms.md) — external sources become rows; this task already
  removes the named-pattern locator they used.
- [format-declarations-server-side.md](./format-declarations-server-side.md) — the stamp channel.

## Build log — 2026-11-05

**Server (`dms-server/src`).** `routes/auth/owners.js`: `siteGrants` is the site row's own grants;
`patternsOver`, `patternsOfType`, the `patterns:` branch of `grantsAt`, `ruleFor`'s second lookup,
`snap.named`, `undeclaredPublicRead` deleted; `LEGACY_POSITIONS` map the old datasets names to
ancestor positions; new address `{ env, app }` → the env row (a dms env by its pattern's or its own
instance, a pgEnv by `data.pgEnv`; `app+<format type>` names no row and falls back to the site row).
`routes/auth/index.js`: `requireCan` / `assertCan` take `env: true` / `env` with no source or view and
`fields`; `patternId` plumbing gone; `envRowFor` exported; the three rules in the header.
`requestUser.js`: `requestPatternRef` / `parsePatternRef` deleted, `requestLogApp` reads `dms_app`.
`routes/index.js`, `index.js`: no `patternRef`; CORS allows `X-DMS-App`, not `X-DMS-Pattern`.
`auth/utils/permissions.js`: `createSiteAuth({ loadSiteGrants })`, `authority` judges on the site row;
`auth/index.js` loads the grants through `owners.appSnapshot`. Callers ported: `uda.route.js`,
`uda.tasks.route.js` (settings.update is `edit` with `fields: ['settings']` on the env),
`uda.colorDomain.route.js`, `sourceRedaction.js`, `dama/datatypes/auth.js`, `dama/upload/auth.js`
(`create-source` asked of the env row), `file-upload-dms-route.js` (owner must be the env or the pattern
linking it), `download-routes.js`, `dama/tasks/schedule-routes.js` (a source-less schedule is an env
edit), `access-log/index.js`. `rules.js` matches the formats.

**Client (`dms/src`).** Formats: site domain gains the three auth verbs, auth's user / group domains
are empty, env rule `['site', 'self']`, source `['ancestor:dmsenv', 'self']`, view / data
`['ancestor:dmsenv', 'ancestor:source']`, site `dms_envs` needs `create-pattern`, pattern rule's
`unless` gone; `patterns/index.js` drops `publicRead` and `siteFallback`; `validateAuthRules` refuses
`patterns:`; `patternPermissionOptions(type)` only. `pattern2routes` passes the site row's
`authPermissions`; the admin pattern's Access tab loads and writes the site row; `getMenuItems` and the
auth manage pages gate the auth verbs with `siteCan` on site grants; `OpenAuthWarning` reads site
grants; `setAuthRequestScope({ app })`; `authedFetch` / `tagFalcorRequests` send `dms_app` only;
DatasetsContext `isUserAuthed` unions the env row's grants with the pattern's; the pattern settings
show an Access editor for the selected env (`UI.Permissions`, written by id through Falcor).
Fingerprint in `authRules.sync.test.js`: `bce6ede7c2b64026`.

**Scripts.** `sweep-site-grants.js` rewritten: admin ∪ auth rows → the site row's `data.authPermissions`
(reads data first, the `auth` column when data names no one; refuses to merge a per-subdomain shape).
New `sweep-datasets-grants.js`. Both exercised dry / apply / verify on a scratch app in `cli-test`.

**Tests.** Server: auth-permissions 17 (rewritten around `createSiteAuth`), groups 22, users 27,
platform 14, data-auth 66, read-auth 30, source-auth 27, uda-auth 28, upload-auth 37, access-log 14,
schedule-auth 12, datatype-auth 8, parent-id 85, auth-vocabulary 15, site-grants 8; `npm test` core
green. Client: `vitest run src/patterns src/utils` 57, `authedFetch.test.js` 4. Not run: the HTTP auth
suite (`test-auth.js`, needs a Postgres container); the env Access editor and the admin Access tab were
not opened in a browser.

**Docs.** The three rules in `CLAUDE.md` ("Ownership and grants"), `documentation/pattern-registry.md`,
`routes/auth/index.js`; `dama/CLAUDE.md` describes `dms_app` and the env row; the format comments and
`deriveAuthRules.js` no longer list `patterns:<type>`.

## Follow-ups (not in scope here)

- ~~`owners.js parentOf` names `admin` / `auth` when two rows share an instance name~~ — deleted
  2026-11-05 (owner): a duplicate instance resolves to the first row of another kind; no suite depended
  on the guess. `parent_id` (stamped for every `dms-format` child) is what removes the ambiguity;
  `parentId.js`'s reconciler reports rows that lack one.
- `verbsForFields` reads one vocabulary per declaring row, so a source verb with `fields: ['*']` claims
  every key of every kind beneath the site row (an env's `name`, a tenant's…). Pre-existing; a per-kind
  `fields` map would fix it.
- A datasets pattern with a legacy `data.sources` list and no env lends nothing now: `migrate-to-dmsenv.js`
  first, then the sweep (the sweep reports them).
- Old clients still send `dms_pattern`, `X-DMS-Pattern` and `authPatternId`; all ignored.
- **New sites still get their grants on the auth row, not the site row** (flagged 2026-11-09, ssangdod,
  while merging the tenant-hub work). `utils/tenantProvisioning.js` `createCorePatterns` writes the new auth
  row with `authPermissions: { groups: { <admin group>: ['*'], public: [] } }` (`:155`), and
  `provisionTemplatePatterns` the same on each template pattern (`:331`, a pattern row, fine); the new site
  row gets `stampSiteRow` (rules) but no `authPermissions`. Callers: `pages/createSite.jsx`, the Tenants tab
  (`components/tenantList.jsx`), tenant signup (`auth/pages/authSignup.jsx`). Access works today only because
  `${app} Admin` always passes (`isAppAdmin`), but by rule 3 that grant belongs on the site row, nothing reads
  it on the auth row any more, and every new site needs the sweep to tidy it. A site that should also grant
  another group (a staff group) has no supported place to put it at creation: the tenant hub's copy script
  (`dms-template/deploy/tenant_hub_copy.mjs`) hit exactly this for its root and now writes the root's grants
  on the site row itself. Fix: `createCorePatterns` (or the site create in its callers) writes the grant on the
  site row's `authPermissions`, and the auth row is created blank.

## Progress

- 2026-11-05: filed, built, suites green. The owner runs both sweeps (dry, apply, verify) on every site
  before switching a site to `enforce`.
