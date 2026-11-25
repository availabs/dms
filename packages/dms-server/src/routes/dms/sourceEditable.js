'use strict';
/**
 * `isEditable` on an internal (DMS) source: `data.metadata.isEditable`, the same place an external (DAMA)
 * source has it (`data_manager.sources.metadata.isEditable`). One flag for every source, whatever its type
 * (planning/tasks/current/source-editable-flag-everywhere.md).
 *
 *   - A new internal source is created editable unless its creator says otherwise (withSourceEditableDefault).
 *   - A source whose flag is `false` takes no row writes (refusesRowWrites; the controller's
 *     assertSourceEditable applies it to create, edit, delete and mass edit, and /sync/push to its own writes).
 *   - A source with NO value is an older row the backfill has not reached (scripts/backfill-source-editable.js):
 *     internal rows were always editable, so it still is.
 */
const { getKind } = require('../../db/type-utils');

const asObject = (v) => {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  if (typeof v !== 'string' || !v.trim()) return null;
  try { const o = JSON.parse(v); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch { return null; }
};

/** A new source row's data with `metadata.isEditable: true` when its creator set no value. Other rows: unchanged. */
function withSourceEditableDefault(data, type) {
  if (getKind(type || '') !== 'source') return data;
  const row = asObject(data) || {};
  const metadata = asObject(row.metadata) || {};
  if (typeof metadata.isEditable === 'boolean') return data;
  const next = { ...row, metadata: { ...metadata, isEditable: true } };
  return typeof data === 'string' ? JSON.stringify(next) : next;
}

/** Whether the source whose row data this is refuses row writes: only an explicit `false` does. */
function refusesRowWrites(sourceData) {
  return asObject(asObject(sourceData)?.metadata)?.isEditable === false;
}

/** The error a refused row write throws: 409, since the request is fine and the dataset's state forbids it. */
function notEditableError() {
  const e = new Error('This dataset is not editable. Turn on Editable in its settings to change its rows.');
  e.status = 409;
  e.code = 'SOURCE_NOT_EDITABLE';
  return e;
}

module.exports = { withSourceEditableDefault, refusesRowWrites, notEditableError };
