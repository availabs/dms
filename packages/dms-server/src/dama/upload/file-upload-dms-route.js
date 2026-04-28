/**
 * DMS-backed file upload route.
 *
 * Stores source/view metadata as DMS `data_items` rows (no pgEnv required)
 * registered under the provided owner (dmsEnv or pattern). The file itself
 * still flows through the storage service (local disk / S3).
 *
 * Type scheme (see src/dms/CLAUDE.md):
 *   source: {ownerInstance}|{sourceSlug}:source
 *   view:   {sourceSlug}|v{N}:view
 *
 * Response: { ok, app, source_id, view_id, dl_url }
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const Busboy = require('busboy');
const storage = require('../storage');
const { sharpAvailable, getSharp } = require('./sharp');
const { nameToSlug, getInstance } = require('../../db/type-utils');

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.heif', '.heic', '.tiff', '.svg'];
const EFFICIENT_FORMATS = ['.avif', '.heif', '.heic'];
const MAX_IMAGE_DIM = 1400;
const MIN_SOURCE_NAME_LENGTH = 4;

function firstId(rows) {
  return rows?.[0]?.id != null ? +rows[0].id : null;
}

function createFileUploadDmsHandler(controller) {
  return function fileUploadDms(req, res) {
    const { app } = req.params;
    if (!app) {
      return res.status(400).json({ ok: false, error: 'app path parameter is required' });
    }

    const busboy = Busboy({ headers: req.headers });

    const fields = {};
    let savedFilePath = null;
    let originalFileName = null;

    busboy.on('field', (name, value) => {
      fields[name] = value;
    });

    busboy.on('file', (fieldName, stream, info) => {
      originalFileName = info.filename;
      const tempPath = path.join(os.tmpdir(), `dms-fileupload-${randomUUID()}`);
      savedFilePath = tempPath;
      stream.pipe(fs.createWriteStream(tempPath));
    });

    busboy.on('finish', async () => {
      let createdSourceId = null;
      let createdViewId = null;

      try {
        if (!savedFilePath) {
          return res.status(400).json({ ok: false, error: 'No file uploaded' });
        }

        const {
          owner_id, owner_ref, owner_instance,
          source_id: existingSourceIdRaw,
          source_name,
          file_name, file_type, directory, description, categories, user_id,
        } = fields;

        const existingSourceId = existingSourceIdRaw ? +existingSourceIdRaw : null;

        if (!owner_id || !owner_instance) {
          return res.status(400).json({ ok: false, error: 'owner_id and owner_instance are required' });
        }

        if (!existingSourceId && (!source_name || source_name.length < MIN_SOURCE_NAME_LENGTH)) {
          return res.status(400).json({ ok: false, error: `source_name must be at least ${MIN_SOURCE_NAME_LENGTH} characters` });
        }

        const fileName = file_name || originalFileName;
        const ext = path.extname(fileName).toLowerCase();
        let processedPath = savedFilePath;
        let finalFileName = fileName;

        // Image processing (if Sharp available and file is an image).
        // Mirrors file-upload-route.js — kept inline instead of extracted
        // since the two routes are the only callers and diverging later is
        // likely (DMS-specific image variants, etc).
        if (sharpAvailable && IMAGE_EXTS.includes(ext)) {
          try {
            const sharp = getSharp();
            const meta = await sharp(savedFilePath).metadata();

            let pipeline = sharp(savedFilePath);

            if ((meta.width && meta.width > MAX_IMAGE_DIM) || (meta.height && meta.height > MAX_IMAGE_DIM)) {
              pipeline = pipeline.resize(MAX_IMAGE_DIM, MAX_IMAGE_DIM, { fit: 'inside', withoutEnlargement: true });
            }

            if (!EFFICIENT_FORMATS.includes(ext)) {
              finalFileName = fileName.replace(/\.[^.]+$/, '.avif');
              pipeline = pipeline.avif({ quality: 80 });
            }

            processedPath = savedFilePath + '.processed';
            await pipeline.toFile(processedPath);
          } catch (err) {
            console.warn(`[file_upload_dms] Image processing failed, using original: ${err.message}`);
            processedPath = savedFilePath;
            finalFileName = fileName;
          }
        }

        const user = user_id ? { id: +user_id } : null;
        const parsedCats = categories ? JSON.parse(categories) : null;

        // Resolve or create the source row.
        let sourceId, sourceSlug;
        if (existingSourceId) {
          sourceId = existingSourceId;
          // Derive slug from the source row's type column: {owner}|{slug}:source
          const [row] = await controller.getDataById([sourceId], ['type'], app);
          if (!row) throw new Error(`Source ${sourceId} not found`);
          sourceSlug = getInstance(row.type);
          if (!sourceSlug) throw new Error(`Could not derive source slug from type "${row.type}"`);
        } else {
          sourceSlug = nameToSlug(source_name);
          if (!sourceSlug) {
            return res.status(400).json({ ok: false, error: 'source_name must contain at least one letter or number' });
          }
          const sourceType = `${owner_instance}|${sourceSlug}:source`;

          // Refuse to create a duplicate source under the same owner. If a row
          // with the same (app, type) already exists, the UDA resolver can't
          // tell which one owns a given view/data type (the current resolver
          // picks ORDER BY id DESC LIMIT 1, which silently stomps the older
          // one's data path — see the 2060573 "Songs" incident). Return 409
          // with the existing id so the client can either append via
          // `source_id` or pick a different name.
          const existingCount = await controller.dataLength([`${app}+${sourceType}`]);
          const existingLen = existingCount?.[0]?.length || 0;
          if (existingLen > 0) {
            const existingRows = await controller.dataByIndex(
              [`${app}+${sourceType}`],
              [0]
            );
            const existingId = existingRows?.[0]?.rows?.[0]?.id ?? null;
            return res.status(409).json({
              ok: false,
              error: `A source named "${source_name}" already exists on this owner (type="${sourceType}"). Pass source_id=${existingId} to append a new file, or use a different source_name.`,
              existing_source_id: existingId,
              existing_source_type: sourceType,
            });
          }

          const sourceData = {
            name: source_name.trim(),
            type: 'file_upload',
          };
          if (parsedCats) sourceData.categories = parsedCats;
          if (description) sourceData.description = description;

          const sourceRows = await controller.createData([app, sourceType, sourceData], user);
          sourceId = firstId(sourceRows);
          if (!sourceId) throw new Error('Failed to create DMS source row');
          createdSourceId = sourceId;
        }

        // Fetch the source to determine the next view number and existing views list.
        const [sourceRow] = await controller.getDataById([sourceId], ['data'], app);
        if (!sourceRow) throw new Error(`Source ${sourceId} not found after create`);
        const sourceData = typeof sourceRow.data === 'string' ? JSON.parse(sourceRow.data) : (sourceRow.data || {});
        const existingViews = Array.isArray(sourceData.views) ? sourceData.views : [];
        const viewCounter = existingViews.length + 1;

        // Create the view row.
        const viewType = `${sourceSlug}|v${viewCounter}:view`;
        const viewRows = await controller.createData(
          [app, viewType, { name: `version ${viewCounter}` }],
          user
        );
        const viewId = firstId(viewRows);
        if (!viewId) throw new Error('Failed to create DMS view row');
        createdViewId = viewId;

        // Append the new view ref to the source's views array.
        const viewRefBase = `${app}+${sourceSlug}|view`;
        const nextViews = [
          ...existingViews.filter(v => v && v.id).map(v => ({ ref: v.ref || viewRefBase, id: +v.id })),
          { ref: viewRefBase, id: viewId },
        ];
        await controller.setDataById(sourceId, { views: nextViews }, user, app);

        // If the source is newly created, append its ref to the owner row's sources array.
        if (createdSourceId) {
          const ownerIdNum = +owner_id;
          const [ownerRow] = await controller.getDataById([ownerIdNum], ['data'], app);
          if (!ownerRow) throw new Error(`Owner row ${ownerIdNum} not found`);
          const ownerData = typeof ownerRow.data === 'string' ? JSON.parse(ownerRow.data) : (ownerRow.data || {});
          const existingSources = Array.isArray(ownerData.sources) ? ownerData.sources : [];
          const ownerSourceRef = owner_ref || `${app}+${owner_instance}|source`;
          const nextSources = [
            ...existingSources.filter(s => s && s.id).map(s => ({ ref: s.ref || ownerSourceRef, id: +s.id })),
            { ref: ownerSourceRef, id: sourceId },
          ];
          await controller.setDataById(ownerIdNum, { sources: nextSources }, user, app);
        }

        // Storage path — DMS-keyed, not pgEnv-keyed.
        const relativePath = directory
          ? path.join(directory, finalFileName)
          : path.join(`dms-${app}_env-${owner_instance}_s-${sourceId}`, `v-${viewId}`, finalFileName);

        await storage.write(relativePath, fs.createReadStream(processedPath));

        const dl_url = storage.getUrl(relativePath);

        // Merge file metadata onto the view row.
        const fileMeta = {
          file_name: finalFileName,
          file_type: file_type || ext,
          dl_url,
          description: description || null,
        };
        await controller.setDataById(viewId, { file: fileMeta }, user, app);

        try { fs.unlinkSync(savedFilePath); } catch (e) {}
        if (processedPath !== savedFilePath) {
          try { fs.unlinkSync(processedPath); } catch (e) {}
        }

        res.json({ ok: true, app, source_id: sourceId, view_id: viewId, dl_url });
      } catch (err) {
        console.error('[file_upload_dms] failed:', err.message);

        // Best-effort rollback of rows created in this request.
        // deleteData needs the type; look it up from the row itself.
        if (createdViewId) {
          try {
            const [viewRow] = await controller.getDataById([createdViewId], ['type'], app);
            if (viewRow?.type) {
              await controller.deleteData(app, viewRow.type, [createdViewId]);
            }
          } catch (e) {
            console.warn(`[file_upload_dms] rollback view ${createdViewId} failed: ${e.message}`);
          }
        }
        if (createdSourceId) {
          try {
            const [sourceRow] = await controller.getDataById([createdSourceId], ['type'], app);
            if (sourceRow?.type) {
              await controller.deleteData(app, sourceRow.type, [createdSourceId]);
            }
          } catch (e) {
            console.warn(`[file_upload_dms] rollback source ${createdSourceId} failed: ${e.message}`);
          }
        }

        if (savedFilePath) try { fs.unlinkSync(savedFilePath); } catch (e) {}
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    busboy.on('error', (err) => {
      console.error('[file_upload_dms] stream error:', err.message);
      res.status(500).json({ ok: false, error: 'Upload failed' });
    });

    req.pipe(busboy);
  };
}

module.exports = { createFileUploadDmsHandler };
