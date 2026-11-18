# Auth: `reach` on a row — switch off inheritance, switch off the admin override

**Initiatives:** [tes_chat_pattern](../../../../../planning/initiatives/tes_chat_pattern.md) · **Status:** doing · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

Let a row say "only the people named on me": a general way to switch off the two things that reach a
row without naming anyone on it. Asked for by chat's direct messages, which must be truly private, including
from site admins (`dms-template/planning/tessera/tasks/current/chat-direct-messages.md`), and designed
as a general auth primitive rather than a chat feature (owner, 2026-11-18). Must be fully backwards
compatible: every row without a `reach` behaves exactly as today (owner, 2026-11-18).

## The two ways in today

| | How it reaches a row | Where |
|---|---|---|
| **Inheritance** | a rule's owner positions spread the grants of the rows above (`ancestor:dmsenv`, `parent`, `site`), so a `*` on an env reaches every source in it | `owners.js grantsAt`, the rules (`rules.js`, the formats) |
| **The admin override** | a member of `<app> Admin` is allowed everything before any rule is read | `routes/auth/index.js authorize` (`isAppAdmin` → allow), `siteCan`, `auth/utils/permissions.js` |

Inheritance can already be cut on a SOURCE: `view: false` in its grants means "my own grantees only,
nothing lent to it" (`owners.js grantsAt`; tests `test-read-auth.js`, `test-pgenv-auth.js`). The admin
override cannot be cut at all.

## Design

A `reach` object beside the grants, inside the same `authPermissions` / `auth_permissions` value. Named
`reach` (owner, 2026-11-18): it says what reaches the row, and unlike "policy" the word is not already
used for anything else in DMS.

```js
auth_permissions: {
  users: { "12": ["view-source", "edit-source-data"] }, groups: {},
  reach: { inherit: false, override: false },
}
```

| Switch | Absent (today) | `false` |
|---|---|---|
| `inherit` | grants of the rows above apply | only this row's own grants apply, for this row and everything under it |
| `override` | `<app> Admin` is allowed everything | the admin shortcut does not apply to this row or anything under it; admins need a grant like anyone |

`override` takes only `false` (or is absent) in this task; see Future directions for an audited mode.

### The four cases, and why two switches

| `inherit` | `override` | Means | Example |
|---|---|---|---|
| (absent) | (absent) | today | every existing row |
| `false` | (absent) | only the people named here; site admins can still help | a PII dataset in a folder that grants every planner; a private draft page — if its people leave, an admin can recover it |
| (absent) | `false` | a team space site admins can't read | an HR folder granting the HR group, every document inheriting it, IT staff kept out; a client's confidential space on the hub |
| `false` | `false` | exactly these people, nobody else, ever | chat DMs |

One `private` key would force both: losing admin recovery wherever inheritance is cut (a row whose
named people leave becomes unreachable forever), or losing inheritance wherever admins are excluded
(every HR person named on every document). The two answer different questions — where the row sits vs.
who is an admin — and the cost of the admin switch, no recovery, should only be paid on purpose.

