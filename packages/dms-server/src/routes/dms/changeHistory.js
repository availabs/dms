/**
 * Change history: any internal dataset can ask for every create and edit of its rows to be recorded
 * in another dataset.
 * The setting lives on the tracked dataset's source row:
 *
 *   change_history: {
 *     target:  { source_id, view_id },  // the history dataset rows are written to
 *     columns: ['status', ...] | '*',   // '*' = every column the dataset declares
 *     exclude: ['updated'],             // with '*', columns to leave out
 *     enabled: false,                   // optional: switched off, target and columns kept
 *   }
 *
 * setDataById and createData (dms.controller.js) write one history row per changed tracked column,
 * inside the write's transaction, when the caller passes `{ changeHistory: true }`. Only the Falcor
 * dms.data.edit / dms.data.create routes do; other server-side callers write none. `op` is 'create'
 * for a create's rows (old value '') and 'edit' otherwise.
 *   { row_id, source_id, field, old_value, new_value, user_id, user_email, at, via, op }
 *
 * This module is the pure part: reading the setting and the source's columns, deciding which
 * columns are tracked and which merge, and turning values into the stored text. The SQL is in the
 * controller. The client side (the history columns, the Admin tab panel that edits the setting)
 * is the datasets pattern's utils/changeHistory.js; the overview is its
 * internal-datasets-overview.md, "Change history".
 */

// Columns edited by picking a value. Everything else is typed, so its saves come in bursts
// (one per pause while typing) and merge into one history row.
const PICK_TYPES = new Set(['select', 'multiselect', 'radio', 'checkbox', 'boolean', 'switch']);

// A typed column's save merges into its newest history row when that row is by the same person
// and was written at most this long ago (the window slides: each merge restamps the row).
const BURST_MS = 30_000;

// How a write arrived, from the request's X-DMS-Via header; a browser sends none.
const VIA_VALUES = ['ui', 'cli', 'agent'];

// JSON columns can arrive as strings (SQLite, or a value stored stringified).
const parseJson = (value) => {
  if (value == null || typeof value === 'object') return value ?? null;
  try { return JSON.parse(value); } catch { return null; }
};

/**
 * The change-history spec for a source row's `data`, or null when the dataset isn't tracked
 * (no setting, no target, or an empty column list).
 */
function parseChangeHistory(sourceData) {
  const setting = parseJson(sourceData?.change_history);
  // switched off in the Admin tab: the target and columns are kept for switching back on
  if (setting?.enabled === false) return null;
  const targetSourceId = +setting?.target?.source_id;
  const targetViewId = +setting?.target?.view_id;
  if (!targetSourceId || !targetViewId) return null;

  const allColumns = setting.columns === '*';
  const columns = allColumns ? [] : (Array.isArray(setting.columns) ? setting.columns.filter(Boolean) : []);
  if (!allColumns && !columns.length) return null;

  const attributes = parseJson(sourceData?.config)?.attributes || [];
  const declared = new Map(attributes.filter((a) => a?.name).map((a) => [a.name, a.type]));
  const exclude = new Set(Array.isArray(setting.exclude) ? setting.exclude : []);
  const listed = new Set(columns);

  return {
    targetSourceId,
    targetViewId,
    tracks: (field) => (allColumns ? declared.has(field) && !exclude.has(field) : listed.has(field)),
    merges: (field) => !PICK_TYPES.has(declared.get(field)),
  };
}

// A value as history stores it: text, '' for none, JSON for arrays and objects.
function historyText(value) {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// The `at` stamp: UTC 'YYYY-MM-DD HH:MM:SS', the format the client's setDateOnValue writes.
function historyStamp(now = new Date()) {
  return now.toISOString().slice(0, 19).replace('T', ' ');
}

// Whether a history row stamped `at` is recent enough for a typed save to merge into it.
function withinBurst(at, now = new Date()) {
  const then = Date.parse(`${`${at || ''}`.replace(' ', 'T')}Z`);
  return Number.isFinite(then) && now.getTime() - then <= BURST_MS;
}

function historyVia(reqMeta) {
  return VIA_VALUES.includes(reqMeta?.via) ? reqMeta.via : 'ui';
}

module.exports = {
  BURST_MS,
  parseJson,
  parseChangeHistory,
  historyText,
  historyStamp,
  withinBurst,
  historyVia,
};
