# Children by type path only: no ref lists, no `parent_id`, every pattern

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** next · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

Today a row's children are stated three ways: by the child's type path (`prod|docs:pattern` → `docs|page`),
by a list of refs on the parent (`page.sections`, `site.patterns`, `env.sources`), and by a `parent_id`
column added for the row-auth attempt. They can disagree, and most of the ref-handling code in the client
API, the sync layer, the child sweep and the cleanup scripts exists to keep them in step.

**Owner, 2026-11-10:** one rule, for every pattern type: **a row's children are always and only the rows
whose type names it.** No parent row lists its children, and no child carries a reference to its parent.
Order, when it matters, is a field on the child. Start with the page pattern, then convert every other
pattern.

Three rules for how the work is done (owner, same day):

1. **Its own branch.** The work is done on one long-lived branch in each repo it touches (the
   `@availabs/dms` submodule and `dms-template` for the host patterns). Nothing lands on `master` until
   the whole conversion passes. The owner creates the branches.
2. **Databases are migrated; the code does not straddle.** The path forward is a migrated database. The
   new code has no fallback for the old shapes: no capability probes, no "list if present, else type",
   no legacy type suffixes.
3. **The migration enforces every check, and the server refuses unmigrated data.** The migration is the
   gate: it refuses to finish while any invariant below is violated, and it stamps the app when done.
   The server on this branch refuses to serve an app without the stamp.

## The model

- **Containment is the type.** `{parent instance}|{own instance}:{kind}` for a row that can have children
  (a container), `{parent instance}|{kind}` for a leaf. The grammar is unchanged
  (`dms-server/src/db/type-utils.js`, `dms/src/utils/type-utils.js`).
- **A container's instance is unique in the app**, because a child's type holds only its immediate
  parent's instance. Enforced by a unique index (see Constraints).
- **A container with no natural name gets a minted key.** Pages get `pg_` + 10 base-36 characters, minted
  by whoever creates the page (client or server), immutable. Existing pages get `pg_` + the row id in base
  36, so a re-run of the migration produces the same types. The two forms differ in length.
- **Order is a `rank` string on the child**, sortable, where a new item takes a value between its
  neighbours, so insert and move write one row. Ties break by id.
- **Associations keep their references.** A reference to a row the holder does not own is not containment
  and stays: a pattern's `dmsEnvId`, a page's `template_id` and its nav parent (`data.parent`), a section's
  source / view / symbology ids, a chat member's `user_id`. The migration lists every one it finds so none is mistaken for a child list.
- **Moving a row to another parent is delete and recreate** (or a server "move" that retypes inside one
  transaction). A type is identity.

### Publish: revisions and a pointer

Draft and published sections differ by kind and revision, not by which list they are on:

```
docs|pg_7k2m9x4qhd:page              the page; data.published_rev = 5
pg_7k2m9x4qhd|draft_component        the working copy, edited in place
pg_7k2m9x4qhd|r5:component           published revision 5
```

Publish is a server operation: copy the draft sections into `r{N+1}:component` rows, then write
`published_rev: N+1` on the page. The second step is the publish, a single-row write, so a crash before it
leaves rows nobody reads and no transaction is required. Old revisions are deleted by exact type; keep the
last 5 by default (a pattern setting). Rollback is setting the pointer back. `section_groups` and
`dataSources` are stored per revision in one `{pagekey}|r{N}:layout` row (and `{pagekey}|draft_layout`),
so one pointer flips content and layout together.

