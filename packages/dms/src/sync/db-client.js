/**
 * SQL Proxy via postMessage
 *
 * Communicates with the SQLite Web Worker.
 * Direct port from research/toy-sync/client/db-client.js.
 */

let worker = null;
let msgId = 0;
const pending = new Map();
let readyPromise = null;

export function initDB() {
  if (readyPromise) return readyPromise;

  readyPromise = new Promise((resolve, reject) => {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

    worker.onmessage = (e) => {
      const { id, type, rows, columns, error } = e.data;

      if (type === 'ready') {
        const p = pending.get(id);
        if (p) { p.resolve(); pending.delete(id); }
        return;
      }

      if (type === 'result') {
        const p = pending.get(id);
        if (p) { p.resolve({ rows, columns }); pending.delete(id); }
        return;
      }

      if (type === 'error') {
        const p = pending.get(id);
        if (p) { p.reject(new Error(error)); pending.delete(id); }
        return;
      }
    };

    worker.onerror = (err) => {
      console.error('[db-client] worker error:', err);
      reject(err);
    };

    const id = ++msgId;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type: 'init' });
  });

  return readyPromise;
}

export async function exec(sql, params = []) {
  await readyPromise;
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type: 'exec', sql, params });
  });
}

export async function execMany(statements) {
  const results = [];
  for (const { sql, params } of statements) {
    results.push(await exec(sql, params || []));
  }
  return results;
}
