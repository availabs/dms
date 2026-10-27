# Permissions move, step 0: inventory of who holds levels and grants today

**Initiatives:** [dms_permissions_move](../../../../../planning/initiatives/dms_permissions_move.md) (primary), [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** done · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

Part of [auth-levels-to-permissions.md](../current/auth-levels-to-permissions.md) (hub). Read-only. Every other task
in the move uses its numbers; [permissions-access-diff-audit.md](../current/permissions-access-diff-audit.md) turns them into
the level × source loss check.

## Objective

Before any check moves from levels to permissions, or any dataset route starts enforcing, record who can do
what today, so each later task can show "nobody lost an operation".

## Steps

- [x] **Auth DB (prod `dms3` auth DB and any `auth-sqlite` in use):** per project, every group with
  `groups_in_projects.auth_level ≥ 1`, its level, member count, and whether its name is `${project} Admin`.
  Also note groups that are in several projects at different levels, because the cross-project rank rules
  (`/users`, `/groups`, `checkGroupAuthority`, `/user/delete`) depend on them.
- [x] **`avail_auth` / `AVAIL`:** who is in it. These are the platform superusers (projects, create user,
  force password, fake users, message all).
- [x] **Auth server per site:** which deployed DMS sites pass `AUTH_HOST` (dms-server) and which use the library
  default `https://graph.availabs.org` (avail-falcor, `render/spa/dmsSiteFactory.jsx:41`). Sites on avail-falcor
  stay on levels until they move, because avail-falcor can't read DMS rows.
- [x] **`authLevel` consumers:** anything reading `/login`/`/auth`'s `authLevel` and `meta[].authLevel`
  (`auth/handlers/auth.js:35-52`), and the CLI auth skill text. The JWT itself only holds
  `{email, password, project}`. `authLevel` is computed per request (`auth/jwt.js:58`).
- [x] **Datasets grants, per pgEnv and DMS env** (external: `hazmit_dama` and `npmrds2`):
  - Sources with `auth_permissions` null/`{}`, and envs where the column is missing (these are open today
    because `isUserAuthedForSource` fails open, see
    [permissions-server-source-auth-core.md](../current/permissions-server-source-auth-core.md)).
  - Every datasets pattern's `authPermissions`: who holds `update-source`, `create-view`, `delete-source`,
    `manage-downloads` at pattern level.
  - Who has actually uploaded, published, created downloads or scheduled in the last ~6 months
    (`data_manager.tasks`/`views` `user_id`, `schedules.created_by`). Those users must hold the matching
    permission before the dataset routes enforce. The 8 patterns / 5 apps listed in
    [auth-permission-chain-and-unguarded-writes.md](./auth-permission-chain-and-unguarded-writes.md) are the start.
- [x] **Page sections that write source data:** count DataWrapper/Card sections with `allowEditInView`,
  `allowAdddNew` or `allowDelete` bound to DMS or `isEditable` sources, per site. Needed by
  [section-row-write-auth.md](../current/section-row-write-auth.md).
- [x] Write the results to `scratchpad/permissions-inventory/` (data) and a summary in this doc.

## Done when

The summary below lists, per site: the auth server, the level-≥5 groups, the active dataset writers and the
grants they hold today. Each later task's blast-radius check can point at it.

## Summary

Run 2026-10-19, read-only (every session had `default_transaction_read_only=on`). Data:
`dms-template/scratchpad/permissions-inventory/*.tsv` (gitignored). Sources: `avail_auth` and `dms3` on
mercury, `hazmit_dms` (pgEnv `hazmit_dama`), `npmrds2` on neptune.

### Auth servers per site

- **dms-server (`AUTH_HOST = API_HOST`, default `https://dmsserver.availabs.org`, `src/App.jsx:8,46`):** every
  dms-template deploy (mitigat-ny-prod, TransportNY/npmrdsv5 including the `npmrds.` and `tsmo.` subdomains,
  wcdb, landbank, avail, dms-site, dmsdocs, …). Its auth DB is `mercury:5435/avail_auth`.
- avail-falcor's auth config points at the same `avail_auth` DB. The library default
  `AUTH_HOST = https://graph.availabs.org` (`dmsSiteFactory.jsx:41`) only matters for a site that doesn't pass
  `AUTH_HOST`; no dms-template deploy relies on it.

### Projects in use (logins in the last 180 days)

mitigat-ny-prod 99 users · npmrdsv5 56 · NPMRDS 33 · hazard_mitigation 12 · wcdb 9 · dms-site 5 · avail 5 ·
avail_auth 5 · landbank 4 · test apps 1–3 each. 74 projects, 371 groups, 914 users. About 30 projects are
abandoned test apps (`clauderepro*`, `test_*`, `shaun-test-*`), each holding one level-10 group.

### Level-≥5 groups (`auth_groups_level_ge1.tsv`)

| Project | 10 | 5 | Notes |
|---|---|---|---|
| mitigat-ny-prod | AVAIL, DHSES (73 members) | 65 groups, 215 members: 62 `<County> HMP Admin`, NYSDOT CONSULTANT, SUNY_503, **Allegany County HMP Public** | 176 members at level 1, 198 at 0 |
| hazard_mitigation | AVAIL, DHSES | 64 groups, 370 members (county HMP Admins, BILD, test1) | 1.0 site |
| NPMRDS | AVAIL, NYSDOT, NYSDOT Admin (188) | 22 MPO/consultant groups, 126 members | |
| npmrdsv5 | AVAIL, NYSDOT Admin (39) | 17 groups, 280 members, **NYSDOT at 5** | |
| wcdb | AVAIL, wcdb Admin | — | |
| landbank / availabs | `${app} Admin` only | — | |
| TIG | AVAIL, NYMTC | — | |

- No project except the small ones has a `${project} Admin` group: mitigat-ny-prod, npmrdsv5 and NPMRDS rely on
  AVAIL/DHSES/NYSDOT at level 10. **`isAppAdmin`'s `${app} Admin` bypass covers none of the big sites**, so the
  migration has to grant `*` to those groups explicitly.
- **Groups in several projects at different levels** (`auth_groups_multi_level.tsv`): NYSDOT (NPMRDS 10, npmrdsv5 5,
  avail_auth 5, TDS 0), BILD (hazard_mitigation 5, mitigat-ny-prod 1, test 10), NYMTC (TIG 10, npmrdsv5 5,
  NPMRDS 1), MHV (npmrdsv5 5, NPMRDS 1), NPMRDS New Users, Allegany County HMP Public (5 in mitigat-ny-prod,
  0 in hazard_mitigation; looks like a mistake).

### Platform superusers (`avail_auth`, the `AVAIL` group)

- AVAIL has 18 members (`avail_group_members.tsv`), including two DHSES staff added in Sept 2026. Level 10 in
  `avail_auth` lets them list, create and delete projects, create users, **force any user's password** and
  create fake users. Confirm the DHSES members are meant to have this.
- ⚠ **NYSDOT is level 5 in `avail_auth`** (149 members). `/group/create` and `/group/meta/update` check only
  `avail_auth ≥ 5` (`auth/handlers/group.js:109,230`), so every NYSDOT member can create groups and rewrite any
  group's `meta` today. Feed this to [permissions-auth-platform-admin.md](../current/permissions-auth-platform-admin.md)
  and [permissions-auth-groups.md](../current/permissions-auth-groups.md).
- There's no project row named `AVAIL`; `message.js:144` uses the group name.

### External `authLevel` consumers

- **In this repo:** `src/patterns/mapeditor/SourceLayout.jsx:63` (`user?.authLevel >= 5`, the dead mapeditor
  component) and the `authLevel: -1` default in `patterns/auth/context.js:6`. Nothing else in the library or
  `src/` reads it.
- **Server:** `/login` and `/auth` still return `authLevel` and `meta[].authLevel` (`auth/handlers/auth.js:35-52`).
- The DMS CLI and skills have no `authLevel` text.

### Datasets grants

**Pattern `authPermissions` shapes** (`authpermissions_shapes.tsv`, every non-component row in dms3 that has the key):

- **Canonical (107 patterns):** `{"*": "<JSON string of {groups,users}>"}`, the shape `permissionsEditor.jsx`
  writes. No pattern uses a per-subdomain key.
- **Flat legacy (30 patterns):** a JSON string of `{groups,users}`. **This works today**: both readers
  (`resolveSubdomainAuthPermissions` on the client, `resolveAuthPermissions` on the server) fall back to it, and the
  editor turns it into the canonical shape on save. 25 are `${app} Admin` seeds that `tenantProvisioning.js:144,319`
  still writes in the flat shape, so new tenants keep producing it. 5 are mitigat-ny-prod patterns with real
  grants (985070, 1603896, 1300890, 2275239, 572433).
- **Broken (3 patterns), grant nothing today.** None carry a meaningful permission:
  - mitigat-ny-prod 736402 `test-meta-forms` (forms): `{"AVAIL":["*"]}`. AVAIL already holds `*` site-wide.
  - type_refactor_2 2 `Auth`: `{"type_refactor_2 Admin":["*"]}`. A dead test app, and `${app} Admin` passes anyway.
  - wcdb 1471742 `Auth`: `{"undefined Admin":["*"]}`. No such group exists (an `adminGroupName` that was
    undefined when the row was written).
- **Pages** (438 with grants) and **sources** use the flat `{groups,users}` shape by design
  (`getPageAuthPermissions`, `datasets.format.js`). Pages store it either as a string (207) or as an object (231);
  both parse.

**External sources:**
- `hazmit_dms`: 13,244 sources, but **12,855 are `file_upload`** with only 19 distinct names, almost all with
  no owner. Every Lexical/image upload makes a source and view: the duplicate-upload bug
  (`lexical_upload_dl_url_missing`). The other 387 grant only `AVAIL` `*` (one also adds BILD and DHSES); none
  have `public` view.
- `npmrds2`: 439 sources. Nearly all grant `AVAIL` + **`NYSDOT` `*`**, the owner `*`, and sometimes
  `public: ["view-source","download-source"]`. 9 have `{}`, and 77 have no owner.
- No source has null `auth_permissions` in either env, so the strict check will deny people who do the work
  today. It won't open anything up.

**Active writers, last 180 days** (`*_task_writers_180d.tsv`, `*_view_writers_180d.tsv`):
- `hazmit_dms`: AVAIL members (1, 175, 389, 656) for publish, hazard_loss_pipeline and create-download, plus
  **DHSES users 1272 and 1308 (not AVAIL) running `gis/create-download`** on AVAIL-only sources. They lose that
  when downloads enforce unless DHSES is granted, or `download-source` gates the route instead.
- `npmrds2`: AVAIL members (1, 175, 389, 656, 659, 993) publish; **create-download also comes from 4 and 607
  (NYSDOT Admin, granted through NYSDOT `*`) and 403 (CDTC/NYSAMPO, level 5, no grant)**. Many tasks have no
  user (`gis/analysis` 188, schedulers, cron workers), so system or worker routes need an identity that
  isn't a user.
- `schedules.created_by` is empty in both envs.

**Internal (DMS) sources** (`internal_sources_perm_state.tsv`): 116 source rows. Only 5 carry
`auth_permissions` (2 in mitigat-ny-prod, 3 in shaun-test-app); 111 have no key. Fail-closed would lock them
all unless the source inherits the pattern grant, and most patterns have none.

**Row writers on internal sources** (`internal_source_row_writers_180d.tsv`, `non_avail_writer_tables.tsv`):
- mitigat-ny-prod: **county HMP Admins (level 5) and DHSES staff** edit `roles`, `jurisdictions`,
  `capabilities_catalogue`, `nys_dams`, `hazards_of_concern` and `lhmp_ia` (users 572, 1008, 1055, 1087,
  1106, 1168, 1177, 1229, 1231, 1313; groups `LHMP Admin Group`, `<County> HMP Admin`, DHSES, BILD). User 963 (NYMTC, **no group in
  mitigat-ny-prod**) also edited `roles`, which works only because `uda.data.*` is login-only today.
- npmrdsv5: `reports_snap_2`, `routes_data` and `sitemgmt_tickets` are written by level-0 (1404) and level-5
  MPO users (1069, 631). These rows belong to the user who made them, so they need a public-create or own-row
  rule ([section-row-write-auth.md](../current/section-row-write-auth.md)).
- Many rows have null `updated_by` (mitigat-ny-prod 23k, npmrdsv5 71k, shaun-test-app 52k): bulk or CLI loads.

### Page sections that write source rows (`live_sections_with_row_writes.tsv`)

Sections a current page references (published / draft) with `allowEditInView`, `allowAdddNew` or
`allowDelete` set: mitigat-ny-prod **3,690 / 3,710** (the county template repeated across counties), wcdb 18,
npmrdsv5 11, asm 5, landbank 4, dms-site 1, shaun-test-app 4 / 41. The raw scan over every component version
found about 206k matches. wcdb is the only site using `allowDelete`.

### What this means for later tasks

1. **Grant migration** must grant `*` to AVAIL, DHSES, NYSDOT and NYSDOT Admin by name, because the big sites
   have no `${app} Admin` group. It also needs `edit-source-data` (or similar) for `LHMP Admin Group` and the
   county HMP Admin groups on the MNY internal sources, and a download grant for DHSES on hazmit and for
   MPO groups like CDTC on npmrds2.
2. **Resolver** reads the canonical and flat pattern shapes (decide whether to drop flat; see above) and passes worker or system calls that
   have no user.
3. **Platform admin:** take NYSDOT out of `avail_auth` level 5, or close the `/group/create` and
   `/group/meta/update` checks, before anything else in auth.
4. **Cleanup to consider:** about 30 dead test projects, Allegany County HMP Public at level 5, and the
   12.8k duplicate `file_upload` sources in `hazmit_dms`.
