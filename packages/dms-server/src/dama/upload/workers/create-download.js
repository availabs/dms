/**
 * Download creation worker.
 * Exports GIS view data to downloadable files (CSV, Shapefile, GeoJSON, GPKG)
 * via ogr2ogr, then stores results via the storage service.
 *
 * Descriptor (all optional unless noted):
 *   source_id, view_id     — required; the view supplies the relation and the default file name
 *   fileTypes              — required; keys of OUTPUT_TYPES
 *   columns                — required; ogr2ogr `-select` list
 *   groupedByColumn        — one file per distinct value, zipped together
 *   where                  — SQL boolean expression, passed to ogr2ogr as `-where`. THE EXPORT
 *                            SUBSET. Callers compose it; this worker validates it against the
 *                            relation and then hands it to ogr2ogr verbatim.
 *   downloadKey            — the key this run is filed under in `views.metadata.download`.
 *                            Defaults to the fileType, which is only correct when a view has
 *                            exactly one possible export. A caller that exports subsets must
 *                            send a key derived from the subset (a content hash), or every
 *                            subset overwrites the last one.
 *   fileNameBase           — override the composed file name. A filtered export needs it: the
 *                            default name describes the VIEW, so two different subsets of one
 *                            view otherwise collide on one file name.
 *   extraFiles             — `[{ name, content }]`, written into the zip ALONGSIDE the export.
 *                            A download detaches data from everything the dataset knows about
 *                            itself, so any datatype that carries caveats (a coverage era, a
 *                            reference window, a column that must not be trended) needs a way to
 *                            ship a README/manifest with the file. `name` is a bare file name —
 *                            no directories, no traversal — and `content` a non-empty string.
 *                            Each entry is verified present in the finished archive; a manifest
 *                            that silently failed to make it in is the same defect as an export
 *                            that silently came back unfiltered.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const storage = require('../../storage');
const { loadConfig } = require('../../../db');

const OUTPUT_TYPES = {
  CSV: { ogr: 'CSV', ext: 'csv' },
  'ESRI Shapefile': { ogr: 'ESRI Shapefile', ext: '' },
  GeoJSON: { ogr: 'GeoJSON', ext: 'geojson' },
  GPKG: { ogr: 'GPKG', ext: 'gpkg' },
};

module.exports = async function createDownloadWorker(ctx) {
  const { task, pgEnv, db, dispatchEvent, updateProgress } = ctx;
  const {
    source_id, view_id, fileTypes, columns,
    groupedByColumn, user_id,
    where, downloadKey, fileNameBase: fileNameBaseOverride, extraFiles,
  } = task.descriptor;

  if (db.type !== 'postgres') {
    throw new Error('Download creation requires a PostgreSQL database');
  }

  await dispatchEvent('create-download:INITIAL', 'Download creation started', null);

  // Fetch view info
  const { rows: viewRows } = await db.query(`
    SELECT a.name AS source_name, b.version, b.data_table, b.table_schema, b.table_name
    FROM data_manager.sources AS a
    INNER JOIN data_manager.views AS b USING (source_id)
    WHERE b.view_id = $1
  `, [view_id]);

  if (!viewRows[0]) throw new Error(`View ${view_id} not found`);
  const { source_name, version, data_table, table_schema, table_name } = viewRows[0];

  const config = loadConfig(pgEnv);
  const connStr = `host=${config.host} port=${config.port} dbname=${config.database} user=${config.user} password=${config.password}`;

  // The relation ogr2ogr reads. It is NOT necessarily a table — pm3's published relation is a
  // VIEW over a metrics table joined to geometry — so nothing here may assume a table, a primary
  // key, or that `table_name` is where the rows live.
  const dataSource = data_table || `${table_schema}.${table_name}`;

  // Fail loudly on a bad `where` BEFORE anything is created or spawned. ogr2ogr pushes `-where`
  // down to Postgres verbatim, and `-skipfailures` (below) swallows the resulting error: a clause
  // naming a column that isn't there, or comparing text to an unquoted number, exits 0 and leaves
  // a header-only file. Measured on pm3 view 3740: `-where '"region_code" IN (8)'` → exit 0,
  // 1-line CSV, no warning anywhere. One round trip is worth not shipping that as a download.
  if (where) {
    try {
      await db.query(`SELECT 1 FROM ${dataSource} WHERE ${where} LIMIT 1`);
    } catch (err) {
      throw new Error(`create-download: invalid \`where\` for view ${view_id}: ${err.message}`);
    }
  }

  // Sanitize the WHOLE composed name — not just source_name's slashes. The view `version`
  // can carry a date like "02/27/2026"; its `/` makes ogr2ogr try to mkdir nested directories
  // (".../02/27/2026.esri shapefile") and fail. Spaces are also awkward in shapefile paths.
  // Collapse any run of unsafe chars to a single underscore.
  const fileNameBase = sanitizeFileName(
    fileNameBaseOverride
      || `${source_name || 'export'}_s${source_id}_v${view_id}${version ? '_' + version : ''}`
  );
  const outputDir = `${pgEnv}/s_${source_id}`;
  const tempDir = path.join(os.tmpdir(), `dms-download-${randomUUID()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const downloadMeta = {};
  const totalTypes = fileTypes.length;
  let completed = 0;

  try {
    // Written ONCE, into their own subdirectory, then added to every fileType's archive. The
    // subdirectory matters twice: `_extras/README.txt` cannot collide with `<fileNameBase>.csv`
    // in the temp root, and it cannot end up inside the shapefile DIRECTORY datastore (which
    // ogr2ogr creates as a directory and `runZip` zips whole). `-j` flattens the path back out,
    // so the manifest still lands at the root of the zip. Inside the try so a rejected
    // `extraFiles` still cleans the temp dir up.
    const extraFilePaths = writeExtraFiles(tempDir, extraFiles);

    for (const fileType of fileTypes) {
      const typeInfo = OUTPUT_TYPES[fileType];
      if (!typeInfo) {
        await dispatchEvent('create-download:WARN', `Unknown file type: ${fileType}`, null);
        continue;
      }

      await dispatchEvent('create-download:PROGRESS', `Creating ${fileType}...`, { fileType });

      const selectCols = columns.join(',');
      const metaKey = downloadKeyFor(downloadKey, fileType, totalTypes);

      if (groupedByColumn) {
        // Grouped: one file per distinct value
        const { rows: distinctRows } = await db.query(
          `SELECT DISTINCT "${groupedByColumn}" AS val FROM ${dataSource}`
          + `${where ? ` WHERE ${where}` : ''} ORDER BY 1`
        );

        const groupDir = path.join(tempDir, `${fileNameBase}_${fileType}`);
        fs.mkdirSync(groupDir, { recursive: true });

        for (const row of distinctRows) {
          const val = row.val || 'null';
          const safeVal = String(val).replace(/[^a-zA-Z0-9_-]/g, '_');
          const groupFile = path.join(groupDir, typeInfo.ext ? `${safeVal}.${typeInfo.ext}` : safeVal);
          // `-where` and `-sql` are mutually exclusive in ogr2ogr, so the grouped path folds the
          // caller's clause into the statement instead of passing it as an argument.
          const sql = `SELECT ${selectCols} FROM ${dataSource} WHERE "${groupedByColumn}" = '${val}'`
            + `${where ? ` AND (${where})` : ''}`;

          await runOgr2ogr({ format: typeInfo.ogr, outputFile: groupFile, connStr, sql });
        }

        // Zip the group directory
        const zipName = `${fileNameBase}_${fileType}.zip`;
        const zipPath = path.join(tempDir, zipName);
        await runZip(zipPath, [groupDir, ...extraFilePaths], extraFiles);

        const relativePath = `${outputDir}/${zipName}`;
        await storage.write(relativePath, fs.createReadStream(zipPath));
        downloadMeta[metaKey] = storage.getUrl(relativePath);
      } else {
        // Single output. Shapefile has ext '' → use the bare name so ogr2ogr creates a
        // directory datastore (.shp + .shx/.dbf/.prj inside), which runZip then zips;
        // appending ".esri shapefile" (the old `|| fileType.toLowerCase()` fallback) is wrong.
        const outFile = path.join(tempDir, typeInfo.ext ? `${fileNameBase}.${typeInfo.ext}` : fileNameBase);
        await runOgr2ogr({
          format: typeInfo.ogr, outputFile: outFile, connStr, dataSource, selectCols, where,
        });

        // Zip the output
        const zipName = `${fileNameBase}_${fileType}.zip`;
        const zipPath = path.join(tempDir, zipName);
        await runZip(zipPath, [outFile, ...extraFilePaths], extraFiles);

        const relativePath = `${outputDir}/${zipName}`;
        await storage.write(relativePath, fs.createReadStream(zipPath));
        downloadMeta[metaKey] = storage.getUrl(relativePath);
      }

      completed++;
      await updateProgress(completed / totalTypes * 0.9);
    }

    // MERGE into metadata.download, never replace it. `metadata || {download: …}` is a
    // shallow merge, so it replaced the whole `download` object with just this run's keys and
    // every previously generated file became unreachable while still sitting on disk — which
    // also emptied the cache the client's "already built, just take it" path consults.
    const viewTable = 'data_manager.views';
    await db.query(`
      UPDATE ${viewTable}
      SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{download}',
        COALESCE(metadata -> 'download', '{}'::jsonb) || $1::jsonb,
        true
      )
      WHERE view_id = $2
    `, [JSON.stringify(downloadMeta), view_id]);

    await updateProgress(1);
    await dispatchEvent('create-download:FINAL', 'Downloads created', downloadMeta);

    return { download: downloadMeta, source_id, view_id };
  } finally {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

/**
 * The whole composed file name, made safe for a path component (and for a shapefile
 * directory datastore, where the name becomes a directory).
 */
