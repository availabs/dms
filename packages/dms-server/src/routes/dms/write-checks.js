/**
 * Write checks: a row kind's own validation of what is written to it, run by the general write path
 * (`dms.data.create` / `dms.data.edit`) after the auth guard has allowed the write. A check is not an
 * authorization: it refuses data that is wrong whoever writes it (400), and may complete it.
 *
 * The core never names a kind here: a feature module registers the check for the kind it owns (the plugins
 * module for `plugin_activation`, dms-plugin-system.md P2 step 5), and the routes only look the kind up.
 *
 *   registerWriteCheck(kind, { keys, check })
 *     keys    the data keys the check reads; an edit that touches none of them is not checked, and a mass edit
 *             of one of them is refused (a mass edit can't be checked row by row)
 *     check   async ({ op, app, type, data, stored }) => data to write (the same object, or a completed copy);
 *             throws to refuse. `data` is the create's data, or an edit's changed keys; `stored` is the
 *             stored row's data on an edit, null on a create.
 */
const { getKind } = require('#db/type-utils.js');
const { parseJson } = require('../auth/grants');

const checks = new Map();

function registerWriteCheck(kind, { keys = [], check } = {}) {
  if (!kind || typeof check !== 'function') throw new Error('registerWriteCheck(kind, { keys, check })');
  checks.set(kind, { keys, check });
}

function refuse(message) {
  const e = new Error(message);
  e.status = 400;
  return e;
}

/** Returns the data to write, checked (and possibly completed) by the kind's check, if it has one. */
async function checkWrite(op, { app, type, data, stored = null }) {
  const entry = checks.get(getKind(type || ''));
  if (!entry) return data;
  const d = parseJson(data) || {};
  if (op === 'edit' && entry.keys.length && !entry.keys.some(k => k in d)) return data;
  const out = await entry.check({ op, app, type, data: { ...d }, stored: parseJson(stored) || null });
  return out === undefined ? data : out;
}

/** A mass edit of `column` on rows of `type`: refused when a check reads that key. */
function checkMassEdit(type, column) {
  const entry = checks.get(getKind(type || ''));
  if (entry && entry.keys.includes(column)) throw refuse(`${getKind(type)}.${column} can't be mass-edited: each row's value is checked`);
}

module.exports = { registerWriteCheck, checkWrite, checkMassEdit, refuse };
