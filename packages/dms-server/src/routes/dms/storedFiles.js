/**
 * Files a DMS row owns in file storage (`dama/storage`): today, the file an internal-source view
 * was uploaded with (`data.file.dl_url`, written by dama/upload/file-upload-dms-route.js). When the
 * row is deleted its file goes too; before 2026-11 it stayed downloadable at its `dl_url`
 * (safe-delete-removes-rows.md, F7).
 *
 * Read from the row's data, never from a naming convention: an upload may name its own `directory`.
 */

const path = require('path');

/** The stored file's path relative to the storage root, or null when the url isn't ours. */
function storedFilePath(dlUrl, storage) {
  if (typeof dlUrl !== 'string' || !dlUrl) return null;
  const base = storage.getUrl('');
  if (!base || !dlUrl.startsWith(base)) return null;
  let rel;
  try { rel = decodeURIComponent(dlUrl.slice(base.length).split(/[?#]/)[0]); } catch { return null; }
  const norm = path.posix.normalize(rel);
  // `remove` is recursive: only ever a file path below the root, never the root or a parent.
  if (!norm || norm === '.' || norm.endsWith('/') || path.posix.isAbsolute(norm)
    || norm === '..' || norm.startsWith('../')) return null;
  return norm;
}

/** The dl_url a row's data names as its own stored file, if any. */
function ownedFileUrl(data) {
  const d = typeof data === 'string' ? (() => { try { return JSON.parse(data); } catch { return null; } })() : data;
  const url = d && d.file && d.file.dl_url;
  return typeof url === 'string' && url ? url : null;
}

/** Lazily: requiring the storage module creates the local data dir. */
function getStorage() {
  return require('../../dama/storage');
}

/** Remove one stored file. Logs and swallows: the rows are already gone, a stray file is not fatal. */
async function removeStoredFile(dlUrl, label = '') {
  let storage;
  try { storage = getStorage(); } catch (e) {
    console.warn(`[stored-files] storage unavailable, kept ${dlUrl}: ${e.message}`);
    return false;
  }
  const rel = storedFilePath(dlUrl, storage);
  if (!rel) {
    console.warn(`[stored-files] ${label} file url is not in this server's storage, kept: ${dlUrl}`);
    return false;
  }
  try {
    await storage.remove(rel);
    console.log(`[stored-files] removed ${rel}${label ? ` (${label})` : ''}`);
    return true;
  } catch (e) {
    console.warn(`[stored-files] failed to remove ${rel}: ${e.message}`);
    return false;
  }
}

module.exports = { storedFilePath, ownedFileUrl, removeStoredFile, getStorage };
