# Auth rules as pattern data: one interpreter, rules each pattern carries, an Advanced auth tab

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [dms_permissions_move](../../../../../planning/initiatives/dms_permissions_move.md) · **Status:** next · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

## Objective

Which permission each write needs is written by hand today, per row kind, in `dms-server/src/routes/dms/dataAuth.js`
`judge()`, and again on the client in each pattern's gates. Master's library `CLAUDE.md` lists that `switch` as debt:
a new pattern type can't get auth rules without a library release, and a kind with no `case` falls through to
"signed in".

Owner (2026-10-29): **the rules live in pattern data**, not in client or server code, so there is no client/server
divide and a pattern's rules can be customised without a release. Alex's `auth-as-data` files (rules as one
serialisable object + a pure interpreter) are the structure to start from; the rules they define can change.
Authors edit them in the pattern editor, in a **Settings → Advanced auth** tab.

## What exists (trial, 2026-10-27/29, uncommitted)

- `dms-server/src/routes/dms/authRules.js`: Alex's `rules.cjs` structure with the agreed rules (hub
  `auth-levels-to-permissions.md`, "Decisions 2026-10-29").
- `authJudge.js`: Alex's `judge.cjs`: `judge(rules, env, req) → { allow, reason }`. No I/O; the caller supplies
  `env.grants` (owner name → authPermissions) and `env.holds`. One addition (2026-10-30, below).
