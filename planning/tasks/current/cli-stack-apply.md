# `dms stack apply`: write a preview stack's changes to production, as drafts

**Initiatives:** [plat_qa_automation](../../../../../planning/initiatives/plat_qa_automation.md) (primary) · **Status:** built · **Release:** commit — the CLI runs from the checkout, so no deploy · **Created by:** rdubowsky@albany.edu · **Edited by:** —

**Project:** dms library (CLI) · **Started:** 2026-11-16 · Design and decisions:
[stack-content-promotion.md](../../../../../planning/shared/tasks/current/stack-content-promotion.md), section 2.
The first half is [cli-stack-diff.md](./cli-stack-diff.md).

## Start here (2026-11-16)

- **Built, tested on two local SQLite servers (CLI suite 37/37), and run once on a real stack** (qa_test, preview1,
  2026-11-16: Progress).
- **Done on the first run:** the owner published; the runbook's content-fix section is rewritten around `apply`.
- **Left:** commit. One thing not yet seen on Postgres: a removed key written as `null`.
- Nothing is committed. No server code changed, and no new routes.

## Objective

After someone has reviewed a stack, one command carries what the stack changed to production:
- it writes only with `--apply`. Without it, it prints the plan;
- pages get their draft side only, so a person still publishes in production (decision 1);
- any conflict refuses the whole promotion (decision 4);
- it covers edits made by hand in the stack, which a rerun script can't.

## The command

`dms stack apply <diff file> [--apply]`, with production as the CLI's usual host (`--host` / `DMS_HOST` / `.dmsrc`).

**Before it plans anything, it runs the diff again** against the file's stack, with the file's copy time, and stops
unless the result is the file's:

| Check | If it fails |
|---|---|
| `--host` and `--app` are the file's `production` and `app` | exit 1 |
| No conflict | exit 3, every conflict listed |
| The stack is at the file's `stackRevision`, and each row has the file's result | exit 1: "run `dms stack diff` again and review it" |
| Every row is a page, section, theme, pattern or the site row | exit 1, each one listed |
| No carried row points at a file on the stack's own storage | exit 1, each one listed |

So the file is what the reviewer approved, and `apply` reads the rows' data from the stack. **The stack has to
exist when `apply` runs.**

**The writes, in order:**
1. **New rows.** Sections first, then themes, patterns and pages, each after the new rows it names. Each gets
   production's own id.
   - A new page is created as a draft: `published: 'draft'`, `has_changes: true`, no `sections`, `section_groups`
     or `dataSources`.
   - A `parent_id` that names a row made in the stack is left out. The page's own save stamps its sections.
2. **Changed sections, themes, patterns and the site row.**
3. **Changed pages**, never their published side (`sections`, `section_groups`, `dataSources`, `published`).
   - `has_changes` is set to true when a draft field is carried. Publishing in the stack cleared it there, but
     production's published page is still the old one.
   - After a `draft_sections` write the CLI puts the page's live room in step, as `page update` does.
   - A page whose only change is its published side is skipped.
4. **Deleted rows.**

**How a changed row is written.** The server's edit merges top-level keys, so "written whole" is a patch: the
top-level keys whose value differs in the stack. A key the stack removed is sent as `null` (Postgres keeps the key
with a null value; SQLite drops it). Production still holds the copy's version, so the merged row equals the
stack's.

**Ids.** Wherever a written row names a stack-made row as `{id, ref}` (a page's `draft_sections`, for one), or as a
page's `parent`, the id is swapped for the production id. A stack id written anywhere else (inside a JSON string,
say) is not swapped, and the plan notes it.

**Before each write to an existing row** it reads that row's `updated_at` again. If it changed since the plan, it
stops with exit 3. The writes already made stay; the output marks each step done or not.

**Output:** every step (create, edit, delete) with the fields it writes, the rows not carried and why, the stack id
→ production id map, and each page someone now has to publish with its edit address (owner, 2026-11-16: the
output must give the address to click). `--site <the production site's address>` makes it a full address. `--format summary` prints it as text.

## Progress

- [x] `apply` in `cli/src/commands/stack.js`, wired in `bin/dms.js` (2026-11-16). `diff` and `apply` share one
  comparison (`buildReport`).
- [x] Tests: Phase 6 in `cli/test/run.js`, two servers. The suite is 37 passed, 0 failed.
  - The dry run lists the writes in order and leaves production untouched.
  - A different host than the file's refuses, exit 1.
  - A stack edit after the diff refuses, exit 1, nothing written.
  - `--apply`: a new section on an existing page, a retitled section, a new page with its own section, a deleted
    section and a removed key all reach production. The new rows have production's ids. Home's published
    `sections` don't change and `has_changes` is true.
  - The same file again refuses with exit 3, since production has now changed since the copy.
- [x] Docs: the CLI's `docs/README.md` "Stack" and `CLAUDE.md` file map; dms-template `deploy/README.md`; the agent
  runbook's content-fix section.
- [x] **A real stack, on Postgres** (2026-11-16, qa_test, preview1 reseeded from the 11-16 backup; production through
  the local server). Files: `scratchpad/qa_test/stack_apply_first_run/`.
  - Baseline diff: 0 rows. The stack's change, on AlphaPage › NEW PAGE 2 (page 161): draft section 162's text
    edited, one text section added (312 in the stack), the page published there.
  - Diff: 1 new, 2 change, 2 skip (the stack's published copies), 0 conflicts. The dry run wrote nothing.
  - `--apply`: 3 writes, all done, exit 0. The new section is **316** in production (312 there is another row, from
    #107). Page 161's `draft_sections` is `[162, 316]`, its published `sections` still `[163]`, `has_changes` true.
  - **The server stamped the new section's `parent_id` (161)** when the page was saved.
  - AlphaPage › Page 1 couldn't be the test page: production wrote it at 15:00 UTC for #107, after the stack's copy,
    so it would have been a conflict.
- [x] **The owner published NEW PAGE 2** in production (2026-11-16 15:45 UTC). Production made its own published
  copies (317, 318) with both lines of text. The same stack now diffs as 2 conflicts, as decision 5 expects.
- [ ] **Not yet seen on Postgres:** a removed key written as `null`. The first run removed no key.
- [x] The runbook's content-fix section is rewritten around `apply` (2026-11-16).

## Decisions (owner, 2026-11-16: all five as built)

1. **`apply` reads the rows from the stack again, checked by revision.** The diff file doesn't hold the data, so the
   stack has to exist when `apply` runs.
2. **Rows of other kinds stop the whole apply** (dataset source and view settings, for one).
3. **A new page arrives as a draft even when it was published in the stack.**
4. **A stop partway leaves the earlier writes in place.** Every check runs before the first write.
5. **One promotion per stack.** After a promotion the same stack diffs as all conflicts, and a second one needs a
   reseed. The owner wants it that way: it keeps a stack to one task, so stacks don't drag on or get used for
   several things at once.

## Files

| File | Change |
|---|---|
| `packages/dms/cli/src/commands/stack.js` | `apply`; `diff`'s comparison moved into `buildReport` |
| `packages/dms/cli/bin/dms.js` | wire `stack apply` |
| `packages/dms/cli/test/run.js` | Phase 6 |
| `packages/dms/cli/docs/README.md`, `CLAUDE.md` | docs |
| dms-template `deploy/README.md`, `src/patterns/qa/skills/agent-ticket-run.md` | docs |
