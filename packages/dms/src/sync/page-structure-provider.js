/**
 * Page Structure Collab Provider
 *
 * Binds a page's section list (draft_sections) to a shared Y.Array, relayed
 * over the same per-item collab room infrastructure already used for section
 * rich-text content (see ui/components/lexical/editor/collaboration.js's
 * DmsCollabProvider) — same wire protocol, same server code, zero server
 * changes. The room is keyed by the PAGE's own item id (not a section's).
 *
 * Why this exists: sectionArray.jsx's add/delete/reorder handlers used to
 * compute a new draft_sections array from whatever `value` this component
 * last rendered with, and send the whole array. Two clients editing the same
 * page concurrently would each compute from their own (possibly stale) copy,
 * and whichever write landed last on the server won outright — the other's
 * insert/delete silently vanished, even though the client that made it had
 * already pushed its own section row successfully. See
 * planning/tasks/current/concurrent-page-editing-data-loss.md ("Bug 1") for
 * the full write-up and reproduction.
 *
 * With this provider, every add/delete/reorder is applied as a real Y.Array
 * operation against a doc shared live with every other client that has this
 * page open in edit mode. Y.Array's CRDT semantics merge concurrent
 * insert/delete losslessly and commutatively — nothing to "lose" once ops
 * apply on top of each other instead of one write blindly overwriting
 * another. `sectionArray.jsx` reads the array's current (already-merged)
 * state back before handing it to the existing `apiUpdate` write path, so
 * the eventual `draft_sections` write is always the merged truth, not a
 * stale snapshot — no change needed to the server's write/merge logic at
 * all.
 *
 * Unlike DmsCollabProvider this is NOT a Lexical `Provider` — no awareness,
 * no cursors, no CollaborationPlugin interface. It's a direct Yjs binding:
 * join a room, get a Y.Array, read/mutate it yourself.
 *
 * Scope note: this only protects sync=ON deployments — the room/relay only
 * exists over the sync WebSocket. With sync off, draft_sections writes still
 * go through the old plain-array + server shallow-merge path unprotected.
 */

import * as Y from 'yjs';
import { getWS, onWSChange, registerCollabRoom, unregisterCollabRoom } from './sync-manager.js';

function uint8ToBase64(uint8) {
  let binary = '';
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

function base64ToUint8(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Ref-counted per pageItemId — a page with multiple section groups (default/
// sidebar/header) mounts one sectionArray.jsx per group, all wanting the same
// page's structure room. Sharing one Y.Doc/connection per page (rather than
// one per mounted group) keeps every group's view of the same array
// consistent within a single tab, not just eventually-consistent via the
// server relay.
const rooms = new Map(); // pageItemId -> { doc, sectionsArray, refCount, synced, readyPromise, resolveReady, ... }

function connect(pageItemId) {
  const doc = new Y.Doc();
  const sectionsArray = doc.getArray('draft_sections');
  let synced = false;
  let resolveReady;
  const readyPromise = new Promise((resolve) => { resolveReady = resolve; });
  // Fallback so a brand-new/never-persisted room doesn't hang callers forever
  // waiting on a sync-step2 that will never come (nothing to sync yet) —
  // mirrors DmsCollabProvider's identical 1000ms fallback.
  const syncTimeout = setTimeout(() => {
    if (!synced) { synced = true; resolveReady(); }
  }, 1000);

  const room = { doc, sectionsArray, refCount: 0, synced, readyPromise, resolveReady, syncTimeout, lastRemoteAt: 0 };

  const docUpdateHandler = (update, origin) => {
    if (origin === 'remote') return;
    const ws = getWS();
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'yjs-update', itemId: pageItemId, update: uint8ToBase64(update) }));
    }
  };
  doc.on('update', docUpdateHandler);

  const wsHandler = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.itemId !== pageItemId) return;

      if (msg.type === 'yjs-sync-step1') {
        const serverSV = base64ToUint8(msg.stateVector);
        const update = Y.encodeStateAsUpdate(doc, serverSV);
        const ws = getWS();
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'yjs-sync-response', itemId: pageItemId, update: uint8ToBase64(update) }));
        }
      }

      if (msg.type === 'yjs-sync-step2') {
        Y.applyUpdate(doc, base64ToUint8(msg.update), 'remote');
        if (!room.synced) { room.synced = true; clearTimeout(room.syncTimeout); room.resolveReady(); }
      }

      if (msg.type === 'yjs-update') {
        Y.applyUpdate(doc, base64ToUint8(msg.update), 'remote');
        room.lastRemoteAt = Date.now();
      }
    } catch (err) {
      console.error('[page-structure-provider] message error:', err);
    }
  };

  let currentWS = null;
  const attachWS = (websocket) => {
    if (!websocket || websocket.readyState !== 1 || currentWS === websocket) return;
    if (currentWS) currentWS.removeEventListener('message', wsHandler);
    currentWS = websocket;
    websocket.addEventListener('message', wsHandler);
    websocket.send(JSON.stringify({ type: 'join-room', itemId: pageItemId }));
    registerCollabRoom(pageItemId);
  };
  const unsubWSChange = onWSChange((ws) => { if (ws && ws.readyState === 1) attachWS(ws); });

  room.lastRemoteAt = Date.now(); // treat "just connected" as activity so a
  // settle() called immediately after join doesn't fire on an empty history

  room._teardown = () => {
    doc.off('update', docUpdateHandler);
    if (currentWS) currentWS.removeEventListener('message', wsHandler);
    unsubWSChange();
    clearTimeout(room.syncTimeout);
    const ws = currentWS || getWS();
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'leave-room', itemId: pageItemId }));
    }
    unregisterCollabRoom(pageItemId);
    doc.destroy();
  };

  return room;
}

