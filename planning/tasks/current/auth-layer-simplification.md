# Auth layer simplification: one judge, one walk, one mode handler

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** built · **Release:** commit — not yet committed; the stamp backfill and the deletion of `rules.js` wait on the owner · **Created by:** amuro@albany.edu · **Edited by:** —

Follows [unified-auth-api.md](./unified-auth-api.md) and the row-auth deletion of 2026-11-04 (hub:
[server-side-auth-general.md](./server-side-auth-general.md)). Design reports: "Verbs in the rows, one
merge function" (https://claude.ai/artifact/QKmF4GyzboVHSAVRwJvaCv), "How DMS Auth Decides"
(https://claude.ai/artifact/9JAi1HxJ3FAWYmGsNwuW7k), "Auth Folder Dependency Map"
(https://claude.ai/artifact/9zhXnKroVUZUoYjskTh3ry). Assessment that produced this task: session of
2026-11-04 (summarised under Current State).

## Objective

Make `dms-server/src/routes/auth` linear: a caller asks one question, one pure judge answers it from
data stamped on rows, one function applies the mode, and nothing is spelled twice. The design principle
is unchanged: **verbs, field claims and rules live in the formats and the rows, never in server
switches**, so a new row kind or a new verb is a data change.

The decision core already exists and is small (subdomain resolution, grant name-match, the rule
interpreter in `kindAuth/authJudge.js`, `verbsForFields`). This task removes the scaffolding around it.

## Scope

**In:** `routes/auth/**`, `routes/dms/dms.route.js` and `dms.controller.js` call sites, `routes/uda/*`
call sites, `routes/sync/sync.js`, `dama/upload/auth.js`, `dama/datatypes/auth.js`,
`auth/utils/permissions.js` and the auth handlers that call it, `access-log/index.js` imports; the
client gate helpers that mirror the server (`packages/dms/src/utils/auth.js`,
`utils/adminPermissions.js`, the page editor pane gates, `DatasetsContext.isUserAuthed`); the built-in
rules copy (`kindAuth/authRules.js`) and its fingerprint test.

**Out:** the auth-DB schema and the level *management* routes (`adjustAuthLevel`, token fields; owner
left them alone in unified-auth-api Phase 3); `parentId.js` / `rowAuthCaps.js` (containment, stays);
new verbs or new rules; any change to what a grant *means*. No new flags: `DMS_AUTH_MODE` stays the
one setting.

## Current State (2026-11-04)

Measured off the source the day row auth was deleted.

| Measure | Value |
|---|---|
| Lines in `routes/auth` | 2,739 across 17 files |
| Of which comment lines | 1,126 |
| Lines that actually decide (resolve, name-match, judge, verbsForFields) | ~300 |
| `logWouldDeny` implementations | 5 (+1 inline in `dama/upload/auth.js`) |
| `parseJson` / `safeJson` copies | 7 / 3 |
| `getDmsDb` copies | 4 |
| "does the user hold this verb" implementations | 3 server (`isUserAuthed`, `isUserAuthedOpen`, `holdsExplicitly`), 4 client |
| Rollout flags threaded through call sites | `wasOpen` 19 refs, `logOnly` 16, `anonWasOpen` 13, `quiet` 12, `explicitOnly` 3 |

**Where the complexity is:**

1. **Two rule sets per decision.** Under `log` most surfaces compute the new rule's verdict, then the
   OLD rule's (`isUserAuthedOpen`, `legacyAllows`) and return the old one (`sourceGuards.isUserAuthedForSource`,
   `sourceReads.holdsOnSource`, `permissions.can`). Every flag in the table above selects between them.
2. **Two machines, not one.** DMS rows: `createJudge` → `authJudge` with stamped rules + `fields`.
   Sources: `sourceSnapshot` + `sourceReads` + `sourceGuards` + `sourceAuth.decideSource` +
   `readAuth.sourceDecision`, name-matching against a hand-kept `READ_PERMISSIONS`. `authorize()` is a
   dispatcher between them by argument shape. An internal source's grants are read by three loaders
   (`readInternalSource`, `loadInternal`, `sourceChainFor` — the last has no callers).
3. **Owner lookup is a hand-written switch.** `dataAuth.resolveOwner` resolves the eight symbolic owner
   names by kind; `vocabFor` and `stampedRule` are two more switches by kind. `parent_id` and
   `childRefs` exist as data and would answer all three with one walk (the judge's own footer says so).
4. **Reads and writes are different machines.** Rules have no `read` op. `kindReadAuth.js` is a verbatim
   route extraction that still checks `pattern_type === 'auth' || 'admin'` by name, while `publicRead`
   is stamped on rows and `publicReadOf` exists with no callers. `listingBlocked` hardcodes `view-page`.
   Source reads are a third path with the owner's blank-source rule in code (`decideRead`).
5. **Layering by history.** Two lazy requires dodge a cycle (`requestUser` ↔ `sourceGuards`);
   `dataAuth` reaches out to `sourceGuards` for `sourceIdForView` and back into `kindAuth/sourceAuth`.
   `access-log` and `auth/utils/permissions.js` import `kindAuth/sourceAuth` by name for pure helpers.
   `implies` is validated, stamped and expanded but no caller ever asks for a structural verb, so it
   decides nothing.
6. **Client is a hand mirror.** Editor panes hardcode `reqPermissions` per pane instead of reading
   the stamped `fields`; `adminPermissions.patternCan`/`siteCan` hand-copy `dataAuth`'s; client
   `isUserAuthed` is the server's old rule by design; `DatasetsContext.isUserAuthed` still merges
   pattern ⊕ source although the server stopped lending (Slice K). The server keeps a built-in rules
   copy (`authRules.js`) held in sync by `authRules.sync.test.js` because the backfill
   ([auth-rules-stamp-backfill.md](./auth-rules-stamp-backfill.md)) is parked.
7. **Task/code mismatches found.** unified-auth-api Phase 3 marks `canOrLevel`, `levelCounts`,
   `levelCoversGroup`, `levelOutranks` deleted; they are defined in `auth/utils/permissions.js` with
   43 call sites in `auth/handlers/group.js` and `user.js`. Report 2 says `publicRead` replaced the
   name check; the name check is what runs.

## Proposed Changes

### Target shape

```
routes/auth/
  settings.js      DMS_AUTH_MODE, NO_CHANGE                                   (keep)
  grants.js        resolveAuthPermissions · holds(user, grants, perms) · hasGrants ·
                   merge/union · isAppAdmin — ONE of each (today's auth.js + bits of sourceAuth/sourceSnapshot)
  vocabulary.js    vocabularyOf · impliesMaps · verbsForFields · publicReadOf · childRefsOf   (keep, as authVocabulary.js)
  owners.js        the one loader: per-app snapshot of auth-bearing rows (data_items + each pgEnv's
                   sources as synthetic rows), cached 30s; grantsAt(row, position), ruleFor(row, kind),
                   mapsFor(row) — all the same parent_id walk (type path as fallback)
  judge.js         authJudge.js, with `read` as an op                           (keep)
  index.js         authorize({ row | env+sourceId | env+viewId, verb, fields, user, app, subdomain })
                   → { allow, reason } (pure) · applyMode(decision, ctx) (the only logger) · planEdit ·
                   requireCan(req, res, …) (Express) · assertCan(router, …) (Falcor)
  requestUser.js   request identity                                            (keep; drop the lazy report())
```

Target: ~6 files, roughly a third of today's lines, history moved from file headers to this task and
the hub. Every caller asks the same way; a route never learns where a source is stored.

### Phase 1 — one mode handler — DONE 2026-11-04

- [ ] `authorize` and everything under it return `{ allow, reason }` with no logging and no mode.
- [ ] One `applyMode(decision, { op, target, user, app, guard })`: `enforce` refuses, `log` writes the
      console line (deduped) + access-log row and allows. The two transport guards and `assertDataWrite`
      call it; nothing else logs.
- [ ] Delete `isUserAuthedOpen`, `legacyAllows`, `blankRowRefusal` as a separate path (fold the "blank
      row" reason into the judge's deny reason), the five `logWouldDeny` copies, `refused`.
- [ ] Delete the flags: `wasOpen`, `anonWasOpen`, `logOnly`, `quiet`, `explicitOnly`. `quiet` becomes
      calling `authorize` without `applyMode` (reply shaping in `sourceRedaction.js`, `holdsSourcePermission`).
      `logOnly` (tiles) becomes the caller passing `mode: 'log'`. `anonWasOpen` becomes
      `requireUserOrOpen` alone, which already applies the mode.
- [ ] **Design note to record:** under `log` the answer becomes "allow, log the would-deny" everywhere.
      Any surface where `log` must still refuse what the OLD rule refused is listed here and flipped
      to `enforce` instead of keeping a second rule set.

**Done when** `test-source-auth.js`, `test-uda-auth.js`, `test-upload-auth.js`, `test-datatype-auth.js`,
`test-data-auth.js`, `test-read-auth.js` pass with the old-rule assertions rewritten to the new rule,
and `grep -rn "wasOpen\|logOnly\|anonWasOpen\|isUserAuthedOpen\|legacyAllows" src` is empty.

### Phase 2 — `read` is an op in the rules — DONE 2026-11-04

- [ ] Add `read` to each kind's `ops` in the formats (page: `['view-page']` on `parent-pattern+row`;
      pattern: the four `PATTERN_READ_PERMISSIONS` on `self-pattern` with `ifOwnerBlank` → site
      `view-pattern-list`; source: `['view-source']` with a blank-owner clause meaning "read is the
      default"; site/theme/tenant/dmsenv/view/component/page-edit: whatever the owner decides — today
      they are open on read, and that is recorded as the explicit rule, not left implicit).
- [ ] `publicRead: true` in the vocabulary becomes a judge clause (`open: ['read']`), replacing the
      `pattern_type` name check.
- [ ] `listingBlocked` becomes `authorize({ row: patternRow, verb: 'read' })`.
- [ ] Delete `kindAuth/kindReadAuth.js`, `kindAuth/readAuth.js`, `sourceReads.decideRead` /
      `decideFrom`, both `READ_PERMISSIONS` lists, `auth.js isReadRequest`.
- [ ] Mirror the same `read` ops into `authRules.js` only if Phase 4 has not yet deleted it.

**Done when** `test-read-auth.js` and the pattern/page read cases in `test-data-auth.js` pass through
the judge, and `migrate-row-auth.js --diff-reads` (or a replacement) shows zero verdicts changed.

### Phase 3 — one owner loader, one walk — DONE 2026-11-04

Keep the judge; replace only the lookups. This is NOT reviving row auth: no structural-verb
expansion, no `*` clamp, rules stay keyed by kind.

- [ ] `owners.js`: per-app snapshot of every row that can carry grants, a vocabulary or rules
      (`controller.authContainers` projection, plus `:source` rows), keyed by id, with
      `parent_id` and the type path. External sources are materialised as synthetic rows
      `{ id, type: '<pgEnv>|source', parent: envRowForPgEnv, auth }` so a source is a row.
- [ ] `grantsAt(row, position)` where position ∈ `self`, `parent`, `ancestor:<kind>`, `site`.
      A translation table maps the eight stamped owner names onto positions
      (`self-pattern`→`self`, `parent-pattern`→`ancestor:pattern`, `parent-pattern+row`→
      `[ancestor:pattern, self]` spread, `self-source`→`self`, `owning-source`→`parent`,
      `source-by-slug`→`ancestor:source`, `site-grants`→`site`, `datasets-grants`→the app's
      datasets pattern rows), so rows stamped with the old names keep working without a backfill.
- [ ] `ruleFor` = nearest ancestor carrying `authRules[kind]`; `mapsFor` = nearest ancestor carrying a
      vocabulary, scope `self` if the row itself declares, else `descendants`. Both are the same walk.
- [ ] Delete `dataAuth.resolveOwner`, `vocabFor`, `stampedRule`/`stampedIn`, `siteGrants`/
      `datasetsGrants`/`contentPattern` as separate lookups; `sourceAuth.readInternalSource`,
      `readExternalSource`, `internalSourceGrants`, `decideSource`, `decidePattern`;
      `sourceGuards.sourceIdForView`; `sourceAncestry.sourceChainFor` (no callers);
      `sourceSnapshot.loadInternal`/`loadExternal` (folded into the loader).
- [ ] Measure before/after on the catalog listing (today ~1 ms warm for 71 sources) and on a page
      save; the loader must not add a query per row.

**Done when** the full verdict dump (every source × principal × verb, every DMS kind × op in
`test-data-auth.js`, `test-source-rules.js`) is identical before and after, and
`RESOLVER_NAMES` survives only in the translation table.

### Phase 4 — backfill and delete the built-in rules — BUILT 2026-11-04 (the run waits on the owner)

- [x] ~~Write and run the backfill in auth-rules-stamp-backfill.md~~ — superseded 2026-11-06: the declarations
      are registered in the server's `formats` table by `scripts/register-formats.js`
      ([format-declarations-server-side.md](./format-declarations-server-side.md)), once per site, which is
      the backfill.
- [ ] Delete `kindAuth/authRules.js`, `authRules.sync.test.js`'s "identical to the server copy" half
      (keep the fingerprint that triggers the backfill task), and `ruleFor`'s built-in fallback:
      an unstamped row fails closed with a reason naming the backfill script.

### Phase 5 — client reads the same data — DONE 2026-11-04 (gates); the client `isUserAuthed` keeps the old rule

- [ ] Extract the judge + `verbsForFields` + grant name-match into one dependency-free module usable by
      both packages (a `packages/auth-core` or a copied file with a sync test, as the two packages
      share no code today).
- [ ] Page editor pane gates derive from the stamped `fields` (which verb governs `sections`,
      `authPermissions`, `filters`) instead of hardcoded `reqPermissions`.
- [ ] `adminPermissions.patternCan` / `siteCan` become the client judge over the stamped pattern/site
      rules; `DatasetsContext.isUserAuthed` stops merging pattern grants into source grants.
- [ ] Client `isUserAuthed` adopts the blank-row rule (today it is the server's old rule on purpose,
      "until enforce"); tie it to the same switch so both sides flip together.

### Phase 6 — auth-handler permissions through `authorize` — DONE 2026-11-04 (levels gone; `can()` stays its own, see log)

- [ ] `auth/utils/permissions.js can()` → `authorize({ row: authPatternRow, verb })`; the protected-group
      rule stays as the one code clause (it is about group *names*, not rows).
- [ ] Actually delete `canOrLevel`, `levelCounts`, `levelCoversGroup`, `levelOutranks`, `levelRule`,
      `noteLevelPass`, `levelsCount`, `byLevel` and their 43 handler call sites (unified-auth-api
      Phase 3 recorded this as done; it is not). Run `audit-auth-levels.js --verify` on each app first.
- [ ] `access-log/index.js` imports `isAppAdmin` from `grants.js`, not from the implementation.

### Phase 7 — housekeeping — DONE 2026-11-04

- [ ] One `parseJson`, one `getDmsDb`, one `isDmsEnv`, one `hasGrants`, one `isAppAdmin`.
- [ ] Drop `IMPL: 'kind'`, the `kindAuth` re-export from `index.js`, the unused `cache` argument to
      `readBlocked`, the `dataAuthMode`/`readMode` aliases of `authMode`, `enforcing` vs
      `authMode() === 'enforce'` duality.
- [ ] Move the history blocks out of file headers into `server-side-auth-general.md` (hub) and this
      task. A file header says what the module does; the planning docs say why it changed.
- [ ] Update `documentation/dms-server-env.md` and `research/unified-auth-api.md` to the final shape;
      mark unified-auth-api Phases 2/3 with what this task superseded.

## Build log

### Phases 1–3 (server) — 2026-11-04

`routes/auth` is now 9 files: `settings.js`, `grants.js`, `vocabulary.js`, `owners.js`, `rules.js`,
`judge.js`, `report.js`, `requestUser.js`, `index.js`. Deleted: `auth.js`, `authorize.js`,
`authVocabulary.js`, `sourceAncestry.js`, `sourceGuards.js`, `sourceReads.js`, `sourceSnapshot.js`,
`kindAuth/` (6 files), the three `permissions-access-diff*.js` scripts and
`tests/test-permissions-blank-audit.js`.

- [x] `authorize({ row | env+sourceId | env+viewId | app+patternId, verb, fields, patch, user, app, subdomain })`
      is pure and returns `{ allow, reason, blank?, write? }`. `applyMode(decision, ctx)` (report.js) is the
      only place a refusal is logged or made to bite. Guards: `assertDataWrite` (DMS writes, throws),
      `requireCan` (Express), `assertCan` (Falcor), `canRead` / `readableSources` (reads).
- [x] Deleted every old-rule answer (`isUserAuthedOpen`, `legacyAllows`, `blankRowRefusal`, five
      `logWouldDeny` copies) and the flags `wasOpen`, `anonWasOpen`, `logOnly`, `quiet`, `explicitOnly`.
      **Design note — two knobs survive, on `applyMode`'s ctx, because the history is real:**
      `mode: 'enforce'` for DMS reads (they were enforced before the mode existed; `dms.route.js`) and
      `mode: 'log'` for tiles; `strict: true` for the surfaces that enforced a source's own grants
      before the mode existed (the external-source UDA writes, the auth-row handlers) — under `log`
      those refuse everything but a blank-row refusal (`decision.blank`), which is the one rule being
      rolled out. `requireCan({ open: true })` replaces `anonWasOpen` (the route answered anyone before).
- [x] `read` is an op in the rules. `{ blank: owner }` is a requirement form, so "a row with no grants
      is readable" is written in the rule, and the source rule names `self` there (a source is narrowed
      only by something on the source, owner 2026-10-30). `publicRead` in the vocabulary opens reads.
      A kind with no `read` op is open on read (site, theme, tenant, dmsenv, component, page-edit), which
      is what they were. A stamped rule without `read` takes the built-in's.
- [x] `owners.js`: one per-app snapshot of the container rows (`type LIKE '%:%'`, with `auth` /
      `parent_id` where the table has them) and one walk — `parent`, `parent_id`, else the type path —
      answers grants, rules and vocabulary. Positions: `self`, `parent`, `ancestor:<kind>`, `site`,
      `patterns:<pattern_type>`, or a list spread in order. The eight legacy owner names map onto them, so
      rows stamped with them keep working. External sources are rows parented to the `:dmsenv` row of
      the locating app; a client-named datasets pattern is the only pattern that reaches one.
      **Design note:** a source's owner is `['patterns:datasets', 'ancestor:dmsenv', 'self']` — the
      datasets pattern over its env still lends, for reads as for writes (it lent for writes only
      before). It leaves the list once pattern grants are swept onto env rows. `view: false` on a row
      narrows a composite to that row's own grants.
      **Design note:** `grantsOf` reads `data` first and the `auth` column when data names no one,
      because every client write lands in `data` and nothing mirrors it into the column. Follow-up:
      mirror grants into `auth` on write, then flip to column-first.
- [x] Writes read a fresh snapshot; reads use the 30 s cache, refreshed once on a miss.
- [x] Tests: the row-vs-kind differentials and the old-rule unit tests are gone (owner, 2026-11-04:
      "a lot of the tests here are from row vs kind auth and can probably be removed"). Rewritten:
      `test-source-auth.js` (grants.js + `authorize` on sources, 28 cases), `test-auth-vocabulary.js`
      (fieldMaps / verbsForFields), the read suite against `canRead`, the races in `test-data-auth.js`
      hook `owners.snapshotFor`. All auth suites green: data-auth 66, source-auth 28, read-auth 31,
      uda-auth 28, upload-auth 37, datatype-auth 8, schedule-auth 12, auth-permissions 24, access-log 14,
      parent-id 85, auth-vocabulary 15, site-grants 8.

### Phases 4–7 — 2026-11-04

- [x] **Phase 2, formats.** `page.format.js`, `admin.format.js`, `dmsEnv.format.js` carry `read` ops
      and name owners by position; `deriveAuthRules.js` validates positions (`isOwner`) and `blank`
      clauses; `authRules.sync.test.js` compares the formats with `routes/auth/rules.js` (identical) and
      its fingerprint moved to `af9a55587bf44903`, which is the backfill trigger.
- [x] **Phase 4.** `emit-auth-vocabulary.mjs` emits `rules` beside the vocabulary (`:site.rules` for the
      site-level kinds); new `dms-server/src/scripts/stamp-auth-rules.js --db --app --manifest [--apply]`
      stamps rules, vocabulary and childRefs on site, pattern and env rows — dry run by default, idempotent
      (verified on `cli-test`: 15 values written, then 0). **Not run on any site: the owner's call.**
      Until it has run everywhere the server keeps three transitional pieces, all named in the code:
      `rules.js` (the built-in copy), `ruleFor`'s fill of a missing `read` op from it, and
      `owners.js undeclaredPublicRead` (an `auth` / `admin` pattern whose vocabulary carries no
      `publicRead` key is read by its type name, with a warning). Delete all three after the run.
      **2026-11-06:** `stamp-auth-rules.js` is deleted and `register-formats.js` replaces the run
      ([format-declarations-server-side.md](./format-declarations-server-side.md)); `rules.js` and
      `ruleFor`'s fill go in its Phase 4.
- [x] **Phase 5.** `packages/dms/src/utils/authJudge.js` is a verified copy of the server's `holds`,
      `fieldMaps` / `verbsForFields` and `judge` (`authJudge.sync.test.js` compares every function body
      with its server original and fails on a difference). `adminPermissions.patternCan` runs that judge
      over the admin format's `pattern` rule (from the registry) and the grants the client holds, so the
      site `*` escape and the open-pattern clause are the server's; `siteCan` uses `holds`. The page
      editor's panes name the FIELD they edit and take their verbs from the page vocabulary's `fields`
      (`verbsForFields`), the same declaration the server judges the save by. `DatasetsContext`'s
      pattern ⊕ source merge now matches the server (the datasets pattern lends), so it stays.
      **Not done:** the client's `utils/auth.js isUserAuthed` keeps the old rule (blank row → open for a
      signed-in user); the client cannot see `DMS_AUTH_MODE`, so adopting the blank-row rule there is a
      follow-up for when sites flip to `enforce`.
