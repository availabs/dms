/* global process */
/**
 * Preview stacks: a stack (dms-template deploy/stacks.mjs) is a whole copy of production's DMS data on its own
 * server. `stack diff` lists the rows a stack changed since its copy and, for each one, whether production changed
 * that row too after the copy, which is a conflict. It only reads, on both sides. `stack apply` is the second half:
 * it takes a saved diff and writes those rows to production, as drafts, and only with --apply (a dry run otherwise).
 * The plan is dms-template's planning/shared/tasks/current/stack-content-promotion.md.
 *
 *     dms stack diff --stack https://preview3.weatherenterprise.com                  # production: --host / DMS_HOST
 *     dms stack diff --stack https://preview3.weatherenterprise.com --format summary
 *     dms stack diff --stack <url> --since 2026-11-09T23:50:03Z --output diff.json
 *     dms stack apply diff.json                # the plan: what would be written, nothing written
 *     dms stack apply diff.json --apply        # write it
 *
 * Every row is checked and every conflict listed. Then the exit code is 3 when there was any conflict, else 0, so a
 * script can tell without reading the output (1 is an error, as for every command).
 */

import { readFileSync, writeFileSync } from 'fs';
import { getKind } from '../../../src/utils/type-utils.js';
import { makeClient, fetchById, fetchByIds, resolvePattern } from '../utils/data.js';
import { patternInstance } from '../utils/types.js';
import { output, outputError } from '../utils/output.js';
import { afterDraftSectionsWrite } from '../utils/room-sync.js';

const ATTRS = ['id', 'app', 'type', 'data', 'updated_at'];
// A page's draft side is what a promotion carries; its published side points at the stack's own published copies,
// which never exist in production (stack-content-promotion.md, decision 1).
const PAGE_DRAFT_FIELDS = ['draft_sections', 'draft_section_groups', 'draft_dataSources'];
const PAGE_PUBLISHED_FIELDS = ['sections', 'section_groups', 'dataSources', 'published'];
const CONFLICT_EXIT = 3;
const BATCH = 100;

const trimSlash = (u) => String(u || '').replace(/\/+$/, '');
const parseData = (d) => (typeof d === 'string' ? (() => { try { return JSON.parse(d); } catch { return d; } })() : d);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
// A row's updated_at: Postgres sends "2026-10-28 16:59:58.3532+00"; SQLite stores "2026-11-10 14:02:03", UTC with no
// zone, which Date.parse would read as local time. A time with no zone is taken as UTC.
const parseTime = (s) => {
  const t = String(s || '').trim();
  if (!t) return NaN;
  return /(?:[zZ]|[+-]\d\d(?::?\d\d)?)$/.test(t) ? Date.parse(t) : Date.parse(`${t.replace(' ', 'T')}Z`);
};
const refIds = (list) => (Array.isArray(list) ? list.map((r) => String(r?.id ?? r)).filter((x) => x && x !== 'undefined') : []);

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  try { return JSON.parse(text); } catch { return undefined; } // a site answers an unknown path with its index.html
}

/** The time the stack's data was copied: --since, else the stack's /_stack.json (on its API or its www host). */
async function copyTime(stack, since) {
  if (since) {
    const t = Date.parse(since);
    if (!Number.isFinite(t)) throw new Error(`--since ${since} is not a date/time`);
    return { copiedAt: new Date(t).toISOString(), copiedAtFrom: '--since' };
  }
  const url = new URL(stack);
  const hosts = [url.host, url.host.startsWith('www.') ? null : `www.${url.host}`].filter(Boolean);
  for (const host of hosts) {
    const info = await getJson(`${url.protocol}//${host}/_stack.json`).catch(() => undefined);
    if (info && info.copiedAt) return { ...info, copiedAtFrom: `${host}/_stack.json: ${info.copiedAtFrom || 'no source given'}` };
  }
  throw new Error(`${stack} serves no /_stack.json with a copy time (a stack deployed before 2026-11-12 has none); give --since <ISO time>`);
}

