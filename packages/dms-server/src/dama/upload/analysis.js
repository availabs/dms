/**
 * Layer analysis and table descriptor generation.
 * Analyzes a GIS/CSV layer to infer PostgreSQL column types.
 *
 * For GIS files: uses gdal-async to read field types directly.
 * For CSV files: uses ogrinfo with AUTODETECT_TYPE for type inference.
 * Falls back to TEXT for all columns if GDAL is not available.
 */

const { execFileSync } = require('child_process');
const { gdalAvailable, getGdal } = require('./gdal');

// OGR field type → PostgreSQL type
const TYPE_MAP = {
  'integer': 'INTEGER',
  'integer64': 'BIGINT',
  'real': 'DOUBLE PRECISION',
  'string': 'TEXT',
  'date': 'DATE',
  'time': 'TIME',
  'datetime': 'TIMESTAMP',
  'binary': 'BYTEA',
};

/**
 * Check if ogrinfo is available on the system PATH.
 */
let _ogrInfoAvailable = null;
function ogrInfoAvailable() {
  if (_ogrInfoAvailable !== null) return _ogrInfoAvailable;
  try {
    execFileSync('ogrinfo', ['--version'], { stdio: 'ignore' });
    _ogrInfoAvailable = true;
  } catch {
    _ogrInfoAvailable = false;
  }
  return _ogrInfoAvailable;
}

/**
 * Analyze a specific layer's field types and geometry.
 * Uses gdal-async for GIS files, ogrinfo for CSV/tabular files.
 * @param {string} filePath - Path to the data file
 * @param {string} layerName - Name of the layer to analyze
 * @returns {Object} Analysis result with schemaAnalysis array
 */
async function analyzeLayer(filePath, layerName) {
  const ext = require('path').extname(filePath).toLowerCase();
  const isTabular = ['.csv', '.tsv'].includes(ext);

  // For CSV: prefer ogrinfo with autodetect (works without gdal-async module)
  if (isTabular && ogrInfoAvailable()) {
    return analyzeWithOgrinfo(filePath, layerName);
  }

  // For GIS files: use gdal-async
  if (gdalAvailable) {
    return analyzeWithGdal(filePath, layerName);
  }

  // If ogrinfo is available for any file type, use it
  if (ogrInfoAvailable()) {
    return analyzeWithOgrinfo(filePath, layerName);
  }

  throw new Error('Layer analysis requires GDAL (gdal-async or ogrinfo on PATH)');
}

/**
 * Analyze using gdal-async (Node bindings) — fast for GIS files.
 */
async function analyzeWithGdal(filePath, layerName) {
  const gdal = getGdal();
  const dataset = await gdal.openAsync(filePath);
  const layer = dataset.layers.get(layerName);

  if (!layer) {
    dataset.close();
    throw new Error(`Layer "${layerName}" not found in dataset`);
  }

  const featuresCount = layer.features.count();

  const schemaAnalysis = [];
  for (const fieldDefn of layer.fields) {
    const rawType = (fieldDefn.type || '').toLowerCase();
    schemaAnalysis.push({
      key: fieldDefn.name,
      summary: {
        db_type: TYPE_MAP[rawType] || 'TEXT',
        nonnull: 0,
        null: 0,
      },
    });
  }

  // Detect geometry type
  let geometryType = null;
  try {
    const geomField = layer.geomType;
    if (geomField) {
      const geomNames = {
        1: 'Point', 2: 'LineString', 3: 'Polygon',
        4: 'MultiPoint', 5: 'MultiLineString', 6: 'MultiPolygon',
        7: 'GeometryCollection',
      };
      geometryType = geomNames[geomField] || null;
    }
  } catch (e) {
    // No geometry
  }

  dataset.close();

  return {
    GEODATASET_ANALYSIS_VERSION: '0.0.2',
    layerFieldsAnalysis: { objectsCount: featuresCount, schemaAnalysis },
    layerGeometriesAnalysis: geometryType ? { type: geometryType } : {},
  };
}

/**
 * Analyze using ogrinfo CLI — works for CSV, Excel, and all OGR-supported formats.
 * Uses AUTODETECT_TYPE=YES with AUTODETECT_SIZE_LIMIT=0 (scan entire file).
 */
