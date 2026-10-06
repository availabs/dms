import { get } from 'lodash-es'

const unwrap = (v) => (v && typeof v === 'object' && '$type' in v ? v.value : v)

// Every row of a DMS internal dataset's view, as plain objects of `columns` (data fields; 'id' is
// the row id). Read through UDA: split-table rows aren't reachable through dms.data byId. The same
// two reads TransportNY's control-room Overview builder makes (build_cr_overview.mjs, readRows).
// `fresh`: drop the view's cached reads first. A row created through dmsDataEditor invalidates
// only `dms.data`, so a read that must see it (a check-then-create) can't trust the cache.
// The CLI's reader (it has no apiLoad); browser code reads through apiLoad instead
// (patterns/qa/datasets.js `datasetRows`).
export async function loadDatasetRows(falcor, { env, viewId, columns = [], fresh = false }) {
  const attrs = columns.map((c) => (c === 'id' ? 'id' : `data->>'${c}' as ${c}`))
  const base = ['uda', env, 'viewsById', viewId, 'options', '{}']
  if (fresh) await falcor.invalidate(['uda', env, 'viewsById', viewId])
  const lengthRes = await falcor.get([...base, 'length'])
  const length = +unwrap(get(lengthRes, ['json', ...base, 'length'])) || 0
  if (!length) return []
  const res = await falcor.get([...base, 'dataByIndex', { from: 0, to: length - 1 }, attrs])
  const byIndex = get(res, ['json', ...base, 'dataByIndex']) || {}
  const rows = []
  for (let i = 0; i < length; i++) {
    const node = byIndex[i]
    if (!node) continue
    rows.push(Object.fromEntries(columns.map((c, j) => [c, unwrap(node[attrs[j]])])))
  }
  return rows
}