function sanitizeFileName(name) {
  return String(name)
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    // ext + "_ESRI_Shapefile.zip" is appended to this, and some filesystems cap a name at 255.
    .slice(0, 160)
    .replace(/_+$/g, '');
}

/**
 * The key a run is filed under in `views.metadata.download`.
 *
 * Default (no `downloadKey`) is the fileType — the historical behaviour, correct only when a
 * view has exactly one possible export. With a `downloadKey` the caller owns the key, so a
 * content-addressed export can be found again; when several fileTypes share one run the
 * fileType is appended, because one run then produces several distinct files.
 */
function downloadKeyFor(downloadKey, fileType, totalTypes) {
  if (!downloadKey) return fileType;
  return totalTypes > 1 ? `${downloadKey}_${fileType}` : String(downloadKey);
}

function runOgr2ogr({ format, outputFile, connStr, dataSource, sql, selectCols, where }) {
  const args = [
    '-f', format,
    '-t_srs', 'EPSG:4326',
    '-skipfailures',
  ];

  if (sql) {
    args.push('-sql', sql);
  } else {
    // `-where` only applies to a layer read, so it belongs to the `-select` branch. The `-sql`
    // branch folds the clause into the statement at the call site instead.
    if (where) args.push('-where', where);
    if (selectCols) args.push('-select', selectCols);
  }

  args.push(outputFile, `PG:${connStr}`);

  if (dataSource && !sql) {
    args.push(dataSource);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('ogr2ogr', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code !== 0) reject(new Error(`ogr2ogr exited with code ${code}: ${stderr.slice(0, 500)}`));
      else resolve();
    });
    proc.on('error', err => reject(new Error(`ogr2ogr failed: ${err.message}`)));
  });
}

