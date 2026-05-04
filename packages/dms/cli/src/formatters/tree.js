/**
 * Tree output formatter
 *
 * Renders hierarchical data with box-drawing characters.
 */

/**
 * Render a generic tree structure
 *
 * @param {Object[]} nodes - Array of root nodes
 * @param {Object} opts
 * @param {Function} opts.label - (node) => string label for this node
 * @param {Function} opts.children - (node) => child nodes array
 * @param {string} opts.indent - prefix for current level
 * @returns {string}
 */
export function formatTree(nodes, { label, children, indent = '' } = {}) {
  const lines = [];

  nodes.forEach((node, i) => {
    const isLast = i === nodes.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childIndent = isLast ? '    ' : '│   ';

    lines.push(indent + connector + label(node));

    const kids = children(node);
    if (kids && kids.length > 0) {
      lines.push(formatTree(kids, {
        label,
        children,
        indent: indent + childIndent,
      }));
    }
  });

  return lines.join('\n');
}

/**
 * Build a page tree from a flat list of pages
 *
 * Groups pages by parent field (null/empty = root), sorts by index.
 *
 * @param {Object[]} pages - Flat list of page objects with { id, data }
 * @returns {Object[]} - Nested tree: each node has { ...page, children: [] }
 */
export function buildPageTree(pages) {
  // Parse data if needed
  const parsed = pages.map(p => {
    const data = typeof p.data === 'string' ? JSON.parse(p.data) : (p.data || {});
    return { ...p, data, children: [] };
  });

  // Index by ID
  const byId = {};
  for (const p of parsed) {
    byId[p.id] = p;
  }

  const roots = [];

  for (const p of parsed) {
    const parentId = p.data.parent;
    if (parentId && byId[parentId]) {
      byId[parentId].children.push(p);
    } else {
      roots.push(p);
    }
  }

  // Sort children by index
  const sortByIndex = (arr) => {
    arr.sort((a, b) => (parseInt(a.data.index, 10) || 0) - (parseInt(b.data.index, 10) || 0));
    for (const item of arr) {
      if (item.children.length > 0) sortByIndex(item.children);
    }
  };

  sortByIndex(roots);

  return roots;
}

/**
 * Format a site tree: site → patterns → pages → sections
 *
 * @param {Object} siteData - { site, patterns, pages, sections }
 * @returns {string}
 */
export function formatSiteTree(siteData) {
  const { site, patterns = [] } = siteData;

  const siteData_ = typeof site.data === 'string' ? JSON.parse(site.data) : (site.data || {});
  const siteName = siteData_.site_name || siteData_.name || `Site ${site.id}`;

  const lines = [`Site: ${siteName} (id: ${site.id})`];

  if (patterns.length === 0) {
    lines.push('  (no patterns)');
    return lines.join('\n');
  }

  const rendered = formatPatternTree(patterns);
  lines.push(rendered);

  return lines.join('\n');
}

/**
 * Internal: render patterns with nested pages and sections
 */
function formatPatternTree(patterns) {
  const lines = [];

  patterns.forEach((pattern, i) => {
    const isLast = i === patterns.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childIndent = isLast ? '    ' : '│   ';

    const d = typeof pattern.data === 'string' ? JSON.parse(pattern.data) : (pattern.data || {});
    const name = d.name || `Pattern ${pattern.id}`;
    const type = d.pattern_type || '?';
    const baseUrl = d.base_url || '/';

    lines.push(connector + `Pattern: ${name} (${type}) base_url=${baseUrl}`);

    const pages = pattern._pages || [];
    if (pages.length > 0) {
      const pageTree = buildPageTree(pages);
      lines.push(renderPageNodes(pageTree, childIndent));
    }

    const datasets = pattern._datasets || [];
    if (datasets.length > 0) {
      lines.push(renderDatasetNodes(datasets, childIndent));
    }
  });

  return lines.join('\n');
}

/**
 * Internal: render page tree nodes with sections
 */
function renderPageNodes(nodes, indent) {
  const lines = [];

  nodes.forEach((page, i) => {
    const isLast = i === nodes.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childIndent = isLast ? '    ' : '│   ';

    const d = page.data || {};
    const title = d.title || d.url_slug || `Page ${page.id}`;
    const slug = d.url_slug ? `/${d.url_slug}` : '/';
    const status = d.published === 'published' ? '[published]' : '[draft]';

    lines.push(`${indent}${connector}Page: ${title} (${slug}) ${status} id=${page.id}`);

    // Sections
    const sections = page._sections || [];
    const hasChildren = page.children.length > 0 || sections.length > 0;

    if (sections.length > 0) {
      sections.forEach((section, si) => {
        const sIsLast = si === sections.length - 1 && page.children.length === 0;
        const sConnector = sIsLast ? '└── ' : '├── ';
        const sd = typeof section.data === 'string' ? JSON.parse(section.data) : (section.data || {});
        const sTitle = sd.title || `Section ${section.id}`;
        const sType = sd['element-type'] || sd.element_type || '?';
        lines.push(`${indent}${childIndent}${sConnector}Section: ${sTitle} (${sType}) id=${section.id}`);
      });
    }

    // Recurse into child pages
    if (page.children.length > 0) {
      lines.push(renderPageNodes(page.children, indent + childIndent));
    }
  });

  return lines.join('\n');
}

/**
 * Internal: render dataset source nodes
 */
function renderDatasetNodes(datasets, indent) {
  const lines = [];

  datasets.forEach((ds, i) => {
    const isLast = i === datasets.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const d = typeof ds.data === 'string' ? JSON.parse(ds.data) : (ds.data || {});
    const name = d.name || `Dataset ${ds.id}`;
    const docType = d.doc_type || '?';
    lines.push(`${indent}${connector}Source: ${name} (${docType}) id=${ds.id}`);
  });

  return lines.join('\n');
}

/**
 * Format a flat page list as a tree
 */
export function formatPageTree(pages) {
  const tree = buildPageTree(pages);
  return renderPageNodes(tree, '');
}

export default { formatTree, buildPageTree, formatSiteTree, formatPageTree };