- `dataAuth.js`: `judgeAsData` + `resolveOwner` (the eight owner lookups the rules can't express), behind
  `DMS_DATA_AUTH_JUDGE=data`. Default is still `judge()`.
- Result: `test-data-auth` **51/51 with both judges** since the open-pattern clause (2026-10-30); every other
  auth suite passes.

## Progress

**2026-11-03: the rules moved into the format files, are stamped on rows, and the server reads them** (owner,
2026-11-02 via Alex: "the format files is where the permissions definitions should live … a `rules: {}` object
on the correct format object"; 2026-11-03: "fallback to built-in rules, and keep a note … why we still have [a]
built-in copy").
- **Authored:** each format object carries `rules: { [rowKind]: rule }`, a one-to-one copy of `authRules.js`:
  `admin.format.js` (site, pattern, tenant, theme, dmsenv), `page.format.js` (page, component, page-edit),
  `datasets.format.js` (source, view; `data` rides on `source`, having no format of its own).
- **Collected** at registration: `patterns/deriveAuthRules.js` (`deriveAuthRules`, `validateAuthRules`, which
  refuses a rule without `ops` or naming an owner the server can't resolve). `registry.js` stores
  `authRules` on each entry; a new key `rulesOn: 'site'` (admin) means "stamp on the site row".
- **Stamped:** `stampPatternRow(row)` (vocabulary + childRefs + rules) on every pattern create: Add Pattern
  (`patternList.jsx`, `editSite.jsx`, replacing their inline vocabulary stamp) and `tenantProvisioning.js` (core
  auth/admin rows, template patterns, the admin backfill, which stamped nothing before). `stampSiteRow(row)` on
  every site create: Create Site, Add Tenant, tenant signup. Site rows get admin's rules; the admin pattern row
  gets none.
- **Read** (`kindAuth/dataAuth.js` `ruleFor`, data judge only): site-level kinds from the app's site row
  (`controller.getSiteRows`, new), page kinds from their pattern row, datasets kinds from the first stamped
  datasets pattern. No stamp → the built-in rule. A stamped rule without `ops` fails closed. Never read from the
  row being created.
- **Built-in copy kept:** `kindAuth/authRules.js`'s header says why (unstamped rows, the server can't read the
  registry, `DEFAULT`) and when it can go (after a backfill). `patterns/authRules.sync.test.js` fails if it and
  the formats differ (5/5 now).
- **Escalation guard, in code:** writing `authRules` needs site `*` on the site row, and `edit-pattern-permissions`
  held on the pattern itself (or site `*`) on a pattern row; the open-pattern clause does not count. Both judges.
- **Tests:** `test-data-auth` 58/58 under both judges (+5: stamped rule wins, broken stamp fails closed,
  site-row rules, `authRules` writes under each judge). Every other auth suite and sync / graph / workflow /
  schema-drift pass; the only failures are Alex's two known ones (`uda-auth` 27/28, `row-auth-uda-diff`).
  Client: sync test 5/5, `adminPatternRow` updated for the stamp; the six other failing client test files fail
  at HEAD too. `npm run build` ✓.
- **Open:**
  - ~~Only the data judge reads stamps.~~ **Done (owner, 2026-11-03): the rules interpreter is the default
    judge.** `DMS_DATA_AUTH_JUDGE=code` goes back to the hand-written `judge()` (kept as the fallback; it reads
    neither the rules nor the stamps). `test-data-auth` 62/62 under each, with four new blank view / data-row
    tests (their own app, since datasets grants are unioned app-wide).
  - **Stamps freeze.** A row keeps the rules it was created with; a later library change to a format's rules
    doesn't reach it (true of `authVocabulary` too). Needs a refresh: a backfill script, or re-stamping when an
    admin saves the row.
  - **Create-time trust.** The server can't tell rules derived from the registry from hand-written ones on a
    create, so a `create-pattern` holder could create a pattern whose rules are looser. The same holds for
    `authVocabulary`. Options: refuse `authRules` on create unless the caller holds site `*`, or validate against
    a server-held list of known rule sets.
  - `authVocabulary` is writable with only `edit-pattern` (Alex's key; noted for him).

**2026-10-30: open-pattern clause (decision 5) added.** A generic rule key, no kind name in the interpreter:
`ifOwnerBlank: { owner, perms, unless: { field, in } }`. When the kind's own owner grants nothing (besides
`public`), a signed-in user's requirements on that owner are checked as the clause instead, unless the stored
row's `field` is in the list. The pattern rule uses it: `site-grants` / `view-pattern-list`, unless
`pattern_type` is `auth` or `admin`. The interpreter takes two new inputs: `row` (the stored data, or the new data
on create) and an optional `env.isBlank(ap, ownerName)` (dataAuth passes `hasGrants`; the blank-row audit records
which owners were blank through it). Test: `test-data-auth` gains a `view-pattern-list` holder who may edit the
open pattern but not one with grants. **Tell Alex** (his structure; decision 6 of the hub).
- The blank-row audit (`permissions-access-diff.blank.js`) now runs on these rules too, so it follows whatever
  they become.
- Not built: storage, defaults per pattern type, the Advanced auth tab. **Storage premise (2026-10-30):** a
  pattern's "format" is a JS object in the library (`page.format.js`, `datasets.format.js`), not data. The
  `formats` table and `dms.format` route exist but nothing writes the table and no client reads the route, so the
  library CLAUDE.md's "Formats are rows … the server already reads" is misleading. Per-pattern rules belong on
  the pattern row (beside `authPermissions`); defaults per pattern type need a home the server can read.

## Design

1. **Who carries which rules.** Each row kind's rules sit on the pattern that owns those rows:
   - admin pattern: `site`, `theme`, `tenant`, `pattern` (the site-level kinds);
   - page pattern: `page`, `component`, `page-edit`;
   - datasets pattern: `dmsenv`, `source`, `view`, `data`;
   - any registered pattern type (chat, qa, mapeditor): its own kinds (`channel`, `member`, …).
   Stored on the pattern row, e.g. `data.auth_rules` (name to settle; underscores per the naming rule).
2. **Defaults.** Each pattern type ships default rules with its registration (`registry.js`, client). A pattern
   with no `auth_rules` uses its type's defaults. The server can't import the client registry (mirror rule), so the
   defaults must reach it as data: seeded into the pattern row on create, or written once by a migration. Decide
   which; seeding keeps "the rules are on the row" true everywhere.
3. **One interpreter, two copies.** `judge()` stays a small pure function. The client gets the same function (hand
   mirrored, with a cross-reference comment), so a control is shown exactly when the server would allow it.
4. **Owner resolution stays code, then shrinks.** The eight resolvers in `dataAuth.js` (`site-grants`,
   `datasets-grants`, `self-pattern`, `parent-pattern`, `parent-pattern+row`, `self-source`, `owning-source`,
   `source-by-slug`) are the part rules can't say. Four are "walk to my parent": they collapse into amuro's
   `parent_id` walk (`server-side-auth-general.md`). `site-grants` / `datasets-grants` become registry capabilities
   (`providesSiteGrants`, `providesDatasources`) instead of `pattern_type` names.
5. **Editing rules is an escalation.** Whoever can rewrite a pattern's rules can grant themselves anything on it.
   - Writing `auth_rules` needs `edit-pattern-permissions` on that pattern; on the admin pattern (site-level kinds),
     site `*`. These two checks are library-fixed, not rule-driven, so a pattern can't rule them away.
   - Rules are validated on save (known clause types, known owners, verbs from the pattern's vocabulary); an
     invalid rule set is refused, never half-applied.
6. **Pattern editor: Settings → Advanced auth tab.**
   - Per row kind: create / edit / delete verbs, the per-key table (`byKey`, `when`, `onlyKeys`), escape.
   - Shows the type's defaults, the row's overrides, and "reset to defaults".
   - Gated by the same check as 5. v6 mockup first (mockup-first rule), named in the confirmation question.

## Open

- **Open-pattern rule (decision 5, keep).** ~~The rule language can't say this yet.~~ Built 10-30 as `ifOwnerBlank`
  (Progress). **Still open:** core patterns are excluded by name in the rules data
  (`unless: { field: 'pattern_type', in: ['auth', 'admin'] }`), not by a capability. The interpreter knows no
  names; the rules file does, until the rules move to pattern data and the core patterns carry their own.
- **Unknown kinds (decision 8).** Refuse once every registered pattern type ships its rules; until then chat
  (`channel`, `member`) and the mapeditor rely on "signed in".
- **Blank rows (decision 1, read-only).** With no grants anywhere up the chain, edits are refused: the interpreter's
  `holds` changes, the rules don't. Lands with the read-only default, not here.
- **Site `*` and datasets (decision 4).** Site `*` passes every kind except `dmsenv` / `source` / `view` / `data`
  today (and the UDA routes ignore it). With rules as data, the `escape` goes on the datasets kinds too.
- Where `auth_rules` sits in the pattern format, and whether the CLI can read and write it.

## Testing checklist

- [x] The rules judge reproduces `test-data-auth` in full (open-pattern clause added, 2026-10-30).
- [ ] A pattern with overridden rules: the server and the client gate agree on every op.
- [ ] Writing `auth_rules` without `edit-pattern-permissions` (site `*` for the admin pattern) is refused.
- [ ] Invalid rules are refused on save; a pattern with none uses its type's defaults.
- [ ] Advanced auth tab: edit, reset, refusal for a user who can't edit permissions.
