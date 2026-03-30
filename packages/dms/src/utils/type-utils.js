/**
 * Type System Utilities — shared parsing/construction for the uniform type scheme.
 *
 * Type format: {parent}:{instance}|{rowKind}
 *
 * Separators:
 *   |  = hierarchy ("belongs to") — separates parent from the tail
 *   :  = instance name ("is named") — separates instance from kind
 *
 * The row kind is always the last token. Reading right-to-left:
 *   kind → instance (if : present) → parent (if | present)
 *
 * Examples:
 *   prod:site                         → parent: null,        instance: 'prod',            kind: 'site'
 *   catalyst:theme                    → parent: null,        instance: 'catalyst',        kind: 'theme'
 *   prod|test-meta-forms:pattern      → parent: 'prod',     instance: 'test-meta-forms', kind: 'pattern'
 *   test-meta-forms|page              → parent: 'test-meta-forms', instance: null,        kind: 'page'
 *   test-meta-forms|component         → parent: 'test-meta-forms', instance: null,        kind: 'component'
 *   prod|my-env:dmsenv                → parent: 'prod',     instance: 'my-env',          kind: 'dmsenv'
 *   my-env|adamtest1:source           → parent: 'my-env',   instance: 'adamtest1',       kind: 'source'
 *   adamtest1|v1:view                 → parent: 'adamtest1', instance: 'v1',             kind: 'view'
 *   adamtest1|v1:data                 → parent: 'adamtest1', instance: 'v1',             kind: 'data'
 */

/**
 * Parse any type string into its components.
 *
 * @param {string} type
 * @returns {{ parent: string|null, instance: string|null, kind: string, raw: string }}
 */
export function parseRowType(type) {
  if (!type || typeof type !== 'string') {
    return { parent: null, instance: null, kind: '', raw: type || '' };
  }

  let parent = null;
  let tail = type;

  // Split on last | to separate parent from tail
  const pipeIdx = type.lastIndexOf('|');
  if (pipeIdx !== -1) {
    parent = type.slice(0, pipeIdx);
    tail = type.slice(pipeIdx + 1);
  }

  // Split tail on : to separate instance from kind
  const colonIdx = tail.lastIndexOf(':');
  if (colonIdx !== -1) {
    return {
      parent,
      instance: tail.slice(0, colonIdx) || null,
      kind: tail.slice(colonIdx + 1),
      raw: type
    };
  }

  // No colon — entire tail is the kind
  return { parent, instance: null, kind: tail, raw: type };
}

/**
 * Build a type string from components.
 *
 * @param {{ parent?: string|null, instance?: string|null, kind: string }} parts
 * @returns {string}
 */
export function buildType({ parent, instance, kind }) {
  let tail = kind;
  if (instance) {
    tail = `${instance}:${kind}`;
  }
  if (parent) {
    return `${parent}|${tail}`;
  }
  return tail;
}

/**
 * Extract the row kind (last segment after final | and :).
 *
 * @param {string} type
 * @returns {string}
 */
export function getKind(type) {
  return parseRowType(type).kind;
}

/**
 * Extract the parent prefix (everything before the last |).
 *
 * @param {string} type
 * @returns {string|null}
 */
export function getParent(type) {
  return parseRowType(type).parent;
}

/**
 * Extract the instance name (between : and kind, or before : if no |).
 *
 * @param {string} type
 * @returns {string|null}
 */
export function getInstance(type) {
  return parseRowType(type).instance;
}

/**
 * Check if a type represents dataset row data (split table eligible).
 *
 * @param {string} type
 * @returns {boolean}
 */
export function isSplitType(type) {
  return typeof type === 'string' && type.endsWith(':data');
}

/**
 * Convert a human-readable name to a URL/identifier-safe slug.
 * Lowercase, spaces/hyphens → underscores, strip non-alphanumeric/underscore.
 *
 * @param {string} name
 * @returns {string}
 */
export function nameToSlug(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * Parse a data row type into source and view components for table routing.
 *
 * @param {string} type - e.g., 'adamtest1|v1:data'
 * @returns {{ source: string, view: string } | null} null if not a data type
 */
export function parseSplitDataType(type) {
  if (!isSplitType(type)) return null;
  const parsed = parseRowType(type);
  // source is the parent, view is the instance
  if (!parsed.parent || !parsed.instance) return null;
  return { source: parsed.parent, view: parsed.instance };
}