**Loading the live revision does not cost a round trip (owner's concern, 2026-11-10).** The client never
needs to know the revision number:

- The server resolves the pointer. `dms.children` accepts `live` in place of a revision instance; the
  query is one statement (`type = '{pagekey}|r' || (the page's published_rev) || ':component'`, both
  sides on the `(app, type)` index), and the page-view request asks for the page row, its live sections
  and its live layout together. That is one request, where today's load is two: the page row for its
  refs, then the rows by id.
- With local-first sync the page row is already in the browser's store, so the pointer is read locally
  and the sections come from the parent index.
- SSR and the pattern bootstrap ship each page with its live revision in the same response.

Considered and set aside: keeping the live set at a fixed type (`{pagekey}|component`) and giving the
outgoing set its revision number at publish. A fixed type saves nothing on a view, because the page row
is loaded anyway for its title, layout and grants, and it makes publish "retype N rows and insert N
rows", which is only safe inside a real transaction (`dms-server-real-transactions.md` is still open) and
changes the type of rows that every syncing browser already holds. If measurement in P10.3 shows the
live lookup is slower than today's page load, revisit; the fixed type remains possible later as a pure
server change.

## Every type format, now and after

Read from the formats (`*.format.js`), the type builders in the client and server, and the scripts. A row
count per kind per app is the first step of Phase 0; none is recorded here.

| Kind | Pattern | Today | After | Child list removed / notes |
|---|---|---|---|---|
| site | admin | `{site}:site` | unchanged | Loses `patterns`, `tenants`, `theme_refs`, `dms_envs` |
| pattern | admin | `{site}\|{slug}:pattern` | unchanged | Was on `site.patterns`. If pattern order matters anywhere (to verify), `rank` on the row |
| tenant | admin | `{site}\|{slug}:tenant` | unchanged | Was on `site.tenants`. The tenant's own site row lives in the tenant's app and is unchanged |
| theme | admin | `{name}:theme` (no parent) | `{site}\|{name}:theme` | Was on `site.theme_refs`. Becomes a child of the site like every other site-level kind |
| dmsenv | admin | `{site}\|{name}:dmsenv` | unchanged | Was on `site.dms_envs`. `pattern.dmsEnvId` is an association and stays |
| source | datasets | `{env}\|{slug}:source` | unchanged | Was on `env.sources`, and on the datasets pattern's legacy `sources` (form-manager). pgEnv mirror stubs have this shape already and lose `parent_id` |
| view | datasets | `{source}\|v{N}:view` | unchanged | Was on `source.views`. Order is the version |
| data | datasets | `{source}\|{viewId}:data`, split tables | unchanged | Already listed by type. Names the view by row id, not by instance: a known inconsistency, out of scope because the split table names derive from it |
| page | page | `{pattern}\|page` | `{pattern}\|{pagekey}:page` | Becomes a container. Gains `published_rev`. Loses `sections`, `draft_sections`, `history`, `section_groups`, `draft_section_groups`, `dataSources`, `draft_dataSources` |
| component (published) | page | `{pattern}\|component` | `{pagekey}\|r{N}:component` | Was on `page.sections`. Gains `rank` |
| component (draft) | page | `{pattern}\|component`, flagged `is_draft` | `{pagekey}\|draft_component` | Was on `page.draft_sections`. Own kind, so its read rule can require `edit-page`. Gains `rank` |
| layout | page | fields on the page row | `{pagekey}\|r{N}:layout`, `{pagekey}\|draft_layout` | New. Holds `section_groups` and `dataSources` |
| page-edit | page | `{pattern}\|page-edit` | `{pagekey}\|page_edit` | Was the single ref `page.history` |
| page_template | page | `{pattern}\|page_template` | unchanged | Child of the pattern. Confirm it holds its sections inline, not as refs |
| section template | page | `{pattern}\|{element}_template` | unchanged | Child of the pattern |
| symbology | mapeditor | `{pattern}\|symbology` | unchanged | Already listed by type. A section's symbology id is an association |
| channel | chat | `{install}\|channel` | `{install}\|{chkey}:channel` | Becomes a container (`ch_` + key), because members are its children |
| member | chat | `{install}\|member` with `channel_id` | `{chkey}\|member` | `channel_id` goes; `user_id` is an association and stays |
| chat source / view / messages | chat | `{env}\|chat_{install}:source`, `chat_{install}\|{slug}:view`, `chat_{install}\|{viewId}:data` | unchanged | The channel's `view_id` is an association |
| qa | qa | rows live in dataset sources created at install | unchanged | The pattern row's stored source ids are associations. Confirm no list of children is kept |
| user, group | auth | not in `data_items` (auth database) | unchanged | Nothing to convert |
| legacy | — | `…\|cms-section`, `…\|template`, `…\|countytemplate`, bare doc types | **none may remain** | The migration converts or refuses; the new code deletes every branch that reads them |

**Page hierarchy is navigation, not containment (owner, 2026-11-10).** A page under another page is
stated by `data.parent` (the parent page's id) and `data.index`. It orders the nav and is not part of
this system: it is left exactly as it is. Every page is typed `{pattern}|{pagekey}:page` whatever its
place in the nav, `data.parent` keeps holding the parent page's row id, and the migration does not touch
it beyond listing it among the associations.

## Generic machinery (before any pattern)

| Area | Files | Change |
|---|---|---|
| Type helpers | `dms-server/src/db/type-utils.js`, `dms/src/utils/type-utils.js` | Add `mintKey(prefix)`, `childType(parentType, kind, instance?)`, `isContainer`. No grammar change |
| The `dms-format` attribute type | every `*.format.js`; `dms/src/patterns/registry.js`, `declarations.js`, `deriveAuthRules.js`, `deriveAuthVocabulary.js`, `page/page.childRefs.js` | Replace with a `children` declaration on the format: `{ kind, container?, ordered? }`. It declares what kinds may sit under a row; it holds no data. `childRefs` and its stamp are deleted |
| Client load | `dms/src/api/proecessNewData.js` (`loadDmsFormats`), `dms/src/api/index.js` (`loadFromLocalDB` ref resolution), `dms/src/api/preloadSectionData.js`, `dms/src/api/loadFullData.js` | Delete ref expansion. Children load through one `listChildren(app, parentType, kind)` call, which is the list request the API already makes for top-level rows |
| Client save | `dms/src/api/index.js` (the two child loops in `dmsDataEditor`), `dms/src/api/updateDMSAttrs.js` | Delete both loops and the file. A child is saved as its own row with a type built from its parent's |
| Sync, client | `dms/src/sync/sync-manager.js`, `idb-store.js`, `sync-scope.js`, `room-health.js` | Scope by parent instance, not by following refs from the site row. Add an index on the parent part of the type in the local store. `page-structure-provider.js` is deleted |
| Sync, server | `dms-server/src/routes/sync/sync.js` (`buildDeltaQuery`, skeleton bootstrap), `ws.js` (channel matching by type prefix) | A pattern's scope is its own rows, its pages, and their children: resolve page keys once per subscription and match on them |
| Server controller | `dms-server/src/routes/dms/dms.controller.js` | Delete `childRefsForType`, `stampChildren` use, `sweepChildrenOfDeleted`, the `rowAuthCaps` branches, the `\|cms-section` / bare-type query branches. Add `listChildren`, `deleteSubtree` (by type, in one transaction), and create-time validation: a child's parent instance must name exactly one container of a kind the format allows |
| Server, deleted | `dms-server/src/routes/dms/parentId.js`, `rowAuthCaps.js` | Removed |
| Falcor routes | `dms-server/src/routes/dms/dms.route.js` | `listingBlockedFor` judges every kind, not only `page` |
| Auth | `dms-server/src/routes/auth/owners.js`, `index.js`, `rules.js`, `formats.js`, `vocabulary.js` | `parentOf` is the type path only; the snapshot selects `id, type` and the grant fields rather than whole `data` (pages become containers and would otherwise be loaded in full); rule 1 loses its reference clause; `child_refs` leaves `formats` |
| Formats table | `dms-server/src/db/table-resolver.js`, `sql/dms/*.sql`, `scripts/register-formats.js`, `dms/scripts/emit-formats.mjs` | Drop `child_refs`; carry the `children` declarations |
| Mirror | `dms-server/src/dama/mirror.js`, `scripts/reconcile-pgenv-mirror.js` | Stop passing `parent_id`; stop maintaining refs on the env row |
| CLI | `dms/cli/src/commands/{page,section,site,pattern,dataset,raw}.js`, `cli/src/utils/{data,output,room-sync}.js`, `cli/docs/TYPES.md` | Read and write children by type; `page publish` calls the server publish |
| Scripts retired | `migrate-row-auth.js`, `cleanup-stale-dmsenv-refs.js`, `prune-unlisted-views.js`, `delete-orphan-pages.js`, `consolidate-page-history.js`, `retype-views-to-source.js`, `backfill-view-pattern.js`, `migrate-type-system.js`, `migrate-to-dmsenv.js` | Their job is the migration's, once. Keep them on `master`; delete on the branch |
| Scripts ported | `copy-db.js`, `migrate-site.js`, `cleanup-db.js`, `delete-source.js`, `delete-templated-pages.js`, `delete-countytemplate-patterns.js`, `sweep-*-grants.js` | Walk by type |

## Pattern by pattern

The file lists come from searching for each attribute and type string on 2026-11-10. Each phase starts by
confirming its list against the branch; a file that only mentions a word in a comment or a theme key drops
out.

### 1. page (first)

Types: page, draft_component, component revisions, layout, page_edit. Decision needed first: revisions
kept. (Page hierarchy is settled: `data.parent` stays.)

| File | Change |
|---|---|
| `patterns/page/page.format.js` | Page: drop the seven list / layout attributes, add `published_rev`, declare `children`. Section format splits into `draft_component` and `component` with their own rules (draft read needs `edit-page`; published read follows the page). Add `layout` and `page_edit` formats |
| `patterns/page/page.childRefs.js` | Deleted |
| `patterns/page/siteConfig.jsx` | Page type built with a minted key on create; children requested by type |
| `patterns/page/pages/view.jsx`, `view.doc.js`, `pages/_utils/index.js` | Read the published revision's sections and layout |
| `patterns/page/pages/edit/index.jsx`, `edit/editFunctions.jsx` | `publish` and `discardChanges` call server operations; no array building; `has_changes` is "draft differs from the live revision" |
| `pages/edit/editPane/{pagesPane,settingsPane,historyPane,sectionGroupsPane,index}.jsx` | Read layout and history as child rows; page create mints the key; page duplicate mints new keys |
| `components/sections/sectionArray.jsx` | Add, delete and reorder become single-row writes (create with a rank, delete, update rank). The whole-array computation goes |
| `components/sections/{section,sectionGroup,sectionMenu}.jsx`, `section_utils.js` | Read `rank` and `group` from the row; "move to page" is delete and recreate |
| `components/sections/template_utils.js`, `patterns/utils.js`, `ui/pageTemplates.js` | Templates instantiate sections as rows under the new page key |
| `components/search/index.jsx` | Search published sections across a pattern's pages (see the server tags query) |
| `components/sections/components/dataWrapper/useDataSource.js` | Stops building `{pattern}\|component` |
| `dms-manager/wrapper.jsx` | No `dms-format` child handling |
| `patterns/admin/pages/patternEditor/pages/{pagesEditor.jsx,pagesEditor.utils.js,sourcesTab.jsx}`, `pageTemplateManagerPane.jsx`, `default/filterEditor.jsx` | Site-management views list pages and sections by type |
| `utils/tenantProvisioning.js`, `ui/siteTemplates.js` | Provisioned pages get keys; sections are created under them |
| `sync/page-structure-provider.js` | Deleted |
| Server: `dms.controller.js` | `publishPage`, `discardPageDraft`, `duplicatePage`; the tags / search queries (lines ~1120–1200) join pages to their sections; `\|page` suffix tests become kind tests |
| Server: `dama/upload/dms-duplicate.js` | Pattern duplicate mints a key per page and recreates its children; no id remapping |
| Server: `dms/tasks/pattern-filter-sync/pattern-filter-sync.js`, `pdf/*` | List a pattern's pages by `{pattern}\|%:page`, sections by page key |
| Host: `src/patterns/qa/pages/{helpers,index,overview,pageQa,ticket,tickets}.js`, `qa/publish.js`, `qa/cli/onPagePublish.js`, `qa/fields.js`, `qa/tracking.js` | QA's generated pages and its page-publish hook use the new page shape; `page_key` on a ticket should become the page's minted key |
| Host: `src/themes/*/…` scripts that write pages (the MitigateNY county-template migration, the TransportNY QA tools) | Port or freeze; list them in Phase 0 |

### 2. admin (site, pattern, tenant, theme, dmsenv)

| File | Change |
|---|---|
| `patterns/admin/admin.format.js` | Site loses the four list attributes; theme gains the site as parent; `children` declared |
| `patterns/admin/siteConfig.jsx`, `render/spa/utils/index.js`, `render/spa/dmsSiteFactory.jsx`, `render/spa/utils/snapshot.js`, `render/ssr2/handler.jsx` | The boot reads the site row, then its patterns, envs, themes and tenants by type (one request). `site-bootstrap-payload-and-pattern-lookup.md` should land on the same shape |
| `patterns/admin/pages/{createSite,editSite,tenants}.jsx`, `components/{patternList,tenantList}.jsx`, `pages/themes/{list,editTheme}.jsx`, `pages/patternEditor/default/{settings,themeEditor}.jsx` | Create and delete rows directly; every "write the refs back to the site" step goes, with the races it guarded |
| `utils/tenantProvisioning.js`, `patterns/auth/pages/authSignup.jsx` | Same; `backfillAdminPattern`'s re-read-and-discard goes (the unique index refuses a second admin pattern) |
| `patterns/deriveAuthRules.js`, server `routes/auth/rules.js`, `judge.js` | The site rule's per-key clauses for `patterns`, `dms_envs`, `tenants`, `theme_refs` go: adding a pattern is a `create` of a pattern row, judged as such |
| Server: `routes/uda/utils.js` (`getSitePatterns`) | Already by type; drop the list fallback |
| Server: `auth/utils/siteGrants.js`, `scripts/sweep-site-grants.js` | Walk by type |
| Host: `src/patterns/qa/{install,configure,datasets}.js`, `qa/admin/{patternSettings,configureTab}.jsx`, `qa/reportIssue/ReportIssue.jsx`, `qa/pages/view.jsx` | Read the site's patterns and envs through the new call |

### 3. datasets (dmsenv children: source, view, data) and the pgEnv mirror

| File | Change |
|---|---|
| `patterns/dmsEnv.format.js`, `patterns/datasets/datasets.format.js` | `sources` and `views` attributes go; the legacy form-manager `sources` goes |
| `patterns/datasets/utils/{datasources,authority,lifecycle,changeHistory}.js` | `buildEnvsForListing` and friends stop reading `env.sources` |
| `patterns/datasets/pages/{CreatePage,SourcePage,SettingsPage}.jsx`, `DatasetsList/index.jsx`, `components/DeleteSource.jsx`, `pages/dataTypes/internal/pages/{admin,upload,validate}.jsx`, `internal_table/pages/sourceCreate.jsx`, `dataTypes/default/{overview,version,admin,utils}.jsx` | Create source and view rows directly; version lists come from `{source}\|%:view` |
| `patterns/admin/pages/patternEditor/pages/sourcesTab.jsx` | Lists by type |
| Server: `routes/uda/{utils,uda.controller,uda.route,authority,uda.tasks.controller}.js` | `getSiteSources` by type only; `isDms` branches that read `views` refs read by type |
| Server: `dama/upload/{metadata,file-upload-dms-route,file-upload-route}.js`, `dama/upload/workers/*`, `dama/delete.js`, `dama/lineage.js` | Stop appending to and removing from ref lists |
| Server: `dama/mirror.js`, `scripts/reconcile-pgenv-mirror.js` | No `parent_id`; nothing written to the env row |
| Server: `scripts/{delete-source,deprecate-internal-dataset,copy-sources-to-dmsenv,prune-unreachable-tables,rename-split-tables}.js` | Walk by type |
| `page/components/sections/components/dataWrapper/*` | Associations (a section's source and view ids) are unchanged; only code that walked `source.views` refs changes |

### 4. mapeditor

Symbologies are already children of the pattern by type, listed by type.
`src/patterns/mapeditor/{siteConfig.jsx,index.js,section/index.jsx}`: remove any `dms-format` declaration
and confirm nothing keeps a list. A section's symbology id is an association. Expected to be the smallest
phase.

### 5. chat

`src/patterns/chat/{channels,messages,install,useLiveTail}.js`, `chat.format.js`, `pages/*`, and the Slack
importer: channels become containers with a minted key, members become `{chkey}|member`, `channel_id`
goes. Live-tail subscribes by channel key. Message tables are unchanged.

### 6. qa

`src/patterns/qa/*`: rows live in dataset sources, so this is mostly covered by phases 1–3. Confirm the
pattern row keeps only associations (source ids), and move `page_key` to the page's minted key.

### 7. auth

No rows in `data_items`. Only its site-level verbs are affected, through the admin phase.

## The migration

One script, `dms-server/src/scripts/migrate-children-by-type.js --db <config> --app <app> [--apply]`, run
per app. It is the only way a database reaches the new shape.

1. **Into a copy, not in place.** The target is a fresh database (or a fresh `dms_<app>` schema under a
   new name). The source is never written. Rollback is pointing the old code at the old database.
   `copy-db.js` is legacy-mode only today, so the copy step is part of this script.
2. **Pre-flight, read-only, refuses on any failure and lists the rows:**
   - no two containers share an instance name in the app;
   - every ref on every list resolves to a row of the expected kind;
   - no row is listed by two parents;
   - no unlisted row of a child kind exists (old published copies, dead patterns, orphan sections), or
     each is explicitly marked for deletion in a decisions file the owner signs off;
   - no legacy type remains (`|cms-section`, `|template`, `|countytemplate`, bare doc types);
   - every association the script does not recognise is listed for review.
3. **Transform**, in dependency order: site-level kinds, envs / sources / views, pages (mint keys),
   sections (retype from the page's lists, with `parent_id` as a cross-check where it is filled; write
   `rank` from list position; drafts to `draft_component`, published to `r1:component`,
   `published_rev: 1`), layout rows, history rows, chat. Rewrite QA `page_key` values that are row ids to page
   keys. `page.parent` is not rewritten.
4. **Drop** the list attributes, `parent_id`, `auth` (after moving what it holds into `data` / `formats`),
   and `formats.child_refs`.
5. **Constraints added** (see below); adding them is the proof the data satisfies them.
6. **Post-verify:** every non-site row's parent instance resolves to exactly one container; row counts per
   kind match the pre-flight plan; a read diff of the site's routes against the source (page titles,
   section counts and order per page) is empty.
7. **Stamp:** a `dms_meta` row in the app's schema, `{ data_model: 2, migrated_at, source }`.

### Constraints the migration adds, and new apps get at creation

- Unique index on the instance of every container row (the part of `type` between the last `|` and `:`),
  per app.
- `CHECK (app = '<app>')` on a per-app table.
- `CHECK` that `type` matches the grammar, with the list of allowed kinds taken from the registered
  formats.
- `CHECK (jsonb_typeof(data) = 'object')`.
- No `parent_id`, no `auth` column.

A dangling parent instance cannot be refused by a constraint (it is a string, not a foreign key). The
server's create path refuses it, and `setup-app.js --verify` reports any that a direct write introduced.
This replaces B1–B8 in [new-app-auth-setup-and-db-constraints.md](./new-app-auth-setup-and-db-constraints.md).

### The server refuses unmigrated data

On this branch, the first use of an app reads its `dms_meta` stamp. No stamp, or `data_model` lower than
the code's: every request for that app fails with a message naming the migration script. New apps are
created at the current model with the constraints. Legacy split mode (the shared `dms.data_items`) is not
supported on the branch: an app is migrated into per-app mode by the same script.

## Open decisions

- ~~Page hierarchy~~ — settled 2026-11-10: navigation only, `data.parent` is left as it is.
- **Revisions kept** per page: default 5; or all, as version history.
- **Pattern, env and theme order:** does anything depend on the order of `site.patterns` (route
  precedence, the admin list)? If yes, a `rank` on those rows.
- **Section identity across revisions:** each publish makes new rows, as today. If anything needs to
  follow a section across publishes (anchors, QA tickets, comments), add a stable `section_key` copied
  from draft to revision.
- **`pattern.dmsEnvId`:** leave as an id, or name the env by instance now that instances are unique.
- **The local-first store:** migrate each browser's IndexedDB, or discard and re-bootstrap on first load
  of the new build (recommended).
- **transportNY's vendored copy** and the other deployed sites: one cutover per database, each with its
  site build from the branch. Order of sites.
- **Scripts under `src/themes/*/`** that write pages or sources: port, or freeze as historical.

## Phases

Eleven phases, P0 to P10. Each has an entry condition, numbered steps, tests and an exit gate; a phase is
not done until its gate passes. **The migration is built as the phases go**: every pattern phase adds its
own pre-flight checks and transform module to `migrate-children-by-type.js`, so each phase is tested
against a migrated copy of `rowauth-test`, never against hand-made fixtures alone. Paths are relative to
`src/dms/packages/` unless they start with `src/`. Line numbers are as of 2026-11-10 on `master`.

### P0 — Measure and decide (no code on the branch)

**Entry:** none. **Exit gate:** the counts table and every decision below are recorded in this doc, and
both branches exist.

- [ ] **P0.1 Audit script (read-only).** `dms-server/src/scripts/audit-children-by-type.js --db --app`.
      It prints, per app: row count per kind; for every `dms-format` list in every format
      (`sections`, `draft_sections`, `history`, `patterns`, `tenants`, `theme_refs`, `dms_envs`,
      `sources`, `views`): refs total, refs that resolve, refs to the wrong kind, rows listed by two
      parents, rows of the child kind listed by nobody; container instances used by more than one row;
      rows of a legacy type (`|cms-section`, `|template`, `|countytemplate`, any type with no `|` and no
      `:`); every `data` key ending in `_id` / `Id` or holding a `{ref,id}` shape that is not one of the
      nine lists (the association inventory).
- [ ] **P0.2 Run it** on `rowauth-test`, the hub database (`dms-mercury-3`), one MitigateNY production
      app and one TransportNY app. Paste the four tables into a "Measured" section here.
- [ ] **P0.3 Inventory of writers outside the library.** List every script under `src/themes/*/` and
      `planning/*/skills/scripts/` that creates or edits pages, sections, patterns, sources or views
      (the MitigateNY county-template migration, the TransportNY QA tools, the plan-transcription
      loaders). Mark each: port in P7, or frozen.
- [ ] **P0.4 Owner decisions**, each written into "Open decisions" as settled: revisions kept; whether pattern / env / theme order matters; section
      identity across publishes (`section_key`); `pattern.dmsEnvId` by id or by instance; discard or
      migrate the browser store; cutover order of sites; what to do with unlisted rows by kind (delete,
      or attach).
- [ ] **P0.5 Branches.** Owner creates `children-by-type` in `src/dms` and in `dms-template`. From here
      every change in this task goes there and nowhere else.

### P1 — Foundation: the stamp, the type helpers, the `children` declaration

**Entry:** P0 gate. **Exit gate:** `npm test` (server) and `vitest run src/patterns src/utils` (client)
green on the branch; a fresh SQLite app is created at data model 2; an app with no stamp is refused.

- [ ] **P1.1 The stamp.** `dms-server/src/db/table-resolver.js`: `ensureMetaTable(db, app)` creates
      `dms_<app>.dms_meta` (`key text primary key, value jsonb`) beside `data_items` and `formats`;
      `dataModelOf(db, app)` reads `data_model`, cached per process. `DATA_MODEL = 2` exported from one
      module (`dms-server/src/db/data-model.js`).
- [ ] **P1.2 The refusal.** One guard, `assertDataModel(db, app)`, called at the top of the controller's
      table resolution (the single place every read and write passes), in `/sync/bootstrap`,
      `/sync/delta`, `/sync/push`, and the UDA env resolution for `app+instance` envs. No stamp or a
      lower model throws `app "<app>" is at data model <n>; this server needs 2. Run
      migrate-children-by-type.js`. A NEW app (no `data_items` table yet) is created stamped.
- [ ] **P1.3 Legacy split mode goes.** `resolveSplitMode` returns `per-app` only; the shared
      `dms.data_items` path in `resolveTable`, `ensureTable`, `resolveFormatsTable` is deleted;
      `sql/dms/dms.sql` and `dms.sqlite.sql` keep only what is still shared (`change_log`,
      `dms_tasks`, sequences). `test-split-mode.js` is rewritten to assert the refusal of a legacy
      config.
- [ ] **P1.4 Type helpers**, identical in `dms-server/src/db/type-utils.js` and
      `dms/src/utils/type-utils.js` (the existing sync test between the two files covers them):
      `mintKey(prefix)` (10 base-36 chars from `crypto.getRandomValues`), `keyFromId(prefix, id)`
      (migration only), `childType(parentType, kind, instance)` (parent's instance + `|` + tail),
      `isContainerType(type)`, `parentInstanceOf(type)`, `revisionOf(type)` (`r5:component` → 5),
      `revisionInstance(n)`. Tests added to `test-type-utils.js` and the client twin.
- [ ] **P1.5 The `children` declaration.** `dms/src/patterns/registry.js`: a format may declare
      `children: [{ kind, format, container: bool, ordered: bool, keyPrefix? }]`. `registerPatternTypes`
      collects them into `entry.children` keyed by parent kind. `declarations.js` emits them as a
      `children` column in place of `child_refs`; `scripts/emit-formats.mjs` prints it.
      `page.childRefs.js` stays until P4 removes its last reader.
- [ ] **P1.6 Formats table.** `table-resolver.js buildFormatsTableSQL`: column `children` replaces
      `child_refs`. `routes/auth/formats.js`: `formatsFor` exposes `childrenOf(kind)` and
      `parentKindsOf(kind)`. `scripts/register-formats.js` unchanged apart from the column.
      `test-formats.js` updated.
- [ ] **P1.7 New-app DDL.** `buildCreateTableSQL` for a content table adds the constraints listed under
      "Constraints" (unique container instance, `app` check, `data` object check). No `parent_id`, no
      `auth`. The type-grammar check is added in P9, when every kind is known.

### P2 — Server child operations

**Entry:** P1 gate. **Exit gate:** new `tests/test-children.js` green on SQLite and on the Postgres
container; `test-controller.js`, `test-delete-cascade.js`, `test-transactions.js` green.

- [ ] **P2.1 `listChildren`.** `dms.controller.js`: `listChildren(app, parentInstance, kind,
      { instance, attributes, orderBy })` → rows where `type = '{parentInstance}|{kind}'` (leaf) or
      `type LIKE '{parentInstance}|%:{kind}'` (containers; the trigram index serves it), ordered by
      `data->>'rank', id` when the declaration says `ordered`. One method; `getRowsByTypes` callers move
      to it over the following phases.
- [ ] **P2.2 The Falcor route.** `dms.route.js`: `dms.children[{keys:apps}][{keys:parentTypes}]
      [{keys:kinds}]` returning an atom of `{ id, type, data, updated_at }` rows, each judged by the
      per-row read gate. This is the one new read route. A container child's instance may be given as `live`, which the server resolves from the
      parent's `published_rev` in the same statement, so a page view never needs the revision number.
      `dms.data[...].sections` (line ~402) and
      `controller.getSections` are deleted in P4.
- [ ] **P2.3 Listing auth for every kind.** `listingBlockedFor` (line ~32) loses `if (getKind(type) !==
      'page') return false`; the `length` / `byIndex` / `options` / `opts` routes call it for any type.
- [ ] **P2.4 Create validation.** `createData` (line ~1489): replace the `parent_id` block (lines
      ~1544–1590) with `assertParentExists`: for a type with a parent part, exactly one row in the app
      has that instance and is a container; its kind is one `parentKindsOf(childKind)` allows. Failure
      throws (it does not drop and warn: there is no column to leave empty). A container create with an
      instance already in use is refused before the insert, and by the unique index after.
- [ ] **P2.5 `deleteSubtree`.** `deleteData` (line ~1669): deleting a container deletes, in the same
      transaction, every row whose parent instance is the container's, recursively by declared child
      kinds, and drops split tables of deleted sources through the existing `cascadeDeletedRow`.
      `sweepChildrenOfDeleted`, `sweepDeclaredChildren`, `stampDeclaredChildren`, `childSweepMode`,
      `childStampPlan`, `ownerKindForType`, `childRefsForType` and `DMS_CHILD_SWEEP_MODE` are deleted.
- [ ] **P2.6 `moveRow`.** `setTypeById` (line ~1428, behind `dms.type.edit`) is restricted to a server
      `moveRow(app, id, newParentInstance)` that retypes one leaf row after `assertParentExists`. A
      container cannot be moved (its children name it); document that.
- [ ] **P2.7 Edit path.** `setDataById` (line ~1310): the `stampChildren` call and the child-ref merge
      logic go. An edit of a row never touches another row.
- [ ] **P2.8 Tests** (`tests/test-children.js`): list leaf and container children with order; create
      with a missing parent, an ambiguous parent, a parent of a kind the format does not allow, a
      duplicate container instance; delete a pattern and assert its pages, sections, layouts and history
      are gone and nothing else is; move a section; every case on both dialects.
      `test-parent-id.js`, `test-parent-stamp.js`, `test-child-sweep.js`, `test-duplicate-refs.js` are
      deleted.

### P3 — Client API and sync

**Entry:** P2 gate. **Exit gate:** client vitest green; `tests/test-sync.js`, `syncDelta.test.js`,
`syncBroadcast.test.js` green; a page pattern on a P4-migrated copy boots with sync on and with sync
off (this gate is checked at the end of P4, when a pattern exists to boot).

- [ ] **P3.1 Loader.** `dms/src/api/index.js dmsDataLoader`: delete the `dmsAttrsConfigs` build (line
      ~225) and the `needsRefResolution` / child resolution block in `loadFromLocalDB` (lines ~86–140).
      Add `loadChildren(falcor | sync, app, parentType, kind)`, exported from `api/index.js`, which
      reads `dms.children[...]` or the local store's parent index.
- [ ] **P3.2 `proecessNewData.js`.** Delete `loadDmsFormats` and its call (lines ~70–241). The file
      keeps attribute shaping and `defaultSort` only.
- [ ] **P3.3 Editor.** `dmsDataEditor` (lines ~465–600): delete the `dmsAttrsToUpdate` /
      `dmsAttrsData` split, the sync child loop, the `updateDMSAttrs` call. Delete
      `dms/src/api/updateDMSAttrs.js`. A caller that saves a child calls `apiUpdate` with the child's
      own config (format + type).
- [ ] **P3.4 `dms-manager/wrapper.jsx`.** Remove the `dms-format` handling; a pattern's child configs
      receive `parentType` so they can build their type.
- [ ] **P3.5 Local store.** `dms/src/sync/idb-store.js`: add a `parent` index (the parent instance
      parsed from `type`) and `getChildren(app, parentInstance, kind)`. Bump the store version; on
      upgrade from any earlier version, clear every object store and the stored revisions, then
      re-bootstrap (decision in P0.4; this is the recommended branch).
- [ ] **P3.6 Sync manager.** `dms/src/sync/sync-manager.js`: `bootstrapPattern(type)` (line ~453)
      scopes by the pattern instance and receives its pages and their children in one response;
      `localCreate` mints keys for container kinds before the row is sent, so children created in the
      same batch can name it; the temp-id back-fill of parent refs (line ~882) is deleted. The skeleton
      bootstrap (line ~385) stays one request.
- [ ] **P3.7 Delete the list collaboration.** `dms/src/sync/page-structure-provider.js` deleted;
      `room-health.js` loses its section-list room. Rich-text rooms (`yjs-store.js`,
      `ui/components/lexical/editor/collaboration.js`) are untouched.
- [ ] **P3.8 Sync server.** `dms-server/src/routes/sync/sync.js`: `buildDeltaQuery` (line ~93) and the
      pattern bootstrap (line ~296) select the pattern row, rows whose parent instance is the pattern's,
      and rows whose parent instance is one of that pattern's page keys (a subquery on
      `{pattern}|%:page`, not an in-memory list). The skeleton bootstrap selects the site row and its
      site-level children by type instead of following refs. `ws.js` (line ~519): a subscription to a
      pattern matches a change by the same two-level rule; cache the page-key set per pattern and
      invalidate it on page create / delete.
- [ ] **P3.9 Tests.** Local store: children by parent index, upgrade clears. Sync: a second client
      receives a section created by the first without any page-row write; delta after a page delete
      removes its children locally.

### P4 — The page pattern

**Entry:** P2 and P3 code complete. **Exit gate:** on a copy of `rowauth-test` migrated by the page
module: every page renders the same sections in the same order as the source (the read diff of P4.14 is
empty); create page, add / edit / reorder / delete section, publish, discard, roll back, duplicate page,
duplicate pattern, delete page all work in the browser with sync on and off; the concurrent-editing matrix
of `concurrent-page-editing-data-loss.md` shows no lost section create.

Model
- [ ] **P4.1 Formats.** `patterns/page/page.format.js`: page declares `children`: `draft_component`
      (ordered), `component` (container key = revision, ordered), `draft_layout`, `layout`,
      `page_edit`; drops `sections`, `draft_sections`, `section_groups`, `draft_section_groups`,
      `dataSources`, `draft_dataSources`, `history`; adds `published_rev` (number, default 0).
      `cmsSection` becomes two formats sharing one attribute list: `draft_component` with rule
      `{ owner: ['ancestor:pattern','parent'], ops: { read: ['edit-page','publish-page'], '*':
      ['edit-page','publish-page'] } }`, and `component` whose `read` follows the page's read
      (`anyOf: [{ blank: 'parent' }, { owner: ['ancestor:pattern','parent'], perms: ['view-page'] }]`)
      and whose writes are refused to every client (only the server publish writes revisions). Both gain
      `rank` (text) and, per P0.4, `section_key`. `is_draft` is removed. New formats `layout` /
      `draft_layout` (`section_groups`, `dataSources`) and `page_edit` (renamed from `page-edit`).
- [ ] **P4.2 Registration.** `patterns/index.js`: `childRefs: pageChildRefs` removed;
      `page.childRefs.js` deleted. `permissionDomain` entry for publish (line ~246) drops its `fields`
      / `when` on `sections` and becomes the named verb the server publish asks for.
- [ ] **P4.3 Rank helper.** `patterns/page/components/sections/rank.js`: `rankBetween(a, b)`,
      `rankAfter(a)`, `ranksFor(n)`; unit tests for 10,000 inserts at the head and for ties.

Server operations (`dms.controller.js`, exposed as Falcor calls in `dms.route.js`)
- [ ] **P4.4 `dms.page.create`.** Mints the key, inserts `{pattern}|{pagekey}:page`, an empty
      `draft_layout` and a `page_edit` row, in one transaction; returns the page with its type.
- [ ] **P4.5 `dms.page.publish`.** Requires `publish-page` on the page. Reads the draft sections and
      `draft_layout`; inserts `r{N+1}:component` rows (copying `rank`, `section_key`) and
      `r{N+1}:layout`; writes `published_rev: N+1`, `has_changes: false`, `published: ''` on the page;
      appends the history entry; then deletes revisions older than the pattern's `revisions_kept`
      (default 5). Steps before the pointer write may be repeated safely after a crash (a re-run
      overwrites the unreferenced revision).
- [ ] **P4.6 `dms.page.discard`.** Deletes the draft sections and layout and recreates them from the
      live revision. **`dms.page.rollback(rev)`** sets the pointer to a kept revision and then discards.
- [ ] **P4.7 `dms.page.duplicate`.** New key; copies draft and live revision under it; resets
      `published_rev` to 1 if the source was published.
- [ ] **P4.8 Search and tags.** The queries at lines ~1120–1200 and ~1241 become: pages of the pattern
      (`type LIKE '{pattern}|%:page'`) joined to their live revision's sections
      (`type = parentInstance || '|r' || published_rev || ':component'`). The `|cms-section` and bare
      type branches are deleted. `getSections` and its route are deleted.
- [ ] **P4.9 Pattern duplicate.** `dama/upload/dms-duplicate.js`: for each page, mint a key and copy its
      subtree; the id remap table and `|component` retyping go.
- [ ] **P4.10 Other server readers.** `dms/tasks/pattern-filter-sync/pattern-filter-sync.js` (line
      ~227): pages by `LIKE`, sections of the draft and live revision by page key. `src/pdf/*`: reads
      the live revision. `routes/uda/uda.controller.js` page lookups: same.

Client
- [ ] **P4.11 Page load.** `patterns/page/siteConfig.jsx`, `pages/view.jsx`, `pages/_utils/index.js`,
      `view.doc.js`, `api/preloadSectionData.js`: the view asks for the page row, `loadChildren(page, 'component', 'live')` and the live layout in ONE
      request (the server resolves the pointer); the editor loads `draft_component` and
      `draft_layout`. SSR preload does the same on the server render path.
- [ ] **P4.12 Section editing.** `components/sections/sectionArray.jsx` (the handlers at lines
      ~260–440): add → create one `draft_component` row with `rankBetween` its neighbours; update →
      save that row; delete → delete that row; reorder → update one row's `rank`; move between groups →
      update `group` and `rank`. Each also sets `has_changes` on the page (one small write). The
      `cloneValue` array computation, `_dirty`, and the provider hooks are removed.
      `section.jsx`, `sectionGroup.jsx`, `sectionMenu.jsx`, `section_utils.js`: read `rank`; "copy to
      page" creates a row under the other page key; the client-side `view` gate stays, and the server
      now enforces the same read through the `component` rule.
- [ ] **P4.13 Page operations.** `pages/edit/editFunctions.jsx`: `publish`, `discardChanges`,
      `insertHeader` and the template inserts call the server operations or create rows; no array
      building. `editPane/pagesPane.jsx`: create and duplicate through `dms.page.create` /
      `duplicate`; delete relies on `deleteSubtree`. `editPane/historyPane.jsx`: reads the `page_edit`
      row and lists kept revisions with a "roll back" action. `editPane/sectionGroupsPane.jsx`,
      `settingsPane.jsx`: edit the `draft_layout` row. `components/search/index.jsx`: unchanged API,
      new server query. `components/sections/template_utils.js`, `patterns/utils.js`,
      `ui/pageTemplates.js`, `ui/siteTemplates.js`, `utils/tenantProvisioning.js`
      (`provisionTemplatePatterns`, lines ~340–365): build pages through `dms.page.create` and
      sections as rows.
- [ ] **P4.14 Site management and CLI.** `patterns/admin/pages/patternEditor/pages/pagesEditor.jsx`
      (the nested `dms-format` configs at lines ~788–880), `pagesEditor.utils.js`, `sourcesTab.jsx`,
      `pageTemplateManagerPane.jsx`, `default/filterEditor.jsx`: list by type. `dms/cli/src/commands/
      page.js`, `section.js`, `utils/room-sync.js`: `page show` prints draft and live sections by rank;
      `section add|update|delete|move` write rows; `page publish` calls `dms.page.publish`;
      `cli/docs/TYPES.md` and `EXAMPLES.md` rewritten. A CLI command `dms page diff <a-db> <b-db>`
      prints per page: title, live section count, section titles in order. It is the read diff the gate
      uses.

Migration module (`scripts/migrate-children-by-type/page.js`)
- [ ] **P4.15 Pre-flight.** Per page: every ref in `sections` / `draft_sections` / `history` resolves
      to a row of the expected kind; no section is on two pages or on both lists of one page; unlisted
      `|component` and `|page-edit` rows are counted and resolved by the decisions file.
- [ ] **P4.16 Transform.** Key = `keyFromId('pg', id)`; page retyped; `draft_sections` rows →
      `{key}|draft_component` with `rank` from position; `sections` rows → `{key}|r1:component`;
      `published_rev` = 1 when the page was published, else 0 with no revision rows; layout fields →
      `draft_layout` / `r1:layout`; history row → `{key}|page_edit`; `data.parent` and
      `template_id` are left untouched (id associations) and listed. The seven attributes
      are removed from the page's `data`.
- [ ] **P4.17 Tests.** `tests/test-page-ops.js`: publish, crash between copy and pointer (simulated)
      then re-publish, discard, rollback, duplicate, delete; draft sections unreadable without
      `edit-page`; a restricted page's live sections unreadable without `view-page`; revision pruning.
      Client: `sectionArray` handler tests; rank tests.

### P5 — The admin pattern (site, pattern, tenant, theme, dmsenv)

**Entry:** P4 gate. **Exit gate:** on the migrated copy the site boots, the admin lists patterns,
themes, tenants and envs, and create / rename / delete of each works; create-site and tenant sign-up
produce a working site on an empty database; `test-sites.js`, `test-site-grants.js`,
`test-pattern-stub.js`, `adminPatternRow*.test.js` green.

- [ ] **P5.1 Format.** `patterns/admin/admin.format.js`: the site format (line ~297) drops `patterns`,
      `tenants`, `theme_refs`, `dms_envs` and declares `children` (pattern, tenant, theme, dmsenv, all
      containers). `themeFormat` rows are created as `{site}|{name}:theme`. The `PatternList` display
      component reads children.
- [ ] **P5.2 Boot.** `render/spa/utils/index.js pattern2routes` (lines ~171–470) and
      `dmsSiteFactory.jsx`: `siteData` is the site row plus its children by kind, loaded in one request
      (`dms.children[app][siteType][pattern,dmsenv,theme,tenant]`). `dmsEnvs`, `dmsEnvById`,
      `sitePatterns`, `savedAdminPattern`, theme resolution (lines ~94–200) read that. `snapshot.js`
      and `render/ssr2/handler.jsx` use the same loader.
- [ ] **P5.3 Site-level writes.** `components/patternList.jsx` (line ~266), `pages/editSite.jsx` (line
      ~372), `pages/patternEditor/default/settings.jsx` (lines ~258, ~526), `components/tenantList.jsx`
      (line ~138), `pages/tenants.jsx`, `pages/themes/list.jsx`, `themes/editTheme.jsx`,
      `patternEditor/default/themeEditor.jsx`: create and delete the child row; every "then write the
      list back to the site" step is deleted. Renaming a pattern slug is refused when the pattern has
      children (they name it), or done by a server `renameContainer` that retypes the subtree in one
      transaction; decide in this step, default refuse.
- [ ] **P5.4 Provisioning.** `pages/createSite.jsx` (steps 2–4, lines ~84–123): no final consolidated
      refs write. `utils/tenantProvisioning.js`: `createCorePatterns` and `provisionTemplatePatterns`
      create rows only; `readSitePatterns`, `backfillAdminPattern`'s re-read-and-discard, `toRef` go.
      `patterns/auth/pages/authSignup.jsx` (lines ~91–117): same.
- [ ] **P5.5 Rules.** `patterns/deriveAuthRules.js` and the site rule in `admin.format.js`: the
      per-key edit clauses for the four lists are removed; creating a pattern / env / theme / tenant is
      the `create` op of that kind, owned by the site. `dms-server/src/routes/auth/rules.js` built-in
      copy updated to match (it is deleted in P8). `judge.js`: the "field judged against a different
      owner's grants (the site row's `dms_envs`)" case goes with its test.
- [ ] **P5.6 Server.** `routes/uda/utils.js getSitePatterns` (line ~258): by type only.
      `auth/utils/siteGrants.js`, `scripts/sweep-site-grants.js`: enumerate by type.
      `scripts/migrate-site.js`: copies a site by walking types.
- [ ] **P5.7 CLI.** `cli/src/commands/site.js` (`site tree`), `pattern.js`, `utils/data.js`,
      `utils/output.js`: walk by type.
- [ ] **P5.8 Migration module (`admin.js`).** Pre-flight: every ref on the four lists resolves; a
      pattern / env / theme / tenant row not on its list is resolved by the decisions file (the three
      known duplicate `admin:pattern` rows on `mitigat-ny-prod` are decided here); container instances
      unique. Transform: themes retyped under the site; the four attributes removed; `rank` written
      from list position if P0.4 says order matters.

### P6 — Datasets and the pgEnv mirror

**Entry:** P5 gate. **Exit gate:** on the migrated copy: the datasets list, source page, version list,
upload, publish, delete source, and a section bound to an internal and to an external source all work;
`test-uda.js`, `test-uda-auth.js`, `test-source-auth.js`, `test-read-auth.js`, `test-upload-auth.js`,
`test-upload-pipeline.js`, `test-pgenv-mirror.js`, `test-datatypes.js`, `test-schedules.js` green.

- [ ] **P6.1 Formats.** `patterns/dmsEnv.format.js`: `source.views` (line ~139) and
      `patterns/admin/admin.format.js dmsEnvFormat.sources` (line ~115) removed; `children` declared
      (dmsenv → source, source → view). `patterns/datasets/datasets.format.js`: the form-manager
      `sources` list (line ~19) removed.
- [ ] **P6.2 Client lists.** `patterns/datasets/utils/datasources.js` (`buildEnvsForListing`),
      `utils/authority.js`, `utils/lifecycle.js`, `utils/changeHistory.js`,
      `pages/DatasetsList/index.jsx`, `pages/SourcePage.jsx`, `pages/SettingsPage.jsx`,
      `pages/dataTypes/default/{overview,version,admin,utils}.jsx`: read sources of an env and views of
      a source through `loadChildren` / the UDA listing, never through a list on the row.
- [ ] **P6.3 Client writes.** `pages/CreatePage.jsx`, `pages/dataTypes/internal_table/pages/
      sourceCreate.jsx`, `pages/dataTypes/internal/pages/{admin,upload,validate}.jsx`,
      `components/DeleteSource.jsx`: create the source row, then the view row; delete the source and let
      `deleteSubtree` take the views and tables. No ref appends.
- [ ] **P6.4 Server UDA.** `routes/uda/utils.js getSiteSources` (line ~278): one query by type for
      internal sources and mirrors alike. `uda.controller.js`, `uda.route.js`, `authority.js`,
      `uda.tasks.controller.js`: `createSourceView`, `updateSource`, `updateView` stop editing lists;
      version listings query `{source}|%:view`.
- [ ] **P6.5 Server upload and delete.** `dama/upload/metadata.js`, `file-upload-dms-route.js`,
      `file-upload-route.js`, `workers/{csv-publish,gis-publish,create-download}.js`, `dama/delete.js`,
      `dama/lineage.js`: same removal.
- [ ] **P6.6 Mirror.** `dama/mirror.js` (lines ~146, ~163, ~256, ~280, ~301): no `parent_id` in the
      payloads; the "append the ref to the env row" and "remove the ref" steps go.
      `scripts/reconcile-pgenv-mirror.js --verify` compares by type.
- [ ] **P6.7 Auth owners.** `routes/auth/owners.js`: a source's owner list loses `patterns:datasets` if
      it is still present; the env is the type parent. `snapshotFor({ env, app })` (line ~171) resolves
      the env by instance.
- [ ] **P6.8 Scripts.** `delete-source.js`, `deprecate-internal-dataset.js`,
      `copy-sources-to-dmsenv.js`, `prune-unreachable-tables.js`, `rename-split-tables.js`,
      `sweep-datasets-grants.js`: by type. `prune-unlisted-views.js`,
      `cleanup-stale-dmsenv-refs.js`, `retype-views-to-source.js`, `backfill-view-pattern.js`,
      `migrate-to-dmsenv.js`: deleted on the branch.
- [ ] **P6.9 Migration module (`datasets.js`).** Pre-flight: every source's type parent is an existing
      env; every view's is an existing source; sources still on a datasets pattern's legacy list and
      not under an env are refused (run `migrate-to-dmsenv.js` on `master` first); unlisted sources and
      views resolved by the decisions file; every `:data` type and split table names a source that
      exists. Transform: remove `sources` and `views` attributes; mirror stubs lose nothing but the
      column.

### P7 — mapeditor, chat, qa, and the writers outside the library

**Entry:** P6 gate. **Exit gate:** each pattern's own pages work on the migrated copy; the host app's
`src/patterns` tests green; every script P0.3 marked "port" runs dry against the migrated copy.

- [ ] **P7.1 mapeditor.** `src/patterns/mapeditor/mapeditor.format.js`, `siteConfig.jsx`, `index.js`,
      `section/index.jsx` (lines ~334, ~394): declare `children` (pattern → symbology, leaf); confirm
      by search that no list of symbologies is stored; nothing else changes.
      `scripts/migrate-dama-symbologies.js`, `backfill-component-symbology-names.js`: deleted on the
      branch. Migration module: assert every `|symbology` row's parent is a mapeditor pattern; list
      section → symbology ids as associations.
- [ ] **P7.2 chat.** `src/patterns/chat/channels.js`: `channelType(instance, chkey)`,
      `memberType(chkey)`; `createChannel` mints `ch_` keys; `listMembers(chkey)`; `channel_id` removed
      from member rows. `useLiveTail.js` (line ~32), `messages.js`, `install.js`, `pages/*`, the Slack
      importer: follow. `chat.format.js` declares `children`. Migration module: channel key =
      `keyFromId('ch', id)`; members retyped from `channel_id`; members whose channel is missing are
      refused.
- [ ] **P7.3 qa.** `src/patterns/qa/install.js` (lines ~40–60), `datasets.js`, `configure.js`,
      `admin/{patternSettings,configureTab}.jsx`, `reportIssue/ReportIssue.jsx`,
      `pages/{helpers,index,overview,pageQa,ticket,tickets,view}.js(x)`, `publish.js`,
      `cli/onPagePublish.js`, `tracking.js`, `fields.js`: read the site's patterns and envs through the
      P5 loader; create QA sources as rows; the generated QA pages use `dms.page.create`; a ticket's
      `page_key` holds the page's minted key. Migration module: rewrite `page_key` values that are row
      ids to keys, in the QA `:data` tables.
- [ ] **P7.4 Outside writers.** Port each script P0.3 marked: `src/themes/mny/county_template_update_
      migration/scripts/*`, `src/themes/transportny/qa_skills/tools/*`,
      `planning/mitigateny/skills/scripts/*`. Each is run dry against the migrated copy before it is
      called ported. Frozen scripts get a header line saying they predate data model 2.
- [ ] **P7.5 Skills and docs.** `src/dms/skills/` guides that show type strings or ref lists
      (`creating-pages-from-a-design-pattern.md`, `traversing-dms-pages.md`,
      `registering-a-pattern-type.md`, `uploading-gis-and-tabular-datasets.md`), `src/dms/CLAUDE.md`,
      `documentation/pattern-registry.md`: updated in this phase, not at the end.

### P8 — Auth layer on the type path, and the deletion sweep

**Entry:** P7 gate. **Exit gate:** the searches in P8.6 return nothing outside `planning/` and
`CHANGELOG`-style history; all auth suites green (`test-read-auth`, `test-data-auth`,
`test-source-auth`, `test-uda-auth`, `test-upload-auth`, `test-schedule-auth`, `test-datatype-auth`,
`test-auth-vocabulary`, `test-site-grants`, `test-formats`); client `declarations.test.js` green.

- [ ] **P8.1 `owners.js`.** `wrap` (line ~53) drops `parent_id` and `auth`; `loadApp` (line ~112)
      selects `id, type` and only the grant keys of `data` (`authPermissions`, `auth_permissions`,
      `pgEnv`, `source_id`, `view_id`, `dmsEnvId`) with JSON extraction, not the whole `data`, and
      still only container rows; `parentOf` (line ~203) is the type path alone, and because container
      instances are unique the `find(r => r.kind !== row.kind)` tie-break becomes an exact lookup;
      `grantsOf` (line ~66) reads `data` only.
- [ ] **P8.2 A leaf's chain.** `snapshotFor({ row })` for a section: its parent is the page (now in the
      snapshot as a container), then the pattern, then the site. No per-request query is added. Measure
      the snapshot's size and load time on the largest app before and after (pages are now in it);
      record here; if the load exceeds the current figure by more than 2×, load pages lazily per
      pattern.
