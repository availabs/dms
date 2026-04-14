/**
 * Sharp availability detection.
 * sharp is an optional dependency — image processing is disabled without it.
 */

let _sharp = null;
let sharpAvailable = false;

try {
  _sharp = require('sharp');
  sharpAvailable = true;
} catch (e) {
  // sharp not installed — image processing will be unavailable
}

function getSharp() {
  if (!_sharp) {
    throw new Error('Image processing requires sharp. Install it with: npm install sharp');
  }
  return _sharp;
}

module.exports = { sharpAvailable, getSharp };
