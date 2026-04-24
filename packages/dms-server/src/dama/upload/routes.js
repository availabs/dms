/**
 * Upload routes — DAMA-compatible endpoints for file upload and analysis.
 *
 * Routes mirror the DAMA server URL patterns so the client can switch
 * between servers by changing only the host in damaServerPath.
 */

const fs = require('fs');
const path = require('path');
const Busboy = require('busboy');
const store = require('./store');
const { getProcessor } = require('./processors');
const { isSplitType, parseSplitDataType } = require('#db/type-utils.js');
const dmsTasks = require('../../dms/tasks');

const UPLOAD_DIR = process.env.DAMA_ETL_DIR || path.join(__dirname, '../../../var/tmp-etl');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * GET /dama-admin/:pgEnv/etl/new-context-id
 * Returns an incrementing integer (DAMA compat — client expects text number).
 */
function newContextId(req, res) {
  res.type('text').send(String(store.nextContextId()));
}

/**
 * POST /dama-admin/:pgEnv/gis-dataset/upload
 * Receives multipart file upload. Saves to temp dir, returns upload ID immediately,
 * then kicks off async analysis in the background.
 *
 * Response shape matches DAMA: [{ id: "..." }]
 */
function upload(req, res) {
  const uploadId = store.generateUploadId();
  const workDir = path.join(UPLOAD_DIR, uploadId);
  fs.mkdirSync(workDir, { recursive: true });

  const busboy = Busboy({ headers: req.headers });
  const fields = {};
  let savedFilePath = null;
  let savedFileName = null;

  busboy.on('field', (name, value) => {
    fields[name] = value;
  });

  let fileWritePromise = null;

  busboy.on('file', (fieldname, stream, info) => {
    const { filename } = info;
    savedFileName = filename;
    savedFilePath = path.join(workDir, filename);
    const writeStream = fs.createWriteStream(savedFilePath);
    stream.pipe(writeStream);
    fileWritePromise = new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
  });

  busboy.on('finish', async () => {
    if (!savedFilePath || !fileWritePromise) {
      console.log(`[upload] ${uploadId} FAILED — no file in request`);
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Wait for file to finish writing to disk
    await fileWritePromise;

    const fileSize = fs.statSync(savedFilePath).size;
    console.log(`[upload] ${uploadId} received "${savedFileName}" (${(fileSize / 1024).toFixed(1)} KB)`);

    // Create store entry and return immediately
    store.create(uploadId);

    // Link etlContextId to uploadId so /events/query can find this upload's status
    if (fields.etlContextId) {
      store.linkContext(fields.etlContextId, uploadId);
    }

    res.json([{ id: uploadId }]);

    // Kick off analysis in background
    processUpload(uploadId, workDir, savedFilePath, savedFileName).catch(err => {
      console.error(`[upload] ${uploadId} analysis FAILED:`, err.message);
      store.setError(uploadId, err.message || String(err));
    });
  });

  busboy.on('error', (err) => {
    console.error(`[upload] ${uploadId} stream FAILED:`, err.message);
    res.status(500).json({ error: 'Upload failed' });
  });

  req.pipe(busboy);
}

/**
 * Background analysis: extract archive if needed, detect file type, run processor.
 */
async function processUpload(uploadId, workDir, filePath, fileName) {
  const ext = path.extname(fileName).toLowerCase();

  // If it's a zip, extract and find data files inside
  if (ext === '.zip') {
    console.log(`[upload] ${uploadId} extracting ZIP archive...`);
    const extractDir = path.join(workDir, 'dataset');
    await extractZip(filePath, extractDir);
    const dataFile = findDataFile(extractDir);
    if (!dataFile) {
      console.log(`[upload] ${uploadId} FAILED — no supported data file in archive`);
      store.setError(uploadId, 'No supported data file found in archive');
      return;
    }
    console.log(`[upload] ${uploadId} found data file: ${path.basename(dataFile)}`);
    filePath = dataFile;
  }

  const dataExt = path.extname(filePath).toLowerCase();
  const processor = getProcessor(dataExt);

  if (!processor) {
    // Check if it's a GIS type that needs GDAL
    const { gdalAvailable } = require('./gdal');
    const GIS_EXTS = ['.shp', '.gpkg', '.geojson', '.gdb'];
    if (GIS_EXTS.includes(dataExt) && !gdalAvailable) {
      console.log(`[upload] ${uploadId} FAILED — ${dataExt} requires GDAL (gdal-async not installed)`);
      store.setError(uploadId, `File type ${dataExt} requires GDAL. Install gdal-async to enable GIS processing.`);
    } else {
      console.log(`[upload] ${uploadId} FAILED — unsupported file type: ${dataExt}`);
      store.setError(uploadId, `Unsupported file type: ${dataExt}`);
    }
    return;
  }

  const layers = await processor.analyze(filePath);
  const totalFields = layers.reduce((n, l) => n + (l.fieldsMetadata?.length || 0), 0);
  console.log(`[upload] ${uploadId} analysis complete — ${layers.length} layer(s), ${totalFields} field(s)`);
  store.setReady(uploadId, layers, filePath, dataExt);
}

/**
 * Extract a ZIP file to a target directory.
 */
async function extractZip(zipPath, targetDir) {
  const unzipper = require('unzipper');
  await new Promise((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: targetDir }))
      .on('close', resolve)
      .on('error', reject);
  });
}

