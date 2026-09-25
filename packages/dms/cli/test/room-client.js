/**
 * Minimal stand-in for a browser's page-structure room connection
 * (packages/dms/src/sync/page-structure-provider.js), for tests: join a
 * page's room over the sync WebSocket, read its Y.Array('draft_sections'),
 * and seed it the way a browser does on first edit.
 */

import WebSocket from 'ws';
import * as Y from 'yjs';

function wsUrlFor(host) {
  const url = new URL('/sync/subscribe', host);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Join `itemId`'s room. Resolves once its state is known:
 * `{ doc, array, empty, push(stubs), replace(stubs), leave() }`.
 * Stays connected (a live room member) until `leave()`.
 */
export function joinRoom(host, itemId) {
  itemId = String(itemId);
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrlFor(host));
    const doc = new Y.Doc();
    const array = doc.getArray('draft_sections');
    let ready = false;

    doc.on('update', (update, origin) => {
      if (origin === 'remote') return;
      ws.send(JSON.stringify({ type: 'yjs-update', itemId, update: Buffer.from(update).toString('base64') }));
    });

    const handle = {
      doc, array, empty: null,
      ids: () => array.toArray().map((s) => String(s.id)),
      // Mirrors trySeed: only called by tests on a never-written room.
      push: async (stubs) => { doc.transact(() => array.push(stubs)); await sleep(500); },
      replace: async (stubs) => {
        doc.transact(() => { array.delete(0, array.length); array.push(stubs); });
        await sleep(500);
      },
      leave: async () => {
        ws.send(JSON.stringify({ type: 'leave-room', itemId }));
        ws.close();
        // Server persists on last leave; give it a moment before the next join.
        await sleep(300);
      },
    };

    const timer = setTimeout(() => reject(new Error(`room ${itemId}: no sync state`)), 5000);
    ws.on('error', reject);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join-room', itemId })));
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.itemId !== itemId) return;
      if (msg.type === 'yjs-sync-step1' && !ready) {
        const sv = Y.decodeStateVector(Buffer.from(msg.stateVector, 'base64'));
        if (sv.size === 0) {
          ready = true; handle.empty = true; clearTimeout(timer); resolve(handle);
        }
      } else if (msg.type === 'yjs-sync-step2' && !ready) {
        Y.applyUpdate(doc, Buffer.from(msg.update, 'base64'), 'remote');
        ready = true; handle.empty = false; clearTimeout(timer); resolve(handle);
      } else if (msg.type === 'yjs-update') {
        Y.applyUpdate(doc, Buffer.from(msg.update, 'base64'), 'remote');
      }
    });
  });
}

/** Join, read, leave. Resolves `{ empty, ids }`. */
export async function peekRoom(host, itemId) {
  const room = await joinRoom(host, itemId);
  const result = { empty: room.empty, ids: room.ids() };
  await room.leave();
  return result;
}

/** A "browser" that opened the page, seeded the room, and closed the tab. */
export async function seedRoom(host, itemId, stubs) {
  const room = await joinRoom(host, itemId);
  if (!room.empty) throw new Error(`room ${itemId} already has content`);
  await room.push(stubs);
  await room.leave();
}

export default { joinRoom, peekRoom, seedRoom };
