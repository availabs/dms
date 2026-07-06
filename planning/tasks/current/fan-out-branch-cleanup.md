# Clean up `fan_out` feature branch for merge to master — HIGH PRIORITY

## Objective

The `fan_out` branch (originally scoped to the ReportRouteList/report-page work — see
[reportroutelist-page-templates.md](./reportroutelist-page-templates.md) and
[reports-v2-roadmap.md](../research/reports-v2-roadmap.md)) has grown far past that original scope and
needs to be cleaned up and merged back into `master` before more work stacks on top of it.

This spans **two repos**, both currently on branches ahead of their respective `master`:

- **`dms-template`** (outer app) — branch `fan_out`, ~22 commits ahead of `master`.
- **`dms`** (submodule, `src/dms/`) — branch `fan_out`, ~11 commits ahead of `master`.

Because `dms-template` pins the submodule to a specific commit, the two cleanups are coupled: the outer
repo can't merge to master until the submodule branch it depends on has also merged (or the outer repo's
submodule pointer is otherwise resolved).

## Why this matters

- Branch has accumulated unrelated/out-of-scope changes over many commits, making it hard to review or
  trust as a single unit, and the commit history doesn't read as logical, reviewable chunks.
- Blocks other work that would otherwise build on `master` cleanly.

## Also: dead branches to delete (`dms` submodule)

`custom_buckets`, `data_join`, and `group_page_filter` (siblings of `fan_out` off `master` in the `dms`
submodule) are **dead** — no longer needed — and should simply be **deleted**, not merged or reconciled.
Confirm each is actually fully superseded/abandoned before deleting, but default assumption per the user
is that these are cleanup, not merge, candidates.

## Proposed approach for `fan_out` (to be refined when picked up)

1. Review the full commit list on both branches vs. their `master` (`git log --oneline master..fan_out`)
   and categorize commits: in-scope (ReportRouteList/report-page work) vs. drive-by/out-of-scope changes.
2. **Rewrite history into logical chunks** — the user wants the commits themselves cleaned up (e.g.
   interactive rebase / squash-and-reorder), not just a decision about what merges, so that `fan_out`'s
   history reads as a coherent set of reviewable changes rather than the current stream-of-consciousness
   commit log (many "fix", "wip", "styling" commits mixed with functional changes).
3. Decide whether any truly out-of-scope commits should be split into their own branch(es)/PR(s) so they
   can land independently — get the user's call before assuming.
4. Check the submodule pointer situation: does `dms-template`'s `fan_out` currently reference the `dms`
   submodule's `fan_out` branch tip? Sequence the two merges accordingly (submodule first, then bump the
   pointer in the outer repo before/as part of its own merge).
5. Re-verify the in-scope functionality still works after the history rewrite, before merging to master.

## Status

Not started — captured as a high-priority placeholder per user request (2026-07-06). No commits have
been categorized yet.