/** The stack's change feed, folded to one entry per row. */
async function stackChanges(stack, app) {
  const feed = await getJson(`${stack}/sync/delta?app=${encodeURIComponent(app)}&since=0`);
  if (!feed) throw new Error(`${stack}/sync/delta did not answer with JSON (is --stack the stack's API address?)`);
  if (feed.tooLarge) throw new Error(`the stack has ${feed.count} changes, more than its change feed returns at once (${feed.maxChanges})`);
  const rows = new Map();
  for (const c of feed.changes || []) {
    const id = String(c.item_id);
    const r = rows.get(id) || { id, firstAction: c.action, revisions: 0 };
    r.revisions += 1;
    r.lastAction = c.action;
    r.lastRevision = c.revision;
    r.type = c.type || r.type;
    r.data = c.action === 'D' ? null : parseData(c.data);
    rows.set(id, r);
  }
  return { rows: [...rows.values()], revision: feed.revision };
}

async function productionRows(config, ids) {
  const falcor = makeClient(config);
  const found = new Map();
  for (let i = 0; i < ids.length; i += BATCH) {
    const items = await fetchByIds(falcor, config.app, ids.slice(i, i + BATCH), ATTRS);
    for (const item of items) {
      if (item && item.id != null && item.type) found.set(String(item.id), { ...item, data: parseData(item.data) });
    }
  }
  return found;
}

function label(kind, data, id) {
  if (!data || typeof data !== 'object') return '';
  return data.title || data.name || data.url_slug || data.element?.['element-type'] || (kind === 'section' ? `section ${id}` : '');
}

function classify(row, prod, copiedAtMs, stackHost) {
  const kind = getKind(row.type) === 'component' ? 'section' : getKind(row.type);
  const out = {
    id: row.id, kind, type: row.type, label: label(kind, row.data || prod?.data, row.id),
    stack: { action: row.firstAction === 'I' ? (row.lastAction === 'D' ? 'created and deleted' : 'new') : row.lastAction === 'D' ? 'deleted' : 'changed', changes: row.revisions },
    production: prod ? { type: prod.type, updated_at: prod.updated_at } : null,
    notes: [],
  };
  const isNew = row.firstAction === 'I';
  if (isNew && row.lastAction === 'D') return { ...out, result: 'skip', reason: 'created and deleted in the stack' };
  if (isNew) {
    if (prod) out.notes.push(`id ${row.id} is ${prod.type} in production; a promotion creates the row with a production id`);
    return { ...out, result: 'new' };
  }
  if (!prod) return { ...out, result: 'conflict', reason: 'deleted in production' };
  if (prod.type !== row.type) return { ...out, result: 'conflict', reason: `id ${row.id} is ${prod.type} in production` };
  const changedAt = parseTime(prod.updated_at);
  if (Number.isFinite(changedAt) && changedAt > copiedAtMs) {
    return { ...out, result: 'conflict', reason: `changed in production at ${new Date(changedAt).toISOString()}, after the copy` };
  }
  if (row.lastAction === 'D') return { ...out, result: 'delete' };
  if (kind === 'page' && row.data && prod.data) {
    const fields = Object.keys({ ...row.data, ...prod.data }).filter((k) => !same(row.data[k], prod.data[k]));
    out.fields = {
      draft: fields.filter((k) => PAGE_DRAFT_FIELDS.includes(k)),
      published: fields.filter((k) => PAGE_PUBLISHED_FIELDS.includes(k)),
      settings: fields.filter((k) => !PAGE_DRAFT_FIELDS.includes(k) && !PAGE_PUBLISHED_FIELDS.includes(k) && k !== 'updated_at'),
    };
  }
  if (stackHost && row.data && JSON.stringify(row.data).includes(stackHost)) out.notes.push('points at a file on the stack\'s own storage (blocks a promotion)');
  return { ...out, result: 'change' };
}

/** New section rows that only a page's published side points at: the copies a publish in the stack made. */
function markPublishedCopies(results, rows) {
  const draftRefs = new Set(), publishedRefs = new Set();
  for (const r of rows) {
    if (getKind(r.type) !== 'page' || !r.data) continue;
    refIds(r.data.draft_sections).forEach((id) => draftRefs.add(id));
    refIds(r.data.sections).forEach((id) => publishedRefs.add(id));
  }
  for (const r of results) {
    if (r.result === 'new' && r.kind === 'section' && publishedRefs.has(r.id) && !draftRefs.has(r.id)) {
      r.result = 'skip';
      r.reason = 'a published copy made in the stack (production makes its own when someone publishes)';
    }
  }
}

