# Re-stamp auth rules on existing rows after a rules change

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** next (triggered 2026-11-04: the rules changed) · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

## Objective

Pattern and site rows carry the auth rules (`data.authRules`) and permission vocabulary (`data.authVocabulary`)
they were stamped with when created (`patterns/registry.js` `stampPatternRow` / `stampSiteRow`). A later change
to a format's `rules`, or to a type's vocabulary, does not reach rows that already exist. This task brings them up
to date.

**Owner, 2026-11-03: a one-off backfill, written and run only when a change happens, not before.** Rows
stamped before 2026-11-03 carry no rules and use the server's built-in copy (`kindAuth/authRules.js`), so
until the rules first change there is nothing to backfill.

## Trigger

`packages/dms/src/patterns/authRules.sync.test.js` ("the stamped rules have not changed") holds a fingerprint of
every built-in type's rules and vocabulary. It fails when either changes and points here. When it does:

1. Make the change (formats and `kindAuth/authRules.js` together; the other sync test keeps them identical).
2. Write and run the backfill below, then update the fingerprint in the test.

App-registered types (dms-template's `src/patterns/`) are not in the fingerprint; a change to their rules needs
the same backfill, by hand.

## The backfill (to write when triggered)

- Derive each type's rules and vocabulary from the registry, the way `authRules.sync.test.js` does
  (import `patterns/index` and the app's registrations, then `stampPatternRow` / `stampSiteRow`).
- For every `%:pattern` and `%:site` row in each database: compare the derived values with the stamped ones.
  Rows with no stamp are left alone (the built-in copy covers them) unless the change also edits that copy.
- **Dry run by default**, in a read-only session (`PGOPTIONS='-c default_transaction_read_only=on'` and a
  refused-write probe): print each row that would change and the diff.
- `--apply` only after the owner has seen the dry run. Write through the normal edit path so the change log
  records it; take a backup of the affected rows first.

## Decided not to do

- **Create-time trust (owner, 2026-11-03: "not a gap").** The server accepts whatever rules the client stamps on a
  create. A `create-pattern` holder could create a pattern with looser rules, but those govern only that
  pattern's own pages and components, which its creator already controls through the pattern's grants.
  Edits to `authRules` stay guarded (`dataAuth.js` `rulesWrite`).

## Progress

- 2026-11-03: task filed; fingerprint test added to `authRules.sync.test.js`. Nothing to backfill yet.
- 2026-11-04: **triggered.** The rules gained `read` ops and the owner positions
  ([auth-layer-simplification.md](./auth-layer-simplification.md)); fingerprint now `af9a55587bf44903`.
  The backfill is written: `packages/dms/scripts/emit-auth-vocabulary.mjs` emits rules beside the
  vocabulary (`rules` per type, `:site.rules` for the site-level kinds), and
  `dms-server/src/scripts/stamp-auth-rules.js --db <config> --app <app> --manifest <file> [--apply]`
  stamps `data.authRules`, the vocabulary and `childRefs` on the site, pattern and env rows (dry run
  by default, idempotent). **To run on every site, by the owner.** Until then the server reads rows
  stamped with the old owner names (they still resolve), takes the built-in `read` op for a stamped
  rule without one, and reads an unstamped `auth` / `admin` pattern as public by its type name
  (`owners.js` `undeclaredPublicRead`, with a warning). After the run: delete `routes/auth/rules.js`,
  the fallback in `ruleFor`, and `undeclaredPublicRead`.
- 2026-11-05: **superseded in direction.** The owner chose to store the declarations server-side instead of
  re-stamping rows: [format-declarations-server-side.md](./format-declarations-server-side.md). The manifest and
  stamp script stay usable until that lands; this task closes when it does.