/**
 * Recursively find the first supported data file in a directory.
 */
function findDataFile(dir) {
  const supportedExts = ['.csv', '.tsv', '.xlsx', '.xls', '.shp', '.gpkg', '.geojson', '.json'];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name.startsWith('__')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findDataFile(fullPath);
      if (found) return found;
    } else if (supportedExts.includes(path.extname(entry.name).toLowerCase())) {
      return fullPath;
    }
  }
  return null;
}

/**
 * GET /dama-admin/:pgEnv/gis-dataset/:id/layers
 * Returns [] while processing, [{layerName, fieldsMetadata}] when ready.
 * Client polls this until it gets a non-empty array.
 */
function getLayers(req, res) {
  const { id } = req.params;
  const entry = store.get(id);

  if (!entry) {
    return res.json([]);
  }

  if (entry.status === 'error') {
    return res.status(500).json({ error: entry.error });
  }

  // Return [] while processing (client polls until non-empty)
  if (entry.status === 'processing') {
    return res.json([]);
  }

  res.json(entry.layers);
}

/**
 * POST /dama-admin/dms/:appType/publish
 * Reads previously uploaded file, parses rows using column mappings,
 * writes each row into data_items via DMS controller.
 *
 * :appType is "app+type" (e.g. "myapp+uuid-42")
 *
 * Request body: { gisUploadId, layerName, columns, user_id, email }
 *   columns: [{ name, display_name, existingColumnMatch, isPrimary, geo_col, type, required, options }]
 */
