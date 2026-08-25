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
const rooms = new Map(); // pageItemId -> { doc, sectionsArray, refCount, readyPromise, knownEmpty, ... }

function connect(pageItemId) {
  const doc = new Y.Doc();
  const sectionsArray = doc.getArray('draft_sections');
  let resolveReady;
  let readySettled = false;
  const readyPromise = new Promise((resolve) => { resolveReady = resolve; });
  function markReady() {
    if (readySettled) return;
    readySettled = true;
    clearTimeout(room.step1Timeout);
    clearTimeout(room.step2Timeout);
    resolveReady();
  }
  // Fail-safe for step1 itself never arriving. NOT a short/"expected fast
  // path" timeout — found live (2026-08-24) that step1 can be delayed just
  // as much as step2 under real contention (e.g. a competing pattern
  // bootstrap sharing the same WebSocket's message queue): step1 being tiny
  // only means its OWN payload is small, not that it skips the same queue
  // step2 sits behind. An earlier version of this used 1000ms here on the
  // assumption step1 is always near-instant, which reintroduced exactly the
  // bug this file exists to fix, one layer up — `ready` resolving before
  // step1 ever arrived left `knownEmpty` at `null` (correctly blocking the
  // seed, since the seed strictly requires `knownEmpty === true`) but a
  // MUTATION (save/remove/moveItem) still proceeded on the unconfirmed doc,
  // so a page with real content could still get its `sectionsArray.toArray()`
  // read back empty and overwrite draft_sections with just the new op. This
  // long a timeout should essentially never fire under real conditions
  // (step1 is the very first thing the server sends on join); if it does,
  // `ready` resolves with the doc unconfirmed, same residual risk this
  // provider always had for a genuine total connection failure.
  const step1Timeout = setTimeout(markReady, 5000);

  // `knownEmpty` — null until step1 arrives, then true/false based on its
  // decoded state vector. Read by joinPageStructureRoom to decide whether
  // seeding is safe — see the seed call site's doc comment for the bug this
  // exists to fix (found live 2026-08-24, resurrecting a concurrently-
  // deleted section — concurrent-page-editing-data-loss.md "Bug 12").
  const room = {
    doc, sectionsArray, refCount: 0, readyPromise, lastRemoteAt: 0,
    knownEmpty: null, step1Timeout, step2Timeout: null,
  };

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
        if (room.knownEmpty === null) {
          clearTimeout(room.step1Timeout);
          room.knownEmpty = Y.decodeStateVector(serverSV).size === 0;
          if (room.knownEmpty) {
            // Nothing to wait for — no client has ever written to this
            // room, so there's no step2 coming and it's already safe to
            // seed/mutate.
            markReady();
          } else {
            // Real content confirmed to exist — `ready` must wait for the
            // ACTUAL step2 payload, not a blind guess. The old design
            // resolved `ready` (and, worse, let seeding proceed) off a
            // flat 1s timeout regardless of what step1 said, which caused
            // two distinct live bugs under real load (e.g. a competing
            // pattern bootstrap sharing the same WebSocket's message
            // queue and delaying step2 past 1s): (1) seeding this tab's
            // own stale draft_sections into a room that actually already
            // had different, correct content — reintroducing a section
            // another client had just deleted, or duplicating entries
            // once the real content later merged in; (2) a mutation
            // (save/remove/moveItem) proceeding against a doc it
            // incorrectly believed was empty, so its own
            // `sectionsArray.toArray()` read — and thus the resulting
            // draft_sections WRITE — silently dropped every other
            // section that hadn't synced in yet. The server always sends
            // step2 immediately after step1 whenever content exists, so
            // this should resolve almost instantly in practice; the
            // longer timeout below is a fail-safe for a genuine
            // transport failure (step2 specifically lost), not ordinary
            // latency.
            room.step2Timeout = setTimeout(markReady, 5000);
          }
        }
      }

      if (msg.type === 'yjs-sync-step2') {
        Y.applyUpdate(doc, base64ToUint8(msg.update), 'remote');
        markReady();
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
    clearTimeout(room.step1Timeout);
    clearTimeout(room.step2Timeout);
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
 *   used to seed the shared array ONLY once `ready` resolves AND
 *   `room.knownEmpty === true` — i.e. the server's `yjs-sync-step1` state
 *   vector confirmed no client has ever written to this room, not a timeout
 *   guess. A timeout-based decision was tried first and found live to be
 *   wrong in TWO ways (both reproduced 2026-08-24 under a real, forced
 *   network delay — see "Bug 12" in concurrent-page-editing-data-loss.md):
 *   (1) seeding could fire from a blind 1s fallback before a real, non-empty
 *   `yjs-sync-step2` had simply arrived late (e.g. a competing pattern
 *   bootstrap sharing the same WebSocket's message queue) — reintroducing a
 *   section another client had JUST deleted (Yjs has no way to recognize a
 *   seed-insert as "the same logical item, already deleted elsewhere" — it's
 *   just a fresh insert op) or duplicating entries once the real content
 *   later merged in; (2) even after gating seeding correctly, a mutation
 *   (save/remove/moveItem) proceeding on the SAME blind 1s `ready` signal
 *   could run before the real content arrived, and its own
 *   `sectionsArray.toArray()` read — sent straight to the server — would
 *   then silently DROP every section that hadn't synced in yet. Both are
 *   fixed together by making `ready` itself wait for the real step2
 *   whenever step1 confirms content exists (see `connect()`'s
 *   `markReady`/`knownEmpty`), rather than treating "don't hang forever" and
 *   "safe to trust this doc's current state" as the same signal. The server
 *   always sends step1 synchronously on join (a tiny payload, unlike step2
 *   which it only sends when the room has content — ws.js's
 *   `update.length > 2` guard), so its state vector is a fast, reliable,
 *   definitive signal instead of a guess. Known remaining edge case: two
 *   clients joining a cold room at the exact same instant can both see
 *   "empty" and both seed, producing duplicate entries — narrow (first-ever
 *   join after a server restart / yjs_states eviction, near-simultaneous),
 *   not solved here; would need server-side seed coordination to close
 *   entirely.
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
    if (room.knownEmpty === true && room.sectionsArray.length === 0 && Array.isArray(seedSections) && seedSections.length > 0) {
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
