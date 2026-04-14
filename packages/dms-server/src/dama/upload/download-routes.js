/**
 * Download creation and deletion routes.
 * Export GIS view data to CSV/Shapefile/GeoJSON/GPKG via ogr2ogr.
 */

const { gdalAvailable } = require('./gdal');
const { queueTask } = require('../tasks');
const { getDb } = require('../../db');
const storage = require('../storage');

function downloadGuard(req, res, next) {
  if (!gdalAvailable) {
    return res.status(501).json({ error: 'Download creation requires GDAL (ogr2ogr).' });
  }
  next();
}

/**
 * POST /dama-admin/:pgEnv/gis-dataset/create-download
 * Queue a download creation task.
 */
async function createDownload(req, res) {
  const { pgEnv } = req.params;
  const { source_id, view_id, user_id, email, fileTypes, columns, groupedByColumn } = req.body;

  if (!source_id || !view_id) {
    return res.status(400).json({ error: 'source_id and view_id are required' });
  }
  if (!fileTypes || !fileTypes.length) {
    return res.status(400).json({ error: 'fileTypes array is required' });
  }
  if (!columns || !columns.length) {
    return res.status(400).json({ error: 'columns array is required' });
  }

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
 * Delete download files and clear view metadata.
 */
async function deleteDownload(req, res) {
  const { pgEnv } = req.params;
  const { view_id } = req.body;

  if (!view_id) {
    return res.status(400).json({ error: 'view_id is required' });
  }

  try {
    const relativePath = `${pgEnv}_${view_id}`;
    await storage.remove(relativePath);

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

module.exports = { downloadGuard, createDownload, deleteDownload };
