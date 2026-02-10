/**
 * Output utilities
 *
 * Handles writing to stdout or file, with format selection
 */

import { writeFileSync } from 'fs';
import { formatJson } from '../formatters/json.js';
import { formatListSummary, formatItemDetails } from '../formatters/summary.js';
import { formatSiteTree, formatPageTree } from '../formatters/tree.js';

/**
 * Output data in the specified format
 *
 * @param {*} data - Data to output
 * @param {Object} options - Output options
 * @param {string} options.format - Output format: 'json' (default), 'summary'
 * @param {string} options.output - File path to write to (optional)
 * @param {boolean} options.pretty - Force pretty printing
 * @param {boolean} options.compact - Force compact output
 * @param {string} options.mode - 'list' or 'item' for summary formatting
 */
export function output(data, options = {}) {
  const { format = 'json', output: outputPath, mode = 'item' } = options;

  let formatted;

  switch (format) {
    case 'summary':
      if (mode === 'list' || Array.isArray(data)) {
        formatted = formatListSummary(Array.isArray(data) ? data : [data]);
      } else {
        formatted = formatItemDetails(data);
      }
      break;

    case 'tree':
      if (data.site && data.patterns) {
        formatted = formatSiteTree(data);
      } else if (Array.isArray(data)) {
        formatted = formatPageTree(data);
      } else if (data.items && Array.isArray(data.items)) {
        formatted = formatPageTree(data.items);
      } else {
        formatted = formatJson(data, options);
      }
      break;

    case 'json':
    default:
      formatted = formatJson(data, options);
      break;
  }

  if (outputPath) {
    writeFileSync(outputPath, formatted + '\n', 'utf-8');
    console.error(`Written to ${outputPath}`);
  } else {
    console.log(formatted);
  }
}

/**
 * Output an error message
 *
 * @param {Error|string} error - Error to display
 */
export function outputError(error) {
  const message = error instanceof Error ? error.message : error;
  console.error(`Error: ${message}`);
  process.exit(1);
}

export default { output, outputError };