/**
 * `extraFiles: [{ name, content }]` → files on disk, returned as absolute paths.
 *
 * Everything here throws rather than skipping. An export whose manifest quietly went missing is
 * the same class of defect as an export that quietly came back unfiltered: the download still
 * arrives, and nothing tells anyone the caveats were dropped.
 */
function writeExtraFiles(tempDir, extraFiles) {
  if (extraFiles === undefined || extraFiles === null) return [];
  if (!Array.isArray(extraFiles)) {
    throw new Error('create-download: `extraFiles` must be an array of { name, content }');
  }
  if (!extraFiles.length) return [];

  const dir = path.join(tempDir, '_extras');
  fs.mkdirSync(dir, { recursive: true });

  const seen = new Set();
  return extraFiles.map((entry, i) => {
    const name = entry && entry.name;
    // A bare file name only. `content` is caller-supplied text, and `name` decides where it
    // lands, so "../../etc/whatever" must not be writable through a task descriptor.
    if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes('..')) {
      throw new Error(
        `create-download: extraFiles[${i}].name must be a bare file name `
        + `matching /^[A-Za-z0-9][A-Za-z0-9._-]*$/ (got ${JSON.stringify(name)})`
      );
    }
    if (seen.has(name)) {
      throw new Error(`create-download: extraFiles has two entries named "${name}"`);
    }
    seen.add(name);
    const content = entry.content;
    if (typeof content !== 'string' || content.length === 0) {
      // An empty manifest is a builder that returned "" — which is exactly the failure this
      // whole capability exists to make visible.
      throw new Error(`create-download: extraFiles[${i}] ("${name}") has no string content`);
    }
    const full = path.join(dir, name);
    fs.writeFileSync(full, content, 'utf8');
    return full;
  });
}

