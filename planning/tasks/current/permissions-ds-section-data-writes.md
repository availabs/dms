# Datasets: who may edit source rows from a page section or the Table tab

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** blocked:decision · **Created by:** ssangdod@albany.edu · **Edited by:** —

Part of [auth-levels-to-permissions.md](./auth-levels-to-permissions.md) (hub). Client and server. Depends on
[permissions-server-source-auth-core.md](./permissions-server-source-auth-core.md). DMS internal rows are written
through `dms.data.edit/create/delete`, which is defects B/E of
[auth-permission-chain-and-unguarded-writes.md](./auth-permission-chain-and-unguarded-writes.md); coordinate so the
two don't invent different rules.

## Objective

A DataWrapper section (Spreadsheet, Card, table) bound to a DMS source or an `isEditable` external source lets
**any viewer** add, edit and delete rows. The only gates are the section's display flags. The server checks
login only (`uda.data.*`) or nothing (`dms.data.*`).

## Current state

- Client, `patterns/page/components/sections/components/dataWrapper/index.jsx`:
  - View mode `allowEdit = !groupBy && (isDms || isEditable) && display.allowEditInView && Boolean(apiUpdate)` (`:498`);
    add-new switch `:580`; edit mode `allowEdit = (isDms || isEditable) && !groupBy` (`:431`).
  - Writes `updateItem` / `addItem` / `removeItem` (~`:347,397,415,621,676,703`) check only those flags.
  - Per-column `allowEditInView` (`ui/components/table/components/TableCell.jsx:200`, `table/index.jsx:452,570-597`);
    Card `display.allowDelete` (`Card.jsx:225-236`, `Card.config.jsx:728`).
  - Section gates (`section.jsx:253,507,532`, `sectionMenu.jsx:85`) cover the section's config, not its row writes.
  - Datasets Table tab (`gis_dataset/pages/table.jsx:212-221`) mounts `DataWrapper.EditComp` with `onChange` for every user.
- Server: `uda.data.create/edit/delete` (`routes/uda/uda.route.js:725,745,765`) require login; the controller
  re-checks `isEditable` and the PK (`uda.controller.js:1134-1167`). `dms.data.*` has no check.

## Decision needed

Is "a page lets the public submit rows" a feature? Some sites use editable sections as forms or shared
trackers. Options:
- (a) Row writes need `edit-source-data` (or `update-source`) on the bound source. Authors who want public
  entry grant `public: ['edit-source-data']` on that source. Simple and consistent.
- (b) Row writes are allowed when the section allows them **and** the viewer may `edit` the section; the source
  grant isn't consulted. Matches how authors think, but the server can't check it for a raw API call without
  knowing the section.
- (c) Split create from edit/delete: `create-source-row` can be public (forms), edit/delete need `edit-source-data`.
Recommendation: (a), with (c)'s split if forms are a real use. Check the inventory of editable sections first
([permissions-inventory.md](./permissions-inventory.md)).

## Proposed changes (after the decision)

- [ ] Vocabulary entry in `datasets.format.js` `permissionDomain` and `adminPermissions.js`.
- [ ] Server: `uda.data.*` → source permission via the core helper; DMS data rows via the defect-B work.
- [ ] Client: DataWrapper computes `canWriteRows` from the bound source's grants (pattern ⊕ source) and ANDs it into
  `allowEdit` and the add/delete switches; the section's settings show authors why editing is off.
- [ ] Datasets Table tab: same gate.

## Testing checklist

- [ ] An anonymous viewer of a public page with an editable Spreadsheet can't edit unless granted; with the grant, can.
- [ ] Raw Falcor `uda.data.edit` / `dms.data.edit` on that source fails without the grant.
- [ ] Existing form-style pages from the inventory keep working after their grants are set.
