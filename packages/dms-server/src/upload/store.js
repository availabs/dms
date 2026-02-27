/**
 * In-memory upload state store.
 * Tracks upload status and analysis results keyed by upload ID.
 *
 * Statuses: 'processing' | 'ready' | 'error'
 */

const uploads = new Map();
let contextCounter = 1000;

function nextContextId() {
  return contextCounter++;
}

function generateUploadId() {
  const uuid = require('crypto').randomUUID();
  return `dms_${uuid}`;
}

function create(id) {
  const entry = { id, status: 'processing', layers: [], error: null, createdAt: Date.now() };
  uploads.set(id, entry);
  return entry;
}

function get(id) {
  return uploads.get(id) || null;
}

function setReady(id, layers, dataFilePath, fileExt) {
  const entry = uploads.get(id);
  if (!entry) return;
  entry.status = 'ready';
  entry.layers = layers;
  entry.dataFilePath = dataFilePath;
  entry.fileExt = fileExt;
}

function setError(id, message) {
  const entry = uploads.get(id);
  if (!entry) return;
  entry.status = 'error';
  entry.error = message;
}

module.exports = { nextContextId, generateUploadId, create, get, setReady, setError };
