/**
 * Generic file upload route.
 * Handles file uploads with optional image processing (Sharp).
 * Stores files via the storage service (local disk or S3).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const Busboy = require('busboy');
const storage = require('../storage');
const { createDamaSource, createDamaView } = require('./metadata');
const { sharpAvailable, getSharp } = require('./sharp');

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.heif', '.heic', '.tiff', '.svg'];
const EFFICIENT_FORMATS = ['.avif', '.heif', '.heic'];
const MAX_IMAGE_DIM = 1400;

/**
 * POST /dama-admin/:pgEnv/file_upload
 */
function fileUpload(req, res) {
  const { pgEnv } = req.params;
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
    try {
      if (!savedFilePath) {
        return res.status(400).json({ ok: false, error: 'No file uploaded' });
      }

      const {
        source_name, source_id: existingSourceId, type = 'file_upload',
        file_name, file_type, directory, description, categories, user_id,
      } = fields;

      const fileName = file_name || originalFileName;
      const ext = path.extname(fileName).toLowerCase();
      let processedPath = savedFilePath;
      let finalFileName = fileName;

      // Image processing (if Sharp available and file is an image)
      if (sharpAvailable && IMAGE_EXTS.includes(ext)) {
        try {
          const sharp = getSharp();
          const meta = await sharp(savedFilePath).metadata();

          let pipeline = sharp(savedFilePath);

          // Resize if too large
          if ((meta.width && meta.width > MAX_IMAGE_DIM) || (meta.height && meta.height > MAX_IMAGE_DIM)) {
            pipeline = pipeline.resize(MAX_IMAGE_DIM, MAX_IMAGE_DIM, { fit: 'inside', withoutEnlargement: true });
          }

          // Convert to AVIF if not already efficient
          if (!EFFICIENT_FORMATS.includes(ext)) {
            finalFileName = fileName.replace(/\.[^.]+$/, '.avif');
            pipeline = pipeline.avif({ quality: 80 });
          }

          processedPath = savedFilePath + '.processed';
          await pipeline.toFile(processedPath);
        } catch (err) {
          console.warn(`[file_upload] Image processing failed, using original: ${err.message}`);
          processedPath = savedFilePath;
          finalFileName = fileName;
        }
      }

      // Create or reuse source
      let source_id = existingSourceId ? +existingSourceId : null;
      if (!source_id) {
        if (!source_name || source_name.length < 4) {
          return res.status(400).json({ ok: false, error: 'source_name must be at least 4 characters' });
        }
        const parsedCats = categories ? JSON.parse(categories) : null;
        const source = await createDamaSource({
          name: source_name,
          type,
          categories: parsedCats,
          user_id: user_id ? +user_id : null,
        }, pgEnv);
        source_id = source.source_id;
      }

      // Create view
      const view = await createDamaView({
        source_id,
        user_id: user_id ? +user_id : null,
      }, pgEnv);

      // Determine storage path
      const relativePath = directory
        ? path.join(directory, finalFileName)
        : path.join(`pg-${pgEnv}_s-${source_id}`, `v-${view.view_id}`, finalFileName);

      // Write to storage
      await storage.write(relativePath, fs.createReadStream(processedPath));

      const dl_url = storage.getUrl(relativePath);

      // Store file metadata in view metadata
      const { getDb } = require('../db');
      const db = getDb(pgEnv);
      const viewTable = db.type === 'postgres' ? 'data_manager.views' : 'views';
      const fileMeta = { file_name: finalFileName, file_type: file_type || ext, dl_url, description: description || null };

      await db.query(`
        UPDATE ${viewTable}
        SET metadata = COALESCE(metadata, ${db.type === 'postgres' ? "'{}'::jsonb" : "'{}'"}) || $1${db.type === 'postgres' ? '::jsonb' : ''}
        WHERE view_id = $2
      `, [JSON.stringify({ file: fileMeta }), view.view_id]);

      // Clean up temp files
      try { fs.unlinkSync(savedFilePath); } catch (e) {}
      if (processedPath !== savedFilePath) {
        try { fs.unlinkSync(processedPath); } catch (e) {}
      }

      res.json({ ok: true, source_id });
    } catch (err) {
      console.error('[file_upload] failed:', err.message);
      // Clean up on error
      if (savedFilePath) try { fs.unlinkSync(savedFilePath); } catch (e) {}
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  busboy.on('error', (err) => {
    console.error('[file_upload] stream error:', err.message);
    res.status(500).json({ ok: false, error: 'Upload failed' });
  });

  req.pipe(busboy);
}

module.exports = { fileUpload };