- [x] **Phase 6.** `canOrLevel`, `levelCounts`, `levelsCount`, `noteLevelPass`, `levelRule`,
      `levelCoversGroup`, `levelOutranks`, `levelsByProject` and every handler branch on them are gone
      (group, user, auth, message handlers); `authority()` returns `byPermission` only; levels stay
      settable (`/group/project/adjust`, `*` on the auth row). `tests/test-auth-level-rules.js` deleted;
      the groups / users / platform / permissions suites rewritten for grants only.
      **Design note:** `permissions.js can()` stays its own name-match over the named auth row with the
      `strict` semantics (an auth row with grants always enforced them) rather than going through
      `authorize` — the auth row is addressed by `app + authPatternId` from the request body, not by a
      DMS row the server loads, and `access-log` imports `isAppAdmin` from `grants.js` now.
- [x] **Phase 7.** One `parseJson` / `isDmsEnv` / `dmsDb` / `hasGrants` / `isAppAdmin` in the auth folder;
      `settings.js` is the flag and the sentinel; the history blocks left the file headers (this task and
      the hub carry them). Docs: `src/dms/CLAUDE.md` (debt table, "Auth is the live case"),
      `documentation/dms-server-env.md`, `dama/CLAUDE.md` (helper table, Reads), `research/unified-auth-api.md`
      (superseded), `unified-auth-api.md` (done, superseded), `auth-rules-stamp-backfill.md` (triggered).

