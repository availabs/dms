# Change history: keep the history tables from growing without bound

**Initiatives:** [dms_qa_ticketing](../../../../../planning/initiatives/dms_qa_ticketing.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** next · **Created by:** rdubowsky@albany.edu · **Edited by:** —

Logged 2026-10-09 (owner: the history tables "have the potential to get GIGA big"). Not started. The writer is
in [`qa-pattern-type.md`](./qa-pattern-type.md) Open work §4; the setting is documented in
`patterns/datasets/internal-datasets-overview.md`, "Change history".

## Objective

A dataset with change history on can't grow a history table that slows its own saves, its readers, or the
server. Retention is a per-dataset choice. QA's history must still cover the contract's reporting window.

## Why it grows

- **One row per changed field per save** (`writeChangeHistory`, `dms-server/src/routes/dms/dms.controller.js`).
  A save that changes 3 tracked fields writes 3 rows. Only text-like fields merge (same person, row and field
  within 30 s).
- **Creates write rows too** (2026-10-09): one row per tracked field that has a value. Only the Falcor
  create/edit routes write history (`changeHistory` is off by default per call), so uploads, workers and
  other server-side callers don't.
- **Any internal dataset can opt in**, not only QA. The datasets Admin tab panel offers `All columns` (`'*'`).
  A large dataset with `'*'` and frequent or bulk edits (CLI, agents, spreadsheet paste) writes rows × columns.
- **Each history row also writes a `dms.change_log` row** (`appendChangeLog(… 'I' …)` in the writer), so history
  doubles the sync log's write volume. `change_log` is compacted; the history is not.
- Nothing deletes history rows except the 30 s merge undo and deleting the history dataset.

## Where size will hurt (what the table has today)

A history table is a split table (`data_items__<slug>_<view>_data`). It gets only `PRIMARY KEY (id)` and an
`(app, type)` btree (`db/table-resolver.js` ~252-265). Every row has the same `type`, so the second index does
nothing, and no JSON field is indexed.

| Reader / writer | Query shape | At size |
|---|---|---|
| Burst merge (every typed save) | `WHERE type = $1 ORDER BY id DESC LIMIT 200`, then `row_id`/`field` | Walks the PK backwards. Stays flat by design. |
| Ticket page History | `data->>'row_id' = ?`, sorted by `id` | **Sequential scan of the whole table** on every ticket open. |
| Ticket page History count ("N changes") | `count(*)` with the same filter | Same scan. |
| Overview Recent activity (being built) | `data->>'field' = 'status'`, join to tickets on `row_id`, `id desc`, 10 rows | Walks the PK backwards until 10 match. Fine while status rows are common; pagination's length count is a full scan. |
| Contract queries (response time, quarterly) | by `row_id`, `field`, `at` ranges | Full scans. |

## Options (to decide when this starts)

1. **Measure first.** Rows per day on MNY's install after rollout, and the table size. QA alone may never matter.
2. **Expression indexes on history tables:** `(data->>'row_id')`, and `(data->>'field', id)` for the feed. Created
   with the history dataset (`ensureHistoryDataset` / QA install), plus a migration for existing ones. Cheap, and it
   fixes every read above except whole-table counts.
3. **Retention setting** on `change_history` (e.g. `retain: {days}` or `{rows}`), enforced by a periodic server
   job. QA's default must cover the contract window (Feb 2026 backfill through the quarterly reports).
4. **Guard the opt-in.** The Admin panel warns, or refuses `'*'`, on datasets above a row count, or caps history
   writes per save (a bulk edit records one summary row instead of rows × columns).
5. **Skip `change_log` for history rows.** Only if sync doesn't need them. Check what reads them first.
6. **A dedicated narrow table** (typed columns, real indexes, partitioned by month) instead of a DMS split table.
   This is the biggest change: history stops being an ordinary dataset that sections can bind to, which is what
   the Ticket page and the feed rely on.

**Suggested first step:** 1 + 2. Then 3 when there's a real number.

## Checks before starting

- [ ] Does the editor's bulk branch, or any bulk route, go through `setDataById`? (If not, bulk edits write no
  history at all, which is its own gap.)
- [ ] What reads `dms.change_log` rows for split history types (sync)?
- [ ] Postgres test run of the writer is still open (`scratchpad/qa_test/run_change_history_pg.sh`).
