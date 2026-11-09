# Who may add, edit or delete source rows from a page section

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** next · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

An auth task on its own. It was task 11 of the
[auth-levels-to-permissions.md](./auth-levels-to-permissions.md) hub. The owner moved it out on 2026-10-27
because it is about section authorization, not the levels-to-permissions migration. It builds on that branch's
guards: `routes/dms/dataAuth.js` (internal rows) and `routes/uda/sourceAuth.js` (source grants).

## Objective

A DataWrapper section (Spreadsheet, Card, table) bound to a DMS source or an `isEditable` external source shows
add / edit / delete to **any viewer** whenever its display flags allow them. The server decides these writes
without knowing about the section:
- **Internal rows** (`dms.data.*`, `/sync/push`, `…:data` kind): need `edit-source-data` on the source, under
  `DMS_DATA_AUTH_MODE` (`dataAuth.js:267`, built on `permissions_move` 10-22).
- **External rows** (`uda.data.create/edit/delete`, `uda.route.js:903,923,943`): need a login only.

## Decisions (owner, 2026-10-27)

- **(b) Section edit right.** A row write through a section is allowed when the section's flags allow the
  operation **and** the viewer may edit that section.
  - "May edit" means `edit` / `edit-section` on the section's own grants, together with the pattern's, as
    `section.jsx:253` checks on the client.
  - Lenient rule: a section with no grants is open, so today's public-entry pages keep working.
  - Rejected: (a) the source grant alone; (c) a separate public `create-source-row` permission.
- **Either path passes.** `edit-source-data` (or `update-source`) on the source also allows the write, so a source
  editor is never locked out by a page.
- **Open: a write that names no section** (raw API call, CLI, the datasets Table tab). Proposed: the source grant
  decides, the rule internal rows already follow. Not confirmed yet. The owner asked first what is sent and what it
  costs (below).

## Design (proposed 2026-10-27, as explained to the owner)

**What the client sends:** one extra trailing argument on each row write, `{ section: <componentId> }`. The section
is a `{pattern}|component` row and DataWrapper already has its id.
- Internal rows: `apiUpdate` → `dms.data.edit/create/delete` / `/sync/push`.
- External rows: `uda.data.*`.
- The client sends no flags or grants. The server reads them from the stored component, so a caller can't fake them.

**What the server does:**
1. Reads the component row by id and parses `element-data`. That gives the bound source (`sourceInfo`), the display
   flags and the section's `authPermissions`.
2. Checks:
   - the section is bound to the source being written;
   - the flag allows the operation (`allowEditInView` for edits, `allowAdddNew` for adds, `allowDelete` for
     deletes);
   - the viewer passes `edit` / `edit-section` on the section's grants combined with the pattern's.
3. If that fails, falls back to the source grant (`edit-source-data` / `update-source`).

`${app} Admin` skips all of this, as now.

**Cost per write:** one indexed read of the component plus one JSON parse. A Spreadsheet's `element-data` can be
tens of KB. The pattern lookup already happens on every guarded write.
- **Bulk edits are the real cost.** A paste or multi-row edit sends one call per row (`dataWrapper/index.jsx` ~392,
  `Promise.all`), so 500 rows means 500 component reads.
- Fix: a short-lived cache keyed on component id + `updated_at`, cleared on component writes like the token cache.

**Note:** the server never reads a section's own `authPermissions` today. Component writes are judged on page and
pattern grants only (`dataAuth.js:206-219`). This task makes the section's grants count on the server, for row
writes only.

## Current state (client)

- `patterns/page/components/sections/components/dataWrapper/index.jsx`:
  - View mode: `allowEdit = !groupBy && (isDms || isEditable) && display.allowEditInView && Boolean(apiUpdate)`.
    The add-new switch is separate.
  - Edit mode: `allowEdit = (isDms || isEditable) && !groupBy`.
  - Writes: `updateItem` / `addItem` / `removeItem` check only those flags.
- Per-column `allowEditInView`: `ui/components/table/components/TableCell.jsx`, `table/index.jsx`.
- Card `display.allowDelete`: `Card.jsx`, `Card.config.jsx`.
- Section gates (`section.jsx:253,532`, `sectionMenu.jsx:93`) cover the section's config, not its row writes.
- The datasets Table tab (`gis_dataset/pages/table.jsx`) mounts `DataWrapper.EditComp` with `onChange` for every user.

## Inventory (from [permissions-inventory.md](../completed/permissions-inventory.md))

Sections with `allowEditInView`, `allowAdddNew` or `allowDelete` set, on current pages:

| Site | Sections |
|---|---|
| mitigat-ny-prod | 3,690 (the county template) |
| wcdb | 18 (the only site using `allowDelete`) |
| npmrdsv5 | 11 |
| asm | 5 |
| landbank | 4 |

## Proposed changes (after the open decision)

- [ ] Server: a `sectionRowAuth(componentId, sourceRef, op, user)` helper (component read, binding + flag + section
  grant check, cache), used by the `:data` case in `dataAuth.js` and by `uda.data.*`; source-grant fallback.
- [ ] Client: DataWrapper sends `{ section: id }` on row writes, and ANDs `canEditSection || canWriteSource` into
  `allowEdit` and the add / delete switches.
- [ ] Datasets Table tab: the source grant (per the open decision).
- [ ] Tests: server suite for both paths, the binding mismatch, each flag, the cache, and raw calls without a section.

## Testing checklist

- [ ] An anonymous viewer of a public page with an editable Spreadsheet and no section grants can edit. With
  section grants that exclude them, they can't, unless they hold `edit-source-data` on the source.
- [ ] A raw `uda.data.edit` / `dms.data.edit` naming a section not bound to that source is refused.
- [ ] A raw call with a section whose flag is off (e.g. `allowDelete` false) is refused for deletes.
- [ ] A 500-row paste does one component read (cache).
- [ ] Existing form-style pages from the inventory keep working.
