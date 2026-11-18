/**
 * Site commands.
 *
 * Show site info, list its patterns, render the full tree.
 *
 * Site type is the bare instance form (`nhomb`) or the full form
 * (`nhomb:site`) — the CLI normalizes via `siteTypeFor()`.
 */

import fs from 'fs';
import path from 'path';
import {
  makeClient, fetchAll, fetchByIds, parseData, resolvePattern,
} from '../utils/data.js';
import { afterDraftSectionsWrite } from '../utils/room-sync.js';
import {
  siteTypeFor, patternInstance, pageTypeFor,
} from '../utils/types.js';
import { getKind } from '../../../src/utils/type-utils.js';
import { output, outputError } from '../utils/output.js';

/**
 * Show site info.
 */
export async function show(config, options = {}) {
  try {
    const falcor = makeClient(config);
    const siteType = siteTypeFor(config.type);
    const siteAppType = `${config.app}+${siteType}`;

    const { items } = await fetchAll(falcor, siteAppType, ['id', 'app', 'type', 'data'], { limit: 1 });

    if (items.length === 0) {
      outputError(`No site found for ${siteAppType}`);
      return;
    }

    const site = items[0];
    const data = parseData(site.data);

    output({
      id: site.id,
      site_name: data.site_name || data.name || '(unnamed)',
      app: site.app,
      type: site.type,
      pattern_count: (data.patterns || []).length,
      theme_refs_count: (data.theme_refs || []).length,
    }, options);
  } catch (error) {
    outputError(error);
  }
}

/**
 * List patterns under this site.
 */
export async function patterns(config, options = {}) {
  try {
    const falcor = makeClient(config);
    const patternRows = await resolvePattern(falcor, config);

    if (patternRows.length === 0) {
      output([], { ...options, mode: 'list' });
      return;
    }

    const result = patternRows.map((p) => {
      const d = parseData(p.data);
      return {
        id: p.id,
        type: p.type,
        data: {
          name: d.name || patternInstance(p) || '(unnamed)',
          pattern_type: d.pattern_type || '?',
          base_url: d.base_url || '/',
          subdomain: d.subdomain || '*',
          dmsEnvId: d.dmsEnvId || null,
        },
      };
    });

    if (options.format === 'summary') {
      output(result, { ...options, mode: 'list' });
    } else {
      output(result, options);
    }
  } catch (error) {
    outputError(error);
  }
}

/**
 * Show full tree: site → patterns → pages → sections, datasets.
 */
export async function tree(config, options = {}) {
  try {
    const falcor = makeClient(config);
    const siteType = siteTypeFor(config.type);
    const siteAppType = `${config.app}+${siteType}`;

    const { items } = await fetchAll(falcor, siteAppType, ['id', 'app', 'type', 'data'], { limit: 1 });
    if (items.length === 0) {
      outputError(`No site found for ${siteAppType}`);
      return;
    }

    const site = items[0];
    const patternRows = await resolvePattern(falcor, config);

    if (patternRows.length === 0) {
      output({ site, patterns: [] }, { ...options, format: 'tree' });
      return;
    }

    for (const pat of patternRows) {
      const d = parseData(pat.data);
      pat.data = d;

      if (d.pattern_type === 'page') {
        const pageType = pageTypeFor(pat);
        const pageAppType = `${config.app}+${pageType}`;

        const { items: pages } = await fetchAll(falcor, pageAppType, ['id', 'data'], { limit: 500 });

        for (const pg of pages) {
          pg.data = parseData(pg.data);
          const sectionRefs = pg.data.sections || pg.data.draft_sections || [];
          const sectionIds = sectionRefs
            .map((s) => (typeof s === 'object' ? s.id : s))
            .filter(Boolean);

          if (sectionIds.length > 0) {
            const secs = await fetchByIds(falcor, config.app, sectionIds, ['id', 'app', 'type', 'data']);
            secs.forEach((s) => { s.data = parseData(s.data); });
            pg._sections = secs;
          } else {
            pg._sections = [];
          }
        }

        pat._pages = pages;
      } else if (d.pattern_type === 'datasets') {
        // Sources for a datasets pattern live under its dmsEnv row.
        // Resolve the dmsEnv if dmsEnvId is set.
        const dmsEnvId = d.dmsEnvId;
        if (dmsEnvId) {
          const [envRow] = await fetchByIds(falcor, config.app, [dmsEnvId], ['id', 'type', 'data']);
          if (envRow) {
            const envData = parseData(envRow.data);
            const sourceIds = (envData.sources || [])
              .map((s) => (typeof s === 'object' ? s.id : s))
              .filter(Boolean);

            if (sourceIds.length > 0) {
              const sources = await fetchByIds(
                falcor, config.app, sourceIds, ['id', 'app', 'type', 'data']
              );
              pat._datasets = sources.map((s) => ({ ...s, data: parseData(s.data) }));
            } else {
              pat._datasets = [];
            }
          }
        } else {
          pat._datasets = [];
        }
      }
    }

    output({ site, patterns: patternRows }, { ...options, format: 'tree' });
  } catch (error) {
    outputError(error);
  }
}