- [ ] **P8.3 `index.js` header and rules.** Rule 1 becomes "a row's parent is named by its type path".
      `rules.js`, the stamp fallbacks in `ruleFor` / `vocabularyAt`, `stampPatternRow` /
      `stampSiteRow` (`patterns/registry.js`) and their call sites are deleted: on this branch every
      app has registered formats, because the migration registers them (P9.4). This completes Phase 4
      of `format-declarations-server-side.md`.
- [ ] **P8.4 Columns.** `routes/dms/rowAuthCaps.js`, `routes/dms/parentId.js` deleted;
      `dms.controller.js`: `hasAuthColumns` (line ~786), `authColumns` projections (lines ~147–210,
      ~326, ~800–860) deleted; `getPatternAuthPermissions`, `patternRowForPages` read by type.
- [ ] **P8.5 Legacy branches.** Every `|cms-section`, `|template`, `|countytemplate`, "bare doc type"
      and "legacy sources on pattern" branch in the controller, the UDA utils, the client
      (`render/spa/utils/index.js` "KEEP: old variables", `buildDatasources` legacy fallback) is
      deleted. Scripts retired per the generic-machinery table are deleted.
- [ ] **P8.6 The sweep.** These searches over `packages/dms/src`, `packages/dms/cli`,
      `packages/dms-server/src`, `src/patterns` return no code hits: `dms-format`, `parent_id`,
      `childRefs`, `child_refs`, `cms-section`, `\.ref\b` used as a row ref, `draft_sections`,
      `theme_refs`, `dms_envs`, `rowAuthCaps`, `DMS_CHILD_SWEEP_MODE`, `stampSiteRow`,
      `stampPatternRow`, `updateDMSAttrs`, `loadDmsFormats`. Record the command and its empty output
      here.

