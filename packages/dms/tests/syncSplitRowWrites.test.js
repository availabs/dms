/**
 * dmsDataEditor with sync on: dataset rows (split `:data` types) are written
 * through Falcor, never through the sync push.
 *
 * /sync/push writes the app's main table, not the dataset's split table, and
 * skips the controller's change history. So a dataset-row create sent through
 * sync landed where no dataset read looks, and an update (the type having been
 * scoped by the bootstrapPattern the editor awaits) matched nothing and 404'd.
 * See planning/tasks/current/sync-split-row-writes-misrouted.md.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { dmsDataEditor } from '../src/api/index.js';

const APP = 'mitigat-ny-prod';
const SPLIT_TYPE = 'qa_tickets|2860549:data';
const NORMAL_TYPE = 'mitigateny_2025|page';

let calls;
let scoped;

// The sync API surface dmsDataEditor uses. bootstrapPattern scopes the type
// whatever the server returns, as the real one does (sync-manager.js).
function fakeSync() {
  return {
    isLocal: (app, type) => scoped.has(`${app}+${type}`),
    bootstrapPattern: async (type) => { calls.bootstrapPattern.push(type); scoped.add(`${APP}+${type}`); },
    beginBatch: () => {},
    endBatch: () => {},
    localCreate: async (app, type, data) => { calls.localCreate.push({ app, type, data }); return '999'; },
    localUpdate: async (id, data) => { calls.localUpdate.push({ id, data }); },
    localDelete: async (id) => { calls.localDelete.push(id); },
  };
}

const falcor = {
  call: async (path, args) => {
    calls.falcor.push({ path: path.join('.'), args });
    if (path.join('.') === 'dms.data.create') return { json: { dms: { data: { byId: { 123: {} } } } } };
    return {};
  },
  invalidate: async () => {},
};

const format = (type) => ({ app: APP, type, isDms: true });

beforeEach(() => {
  calls = { bootstrapPattern: [], localCreate: [], localUpdate: [], localDelete: [], falcor: [] };
  scoped = new Set();
  globalThis.__dmsSyncAPI = fakeSync();
});

describe('dataset rows bypass the sync push', () => {
  it('creates a dataset row through Falcor', async () => {
    const res = await dmsDataEditor(falcor, { format: format(SPLIT_TYPE) }, { title: 'A ticket' });

    expect(calls.localCreate).toEqual([]);
    expect(calls.falcor).toEqual([{ path: 'dms.data.create', args: [APP, SPLIT_TYPE, { title: 'A ticket' }] }]);
    expect(res.id).toBe('123');
  });

  it('updates a dataset row through Falcor, still subscribing the tab to its channel', async () => {
    await dmsDataEditor(falcor, { format: format(SPLIT_TYPE) }, { id: 42, status: 'Resolved' });

    expect(calls.bootstrapPattern).toEqual([SPLIT_TYPE]);
    expect(calls.localUpdate).toEqual([]);
    expect(calls.falcor[0]).toEqual({ path: 'dms.data.edit', args: [APP, 42, { id: 42, status: 'Resolved' }, SPLIT_TYPE] });
  });

  it('deletes a dataset row through Falcor even once its type is scoped', async () => {
    scoped.add(`${APP}+${SPLIT_TYPE}`);
    await dmsDataEditor(falcor, { format: format(SPLIT_TYPE) }, { id: 42 }, 'delete');

    expect(calls.localDelete).toEqual([]);
    expect(calls.falcor).toEqual([{ path: 'dms.data.delete', args: [APP, SPLIT_TYPE, 42] }]);
  });
});

describe('other rows still go through sync', () => {
  it('creates a page through the sync push', async () => {
    const res = await dmsDataEditor(falcor, { format: format(NORMAL_TYPE) }, { title: 'A page' });

    expect(calls.localCreate).toEqual([{ app: APP, type: NORMAL_TYPE, data: { title: 'A page' } }]);
    expect(calls.falcor).toEqual([]);
    expect(res.id).toBe('999');
  });

  it('updates a page through the sync push', async () => {
    await dmsDataEditor(falcor, { format: format(NORMAL_TYPE) }, { id: 7, title: 'Renamed' });

    expect(calls.bootstrapPattern).toEqual([NORMAL_TYPE]);
    expect(calls.localUpdate).toEqual([{ id: 7, data: { id: 7, title: 'Renamed' } }]);
    expect(calls.falcor).toEqual([]);
  });
});
