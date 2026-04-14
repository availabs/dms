/**
 * Upload worker registration.
 * Conditionally registers task handlers based on available dependencies.
 */

const { registerHandler } = require('../../tasks');
const { gdalAvailable } = require('../gdal');

function registerUploadWorkers() {
  const registered = [];

  if (gdalAvailable) {
    registerHandler('gis/analysis', require('./analysis'));
    registerHandler('gis/publish', require('./gis-publish'));
    registerHandler('gis/create-download', require('./create-download'));
    registered.push('gis/analysis', 'gis/publish', 'gis/create-download');
  }

  // CSV publish only needs pg, not GDAL
  try {
    require('pg');
    require('pg-copy-streams');
    registerHandler('csv/publish', require('./csv-publish'));
    registered.push('csv/publish');
  } catch (e) {
    // pg or pg-copy-streams not installed
  }

  if (registered.length) {
    console.log(`[upload] Registered workers: ${registered.join(', ')}`);
  }
}

module.exports = { registerUploadWorkers };
