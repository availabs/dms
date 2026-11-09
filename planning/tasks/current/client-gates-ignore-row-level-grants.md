# Client: a page-level or source-level grant alone does not reach the page editor or the source page

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** next · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

Found 2026-11-07 by auth-ui-check (dms-template `planning/shared/skills/auth-ui-check`) on `mitigat-ny-prod`,
run 7, as a signed-in user in no granting group (`dms-authcheck-nogroup`, group `mitigat-ny-prod Public`):

1. **Page level.** The page editor's Permissions pane granted the user `edit-page` + `publish-page` on one page
   of a pattern that grants them nothing (`public: [view-page]`, `AVAIL: [*]`). The page row carries the grant
   (`dms raw get`). Opening `/<pattern>/edit/<slug>` as that user renders the site's home page: the pattern's
   edit route is not built or not matched for a user the PATTERN's grants do not name, so a page-level grant
   never opens the editor. The server's judge would allow the edit (page grants merge over the pattern's).
2. **Source level.** The scratch source's Access editor granted the user `view-source`. The source row carries
   it. Opening `/cenrep/internal_source/<id>` as that user shows "No source #… — it may have been deleted, or it
   lives in an environment this catalog isn't bound to": the catalog resolves sources through the env/pattern
   grants (`view-sources`), so a source-only grant is unreachable through the UI. The server allows the read.

Both are the client gating on the owner row's grants instead of merging the row's own, the same shape as
`client-open-row-rule-shows-every-editor.md` from the other side. Screenshots:
`scratchpad/mitigat-ny-prod/auth-ui/nogroup/page_permissions_granted.png`, `…/source_access_granted.png`.

## Proposed fix

Route building (`render/spa/utils pattern2routes`, the edit route's `reqPermissions`) and the datasets catalog
lookup judge with the merged chain (pattern ⊕ page, env ⊕ source) the way `CMSContext.isUserAuthed` already
does inside the page, so the client agrees with the server's walk.

## Testing checklist

- [ ] auth-ui-check `page_permissions` "page-level grant opens the editor" and "Publish button shown" pass for nogroup.
- [ ] auth-ui-check `source_access` "source readable after the grant" passes for nogroup.