### Not done, and why

- The `patterns:datasets` component of a source's owner (pattern lending) is transitional until a
  sweep copies datasets-pattern grants onto env rows; writing that sweep was not asked for.
- Grants are not mirrored into the `auth` column on write (`grantsOf` reads `data` first). A later
  task mirrors on write and flips to column-first.
- ~~The external-source branch (`loadExternal`, the `?dms_pattern` locator, `strict`)~~ — gone 2026-11-05
  ([auth-grants-on-the-owner-row.md](./auth-grants-on-the-owner-row.md), then
  [pgenv-mirror-into-dms.md](./pgenv-mirror-into-dms.md) built). The stamp-and-manifest channel stays until
  [format-declarations-server-side.md](./format-declarations-server-side.md).
- The HTTP auth suite (`tests/test-auth.js`) needs a Postgres container (`npm run test:pg:auth`);
  Docker is not available on this machine, so it was not run. The handler suites that cover the same
  code paths directly were.

## Files Requiring Changes

**Server (dms-server/src):** `routes/auth/*` (all 17; most deleted or merged), `routes/dms/dms.route.js`
(`readBlocked`/`listingBlocked` → `authorize`), `routes/dms/dms.controller.js` (`getPatternAuthPermissions`
retired in favour of the loader), `routes/uda/uda.route.js`, `uda.tasks.route.js`, `uda.colorDomain.route.js`,
`sourceRedaction.js`, `routes/sync/sync.js`, `dama/upload/auth.js`, `dama/datatypes/auth.js`,
`dama/tiles/tiles.rest.js`, `dama/tasks/schedule-routes.js`, `dama/upload/download-routes.js`,
`auth/utils/permissions.js`, `auth/handlers/group.js`, `auth/handlers/user.js`, `access-log/index.js`,
`index.js`; `scripts/permissions-access-diff*.js`, `migrate-row-auth.js` (imports of deleted modules).

