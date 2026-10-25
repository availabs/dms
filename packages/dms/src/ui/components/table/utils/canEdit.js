// `canEdit({ row, attribute, op })` (Table prop, optional): per-row / per-cell edit permission on top of
// allowEdit / allowEditInView. `op` is 'edit' for a cell, 'delete' for a row action. The caller's server
// still decides; this only keeps the UI from offering what would be refused (e.g. the Users page marks
// rows the signed-in user can't manage). Absent → every row follows allowEdit as before.
export const cellEditable = (canEdit, row, attribute, op = 'edit') => !canEdit || !!canEdit({ row, attribute, op });