function summaryText(report) {
  const order = { conflict: 0, new: 1, change: 2, delete: 3, skip: 4 };
  const lines = [
    `stack ${report.stack} (app ${report.app}), copied ${report.copiedAt} (${report.copiedAtFrom})`,
    `production ${report.production}`,
    `${report.rows.length} row(s): ${Object.entries(report.counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}`,
    '',
  ];
  for (const r of [...report.rows].sort((a, b) => order[a.result] - order[b.result] || a.kind.localeCompare(b.kind) || a.id - b.id)) {
    const what = `${r.result.toUpperCase().padEnd(8)} ${r.kind.padEnd(8)} ${r.id}${r.label ? `  ${r.label}` : ''}`;
    const detail = [r.reason, r.fields && r.fields.draft.length ? `draft: ${r.fields.draft.join(', ')}` : null,
      r.fields && r.fields.settings.length ? `settings: ${r.fields.settings.join(', ')}` : null, ...(r.notes || [])].filter(Boolean);
    lines.push(detail.length ? `${what}  — ${detail.join('; ')}` : what);
  }
  if (report.conflicts) lines.push('', `${report.conflicts} conflict(s): a promotion would refuse. Reseed the stack and redo the change, or make it by hand.`);
  return lines.join('\n');
}

/** The comparison both commands run: the stack's changed rows, each classified against production. */
async function buildReport(config, stackUrl, since) {
  const stack = trimSlash(stackUrl);
  if (trimSlash(config.host) === stack) throw new Error('--stack and --host are the same server; --host must be production');
  const copy = await copyTime(stack, since);
  const copiedAtMs = Date.parse(copy.copiedAt);
  const { rows, revision } = await stackChanges(stack, config.app);
  const prod = await productionRows(config, rows.map((r) => r.id));
  const stackHost = new URL(stack).host;
  const results = rows.map((r) => classify(r, prod.get(r.id), copiedAtMs, stackHost));
  markPublishedCopies(results, rows);
  const counts = {};
  for (const r of results) counts[r.result] = (counts[r.result] || 0) + 1;
  const report = {
    stack, production: trimSlash(config.host), app: config.app,
    copiedAt: copy.copiedAt, copiedAtFrom: copy.copiedAtFrom, backups: copy.backups || null,
    stackRevision: revision, counts, conflicts: counts.conflict || 0, rows: results,
  };
  return { report, stackRows: new Map(rows.map((r) => [r.id, r])), prodRows: prod };
}

function writeText(text, options) {
  if (options.output) { writeFileSync(options.output, text + '\n', 'utf-8'); console.error(`Written to ${options.output}`); } else console.log(text);
}

/** Read-only: what a stack changed since its copy, and which of those rows production changed after it. */
export async function diff(config, options = {}) {
  try {
    if (!options.stack) throw new Error('stack diff needs --stack <the stack\'s API address>');
    const { report } = await buildReport(config, options.stack, options.since);
    if (options.format === 'summary') writeText(summaryText(report), options);
    else output(report, options);
    if (report.conflicts) process.exitCode = CONFLICT_EXIT;
  } catch (error) {
    outputError(error);
  }
}

// ============================================================================
// apply
// ============================================================================

// The kinds a promotion carries. Anything else in a stack's change feed (a dataset's source or view settings, for
// one) stops the apply: dataset changes have no conflict check yet, because their own writes skip the change log.
const APPLY_KINDS = ['page', 'section', 'theme', 'pattern', 'site'];
// Written before pages: a page's draft_sections needs its new sections' production ids.
const KIND_ORDER = { section: 0, theme: 1, pattern: 2, site: 3, page: 4 };
// `parent_id` is the server's: it validates a create's claim and stamps a page's sections when the page is saved.
const SERVER_KEYS = ['parent_id'];