function analyzeWithOgrinfo(filePath, layerName) {
  const args = [
    '-oo', 'AUTODETECT_TYPE=YES',
    '-oo', 'AUTODETECT_SIZE_LIMIT=0',
    '-so', '-ro', '-al',
    filePath,
  ];

  let stdout;
  try {
    stdout = execFileSync('ogrinfo', args, {
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf8',
    });
  } catch (err) {
    throw new Error(`ogrinfo failed: ${err.stderr?.slice(0, 500) || err.message}`);
  }

  // Parse ogrinfo output:
  //   Layer name: layerName
  //   Feature Count: 1234
  //   Geometry: Point / None
  //   fieldName: String (0.0)
  //   fieldName: Integer (0.0)
  //   fieldName: Real (24.15)
  const lines = stdout.split('\n');
  const schemaAnalysis = [];
  let featuresCount = 0;
  let geometryType = null;

  for (const line of lines) {
    const trimmed = line.trim();

    const countMatch = trimmed.match(/^Feature Count:\s*(\d+)/i);
    if (countMatch) {
      featuresCount = parseInt(countMatch[1], 10);
      continue;
    }

    const geomMatch = trimmed.match(/^Geometry:\s*(.+)/i);
    if (geomMatch) {
      const geom = geomMatch[1].trim();
      if (geom !== 'None' && geom !== 'Unknown') {
        geometryType = geom;
      }
      continue;
    }

    // Field line: "fieldName: TypeName (width.precision)"
    const fieldMatch = trimmed.match(/^(\S.+?):\s+(Integer64|Integer|Real|String|Date|Time|DateTime|Binary)\b/i);
    if (fieldMatch) {
      const fieldName = fieldMatch[1].trim();
      const ogrType = fieldMatch[2].toLowerCase();
      schemaAnalysis.push({
        key: fieldName,
        summary: {
          db_type: TYPE_MAP[ogrType] || 'TEXT',
          nonnull: 0,
          null: 0,
        },
      });
    }
  }

  return {
    GEODATASET_ANALYSIS_VERSION: '0.0.2',
    layerFieldsAnalysis: { objectsCount: featuresCount, schemaAnalysis },
    layerGeometriesAnalysis: geometryType ? { type: geometryType } : {},
  };
}

/**
 * Generate a table descriptor from layer metadata and analysis.
 * Maps field names to snake_case PG column names.
 * @param {Object} layerMetadata - From processor.analyze()
 * @param {Object} layerAnalysis - From analyzeLayer()
 * @returns {Object} Table descriptor with columnTypes array
 */
function generateTableDescriptor(layerMetadata, layerAnalysis) {
  const { layerName, fieldsMetadata } = layerMetadata;
  const { layerFieldsAnalysis, layerGeometriesAnalysis } = layerAnalysis;
  const schemaMap = {};

  if (layerFieldsAnalysis?.schemaAnalysis) {
    for (const field of layerFieldsAnalysis.schemaAnalysis) {
      schemaMap[field.key] = field.summary.db_type;
    }
  }

  // Build column types with deduplication
  const seen = {};
  const columnTypes = [];

  for (const field of (fieldsMetadata || [])) {
    let col = toSnakeCase(field.name);
    // Deduplicate column names
    if (seen[col]) {
      let suffix = 1;
      while (seen[`${col}_${suffix}`]) suffix++;
      col = `${col}_${suffix}`;
    }
    seen[col] = true;

    columnTypes.push({
      key: field.name,
      col,
      db_type: schemaMap[field.name] || 'TEXT',
    });
  }

  const geometryType = layerGeometriesAnalysis?.type || null;
  const needsPromoteToMulti = geometryType && !geometryType.startsWith('Multi');

  return {
    layerName,
    tableSchema: 'gis_datasets',
    tableName: toSnakeCase(layerName),
    columnTypes,
    postGisGeometryType: geometryType,
    promoteToMulti: needsPromoteToMulti,
    forcePostGisDimension: false,
  };
}

function toSnakeCase(str) {
  return str
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

module.exports = { analyzeLayer, generateTableDescriptor, toSnakeCase };
