import { get } from 'lodash-es'

const unwrap = (v) => (v && typeof v === 'object' && '$type' in v ? v.value : v)

// Every row of a DMS internal dataset's view, as plain objects of `columns` (data fields; 'id' is
// the row id). Read through UDA: split-table rows aren't reachable through dms.data byId. The same
// two reads TransportNY's control-room Overview builder makes (build_cr_overview.mjs, readRows).
export async function loadDatasetRows(falcor, { env, viewId, columns = [] }) {
  const attrs = columns.map((c) => (c === 'id' ? 'id' : `data->>'${c}' as ${c}`))
  const base = ['uda', env, 'viewsById', viewId, 'options', '{}']
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
