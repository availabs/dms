/**
 * CSV processor — detects columns from CSV header row.
 * Returns layer metadata compatible with DAMA response shape.
 */

const fs = require('fs');
const path = require('path');
const { snakeCase } = require('lodash');

const CSV_EXTENSIONS = ['.csv', '.tsv'];

function canHandle(ext) {
  return CSV_EXTENSIONS.includes(ext.toLowerCase());
}

/**
 * Detect the delimiter used in a CSV header line.
 * Counts candidate delimiters outside quoted fields and picks the most frequent.
 */
function detectSeparator(headerLine, filePath) {
  if (filePath && filePath.endsWith('.tsv')) return '\t';
  const candidates = [',', '|', '\t', ';'];
  const counts = {};
  let inQuotes = false;
  for (let i = 0; i < headerLine.length; i++) {
    const ch = headerLine[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (!inQuotes && candidates.includes(ch)) {
      counts[ch] = (counts[ch] || 0) + 1;
    }
  }
  // Pick the delimiter with the most occurrences; fall back to comma
  let best = ',', bestCount = 0;
  for (const [ch, count] of Object.entries(counts)) {
    if (count > bestCount) { best = ch; bestCount = count; }
  }
  return best;
}

/**
 * Analyze a CSV file: read header row, return layer metadata.
 * @param {string} filePath - path to the CSV file
 * @returns {Array} [{layerName, fieldsMetadata}]
 */
function analyze(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];

  const separator = detectSeparator(lines[0], filePath);
  const headers = parseCSVRow(lines[0], separator);

  const fieldsMetadata = headers.map((header, i) => ({
    name: snakeCase(header) || `col_${i + 1}`,
    display_name: header.trim() || `col_${i + 1}`,
  }));

  const layerName = path.basename(filePath, path.extname(filePath));

  return [{
    layerName,
    layerId: layerName,
    fieldsMetadata,
  }];
}

/**
 * Simple CSV row parser that handles quoted fields.
 */
function parseCSVRow(line, separator = ',') {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === separator) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Parse all data rows from a CSV file.
 * Returns array of arrays (each inner array = one row's cell values).
 * First row (headers) is included — caller should skip it.
 * @param {string} filePath
 * @param {string} layerName - unused for CSV (single layer)
 * @returns {Array<Array>} rows including header row
 */
function parseRows(filePath, layerName) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  const separator = lines.length ? detectSeparator(lines[0], filePath) : ',';
  return lines.map(line => parseCSVRow(line, separator));
}

module.exports = { canHandle, analyze, parseRows };
