# `prune-unlisted-views.js` and `retype-views-to-source.js` read the pgEnv mirror's view rows as residue

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** next · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

Both scripts take a source's `data.views` array as the authority for which view rows exist. The pgEnv mirror
(`dama/mirror.js`, [pgenv-mirror-into-dms.md](./pgenv-mirror-into-dms.md)) creates a `:view` row per
`data_manager.views` row, parented to its source by the type path and listed in no source's `data.views`.
On `mitigat-ny-prod` after the first reconcile (2026-11-07), `prune-unlisted-views.js` dry-runs to
**12,919 UNLISTED view rows** — ~12,900 of them mirror rows — and `--apply` would delete the mirror;
`retype-views-to-source.js` reports the same rows as "unowned" (harmless: it skips them).

## Proposed fix

Both scripts skip rows the mirror owns: a view whose `data.pgEnv` is set, or whose source row has
`data.pgEnv` (the mirror's shapes, `pgenv-mirror-into-dms.md` "Row shapes"). Say so in the summary
("N mirror rows, not this script's"). A test with one mirrored source + view and one legacy unlisted view.

## Testing checklist

- [ ] Dry run on a mirrored app counts only legacy residue.
- [ ] `--apply` never touches a row with `data.pgEnv`.
