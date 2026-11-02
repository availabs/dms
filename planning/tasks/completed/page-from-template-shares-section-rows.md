# A page created from a template shares the template's section ROWS

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary) · **Status:** done · **Created by:** amuro@albany.edu · **Edited by:** —

**Fixed 2026-10-29** in the copy/paste/duplicate sweep — [copy-paste-duplicate-section-identity.md](./copy-paste-duplicate-section-identity.md). `newPage()` now runs `sanitizeSectionsForTemplate` over the template's sections, and the same omission in TransportNY's `buildNewReportPage` was fixed with it.

Found 2026-10-29 while answering "what do you mean by moves?" on
[row-auth-parentage.md](../current/row-auth-parentage.md). **Not implemented — raised for the
copy/paste/duplicate sweep the owner has called for.**

## The bug

`patterns/page/pages/edit/editFunctions.jsx` `newPage()`, the template branch:

```js
newItem.draft_sections = cloneDeep(template.draft_sections)
    .map(s => ({ ...s, trackingId: crypto.randomUUID() }));   // ← `s.id` is NOT deleted
```

`updateDMSAttrs` treats an element that still carries an `id` as an **existing row**: it pushes the
ref and, when the element is not `_dirty`, writes nothing at all. So the new page's
`draft_sections` do not point at copies of the template's sections — **they point at the template's
own component rows.**

Editing a section on the new page edits the template, and every other page ever made from it.

The same omission is in the host app: `src/themes/transportny/components/CreateReportButton/newReportPage.js:40`.

## Why it reads as a bug, not a design

Three sibling call sites in the same file do delete the id, and a fourth in the host app does too:

| call site | `delete s.id`? |
|---|---|
| `editFunctions.jsx` `duplicatePage` | **yes** — on both `sections` and `draft_sections` |
| `editFunctions.jsx` `publish` | **yes** |
| `editFunctions.jsx` `discardChanges` | **yes** |
| `useSaveAsReport.js` `cloneSections` | **yes** — `id`, `ref`, `draft_id`, `is_draft` |
| **`editFunctions.jsx` `newPage(…, template)`** | **no** |
| **`newReportPage.js` (host app)** | **no** |

All six regenerate `trackingId`, and all six carry a comment about why. Only the two template paths
stop there. `duplicatePage` even carries `// delete s.parent; // todo update this with the new
parent id` — the id itself is deleted, so the intent is plainly to make fresh rows.

## Measured

On the `rowauth-test` clone (33,342 components), **72 components are listed by two pages each**:

- 54 in `mitigateny_county_template_copy`, pages 2231655 / 2231668
- 18 in three live county patterns — `mitigateny_chenango` pages 2546068 (*Wind*) and 2546044
  (*Lightning*), and the same pair in `mitigateny_fulton` and `mitigateny_wyoming`

In every case the shared rows are in `draft_sections`, and exactly two pages name them — the shape
`newPage(…, template)` produces when one page is made from another.

Prod was not measured. The same query run per app is the first thing to do:

```sql
-- components named by more than one page
```

## The fix

`delete s.id` (and `ref`, `draft_id`, `is_draft`) in both template branches, i.e. make them use the
same cleaning `cloneSections` already does. Then look at the rest of the template path for fields
that should not travel — see [section-paste-carries-stale-parent.md](./section-paste-carries-stale-parent.md)
for the same question asked of paste.

## Repair of existing data

Already built, in `dms-server/src/scripts/migrate-row-auth.js` pass 3: the lowest-id owner keeps the
original row, every other owner gets a faithful copy, and that owner's reference arrays are
repointed at it (`planDuplication` / `repointRefs` in `routes/dms/parentId.js`). Verified on the
clone — 72 repaired, every component then named by exactly one page, 0 dangling refs.

`--verify-parents` reports the condition as *named by 2+ owners* and exits 1, so once the client fix
lands it is also the regression check.

## Testing

A unit test over the template branch asserting the produced `draft_sections` carry no `id` — there
is no existing test file for `editFunctions.jsx`.
