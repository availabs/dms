/**
 * Sync delta non-convergence — the loop where a client could never advance
 * past a large change_log backlog.
 *
 * Live 2026-09-10 on mitigat-ny-prod: every WebSocket reconnect re-requested
 * the identical delta window (`since` stuck at 890584 / 893395 / 905516 /
 * 907608 for hours), the server rebuilt the identical 436 MB payload, and the
 * client measured `changes.length`, decided it was too large, and threw all of
 * it away — because the re-bootstrap it fell back to wrote a DIFFERENT
 * watermark key than the one catchUp reads. Three separate bugs kept it
 * spinning; see sync-delta-change-log-bloat.md item A.
 *
 * These tests drive the real ws.onopen → catchUp path with a faked
 * IndexedDB, fetch and WebSocket, and assert on the watermark and on the URLs
 * actually requested.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Fakes are module-level so the vi.mock factory (hoisted above them) can close
// over them; every test imports sync-manager dynamically, after these exist.
const state = new Map();
const items = new Map();
let applied = [];

vi.mock('../src/sync/idb-store.js', () => ({
  getState: async (k) => (state.has(k) ? state.get(k) : null),
  setState: async (k, v) => { state.set(k, v); },
  removeState: async (k) => { state.delete(k); },
  getItem: async (id) => items.get(id) ?? null,
  getItemsByIds: async () => [],
  getItemsByAppType: async () => [],
  getDistinctAppTypesByApp: async () => [],
  getDistinctAppTypesByAppAndPatternPrefix: async () => [],
  upsertItemNow: async (row) => { items.set(row.id, row); },
  upsertItemsFromServer: async (rows) => { for (const r of rows) items.set(r.id, r); },
  applyChangeBatch: async (ops) => { applied.push(...ops); },
  deleteItem: async (id) => { items.delete(id); },
  deleteItemsByIds: async (ids) => { for (const id of ids) items.delete(id); },
  updateItemData: async () => {},
  createItemOffline: async () => ({ id: 1 }),
  reassignItemId: async () => {},
  sqliteNow: () => '2026-09-10T00:00:00Z',
  resetDB: async () => { state.clear(); items.clear(); },
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
  addToScope: () => {},
  clearScope: () => {},
  isLocal: () => true,
  getSyncedTypes: () => [],
}));

const APP = 'mitigat-ny-prod';
const SITE_TYPE = 'prod|site';
const PATTERN = 'mitigateny_sullivan|page';

let urls = [];
let routes = [];

/** Respond with the first matching route; routes are [substring, bodyFactory]. */
function respond(url) {
  for (const [match, body] of routes) {
    if (url.includes(match)) return body(url);
  }
  throw new Error(`unrouted fetch: ${url}`);
}

class FakeWS {
  constructor(url) {
    this.url = url;
    this.readyState = 1;
    this.sent = [];
    FakeWS.last = this;
  }
  send(msg) { this.sent.push(msg); }
  close() {}
}

async function loadSyncManager() {
  vi.resetModules();
  globalThis.__SYNC_DEV = false;
  globalThis.WebSocket = FakeWS;
  globalThis.fetch = async (url) => {
    urls.push(url);
    const body = respond(url);
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  };
  const mod = await import('../src/sync/sync-manager.js');
  mod.configure(APP, 'http://test', SITE_TYPE);
  return mod;
}

const deltaUrls = () => urls.filter(u => u.includes('/sync/delta'));
const bootstrapUrls = () => urls.filter(u => u.includes('/sync/bootstrap'));
const since = (url) => new URL(url, 'http://test').searchParams.get('since');

beforeEach(() => {
  state.clear();
  items.clear();
  applied = [];
  urls = [];
  routes = [];
  FakeWS.last = null;
});