**Presets in the editor** (the raw switches stay in the data): *Normal* (both on) · *Only people named
here* · *Hidden from site admins* (warns that admins can't help) · *Private* (both off; DMs).

- **Found by walking up.** The effective `reach` of a row is read along the same ancestry the owner
  positions already walk (self → parent / source → env → pattern …): `inherit: false` on an ancestor
  cuts every owner position above it; `override: false` on the row or any ancestor removes the shortcut.
- **Inside the grants, on purpose.** Changing its `reach` is a grants edit, so it needs whatever verb
  the row's rule already requires for its grants (`byKey: { authPermissions: […] }`). Once
  `override: false` is set, the admin shortcut no longer helps with that edit either: only people the
  row names can change it, and a row that names nobody with that verb (a DM) is fixed.
- **Generic.** The core reads data on the row; it never names a kind or a pattern. Any pattern sets it
  on create; an author sets it in the Permissions editor.
- **Guard rail.** `override: false` is refused on site and pattern rows (it would lock the admins out of
  the site); content rows only.

## Backwards compatibility (a requirement, not a phase)

- **No `reach` = today.** A row with no `reach` key — every row that exists — is judged exactly as now.
  Both switches default to "on". The new code paths only run when a `reach` is present.
- **`view: false` keeps working** as `inherit: false`, read forever; nothing is migrated. New writes may
  use `reach.inherit`, and the server treats either as the same thing.
- **Stored as is.** The server keeps unknown keys in a grants object (`grants.js storedGrants`), and the
  Permissions editor clones the value before adding to it (`ui/components/Permissions.jsx applyChanges`),
  so a `reach` survives an ordinary grants edit by an old client.
- **Writers that rebuild grants from scratch** would drop it. Audit every place that writes a new
  `{ groups, users }` object over an existing one (e.g. chat's `setChannelGrants` callers,
  `ChannelSettingsDialog`, dataset grant editors) and make them carry `reach` through.
- **Readers that walk the keys** of a grants object must ignore `reach` (it is not a group or user
  kind): audit `Object.entries(grants)` / `for (kind in …)` loops on both sides.
- **Order of deploys.** A server that predates this ignores `reach`, so it fails OPEN: a private row
  would be readable on an old server. The server ships first; a client only offers the switches (and
  chat only creates DMs) when the server says it supports them (a capability flag, e.g. on the
  formats or a `/auth/capabilities` read).
- **Tests prove it:** the full existing auth suites pass unchanged; new tests cover each switch, the
  walk, `view: false` equivalence, the guard rail, and a grants edit by an old-shaped client keeping
  its `reach`.

## Future directions (not in this task)

- **Audited admin access** (owner, 2026-11-18: out of scope, worth keeping): a third `override` value,
  `'audit'`, where admins are still allowed in but every such access is recorded (the access log already
  exists, `dms-server/src/access-log`) and visible to the row's own grantees, e.g. "a site admin opened
  this on Nov 18". Suits compliance and break-glass support: admin rescue stays possible, but never
  silent. Fits the same walk and the same editor presets ("Site admins can open this, logged").

## Phases

### Phase 1 — server — DONE (2026-11-18)
- [x] `grants.js`: `reachOf(grants)` (reads `reach`, and `view: false` as `inherit: false`), plus
      `carryReach(stored, next)` (a grants value that leaves `reach` out keeps the stored one)
- [x] `owners.js`: `rowReach(row)` (one row's own reach, from the top level, the subdomain entry and
      either scope bucket) and `reachFor(snap, row, {op})` → `{ inherit, override, cut, limited }`, the
      effective reach along the same walk (`ancestors`) the owner positions take; a create is judged
      without its own payload. `grantsAt` resolves positions through `positionGrants`, which returns
      null for any row above the cut (the cut row's ancestors), and marks what it returns with the
      effective `reach`. Replaces the source-only `view: false` "narrowed" branch. No kind is named.
- [x] `index.js authorize`: the `isAppAdmin` allow runs only when `reach.override`; every decision on a
      reach-limited subject carries `reachLimited: true`, which `report.js applyMode` enforces under
      every mode (and over a surface's own `mode: 'log'`). `isBlank` is false under any limited reach.
      `publicRead` doesn't open a reach-limited row. Every other path: see "The admin shortcut, path by
      path" below.
- [x] Guard rail: `sealRefused` in `authorize` refuses a create/edit SETTING `override: false` when the
      row's rule (declared, or the built-in copy) says `adminAlways: true` — added to the `site` and
      `pattern` rules in `rules.js` and `admin.format.js` (kept identical, declarations.test.js passes).
- [x] Capability flag: Falcor `dms.capabilities` → `$atom({ reach: true })` (`dms.route.js`
      `SERVER_CAPABILITIES`). An older server answers an empty atom (checked against the hub before
      the restart).
- [x] Upload route (`file-upload-dms-route.js`): new multipart field `auth_permissions` (JSON object:
      `groups`/`users` maps, `reach` object) written on the NEW source's row in its create;
      `parseGrantsField`; refused (400) with `source_id` (an existing source) or malformed; `metadata`
      still refuses access keys. Judged as the create it is part of (`create-source` on the env,
      `authorizePublish`); the view row is created under it and inherits the reach by the walk.
- [x] Old-shaped writers on the server: `assertDataWrite` → `withStoredReach` (every DMS edit: Falcor
      `dms.data.edit`, sync push, owner deletes); `uda.controller updateSource` (UDA `sources.update`, DMS
      and pgEnv sources); `sweep-datasets-grants.js` / `sweep-site-grants.js` keep `reach` / `view`;
      `auth/utils/siteGrants.js` (strike a leaving user from every grant) accepts `reach` / `view` and
      skips them as subdomain keys (before: such a grant was "malformed" and the user kept it).
- [x] Tests: `tests/test-auth-reach.js` (31 tests, in `npm test` and `npm run test:auth-reach`)

### Phase 2 — client — DONE (2026-11-18; not checked in a browser)
- [x] `UI.Permissions`: the four presets (UI.Button `permInherited` / `permInheritedQuiet` styles, a
      radiogroup) and the two switches under them (UI.Switch: *Use access from above*, *Let site admins
      in*); *Site admins can't open or recover this.* when `override` is off. Shown only when
      `useServerCapabilities().reach` (prop `reachSupported` overrides). Prop `reachSwitches` limits
      them: the pattern Access tab passes `['inherit']`, the site row `[]`, the section menu `[]`
      (section reads are open on the server). Theme keys `reach*` in `Permissions.theme.js`. Turning
      `inherit` back on drops a stored `view`; turning both on sends `reach: {}` once a reach was
      stored (the server keeps a reach a save leaves out).
- [x] Capability on the client: `utils/serverCapabilities.js` (store + `useServerCapabilities`),
      `api/index.js loadServerCapabilities(falcor)`, called by `dmsSiteFactory()` at boot.
- [x] Client judge copy: `utils/authJudge.js` gains `reachOf` (in `authJudge.sync.test.js`'s list) and
      `judgeEnv`'s `isBlank` matches the server's.
- [x] Datasets client gate (`datasets/siteConfig.jsx isUserAuthed`): the `isAppAdmin` pass and the
      env inheritance follow the source's / env's reach.
- [x] Sync client (`sync-manager.js`): a `dataOmitted` change that isn't a split row (a reach-limited
      row's notification) triggers `revalidateNow()` instead of a merge.
- [x] Carry `reach` through every grants writer found in the audit (below)
- [x] Docs: `documentation/admin-permissions.md` "Reach" section and the sync bullet;
      `dama/CLAUDE.md` (`view: false` → `reach.inherit`, the admin sentence);
      `routes/sync/CLAUDE.md` Auth; `extension-points.md` (`adminAlways` on the formats row)

## The admin shortcut, path by path (2026-11-18 audit)

Every place the server or client short-circuits on `<app> Admin`:

| Path | What it covers | Now |
|---|---|---|
| `routes/auth/index.js authorize` | every row decision: Falcor reads (`dms.route.js dataByIdResponse`, `listingBlockedFor`) and writes (`assertDataWrite`: `dms.data.edit/create/delete/massedit`, `dms.type.edit`, sync push, owner deletes), UDA reads (`canRead`/`readableSources`: catalog, `sources/views.byId`, data, `dataById`, color domains), UDA writes (`assertCan`), `requireCan` (upload / publish / datatype plugin routes, downloads' `authorizeViewAction`, schedule routes, delete), `download-routes.js signDownload`, `sourceRedaction.js`, `holdsSourcePermission`, `requirePatternAction` | the shortcut runs only when `reachFor(...).override`; decisions on reach-limited rows are enforced (`reachLimited`) |
| `routes/auth/index.js requireCan` (anonymous on an `open` route under `log`) | `requireUserOrOpen` let an anonymous caller through without judging | judged when the subject resolves: a reach-limited subject refuses (401) |
| `routes/auth/index.js siteCan` | site-row verbs only: themes (`appSettings`), tenants, domains, `requirePatternAction`'s `sitePerms` | unchanged: the subject is the site row, which can't refuse the override (`adminAlways`) |
| `auth/utils/permissions.js can` / `canManageGroup` | users and groups (site-row verbs) | unchanged, same reason |
| `access-log/index.js` | `GET /dms-admin/:app/access-log` | unchanged: a site-level read |
| `dama/tiles/tiles.rest.js` (`mode: 'log'`) | vector tiles | not an admin shortcut, but its forced `log` let any read through: a reach-limited source's tiles are now enforced (they need a signed-in request) |
| `routes/sync/sync.js` bootstrap / delta | no per-row read check at all (only `DMS_SYNC_AUTH`) | reach-limited rows judged per caller (`reachableRows`); delta on the row's current grants |
| `routes/sync/ws.js notifyChange` | broadcast to every subscriber of the app; the socket knows no user | a reach-limited row goes out as a notification without `data` (`stripReachLimited`), on a per-app chain so order holds |
| C `patterns/datasets/siteConfig.jsx isUserAuthed` | which datasets controls the UI shows | follows the source's / env's reach (UI only; the server decides) |
| C `utils/adminPermissions.js isAppAdmin` / `siteCan` / `patternCan`, `permissionsEditor.jsx` | admin panel, site and pattern rows | unchanged: site / pattern rows can't refuse the override |

**Not covered (pre-existing gaps, not admin shortcuts — each needs its own task before chat DMs ship
files or pages that must be private):**
- Files from the upload routes are served by path at `/files/…` (`express.static`), unjudged; the path
  holds the source and view ids.
- Yjs collaboration rooms (`/sync/subscribe` `join-room`) hand out a row's room state to anyone.
- `dms.search[…]` (tags) and `dms.data[…].sections` return content without a per-row read.
- A component (section) row has no `read` op (open on read), and its walk goes to the pattern, not the
  page that lists it (the snapshot holds container rows only), so a page's reach does not reach its
  sections on the server.

## The grants-writer and key-loop audit (2026-11-18)

| Writer / reader | Shape | Done |
|---|---|---|
| C `UI.Permissions` (every Access editor: page pane, section menu, source Access, pattern Access, chat channel settings) | clones the value | already carried; now also edits it |
| C `permissionsEditor.jsx` (pattern / site Access) | loops subdomain keys | skips `reach` / `view` (`GRANT_META_KEYS`, `utils/auth.js`) |
| C `datasets/siteConfig.jsx` | merges for the UI gate | reads reach (above) |
| app `src/patterns/chat` `setChannelGrants` (fed by `ChannelSettingsDialog` → `UI.Permissions`, which clones), `uploads.js withUploadHolders` (structuredClone of the stored value), `channelGrants` / `envGrants` (new rows only), `resolveGrants` (read-only) | — | nothing drops `reach`; no chat change. Note: chat's channel settings now show the presets (UI.Permissions default) when the server has the capability |
| app `src/patterns/qa/install.js`, transportny `AddPageButton` / `newReportPage` | new rows | nothing to carry |
| S `assertDataWrite` (all DMS edits) | patch replaces a grants key whole | `withStoredReach` |
| S `uda.controller updateSource` | writes `auth_permissions` whole | `carryReach` |
| S `scripts/sweep-datasets-grants.js`, `sweep-site-grants.js` | rebuilt `{ groups, users }` | keep `reach` / `view` |
| S `auth/utils/siteGrants.js` | key loop, well-formedness | accepts / skips `reach`, `view` |
| S `scripts/setup-app.js`, `audit-auth-levels.js`, `migrate-auth-grants.js`, `backfill-view-pattern.js`, `convert-grant-vocabulary.js` | spread the stored value | already carried |
| S/C `mergeAuthPermissions`, `unionAuthPermissions`, `holds`, `hasGrants` | read `groups` / `users` by name | ignore `reach` already |

## Design notes (decided while building, 2026-11-18)

- **Any limited reach makes a row "not blank".** Today a row that grants nothing is readable by anyone.
  Under a limited reach that would make *Hidden from site admins* on a blank source readable by the
  whole world, so a row with either switch off (on itself or above) is judged on its grants, and one
  naming no one is readable by no one. Rows without reach keep the blank-row rule.
- **Reach-limited decisions are always enforced.** Under `DMS_AUTH_MODE=log` nothing is refused, which
  would make *Private* a lie on every server still in `log`. A decision on a reach-limited subject
  carries `reachLimited`, and `applyMode` enforces it. Rows without reach are unchanged.
- **The server keeps a stored `reach` that a save leaves out** (`carryReach`), beyond what the task
  asked (carry it in client writers): an older client, script or CLI can't make a private row public
  by rebuilding `{ groups, users }`. Clearing it takes `reach: {}`.
- **The guard rail is data, not a kind check**: a rule key `adminAlways: true` on `site` and
  `pattern` (formats and the built-in copy). A site whose `formats` rows predate it is still guarded,
  because `sealRefused` reads the built-in copy too.
- **`view: false` on a non-source row** (only ever in a test) used to keep ONLY that row's part of a
  spread and drop the parts below it (a page's own grants under a `view: false` pattern). Now the
  rows at and below the cut row keep their grants and only the rows above are cut, which is what
  "for this row and everything under it" means. No stored data uses it outside sources.
- **Capability at `dms.capabilities`** (Falcor), not `/dms/formats`: every client already holds a
  Falcor model and the formats read needs a site named; an unknown Falcor path answers an empty atom on
  an older server, which reads as "absent".
- **Sync**: bootstrap and delta judge only reach-limited rows; the socket strips them to a
  notification (the socket has no user); the client's sync manager answers that with `revalidateNow()`.

## Testing

- [x] Baseline before any change (2026-11-18, full suite, sqlite): `npm test` passes. Failing before
      and after, with the same failing cases: `test-uda.js` (2: authoritative views, "source without an
      update-source grant"), `test-pattern-stub.js` (3), `test-table-splitting.js`, `test-migrate-site.js`,
      `test-db-copy.js`, `test-deprecate-internal-dataset.js`, `test-uda-feature-id.js` (needs a
      `dama-postgres-test` config), `test-access-log.js` without `DMS_DB_ENV=cli-test`. Postgres-only
      suites not run (no Docker run). `test-pgenv-auth` / `test-read-auth` / `test-schedule-auth` /
      `test-datatypes` failed once in the first full run with `SQLITE_IOERR_SHORT_READ` and pass alone
      and in the after run (a flake of the shared sqlite file).
- [x] After: `npm test` passes; every other suite passes or fails exactly as before; `syncBroadcast` /
      `syncDelta` (vitest) pass; client `authJudge.sync.test.js`, `declarations.test.js`, `utils/*` pass.
- [x] New `tests/test-auth-reach.js` (31): reachOf / carryReach; siteGrants strike keeps reach; no reach
      = today (admin unmarked); `inherit: false` alone; `view: false` ≡ `inherit: false` (every user ×
      read / update-source / edit-source-permissions); `override: false` alone (inheritance kept, admin
      refused read / write / grants edit, blank ≠ open); both (source, view, page via the judge); env →
      source → view → data row; enforced under `log`; guard rail (site edit, pattern edit and create
      refused for the admin; `inherit: false` on a pattern and `override: false` on a source allowed);
      old-shaped Falcor grants edit keeps reach, `reach: {}` clears; admin Falcor edit refused; Falcor
      byId read; `dms.capabilities`; sync bootstrap / delta per user; socket strip; upload with
      `auth_permissions` + reach (private from its first view), refusals (existing source, malformed,
      no create-source, metadata).
- [x] Local hub on :5555 restarted on the new code; `dms.capabilities` answers `{ reach: true }`.
- [ ] The editor presets in a browser (not checked).
- [ ] Postgres runs of the new test (the delta's `jsonExtract` reads are dialect-specific).

### Phase 3 — first user
- [x] Chat DMs (`chat-direct-messages.md`): DM sources, channel rows and membership rows created with
      `reach: { inherit: false, override: false }` — built 2026-11-18, checked on the server
      (`src/patterns/chat/tests/dmPrivacy.server.mjs`: participants in; another member, `<app> Admin`, a
      site `*` and a pattern `*` holder refused reads, posts and grants edits; sync bootstrap). Files: DMs
      ship without attachments until `gated-file-downloads.md`.

## Log

- **2026-11-18** — Planned with the owner, from chat DMs. Replaces the "sealed env" idea.
- **2026-11-18** — Named `reach` (owner); the four cases and the editor presets added.
- **2026-11-18** — Audit mode left out (owner); noted under Future directions.
- **2026-11-18** — Phase 3: chat DMs built on it (see that task); first gap task filed,
  `gated-file-downloads.md`.
- **2026-11-18** — Phases 1 and 2 built (server, client, docs, tests); Phase 3 (chat DMs) not started.
  Not committed. Decisions beyond the spec under "Design notes"; the pre-existing read paths that no
  reach can close (served files, collab rooms, search/sections, section rows) under "Not covered".
