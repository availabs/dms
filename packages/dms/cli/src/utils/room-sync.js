/**
 * Page-structure room sync.
 *
 * With local-first sync on, every page opened in edit mode joins a shared Yjs
 * room keyed by the page's id (client: `sync/page-structure-provider.js`,
 * server: `dms-server/src/routes/sync/ws.js`, persisted in `yjs_states`). The
 * room holds the page's `draft_sections` as `{id, ref}` stubs, and once it has
 * content it WINS over the database: `sectionArray.jsx`'s save/remove/move
 * send the room's array back as `draft_sections`, and the room only ever
 * re-seeds from the database while it is still genuinely empty.
 *
 * The CLI writes `draft_sections` straight through `dms.data.edit`, never
 * through the room — so without this, a CLI edit to a page someone had
 * already edited in the browser leaves the room holding the OLD list, and the
 * next section save in the browser silently reverts the page to it. Found
 * live on mitigat-ny-prod 2026-09-25 (page 2711376): a 43-section CLI build
 * on a page whose room still held its 1-section template, reverted on every
 * browser save — see concurrent-page-editing-data-loss.md, "Bug 20".
 *
 * `syncPageRoom` makes the room match the database after a CLI write:
 *   1. re-read the page's `draft_sections` with a fresh (uncached) client —
 *      the post-write truth, including anything a browser wrote in between;
 *   2. join the room; if its state vector is empty nobody has ever written
 *      it, and the browser will seed it from the database on its own — leave;
 *   3. otherwise replace the room's array with the database's stubs (one Yjs
 *      transaction) if they differ;
 *   4. wait before leaving, then re-join and verify.
 *
 * Step 4's wait is load-bearing, not cosmetic. The server handles each WS
 * message concurrently (`ws.on('message', data => handleMessage(ws, data))`,
 * no queue): `yjs-update` awaits `getOrCreateYDoc` before applying, while
 * `leave-room` runs synchronously — and when the leaver is the room's last
 * member, `cleanupRoom` encodes the doc for persistence synchronously and
 * then destroys it. Leave too soon and the persisted state is captured BEFORE
 * the update lands, so the update is silently lost.
 *
 * Mirrors the wire protocol of page-structure-provider.js (join-room,
 * yjs-sync-step1/step2, yjs-update, leave-room; base64 Yjs updates; array
 * name `draft_sections`). Keep the two in step if either changes.
 */

import WebSocket from 'ws';
import * as Y from 'yjs';
import { makeClient, fetchById, parseData } from './data.js';

const ARRAY_NAME = 'draft_sections';
const STEP_TIMEOUT_MS = 5000;
// How long to stay in the room after sending, so the server applies the
// update before our leave-room can trigger its persist-and-destroy. The
// server applies after one awaited (already-resolved) doc lookup, so this is
// generous; `verify` below catches it if it ever isn't.
const SETTLE_MS = 750;

function wsUrlFor(host) {
  const url = new URL('/sync/subscribe', host);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function toStubs(draftSections) {
  return (Array.isArray(draftSections) ? draftSections : [])
    .map((s) => (s && typeof s === 'object' ? { id: s.id, ref: s.ref } : { id: s }))
    .filter((s) => s.id != null)
    .map((s) => (s.ref === undefined ? { id: String(s.id) } : { id: String(s.id), ref: s.ref }));
}

function sameStubs(a, b) {
  return a.length === b.length
    && a.every((s, i) => String(s?.id) === String(b[i]?.id) && (s?.ref ?? null) === (b[i]?.ref ?? null));
}

/**
 * Join a room and resolve once its current state is known.
 * Resolves `{ ws, doc, empty }`; the caller must call `leave(ws, id)`.
 */
function joinRoom(wsUrl, itemId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const doc = new Y.Doc();
    let settled = false;
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        try { ws.terminate(); } catch {}
        reject(err);
      } else {
        resolve(value);
      }
    };
    const timer = setTimeout(
      () => finish(new Error(`timed out waiting for room state of ${itemId}`)),
      STEP_TIMEOUT_MS,
    );

    ws.on('open', () => ws.send(JSON.stringify({ type: 'join-room', itemId })));
    ws.on('error', (err) => finish(new Error(`sync WebSocket error: ${err.message}`)));
    ws.on('close', () => finish(new Error('sync WebSocket closed before room state arrived')));
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.itemId !== itemId) return;
      if (msg.type === 'yjs-sync-step1') {
        const sv = Y.decodeStateVector(Buffer.from(msg.stateVector, 'base64'));
        // Same "never written" test as page-structure-provider.js's knownEmpty.
        // Non-empty: step2 follows immediately with the content.
        if (sv.size === 0) finish(null, { ws, doc, empty: true });
      } else if (msg.type === 'yjs-sync-step2') {
        Y.applyUpdate(doc, Buffer.from(msg.update, 'base64'), 'remote');
        finish(null, { ws, doc, empty: false });
      } else if (msg.type === 'yjs-update' && settled) {
        // A browser editing concurrently — keep our copy current.
        Y.applyUpdate(doc, Buffer.from(msg.update, 'base64'), 'remote');
      }
    });
  });
}

