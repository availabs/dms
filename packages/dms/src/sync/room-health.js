/**
 * Page-structure room health.
 *
 * A page's structure room (page-structure-provider.js) only reads the database
 * while it is still never-written; after that the room wins, and the next
 * section save in a sync-on tab sends the room's array as `draft_sections`.
 * Any write that bypasses the room — the CLI before its room-sync fix, Discard,
 * the section-groups/settings panes, templates, and every save from a SYNC-OFF
 * build of the same site — leaves the room stale, and nothing ever corrects it
 * on its own. So a sync-on save can silently revert work saved elsewhere
 * (concurrent-page-editing-data-loss.md, Bug 20; live on mitigat-ny-prod,
 * whose site is served by one sync-on and one sync-off domain).
 *
 * This module compares the page room this tab has open against the page's
 * CURRENT saved row, read fresh from the server by the caller-supplied
 * `fetchSaved(pageId)` (userMenu passes api/index.js's `loadItemFresh`, which
 * bypasses both the Falcor cache and this tab's local IndexedDB mirror — the
 * mirror can lag the server, so it can't be the reference). It publishes a
 * small status the user menu renders (red ring when stale), and offers a
 * repair that replaces the room's array with the saved one.
 *
 * False-alarm guards — a room is legitimately ahead of the database for a
 * moment after every structural op (the op lands in the room first, the
 * `draft_sections` write follows): only report `stale` when the difference
 * survives a second check CONFIRM_MS later, this tab has no pending sync
 * pushes, and neither this tab nor a peer touched the room in the last
 * QUIET_MS. Otherwise report `busy` and let the next trigger re-check.
 */

import { getStructureRooms, onStructureRoomsChange, replaceStructureRoomContents } from './page-structure-provider.js';
import { getPendingCount, revalidateNow } from './sync-manager.js';

const CONFIRM_MS = 2000;
const QUIET_MS = 3000;
// A peer op within this window means someone else is editing the page right
// now — a repair would drop their not-yet-saved op, so the UI asks to confirm.
const PEER_ACTIVE_MS = 10000;
// A `busy` result (room recently touched / pushes pending) is re-checked
// automatically, up to this many times, BUSY_RETRY_MS apart.
const BUSY_RETRIES = 5;
const BUSY_RETRY_MS = 4000;

let state = { status: 'idle' };
let checking = null;
let retryTimer = null;
let busyRetries = 0;
const listeners = new Set();

function setState(next) {
  state = next;
  for (const fn of listeners) {
    try { fn(state); } catch (err) { console.error('[room-health] listener error:', err); }
  }
}

export function getRoomHealth() { return state; }

// Leaving edit mode (or the page) closes its room — drop that page's result so
// e.g. a red "stale" ring doesn't linger on view pages.
onStructureRoomsChange(() => {
  if (state.pageId == null) return;
  if (!getStructureRooms().some((r) => r.pageId === state.pageId)) {
    clearTimeout(retryTimer);
    setState({ status: 'idle' });
  }
});

export function onRoomHealthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * The page room this tab has open, if any — the most recently joined ready
 * one (a page editor mounts one per page; its section groups share it).
 */
export function currentPageRoom() {
  const ready = getStructureRooms().filter((r) => r.ready);
  return ready[ready.length - 1] || null;
}

/** Subscribe to room open/ready/close, e.g. to auto-check on edit-mode entry. */
export function onPageRoomChange(fn) {
  return onStructureRoomsChange(fn);
}

function toStubs(draftSections) {
  return (Array.isArray(draftSections) ? draftSections : [])
    .map((s) => (s && typeof s === 'object' ? { id: s.id, ref: s.ref } : { id: s }))
    .filter((s) => s.id != null)
    .map((s) => ({ id: String(s.id), ref: s.ref ?? null }));
}

function sameStubs(a, b) {
  return a.length === b.length
    && a.every((s, i) => String(s?.id) === String(b[i]?.id) && (s?.ref ?? null) === (b[i]?.ref ?? null));
}

function compare(room, saved) {
  const roomStubs = toStubs(room.stubs);
  const savedIds = new Set(saved.map((s) => s.id));
  return {
    match: sameStubs(roomStubs, saved),
    savedCount: saved.length,
    roomCount: roomStubs.length,
    common: roomStubs.filter((s) => savedIds.has(s.id)).length,
  };
}

async function readSaved(fetchSaved, pageId) {
  const row = await fetchSaved(pageId);
  if (!row) throw new Error(`page ${pageId} not found on the server`);
  return toStubs(row.data?.draft_sections);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Check the open page room against the saved row. Resolves to the new state.
 * Concurrent calls share one in-flight check.
 */
export function checkRoomHealth(fetchSaved, { retry = false } = {}) {
  if (checking) return checking;
  clearTimeout(retryTimer);
  if (!retry) busyRetries = 0;
  checking = (async () => {
    const room = currentPageRoom();
    if (!room) { setState({ status: 'idle' }); return state; }
    const { pageId } = room;
    setState({ ...state, status: 'checking', pageId });
    try {
      let result = compare(room, await readSaved(fetchSaved, pageId));
      if (!result.match) {
        await sleep(CONFIRM_MS);
        const again = getStructureRooms().find((r) => r.pageId === pageId && r.ready);
        if (!again) { setState({ status: 'idle' }); return state; }
        result = compare(again, await readSaved(fetchSaved, pageId));
        const quiet = Date.now() - Math.max(again.lastLocalAt, again.lastRemoteOpAt) > QUIET_MS;
        if (!result.match && (!quiet || (await getPendingCount()) > 0)) {
          setState({ status: 'busy', pageId, ...result, checkedAt: Date.now() });
          if (busyRetries < BUSY_RETRIES) {
            busyRetries += 1;
            retryTimer = setTimeout(() => checkRoomHealth(fetchSaved, { retry: true }), BUSY_RETRY_MS);
          }
          return state;
        }
      }
      const latest = getStructureRooms().find((r) => r.pageId === pageId) || room;
      setState({
        status: result.match ? 'ok' : 'stale', pageId, ...result, checkedAt: Date.now(),
        peerActive: Date.now() - latest.lastRemoteOpAt < PEER_ACTIVE_MS,
      });
    } catch (err) {
      setState({ status: 'error', pageId, error: err.message, checkedAt: Date.now() });
    }
    return state;
  })().finally(() => { checking = null; });
  return checking;
}

/**
 * Replace the open page room's array with the page's saved `draft_sections`
 * (re-read fresh right now, not the value from the last check), then force a
 * delta re-check so this tab's own view catches up with the saved content too.
 */
export async function repairRoom(fetchSaved) {
  // A check still in flight (or a scheduled busy-retry) could otherwise land
  // its PRE-repair result after the repair and flip the state back to stale.
  clearTimeout(retryTimer);
  if (checking) await checking;
  const room = currentPageRoom();
  if (!room) return getRoomHealth();
  setState({ ...state, status: 'repairing', pageId: room.pageId });
  try {
    const saved = await readSaved(fetchSaved, room.pageId);
    if (!replaceStructureRoomContents(room.pageId, saved)) throw new Error('page room is not open');
    await revalidateNow();
  } catch (err) {
    setState({ status: 'error', pageId: room.pageId, error: err.message, checkedAt: Date.now() });
    return state;
  }
  return checkRoomHealth(fetchSaved);
}

export default { getRoomHealth, onRoomHealthChange, currentPageRoom, onPageRoomChange, checkRoomHealth, repairRoom };