// Resolves once no remote update has arrived for `quietMs`, or `maxWaitMs`
// total has elapsed, whichever comes first. Needed because applying your own
// op and immediately reading `.toArray()` back only sees YOUR op — two
// clients whose inserts are only milliseconds apart (well within realistic
// concurrent-editing timing, and certainly within an automated test) would
// each read back an array missing the other's still-in-flight insert, and
// send that incomplete snapshot to the server, silently recreating the
// exact lost-update bug this whole provider exists to prevent. Waiting for
// quiet lets near-simultaneous peer ops relay in first, so the eventual
// `.toArray()` read reflects everyone's ops, not just your own. No-ops
// (resolves immediately) when nobody else is concurrently editing, since
// `lastRemoteAt` won't have moved recently.
function waitForQuiet(room, quietMs = 300, maxWaitMs = 1500) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const elapsed = Date.now() - start;
      const sinceLastRemote = Date.now() - room.lastRemoteAt;
      if (elapsed >= maxWaitMs || sinceLastRemote >= quietMs) {
        resolve();
        return;
      }
      setTimeout(check, Math.max(0, Math.min(quietMs - sinceLastRemote, maxWaitMs - elapsed)));
    };
    check();
  });
}

/**
 * Join (or reuse) the page-structure room for `pageItemId`. Ref-counted —
 * safe to call once per mounted sectionArray.jsx instance for the same page.
 *
 * @param {string|number} pageItemId
 * @param {Array} seedSections - the page's currently-known draft_sections,
 *   used to seed the shared array ONLY if it's still empty after this join's
 *   first sync (i.e. nobody has ever written to this room before). Known
 *   edge case: two clients joining a cold room at the exact same instant can
 *   both see "empty" and both seed, producing duplicate entries — narrow
 *   (first-ever join after a server restart / yjs_states eviction, near-
 *   simultaneous), not solved here; would need server-side seed coordination
 *   to close entirely.
 * @returns {{ sectionsArray: Y.Array, doc: Y.Doc, ready: Promise<void>, settle: (quietMs?, maxWaitMs?) => Promise<void>, disconnect: () => void }}
 *   `doc` is exposed so callers can wrap multi-step mutations in
 *   `doc.transact(() => { ... })` — a single Yjs-level transaction, so e.g.
 *   a "move" (delete+insert) or "replace" (delete+insert) lands as one
 *   atomic op instead of two separately-observable ones. `settle()` should
 *   be awaited after applying your own op and before reading
 *   `sectionsArray` back to send to the server — see waitForQuiet's comment.
 */
export function joinPageStructureRoom(pageItemId, seedSections) {
  const key = String(pageItemId);
  let room = rooms.get(key);
  if (!room) {
    room = connect(key);
    rooms.set(key, room);
  }
  room.refCount += 1;

  room.readyPromise.then(() => {
    if (room.sectionsArray.length === 0 && Array.isArray(seedSections) && seedSections.length > 0) {
      room.doc.transact(() => {
        if (room.sectionsArray.length === 0) { // re-check inside transact: still racy across clients, not across this doc's own ticks
          // seedSections is the page's already-*resolved* draft_sections (ref +
          // the child's own content merged in for rendering, by
          // api/index.js's loadFromLocalDB). The shared array must only ever
          // hold minimal {id, ref} stubs — same reasoning as save()'s comment
          // in sectionArray.jsx: any peer that reads this array and re-sends
          // it must not risk re-triggering a create/update for content that
          // isn't theirs. Strip back down to the stub shape before seeding.
          const stubs = seedSections.map(s => ({ id: s?.id, ref: s?.ref })).filter(s => s.id != null);
          room.sectionsArray.push(stubs);
        }
      });
    }
  });

  let disconnected = false;
  return {
    sectionsArray: room.sectionsArray,
    ready: room.readyPromise,
    doc: room.doc,
    // Call after applying your own op, before reading `.sectionsArray` back
    // to send — see waitForQuiet's comment for why this matters.
    settle: (quietMs, maxWaitMs) => waitForQuiet(room, quietMs, maxWaitMs),
    disconnect() {
      if (disconnected) return;
      disconnected = true;
      room.refCount -= 1;
      if (room.refCount <= 0) {
        rooms.delete(key);
        room._teardown();
      }
    },
  };
}
