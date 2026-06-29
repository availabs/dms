# Datasets permissions model — align with the page pattern (pattern → source)

> **Standalone task — finish before resuming `datasets-design-updates` (Phase 4+).** The redesign's
> admin affordances all depend on a working source-permission model, so this lands first.
> Scope: **C** (full new model — vocabulary + per-source `authPermissions` + Access editor, which
> requires **A** shared-auth + **B** merge/per-source layer underneath it) **then** an analysis +
> migration script for the old source auth data.

## Old auth model in sources (DISCOVERED — what the migration converts)
Sources currently use a **numeric `authLevel`** scheme, *not* string permissions:

- **Per-source UAC** is stored in **`source.statistics.auth`**:
  ```js
  statistics.auth = { users: { [userId]: "<level>" }, groups: { [groupName]: "<level>" } }
  ```
  (levels are numeric strings). Edited today by the UAC panel in
  `pages/dataTypes/default/admin.jsx` (and `dataTypes/internal/pages/admin.jsx`), writing via
  `updateSourceData({ attrKey: 'statistics' })`.
- **Level scale** — `SOURCE_AUTH_CONFIG` (`components/ExternalVersionControls.jsx`):
  `VIEW=1, DOWNLOAD=2, EDIT=3, ADMIN=5, SUPER=10`.
- **Client checks** use the **global** `user.authLevel` (e.g. `user.authLevel >= 5` in gis Map,
  `>= SOURCE_AUTH_CONFIG['SUPER']` in ExternalVersionControls). The new dms-server JWT
  (`dms-server/src/auth/jwt.js`) sets `user.authLevel = max(group.auth_level)` and `user.groups`.
- **⚠ Server-enforced (legacy):** avail-falcor's data_manager enforces the per-source UAC server-side
  — `getUserAuthLevelForSource(pgEnv, ids, user)` (`routes/data_manager/controller/multi-db.js`)
  reads `statistics->'auth'->'users'/'groups'`, takes the max of the user's + their groups' levels,
  and `multi-db.routes.js` throws if `userAuthLevel < (json mentions "auth" ? ADMIN : EDIT)`.
  ⇒ For npmrds2/DAMA sources, **the source data API access is gated by `statistics.auth` on the
  server**, independent of whatever the client does. This is why enforcement scope (below) matters.

### Migration mapping (numeric level → string perms) — cumulative
`view-source` (see it in the system) and `download-source` (pull the data) are **separate** — a user
can be granted view without download. `manage-downloads` (create/refresh download *artifacts*) is an
admin action, distinct from `download-source` and only granted at EDIT+.

| old level | adds | cumulative perms |
|-----------|------|------------------|
| `VIEW` (1)     | `view-source` | `view-source` |
| `DOWNLOAD` (2) | `download-source` | `view-source`, `download-source` |
| `EDIT` (3)     | `update-source`, `create-view`, `manage-downloads` | + the above |
| `ADMIN` (5)    | `delete-source`, `view-source-api` | + the above |
| `SUPER` (10)   | `*` | `*` |
Each `statistics.auth.{users,groups}[k] = level` ⇒ `authPermissions.{users,groups}[k] = perms(level)`.

**Privacy preservation (LOCKED):** a source that had **no** public grant gets `public: []` (revoke) so
the pattern's `public:[view-source]` baseline does NOT make a previously-private source public. Dry
run: of 354, **227 revoked (kept private)**, 124 keep a public grant, 3 public-capped.

**New sources are private + creator-owned (LOCKED):** on create, default
`authPermissions = { users: { [creatorId]: ['*'] }, groups: { public: [] } }` — owner has full
access, others (and the pattern baseline) must be granted intentionally. Done in `CreatePage.jsx`;
the dataType-specific create paths (`file_upload`, `gis_dataset/Create`, internal `sourceCreate`) and
ideally a **server-side default** on create still need the same.

## Why
After the auth model changed, admin affordances on datasets source pages (the category edit
pencil, description pencil, "Edit columns", table "Set Default Columns") **stopped appearing for
logged-in users** who aren't explicitly granted a non-public permission. Root cause below. The fix
is to bring the datasets pattern in line with how the **page pattern** does permissions
(pattern-level perms inherited down to a per-item override), since datasets diverged with its own
stricter `auth.js` and has no per-source layer.