describe('catchUp with a backlog too large to apply', () => {
  // The one test that matters: the watermark has to move.
  it('advances last_revision to the server tail and re-requests from there', async () => {
    state.set('last_revision', '907608');
    routes = [
      ['/sync/delta', () => ({
        tooLarge: true, count: 40511, maxChanges: 1000,
        changes: [], revision: 907608, latestRevision: 946768,
      })],
      ['/sync/bootstrap', () => ({ items: [], revision: 946770 })],
    ];

    const sync = await loadSyncManager();
    sync.connectWS();
    FakeWS.last.onopen();

    await vi.waitFor(() => expect(state.get('last_revision')).toBe('946768'));

    // First reconnect asked from the stale watermark...
    expect(since(deltaUrls()[0])).toBe('907608');
    // ...and fell back to a fresh skeleton snapshot rather than applying 40k changes.
    expect(bootstrapUrls().some(u => u.includes('skeleton='))).toBe(true);

    // Second reconnect asks from the NEW watermark. Before the fix this was
    // 907608 again, forever.
    urls = [];
    sync.connectWS();
    FakeWS.last.onopen();
    await vi.waitFor(() => expect(deltaUrls().length).toBe(1));
    expect(since(deltaUrls()[0])).toBe('946768');
  });

  it('tells the server its own threshold so the payload is never built', async () => {
    state.set('last_revision', '100');
    routes = [['/sync/delta', () => ({ changes: [], revision: 100 })]];
    const sync = await loadSyncManager();
    sync.connectWS();
    FakeWS.last.onopen();
    await vi.waitFor(() => expect(deltaUrls().length).toBe(1));
    expect(deltaUrls()[0]).toContain('maxChanges=1000');
  });

  it('still converges against a server that sends the oversized payload anyway', async () => {
    // An older server with no `tooLarge` support: the client has to notice the
    // size itself, and must still advance.
    state.set('last_revision', '500');
    const changes = Array.from({ length: 1001 }, (_, i) => ({
      revision: 501 + i, item_id: String(i), app: APP, type: PATTERN, action: 'U', data: '{}',
    }));
    routes = [
      ['/sync/delta', () => ({ changes, revision: 1501 })],
      ['/sync/bootstrap', () => ({ items: [], revision: 1501 })],
    ];
    const sync = await loadSyncManager();
    sync.connectWS();
    FakeWS.last.onopen();

    await vi.waitFor(() => expect(state.get('last_revision')).toBe('1501'));
    expect(applied).toHaveLength(0); // discarded, not applied one-by-one
  });

  it('applies a delta that is under the threshold and advances normally', async () => {
    state.set('last_revision', '10');
    routes = [
      ['/sync/delta', () => ({
        changes: [{ revision: 11, item_id: '1', app: APP, type: PATTERN, action: 'U', data: '{"a":1}' }],
        revision: 11,
      })],
    ];
    const sync = await loadSyncManager();
    sync.connectWS();
    FakeWS.last.onopen();

    await vi.waitFor(() => expect(state.get('last_revision')).toBe('11'));
    expect(applied).toHaveLength(1);
    expect(bootstrapUrls()).toHaveLength(0);
  });

  it('does nothing when there is no watermark yet (cold client)', async () => {
    routes = [['/sync/delta', () => ({ changes: [], revision: 0 })]];
    const sync = await loadSyncManager();
    sync.connectWS();
    FakeWS.last.onopen();
    await new Promise(r => setTimeout(r, 20));
    expect(deltaUrls()).toHaveLength(0);
  });
});

describe('watermark clearing', () => {
  it('re-bootstraps a pattern cold when its delta is too large', async () => {
    // Before the fix this branch re-entered the memoizing wrapper while its own
    // promise was still in flight, resolving that promise with itself
    // (TypeError: Chaining cycle detected) — so it never re-bootstrapped, and
    // the rejection escaped the surrounding try/catch.
    state.set(`rev:pattern:${PATTERN}`, '200');
    routes = [
      ['/sync/delta', () => ({
        tooLarge: true, count: 5000, changes: [], revision: 200, latestRevision: 9000,
      })],
      ['/sync/bootstrap', () => ({ items: [], revision: 9000 })],
    ];
    const sync = await loadSyncManager();

    await expect(sync.bootstrapPattern(PATTERN)).resolves.not.toThrow();

    expect(deltaUrls()).toHaveLength(1);
    expect(bootstrapUrls().some(u => u.includes(`pattern=${encodeURIComponent(PATTERN)}`))).toBe(true);
    expect(state.get(`rev:pattern:${PATTERN}`)).toBe('9000');
  });

  it('treats a watermark left as the string "null" as cold, not as NaN', async () => {
    // setLastRevision(null) used to store String(null). getLastRevision then
    // returned parseInt("null") === NaN, which is not === null, so the warm
    // branch ran with `since=NaN` — and the server's `parseInt(since) || 0`
    // turned that into a delta over the app's entire change_log history.
    // Profiles in the wild still carry that value and must self-heal.
    state.set(`rev:pattern:${PATTERN}`, 'null');
    routes = [['/sync/bootstrap', () => ({ items: [], revision: 4242 })]];

    const sync = await loadSyncManager();
    await sync.bootstrapPattern(PATTERN);

    expect(deltaUrls()).toHaveLength(0);
    expect(urls.some(u => u.includes('since=NaN'))).toBe(false);
    expect(bootstrapUrls()).toHaveLength(1);
    expect(state.get(`rev:pattern:${PATTERN}`)).toBe('4242');
  });
});
