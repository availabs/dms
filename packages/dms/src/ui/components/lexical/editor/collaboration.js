/**
 * DMS Collaborative Editing Provider
 *
 * Bridges Lexical's CollaborationPlugin Provider interface to the DMS sync
 * WebSocket. Ported from research/toy-sync/client/collab/toy-provider.js.
 *
 * Handles:
 * - Joining/leaving rooms (per section item)
 * - Relaying Yjs binary updates as base64 JSON messages
 * - Relaying awareness (cursor/presence) updates
 * - Sync protocol (sync-step1/step2) for bootstrapping
 */

import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';
import { getWS, onWSChange, registerCollabRoom, unregisterCollabRoom, updateCollabPeers } from '../../../../sync/sync-manager.js';

// --- Helpers ---

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

// Generate random identity for awareness (fallback — cursor labels come from
// CollaborationPlugin's username/cursorColor props, which use auth email)
function getUserIdentity() {
  let identity = null;
  try {
    const stored = sessionStorage.getItem('dms-collab-identity');
    if (stored) identity = JSON.parse(stored);
  } catch {}

  if (!identity) {
    const colors = ['#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#d19a66'];
    const names = ['Fox', 'Owl', 'Bear', 'Wolf', 'Hawk', 'Deer', 'Lynx', 'Crow', 'Hare', 'Pike'];
    identity = {
      name: names[Math.floor(Math.random() * names.length)] + ' ' + Math.floor(Math.random() * 100),
      color: colors[Math.floor(Math.random() * colors.length)],
    };
    try {
      sessionStorage.setItem('dms-collab-identity', JSON.stringify(identity));
    } catch {}
  }

  return identity;
}

/**
 * DmsCollabProvider bridges the Lexical CollaborationPlugin's Provider interface
 * to the DMS sync WebSocket.
 */
export class DmsCollabProvider {
  constructor(itemId, ydoc) {
    this.itemId = itemId;
    this.doc = ydoc;
    this.awareness = new Awareness(ydoc);
    this._connected = false;
    this._synced = false;
    this._listeners = new Map();
    this._wsHandler = null;
    this._docUpdateHandler = null;
    this._awarenessUpdateHandler = null;
    this._unsubWSChange = null;
    this._currentWS = null;
    this._syncTimeout = null;

    const identity = getUserIdentity();
    this.awareness.setLocalState({
      name: identity.name,
      color: identity.color,
      focusing: false,
      anchorPos: null,
      focusPos: null,
      awarenessData: {},
    });
  }

  connect() {
    if (this._connected) return;
    this._connected = true;

    // Listen for doc updates to send to server
    this._docUpdateHandler = (update, origin) => {
      if (origin === 'remote') return;
      const ws = getWS();
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'yjs-update',
          itemId: this.itemId,
          update: uint8ToBase64(update),
        }));
      }
    };
    this.doc.on('update', this._docUpdateHandler);

    // Listen for awareness changes to send to server
    this._awarenessUpdateHandler = ({ added, updated, removed }, origin) => {
      if (origin === 'remote') return;
      const changedClients = added.concat(updated).concat(removed);
      if (changedClients.length === 0) return;
      const ws = getWS();
      if (ws && ws.readyState === 1) {
        const encodedUpdate = encodeAwarenessUpdate(this.awareness, changedClients);
        ws.send(JSON.stringify({
          type: 'yjs-awareness',
          itemId: this.itemId,
          update: uint8ToBase64(encodedUpdate),
        }));
      }
    };
    this.awareness.on('update', this._awarenessUpdateHandler);

    // Subscribe to WebSocket messages
    this._wsHandler = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.itemId !== this.itemId) return;

        if (msg.type === 'yjs-sync-step1') {
          const serverSV = base64ToUint8(msg.stateVector);
          const update = Y.encodeStateAsUpdate(this.doc, serverSV);
          const ws = getWS();
          if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify({
              type: 'yjs-sync-response',
              itemId: this.itemId,
              update: uint8ToBase64(update),
            }));
          }
        }

        if (msg.type === 'yjs-sync-step2') {
          const update = base64ToUint8(msg.update);
          Y.applyUpdate(this.doc, update, 'remote');
          if (!this._synced) {
            this._synced = true;
            this._emit('sync', true);
          }
        }

        if (msg.type === 'yjs-update') {
          const update = base64ToUint8(msg.update);
          Y.applyUpdate(this.doc, update, 'remote');
        }

        if (msg.type === 'yjs-awareness') {
          const update = base64ToUint8(msg.update);
          applyAwarenessUpdate(this.awareness, update, 'remote');
        }

        if (msg.type === 'room-peers') {
          updateCollabPeers(this.itemId, msg.count);
        }
      } catch (err) {
        console.error('[DmsCollabProvider] message error:', err);
      }
    };

    // Attach to current WS and any future reconnections
    const attachWS = (websocket) => {
      if (!websocket || websocket.readyState !== 1) return;
      if (this._currentWS === websocket) return;

      if (this._currentWS) {
        this._currentWS.removeEventListener('message', this._wsHandler);
      }
      this._currentWS = websocket;
      websocket.addEventListener('message', this._wsHandler);

      websocket.send(JSON.stringify({
        type: 'join-room',
        itemId: this.itemId,
      }));

      this._emit('status', { status: 'connected' });
      registerCollabRoom(this.itemId);
    };

    this._unsubWSChange = onWSChange((newWs) => {
      if (newWs && newWs.readyState === 1) {
        attachWS(newWs);
      }
    });

    // Sync timeout fallback for new/empty docs
    this._syncTimeout = setTimeout(() => {
      if (!this._synced) {
        this._synced = true;
        this._emit('sync', true);
      }
    }, 1000);
  }

  disconnect() {
    if (!this._connected) return;
    this._connected = false;

    if (this._syncTimeout) {
      clearTimeout(this._syncTimeout);
      this._syncTimeout = null;
    }

    if (this._docUpdateHandler) {
      this.doc.off('update', this._docUpdateHandler);
      this._docUpdateHandler = null;
    }

    if (this._awarenessUpdateHandler) {
      this.awareness.off('update', this._awarenessUpdateHandler);
      this._awarenessUpdateHandler = null;
    }

    if (this._wsHandler && this._currentWS) {
      this._currentWS.removeEventListener('message', this._wsHandler);
      this._wsHandler = null;
    }

    if (this._unsubWSChange) {
      this._unsubWSChange();
      this._unsubWSChange = null;
    }

    const ws = this._currentWS || getWS();
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'leave-room',
        itemId: this.itemId,
      }));
    }
    this._currentWS = null;

    unregisterCollabRoom(this.itemId);
    this._synced = false;
    this._emit('status', { status: 'disconnected' });
  }

  on(type, cb) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(cb);
  }

  off(type, cb) {
    const set = this._listeners.get(type);
    if (set) set.delete(cb);
  }

  _emit(type, ...args) {
    const set = this._listeners.get(type);
    if (set) {
      for (const cb of set) cb(...args);
    }
  }

  destroy() {
    this.disconnect();
    this.awareness.destroy();
  }
}

/**
 * Factory function for CollaborationPlugin's providerFactory prop.
 * @param {string} id - Room/document ID (section item ID)
 * @param {Map<string, Y.Doc>} yjsDocMap - Shared doc map managed by CollaborationPlugin
 * @returns {DmsCollabProvider}
 */
export function createCollabProvider(id, yjsDocMap) {
  let ydoc = yjsDocMap.get(id);
  if (!ydoc) {
    ydoc = new Y.Doc();
    yjsDocMap.set(id, ydoc);
  }

  return new DmsCollabProvider(id, ydoc);
}
