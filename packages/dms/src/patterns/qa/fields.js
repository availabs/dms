// An install's own ticket fields, on top of the ticket record's columns: an admin adds them on the
// install's Configure tab, and each one picks where it shows (the report forms, the Ticket page's
// Details, the Tickets table, the filter bar). Stored on the install row as `qa.fields`; each is
// also a column of the install's tickets dataset, tracked in its change history. No browser
// imports, so this is tested with plain data.
//
// A field: { name, label, type, options, show: { form, details, table, filter }, required }
// - `name` is the dataset column; it's made from the label and fixed once saved.
// - `options` (pick one only): the values, in order. A comma can't be one: QA's SQL lists and
//   labels are comma-split.
// - removing a field hides it: its column and values stay, and a field with the same name later
//   picks them up again.
import { QA_DATASETS } from './datasets.js'

export const FIELD_TYPES = [
  { key: 'text', label: 'Text', column: 'text' },
  { key: 'long_text', label: 'Long text', column: 'textarea' },
  { key: 'number', label: 'Number', column: 'number' },
  { key: 'date', label: 'Date', column: 'date' },
  { key: 'pick_one', label: 'Pick one', column: 'select' },
]
const typeByKey = new Map(FIELD_TYPES.map((t) => [t.key, t]))

// The places a field can show, in the card's order.
export const FIELD_PLACES = [
  { key: 'form', label: 'form' },
  { key: 'details', label: 'details' },
  { key: 'table', label: 'table' },
  { key: 'filter', label: 'filter' },
]

// A filter chip lists a column's distinct values, which suits a pick list or short text.
export const canFilter = (type) => type === 'pick_one' || type === 'text'

// Names a field can't take: the ticket record's columns, the row id, and the URL parameters the QA
// pages already use.
const URL_KEYS = ['q', 'key', 'id', 'status', 'severity', 'source', 'surface', 'page_name', 'category', 'addticket', 'ticket_v', 'tickets_v', 'page_v']
export const RESERVED_NAMES = new Set([
  ...QA_DATASETS.find((d) => d.key === 'tickets').attributes.map((a) => a.name),
  ...URL_KEYS,
])

// A field's dataset name, from its label: lowercase, underscores (the repo's naming rule).
export const fieldName = (label = '') => `${label}`.toLowerCase().trim().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/^[0-9_]+/, '')

const NAME_RE = /^[a-z][a-z0-9_]*$/

// A new field, before it's named.
export const newField = () => ({ name: '', label: '', type: 'text', options: [], show: { form: true, details: true, table: false, filter: false }, required: false })

// The install's fields, as stored, each filled out to the full shape; one without a usable name or
// a known type is left out.
export function installFields(pattern) {
  const list = Array.isArray(pattern?.qa?.fields) ? pattern.qa.fields : []
  return list
    .filter((f) => f && NAME_RE.test(`${f.name || ''}`) && typeByKey.has(f.type))
    .map((f) => ({
      name: f.name,
      label: f.label || f.name,
      type: f.type,
      options: f.type === 'pick_one' ? (Array.isArray(f.options) ? f.options.map(String) : []) : [],
      show: { form: !!f.show?.form, details: !!f.show?.details, table: !!f.show?.table, filter: !!f.show?.filter && canFilter(f.type) },
      required: !!f.required && !!f.show?.form,
    }))
}

// The fields shown in one place.
export const fieldsShownIn = (fields = [], place) => fields.filter((f) => f.show?.[place])

// A field as a column of the tickets dataset.
export function fieldColumn(field) {
  return {
    name: field.name,
    display_name: field.label || field.name,
    type: typeByKey.get(field.type)?.column || 'text',
    required: false,
    ...(field.type === 'pick_one' ? { options: field.options.map((o) => ({ label: o, value: o })) } : {}),
  }
}

// Options typed as one comma-separated line, trimmed, blanks and repeats dropped.
export const parseOptions = (line = '') => [...new Set(`${line}`.split(',').map((s) => s.trim()).filter(Boolean))]

// What each saved field holds on the install's tickets: { [name]: Set of values }, from ticket rows
// read with the fields' columns. A field with values can't change type; a value in use can't be
// removed from a pick list.
export function fieldValuesInUse(rows = [], fields = []) {
  const used = {}
  for (const f of fields) {
    used[f.name] = new Set(rows.map((r) => r?.[f.name]).filter((v) => v !== undefined && v !== null && `${v}` !== '').map(String))
  }
  return used
}