### P9 — The migration, complete

**Entry:** P8 gate. **Exit gate:** `migrate-children-by-type.js --apply` on a fresh copy of
`rowauth-test` and of the hub database ends with a stamp and an empty read diff; a second run refuses,
saying the target is already at data model 2; `tests/test-migrate-children.js` green on both dialects.

- [ ] **P9.1 Driver.** `scripts/migrate-children-by-type.js --source <config> --target <config> --app
      <app> [--decisions file.json] [--apply]`. Modules run in order: admin, datasets, page,
      mapeditor, chat, qa. Without `--apply` it runs every pre-flight and prints the plan (counts per
      kind before → after, rows to delete with ids, associations found) and exits non-zero if any check
      fails.
- [ ] **P9.2 Copy.** The target must be empty for the app. The script copies `data_items`, split
      tables, `formats`, `change_log` rows for the app, and the dama-side settings it needs, preserving
      ids and the id sequence. The source is opened read-only. (`copy-db.js` is not reused: it is
      legacy-mode only.)
- [ ] **P9.3 Decisions file.** JSON, per check that found rows: `{ check, ids, action: 'delete' |
      'attach', to? }`. The script refuses when a failing row has no decision. The file is committed
      beside the task (`planning/.../files/`) for each migrated app, so the choices are on record.
