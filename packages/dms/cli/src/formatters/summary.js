/**
 * Human-readable summary formatter
 */

/**
 * Format a single item as a summary line
 *
 * @param {Object} item - Item to summarize
 * @returns {string} - Summary line
 */
export function formatItemSummary(item) {
  const id = item.id || '?';
  const data = typeof item.data === 'string' ? JSON.parse(item.data) : (item.data || {});

  // Try to find a good title/name
  const title = data.title || data.name || data.site_name || data.url_slug || `Item ${id}`;

  // Try to find a type indicator
  const type = item.type || '';

  // Build summary
  let summary = `[${id}] ${title}`;

  if (type) {
    summary += ` (${type})`;
  }

  return summary;
}

/**
 * Format a list of items as summaries
 *
 * @param {Array} items - Items to summarize
 * @returns {string} - Formatted summary list
 */
export function formatListSummary(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return 'No items found.';
  }

  return items.map(formatItemSummary).join('\n');
}

/**
 * Format an item with its data fields
 *
 * @param {Object} item - Item to format
 * @returns {string} - Formatted item details
 */
export function formatItemDetails(item) {
  const id = item.id || '?';
  const type = item.type || 'unknown';
  const data = typeof item.data === 'string' ? JSON.parse(item.data) : (item.data || {});

  const lines = [
    `ID: ${id}`,
    `Type: ${type}`,
    `---`,
  ];

  // Add data fields
  for (const [key, value] of Object.entries(data)) {
    let displayValue = value;

    if (typeof value === 'object') {
      displayValue = JSON.stringify(value);
      if (displayValue.length > 60) {
        displayValue = displayValue.slice(0, 57) + '...';
      }
    } else if (typeof value === 'string' && value.length > 60) {
      displayValue = value.slice(0, 57) + '...';
    }

    lines.push(`${key}: ${displayValue}`);
  }

  return lines.join('\n');
}

export default { formatItemSummary, formatListSummary, formatItemDetails };