const isRef = (v) => v && typeof v === 'object' && !Array.isArray(v) && v.id != null && 'ref' in v;

/** Every stack-made id that `data` names: `{id, ref}` entries anywhere in it, and a page's `parent`. */
function newRefs(kind, data, newIds) {
  const found = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    if (isRef(v) && newIds.has(String(v.id))) found.add(String(v.id));
    Object.values(v).forEach(walk);
  };
  walk(data);
  if (kind === 'page' && data && newIds.has(String(data.parent))) found.add(String(data.parent));
  return found;
}

/** `data` with those ids swapped for the production ids in `idMap` (stack id → production id). */
function remap(kind, data, idMap) {
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    const out = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    if (isRef(v) && idMap.has(String(v.id))) out.id = typeof v.id === 'number' ? Number(idMap.get(String(v.id))) : String(idMap.get(String(v.id)));
    return out;
  };
  const out = walk(data);
  if (kind === 'page' && out && idMap.has(String(out.parent))) out.parent = String(idMap.get(String(out.parent)));
  return out;
}

/** Stack-made ids still written out in a payload after the swap: inside a string, or a field that isn't a ref. */
function strayIds(kind, payload, newIds) {
  const text = JSON.stringify(remap(kind, payload, new Map([...newIds].map((id) => [id, 'swapped']))) ?? null);
  return [...newIds].filter((id) => new RegExp(`(?<![\\w.-])${id}(?![\\w.-])`).test(text));
}

/** A new row's create payload: the stack's row, without the published side (a page) or the server's keys. */
function createPayload(kind, data, newIds) {
  const out = { ...data };
  // A parent that exists in production is claimed as the stack's row claims it, and the server checks it. A parent
  // made in the stack has no production id yet: the page's own save stamps its sections.
  if (newIds.has(String(out.parent_id))) delete out.parent_id;
  if (kind === 'page') {
    // The stack's published side points at the stack's own published copies. Production gets a draft.
    ['sections', 'section_groups', 'dataSources'].forEach((k) => delete out[k]);
    out.published = 'draft';
    out.has_changes = true;
  }
  return out;
}

/**
 * A changed row's patch: the top-level keys whose value differs in the stack. The server's edit merges top-level
 * keys, so a key the stack removed is sent as null. Production still holds the copy's version (the diff checked),
 * so the merge leaves production's row equal to the stack's.
 */
function changePatch(kind, stackData, prodData) {
  const skip = new Set([...SERVER_KEYS, ...(kind === 'page' ? [...PAGE_PUBLISHED_FIELDS, 'has_changes'] : [])]);
  const patch = {}, removed = [];
  for (const k of Object.keys({ ...prodData, ...stackData })) {
    if (skip.has(k) || same(stackData[k], prodData[k])) continue;
    if (k in stackData) patch[k] = stackData[k];
    else { patch[k] = null; removed.push(k); }
  }
  // Publishing in the stack cleared has_changes there. Production's published page is still the old one, so a
  // carried draft change is unpublished work.
  if (kind === 'page' && (PAGE_DRAFT_FIELDS.some((k) => k in patch) || (stackData.has_changes && !prodData.has_changes))) patch.has_changes = true;
  return { patch, removed };
}

