/**
 * Client handling of a dataset-row (`:data`) WebSocket broadcast.
 *
 * `ws.onmessage` used to apply whatever arrived, with no equivalent of the
 * `isSyncExcluded` filter the pull path uses — so a broadcast for a split type
 * parsed a multi-megabyte blob, ran it through the Yjs merge, wrote it to
 * IndexedDB and registered the type as locally-synced. Nothing read that copy,
 * nothing refreshed it, and nothing removed it.
 *
 * The invalidation is the part that matters: it debounces into
 * router.revalidate() (dmsSiteFactory.jsx), which refetches through Falcor/UDA.
 * See sync-ws-broadcast-split-row-payload.md.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const state = new Map();
const itemsByAppType = new Map();   // `${app}+${type}` → rows
const upserts = [];
const deletedIds = [];
const scopeAdds = [];

const key = (app, type) => `${app}+${type}`;

vi.mock('../src/sync/idb-store.js', () => ({
  getState: async (k) => (state.has(k) ? state.get(k) : null),
  setState: async (k, v) => { state.set(k, v); },
  removeState: async (k) => { state.delete(k); },
  getItem: async () => null,
  getItemsByIds: async () => [],
  getItemsByAppType: async (app, type) => itemsByAppType.get(key(app, type)) ?? [],
  getDistinctAppTypesByApp: async () => [...itemsByAppType.keys()].map(k => {
    const i = k.indexOf('+');
    return { app: k.slice(0, i), type: k.slice(i + 1) };
  }),
  getDistinctAppTypesByAppAndPatternPrefix: async () => [],
  upsertItemNow: async (row) => { upserts.push(row); },
  upsertItemsFromServer: async () => {},
  applyChangeBatch: async () => {},
  deleteItem: async (id) => { deletedIds.push(id); },
  deleteItemsByIds: async (ids) => { deletedIds.push(...ids); },
  updateItemData: async () => {},
  createItemOffline: async () => ({ id: 1 }),
  reassignItemId: async () => {},
  sqliteNow: () => '2026-09-10T00:00:00Z',
  resetDB: async () => {},
  addPendingMutation: async () => {},
  deletePendingMutationById: async () => {},
  findFirstPendingMutation: async () => null,
  countAllPendingMutations: async () => 0,
  getAllPendingMutationsOrdered: async () => [],
}));

vi.mock('../src/sync/yjs-store.js', () => ({
  applyLocal: (_id, d) => d,
  applyRemote: (_id, d) => d,
  initFromData: () => {},
  getData: () => ({}),
}));

vi.mock('../src/sync/sync-scope.js', () => ({
  addToScope: (app, type) => { scopeAdds.push(key(app, type)); },
  clearScope: () => { scopeAdds.length = 0; },
  isLocal: () => true,
  getSyncedTypes: () => [],
}));

const APP = 'mitigat-ny-prod';
const SITE_TYPE = 'prod|site';
const SPLIT_TYPE = 'jurisdictions|1346450:data';
const NORMAL_TYPE = 'mitigateny_sullivan|component';

class FakeWS {
  constructor(url) { this.url = url; this.readyState = 1; this.sent = []; FakeWS.last = this; }
  send(m) { this.sent.push(m); }
  close() {}
}

let routes = [];
async function loadSyncManager() {
  vi.resetModules();
  globalThis.__SYNC_DEV = false;
  globalThis.WebSocket = FakeWS;
  globalThis.fetch = async (url) => {
    for (const [match, body] of routes) if (url.includes(match)) return { ok: true, status: 200, json: async () => body(url) };
    throw new Error(`unrouted fetch: ${url}`);
  };
  const mod = await import('../src/sync/sync-manager.js');
  mod.configure(APP, 'http://test', SITE_TYPE);
  return mod;
}

/** Deliver a broadcast and wait for the handler's async work to settle. */
async function deliver(msg) {
  await FakeWS.last.onmessage({ data: JSON.stringify(msg) });
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

beforeEach(() => {
  state.clear();
  itemsByAppType.clear();
  upserts.length = 0;
  deletedIds.length = 0;
  scopeAdds.length = 0;
  routes = [['/sync/bootstrap', () => ({ items: [], revision: 100 })]];
  FakeWS.last = null;
});

describe('a :data broadcast is a notification, not data', () => {
  it('advances the watermark and invalidates, but writes nothing locally', async () => {
    const sync = await loadSyncManager();
    const scopes = [];
    sync.onInvalidate((s) => scopes.push(s));
    sync.connectWS();

    await deliver({
      type: 'change', revision: 949545, action: 'U',
      item: { id: 1346450, app: APP, type: SPLIT_TYPE, dataOmitted: true },
    });

    expect(state.get('last_revision')).toBe('949545');
    expect(upserts).toHaveLength(0);
    expect(scopes).toContain('data_items');
    expect(scopes).toContain(`data_items:${APP}+${SPLIT_TYPE}`);
  });

  it('does not register the split type as locally synced', async () => {
    // addToScope here made isLocal() true for a type whose rows only ever
    // arrived by broadcast — a mirror holding an arbitrary subset of a dataset.
    const sync = await loadSyncManager();
    sync.connectWS();

    await deliver({
      type: 'change', revision: 10, action: 'U',
      item: { id: 1, app: APP, type: SPLIT_TYPE, dataOmitted: true },
    });

    expect(scopeAdds).not.toContain(`${APP}+${SPLIT_TYPE}`);
  });

  it('refuses the payload even from a server that still sends it', async () => {
    // The client branches on the type, not on the server's `dataOmitted` flag,
    // so it does not depend on the server having been upgraded first.
    const sync = await loadSyncManager();
    sync.connectWS();

    await deliver({
      type: 'change', revision: 11, action: 'U',
      item: { id: 1, app: APP, type: SPLIT_TYPE, data: '{"big":"blob"}' },
    });

    expect(upserts).toHaveLength(0);
    expect(scopeAdds).not.toContain(`${APP}+${SPLIT_TYPE}`);
    expect(state.get('last_revision')).toBe('11');
  });

  it('ignores a split-row delete rather than touching the mirror', async () => {
    const sync = await loadSyncManager();
    sync.connectWS();

    await deliver({
      type: 'change', revision: 12, action: 'D',
      item: { id: 1, app: APP, type: SPLIT_TYPE },
    });

    expect(deletedIds).toHaveLength(0);
    expect(state.get('last_revision')).toBe('12');
  });

  it('still mirrors an ordinary type as before', async () => {
    const sync = await loadSyncManager();
    sync.connectWS();

    await deliver({
      type: 'change', revision: 13, action: 'U',
      item: { id: 7, app: APP, type: NORMAL_TYPE, data: '{"a":1}' },
    });

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ id: 7, app: APP, type: NORMAL_TYPE });
    expect(scopeAdds).toContain(`${APP}+${NORMAL_TYPE}`);
    expect(state.get('last_revision')).toBe('13');
  });
});

describe('purging split rows an earlier build mirrored locally', () => {
  it('deletes local :data rows on bootstrap and leaves the rest', async () => {
    itemsByAppType.set(`${APP}+${SPLIT_TYPE}`, [{ id: 1 }, { id: 2 }, { id: 3 }]);
    itemsByAppType.set(`${APP}+${NORMAL_TYPE}`, [{ id: 10 }, { id: 11 }]);

    const sync = await loadSyncManager();
    await sync.bootstrapSkeleton();

    expect(deletedIds).toEqual([1, 2, 3]);
  });

  it('runs at most once per session', async () => {
    itemsByAppType.set(`${APP}+${SPLIT_TYPE}`, [{ id: 1 }]);
    const sync = await loadSyncManager();
    await sync.bootstrapSkeleton();
    await sync.bootstrapSkeleton();
    expect(deletedIds).toEqual([1]);
  });

  it('is a no-op when there is nothing to purge', async () => {
    itemsByAppType.set(`${APP}+${NORMAL_TYPE}`, [{ id: 10 }]);
    const sync = await loadSyncManager();
    await sync.bootstrapSkeleton();
    expect(deletedIds).toHaveLength(0);
  });
});
