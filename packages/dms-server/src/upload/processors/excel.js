/**
 * Excel processor — detects sheets and columns from .xlsx files.
 * Returns layer metadata compatible with DAMA response shape.
 */

const { snakeCase } = require('lodash');

const EXCEL_EXTENSIONS = ['.xlsx', '.xls'];

function canHandle(ext) {
  return EXCEL_EXTENSIONS.includes(ext.toLowerCase());
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
    const rows = await readXlsxFile(filePath, { sheet: sheetName });
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
  return readXlsxFile(filePath, { sheet: layerName });
}

module.exports = { canHandle, analyze, parseRows };