**Client (packages/dms/src):** `patterns/*/…format.js` (`read` ops), `patterns/authVocabulary.js`,
`patterns/deriveAuthRules.js` (`read` op, positions), `patterns/authRules.sync.test.js`, `utils/auth.js`,
`utils/adminPermissions.js`, `patterns/page/pages/edit/editPane/index.jsx`, `patterns/page/siteConfig.jsx`,
`patterns/datasets/siteConfig.jsx`, `patterns/admin/pages/patternEditor/*`.

**Tests (dms-server/tests):** `test-auth.js`, `test-auth-permissions.js`, `test-auth-vocabulary.js`,
`test-data-auth.js`, `test-read-auth.js`, `test-source-auth.js`, `test-source-rules.js`, `test-uda-auth.js`,
`test-upload-auth.js`, `test-datatype-auth.js`, `test-schedule-auth.js`, `test-auth-groups.js`,
`test-auth-users.js`, `test-auth-level-rules.js` (deleted with the levels), `test-permissions-blank-audit.js`.

## Testing Checklist

- [x] Every auth suite passes (2026-11-04, sqlite): data-auth 66, source-auth 28, read-auth 31, uda-auth 28,
      upload-auth 37, datatype-auth 8, schedule-auth 12, auth-permissions 20, auth-groups 22, auth-users 27,
      auth-platform 14, access-log 14, parent-id 85, auth-vocabulary 15, site-grants 8; `npm test` (core)
      green; client vitest: adminPermissions, authVocabulary, authRules.sync, authJudge.sync — 92 cases.
      Deleted with the row-vs-kind machinery: `test-permissions-blank-audit.js`, `test-auth-level-rules.js`.
- [ ] A verdict-dump differential was not run: the differential scripts were the row-vs-kind harness and
      went with it. The suites above pin the verdicts instead.
- [ ] Live, `log` mode on `rowauth-test`: page save, pattern permissions save, source update, view
      create, catalog listing, external source read, signed-out page read — would-deny lines appear
      where the rule refuses, and nothing is refused. **Not done here (no live site in this session).**
- [ ] Live, `enforce` on `rowauth-test`: the same actions with a user lacking the verb are refused with
      the judge's reason; with the verb they pass. **Not done here.**
- [x] `grep` gates: `wasOpen|logOnly|anonWasOpen|quiet:|explicitOnly|isUserAuthedOpen|legacyAllows|canOrLevel|levelCounts`
      is empty in `dms-server/src` outside `scripts/`; one definition each of `parseJson`, `dmsDb`,
      `isDmsEnv`, `isAppAdmin` in `routes/auth`; one `applyMode`.
- [x] No lazy requires and no cycle in `routes/auth` (every module requires only what is below it:
      index → owners/judge/report/requestUser → vocabulary/grants/rules/settings).
- [ ] Catalog listing and page save timings within noise of today's — not measured; a write now reads
      one container query per judge (it read two), a read uses the same 30 s cache as before.
