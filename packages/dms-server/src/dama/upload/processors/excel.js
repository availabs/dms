/**
 * Excel processor — detects sheets and columns from .xlsx files.
 * Returns layer metadata compatible with DAMA response shape.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { snakeCase } = require('lodash');

const EXCEL_EXTENSIONS = ['.xlsx', '.xls'];

const INLINE_STR_ERROR = /Unsupported "inline string" cell value structure/;

function canHandle(ext) {
  return EXCEL_EXTENSIONS.includes(ext.toLowerCase());
}

// `read-excel-file@6.0.3` throws instead of returning `null` for a cell that's
// explicitly typed `t="inlineStr"` but has no `<is>` child — e.g. the non-top-left
// cells of a merged range, which OOXML leaves empty. Strip the type attribute from
// exactly those empty cells (leaving cells that do have `<is>` content untouched) so
// the cell falls back to the default numeric type with no `<v>`, which parses to `null`.
async function desanitizeInlineStrAndRetry(filePath, read) {
  const JSZip = require('jszip');

  const buffer = await fs.promises.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);

  const sheetPaths = Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  for (const sheetPath of sheetPaths) {
    const xml = await zip.file(sheetPath).async('string');
    const patched = xml.replace(
      /<c([^>]*?)\st="inlineStr"([^>]*?)(\/>|><\/c>)/g,
      (match, before, after) => `<c${before}${after}${match.endsWith('/>') ? '/>' : '></c>'}`
    );
    if (patched !== xml) {
      zip.file(sheetPath, patched);
    }
  }

  const sanitizedPath = path.join(os.tmpdir(), `dms-excel-sanitized-${Date.now()}-${path.basename(filePath)}`);
  const sanitizedBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.promises.writeFile(sanitizedPath, sanitizedBuffer);

  try {
    return await read(sanitizedPath);
  } finally {
    await fs.promises.unlink(sanitizedPath).catch(() => {});
  }
}

async function readXlsxWithInlineStrFallback(filePath, readOnce) {
  try {
    return await readOnce(filePath);
  } catch (err) {
    if (!INLINE_STR_ERROR.test(err.message)) throw err;
    return desanitizeInlineStrAndRetry(filePath, readOnce);
  }
}

/**
 * Analyze an Excel file: read sheet names, headers per sheet.
 * @param {string} filePath - path to the Excel file
 * @returns {Promise<Array>} [{layerName, fieldsMetadata}]
 */
async function analyze(filePath) {
  const readXlsxFile = require('read-excel-file/node');

  // Get all sheet names
  const sheets = await readXlsxFile.readSheetNames(filePath);

  const layers = [];
  for (const sheetName of sheets) {
    const rows = await readXlsxWithInlineStrFallback(filePath, (p) => readXlsxFile(p, { sheet: sheetName }));
    if (!rows.length) continue;

    // First row is headers
    const headers = rows[0];
    const fieldsMetadata = headers.map((header, i) => {
      const displayName = header != null ? String(header).trim() : `col_${i + 1}`;
      return {
        name: snakeCase(displayName) || `col_${i + 1}`,
        display_name: displayName,
      };
    });

    layers.push({
      layerName: sheetName,
      layerId: sheetName,
      fieldsMetadata,
    });
  }

  return layers;
}

/**
 * Parse all data rows from an Excel sheet.
 * Returns array of arrays (each inner array = one row's cell values).
 * First row (headers) is included — caller should skip it.
 * @param {string} filePath
 * @param {string} layerName - sheet name to read
 * @returns {Promise<Array<Array>>} rows including header row
 */
async function parseRows(filePath, layerName) {
  const readXlsxFile = require('read-excel-file/node');
  return readXlsxWithInlineStrFallback(filePath, (p) => readXlsxFile(p, { sheet: layerName }));
}

module.exports = { canHandle, analyze, parseRows };