## The shared data shape
Everywhere, permissions are one JSON object:

```js
authPermissions = {
  groups: { [groupName]: [perm, ...] },   // e.g. { "NPMRDS Admin": ["*"], public: ["view-page"] }
  users:  { [userId]:   [perm, ...] },     // per-user grants
}
```

- A **permission** is a string (`view-page`, `edit-page`, `update-source`, …) or `'*'` (all).
- A user is authed for `reqPermissions` if any of their (group ∪ user) perms is `'*'` or is in
  `reqPermissions`.
- `[]` for a group/user means "explicitly none" (used by the merge to *disable* an inherited grant).

## The check — two `isUserAuthed` implementations (the core divergence)

**Shared `utils/auth.js`** (used by the **page** pattern):
```js
if(!reqPermissions?.length) return true;
// logged-in AND auth not really configured (only a `public` group, no user grants) → allow
if(user.authed && !groups(except public) && !users) return true;
if(!groups && !users) return true;                       // nothing configured at all → allow
return userPerms.some(p => p === '*' || reqPermissions.includes(p));
```

**datasets `patterns/datasets/auth.js`** (used by the **datasets** pattern):
```js
if(!reqPermissions?.length) return true;
if(!user?.authed) return false;                          // hard gate, FIRST
if(!groups && !users) return true;                       // nothing configured → allow
return userPerms.some(p => p === '*' || reqPermissions.includes(p));
```

The datasets version is **missing the "logged-in + only-public-configured ⇒ allow" clause**. That
clause is exactly what lets a logged-in editor act on a site whose perms haven't been fully wired.

### ⇒ The bug
`render/spa/utils/index.js` (the SPA factory) resolves each pattern's saved `authPermissions` and,
for every pattern (pages **and** datasets), **injects a default `groups.public = ['view-page']`** if
absent (lines ~204-206). So `authPermissions.groups` is *never empty* at runtime.

- In the **page** pattern that's fine — the shared util's `user.authed && only-public` clause still
  returns true for logged-in users.
- In **datasets**, the presence of the `public` group means the "nothing configured → allow" path is
  never reached, and there's no "only-public → allow" fallback. So a logged-in user without an
  explicit `update-source`/`*` grant is **denied every admin affordance**. (Confirmed: the source
  Overview pencils are gated on `isUserAuthed(['update-source'])`.)

## How permissions flow in the PAGE pattern (pattern → page → section)

1. **Pattern row** persists `authPermissions` (JSON). Edited in the **admin** pattern editor
   (`patterns/admin/pages/patternEditor/default/permissionsEditor.jsx`,
   `DEFAULT_PERMISSIONS = { groups: { public: ['view-page'] }, users: {} }`).
2. **SPA factory** (`render/spa/utils/index.js`): `resolveSubdomainAuthPermissions(pattern.authPermissions, SUBDOMAIN)`,
   inject `public: ['view-page']` default, pass as the `authPermissions` **prop** into `pagesConfig`.
3. **`page/siteConfig.jsx`** puts `authPermissions` on `CMSContext` and exposes:
   ```js
   isUserAuthed: (reqPermissions, customAuthPermissions) => {
     if (!customAuthPermissions) return isUserAuthed({ user, authPermissions, reqPermissions });
     // MERGE page/section overrides onto inherited pattern perms:
     //   [] ⇒ delete inherited; non-empty ⇒ add/replace
     return isUserAuthed({ user, authPermissions: merged(authPermissions, customAuthPermissions), reqPermissions });
   }
   ```
   (uses the **shared** `utils/auth.js`.)
4. **Each PAGE** persists its own `authPermissions` (`page.format.js` has an `authPermissions`
   attribute, `type: 'json'`, with a `permissionDomain` listing selectable perms). Edited via
   `pages/edit/editPane/permissionsPane.jsx` using the reusable **`UI.Permissions`** widget
   (`inheritedValue = patternAuthPermissions`, `value = page.authPermissions`). Editing the page's
   perms is itself gated by `edit-page-permissions`.
