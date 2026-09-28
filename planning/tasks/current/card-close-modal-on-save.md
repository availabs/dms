# Card: `closeModalOnSave` + `save_publish` — the save-side twins of the delete hooks

**Status: BUILT (2026-09-28); lint clean (pre-existing errors only); NOT yet verified in a browser; wcdb DRAFT updated 2026-09-28 (sections 1965808 caption, 1965809 Card on `station_admin` /administrators; backups in dms-template/scratchpad/wcdb/backup-edit-role-20260928-101048). Not published; site not redeployed.**
**Origin:** user report: the Edit role modal on wcdb `/admin/administrators` "has no way to save the changes" and no way to delete.

## Cause

The modal's Card used `display.liveEdit: true`. Live edit saves each field on a 500 ms debounce and
**deliberately renders no Save/Cancel**. `Card.jsx`'s `showSaveCancel` needs `!liveEdit`. So the form gave no
sign of saving, and The board behind the modal never refetched. There was also no `allowDelete`.

## Fix

- `ComponentRegistry/Card.jsx`: `updateItemWrapped`. After a **form** save (no `attribute`, so live-edit
  keystrokes are not wrapped), it clears `display.closeModalOnSave` and publishes
  `saved:<id>:<ts>` on a `save_publish` provider. The timestamp lets a second save of the same row
  re-trigger the refetch. A rejected apiUpdate throws past the wrapper, so the modal stays open.
- `Card.config.jsx`: registers the `save_publish` provider and adds the "Close modal on save" control
  (shown when allowEditInView is on and liveEdit is off).
- wcdb seed (`dms-template/scripts/wcdb-admin/seed-wcdb-admin-pages.mjs`, Edit role): liveEdit off,
  `closeModalOnSave: 'edit_role'`, `allowDelete` + `closeModalOnDelete`, and save/delete publishes on
  `role_added`, which The board already subscribes to.

BC: opt-in. With neither key set, `updateItem` is passed through unwrapped, exactly as before.

## Testing

- [ ] Edit role → change a field → save → the modal closes and The board shows the edit
- [ ] Delete role → Confirm → the modal closes and the row leaves The board (live write, needs the user's OK)
- [ ] Other live-edit Cards are unchanged (keystroke saves, modal stays open)