- [ ] **P9.4 After the transforms.** Move what the `auth` column holds into `data.authPermissions`
      (site-row grants) and `formats` (vocabulary), refusing on a row where both hold different grants;
      drop `parent_id` and `auth`; register the formats for the app from the branch's emitter
      (`register-formats.js` logic, called in-process); add the constraints, including the
      type-grammar check built from the registered kinds.
- [ ] **P9.5 Post-verify.** (a) every non-site row's parent instance resolves to exactly one container
      of an allowed kind; (b) no container instance is duplicated; (c) counts per kind equal the plan;
      (d) no `data` object has any of the nine list keys; (e) every association recorded in pre-flight
      still resolves; (f) `dms page diff <source> <target>` is empty for every page pattern; (g) for 50
      sampled rows per kind, `authorize(read)` for anonymous and for one admin gives the same answer on
      the source under the old code as on the target under the new code, except draft sections and
      sections of restricted pages, which are expected to tighten and are listed.
- [ ] **P9.6 Stamp.** `dms_meta.data_model = 2`, `migrated_at`, `source`, the script's git commit.
      Written last, in the same transaction as the final constraint.
- [ ] **P9.7 `setupApp`.** New apps get the stamp, constraints and formats at creation (the function
      specified in `new-app-auth-setup-and-db-constraints.md`, A2); `setup-app.js --verify` re-runs
      P9.5 (a)–(e) on a live app.
