/* global process */
/**
 * Preview stacks: a stack (dms-template deploy/stacks.mjs) is a whole copy of production's DMS data on its own
 * server. `stack diff` lists the rows a stack changed since its copy and, for each one, whether production changed
 * that row too after the copy, which is a conflict. It only reads, on both sides. It is the first half of carrying a
 * stack's content to production; the plan is dms-template's planning/shared/tasks/current/stack-content-promotion.md.
 *
 *     dms stack diff --stack https://preview3.weatherenterprise.com                  # production: --host / DMS_HOST
 *     dms stack diff --stack https://preview3.weatherenterprise.com --format summary
 *     dms stack diff --stack <url> --since 2026-11-09T23:50:03Z --output diff.json
 *
 * Every row is checked and every conflict listed. Then the exit code is 3 when there was any conflict, else 0, so a
 * script can tell without reading the output (1 is an error, as for every command).
 */

import { writeFileSync } from 'fs';
import { getKind } from '../../../src/utils/type-utils.js';
import { makeClient, fetchByIds } from '../utils/data.js';
import { output, outputError } from '../utils/output.js';

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

/** Read-only: what a stack changed since its copy, and which of those rows production changed after it. */
export async function diff(config, options = {}) {
  try {
    if (!options.stack) throw new Error('stack diff needs --stack <the stack\'s API address>');
    const stack = trimSlash(options.stack);
    if (trimSlash(config.host) === stack) throw new Error('--stack and --host are the same server; --host must be production');
    const copy = await copyTime(stack, options.since);
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
    if (options.format === 'summary') {
      const text = summaryText(report);
      if (options.output) { writeFileSync(options.output, text + '\n', 'utf-8'); console.error(`Written to ${options.output}`); } else console.log(text);
    } else {
      output(report, options);
    }
    if (report.conflicts) process.exitCode = CONFLICT_EXIT;
  } catch (error) {
    outputError(error);
  }
}
