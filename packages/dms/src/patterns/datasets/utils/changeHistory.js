// Change history: an internal dataset can record every change to its rows in another dataset.
// The server writes the rows inside each create and edit made through dms.data.create /
// dms.data.edit (dms-server routes/dms/changeHistory.js), from the tracked dataset's
// `change_history` setting:
//   { target: { source_id, view_id }, columns: [...] | '*', exclude: [...], enabled?: false }
// The Admin tab's Change history panel (components/ChangeHistoryEditor.jsx) switches it on for one
// dataset, which gets its own history dataset, "<dataset> history". Several datasets sharing one
// history is set up in code or with the CLI, as the QA pattern's install does for its tickets,
// pages and stories.
import { nameToSlug, getInstance } from '../../../utils/type-utils'
import { loadItemFresh } from '../../../api'
import { getSourceIdsBySlug } from '../../../api/sourceIdBySlug'

const option = (value) => ({ label: value, value })
const column = (name, display_name, type = 'text', extra = {}) => ({ name, display_name, type, required: false, ...extra })

// A history dataset's columns: one row per changed column of a tracked row.
export const CHANGE_HISTORY_COLUMNS = [
  column('row_id', 'Row', 'number'),
  column('source_id', 'Dataset', 'number'),
  column('field', 'Field'),
  column('old_value', 'Old value'),
  column('new_value', 'New value'),
  column('user_id', 'User id', 'number'),
  column('user_email', 'User email'),
  column('at', 'At'),
  column('via', 'Via', 'select', { options: ['ui', 'cli', 'agent'].map(option) }),
  // 'create' for a new row's values (old value ''), else 'edit'; rows written before it existed are edits
  column('op', 'Action', 'select', { options: ['create', 'edit'].map(option) }),
]

// Source rows keep `config` (and settings) as JSON strings or objects.
export const parseJson = (v) => {
  if (typeof v !== 'string') return v ?? null
  try { return JSON.parse(v) } catch { return null }
}

export const sourceColumns = (sourceData) => parseJson(sourceData?.config)?.attributes || []

// A dataset can take history rows when it has the columns the server writes the change into.
const REQUIRED = ['row_id', 'field', 'old_value', 'new_value']
export const isHistoryShaped = (sourceData) => {
  const names = new Set(sourceColumns(sourceData).map((a) => a?.name))
  return REQUIRED.every((n) => names.has(n))
}

// The name of the history dataset the panel makes for a dataset.
export const historyDatasetName = (sourceName) => `${sourceName || 'Dataset'} history`

// The panel's choices for a stored setting (null, or `enabled: false`, = off). The target isn't a
// choice: it's the stored one, or the dataset's own history, made on save.
export function changeHistoryDraft(setting) {
  const s = parseJson(setting)
  return {
    enabled: !!s && s.enabled !== false,
    allColumns: s?.columns === '*',
    columns: Array.isArray(s?.columns) ? s.columns : [],
    exclude: Array.isArray(s?.exclude) ? s.exclude : [],
  }
}

// Why the panel's choices can't be saved yet, or ''.
export function changeHistoryProblem(draft) {
  if (draft?.enabled && !draft.allColumns && !draft.columns?.length) return 'Pick at least one column to track.'
  return ''
}

// The setting to store: the panel's choices written to `target` ({source_id, view_id}). Switched
// off, it keeps the target and columns with `enabled: false` (the server skips it), so switching
// back on writes to the same history, a shared one included. Null when there's no target yet.
export function changeHistorySetting(draft, target) {
  if (!+target?.source_id || !+target?.view_id) return null
  const to = { source_id: +target.source_id, view_id: +target.view_id }
  const setting = draft?.allColumns
    ? { target: to, columns: '*', ...(draft.exclude?.length ? { exclude: draft.exclude } : {}) }
    : { target: to, columns: draft?.columns || [] }
  return draft?.enabled ? setting : { ...setting, enabled: false }
}

const newId = (res) => Object.keys(res?.json?.dms?.data?.byId || {}).find((k) => k !== '$__path')

// The dataset's history dataset, "<dataset> history" in its environment: the existing one when that
// name is taken by a history (switched off and on again), else a new one, made as Create Dataset
// does (CreatePage.jsx) plus its first version (AddViewBtn), with the history columns and the
// tracked dataset's access. A name taken by a dataset that isn't a history is refused: rows find
// their dataset by name, so a second one can't share it. Returns { source_id, view_id, name }.
export async function ensureHistoryDataset({ falcor, app, dmsEnv, sourceName, authPermissions }) {
  const name = historyDatasetName(sourceName)
  const slug = nameToSlug(name)
  if (!slug) throw new Error('The dataset needs a name before its history can be made.')
  if (!dmsEnv?.id) throw new Error('This datasets pattern has no data environment to put the history in.')

  const existingId = (await getSourceIdsBySlug(falcor, app, [slug]))[slug]
  if (existingId) {
    const row = await loadItemFresh(falcor, app, existingId)
    const viewId = (row?.data?.views || []).map((v) => +v?.id).find(Boolean)
    if (!row || !isHistoryShaped(row.data) || !viewId) {
      throw new Error(`A dataset named "${name}" already exists and isn't a history. Rename one of them first.`)
    }
    return { source_id: +existingId, view_id: viewId, name: row.data?.name || name }
  }

  const envInstance = getInstance(dmsEnv.type)
  const sourceId = newId(await falcor.call(['dms', 'data', 'create'], [app, `${envInstance}|${slug}:source`, {
    name, type: 'internal_table',
    config: JSON.stringify({ attributes: CHANGE_HISTORY_COLUMNS }),
    ...(authPermissions ? { auth_permissions: authPermissions } : {}),
  }]))
  if (!sourceId) throw new Error('Could not create the history dataset.')
  const viewId = newId(await falcor.call(['dms', 'data', 'create'], [app, `${slug}|v1:view`, { name: 'version 1' }]))
  if (!viewId) throw new Error('Could not create a version of the history dataset.')
  await falcor.call(['dms', 'data', 'edit'], [app, +sourceId, { views: [{ ref: `${app}+${slug}|view`, id: +viewId }] }])
  // the environment's list, read fresh, so a source added since the page loaded isn't dropped
  const env = await loadItemFresh(falcor, app, dmsEnv.id)
  const sources = (env?.data?.sources || []).filter((s) => s?.id).map((s) => ({ ref: s.ref || `${app}+${envInstance}|source`, id: +s.id }))
  await falcor.call(['dms', 'data', 'edit'], [app, +dmsEnv.id, {
    sources: [...sources, { ref: `${app}+${envInstance}|source`, id: +sourceId }],
  }])
  await falcor.invalidate(['dms', 'data', app, 'byId', +dmsEnv.id])
  return { source_id: +sourceId, view_id: +viewId, name }
}