function leave(ws, itemId) {
  return new Promise((resolve) => {
    try {
      ws.send(JSON.stringify({ type: 'leave-room', itemId }));
      ws.once('close', () => resolve());
      ws.close();
      setTimeout(() => { try { ws.terminate(); } catch {} resolve(); }, 1000);
    } catch {
      resolve();
    }
  });
}

async function readDbStubs(config, pageId) {
  // Fresh client: the caller's client has the pre-write page cached.
  const page = await fetchById(makeClient(config), config.app, pageId, ['id', 'type', 'data']);
  // A missing id comes back as an item with every attribute undefined, not null.
  if (!page?.type) throw new Error(`page ${pageId} not found in ${config.app}`);
  if (!page.type.endsWith('|page')) throw new Error(`item ${pageId} is a ${page.type}, not a page`);
  return toStubs(parseData(page.data).draft_sections);
}

/**
 * Make page `pageId`'s structure room match its database `draft_sections`.
 *
 * @param {Object} config - CLI config (host, app, authToken)
 * @param {number|string} pageId
 * @param {Object} [opts]
 * @param {boolean} [opts.check] - report only, never write
 * @returns {Promise<{status: 'no_room'|'in_sync'|'stale'|'repaired'|'failed',
 *   db_count?: number, room_count?: number, error?: string}>}
 *   `stale` only with `check`. Never throws — a failed sync must not mask the
 *   database write that already succeeded.
 */
export async function syncPageRoom(config, pageId, opts = {}) {
  const itemId = String(pageId);
  let wsUrl;
  try {
    wsUrl = wsUrlFor(config.host);
    const dbStubs = await readDbStubs(config, pageId);

    const first = await joinRoom(wsUrl, itemId);
    if (first.empty) {
      await leave(first.ws, itemId);
      return { status: 'no_room', db_count: dbStubs.length };
    }

    const arr = first.doc.getArray(ARRAY_NAME);
    const roomStubs = arr.toArray();
    if (sameStubs(roomStubs, dbStubs)) {
      await leave(first.ws, itemId);
      return { status: 'in_sync', db_count: dbStubs.length, room_count: roomStubs.length };
    }
    if (opts.check) {
      await leave(first.ws, itemId);
      return { status: 'stale', db_count: dbStubs.length, room_count: roomStubs.length };
    }

    const before = Y.encodeStateVector(first.doc);
    first.doc.transact(() => {
      arr.delete(0, arr.length);
      arr.push(dbStubs);
    });
    const update = Y.encodeStateAsUpdate(first.doc, before);
    first.ws.send(JSON.stringify({
      type: 'yjs-update', itemId, update: Buffer.from(update).toString('base64'),
    }));
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    await leave(first.ws, itemId);

    // Verify from a fresh join — confirms the server applied AND (when we
    // were the last member) persisted it, since an empty room reloads from
    // yjs_states on the next join.
    const check = await joinRoom(wsUrl, itemId);
    const after = check.empty ? [] : check.doc.getArray(ARRAY_NAME).toArray();
    await leave(check.ws, itemId);
    if (!sameStubs(after, dbStubs)) {
      return {
        status: 'failed', db_count: dbStubs.length, room_count: after.length,
        error: 'room still differs from draft_sections after update',
      };
    }
    return { status: 'repaired', db_count: dbStubs.length, room_count: roomStubs.length };
  } catch (err) {
    return { status: 'failed', error: err.message };
  }
}

/**
 * Post-write hook for commands that changed a page's `draft_sections`.
 * Honors `--no-room-sync`; warns on stderr (exit code unchanged) on failure.
 * Returns the status object to include in the command's output, or undefined
 * when skipped.
 */
export async function afterDraftSectionsWrite(config, pageId) {
  if (config.roomSync === false) return undefined;
  const result = await syncPageRoom(config, pageId);
  if (result.status === 'failed') {
    console.error(
      `Warning: page ${pageId} was written, but its live-edit room could not be synced (${result.error}).\n`
      + `  The next section save in a browser may revert this change. Repair with:\n`
      + `  dms page sync-room ${pageId}`
    );
  }
  return result;
}

export default { syncPageRoom, afterDraftSectionsWrite };