/** The writes a diff's rows come to, in the order they run, with whatever stops the apply. */
function planWrites(report, stackRows, prodRows) {
  const blockers = [], steps = [], skipped = [];
  const stackHost = new URL(report.stack).host;
  const newIds = new Set(report.rows.filter((r) => r.result === 'new').map((r) => String(r.id)));
  const carried = report.rows.filter((r) => ['new', 'change', 'delete'].includes(r.result));
  for (const r of report.rows.filter((x) => x.result === 'skip')) skipped.push({ id: r.id, kind: r.kind, label: r.label, reason: r.reason });

  for (const r of carried) {
    if (!APPLY_KINDS.includes(r.kind)) blockers.push(`${r.kind} ${r.id} (${r.type}): only pages, sections, themes, patterns and the site row are carried`);
    const data = stackRows.get(String(r.id))?.data;
    if (r.result !== 'delete' && data && JSON.stringify(data).includes(stackHost)) {
      blockers.push(`${r.kind} ${r.id}${r.label ? ` "${r.label}"` : ''}: points at a file on the stack's own storage (${stackHost})`);
    }
  }

  // New rows, each after the new rows it names.
  const creates = carried.filter((r) => r.result === 'new').map((r) => {
    const payload = createPayload(r.kind, stackRows.get(String(r.id)).data || {}, newIds);
    return { op: 'create', id: String(r.id), kind: r.kind, type: r.type, label: r.label, payload, needs: newRefs(r.kind, payload, newIds) };
  });
  const planned = new Set(creates.map((c) => c.id));
  for (const c of creates) {
    for (const id of c.needs) if (!planned.has(id)) blockers.push(`${c.kind} ${c.id} names stack row ${id}, which isn't carried`);
  }
  const done = new Set();
  let waiting = [...creates].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id - b.id);
  while (waiting.length) {
    const ready = waiting.filter((c) => [...c.needs].every((id) => done.has(id) || !planned.has(id)));
    if (!ready.length) { blockers.push(`new rows name each other in a circle: ${waiting.map((c) => c.id).join(', ')}`); break; }
    for (const c of ready) { steps.push(c); done.add(c.id); }
    waiting = waiting.filter((c) => !done.has(c.id));
  }

  // Changed rows: sections, themes, patterns and the site row, then pages.
  const changes = carried.filter((r) => r.result === 'change').sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id - b.id);
  for (const r of changes) {
    const { patch, removed } = changePatch(r.kind, stackRows.get(String(r.id)).data || {}, prodRows.get(String(r.id)).data || {});
    if (!Object.keys(patch).length) {
      skipped.push({ id: r.id, kind: r.kind, label: r.label, reason: r.kind === 'page' ? 'only its published side changed in the stack' : 'the same in the stack and in production' });
      continue;
    }
    for (const id of newRefs(r.kind, patch, newIds)) if (!planned.has(id)) blockers.push(`${r.kind} ${r.id} names stack row ${id}, which isn't carried`);
    steps.push({ op: 'edit', id: String(r.id), kind: r.kind, type: r.type, label: r.label, payload: patch, removed, expect: r.production.updated_at });
  }

  for (const r of carried.filter((x) => x.result === 'delete')) {
    steps.push({ op: 'delete', id: String(r.id), kind: r.kind, type: r.type, label: r.label, expect: r.production.updated_at });
  }
  return { steps, skipped, blockers, newIds };
}

/** What a reader sees of a step: the fields it writes, never the data. */
function describeStep(s, newIds) {
  const out = { op: s.op, kind: s.kind, id: s.op === 'create' ? null : s.id, stack_id: s.id, label: s.label || '', type: s.type };
  if (s.op !== 'delete') out.fields = Object.keys(s.payload);
  if (s.removed?.length) out.removed = s.removed;
  if (s.op === 'create' && s.needs.size) out.after = [...s.needs];
  if (s.op !== 'delete') {
    const stray = strayIds(s.kind, s.payload, newIds);
    if (stray.length) out.notes = [`mentions stack id ${stray.join(', ')} outside a reference; it isn't swapped for the production id`];
  }
  return out;
}