const refIdOf = (e) => String(e && typeof e === 'object' ? e.id : e);
const instanceOfType = (type) => String(type || '').split('|')[0];

/**
 * Give every page its own copy of the sections it shares (planning task
 * shared-sections-copy-apart.md). A dry run unless `--apply`.
 *
 * Reads every page of every pattern the site lists, and for each section a page lists in `sections`
 * or `draft_sections`:
 *   - listed by two or more pages: the lowest-id page of the section's own pattern keeps the row;
 *     every other page gets its own copy;
 *   - a section of ANOTHER pattern (owner, 2026-11-17: copy it): the page gets its own copy in its
 *     own pattern, even when no other page lists the row.
 * A copy is the row's `data` as it is (its `trackingId` too, which a page's filters key on), claimed
 * by the page through `parent_id`; the page's list entry is repointed at it in place, in both lists
 * when the page lists the row in both. An entry naming no row, or a row that isn't a section, is
 * left alone. Rows nobody lists any more are not deleted here (the server's sweep decides).
 *
 * Writes go through the server (create, then one edit per page), so change_log, broadcasts and the
 * parent stamp apply; each page whose `draft_sections` changed has its live-edit room synced. Before
 * writing, every page it will change is saved to `--backup` (its two lists as they were).
 */
export async function unshareSections(config, options = {}) {
  try {
    const falcor = makeClient(config);
    const app = config.app;

    // Every page of every pattern in the site's list (several pattern rows can share an instance).
    const patternRows = await resolvePattern(falcor, config);
    const pageTypes = [...new Set(patternRows.map((p) => pageTypeFor(p)))];
    const nameOf = new Map(patternRows.map((p) => [patternInstance(p), parseData(p.data).name]));
    // What this user can't read is reported, and blocks --apply: a page it can't see could be the
    // keeper of a row, or list one, so the plan would be incomplete (2026-11-17: an anonymous run on
    // a prod copy silently skipped 3 patterns whose rows came back as `no-access`).
    const unreadable = { patterns: [], pages: 0 };
    for (const p of patternRows) if (String(p.id) === 'no-access') unreadable.patterns.push(patternInstance(p));
    const pages = [];
    for (const pageType of pageTypes) {
      const { items } = await fetchAll(falcor, `${app}+${pageType}`, ['id', 'data'], { limit: 100000 });
      for (const it of items) {
        if (String(it.id) === 'no-access' || it.data === 'no-access') { unreadable.pages++; continue; }
        pages.push({ id: String(it.id), inst: instanceOfType(pageType), d: parseData(it.data) });
      }
    }
    const partial = unreadable.patterns.length > 0 || unreadable.pages > 0;

    // Which pages list each id (once per page, whichever of its lists).
    const listers = new Map();
    for (const p of pages) {
      for (const key of ['sections', 'draft_sections']) {
        for (const e of (Array.isArray(p.d[key]) ? p.d[key] : [])) {
          const id = refIdOf(e);
          if (!/^\d+$/.test(id)) continue;
          if (!listers.has(id)) listers.set(id, new Set());
          listers.get(id).add(p);
        }
      }
    }

    // The rows' own types, to tell a section of another pattern and a missing row.
    const ids = [...listers.keys()];
    const typeOf = new Map();
    for (let i = 0; i < ids.length; i += 500) {
      for (const r of await fetchByIds(falcor, app, ids.slice(i, i + 500), ['id', 'type'])) {
        if (r?.type) typeOf.set(String(r.id), r.type);
      }
    }

    const only = options.pattern ? String(options.pattern) : null;
    const work = [];                     // { page, sectionId, reason }
    let missing = 0;
    for (const [id, set] of listers) {
      const type = typeOf.get(id);
      if (!type) { missing++; continue; }
      if (!/\|component$/.test(type)) continue;
      const rowInst = instanceOfType(type);
      const own = [...set].filter((p) => p.inst === rowInst).sort((a, b) => +a.id - +b.id);
      const keeper = own[0] || null;
      for (const p of set) {
        if (p === keeper) continue;
        if (only && p.inst !== only && nameOf.get(p.inst) !== only) continue;
        work.push({ page: p, sectionId: id, reason: p.inst === rowInst ? 'shared' : 'other_pattern' });
      }
    }

    const byPattern = new Map();
    for (const w of work) {
      const k = w.page.inst;
      if (!byPattern.has(k)) byPattern.set(k, { pattern: k, name: nameOf.get(k) || null, pages: new Set(), shared: 0, other_pattern: 0 });
      const b = byPattern.get(k); b.pages.add(w.page.id); b[w.reason]++;
    }
    const plan = [...byPattern.values()].map((b) => ({ ...b, pages: b.pages.size }))
      .sort((a, b) => (b.shared + b.other_pattern) - (a.shared + a.other_pattern));
    const summary = {
      apply: !!options.apply,
      app,
      pages_read: pages.length,
      copies: work.length,
      shared: work.filter((w) => w.reason === 'shared').length,
      other_pattern: work.filter((w) => w.reason === 'other_pattern').length,
      pages_to_edit: new Set(work.map((w) => w.page.id)).size,
      refs_to_missing_rows: missing,
      ...(partial && { unreadable }),
      patterns: plan,
    };
    if (partial) {
      const message = `Incomplete: this user can't read ${unreadable.patterns.length} pattern(s) and ${unreadable.pages} page(s), so the plan may miss rows. Sign in as a user who can read every page of the site.`;
      if (options.apply) { outputError(new Error(`${message} Nothing was written.`)); return; }
      output({ ...summary, message }, options);
      return;
    }
    if (!options.apply || !work.length) {
      output({ ...summary, ...(!options.apply && work.length ? { message: 'Dry run: nothing written. Re-run with --apply.' } : {}) }, options);
      return;
    }

    // Backup: the two lists of every page about to change, as they are now.
    const byPage = new Map();
    for (const w of work) {
      if (!byPage.has(w.page.id)) byPage.set(w.page.id, { page: w.page, ids: [] });
      byPage.get(w.page.id).ids.push(w.sectionId);
    }
    const backupFile = options.backup
      || path.resolve(`dms-unshare-sections-${app}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(backupFile, JSON.stringify({
      app, at: new Date().toISOString(),
      pages: [...byPage.values()].map(({ page }) => ({ id: page.id, type: `${page.inst}|page`, sections: page.d.sections ?? null, draft_sections: page.d.draft_sections ?? null })),
    }, null, 2));

    // The rows' data, for the copies.
    const sourceIds = [...new Set(work.map((w) => w.sectionId))];
    const dataOf = new Map();
    for (let i = 0; i < sourceIds.length; i += 200) {
      for (const r of await fetchByIds(falcor, app, sourceIds.slice(i, i + 200), ['id', 'data'])) dataOf.set(String(r.id), parseData(r.data));
    }

    const edited = [];
    const roomSync = [];
    for (const { page, ids: pageIds } of byPage.values()) {
      const swap = new Map();
      for (const id of pageIds) {
        const data = { ...(dataOf.get(id) || {}) };
        delete data.id;
        delete data.parent;
        data.parent_id = Number(page.id);
        const res = await falcor.call(['dms', 'data', 'create'], [app, `${page.inst}|component`, data]);
        const byId = res?.json?.dms?.data?.[app]?.byId || res?.json?.dms?.data?.byId || {};
        const newId = Object.keys(byId)[0];
        if (!newId) throw new Error(`Could not copy section ${id} for page ${page.id}; pages edited so far: ${edited.map((e) => e.id).join(', ') || 'none'} (backup: ${backupFile})`);
        swap.set(id, Number(newId));
      }
      const patch = {};
      for (const key of ['sections', 'draft_sections']) {
        const list = Array.isArray(page.d[key]) ? page.d[key] : null;
        if (!list || !list.some((e) => swap.has(refIdOf(e)))) continue;
        patch[key] = list.map((e) => {
          const newId = swap.get(refIdOf(e));
          if (newId === undefined) return e;
          return typeof e === 'object' && e !== null
            ? { ...e, id: newId, ref: `${app}+${page.inst}|component` }
            : newId;
        });
      }
      await falcor.call(['dms', 'data', 'edit'], [app, Number(page.id), patch]);
      edited.push({ id: page.id, pattern: page.inst, copies: Object.fromEntries(swap) });
      if (patch.draft_sections) {
        const r = await afterDraftSectionsWrite(config, page.id);
        if (r) roomSync.push({ page: page.id, ...r });
      }
    }

    output({
      ...summary,
      backup: backupFile,
      edited,
      ...(roomSync.length && { room_sync: roomSync }),
    }, options);
  } catch (error) {
    outputError(error);
  }
}

export default { show, patterns, tree, unshareSections };
