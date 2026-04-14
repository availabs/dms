/**
 * GDAL availability detection.
 * gdal-async is an optional dependency — GIS features are disabled without it.
 */

let _gdal = null;
let gdalAvailable = false;

try {
  _gdal = require('gdal-async');
  gdalAvailable = true;
} catch (e) {
  // gdal-async not installed — GIS features will be unavailable
}

function getGdal() {
  if (!_gdal) {
    throw new Error('GIS processing requires gdal-async. Install it with: npm install gdal-async');
  }
  return _gdal;
}

module.exports = { gdalAvailable, getGdal };
