/**
 * Processor registry.
 * Each processor implements: { canHandle(ext), analyze(filePath) }
 * New file types are added by registering a new processor here.
 */

const csv = require('./csv');
const excel = require('./excel');

const processors = [csv, excel];

/**
 * Find the processor that can handle a given file extension.
 * @param {string} ext - file extension including dot (e.g. '.csv')
 * @returns {Object|null} processor with canHandle/analyze methods
 */
function getProcessor(ext) {
  return processors.find(p => p.canHandle(ext)) || null;
}

module.exports = { getProcessor, processors };