/**
 * Zip one or more paths into `zipPath`, flattening directory structure (`-j`).
 *
 * Multi-input because `extraFiles` has to travel INSIDE the same archive as the export — a
 * sibling zip would be a second download, and a second download is a caveat nobody opens.
 *
 * `expectedEntries` is checked against zip's own "adding: <name>" output. zip's exit code covers
 * a missing input path, but not the more interesting case where a name was added under something
 * other than what the caller asked for; and this file's history is a run of failures that exited
 * 0 (ogr2ogr `-where` on a bad column, `-select` on an unknown field, the ".esri shapefile"
 * extension). Verifying rather than assuming costs nothing here.
 */
function runZip(zipPath, inputPaths, expectedEntries) {
  const inputs = Array.isArray(inputPaths) ? inputPaths : [inputPaths];
  if (!inputs.length) throw new Error('runZip: nothing to zip');
  // `-r` recurses into a directory input (the shapefile datastore, the grouped-export folder);
  // it is inert on a plain file, so it is safe to pass whenever any input is a directory.
  const recurse = inputs.some((p) => fs.statSync(p).isDirectory());
  const args = [recurse ? '-rj' : '-j', zipPath, ...inputs];

  return new Promise((resolve, reject) => {
    const proc = spawn('zip', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(`zip exited with code ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      const missing = (expectedEntries || [])
        .map((e) => e && e.name)
        .filter((name) => name && !stdout.includes(name));
      if (missing.length) {
        reject(new Error(
          `create-download: ${missing.join(', ')} did not make it into ${path.basename(zipPath)} `
          + `(zip said: ${stdout.slice(0, 300)})`
        ));
        return;
      }
      resolve();
    });
    proc.on('error', err => reject(new Error(`zip failed: ${err.message}`)));
  });
}

// Exported for tests — each encodes a contract a caller depends on. `writeExtraFiles`/`runZip`
// touch the filesystem, but they are the only way to assert that a manifest actually reaches the
// archive without standing up Postgres and ogr2ogr.
module.exports.sanitizeFileName = sanitizeFileName;
module.exports.downloadKeyFor = downloadKeyFor;
module.exports.writeExtraFiles = writeExtraFiles;
module.exports.runZip = runZip;
