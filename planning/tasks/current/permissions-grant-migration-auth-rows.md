# Grant migration: every auth row, every group, and the decision for each

**Initiatives:** [dms_permissions_move](../../../../../planning/initiatives/dms_permissions_move.md) · **Status:** review (owner verifies before any change) · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

Companion to [permissions-grant-migration.md](./permissions-grant-migration.md). Read-only dry run of
2026-11-03 (`dms-server/src/scripts/migrate-auth-grants.js --dms-db=dms-sqlite --auth-db=auth-sqlite`, dms3 +
avail_auth). **Nothing has been written.** Every group linked to each site's project is listed, with
its level, members, what it holds on the auth row today, what a straight level conversion would add, and the
decision.

## Decisions (owner, 2026-11-03)

- **The conversion is not mechanical.** Levels don't map to auth-row grants one for one; each group is decided.
- **Who may manage auth (`*` on the auth row):** mitigat-ny-prod: `AVAIL`, `DHSES`. npmrdsv5: `AVAIL`,
  `NYSDOT Admin`. asm, avail, dms-site, wcdb (and availabs, already): `AVAIL`. **No other group manages auth.**
  `${app} Admin` still passes by name.
- **`<county> HMP Public` (and Admin) groups never get `auth-users` / `auth-groups`.** They may only reach their
  own county's plan, so their permissions go on their county's pattern(s) only, which should already be set up
  (to confirm with a dry run).
- **User-level grants stay** (mitigat-ny-prod user 1 `*`, npmrdsv5 user 175 `*`).
- **Confirmed:** under `enforce` the level-5 groups (65 on mitigat-ny-prod, 17 on npmrdsv5) lose user and group
  management.
- **Scope: dms-template and dms only.** Test sites and Tessera are left out. **Levels are not removed**: the
  `auth_level` data stays in the auth DB and on pattern rows, so older code that reads it (avail-falcor,
  avail_auth_2) keeps working. No data is changed to remove levels.

So the whole auth-row change is **5 grants**: `AVAIL` `*` on asm, avail, dms-site and wcdb, and `NYSDOT Admin`
`*` on npmrdsv5.

## Where else auth levels still decide something

Levels count only in the auth server and in two client spots. **No pattern guard (page, datasets, admin) and
no dataset route reads a level**, so no pattern needs a grant *from a level*. What patterns and datasets do need
comes from the end of "signed in is enough" (legacy / blank rows), which is the
[access diff audit](./permissions-access-diff-audit.md)'s job, not this file's.