function createPublishHandler(controller) {
  return async function publish(req, res) {
    const { appType } = req.params;
    const { gisUploadId, layerName, columns = [], user_id, sourceId } = req.body;

    const [app, type] = appType.split('+');
    if (!app || !type) {
      console.log(`[publish] FAILED — invalid app+type: "${appType}"`);
      return res.json({ err: 'Invalid app+type in URL' });
    }

    console.log(`[publish] ${app}+${type} upload=${gisUploadId} layer="${layerName}" cols=${columns.length} user=${user_id} sourceId=${sourceId || 'NOT PROVIDED'}`);

    // Look up the uploaded file
    const entry = store.get(gisUploadId);
    if (!entry || entry.status !== 'ready') {
      console.log(`[publish] ${app}+${type} FAILED — upload ${gisUploadId} not found or not ready`);
      return res.json({ err: 'Upload not found or not ready' });
    }

    const processor = getProcessor(entry.fileExt);
    if (!processor || !processor.parseRows) {
      console.log(`[publish] ${app}+${type} FAILED — no processor for ${entry.fileExt}`);
      return res.json({ err: `No processor for file type: ${entry.fileExt}` });
    }

    try {
      const rows = await processor.parseRows(entry.dataFilePath, layerName);
      if (!rows || rows.length <= 1) {
        console.log(`[publish] ${app}+${type} FAILED — file contains no data rows`);
        return res.json({ err: 'File contains no data rows' });
      }

      // New format: type ends with ':data' — all rows share same type, isValid flag in data
      // Legacy format: valid='{doctype}-{viewId}', invalid='{doctype}-{viewId}-invalid-entry'
      const isNewFormat = isSplitType(type);
      const invalidSuffix = '-invalid-entry';
      const validType = isNewFormat ? type : type.replace(invalidSuffix, '');
      const invalidType = isNewFormat ? type : validType + invalidSuffix;

      const primaryCol = columns.find(c => c.isPrimary)?.name;
      console.log(`[publish] ${app}+${type} processing ${rows.length - 1} data rows${primaryCol ? ` (primary: ${primaryCol})` : ''}`);

      // Build pivot column lookup: existingColumnMatch → [source columns that map to it]
      const colRefCount = columns
        .filter(c => c.existingColumnMatch)
        .reduce((acc, c) => {
          const key = c.existingColumnMatch;
          acc[key] = [...(acc[key] || []), c.display_name || c.name];
          return acc;
        }, {});
      const pivotCols = Object.keys(colRefCount).filter(k => colRefCount[k].length > 1);

      // Wrap the row-insertion work in a DMS task row so it's visible in the
      // admin UI (UdaTaskList) and durably recorded with events. If the task
      // table isn't present for any reason, fall back to running inline
      // without a task row rather than blocking the publish.
      const runPublish = async (taskCtx) => {
        // taskCtx is supplied by runInlineTask. If null, the dispatch helpers
        // become no-ops so the publish still runs (un-bookkept) on a db that
        // doesn't have dms.tasks initialized.
        const dispatch = taskCtx?.dispatchEvent || (async () => {});
        const updateProgress = taskCtx?.updateProgress || (async () => {});
        const log = taskCtx?.log || ((msg) => console.log(`[publish ${app}+${type}] ${msg}`));
        const startTime = Date.now();

        // Stage 1: parsed input
        await dispatch(
          'publish:input',
          `Parsed ${rows.length - 1} rows from ${entry.fileExt} (layer "${layerName}")`,
          {
            uploadId: gisUploadId,
            layerName,
            fileExt: entry.fileExt,
            rowCount: rows.length - 1,
            columnCount: columns.length,
            primaryCol: primaryCol || null,
            pivotCols,
          }
        );
        log(`parsed ${rows.length - 1} rows, ${columns.length} columns, primaryCol=${primaryCol || 'none'}`);

        // Stage 2: column mapping summary so the events table shows what was
        // sent vs what got mapped onto existing source attributes
        const mappedCount = columns.filter(c => c.existingColumnMatch).length;
        const unmappedCount = columns.length - mappedCount;
        await dispatch(
          'publish:columns',
          `${mappedCount} mapped to existing, ${unmappedCount} unmapped (will be added)`,
          {
            mapped: columns.filter(c => c.existingColumnMatch).map(c => ({ from: c.name, to: c.existingColumnMatch })),
            unmapped: columns.filter(c => !c.existingColumnMatch).map(c => c.name),
          }
        );

        // Stage 3: source resolution. The destination split table is
        // determined by source_id; surface what we resolved (and what we
        // resolved it FROM) so a missing source is visible in the events.
        let resolvedSourceId = sourceId;
        let sourceResolution = sourceId ? { from: 'request', sourceId } : null;
        if (!resolvedSourceId) {
          const newParsed = parseSplitDataType(validType);
          const docType = newParsed ? newParsed.source : validType.replace(/-\d+$/, '');
          resolvedSourceId = await controller.findSourceIdByDocType(app, docType);
          sourceResolution = resolvedSourceId
            ? { from: newParsed ? 'source-instance' : 'doc_type', lookup: docType, sourceId: resolvedSourceId }
            : { from: newParsed ? 'source-instance' : 'doc_type', lookup: docType, sourceId: null, error: 'not found' };
        }
        if (resolvedSourceId) {
          await dispatch(
            'publish:source-resolved',
            `Source ${resolvedSourceId} (${sourceResolution.from}: ${sourceResolution.lookup || 'request body'})`,
            sourceResolution
          );
          log(`resolved source_id=${resolvedSourceId} via ${sourceResolution.from}`);
        } else {
          await dispatch(
            'publish:source-resolved',
            `WARNING: source not resolved — split table will use fallback naming, source.config will not be updated`,
            sourceResolution
          );
          log(`WARNING: source not resolved (${sourceResolution.from}: ${sourceResolution.lookup})`);
        }

        // Stage 4: insert loop
        const insertStart = Date.now();
        const results = [];
        // Skip header row (index 0)
        for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
          const row = rows[rowIdx];
          try {
            const data = buildRowData(row, columns, colRefCount, pivotCols);
            // New format: all rows use same type; legacy: separate valid/invalid types
            const rowType = isNewFormat ? type : (data.isValid ? validType : invalidType);

            // Primary key upsert: check if matching record exists
            if (primaryCol && data[primaryCol]) {
              const existing = await controller.findByDataKey(app, [validType, invalidType], primaryCol, data[primaryCol]);
              if (existing) {
                await controller.updateDataById(app, existing.id, rowType, data, user_id);
                results.push({ row: rowIdx, action: 'updated', id: existing.id });
                continue;
              }
            }

            // Insert new row
            const created = await controller.createData([app, rowType, data], { id: user_id });
            const newId = created?.[0]?.id;
            results.push({ row: rowIdx, action: 'created', id: newId });
          } catch (e) {
            results.push({ row: rowIdx, action: 'error', error: e.message });
            await dispatch('publish:row-error', `Row ${rowIdx} failed: ${e.message}`, { row: rowIdx, error: e.message });
          }
          // Periodic progress event so the events table shows liveness on big files
          if (rowIdx % 100 === 0) {
            const pct = (rowIdx - 1) / Math.max(1, rows.length - 1);
            const createdSoFar = results.filter(r => r.action === 'created').length;
            const errorsSoFar = results.filter(r => r.action === 'error').length;
            await updateProgress(pct);
            await dispatch(
              'publish:progress',
              `${rowIdx - 1}/${rows.length - 1} (${Math.round(pct * 100)}%) — ${createdSoFar} created, ${errorsSoFar} errors`,
              { processed: rowIdx - 1, total: rows.length - 1, created: createdSoFar, errors: errorsSoFar }
            );
          }
        }

        const created = results.filter(r => r.action === 'created').length;
        const updated = results.filter(r => r.action === 'updated').length;
        const errors = results.filter(r => r.action === 'error').length;
        const insertElapsedMs = Date.now() - insertStart;
        log(`insert loop done: ${created} created, ${updated} updated, ${errors} errors in ${insertElapsedMs}ms`);
        await dispatch(
          'publish:inserts-complete',
          `${created} created, ${updated} updated, ${errors} errors (${insertElapsedMs}ms)`,
          { created, updated, errors, total: results.length, elapsedMs: insertElapsedMs }
        );

        // Stage 5: save column metadata as config on the source record.
        if (columns.length && resolvedSourceId) {
          try {
            const existingConfig = await controller.getSourceConfig(app, resolvedSourceId);
            const existingAttrs = existingConfig?.attributes || [];
            const newAttrs = columns.filter(c =>
              !existingAttrs.find(ea => ea.display_name === c.display_name || ea.name === c.name)
            );
            if (newAttrs.length) {
              const config = JSON.stringify({ attributes: [...existingAttrs, ...newAttrs] });
              await controller.setDataById(resolvedSourceId, { config }, { id: user_id });
              await dispatch(
                'publish:config-saved',
                `Added ${newAttrs.length} new attribute(s) to source ${resolvedSourceId}.config (existing: ${existingAttrs.length})`,
                {
                  sourceId: resolvedSourceId,
                  existingCount: existingAttrs.length,
                  addedCount: newAttrs.length,
                  added: newAttrs.map(c => c.display_name || c.name),
                }
              );
              log(`saved config: +${newAttrs.length} new attrs (${existingAttrs.length} existing) on source ${resolvedSourceId}`);
            } else {
              await dispatch(
                'publish:config-unchanged',
                `All ${columns.length} columns already in source.config — nothing to add`,
                { sourceId: resolvedSourceId, existingCount: existingAttrs.length }
              );
            }
          } catch (e) {
            await dispatch(
              'publish:config-error',
              `Failed to save source.config: ${e.message}`,
              { sourceId: resolvedSourceId, error: e.message }
            );
            console.error(`[publish] ${app}+${type} WARNING: failed to save config:`, e.message);
          }
        } else if (!resolvedSourceId) {
          await dispatch(
            'publish:config-skipped',
            `Skipping source.config update — no source_id resolved`,
            null
          );
        }

        const totalElapsedMs = Date.now() - startTime;
        await dispatch(
          'publish:done',
          `${created} created, ${updated} updated, ${errors} errors in ${totalElapsedMs}ms`,
          { created, updated, errors, total: results.length, elapsedMs: totalElapsedMs, sourceId: resolvedSourceId }
        );

        return { results, created, updated, errors, sourceId: resolvedSourceId, elapsedMs: totalElapsedMs };
      };

      let taskId = null;
      let runResult;
      try {
        const out = await dmsTasks.runInlineTask(
          {
            workerPath: 'internal-table/publish',
            app,
            sourceId: sourceId ? Number(sourceId) : null,
            descriptor: {
              workerPath: 'internal-table/publish',
              app,
              sourceId: sourceId ? Number(sourceId) : null,
              type,
              gisUploadId,
              layerName,
              columnCount: columns.length,
              primaryCol,
            },
          },
          runPublish
        );
        taskId = out.taskId;
        runResult = out.result;
      } catch (taskErr) {
        // Task row creation failed (e.g. dms.tasks not initialized yet on an
        // un-migrated db). Fall back to running the publish without task
        // bookkeeping so the feature still works on older deployments.
        console.warn(`[publish] ${app}+${type} task wrapping failed (${taskErr.message}); running without task row`);
        runResult = await runPublish(null);
      }

      res.json({ task_id: taskId, data: runResult.results });
    } catch (e) {
      console.error(`[publish] ${app}+${type} FAILED:`, e.message);
      res.json({ err: e.message });
    }
  };
}

