/**
 * Type-resolution helpers for the CLI.
 *
 * Wraps the shared `utils/type-utils.js` (in the dms package source tree)
 * with CLI-specific composers that build the row-type strings the server
 * routes on. Every command that needs to assemble a type string should
 * use these helpers — never hand-concatenate `${app}+${type}|...`.
 *
 * The modern type scheme is `{parent}:{instance}|{rowKind}` end-to-end
 * (see `src/dms/CLAUDE.md`). There is no `doc_type` field and no UUID
 * prefix; the slug ("instance") lives in the row's `type` column and is
 * extracted with `getInstance()`.
 */

import {
  getInstance,
  parseRowType,
  buildType,
  nameToSlug,
} from '../../../src/utils/type-utils.js';

/**
 * Normalize a user-supplied site identifier into a full site type.
 *
 *   'nhomb'       → 'nhomb:site'
 *   'nhomb:site'  → 'nhomb:site'   (passes through)
 *
 * The CLI accepts either form on the command line / .dmsrc / env vars
 * because typing the `:site` suffix every time is annoying.
 */
export function siteTypeFor(typeOrInstance) {
  if (!typeOrInstance) return '';
  return typeOrInstance.includes(':') ? typeOrInstance : `${typeOrInstance}:site`;
}

/**
 * Extract the bare instance name from either form.
 *
 *   'nhomb'       → 'nhomb'
 *   'nhomb:site'  → 'nhomb'
 */
export function siteInstance(typeOrInstance) {
  if (!typeOrInstance) return null;
  if (typeOrInstance.includes(':')) return getInstance(typeOrInstance);
  return typeOrInstance;
}

/** Pattern instance — the slug between `|` and `:pattern` in `nhomb|datasets:pattern`. */
export function patternInstance(patternRow) {
  return getInstance(patternRow?.type);
}

/** Type string for pages of this pattern: `{patternInstance}|page`. */
export function pageTypeFor(patternRow) {
  const inst = patternInstance(patternRow);
  if (!inst) throw new Error(`Pattern row has no instance in its type: ${patternRow?.type}`);
  return `${inst}|page`;
}

/** Type string for sections of this pattern: `{patternInstance}|component`. */
export function componentTypeFor(patternRow) {
  const inst = patternInstance(patternRow);
  if (!inst) throw new Error(`Pattern row has no instance in its type: ${patternRow?.type}`);
  return `${inst}|component`;
}

/** Source instance — the slug between `|` and `:source` in `alex_data_env|songs:source`. */
export function sourceInstance(sourceRow) {
  return getInstance(sourceRow?.type);
}

/** dmsEnv instance — the slug between `|` and `:dmsenv` in `nhomb|alex_data_env:dmsenv`. */
export function dmsEnvInstance(dmsEnvRow) {
  return getInstance(dmsEnvRow?.type);
}

/**
 * Type string for data rows of a given source view: `{sourceInstance}|{viewId}:data`.
 * The `:data` suffix is what triggers split-table routing on the server.
 */
export function viewDataTypeFor(sourceRow, viewId) {
  const inst = sourceInstance(sourceRow);
  if (!inst) throw new Error(`Source row has no instance in its type: ${sourceRow?.type}`);
  if (!viewId) throw new Error('viewDataTypeFor requires a viewId');
  return `${inst}|${viewId}:data`;
}

export { getInstance, parseRowType, buildType, nameToSlug };
