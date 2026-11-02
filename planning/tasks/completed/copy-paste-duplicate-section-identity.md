# Copy / paste / duplicate: who owns a section row

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary) · **Status:** done · **Created by:** amuro@albany.edu · **Edited by:** amuro@albany.edu

Completed 2026-10-29. The sweep called for as Remaining 4 of
[row-auth-parentage.md](../current/row-auth-parentage.md). Supersedes
[page-from-template-shares-section-rows.md](./page-from-template-shares-section-rows.md) and
[section-paste-carries-stale-parent.md](./section-paste-carries-stale-parent.md), which were the two
individual findings that prompted it.

## Why this is a class of bug and not three bugs

A page's `sections` / `draft_sections` is a list of `{id, ref}` **pointers** at component rows, not
the content. So any path that copies a page by copying that list verbatim hands two pages one set of
rows. Nothing complains: both pages render correctly, and the damage only appears when somebody
edits one of them and the other changes too, or deletes one and the other goes blank.

`trackingId` is the same problem one level down. It is the `$self` stable id, so two live sections
sharing one collide even when the rows are distinct.

Measured on `rowauth-test`: **72 components were listed by two pages each** — 54 in
`mitigateny_county_template_copy`, 18 across live counties (`mitigateny_chenango`, `fulton`,
`wyoming`, each a *Wind* page and a *Lightning* page sharing sections through `draft_sections`).

## Every path that copies a section, and what it does

Swept across `packages/dms/src`, `packages/dms/cli`, `packages/dms-server/src` and `src/themes`.

| Path | Verdict |
|---|---|
| `patterns/utils.js` `sanitizeSectionsForTemplate` — Save as Template | ✓ strips `id`/`ref`/`draft_id`/`is_draft` |
| `editFunctions.jsx` `duplicateItem` — Duplicate Page | ✓ strips `id`/`ref`, mints fresh `trackingId`, both arrays |
| `editFunctions.jsx` `publish` | ✓ `delete draft.id` |
| `pagesEditor.jsx` duplicate — admin pattern table | ✓ `stripCompIdentity` |
| `useSaveAsReport.js` `cloneSections` — TransportNY Make a Copy | ✓ the model the fixes follow |
| `dms-duplicate.js` — server-side pattern Duplicate | ✓ mints new rows outright |
| `cli/src/commands/page.js` `publish` | ✓ copies each draft row into a fresh row (incident 2026-07-21) |
| `_utils/index.js` `sectionsBackill` | n/a — backfills the SAME page, not a copy |
| `tenantProvisioning.js` | n/a — static templates with no ids |
| **`editFunctions.jsx` `newPage(…, template)`** | **✗ shared the template's rows** |
| **`newReportPage.js` `buildNewReportPage`** | **✗ same, TransportNY's copy of it** |
| **`section_utils.js` `handlePaste`** | **✗ overwrote the target's `trackingId`** |

## The three fixes

**`newPage(…, template)`** — a "template" is either a saved `page_template` row, whose sections were
stripped when it was saved, **or an ordinary PAGE being used as one**, whose sections still name that
page's own component rows. Only the second kind was broken, which is why it survived: every built-in
template is the safe kind. It now runs `sanitizeSectionsForTemplate(cloneDeep(...))` before minting
trackingIds, which handles both.

This is the mechanism behind 54 of the 72 multi-owner components — `mitigateny_county_template_copy`
is exactly a page used as a template.

**`buildNewReportPage`** (`src/themes/transportny/components/CreateReportButton/newReportPage.js`) —
the same omission in TransportNY's copy of `newPage()`, and the Report Page template there *is* an
ordinary page row, so every report shared sections with it. Same fix.

**`handlePaste`** — it excluded `id` and `ref` and spread everything else over the target, so pasting
over an existing section gave it the source's `trackingId`. The exclusion list is now named
(`identityKeys`) and covers `id`, `ref`, `trackingId`, `draft_id`, `is_draft`, `parent`. Paste moves
content; the target keeps its identity. (`parent` is there so a clipboard payload copied before that
field was retired cannot put one back.)

Note this closes `section-paste-carries-stale-parent.md` twice over: the field it was about no
longer exists, and the key it proposed adding to the filter is in the list anyway.

## Tests

`packages/dms/tests/sectionCopyIdentity.test.js` — 13 vitest cases over
`sanitizeSectionsForTemplate`, `newPage`, `duplicateItem` and `handlePaste`, driving the real
functions with a capturing `apiUpdate` and a stubbed clipboard. **Three fail when the fixes are
reverted** (verified, not assumed): the shared-rows case, the trackingId case, and the legacy-parent
case. `duplicateItem` and the saved-template path are covered as regression anchors for the paths
that were already right.

## Not fixed here: removing a section orphans its row

`sectionArray.jsx`'s `remove()` drops the entry from the array and never deletes the component row;
`updateDMSAttrs` still carries `// to do, handle delete`. That is the other half of Remaining 4 —
"must stop leaving components no page lists" — and it is **not a copy defect and not a one-liner**:
a draft section removed from `draft_sections` may still be named by `sections`, so deleting on
removal would blank the published page. It needs a reference check across both arrays (and across
the room, under sync) before it can delete anything.

Today the migration's orphan sweep cleans these up, and `--verify-parents` reports them.
