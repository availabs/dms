/**
 * Download creation and deletion routes.
 * Export GIS view data to CSV/Shapefile/GeoJSON/GPKG via ogr2ogr.
 */

const { gdalAvailable } = require('./gdal');
const { queueTask } = require('../tasks');
const { getDb } = require('../../db');
const storage = require('../storage');
const path = require('path');
const { authorizeViewAction, MANAGE_DOWNLOADS_PERMS } = require('./auth');
const { requestUserIdWarnBody, isUserAuthedForSource, requestPatternRef, sourceIdForView } = require('../../routes/uda/sourceAuth');
const { signToken, verifyToken } = require('../../auth/utils/crypto');

// A signed download link is good for this long. It only has to outlive the click that asked for it.
const DOWNLOAD_LINK_TTL = '5m';

function downloadGuard(req, res, next) {
  if (!gdalAvailable) {
    return res.status(501).json({ error: 'Download creation requires GDAL (ogr2ogr).' });
  }
  next();
}

/**
 * POST /dama-admin/:pgEnv/gis-dataset/create-download
 * Queue a download creation task. Needs `manage-downloads` on the view's source; the task's user is the
 * token user, whatever the body says.
 */
async function createDownload(req, res) {
  const { pgEnv } = req.params;
  const { view_id, fileTypes, columns, groupedByColumn } = req.body;

  if (!req.body.source_id || !view_id) {
    return res.status(400).json({ error: 'source_id and view_id are required' });
  }
  if (!fileTypes || !fileTypes.length) {
    return res.status(400).json({ error: 'fileTypes array is required' });
  }
  if (!columns || !columns.length) {
    return res.status(400).json({ error: 'columns array is required' });
  }

  const auth = await authorizeViewAction(req, res, view_id, MANAGE_DOWNLOADS_PERMS, req.body.source_id);
  if (!auth) return;
  const source_id = auth.sourceId;
  const user_id = requestUserIdWarnBody(req);
  const email = auth.user.email;

  try {
    const taskId = await queueTask({
      workerPath: 'gis/create-download',
      sourceId: source_id,
      pgEnv,
      source_id,
      view_id,
      user_id,
      email,
      fileTypes,
      columns,
      groupedByColumn: groupedByColumn || null,
    }, pgEnv);

    res.json({ etl_context_id: taskId, source_id });
  } catch (err) {
    console.error('[download] create-download queue failed:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/**
 * DELETE /dama-admin/:pgEnv/gis-dataset/delete-download
 * Delete download files and clear view metadata. Needs `manage-downloads` on the view's source.
 */
async function deleteDownload(req, res) {
  const { pgEnv } = req.params;
  const { view_id } = req.body;

  if (!view_id) {
    return res.status(400).json({ error: 'view_id is required' });
  }
  if (!(await authorizeViewAction(req, res, view_id, MANAGE_DOWNLOADS_PERMS, req.body.source_id))) return;

  try {
    // The files the view's download map names (create-download writes `<pgEnv>/s_<source>/…`, shared by
    // every view of the source, so file by file), plus the old DAMA folder `<pgEnv>_<view>`.
    const downloads = await readViewDownloads(pgEnv, view_id);
    for (const url of Object.values(downloads || {})) {
      const key = storageKeyFor(url);
      if (key) await storage.remove(key);
    }
    await storage.remove(`${pgEnv}_${view_id}`);

    // Clear download metadata from view
    const db = getDb(pgEnv);
    const viewTable = db.type === 'postgres' ? 'data_manager.views' : 'views';

    if (db.type === 'postgres') {
      await db.query(
        `UPDATE ${viewTable} SET metadata = metadata - 'download' WHERE view_id = $1`,
        [view_id]
      );
    } else {
      // SQLite: read, parse, delete key, write back
      const { rows } = await db.query(
        `SELECT metadata FROM ${viewTable} WHERE view_id = $1`,
        [view_id]
      );
      if (rows[0]?.metadata) {
        const meta = typeof rows[0].metadata === 'string'
          ? JSON.parse(rows[0].metadata)
          : rows[0].metadata;
        delete meta.download;
        await db.query(
          `UPDATE ${viewTable} SET metadata = $1 WHERE view_id = $2`,
          [meta, view_id]
        );
      }
    }

    res.json({ message: 'success' });
  } catch (err) {
    console.error('[download] delete-download failed:', err.message);
    res.status(500).json({ error: err.message });
  }
}

// The view's `metadata.download` map ({ [fileType]: url }), or null.
async function readViewDownloads(pgEnv, viewId) {
  const db = getDb(pgEnv);
  const { rows } = await db.query(
    `SELECT metadata FROM ${db.type === 'postgres' ? 'data_manager.views' : 'views'} WHERE view_id = $1`,
    [+viewId]
  );
  const meta = rows[0] && (typeof rows[0].metadata === 'string' ? JSON.parse(rows[0].metadata) : rows[0].metadata);
  return meta && meta.download && typeof meta.download === 'object' ? meta.download : null;
}

// The storage key behind a stored download url: `/files/<key>` (local; old DAMA links carry a `$HOST`
// prefix) or the S3 bucket url + key. Null for a url this server's storage doesn't hold.
function storageKeyFor(url) {
  const s = String(url || '');
  let key = null;
  const local = s.match(/^(?:\$HOST)?\/files\/(.+)$/);
  if (local) key = local[1];
  else if (storage.type !== 'local' && s.startsWith(storage.getUrl(''))) key = s.slice(storage.getUrl('').length);
  if (!key) return null;
  try { key = decodeURI(key); } catch { /* stored unencoded, as the workers write it */ }
  return key.split('/').some(seg => seg === '..' || seg === '') ? null : key;
}

/**
 * POST /dama-admin/:pgEnv/downloads/sign  { view_id, file_type }
 * Needs `download-source` on the view's source (anonymous callers count as `public`). Returns
 * `{ url }`: a link to GET /dama-admin/:pgEnv/downloads/file that works for DOWNLOAD_LINK_TTL, for
 * this one file. A plain link can't carry an Authorization header, so the check happens here and
 * the link carries the outcome. Downloads were public before: `legacy` / `log` allow and log.
 */
async function signDownload(req, res) {
  const { pgEnv } = req.params;
  const { view_id, file_type } = req.body || {};
  if (!view_id || !file_type) return res.status(400).json({ error: 'view_id and file_type are required' });
  if (pgEnv.includes('+')) return res.status(400).json({ error: 'signed downloads are for external (pgEnv) views' });

  try {
    const downloads = await readViewDownloads(pgEnv, view_id);
    if (!downloads || !downloads[file_type]) return res.status(404).json({ error: `view ${view_id} has no ${file_type} download` });

    const user = (req.availAuthContext && req.availAuthContext.user) || {};
    const sourceId = await sourceIdForView(pgEnv, view_id);
    const ok = await isUserAuthedForSource({
      env: pgEnv, db: getDb(pgEnv), sourceId: sourceId ?? 0, reqPermissions: ['download-source'], user,
      patternRef: requestPatternRef(req), wasOpen: true,
    });
    if (!ok) return res.status(user.id != null ? 403 : 401).json({ error: `requires download-source on source ${sourceId}` });

    const token = await signToken({ purpose: 'download', pgEnv, view_id: +view_id, file_type }, DOWNLOAD_LINK_TTL);
    res.json({ url: `/dama-admin/${encodeURIComponent(pgEnv)}/downloads/file?token=${encodeURIComponent(token)}` });
  } catch (err) {
    console.error('[download] sign failed:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /dama-admin/:pgEnv/downloads/file?token=…
 * Streams the file a token from signDownload names, read from storage (so it works on a private
 * bucket). The token names a view and file type, never a path: the url comes from the view's
 * metadata. A url this server's storage doesn't hold is redirected to as-is.
 */
async function serveDownload(req, res) {
  const { pgEnv } = req.params;
  let claim;
  try {
    claim = await verifyToken(String(req.query.token || ''));
  } catch {
    return res.status(403).json({ error: 'download link expired or invalid' });
  }
  if (!claim || claim.purpose !== 'download' || claim.pgEnv !== pgEnv) {
    return res.status(403).json({ error: 'download link expired or invalid' });
  }

  try {
    const downloads = await readViewDownloads(pgEnv, claim.view_id);
    const url = downloads && downloads[claim.file_type];
    if (!url) return res.status(404).json({ error: 'download not found' });
    const key = storageKeyFor(url);
    if (!key) return res.redirect(302, url);

    let stream;
    try {
      stream = await storage.read(key);
    } catch {
      return res.status(404).json({ error: 'download file is missing from storage' });
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(key))}`);
    res.setHeader('Cache-Control', 'private, no-store');
    stream.on('error', (e) => {
      console.error('[download] stream failed:', e.message);
      res.destroy(e);
    });
    stream.pipe(res);
  } catch (err) {
    console.error('[download] file failed:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
}

module.exports = { downloadGuard, createDownload, deleteDownload, signDownload, serveDownload, storageKeyFor };
