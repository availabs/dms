/**
 * GIS layer analysis worker.
 * Runs GDAL-based analysis on a specific layer and caches results to disk.
 */

const fs = require('fs');
const path = require('path');
const { analyzeLayer } = require('../analysis');
const store = require('../store');

module.exports = async function analysisWorker(ctx) {
  const { task, dispatchEvent, updateProgress } = ctx;
  const { fileId, layerName, filePath: explicitPath } = task.descriptor;

  // Resolve file path from store or descriptor
  const upload = store.get(fileId);
  const filePath = explicitPath || (upload && upload.dataFilePath);

  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Data file not found for upload ${fileId}`);
  }

  await updateProgress(0.1);
  await dispatchEvent('analysis:START', `Analyzing layer "${layerName}"`, null);

  const analysis = await analyzeLayer(filePath, layerName);

  await updateProgress(0.9);

  // Cache to disk
  const cacheDir = path.join(path.dirname(filePath), `layer_${layerName}`);
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, 'layer_analysis.json'), JSON.stringify(analysis, null, 2));

  await dispatchEvent('analysis:FINAL', 'Layer analysis complete', analysis);

  return analysis;
};
