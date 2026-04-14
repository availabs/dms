/**
 * GIS file processor — uses GDAL to read layer metadata from spatial files.
 * Only available when gdal-async is installed.
 */

const { gdalAvailable, getGdal } = require('../gdal');

const GIS_EXTENSIONS = ['.shp', '.gpkg', '.geojson', '.json', '.gdb'];

module.exports = {
  canHandle(ext) {
    return gdalAvailable && GIS_EXTENSIONS.includes(ext.toLowerCase());
  },

  /**
   * Analyze a GIS file and return layer metadata.
   * @param {string} filePath - Path to the GIS file
   * @returns {Array<Object>} Array of layer info objects
   */
  async analyze(filePath) {
    const gdal = getGdal();
    const dataset = await gdal.openAsync(filePath);
    const layers = [];

    for (let i = 0; i < dataset.layers.count(); i++) {
      const layer = dataset.layers.get(i);
      const fieldsMetadata = [];

      for (const fieldDefn of layer.fields) {
        fieldsMetadata.push({
          name: fieldDefn.name,
          display_name: fieldDefn.name,
          type: fieldDefn.type,
          width: fieldDefn.width,
          precision: fieldDefn.precision,
        });
      }

      let srsAuthorityName = null;
      let srsAuthorityCode = null;
      try {
        if (layer.srs) {
          srsAuthorityName = layer.srs.getAuthorityName(null);
          srsAuthorityCode = layer.srs.getAuthorityCode(null);
        }
      } catch (e) {
        // SRS may not be available for all layers
      }

      layers.push({
        layerName: layer.name,
        layerId: i,
        featuresCount: layer.features.count(),
        srsAuthorityName,
        srsAuthorityCode,
        fieldsMetadata,
      });
    }

    dataset.close();
    return layers;
  },
};
