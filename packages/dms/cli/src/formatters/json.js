/**
 * JSON output formatter
 *
 * Handles pretty vs compact output based on TTY detection
 */

/**
 * Format data as JSON
 *
 * @param {*} data - Data to format
 * @param {Object} options - Formatting options
 * @param {boolean} options.pretty - Force pretty printing
 * @param {boolean} options.compact - Force compact output
 * @returns {string} - Formatted JSON string
 */
export function formatJson(data, options = {}) {
  const { pretty, compact } = options;

  // Determine if we should pretty print
  // Default: pretty if stdout is a TTY, compact if piped
  let shouldPretty = process.stdout.isTTY;

  if (pretty !== undefined) shouldPretty = pretty;
  if (compact !== undefined) shouldPretty = !compact;

  if (shouldPretty) {
    return JSON.stringify(data, null, 2);
  }

  return JSON.stringify(data);
}

export default formatJson;
