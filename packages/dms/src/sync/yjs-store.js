/**
 * Per-item Yjs Document Store
 *
 * Manages Y.Doc instances for field-level merge (YMap).
 * Direct port from research/toy-sync/client/yjs-store.js.
 */

import * as Y from 'yjs';

const docs = new Map();

export function getDoc(id) {
  if (docs.has(id)) return docs.get(id);
  const ydoc = new Y.Doc();
  docs.set(id, ydoc);
  return ydoc;
}

export function applyLocal(id, newData) {
  const ydoc = getDoc(id);
  const ymap = ydoc.getMap('data');

  ydoc.transact(() => {
    for (const [key, value] of Object.entries(newData)) {
      ymap.set(key, value);
    }
  });

  return materialize(ymap);
}

export function applyRemote(id, remoteData) {
  const ydoc = getDoc(id);
  const ymap = ydoc.getMap('data');

  ydoc.transact(() => {
    for (const [key, value] of Object.entries(remoteData)) {
      if (ymap.get(key) !== value) {
        ymap.set(key, value);
      }
    }
    for (const key of ymap.keys()) {
      if (!(key in remoteData)) {
        ymap.delete(key);
      }
    }
  });

  return materialize(ymap);
}

export function initFromData(id, data) {
  const ydoc = getDoc(id);
  const ymap = ydoc.getMap('data');

  if (ymap.size === 0 && Object.keys(data).length > 0) {
    ydoc.transact(() => {
      for (const [key, value] of Object.entries(data)) {
        ymap.set(key, value);
      }
    });
  }

  return materialize(ymap);
}

export function getData(id) {
  if (!docs.has(id)) return null;
  const ydoc = docs.get(id);
  const ymap = ydoc.getMap('data');
  return materialize(ymap);
}

export function destroyDoc(id) {
  const ydoc = docs.get(id);
  if (ydoc) {
    ydoc.destroy();
    docs.delete(id);
  }
}

function materialize(ymap) {
  const obj = {};
  ymap.forEach((value, key) => {
    obj[key] = value;
  });
  return obj;
}
