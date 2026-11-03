/**
 * dmsDataLoader with sync on: a list served from local SQLite resolves its dms-format refs with the
 * same row columns the Falcor path fetches (data, type and the four stamps).
 *
 * The local path used to copy only the stamps, so a site's `patterns` refs came back without `type`.
 * Anything reading a pattern's instance (`getInstance(pattern.type)`) then got '', which is how the
 * QA install's Configure tab showed most of MitigateNY's county sites as not covered whenever the
 * site list came from the local copy (a refresh that went to Falcor showed them right). Only patterns
 * whose stored data happened to hold a `type` kept it.
 * See planning/tasks/current/qa-pattern-type.md, Open work §9.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { dmsDataLoader } from '../src/api/index.js';

const APP = 'qa_test';
const SITE_TYPE = 'qa_test:site';

const rows = {
  1: { id: '1', app: APP, type: SITE_TYPE, data: { site_name: 'QA Test', patterns: [{ id: 5, ref: `${APP}+pattern` }, { id: 7, ref: `${APP}+pattern` }] } },
  // a pattern row as most are stored: no `type` in its data
  5: { id: '5', app: APP, type: 'qa_test|alphapage:pattern', data: { name: 'AlphaPage', pattern_type: 'page' }, created_at: 'c5', updated_at: 'u5' },
  // a stale `type` in the data loses to the row's own, as on the Falcor path
  7: { id: '7', app: APP, type: 'qa_test|betapage:pattern', data: { name: 'BetaPage', pattern_type: 'page', type: 'qa_test|old_name:pattern' } },
};

function fakeSync() {
  return {
    isLocal: (app, type) => app === APP && type === SITE_TYPE,
    bootstrapPattern: () => {},
    getItemsByAppType: async (app, type) => Object.values(rows).filter((r) => r.app === app && r.type === type),
    getItemsByIds: async (ids) => ids.map((id) => rows[id]).filter(Boolean),
    getItem: async (id) => rows[id] || null,
  };
}

const falcor = { get: async () => { throw new Error('served locally, Falcor not expected'); }, invalidate: async () => {}, getCache: () => ({}) };

const siteConfig = {
  format: { app: APP, type: SITE_TYPE, attributes: [{ key: 'patterns', type: 'dms-format', isArray: true, format: `${APP}+pattern` }] },
  children: [{ action: 'list', path: '/*' }],
};

beforeEach(() => {
  globalThis.__dmsSyncAPI = fakeSync();
});

describe('local list: resolved refs carry their row type', () => {
  it("gives each pattern ref its row's type, over any type in its data", async () => {
    const [site] = await dmsDataLoader(falcor, siteConfig, '/');
    expect(site.patterns.map((p) => [p.id, p.name, p.type])).toEqual([
      ['5', 'AlphaPage', 'qa_test|alphapage:pattern'],
      ['7', 'BetaPage', 'qa_test|betapage:pattern'],
    ]);
    expect(site.patterns[0]).toMatchObject({ created_at: 'c5', updated_at: 'u5' });
  });
});
