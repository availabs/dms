/**
 * Layer analysis and table descriptor generation.
 * Analyzes a GIS/CSV layer to infer PostgreSQL column types.
 */

const { gdalAvailable, getGdal } = require('./gdal');

// OGR field type → PostgreSQL type
const TYPE_MAP = {
  'integer': 'BIGINT',
  'integer64': 'BIGINT',
  'real': 'NUMERIC',
  'string': 'TEXT',
  'date': 'DATE',
  'time': 'TIME',
  'datetime': 'TIMESTAMP',
  'binary': 'BYTEA',
};

/**
 * Analyze a specific layer's field types and geometry.
 * @param {string} filePath - Path to the data file
 * @param {string} layerName - Name of the layer to analyze
 * @returns {Object} Analysis result with schemaAnalysis array
 */
async function analyzeLayer(filePath, layerName) {
  if (!gdalAvailable) {
    throw new Error('Layer analysis requires GDAL (gdal-async)');
  }

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
      // gdal geomType is a numeric constant — map to string
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
    layerFieldsAnalysis: {
      objectsCount: featuresCount,
      schemaAnalysis,
    },
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
