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
 * Read the first non-empty line of a file in bounded chunks. A full
 * readFileSync dies past Node's max string length (~512 MB), so multi-GB
 * CSVs must never be materialized just to get at the header row.
 * @param {string} filePath
 * @param {number} [maxBytes] - give up if no newline within this many bytes
 * @returns {string} first non-empty line ('' if none found)
 */
function readFirstLine(filePath, maxBytes = 1024 * 1024) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const chunk = Buffer.alloc(64 * 1024);
    let acc = Buffer.alloc(0);
    let pos = 0;
    while (pos < maxBytes) {
      const n = fs.readSync(fd, chunk, 0, chunk.length, pos);
      if (n === 0) break;
      acc = Buffer.concat([acc, chunk.subarray(0, n)]);
      pos += n;
      let nl = acc.indexOf(0x0a);
      while (nl !== -1) {
        const line = acc.subarray(0, nl).toString('utf-8').replace(/\r$/, '');
        if (line.trim()) return line;
        acc = acc.subarray(nl + 1);
        nl = acc.indexOf(0x0a);
      }
    }
    const tail = acc.toString('utf-8').replace(/\r$/, '');
    return tail.trim() ? tail : '';
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Analyze a CSV file: read header row, return layer metadata.
 * @param {string} filePath - path to the CSV file
 * @returns {Array} [{layerName, fieldsMetadata}]
 */
function analyze(filePath) {
  const headerLine = readFirstLine(filePath);
  if (!headerLine) return [];

  const separator = detectSeparator(headerLine, filePath);
  const headers = parseCSVRow(headerLine, separator);

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

/**
 * Streaming async generator of row objects keyed by CSV header.
 * Uses Node's readline so memory stays bounded for large files.
 *
 * Note: does not handle literal newlines inside quoted CSV fields — fine
 * for tabular CSVs like HPMS/NPMRDS but a caveat for free-text exports.
 *
 * @param {string} filePath
 * @param {object} [options]
 * @param {number} [options.maxRows] - stop after N data rows
 * @yields {Object} row object keyed by CSV header names
 */
async function* parseRowObjectsStream(filePath, options = {}) {
  const { maxRows = Infinity } = options;
  const readline = require('readline');

  const readStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: readStream, crlfDelay: Infinity });

  let headers = null;
  let separator = ',';
  let count = 0;

  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      if (!headers) {
        separator = detectSeparator(line, filePath);
        headers = parseCSVRow(line, separator);
        continue;
      }
      if (count >= maxRows) break;
      const values = parseCSVRow(line, separator);
      const obj = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = values[j] === undefined ? null : values[j];
      }
      yield obj;
      count++;
    }
  } finally {
    rl.close();
    readStream.destroy();
  }
}

module.exports = { canHandle, analyze, parseRows, parseRowObjectsStream };