/**
 * Build a data object from a row of cell values using column mappings.
 * Handles validation, pivot columns, and multiselect splitting.
 */
function buildRowData(row, columns, colRefCount, pivotCols) {
  return row.reduce((acc, value, i) => {
    const col = columns[i];
    if (!col) return acc;

    const key = col.existingColumnMatch || col.name;
    const pivotCol = pivotCols.find(p => colRefCount[p].includes(col.display_name || col.name));

    // Validation for select/multiselect and required fields
    const isValid = ['multiselect', 'select'].includes(col.type) || col.required === 'yes'
      ? validateValue(value, col)
      : true;

    // Pivot: column header becomes a value in the destination column
    if (pivotCol) {
      return {
        ...acc,
        [pivotCol]: value ? [...(acc[pivotCol] || []), (col.display_name || col.name)] : acc[pivotCol],
        isValid: acc.isValid && isValid,
      };
    }

    // Multiselect: split comma-separated string into array
    const finalValue = col.type === 'multiselect' && value
      ? String(value).split(',').map(v => v.trim())
      : value;

    return {
      ...acc,
      [key]: finalValue,
      isValid: acc.isValid && isValid,
    };
  }, { isValid: true });
}

/**
 * Validate a cell value against column rules (required, options).
 */
function validateValue(value, col) {
  const { required, options } = col;
  const requiredOk = !required || (required && value != null && value !== '');
  if (!options || !options.length) return requiredOk;

  const optionValues = options.map(o => o?.value != null ? o.value : o);
  let optionsOk;
  if (!value && !required) {
    optionsOk = true;
  } else if (Array.isArray(value)) {
    optionsOk = value.every(v => optionValues.includes(v?.value != null ? v.value : v));
  } else {
    optionsOk = optionValues.includes(typeof value === 'number' ? value : String(value));
  }

  return requiredOk && optionsOk;
}

