'use strict';
/**
 * `isEditable` on an internal (DMS) source: `data.metadata.isEditable`, the same place an external (DAMA)
 * source has it (`data_manager.sources.metadata.isEditable`). One flag for every source, whatever its type
 * (planning/tasks/current/source-editable-flag-everywhere.md).
 *
 *   - A new internal source is created editable unless its creator says otherwise (withSourceEditableDefault).
 *   - A source takes row writes only while its flag is `true` (refusesRowWrites; the controller's
 *     assertSourceEditable applies it to create, edit, delete and mass edit, the upload routes and
 *     uda's clearData to theirs).
 *   - A source with NO value is not editable, as for an external source. Every source created through this
 *     server has one; a row that predates the flag gets it from scripts/backfill-source-editable.js (run on
 *     every configured database 2026-11-25). RUN THAT SCRIPT WHEN THIS CODE REACHES A SERVER: a source created
 *     by the older code since the last run has no value, and its rows are locked until it has.
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

/** Whether the source whose row data this is refuses row writes: it does unless its flag is `true`. */
function refusesRowWrites(sourceData) {
  return asObject(asObject(sourceData)?.metadata)?.isEditable !== true;
}

/** The error a refused row write throws: 409, since the request is fine and the dataset's state forbids it. */
function notEditableError() {
  const e = new Error('This dataset is not editable. Turn on Editable in its settings to change its rows.');
  e.status = 409;
  e.code = 'SOURCE_NOT_EDITABLE';
  return e;
}

module.exports = { withSourceEditableDefault, refusesRowWrites, notEditableError };