5. **Components** read the page's perms with `getPageAuthPermissions(pageState.authPermissions)` and
   pass them as `customAuthPermissions` → the context `isUserAuthed` merges them over the pattern.
6. **Each SECTION** can also persist `authPermissions`; `section.jsx` reads page + section perms and
   merges them over the pattern for that section's controls.

Net effective permission = **pattern ⊕ page ⊕ section**, evaluated against the user's groups/id.

## How permissions work in DATASETS today

1. Pattern row persists `authPermissions`; factory passes it in (identical to pages — the factory
   block is pattern-type-agnostic; the `// Old variables for other patterns (…, datasets)` comment
   confirms datasets receives it). ✓
2. **`datasets/siteConfig.jsx`** exposes
   `isUserAuthed: (reqPermissions, customAuthPermissions) => isUserAuthed({ user, authPermissions: customAuthPermissions || authPermissions, reqPermissions })`
   — note `customAuthPermissions || authPermissions` is **replace, not merge**, and it calls the
   **datasets-local** `auth.js` (the stricter one). ✗
3. **No per-source layer**: `datasets.format.js`'s `source.attributes` (name, config, description,
   categories, views) has **no `authPermissions`** — sources can't carry their own perms. ✗
4. **Vocabulary is tiny**: the only `reqPermission` used anywhere in the pattern is `update-source`
   (source Overview pencils + the table "Set Default Columns" button). ✗

## Proposed datasets model (mirror pages: pattern → source)

### A. Immediate fix (unblocks the vanished pencils)
- **Use the shared `utils/auth.js`** in `datasets/siteConfig.jsx` (and delete/redirect
  `patterns/datasets/auth.js`), so the "logged-in + only-public ⇒ allow" behavior matches pages.
  This alone restores admin affordances for logged-in editors on not-yet-locked-down sites.

### B. Bring the merge + per-source layer in line with pages
1. **Merge, don't replace** in `siteConfig.isUserAuthed` — copy the page pattern's merge
   (`[]` disables an inherited grant; non-empty replaces) so source-level perms layer on the pattern.
2. **Add `authPermissions` to the source format** (`datasets.format.js` → `source.attributes`),
   `type: 'json'`, with a `permissionDomain` of dataset perms (below). Sources now persist overrides
   exactly like pages.
3. **Thread source perms**: `SourcePage` reads `source.authPermissions` and provides a source-scoped
   `isUserAuthed` (or passes it as `customAuthPermissions`) on `DatasetsContext`, so every dataType
   page/component checks **pattern ⊕ source** without each re-reading the source attr.
4. **Editing UI** (Phase 7 Admin tab → "Access" sub-page): reuse **`UI.Permissions`** with
   `inheritedValue = pattern authPermissions`, gated behind `edit-source-permissions`. Pattern-level
   editing already works via the admin `permissionsEditor` (pattern-type-agnostic) — it just needs
   the datasets permissionDomain registered.

### C. Permission vocabulary for datasets (proposal — confirm names)
Catalog/source read is public by default (`public: ['view-source']`), admin actions gated:

| perm | gates |
|------|-------|
| `view-source` | seeing the source at all (public default) |
| `update-source` | description / categories / update-interval / metadata edits (already used) |
| `create-source` | "New source" CTA on the catalog |
| `delete-source` | Danger zone |
| `create-view` | "Add version" |
| `manage-downloads` | create/refresh downloads |
| `view-source-api` | the admin-only Falcor/API card (Decision #4) |
| `edit-source-permissions` | who may edit a source's Access panel |

(Today's single `update-source` stays meaningful; the rest are introduced as the redesign adds those
affordances in later phases.)

## Files
- Reuse: `utils/auth.js` (shared check), `UI.Permissions` widget, admin `permissionsEditor.jsx`.
- Edit: `patterns/datasets/siteConfig.jsx` (use shared auth + merge), **remove**
  `patterns/datasets/auth.js`, `patterns/datasets/datasets.format.js` (add source `authPermissions`),
  `patterns/datasets/pages/SourcePage.jsx` (read + provide source perms), admin permissionDomain
  registration, and a new source **Access** admin sub-page (Phase 7).

## ⚠ CORRECTION (2026-06-28): enforcement lives in **dms-server**, not avail-falcor; column is `auth_permissions`
avail-falcor is **not in use** — dms-server is the only server. The P4 enforcement was therefore
**re-targeted to dms-server** and the avail-falcor edits reverted (those files are back to original).
Also: **DB column names must be snake_case** — the column is **`auth_permissions`** (not the
camelCase `authPermissions` first shipped; the migration drops the mis-named column and recreates it).
The DAMA *source* attribute (client + column) is `auth_permissions`; the *pattern's* perms remain the
page-pattern `authPermissions` JSON key in `dms.data_items.data`.

**Where things actually live now:**
- enforcement module: `dms-server/src/routes/uda/sourceAuth.js` (strict; reuses dms-server
  `resolveAuthPermissions`); modify gate wired in `dms-server/src/routes/uda/uda.route.js` `set`.
- tests: `dms-server/tests/test-source-auth.js` (16 passing, plain-node).
- new-source default (private + creator-owned): `dms-server/src/dama/upload/metadata.js`
  `createDamaSource` + client `CreatePage`/`sourceCreate`.
- column in DDL: `create_dama_core_tables.sql` + `.sqlite.sql` (`auth_permissions`).
- migration: `dms-server/src/scripts/migrate-source-auth-to-permissions.js` — **re-run committed** on
  npmrds2 (drops camelCase col, creates `auth_permissions`, 354 sources). Verified: column is only
  `auth_permissions`; #62 public anon view✓/update✗, AVAIL update✓; #891 private anon view✗.

## Decisions (LOCKED 2026-06-28)
1. **Storage** = **new top-level source attribute** `authPermissions` (mirror pages exactly), not a
   `statistics` subfield. ⇒ `datasets.format.js` source gains an `authPermissions` json attribute;
   the server must persist + return it on sources (new column / field on DAMA sources).
2. **Enforcement** = **migrate server-side too** (single source of truth on `authPermissions`), not
   client-gating only. ⇒ avail-falcor data_manager (`getUserAuthLevelForSource` + the multi-db route
   gate) and the new dms-server source access checks move from numeric `statistics.auth` to
   string-permission `authPermissions`.
3. **Mapping** = the **proposed numeric→permission table** above.

## Phase plan (this task — finish before resuming design phases)
- **P1 — Client model (A+B+C)** — ✅ CORE DONE (pending live verify)
  - **A** ✅ datasets `siteConfig` now imports the shared `utils/auth.js`; local `auth.js` deleted.
    (This alone restores the admin affordances — the "logged-in + only-public ⇒ allow" clause.)
  - **B** ✅ `siteConfig.isUserAuthed` MERGEs pattern⊕custom (page-pattern logic); added a top-level
    `authPermissions` json attribute to the source format (`datasets.format.js`) with the permission
    `permissionDomain`; `SourcePage` parses `source.authPermissions` and provides a **source-scoped
    `isUserAuthed`** on `DatasetsContext` (effective = pattern ⊕ source). `view-source` and
    `download-source` are **separate** perms (view-in-system ≠ download data, per owner).
  - **C** ✅ new **Access** editor — `components/SourceAccessEditor.jsx` wraps `UI.Permissions`
    (`inheritedValue` = pattern perms, `value` = source perms), gated by `edit-source-permissions`;
    replaced the legacy numeric UAC panels in **default** `admin.jsx`.
  - **P1 cleanup** ✅ DONE — `internal/pages/admin.jsx` UAC swapped for `SourceAccessEditor`;
    `ExternalVersionControls.jsx` `>= SUPER` → `isUserAuthed(['manage-downloads'])` (and
    `SOURCE_AUTH_CONFIG` removed); gis `Map.jsx` `>= 5` → `isUserAuthed(['view-source-api'])`. No more
    `user.authLevel`/numeric-level reads in the datasets client. (Pre-existing unrelated bug noted:
    `getData is not defined` in ExternalVersionControls ~L281 — out of scope.)
  - Catalog **public-read** default still to confirm.
- **P2 — Old-data analysis** — ✅ DONE (npmrds2, read-only via `getDb('npmrds2').query`). Findings:
  - **367** sources; **354** carry `statistics.auth`; **292** have user grants, **191** group grants.
  - **User grants**: essentially all level **10/SUPER** (332 grants; only 1 at level 1) across **13**
    distinct user ids → migrate to `['*']`.
  - **Group levels**: `10`→290, `2`/DOWNLOAD→119, `1`/VIEW→13, `5`/ADMIN→3.
  - **Groups**: `AVAIL`(10), `NYSDOT`(10), `NYSDOT Admin`(10), `SMTC`/`UCTC`(10), `Public`(mostly 2).
  - **No non-numeric levels** (clean — mapping needs no string-level handling).
  - **⚠ Edge cases the migration MUST handle:**
    1. **`Public` vs `public` case mismatch** — both exist as group names (the factory/new model use
       lowercase `public`). Normalize legacy `Public` → `public` on migrate, and **merge** if a source
       has both (union the perms).
    2. **`Public` at level 5 and 10** (3 + 1 sources) — public with ADMIN/SUPER is almost certainly a
       data error; a faithful migrate would grant the anonymous `public` group `*`. **Cap public at
       `download-source`** (or flag for manual review) rather than blindly emitting `*` for public.
    3. Distinguish the two real `Public` download rows (`Public`@2 = 77, `public`@2 = 42) — both →
       `[view-source, download-source]` after case-normalization.
- **P3 — Migration script** — ✅ WRITTEN + DRY-RUN VALIDATED (commit pending approval).
  `avail-falcor/migrate_source_auth_to_permissions.js` (dry-run default; `--commit` writes).
  Per source: `statistics.auth.{users,groups}` (numeric) → `authPermissions.{users,groups}` (string
  perms, cumulative mapping). **Decisions applied:** group case normalized (`Public`→`public`, union
  on collision); **public capped at `download-source`** (a public `*` expands to view+download, not
  stripped to empty). Idempotent (recomputes from `statistics.auth`, left intact for P4). Write path:
  `ALTER TABLE … ADD COLUMN IF NOT EXISTS "authPermissions" jsonb` + parameterized per-source UPDATE.
  **Dry run (npmrds2):** 354 sources; AVAIL/NYSDOT→`*`, public→`[view-source,download-source]`;
  **public capped on 3** (887 AVAIL@5/Public@5, 1787 …/Public@5, 1633 AVAIL@10/Public@10 → all
  view+download). ⚠ `--commit` is a **prod write** (+ DDL) — run alongside / just before P4 so the
  server returns + enforces the new column. Not yet committed.
- **P4 — Server enforcement** — avail-falcor `getUserAuthLevelForSource` + multi-db gate (and the new
  dms-server equivalent) read `authPermissions` instead of `statistics.auth`; then retire
  `statistics.auth`. *(Highest risk — production source-data access; design + review before cutover.)*
  - **Inheritance makes this harder than the old model** (flagged by owner). The old check was
    self-contained: the source's own `statistics.auth` lived in the same DAMA db the data_manager
    queries. The new check is **pattern ⊕ source**, and the **pattern's `authPermissions` lives in the
    DMS `data_items` table** while the **source lives in DAMA** (avail-falcor / npmrds2) — a
    **cross-system join**. The server must resolve the pattern's perms (DMS) and merge them with the
    source's perms (DAMA) before evaluating the user's groups. Decide how the data_manager gets the
    pattern perms: (a) the client/route passes resolved pattern `authPermissions` down with the
    request, (b) the data_manager reads the DMS db directly, or (c) dms-server fronts the check.
  - **Reference: pages already solved server-side inheritance in dms-server** — reuse its approach,
    but adapt for **DMS + DAMA** (pages are pure DMS; here the source is DAMA). *(locate the pages
    enforcement path in `dms-server` at P4 start.)*
  - **Robust server-side enforcement tests required** (owner): matrix over {anonymous, logged-in
    no-grant, group-granted, user-granted, `*`, source-override that adds, source-override that
    disables `[]`} × {view / download / edit / admin actions}, asserting both **allow** and **deny**
    (deny must actually throw at the data API, not just hide UI). Cover the pattern⊕source merge and
    the cross-system resolution.

  ### P4 design — LOCKED approach: "pass pattern context → server merges" (feasibility confirmed)
  - **Same DB, not cross-DB.** avail-falcor's `routes/udaController.js` already reads
    **`dms.data_items`** — the DMS patterns and `data_manager.sources` are the **same npmrds2
    Postgres instance**, different schemas. So the server can resolve the pattern's `authPermissions`
    (DMS) and the source's `authPermissions` (DAMA) in **one connection / cross-schema query**.
  - **Multi-pattern resolved by passing context, not perms.** The client sends the **pattern
    identity** (`app`+`type`, i.e. the `dms.data_items` pattern row key) with each source-data
    request — NOT resolved perms (never trust client perms). The server looks up that pattern's
    `authPermissions` itself.
  - **New server check** (replaces `getUserAuthLevelForSource` numeric logic in
    `routes/data_manager/controller/multi-db.js`):
    `isUserAuthedForSource({ pgEnv, sourceId, patternApp, patternType, reqPermissions, user })`:
    1. resolve `user.groups` (+ always include `public`).
    2. read `source."authPermissions"` from `data_manager.sources` (the P3 column).
    3. read the pattern row's `authPermissions` from `dms.data_items` WHERE `app=$ AND type=$`.
    4. **merge** pattern ⊕ source (`[]` disables, non-empty replaces — same rule as the client
       `siteConfig.isUserAuthed`; factor the merge into a shared util so client & server agree).
    5. allow iff the user's (group ∪ user) perms include `*` or any of `reqPermissions`.
  - **Gates to convert:** the `set` gate in `multi-db.routes.js` (modify → `update-source` /
    `edit-source-permissions` when the payload touches `authPermissions`); **plus locate + add the
    READ/data gate** (source-data fetch + download → `view-source` / `download-source`) — the old
    numeric model only hard-gated `set`; confirm whether reads need server gating too (they must, for
    non-public sources).
  - **dms-server equivalent** for internal_table sources (pattern + source both in `dms.data_items`)
    — same merge util, single schema.
  - **Sequencing:** run P3 `--commit` (adds `data_manager.sources."authPermissions"` + populates)
    **immediately before** flipping the server gate; keep `statistics.auth` until the new gate is
    verified in prod, then drop it. Add the test matrix (above) before cutover.
  - **Status / progress:**
    - ✅ **Shared merge util** — `dms-template …/utils/auth.js` `mergeAuthPermissions`; datasets
      `siteConfig.isUserAuthed` refactored to use it (pattern ⊕ source).
    - ✅ **avail-falcor auth module** — `routes/data_manager/controller/sourceAuth.js`:
      `mergeAuthPermissions` (matches client), strict `isUserAuthed`, `withPublicGroup`,
      `getPatternAuthPermissions` (dms.data_items `data->'authPermissions'`), `getSourceAuthPermissions`
      (`data_manager.sources."authPermissions"`, returns undefined when unmigrated), and
      `isUserAuthedForSource({db, sourceId, patternId, reqPermissions, user, legacy})` with **legacy
      fallback** to the numeric check for unmigrated sources (transition-safe).
    - ✅ **Robust tests** — `controller/test/sourceAuth.spec.js`, **19 passing** (the full matrix:
      anonymous/editor/admin/user-grant/`*`/stranger × view/download/edit/delete, source-adds,
      source-`[]`-disables, public cap).
    - 🔎 **Security finding (tested):** the client's "logged-in + only-public ⇒ allow" escape hatch
      must NOT exist server-side (a logged-in user could act on a source with only a public grant, or
      one that `[]`-revoked their group). The server `isUserAuthed` is **strict** — explicit perm or
      `*` only. (Client keeps the escape hatch for UI affordances; a client-shows / server-denies
      mismatch is acceptable and secure.)
    - ✅ **`set`/modify gate wired** — `multi-db.routes.js` `set` now calls `isUserAuthedForSource`
      (modify→`update-source`, perm-edit→`edit-source-permissions`) per source, with the **legacy
      numeric fallback**. Because unmigrated sources fall back, this is a **no-op behavior change until
      P3 `--commit`** (safe to deploy ahead of cutover). Syntax-checked.
    - ✅ **Strict server check** — removed BOTH client-only rules from the server `isUserAuthed`
      (escape hatch AND "unconfigured ⇒ allow"); empty/unconfigured `authPermissions` now DENIES,
      matching the old "no auth = modifiable by none". 19 tests still green.
    - ✅ **New-source default** — `CreatePage` creates sources private + creator-owned
      (`{users:{[creator]:['*']}, groups:{public:[]}}`).
    - ✅ **Migration COMMITTED to npmrds2** (owner-authorized 2026-06-28). Script moved to its
      canonical reusable home: **`dms-server/src/scripts/migrate-source-auth-to-permissions.js`**
      (uses dms-server `getDb`/`awaitReady`; `[pgEnv=npmrds2] [--commit]`, dry-run default — works for
      any DAMA pgEnv with a `<pgEnv>.config.json`). Wrote `authPermissions` on **354 sources**
      (367 total; 13 with no legacy auth left `{}`); 227 kept private, 124 public, 3 capped.
      `statistics.auth` left intact.
    - ✅ **Verified read-only on prod data:** #62 (public) → anon view✓/download✓/update✗, AVAIL
      update✓; #1633/#887 public capped to view+download (not empty); #891 (private) → anon view✗.
      End-to-end `isUserAuthedForSource` against live npmrds2 matches expectations.

  ### Why the remaining work is small (key realization)
  The migration **preserves access** (same sources visible, same grants, just re-encoded). So the
  existing **listing filters keep returning correct results on `statistics.auth` throughout the
  transition** — they do NOT need rewriting for cutover, only at the final `statistics.auth` drop.
  Likewise the old model **never gated data reads** server-side (only listing visibility + modify),
  so a read/download gate is a NEW *hardening*, not a parity requirement.

  ### Cutover runbook (owner-run; each step reversible until the last)
  1. **Run the migration** (prod, additive/reversible): `node migrate_source_auth_to_permissions.js
     npmrds2 --commit` — adds `data_manager.sources."authPermissions"` + populates 354 rows
     (227 kept private, 124 public, 3 capped). Old code ignores the new column; `statistics.auth`
     untouched. *(Requires granting the Bash permission or running it yourself.)*
  2. **Verify (read-only)** against the populated column: spot-check a known-public source (e.g. 62)
     and a known-private one; confirm `isUserAuthedForSource` results match expectations.
  3. **Deploy** the avail-falcor code (set gate + `sourceAuth.js`). The set gate now enforces
     `authPermissions` (with legacy fallback already covering any unmigrated row).
  4. **Optional hardening (separate, can follow later):**
     - **Read/download server gate** — gate the view-data read path on `view-source`/`download-source`
       (NEW enforcement; the old model didn't have it; verify it doesn't break public data access).
     - **dms-server** modify gate for internal_table sources (their authPermissions live in
       `dms.data_items.data`); + new-source default in the other create paths (file_upload / gis /
       internal `sourceCreate`) — ideally a single server-side default on `:source` create.
     - **Client pattern-context** (pattern id) — only needed if you want *pattern-level* grants to
       widen access beyond per-source (the migration baked grants per-source, so not required).
  5. **Final cleanup (after prod soak):** switch the listing filters
     (`getSourceIdsByIndex`/`getSourcesLength`/`getNumAuthedSourcesForUser`) from `statistics.auth`
     to `authPermissions` (view-source), remove the legacy fallback in `isUserAuthedForSource`, then
     **drop `statistics.auth`**.

## Open questions (resolved/remaining)
- ~~storage / enforcement / mapping~~ → LOCKED above.
- Catalog **public-read** default (`public: ['view-source']`) — assume yes (matches the
  "one dual-role surface" design [[project_datasets_design_topic]]); confirm at P1-C.
- Per-**view** perms — out of scope (per-source granularity only; view-level is YAGNI).
- Which **server** is authoritative for npmrds2 at cutover (avail-falcor today vs dms-server target) —
  resolve at P4.

## Related
- [[project_datasets_design_topic]], task: [datasets-design-updates](./datasets-design-updates.md)
  (the Admin tab, Phase 7, is where the Access editor lands).