function applyText(result) {
  const lines = [
    `${result.applied ? 'APPLIED' : 'DRY RUN (nothing written; add --apply to write)'}: stack ${result.stack} → production ${result.production} (app ${result.app})`,
    `${result.steps.length} write(s), ${result.skipped.length} row(s) not carried`,
    '',
  ];
  for (const s of result.steps) {
    const id = s.op === 'create' ? (s.id ? `${s.id} (stack ${s.stack_id})` : `new (stack ${s.stack_id})`) : s.id;
    const detail = [s.fields?.length ? `${s.op === 'create' ? 'fields' : 'writes'}: ${s.fields.join(', ')}` : null,
      s.removed?.length ? `removes: ${s.removed.join(', ')}` : null, s.room_sync ? `live room: ${s.room_sync}` : null, ...(s.notes || [])].filter(Boolean);
    const status = result.applied ? `${s.done ? 'done' : 'NOT DONE'}  ` : '';
    lines.push(`${status}${s.op.toUpperCase().padEnd(7)} ${s.kind.padEnd(8)} ${id}${s.label ? `  ${s.label}` : ''}${detail.length ? `  — ${detail.join('; ')}` : ''}`);
  }
  for (const s of result.skipped) lines.push(`SKIP    ${s.kind.padEnd(8)} ${s.id}${s.label ? `  ${s.label}` : ''}  — ${s.reason}`);
  if (result.stopped) lines.push('', `STOPPED: ${result.stopped}`);
  if (result.publish?.length) {
    lines.push('', `${result.applied ? 'Now' : 'After it runs,'} a person opens each page in production and clicks Publish:`,
      ...result.publish.map((p) => `  ${p.label || 'page'} (page ${p.id ?? `new, stack ${p.stack_id}`}): ${p.url || 'no address found; open it in the editor'}`));
    if (result.publish_note) lines.push(`  (${result.publish_note})`);
  }
  return lines.join('\n');
}

/**
 * Where a person opens each page to publish it: the page's edit address, `<base_url>/edit/<url_slug>` under its
 * pattern, on `site` (the production site's address) when given. Without the site's type the patterns can't be
 * read, and the page gets no address.
 */
async function editUrls(config, site, pages) {
  if (!pages.length || !config.type) return new Map();
  const patterns = await resolvePattern(makeClient(config), config).catch(() => []);
  const baseOf = new Map(patterns.map((p) => [patternInstance(p), parseData(p.data)?.base_url ?? '']));
  const out = new Map();
  for (const { id, type, slug } of pages) {
    const instance = String(type).split('|')[0];
    if (!baseOf.has(instance) || slug == null) continue;
    const path = `/${[baseOf.get(instance), 'edit', slug].map((x) => String(x).replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')}`;
    out.set(id, site ? `${trimSlash(site)}${path}` : path);
  }
  return out;
}

/** The rows of two reports that differ in what a promotion would do with them. */
function reportDrift(file, fresh) {
  const now = new Map(fresh.rows.map((r) => [String(r.id), r]));
  const out = [];
  for (const r of file.rows || []) {
    const n = now.get(String(r.id));
    if (!n) out.push(`${r.kind} ${r.id}: in the diff file, no longer changed in the stack`);
    else if (n.result !== r.result) out.push(`${r.kind} ${r.id}: ${r.result} in the diff file, ${n.result} now${n.reason ? ` (${n.reason})` : ''}`);
    now.delete(String(r.id));
  }
  for (const n of now.values()) out.push(`${n.kind} ${n.id}: changed in the stack, not in the diff file`);
  return out;
}

/**
 * Write a saved diff's rows to production: a dry run unless `options.apply`. It runs the diff again first and
 * refuses unless the result is the file's: the stack at the same revision, every row with the same result, and no
 * conflict. Pages get their draft side only, so production's published pages don't change until someone publishes.
 */