| Where | What the level decides | After levels go |
|---|---|---|
| `auth/utils/permissions.js` `authority()` / `levelCounts` | level ≥ 5 (≥ 10 for `/users/byProject`) passes the auth handlers in place of `auth-users` / `auth-groups` | the grants in this file |
| `auth/handlers/group.js` `getGroups`, `groupsForProject` | which groups a caller sees: their level ≥ the group's in every project | `canManageGroup` (grants) |
| `group.js` `createAndAssign`, `assignToProject`, `removeFromProject`, `resolveDeleteGroup` | caller's level ≥ 5 and ≥ the group's level | grants + protected-group rule |
| `group.js` `adjustAuthLevel` | **level only**, no permission path | goes with levels |
| `auth/handlers/user.js` (users list, user's projects) | which users a caller sees: level ≥ theirs | grants |
| `auth/handlers/auth.js` `mayAddToGroup` (signup accept, invite, add user) | level ≥ 5 and ≥ the group's | `auth-users` + `canManageGroupIn` |
| `auth.js` `getRequests`, `getRequestsForProject` | signup requests of projects where the caller is level ≥ 5 | `auth-users` on that site |
| `auth/handlers/message.js` `sendToGroup`, `sendToProject` | sender's level ≥ the group's / the project's highest | grants |
| `auth/handlers/project.js` `getProjects` | `avail_auth` level ≥ 10 sees all projects, ≥ 1 sees own | `AVAIL` membership (already counts) |
| `auth/jwt.js` | puts `authLevel` (max over groups) and each group's level in the token | dropped with levels |
| client `utils/auth.js` `rankUserGroups` | tie-break for which group the user menu shows | cosmetic |
| dms-template `src/patterns/mapeditor/SourceLayout.jsx:63` | `user.authLevel >= 5` shows a control | **needs a permission check** |
| new groups (`createAndAssign`, `assignToProject`, `ensureGroupInProject`) | still take and store an `auth_level` (0 by default) | stop asking for one once levels go |
| pattern rows' `auth_level` field (admin editSite, patternList, settings) | stored and copied, **read by nothing** | left as is (no data change) |

### Level rules that ignored `enforce` (found and fixed 2026-11-03, uncommitted)

Only `authority()`'s `byLevel` goes through `levelCounts`, which stops counting levels under `enforce` and logs
them under `log`. These checks read the level **directly**, so they keep letting level holders through under
`enforce` and record nothing under `log`. With the decisions above, a level-5 county admin would still do all of
this on mitigat-ny-prod after the switch:

| Handler | Raw level rule |
|---|---|
| `user.js` `checkGroupAuthority` (`/user/group/assign`, `/user/group/remove`) | `levelCoversGroup` |
| `user.js` `deleteUser` | `levelOutranks` |
| `user.js` `planUserLeavesSite` (remove a user from the site) | `levelCoversGroup` |
| `user.js` preferences of other users | `levelOutranks` |
| `user.js` `getUsers`, users by group | which users are listed: level ≥ theirs |
| `group.js` `getGroups`, `groupsForProject` | which groups are listed; `manageable` / `assignable` via `levelCoversGroup` |
| `group.js` `createAndAssign`, `assignToProject`, `authorizeRemoveFromProject` | `a.authLevel >= 5` and ≥ the group's |
| `group.js` `resolveDeleteGroup` | SQL: level ≥ 5 and ≥ the group's |
| `group.js` `adjustAuthLevel` (`/group/project/adjust`) | level only, no permission path |
| `message.js` `sendToGroup`, `sendToProject` | sender's level ≥ the group's / the project's highest |
| `auth.js` `getRequests`, `getRequestsForProject` | SQL: projects where the caller is level ≥ 5 |
| `project.js` `getProjects`, `platformAuthority` | `avail_auth` level (platform; `AVAIL` membership also counts) |

**Fixed (owner 2026-11-03: "fix the bypassing checks first, AVAIL membership only").** Each rule now goes
through `permissions.js` `levelsCount` / `noteLevelPass` / `levelRule`, the same switch as `levelCounts`:
under `log` it still passes and the access log records it (guard `auth`, "allowed by auth level only"),
under `enforce` it never passes. `createAndAssign` / `assignToProject` / `authorizeRemoveFromProject` use
`a.byLevel`. `adjustAuthLevel` gained a permission path (`*` on the auth row or `${app} Admin`); levels stay
settable, since older servers read them. A request naming no auth row keeps the level, as `levelCounts` does.
Platform: `platformAuthority` is `AVAIL` membership only; `/projects` lists every project for `AVAIL`, and
only their own projects for anyone else (it used to need `avail_auth` level 1, and 10 for all).
Tests: new `tests/test-auth-level-rules.js` (13: every rule refused under `enforce`, passes and logged under
`log`, grants still pass); updated `test-auth-platform`, `test-auth-groups`, `test-auth` for AVAIL-only.

### Datasets: the old numeric source levels (`statistics.auth`)

The server no longer reads `statistics.auth`; only `auth_permissions` counts. Read-only counts, 2026-11-03:

| pgEnv | Sources | With old levels | With grants | Old levels, **no grants** |
|---|---|---|---|---|
| hazmit_dama | 13,449 | 716 | 13,449 | 0 |
| npmrds2 | 452 | 424 | 437 | **14** |

The 14 npmrds2 sources lost their old per-user / per-group levels; they need
`migrate-source-auth-to-permissions.js` (dry run) or grants by hand. On hazmit_dama every source has grants, but
whether they match the old levels for the 716 isn't checked yet. Other pgEnvs (landbank, wcdb, tessera, …) have
no local config here and are not checked.

## All auth rows

Left out (owner, 2026-11-03): test sites (name, qa_test, rowauth-test, sd1, sd3, shaun-test-*, signup_test_add_admin,
tesst_bug, test_admin_creation_*, test_bug_*, type_refactor_2) and tessera.

### asm — auth row 1676371

Grants today: **none** (any signed-in user passes under `log`). 

| # | Group | Level | Members | Holds today | Level conversion would add | Decision |
|---|---|---|---|---|---|---|
| 1 | AVAIL | 10 | 18 | — | `*` | **add `*`** |

### avail — auth row 1449669

Grants today: **none** (any signed-in user passes under `log`). 

| # | Group | Level | Members | Holds today | Level conversion would add | Decision |
|---|---|---|---|---|---|---|
| 2 | AVAIL | 10 | 18 | — | `*` | **add `*`** |

### availabs — auth row 2

Grants today: 

| # | Group | Level | Members | Holds today | Level conversion would add | Decision |
|---|---|---|---|---|---|---|
| 3 | AVAIL | 10 | 18 | `*` | — | keep `*` |
| 4 | availabs Admin | 10 | 2 | `*` | — | nothing (passes by name) |
| 5 | availabs Public | 0 | 0 | — | — | nothing on the auth row |
| 6 | public | — | — | — | — | nothing |

### dms-site — auth row 1456572

Grants today: **none** (any signed-in user passes under `log`). 

| # | Group | Level | Members | Holds today | Level conversion would add | Decision |
|---|---|---|---|---|---|---|
| 7 | AVAIL | 10 | 18 | — | `*` | **add `*`** |
| 8 | dms-site Public | 0 | 1 | — | — | nothing on the auth row |

### landbank — auth row 2

Grants today: 

| # | Group | Level | Members | Holds today | Level conversion would add | Decision |
|---|---|---|---|---|---|---|
| 9 | landbank Admin | 10 | 5 | `*` | — | nothing (passes by name) |
| 10 | landbank Public | 0 | 1 | — | — | nothing |
| 11 | public | — | — | — | — | nothing |

### landbank — auth row 11

Grants today: 

| # | Group | Level | Members | Holds today | Level conversion would add | Decision |
|---|---|---|---|---|---|---|
| 12 | landbank Admin | 10 | 5 | `*` | — | nothing (passes by name) |
| 13 | landbank Public | 0 | 1 | — | — | nothing |
| 14 | public | — | — | — | — | nothing |

### mitigat-ny-prod — auth row 1427078

Grants today: User grants: user 1 → * (decision: keep).

| # | Group | Level | Members | Holds today | Level conversion would add | Decision |
|---|---|---|---|---|---|---|
| 15 | AVAIL | 10 | 18 | `*` | — | keep `*` |
| 16 | DHSES | 10 | 55 | `*` | — | keep `*` |
| 17 | Albany County HMP Admin | 5 | 2 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 18 | Allegany County HMP Admin | 5 | 4 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 19 | Allegany County HMP Public | 5 | 1 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 20 | Bronx County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 21 | Broome County HMP Admin | 5 | 1 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 22 | Cattaraugus County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 23 | Cayuga County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 24 | Chautauqua County HMP Admin | 5 | 1 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 25 | Chemung County HMP Admin | 5 | 65 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 26 | Chenango County HMP Admin | 5 | 5 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 27 | Clinton County HMP Admin | 5 | 3 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 28 | Columbia County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 29 | Cortland County HMP Admin | 5 | 2 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 30 | Delaware County HMP Admin | 5 | 14 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 31 | Dutchess County HMP Admin | 5 | 1 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 32 | Erie County HMP Admin | 5 | 1 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 33 | Essex County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 34 | Franklin County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 35 | Fulton County HMP Admin | 5 | 4 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 36 | Genesee County HMP Admin | 5 | 1 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 37 | Greene County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 38 | Hamilton County HMP Admin | 5 | 7 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 39 | Herkimer County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 40 | Jefferson County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 41 | Kings County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 42 | Lewis County HMP Admin | 5 | 1 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 43 | Livingston County HMP Admin | 5 | 2 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 44 | Madison County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 45 | Monroe County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 46 | Montgomery County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 47 | Nassau County HMP Admin | 5 | 8 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 48 | New York County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 49 | Niagara County HMP Admin | 5 | 7 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 50 | NYSDOT CONSULTANT | 5 | 14 | — | `auth-users`, `auth-groups` | nothing on the auth row |
| 51 | Oneida County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 52 | Onondaga County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 53 | Ontario County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 54 | Orange County HMP Admin | 5 | 1 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 55 | Orleans County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 56 | Oswego County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 57 | Otsego County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 58 | Putnam County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 59 | Queens County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 60 | Rensselaer County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 61 | Richmond County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 62 | Rockland County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 63 | Saratoga County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 64 | Schenectady County HMP Admin | 5 | 12 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 65 | Schoharie County HMP Admin | 5 | 4 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 66 | Schuyler County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 67 | Seneca County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 68 | Steuben County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 69 | St. Lawrence County HMP Admin | 5 | 1 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 70 | Suffolk County HMP Admin | 5 | 9 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 71 | Sullivan County HMP Admin | 5 | 25 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 72 | SUNY_503 | 5 | 2 | — | `auth-users`, `auth-groups` | nothing on the auth row |
| 73 | Tioga County HMP Admin | 5 | 1 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 74 | Tompkins County HMP Admin | 5 | 1 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 75 | Ulster County HMP Admin | 5 | 3 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 76 | Warren County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 77 | Washington County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 78 | Wayne County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 79 | Westchester County HMP Admin | 5 | 16 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 80 | Wyoming County HMP Admin | 5 | 6 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 81 | Yates County HMP Admin | 5 | 0 | — | `auth-users`, `auth-groups` | nothing on the auth row; grants go on its county pattern (to list) |
| 82 | BILD | 1 | 172 | — | — | nothing on the auth row |
| 83 | UB | 1 | 4 | — | — | nothing on the auth row |
| 84 | Albany County HMP Public | 0 | 5 | — | — | nothing on the auth row; grants go on its county pattern (to list) |
| 85 | hazard_mitigation Public | 0 | 21 | — | — | nothing on the auth row |
| 86 | LHMP Admin Group | 0 | 102 | — | — | nothing on the auth row |
| 87 | LHMP Template Editor | 0 | 10 | — | — | nothing on the auth row |
| 88 | mitigat-ny-prod Public | 0 | 65 | — | — | nothing on the auth row |
| 89 | Sullivan County HMP Public | 0 | 18 | — | — | nothing on the auth row; grants go on its county pattern (to list) |
| 90 | public | — | — | — | — | nothing |

### npmrdsv5 — auth row 1498261

Grants today: User grants: user 175 → * (decision: keep).

| # | Group | Level | Members | Holds today | Level conversion would add | Decision |
|---|---|---|---|---|---|---|
| 91 | AVAIL | 10 | 18 | `*` | — | keep `*` |
| 92 | NYSDOT Admin | 10 | 21 | — | `*` | **add `*`** |
| 93 | AGFTC | 5 | 1 | — | `auth-users`, `auth-groups` | nothing on the auth row |
| 94 | BMTS | 5 | 3 | — | `auth-users`, `auth-groups` | nothing on the auth row |
| 95 | CDTC | 5 | 13 | — | `auth-users`, `auth-groups` | nothing on the auth row |
| 96 | ECTC | 5 | 2 | — | `auth-users`, `auth-groups` | nothing on the auth row |
| 97 | GBNRTC | 5 | 16 | — | `auth-users`, `auth-groups` | nothing on the auth row |
| 98 | GTC | 5 | 5 | — | `auth-users`, `auth-groups` | nothing on the auth row |
| 99 | ITCTC | 5 | 2 | — | `auth-users`, `auth-groups` | nothing on the auth row |
| 100 | MHV | 5 | 13 | — | `auth-users`, `auth-groups` | nothing on the auth row |
| 101 | MTA | 5 | 4 | — | `auth-users`, `auth-groups` | nothing on the auth row |
| 102 | NYMTC | 5 | 22 | — | `auth-users`, `auth-groups` | nothing on the auth row |
| 103 | NYSAMPO | 5 | 29 | — | `auth-users`, `auth-groups` | nothing on the auth row |
| 104 | NYSDOT | 5 | 150 | — | `auth-users`, `auth-groups` | nothing on the auth row |
| 105 | OCTC | 5 | 5 | — | `auth-users`, `auth-groups` | nothing on the auth row |
| 106 | PDCTC | 5 | 5 | — | `auth-users`, `auth-groups` | nothing on the auth row |
| 107 | SMTC | 5 | 6 | — | `auth-users`, `auth-groups` | nothing on the auth row |
| 108 | Traffic Management Group | 5 | 1 | — | `auth-users`, `auth-groups` | nothing on the auth row |
| 109 | UCTC | 5 | 4 | — | `auth-users`, `auth-groups` | nothing on the auth row |
| 110 | MPOs | 0 | 2 | — | — | nothing on the auth row |
| 111 | NPMRDS New Users | 0 | 42 | — | — | nothing on the auth row |
| 112 | NPMRDS_PM3 New Users | 0 | 173 | — | — | nothing on the auth row |
| 113 | NPMRDS Public | 0 | 14 | — | — | nothing on the auth row |
| 114 | npmrdsv5 Public | 0 | 15 | — | — | nothing on the auth row |
| 115 | public | — | — | `view-page` | — | nothing |

### wcdb — auth row 1471742

Grants today: **none** (any signed-in user passes under `log`). 

| # | Group | Level | Members | Holds today | Level conversion would add | Decision |
|---|---|---|---|---|---|---|
| 116 | AVAIL | 10 | 18 | — | `*` | **add `*`** |
| 117 | wcdb Admin | 10 | 5 | — | — | nothing (passes by name) |
| 118 | wcdb onair | 0 | 1 | — | — | nothing on the auth row |
| 119 | wcdb Public | 0 | 8 | — | — | nothing on the auth row |