/**
 * POST /dama-admin/dms/:appType/validate
 * Re-validates all dataset rows against column rules (required fields, select options).
 * Moves rows between valid and invalid types as needed.
 *
 * :appType is "app+type" where type is the invalid-entry type (e.g. "myapp+doctype-1-invalid-entry")
 *
 * Request body: { parentId, parentDocType }
 */
function createValidateHandler(controller) {
  const invalidSuffix = '-invalid-entry';

  return async function validate(req, res) {
    const { appType } = req.params;
    const [app, type] = appType.split('+');
    const { parentId, parentDocType } = req.body;

    if (!app || !type || !parentDocType) {
      console.log(`[validate] FAILED — missing app/type/parentDocType`);
      return res.json({ err: 'Insufficient info to validate.' });
    }

    // New format: type ends with ':data' — all rows share one type, only data.isValid changes
    const isNewFormat = isSplitType(type);

    console.log(`[validate] ${app}+${type} parentDocType=${parentDocType}${parentId ? ` parentId=${parentId}` : ''}`);

    try {
      const config = await controller.getSourceConfig(app, parentId, parentDocType);
      if (!config?.attributes) {
        console.log(`[validate] ${app}+${type} FAILED — no config found`);
        return res.json({ err: 'No config found, try providing metadata.' });
      }

      // New format: single type for all rows
      // Legacy: separate valid/invalid types
      const invalidType = isNewFormat ? type : (type.includes(invalidSuffix) ? type : type + invalidSuffix);
      const validType = isNewFormat ? type : invalidType.replace(invalidSuffix, '');
      const queryTypes = isNewFormat ? [type] : [validType, invalidType];

      const rows = await controller.getRowsByTypes(app, queryTypes);
      if (!rows.length) {
        console.log(`[validate] ${app}+${type} — no records found`);
        return res.json({ data: 'No records found.' });
      }

      // Columns that need validation
      const validationCols = config.attributes.filter(
        col => ['multiselect', 'select', 'radio'].includes(col.type) || col.required === 'yes'
      );

      console.log(`[validate] ${app}+${type} checking ${rows.length} rows against ${validationCols.length} validation rules`);

      // Re-validate each row
      const rowsToUpdate = [];
      for (const row of rows) {
        const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        const wasValid = data.isValid;
        data.isValid = validationCols.reduce((acc, col) => {
          let value = data[col.name];
          // Multiselect stored as comma string → split to array
          if (col.type === 'multiselect' && value && typeof value === 'string') {
            value = value.split(',').map(v => v.trim());
          }
          return acc && validateValue(value, col);
        }, true);
        row._isValid = data.isValid;

        // For new format, track rows where isValid changed (need data update)
        if (isNewFormat && data.isValid !== wasValid) {
          rowsToUpdate.push({ id: row.id, data });
        }
      }

      if (isNewFormat) {
        // New format: update data.isValid flag only (no type changes)
        for (const { id, data } of rowsToUpdate) {
          await controller.setDataById(id, { isValid: data.isValid });
        }
        console.log(`[validate] ${app}+${type} complete — ${rowsToUpdate.length} rows updated (isValid flag)`);
        res.json({ data: `${rowsToUpdate.length} rows updated.` });
      } else {
        // Legacy format: move rows between valid/invalid types
        const validRowsInInvalidType = rows.filter(r => r._isValid && r.type === invalidType).map(r => r.id);
        const invalidRowsInValidType = rows.filter(r => !r._isValid && r.type === validType).map(r => r.id);

        if (validRowsInInvalidType.length) {
          await controller.batchUpdateType(app, invalidType, validType, validRowsInInvalidType);
        }
        if (invalidRowsInValidType.length) {
          await controller.batchUpdateType(app, validType, invalidType, invalidRowsInValidType);
        }

        const total = validRowsInInvalidType.length + invalidRowsInValidType.length;
        console.log(`[validate] ${app}+${type} complete — ${total} rows moved (${validRowsInInvalidType.length} invalid→valid, ${invalidRowsInValidType.length} valid→invalid)`);
        res.json({ data: `${total} rows updated.` });
      }
    } catch (e) {
      console.error(`[validate] ${app}+${type} FAILED:`, e.message);
      res.json({ err: e.message });
    }
  };
}

module.exports = { newContextId, upload, getLayers, createPublishHandler, createValidateHandler };