- [ ] **P9.8 Tests** (`tests/test-migrate-children.js`): a fixture app with one of each defect (ref to
      a missing row, section on two pages, unlisted section, duplicate container instance, legacy type,
      member with no channel) is refused naming each; with a decisions file it migrates; each
      constraint refuses a direct violating insert on both dialects; the unstamped source is refused by
      the server.

### P10 — Verification and cutover

**Entry:** P9 gate. **Exit gate:** every production app is at data model 2 and served from the branch's
build; both branches are merged; the old databases are released by the owner.

- [ ] **P10.1 Full suites on the branch:** server `npm test`; every auth suite; the Postgres-container
      suites (`test:pg:*`, the HTTP auth suite); client `vitest run`; `npm run lint`; `npm run build`
      for one site.
- [ ] **P10.2 Rehearsal.** For each production app: migrate a copy on the test server, serve it with a
      branch build, walk the site (the TransportNY QA process for TransportNY; the county-template
      verify script for MitigateNY), record time taken and the decisions file.
- [ ] **P10.3 Performance.** Compare, old vs new on the same app: site boot requests and bytes; a page
      view's requests; pattern bootstrap with sync on; the auth snapshot load; publish time for a
      50-section page. Record here; anything slower by more than 20% is fixed before cutover.
- [ ] **P10.4 Cutover per app** (owner runs each; none of this is automatic): writes quiesced; migrate
      from the live database into the new one; post-verify; point the server's config for that app at
      the new database; deploy the site's build from the branch; smoke test; announce. The old database
      stays untouched and read-only.
