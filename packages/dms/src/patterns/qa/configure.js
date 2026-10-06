import { getInstance } from '../../utils/type-utils.js'
import { COVERED_SITE_COLUMNS, coveredSites, coversPattern, slugAllowed, trackedPageRow } from './tracking.js'

// The install's Configure tab (patterns/admin/pages/patternEditor/qa/configureTab.jsx): which of
// the site's patterns the install covers, under what short key and label, limited to which
// pages. It edits the install's covered-sites dataset, the list the Overview, track-on-publish
// and the Report-an-issue button read. Everything here is pure, so it's tested without a browser.

// Pattern types an install never covers: the admin pattern (`/list`), and QA installs, since an
// install covering an install means nothing.
const NOT_COVERABLE = ['admin', 'qa']

// The three ways a covered-sites row can name its pattern (row id, name, instance), as the
// page config passes them to track-on-publish.
export const patternKeysOf = (pattern) => [pattern?.id, pattern?.name, getInstance(pattern?.type)]

// A short key is part of every page key (`<key>:<slug>`), so it can't hold the separator.
const KEY_RE = /^[a-z0-9_]+$/

// The site's patterns an install can cover, in site order. A pattern this user can't view reaches
// the browser as a stub with its settings stripped (api/proecessNewData.js), so it's left off.
export const coverablePatterns = (patterns = []) =>
  patterns.filter((p) => p && !p.no_access && p.id !== 'no-access' && !NOT_COVERABLE.includes(p.pattern_type))

// One editable entry per coverable pattern, from its covered-sites row when it has one; a new
// entry starts off, keyed by the pattern's instance and labelled with its name. Rows that match
// no coverable pattern (a deleted pattern, one this user can't view) come back as `others` and
// are left as they are.
export function configureEntries(patterns = [], rows = []) {
  const used = new Set()
  const entries = coverablePatterns(patterns).map((pattern) => {
    const row = rows.find((r) => !used.has(r) && coversPattern(r, patternKeysOf(pattern))) || null
    if (row) used.add(row)
    return {
      pattern,
      row,
      enabled: row?.enabled === 'yes',
      surface: row?.surface || getInstance(pattern.type) || '',
      surface_label: row?.surface_label || pattern.name || '',
      include_slugs: row?.include_slugs || '',
      sort_order: row?.sort_order ?? '',
    }
  })
  return { entries, others: rows.filter((r) => !used.has(r)) }
}

// The covered-sites row an entry saves as, with `app` and the pattern's own URL fields, as
// TransportNY's rows carry them. A new row names its pattern by instance (stable across a
// rename, unlike the name); an existing row keeps whichever name it has.
export function coveredSiteRow(entry, { app, nextOrder = 1 } = {}) {
  const { pattern, row } = entry
  return {
    app,
    pattern: row?.pattern || getInstance(pattern.type) || pattern.name,
    surface: `${entry.surface}`.trim(),
    surface_label: `${entry.surface_label}`.trim() || pattern.name || '',
    sort_order: `${entry.sort_order}` === '' ? (row ? '' : nextOrder) : +entry.sort_order,
    enabled: entry.enabled ? 'yes' : 'no',
    subdomain: pattern.subdomain || '',
    base_url: pattern.base_url || '',
    include_slugs: entry.include_slugs || '',
  }
}

const SAVED_FIELDS = COVERED_SITE_COLUMNS.concat(['app', 'subdomain', 'base_url'])
const same = (a, b) => `${a ?? ''}` === `${b ?? ''}`

// The writes a Save makes: `{entry, data}` per row to create (an entry switched on for the first
// time) or update (`data.id`, only when a saved field changed). An entry that was never on and
// still isn't writes nothing.
export function configureWrites(entries = [], { app } = {}) {
  let nextOrder = Math.max(0, ...entries.map((e) => +e.row?.sort_order || 0)) + 1
  const writes = []
  for (const entry of entries) {
    if (!entry.row && !entry.enabled) continue
    const data = coveredSiteRow(entry, { app, nextOrder })
    if (!entry.row) {
      nextOrder += 1
      writes.push({ entry, data })
    } else if (SAVED_FIELDS.some((f) => !same(data[f], entry.row[f]))) {
      writes.push({ entry, data: { ...data, id: entry.row.id } })
    }
  }
  return writes
}

