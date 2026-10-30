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
- `authJudge.js`: Alex's `judge.cjs`, unchanged: `judge(rules, env, req) → { allow, reason }`. No I/O; the caller
  supplies `env.grants` (owner name → authPermissions) and `env.holds`.
- `dataAuth.js`: `judgeAsData` + `resolveOwner` (the eight owner lookups the rules can't express), behind
  `DMS_DATA_AUTH_JUDGE=data`. Default is still `judge()`.
- Result: `test-data-auth` 50/51 with the rules judge. The miss is the open-pattern rule below; every other auth
  suite and sync pass.

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

- **Open-pattern rule (decision 5, keep).** A pattern with no grants is editable only by site `view-pattern-list`
  holders. The rule language can't say this yet: it needs a clause like
  `ifOwnerEmpty: { owner: 'site-grants', perms: ['view-pattern-list'] }`, and core patterns (admin, auth) excluded by
  a capability, not by name.
- **Unknown kinds (decision 8).** Refuse once every registered pattern type ships its rules; until then chat
  (`channel`, `member`) and the mapeditor rely on "signed in".
- **Blank rows (decision 1, read-only).** With no grants anywhere up the chain, edits are refused: the interpreter's
  `holds` changes, the rules don't. Lands with the read-only default, not here.
- **Site `*` and datasets (decision 4).** Site `*` passes every kind except `dmsenv` / `source` / `view` / `data`
  today (and the UDA routes ignore it). With rules as data, the `escape` goes on the datasets kinds too.
- Where `auth_rules` sits in the pattern format, and whether the CLI can read and write it.

## Testing checklist

- [ ] The rules judge reproduces `test-data-auth` in full (open-pattern clause added).
- [ ] A pattern with overridden rules: the server and the client gate agree on every op.
- [ ] Writing `auth_rules` without `edit-pattern-permissions` (site `*` for the admin pattern) is refused.
- [ ] Invalid rules are refused on save; a pattern with none uses its type's defaults.
- [ ] Advanced auth tab: edit, reset, refusal for a user who can't edit permissions.