- [ ] **P10.5 Rollback, per app, until P10.6:** point the config back at the old database and redeploy
      the `master` build. Edits made after cutover are lost by a rollback; say so before each cutover.
- [ ] **P10.6 Close.** After the last app: owner merges both branches, the transportNY vendored copy is
      synced, the old databases are archived, and the tasks listed under Related are closed or dropped.

## Related

- [new-app-auth-setup-and-db-constraints.md](./new-app-auth-setup-and-db-constraints.md) — this task
  settles its `parent_id` / `auth` decision (both retired) and replaces its parent constraints; its
  `setupApp` is where new apps get this model.
- [pgenv-config-on-the-site-row.md](./pgenv-config-on-the-site-row.md) — "the site's pgEnvs are its env
  rows" becomes a type lookup; `dms_envs` on the site row goes.
- [site-ref-list-atomic-ops.md](./site-ref-list-atomic-ops.md), [delete-cascade-source-view-orphans.md](./delete-cascade-source-view-orphans.md), [pattern-duplicate-copies-dead-rows.md](./pattern-duplicate-copies-dead-rows.md), [prune-unlisted-views-deletes-mirror-rows.md](./prune-unlisted-views-deletes-mirror-rows.md) — the problems these fix do not exist in this model; decide per task whether to finish it on `master` or drop it for this.
- [concurrent-page-editing-data-loss.md](./concurrent-page-editing-data-loss.md) — Bug 1 (lost section creates) is removed structurally; its test matrix is this task's acceptance test for editing.
- [row-auth-parentage.md](./row-auth-parentage.md), [row-auth-schema.md](./row-auth-schema.md), [row-auth-production-cutover.md](./row-auth-production-cutover.md) — the `parent_id` work this retires; its cleaned clone (`rowauth-test`) is the first migration input.
- [site-bootstrap-payload-and-pattern-lookup.md](./site-bootstrap-payload-and-pattern-lookup.md), [dms-server-real-transactions.md](./dms-server-real-transactions.md) — overlap with the site boot and with `deleteSubtree`.

## Progress

- 2026-11-10: filed from the design discussion (type path as the sole arbiter, minted page keys,
  draft / revision kinds, rank on the child, publish by pointer). Nothing built; no branch yet.
- 2026-11-10 (later): phases rewritten as P0–P10 with numbered steps, files, tests and an exit gate each;
  the migration is built module by module inside the pattern phases. Reading copy:
  `planning/tessera/reports/children-by-type-path.html`.
- 2026-11-10 (later): owner worried a view must know the revision before it can load. Recorded how the
  live revision loads in one request (server-resolved `live`), and why a fixed live type was set aside.
- 2026-11-10 (later): owner settled page hierarchy: it is nav, not part of this system; `data.parent` stays
  as it is. Removed from the open decisions and from the migration's rewrites.