// What's wrong with each field, by index ('' when nothing). `saved`: the fields as last saved (their
// names are fixed); `inUse`: fieldValuesInUse.
export function fieldErrors(fields = [], { saved = [], inUse = {} } = {}) {
  const savedByName = new Map(saved.map((f) => [f.name, f]))
  const names = fields.map((f) => f.name)
  return fields.map((f, i) => {
    if (!`${f.label || ''}`.trim()) return 'Give the field a label.'
    if (!NAME_RE.test(f.name || '')) return 'The label needs a letter, so the field gets a name.'
    if (RESERVED_NAMES.has(f.name) && !savedByName.has(f.name)) return `"${f.name}" is already a ticket column; pick another label.`
    if (names.indexOf(f.name) !== i) return `Another field is already named "${f.name}".`
    if (f.type === 'pick_one' && !f.options?.length) return 'A pick-one field needs at least one option.'
    const before = savedByName.get(f.name)
    const used = inUse[f.name]
    if (before && used?.size && before.type !== f.type) return `Tickets hold values for this field, so its type stays ${typeByKey.get(before.type)?.label.toLowerCase()}.`
    if (f.type === 'pick_one' && used?.size) {
      const dropped = [...used].filter((v) => !f.options.includes(v))
      if (dropped.length) return `Tickets use ${dropped.map((v) => `"${v}"`).join(', ')}, so ${dropped.length === 1 ? 'it stays' : 'they stay'} in the options.`
    }
    return ''
  })
}

// The save bar's words for the fields' changes: "Hours added", "Channel's options", "the field order".
export function describeFieldEdits(after = [], before = []) {
  const beforeByName = new Map(before.map((f) => [f.name, f]))
  const afterNames = new Set(after.map((f) => f.name))
  const edits = []
  for (const f of after) {
    const b = beforeByName.get(f.name)
    const name = f.label || f.name || 'a new field'
    if (!b) { edits.push(`${name} added`); continue }
    if (b.label !== f.label) edits.push(`${b.label}'s label`)
    if (b.type !== f.type) edits.push(`${name}'s type`)
    if (JSON.stringify(b.options) !== JSON.stringify(f.options)) edits.push(`${name}'s options`)
    if (JSON.stringify(b.show) !== JSON.stringify(f.show) || b.required !== f.required) edits.push(`where ${name} shows`)
  }
  for (const b of before) if (!afterNames.has(b.name)) edits.push(`${b.label} removed`)
  const kept = after.filter((f) => beforeByName.has(f.name)).map((f) => f.name)
  const keptBefore = before.filter((f) => afterNames.has(f.name)).map((f) => f.name)
  if (JSON.stringify(kept) !== JSON.stringify(keptBefore)) edits.push('the field order')
  return edits
}

// The tickets source edits a set of fields needs: each field's column added (or its label, type
// and options brought up to date) in the source's `config.attributes`, and each name added to its
// change history's tracked columns when that's a list ('*' tracks every column already; no setting
// means the history is off). A column the ticket record defines is never touched. `source`: the
// tickets source row's data, read fresh. Returns { config?, change_history? } or null for nothing.
const parseJson = (v) => {
  if (typeof v !== 'string') return v ?? null
  try { return JSON.parse(v) } catch { return null }
}
export function planFieldColumns({ fields = [], source = {} }) {
  const config = parseJson(source.config) || {}
  const attributes = Array.isArray(config.attributes) ? config.attributes : []
  const byName = new Map(attributes.map((a) => [a?.name, a]))
  let changed = false
  const next = attributes.map((a) => {
    const f = fields.find((x) => x.name === a?.name)
    if (!f || RESERVED_NAMES.has(a.name)) return a
    const col = { ...a, ...fieldColumn(f) }
    if (JSON.stringify(col) !== JSON.stringify(a)) changed = true
    return col
  })
  for (const f of fields) {
    if (byName.has(f.name) || RESERVED_NAMES.has(f.name)) continue
    next.push(fieldColumn(f))
    changed = true
  }
  const history = parseJson(source.change_history)
  const tracked = Array.isArray(history?.columns) ? history.columns : null
  const addTracked = tracked ? fields.map((f) => f.name).filter((n) => !tracked.includes(n)) : []
  if (!changed && !addTracked.length) return null
  return {
    ...(changed ? { config: JSON.stringify({ ...config, attributes: next }) } : {}),
    ...(addTracked.length ? { change_history: { ...history, columns: [...tracked, ...addTracked] } } : {}),
  }
}

// ── Configure's rows ──
// A row being edited: a new one has no name until it's saved, and shows the one its label makes; it
// can carry `_optionsText`, the options line as typed (so a trailing comma survives the next key).
export const rowName = (row) => row.name || fieldName(row.label)
// The rows as they'd be saved: names filled in, the typed line dropped.
export const settledFields = (rows = []) => rows.map(({ _optionsText, ...f }) => ({ ...f, name: rowName(f) }))
// A row after its type changes: a pick list's options go with it, and a type that can't be filtered
// leaves the filter bar.
export const withType = (row, type) => ({
  ...row, type,
  ...(type === 'pick_one' ? {} : { options: [], _optionsText: undefined }),
  show: { ...row.show, filter: !!row.show?.filter && canFilter(type) },
})