// Short keys a pages or tickets row already uses. Changing one would orphan those rows, so its
// entry's key is shown read-only.
export function usedKeys(pagesRows = [], ticketRows = []) {
  const keys = new Set()
  for (const r of [...pagesRows, ...ticketRows]) {
    const key = r?.surface || `${r?.page_key || ''}`.split(':')[0]
    if (key) keys.add(key)
  }
  return keys
}

export const keyLocked = (entry, used) => Boolean(entry.row?.surface && used.has(entry.row.surface))

// For each coverable pattern another install already covers (an enabled row), that install's
// name, by pattern id. `installs`: [{name, rows}] for the site's other QA installs whose
// covered-sites rows this user could read.
export function coveredElsewhere(patterns = [], installs = []) {
  const out = {}
  for (const pattern of coverablePatterns(patterns)) {
    const hit = installs.find((i) => coveredSites(i.rows).some((s) => coversPattern(s, patternKeysOf(pattern))))
    if (hit) out[pattern.id] = hit.name
  }
  return out
}

// What stops a Save, by pattern id. Only what the admin changed is checked, so an old row that
// breaks a rule doesn't block saving the others. `others`: configureEntries' unmatched rows,
// whose keys are taken too.
export function configureErrors(entries = [], { elsewhere = {}, others = [] } = {}) {
  const errors = {}
  const owners = {}
  for (const e of entries) {
    if (e.row || e.enabled) (owners[`${e.surface}`.trim()] ||= []).push(e)
  }
  const otherKeys = new Set(others.map((r) => r?.surface).filter(Boolean))
  for (const e of entries) {
    if (!e.row && !e.enabled) continue
    const key = `${e.surface}`.trim()
    const keyChanged = !e.row || !same(key, e.row.surface)
    const switchedOn = e.enabled && e.row?.enabled !== 'yes'
    let error = ''
    if (!key) error = 'needs a short key'
    else if (keyChanged && !KEY_RE.test(key)) error = 'short key: lowercase letters, digits and _ only'
    else if (owners[key].length > 1) error = `short key "${key}" is also ${owners[key].filter((o) => o !== e).map((o) => o.pattern.name).join(', ')}'s`
    else if (keyChanged && otherKeys.has(key)) error = `short key "${key}" is taken by another covered-sites row`
    else if (switchedOn && elsewhere[e.pattern.id]) error = `already covered by the ${elsewhere[e.pattern.id]} install`
    if (error) errors[e.pattern.id] = error
  }
  return errors
}

// Whether a saved entry needs its published pages added: it's on, and it was just switched on or
// its page limit changed (a wider limit lets more pages in; existing rows are skipped anyway).
export const needsBackfill = (entry) =>
  entry.enabled && (!entry.row || entry.row.enabled !== 'yes' || !same(entry.include_slugs, entry.row.include_slugs))

// The pages rows to create for a covered `site` ({surface, surface_label, include_slugs}): its
// published `pages` that pass its page limit and have no row in `existing` yet. Published = not a
// draft, the CLI's rule (cli/src/commands/page.js): a page is 'draft' (or has no value) until its
// first publish. `urlFor(page)` gives the live address when the caller can tell it.
export function backfillRows({ site, pages = [], existing = [], urlFor, now = new Date().toISOString() }) {
  const have = new Set(existing.map((r) => r.page_key))
  const rows = []
  for (const page of pages) {
    if (!page?.url_slug || (page.published ?? 'draft') === 'draft' || !slugAllowed(site, page.url_slug)) continue
    const row = trackedPageRow({ site, page, url: urlFor?.(page), now })
    if (have.has(row.page_key)) continue
    have.add(row.page_key)
    rows.push(row)
  }
  return rows
}