export async function apply(file, config, options = {}) {
  try {
    let saved;
    try { saved = JSON.parse(readFileSync(file, 'utf-8')); } catch (e) { throw new Error(`${file} is not a diff file (\`dms stack diff --output <file>\`, JSON format): ${e.message}`); }
    if (!saved || !saved.stack || !saved.copiedAt || !Array.isArray(saved.rows)) throw new Error(`${file} is not a diff file: it has no stack, copiedAt or rows`);
    if (trimSlash(config.host) !== trimSlash(saved.production) || config.app !== saved.app) {
      throw new Error(`the diff was made against ${saved.production} (app ${saved.app}); this run is ${trimSlash(config.host)} (app ${config.app}). Run it with the same --host and --app`);
    }

    const { report, stackRows, prodRows } = await buildReport(config, saved.stack, saved.copiedAt);
    const refuse = (stopped, extra = {}) => {
      const result = { applied: false, stack: report.stack, production: report.production, app: report.app, steps: [], skipped: [], stopped, ...extra };
      if (options.format === 'summary') writeText([`STOPPED: ${stopped}`, ...Object.values(extra).flat().map((x) => `  ${typeof x === 'string' ? x : `${x.kind} ${x.id}  ${x.label || ''}  — ${x.reason}`}`)].join('\n'), options);
      else output(result, options);
    };
    if (report.conflicts) {
      process.exitCode = CONFLICT_EXIT;
      return refuse(`${report.conflicts} conflict(s): production changed these rows after the stack's copy. Nothing was written`,
        { conflicts: report.rows.filter((r) => r.result === 'conflict').map((r) => ({ id: r.id, kind: r.kind, label: r.label, reason: r.reason })) });
    }
    const drift = reportDrift(saved, report);
    if (report.stackRevision !== saved.stackRevision || drift.length) {
      process.exitCode = 1;
      return refuse(`the stack changed after the diff file was written (revision ${saved.stackRevision} then, ${report.stackRevision} now). Run \`dms stack diff\` again and review it. Nothing was written`, { drift });
    }

    const { steps, skipped, blockers, newIds } = planWrites(report, stackRows, prodRows);
    if (blockers.length) {
      process.exitCode = 1;
      return refuse('this diff holds rows a promotion can\'t carry. Nothing was written', { blockers });
    }

    const idMap = new Map();
    const shown = steps.map((s) => describeStep(s, newIds));
    const result = {
      applied: !!options.apply, stack: report.stack, production: report.production, app: report.app,
      copiedAt: report.copiedAt, stackRevision: report.stackRevision, steps: shown, skipped, ids: {},
      publish: [],
    };
    const toPublish = steps.filter((s) => s.kind === 'page' && s.op !== 'delete');
    const urls = await editUrls(config, options.site, toPublish.map((s) => ({ id: s.id, type: s.type, slug: stackRows.get(s.id)?.data?.url_slug })));
    result.publish = toPublish.map((s) => ({ id: s.op === 'create' ? null : s.id, stack_id: s.id, label: s.label || '', url: urls.get(s.id) || null }));
    if (toPublish.length && !options.site) result.publish_note = 'give --site <the production site\'s address> for full addresses';

    if (options.apply) {
      const falcor = makeClient(config);
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        try {
          if (s.op !== 'create') {
            // A fresh client, so the read isn't the one cached when the plan was made.
            const now = await fetchById(makeClient(config), config.app, s.id, ['id', 'type', 'updated_at']);
            if (!now || now.updated_at !== s.expect) {
              process.exitCode = CONFLICT_EXIT;
              result.stopped = `${s.kind} ${s.id} changed in production while this ran (${now ? now.updated_at : 'deleted'}; the plan saw ${s.expect}). The writes marked done stay; the rest were not made`;
              break;
            }
          }
          if (s.op === 'create') {
            const res = await falcor.call(['dms', 'data', 'create'], [config.app, s.type, remap(s.kind, s.payload, idMap)]);
            const byApp = res?.json?.dms?.data?.[config.app]?.byId || res?.json?.dms?.data?.byId || {};
            const created = Object.keys(byApp)[0];
            if (!created) throw new Error('the server returned no id for the new row');
            idMap.set(s.id, String(created));
            result.ids[s.id] = String(created);
            shown[i].id = String(created);
            const page = result.publish.find((p) => p.stack_id === s.id);
            if (page) page.id = String(created);
          } else if (s.op === 'edit') {
            await falcor.call(['dms', 'data', 'edit'], [config.app, s.id, remap(s.kind, s.payload, idMap)]);
            if (s.kind === 'page' && 'draft_sections' in s.payload) {
              const room = await afterDraftSectionsWrite(config, s.id);
              if (room) shown[i].room_sync = room.status;
            }
          } else {
            await falcor.call(['dms', 'data', 'delete'], [config.app, s.type, Number(s.id)]);
          }
          shown[i].done = true;
        } catch (e) {
          process.exitCode = 1;
          result.stopped = `${s.op} ${s.kind} ${s.id} failed: ${e.message}. The writes marked done stay; the rest were not made`;
          break;
        }
      }
      for (const st of shown) st.done = !!st.done;
    }

    if (options.format === 'summary') writeText(applyText(result), options);
    else output(result, options);
  } catch (error) {
    outputError(error);
  }
}
