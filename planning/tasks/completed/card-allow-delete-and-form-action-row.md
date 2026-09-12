# Card: `allowDelete` (two-step Delete) + themeable, card-edge-aligned form action row

**Topic:** page pattern · Card · **Status:** DONE · **Date:** 2026-09-12

## Objective

Let an author give a Card's records a Delete button — the missing third of add / edit /
delete, all of which the dataWrapper and the API already supported — and let a theme style the
Card's form buttons (save / cancel / add / delete) and place them at the card's right edge.

## What existed

- `dataWrapper` exposed `removeItem` (→ `apiUpdate(…, requestType: 'delete')` →
  `uda.data.delete` / `dms.data.delete`) through `usesItemMutationProps`, but `CardSection`
  never destructured it and the UI Card had no button for it.
- The save/cancel and add buttons were the stock `Button` and their wrappers were one grid cell
  (`w-fit justify-self-end`), so on a 2-column form "end" was the middle of the card.

## Changes

- `ui/components/Card.jsx` — `removeItem` prop; `RenderItem` renders ONE action row per record:
  `[Delete → Confirm/Keep] [cancel] [save]`. Delete shows when `display.allowDelete`, the row has
  an id and the wrapper supplied `removeItem`. Two-step confirm in component state (no native
  `confirm()`, which blocks browser automation). Every button takes an optional theme class
  (`formSaveButton`, `formCancelButton`, `formAddButton`, `formDeleteButton`,
  `formDeleteConfirmButton`); unset → stock Button, as before.
- `ComponentRegistry/Card.jsx` — forwards `removeItem`; `removeItemWrapped` clears
  `display.closeModalOnDelete` and publishes `deleted:<id>` on a `delete_publish` provider (the
  delete-side twins of `closeModalOnAdd` / `add_publish`).
- `Card.config.jsx` — controls: Allow Delete, Delete label, Close modal on delete; provider
  registry: `delete_publish`.
- `ui/components/card.theme.jsx` — `formEditButtonsWrapper` / `formAddNewItemWrapper` gain
  `col-span-full` so `justify-self-end` is the card's right edge.

## Worked example

WCDB admin playlist, "Fix this track" modal (station_admin page 1964337): `allowDelete: true,
deleteItemLabel: 'Delete track', closeModalOnDelete: 'edit_song'`, provider
`delete_publish → song_added` (the log's existing `data_refresh` key). Theme keys in
`src/themes/wcdb/wcdb_theme.js` dataCard styles[0].

## Files

- `packages/dms/src/ui/components/Card.jsx`, `card.theme.jsx`
- `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/Card.jsx`, `Card.config.jsx`
