# `dms stack diff`: what a preview stack changed, and whether production changed since the copy

**Initiatives:** [plat_qa_automation](../../../../../planning/initiatives/plat_qa_automation.md) (primary) · **Status:** built · **Release:** deploy — a `git pull` on mercury, so stacks serve `/_stack.json` (the CLI needs nothing more) · **Created by:** rdubowsky@albany.edu · **Edited by:** —

**Project:** dms library (CLI) · **Started:** 2026-11-12 · Design and decisions:
[stack-content-promotion.md](../../../../../planning/shared/tasks/current/stack-content-promotion.md), section 2.

## Start here (2026-11-12)

- **Building (owner's go, 2026-11-12).** His answers to the picks are under "Picks (answered)".
- The four "Checks before building" in the promotion doc have been run: results below.
- Read only on both sides. This is the first half of promotion; `dms stack apply` comes after.

## Objective

An agent (or a person) runs one command after working in a stack. It lists:
- every page, section, theme and pattern row the stack changed;
- for each one, whether production changed that row after the stack's copy was taken. Such a row is a **conflict**,
  and a conflict refuses the whole promotion (decision 4).

That answers "has production changed?" before a CLI script runs in production. It also writes the list that
`dms stack apply` will read.

## Checks before building: results (2026-11-12, on preview3)

1. **The stack's `/sync/delta` lists the writes made there: yes.**
   - `GET https://preview3.weatherenterprise.com/sync/delta?app=mitigat-ny-prod&since=0` answered without a login
     (stacks don't set `DMS_SYNC_AUTH`).
   - It listed 4 updates to page 2511590, the County Template home: ticket #106's test groups. Their revisions are
     2064686–2064689.
   - Each entry carries the row's full `data`.
2. **Writes nobody made: none seen.** In two days, nothing wrote to preview3's change log on its own. Ticket rows and
   their history are dataset rows, which the unscoped delta leaves out.
3. **`updated_at` on every write path: yes**, including `/sync/push` (`routes/sync/sync.js:603`, `:636`).
4. **`parent_id` for a promoted row:** that's for `apply`, not the diff.

**Found along the way:**
- **Each server's change feed (`/sync/delta`) stops at 1000 changes.** It is not a comparison: it lists one
  server's own writes since a revision. It returns at most 1000 changes (`DMS_SYNC_MAX_DELTA`). Past that it reports
  only a count, and it can't page.
  - Fine for a stack's own log, which starts empty and stays small.
  - No good for asking production "what changed since the copy": two days of a busy app can pass 1000.
  - So the production check is per row: production's `updated_at` against the copy time.
- **Retention:** change-log entries are compacted after 30 days (`DMS_SYNC_COMPACT_DAYS`), far beyond a 72-hour lease.
- **The copy time:** a stack's data is garage's backup, but **a backup's name is its upload time, not its snapshot
  time.**
  - The auth backup is named about 00:00:02 every night, the content backup about 00:05–00:06. Each name matches its
    upload time to the second (`aws s3 ls`, 2026-11-10 to 11-12).
  - So the job starts around 00:00 UTC, and the content dump runs about six minutes.
  - A production edit inside that window may be missing from the copy while its `updated_at` is earlier than the
    content backup's name.
  - The copy time is therefore the **earlier** of the two backups' times, minus a 10-minute margin. A late-evening
    edit (around 7 PM Eastern) may show as a false conflict; a real conflict is never missed.

## The plan

**The command:**
`dms stack diff --stack https://previewN.<domain> [--since <ISO time>] [--out <file>] [--format summary|json]`

- **Production** is the CLI's normal host (`DMS_HOST` / `.dmsrc` / `--host`). For an agent today that's the local
  dms-server, which reads production's database (production's server rejects a locally minted token).
- **The app** comes from the CLI's config. The stack is the same app.

**1. What the stack changed.**
- Read the stack's change feed: `<stack>/sync/delta?app=<app>&since=0`.
- Fold the entries per row:
  - the first action decides new (`I`) or existing;
  - the last entry holds the current data;
  - a last `D` means deleted.
- Give each row its kind with the type utilities: page, section (`component`), theme, pattern, site, other.
- If the delta reports a count instead of rows, the stack has more than 1000 changes. Stop with that message.

**2. The copy time.**
- `--since` if given.
- Otherwise the stack's `/_stack.json`, a static file that `stacks.mjs` writes (Files, below).
  - It holds `{ app, copiedAt, backups: { content, auth }, seeded: copy|restore }`.
  - `copiedAt` is the earlier backup time minus 10 minutes (above).
  - A redeploy that keeps the database keeps the file's time.
- If neither exists, stop. The tool never guesses a copy time.

**3. Production, row by row.** Read each row's `id`, `type` and `updated_at` from production.

| Stack | Production | Result |
|---|---|---|
| new | id free | **new** |
| new | id used by another row | **new**, noted "id taken in production" (apply creates rows with production's own ids anyway) |
| changed or deleted | gone | **conflict**: deleted in production |
| changed or deleted | a different `type` | **conflict**: the id is another row in production |
| changed or deleted | `updated_at` later than the copy | **conflict**: changed in production since the copy |
| changed | unchanged | **change** |
| deleted | unchanged | **delete** |

**4. Page detail** (what `apply` will need, shown now so a reviewer can read it):
- for a changed page, which of its draft-side fields changed: `draft_sections`, `draft_section_groups`,
  `draft_dataSources`, settings;
- a new section row that only a page's published `sections` points at is labelled **published copy (skipped)**. It's
  the copy a publish in the stack made (decision 2).
- A row that points at a file uploaded in the stack (a `/files/…` URL on the stack's own storage) is labelled
  **stack file (blocks apply)**.

**Output:**
- A summary: one line per row, with counts by result.
- `--out` writes the full JSON for `apply`.
- **Exit codes:** 0 clean, 3 when there's any conflict. A script or an agent can then stop on its own.

## Progress

- [x] **`deploy/stacks.mjs`** (2026-11-12):
  - `restorePlan` reads each archive's "Archive created at" (`archiveCreated`, UTC only), and `warm.json` gets
    `snapshots`;
  - `db()` writes `seed.json` (backups, snapshots, `copiedAt`, `copiedAtFrom`) with each new database;
  - `server()` copies it to `builds/<build>/client/_stack.json` before the container starts (`serveStackInfo`) and
    logs the copy time.
  - `copyTime` checked on its own: a good header is used; a non-UTC or missing header, or one later than the name or
    over an hour before it, falls back to the names minus 10 minutes.
  - **preview3** predates `seed.json`, so it serves no `_stack.json` until a `--reseed`. Its copy time by the fallback
    is 2026-11-09T23:50:03Z.
  - **Takes effect on mercury after a `git pull`:** `deploy.sh` runs the server checkout's `stacks.mjs`, and so does
    the nightly timer.
- [x] **`dms stack diff` in the CLI** (2026-11-12): `cli/src/commands/stack.js`, wired in `bin/dms.js`.
  - It uses the CLI's global `--format`/`--output`, not a new `--out`.
  - It tries `/_stack.json` on the stack's address, then on `www.` in front of it: a site's files are served on its
    site host, not its API host.
  - A row's `updated_at` with no zone is taken as UTC. SQLite stores it that way, and `Date.parse` would read it as
    local time.
- [x] **Tests (two servers):** Phase 5 in `cli/test/run.js`. The harness's `startServer` takes a port, a database
  and `fresh`. `copyAsStack()` copies the stopped test database and empties its change log, as a real seeding does.
  `runCli` takes `host`. Config `cli-test-stack.config.json`.
  - Before any production edit: new, change and delete, exit 0.
  - After a production edit: one conflict, every row still listed, exit 3.
  - With no copy time: refuses, exit 1.
  - The whole suite: 32 passed, 0 failed.
- [x] **Docs:** the CLI's `docs/README.md` "Stack"; its `CLAUDE.md` file map; dms-template `deploy/README.md`.
- [x] **Live check on preview3** (read only, production through the local server, `--since 2026-11-09T23:50:03Z`):
  1 row, `CHANGE page 2511590 Home — draft: draft_section_groups` (ticket #106's test groups), no conflict, exit 0.
- [ ] **On mercury:** `git pull`, so the next `--preview` and tonight's 02:00 warm-up write `snapshots`, `seed.json` and
  `/_stack.json`. Then check that a `--reseed` of a stack serves `/_stack.json` with "the content backup's archive
  header" as its source.

## Files

| File | Change |
|---|---|
| `packages/dms/cli/src/commands/stack.js` | new: `diff` |
| `packages/dms/cli/bin/dms.js` | wire `stack diff` |
| `packages/dms/cli/docs/README.md` | a "Stack" section |
| `packages/dms/cli/test/run.js`, `harness.js` | a second server for the tests (below) |
| dms-template `deploy/stacks.mjs` | after the database step, write `_stack.json` into the stack's served site folder. Not a library file; a small change |

No server code, no new routes (owner, 2026-11-09).

## Testing checklist

- [ ] **CLI integration test** (SQLite):
  - seed;
  - copy the database file and start a second server on it as the "stack";
  - in the stack: edit one page's draft, create a section, delete a section;
  - in "production", after the copy: edit a different page, and also the page the stack edited;
  - then `stack diff --since <copy time>` reports new, change, delete and one conflict, and exits 3.
- [ ] **No conflicts:** the same without the production edit to that page exits 0.
- [ ] **Live, read only:** `dms stack diff --stack https://preview3.weatherenterprise.com` with production read
      through the local server.
  - Expect page 2511590 as a **change**.
  - It's a conflict only if someone edited the County Template home in production after 2026-11-10 00:05 UTC. That's
    the real check working.
- [ ] `stacks.mjs` writes `_stack.json` on the next `--preview`, and it is served at `https://www.previewN.<domain>/_stack.json`.

## Picks (answered by the owner, 2026-11-12)

1. **The copy time reaches the CLI through `_stack.json`**, a static file served from the stack (no server code).
2. **Every conflict gets listed.** The owner: "we want to identify ALL the conflicts, not just stop when we find one".
   - The diff checks every row and prints every conflict.
   - Exit code 3 is only the final status, so a script knows there were conflicts.
   - Nothing stops at the first one.
3. **The copy time is the backup's own snapshot time, when it can be read.**
   - Nobody knows when garage's backup job starts, and no checkout holds its script.
   - But every `pg_dump` archive records when the dump began: `pg_restore -l` prints "; Archive created at …".
     `stacks.mjs` already runs it on each backup (`restorePlan`), so it records that time in `warm.json`.
   - **Sanity check:** the header time has to fall within the hour before the backup's name time. If it doesn't, or
     isn't there, the copy time falls back to the earlier backup time minus 10 minutes (the owner's OK for the
     fallback).
   - The header's clock is garage's. Its backup names match S3's UTC upload times, so it should be UTC. The first
     run shows which source was used.
4. **Size:** about 2 days, including the two-server test.