// A Configure Save: the covered-sites writes, then each switched-on or re-limited site's published
// pages. Reads and writes are passed in (as for trackPublishedPage), so this is tested with fakes:
//   loadRows(ref, columns)  → rows of the dataset `ref` ({slug, source_id, view_id})
//   createRow(ref, data) / updateRow(ref, data)  (data.id) → one write
//   loadPages(pattern)      → the pattern's pages ({url_slug, title, published}); [] for one without
//   urlFor(pattern, page)   → the live page's address, when the caller can tell it
// `datasets`: the install's refs (`qa.datasets`). Returns what it did, for the tab to report.
export async function saveConfigure({ entries = [], datasets = {}, app, now, loadRows, createRow, updateRow, loadPages, urlFor }) {
  const backfill = entries.filter(needsBackfill)
  const writes = configureWrites(entries, { app })
  for (const { data } of writes) {
    if (data.id) await updateRow(datasets.patterns, data)
    else await createRow(datasets.patterns, data)
  }
  const added = []
  if (backfill.length && datasets.pages) {
    const existing = await loadRows(datasets.pages, ['page_key'])
    for (const entry of backfill) {
      const site = coveredSiteRow(entry, { app })
      const rows = backfillRows({ site, pages: await loadPages(entry.pattern), existing, urlFor: (page) => urlFor?.(entry.pattern, page), now })
      for (const row of rows) {
        await createRow(datasets.pages, row)
        existing.push({ page_key: row.page_key })
      }
      if (rows.length) added.push({ pattern: entry.pattern.name, pages: rows.length })
    }
  }
  return { saved: writes.length, added }
}

// ── the tab's editing: display order, switching, dragging, and what's unsaved ──

const orderRank = (e) => (`${e.sort_order ?? ''}` === '' ? Infinity : +e.sort_order)

// The table's two groups: switched-on sites in their order (the Overview's card order), then
// switched-off sites in site order. Ties and blank orders keep site order (the sort is stable).
export function groupEntries(entries = []) {
  return {
    on: entries.filter((e) => e.enabled).sort((a, b) => orderRank(a) - orderRank(b)),
    off: entries.filter((e) => !e.enabled),
  }
}

// Switch one entry (by pattern id). Switched on, it joins the end of the switched-on sites, unless
// it was on when the tab loaded, which puts it back where it was.
export function switchEntry(entries = [], id, enabled) {
  const last = Math.max(0, ...entries.filter((e) => e.enabled).map((e) => +e.sort_order || 0))
  return entries.map((e) => {
    if (e.pattern.id !== id) return e
    if (!enabled) return { ...e, enabled: false }
    const wasOn = e.row?.enabled === 'yes' && `${e.sort_order ?? ''}` !== ''
    return { ...e, enabled: true, sort_order: wasOn ? e.sort_order : last + 1 }
  })
}

// A drag among the switched-on sites (`from` / `to` index groupEntries' `on`): numbers them 1..n
// in the new order.
export function moveEntry(entries = [], from, to) {
  const on = [...groupEntries(entries).on]
  const [moved] = on.splice(from, 1)
  if (!moved) return entries
  on.splice(to, 0, moved)
  const order = new Map(on.map((e, i) => [e.pattern.id, i + 1]))
  return entries.map((e) => (order.has(e.pattern.id) ? { ...e, sort_order: order.get(e.pattern.id) } : e))
}

// Whether one field differs from the loaded entry (`saved`), for the field's unsaved outline.
export const fieldEdited = (entry, saved, field) => Boolean(saved) && !same(entry?.[field], saved[field])

const EDITABLE = [['surface_label', 'label'], ['surface', 'short key'], ['include_slugs', 'pages']]

// What a Save would change, in words for the save bar: "Pages switched on", "BetaPage's label",
// "the order". `saved`: the entries as loaded. A switched site is one edit, whatever else changed on
// it; a renumbering is one edit, however many rows it moves.
export function describeEdits(entries = [], saved = []) {
  const before = new Map(saved.map((e) => [e.pattern.id, e]))
  const edits = []
  let reordered = false
  for (const e of entries) {
    const b = before.get(e.pattern.id)
    if (!b) continue
    const name = e.pattern.name
    if (e.enabled !== b.enabled) {
      edits.push(`${name} switched ${e.enabled ? 'on' : 'off'}`)
      continue
    }
    if (!e.enabled) continue
    for (const [field, word] of EDITABLE) if (fieldEdited(e, b, field)) edits.push(`${name}'s ${word}`)
    if (fieldEdited(e, b, 'sort_order')) reordered = true
  }
  if (reordered) edits.push('the order')
  return edits
}
