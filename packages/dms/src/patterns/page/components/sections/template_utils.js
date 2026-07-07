/**
 * Component Template utilities — "copy/paste from the DB".
 *
 * Pure transforms (no React, no Falcor) for saving a configured section as a
 * reusable Template row and applying one back onto a section. Kept in a `.js`
 * sibling so TemplateManager.jsx stays a Fast-Refresh-clean component-only file.
 *
 * A template is an ordinary `data_items` row under a pattern-scoped type:
 *   app  = <site app>            (same app as every other item in the site)
 *   type = `${pattern}|${componentTypeSlug}_template`   e.g. my_docs|spreadsheet_template
 *
 * The template NAME is a data attribute (not encoded in the type) so "list all
 * templates for this component type" is a single exact-type query — mirroring
 * how every page shares `${pattern}|page` and is distinguished by data.
 */

import { nameToSlug } from '../../../../utils/type-utils';
import { RUNTIME_FIELDS, RUNTIME_DISPLAY_FIELDS } from './components/dataWrapper/schema';

// Section keys that are identity/content plumbing, never part of a saved layout.
const LAYOUT_OMIT = ['id', 'ref', 'element', '_appliedTemplate'];

/**
 * Build the pattern-scoped template type for a component.
 * @param {{ pattern: string, componentType: string }} args
 * @returns {string} e.g. `my_docs|spreadsheet_template`
 */
export function buildTemplateType({ pattern, componentType }) {
  return `${pattern || ''}|${nameToSlug(componentType)}_template`;
}

/**
 * Strip a live resolved dataWrapper state down to a portable, self-contained
 * template payload. Always drops cached rows + runtime-only fields (the same
 * set the dataWrapper save-effect strips). The two author toggles then fully
 * partition the rest of the state:
 *
 *   - `includeSource` → the whole data config: the source binding
 *     (`externalSource` + any `join`) AND its shape (`columns` / `filters` /
 *     `pivot` / `comparisonSeries`).
 *   - `includeLayout` → the presentation/settings: `state.display`, which is
 *     where the "Spreadsheet Settings" menu (tableStyle, striped, pagination,
 *     pageSize, maxHeight, …) writes via `dwAPI.setDisplay`. This pairs with the
 *     section-level layout attrs (`extractLayout`) the same toggle captures, so
 *     "include layout" governs the whole look — section chrome + display.
 *
 * @param {object} state  live dwHandle.state
 * @param {{ includeSource?: boolean, includeLayout?: boolean }} opts
 * @returns {object} cleaned state safe to JSON.stringify into the template row
 */
export function cleanStateForTemplate(state, { includeSource = true, includeLayout = true } = {}) {
  if (!state || typeof state !== 'object') return {};
  const s = structuredClone(state);

  // cached rows + top-level runtime fields
  delete s.data;
  RUNTIME_FIELDS.forEach(f => delete s[f]);

  // runtime display fields + the two pagination/cache markers
  if (s.display && typeof s.display === 'object') {
    delete s.display.totalLength;
    delete s.display.loadMoreId;
    RUNTIME_DISPLAY_FIELDS.forEach(f => delete s.display[f]);
  }

  // runtime pivot values + synthesized pivot columns
  if (s.pivot && typeof s.pivot === 'object') {
    delete s.pivot.distinctValues;
    delete s.pivot.distinctValuesByColumn;
  }
  if (Array.isArray(s.columns)) {
    s.columns = s.columns.filter(c => c?.origin !== 'pivot_col');
  }

  // drop the empty join placeholder so we don't persist `{ sources: {} }`
  if (s.join && (!s.join.sources || Object.keys(s.join.sources).length === 0)) {
    delete s.join;
  }

  // The whole data config rides with the source toggle: the binding
  // (externalSource/join) and its shape (columns/filters/pivot/comparisonSeries).
  if (!includeSource) {
    delete s.externalSource;
    delete s.join;
    delete s.columns;
    delete s.filters;
    delete s.pivot;
    delete s.comparisonSeries;
  }

  // The "Spreadsheet Settings" (and any component's display settings) ride with
  // the layout toggle, not the data source.
  if (!includeLayout) {
    delete s.display;
  }

  return s;
}

/**
 * Extract the section's layout attributes — everything on the section value
 * except identity/content plumbing (id, ref, element, provenance).
 * @param {object} value section value
 * @returns {object}
 */
export function extractLayout(value) {
  if (!value || typeof value !== 'object') return {};
  const out = {};
  Object.keys(value)
    .filter(k => !LAYOUT_OMIT.includes(k))
    .forEach(k => { out[k] = value[k]; });
  return out;
}

/**
 * Build the template row's `data` object. State + layout are stored as JSON
 * strings (mirroring how element-data is itself a stringified blob — safest for
 * Falcor path-walking, avoids nested-object projection surprises in the loader).
 *
 * `createdAt`/`updatedAt` are stored INSIDE data (not relying on the server's
 * created_at/updated_at columns, which the `list` query doesn't even return) so
 * the row is fully self-contained and drift detection can compare `updatedAt`.
 *
 * Pass `existing` (the row being overwritten) to update in place: its `id` is
 * carried so `apiUpdate` routes to edit-not-create, `createdAt`/`createdBy` are
 * preserved, and `updatedAt`/`updatedBy` advance — which is exactly what makes
 * `updatedAt` move past `createdAt` so drift detection becomes meaningful.
 */
export function buildTemplatePayload({
  name, componentType, elementType, state, value,
  includeSource = true, includeLayout = true, user, existing = null,
}) {
  const cleanedState = cleanStateForTemplate(state, { includeSource, includeLayout });
  const layout = includeLayout ? extractLayout(value) : {};
  const now = new Date().toISOString();
  const editor = user?.email || user?.id || '';
  const payload = {
    name: (name || '').trim(),
    slug: nameToSlug(name),
    componentType,
    elementType: elementType || componentType,
    includesSource: !!includeSource,
    includesLayout: !!includeLayout,
    stateJson: JSON.stringify(cleanedState),
    layoutJson: includeLayout ? JSON.stringify(layout) : '',
    createdBy: existing?.createdBy || editor,
    createdAt: existing?.createdAt || now,
    updatedBy: editor,
    updatedAt: now,
  };
  if (existing?.id) payload.id = existing.id;
  return payload;
}

/**
 * The list of field paths an apply actually wrote: each applied layout attr
 * (`title`, `size`, …) plus each top-level state key as `state.<key>`
 * (`state.columns`, `state.externalSource`, …). This is the granularity of the
 * per-field provenance stamp.
 */
export function affectedFieldPaths({ layout = {}, state = {} }) {
  const layoutPaths = Object.keys(layout || {});
  const statePaths = Object.keys(state || {}).map(k => `state.${k}`);
  return [...layoutPaths, ...statePaths];
}

/**
 * Merge a new apply's provenance into the section's `_appliedTemplate.fields`
 * map. Most-recent apply wins per field, so field A can stay owned by template
 * X while field B becomes owned by template Y. Each stamp records the owning
 * template + its DB version (`templateUpdatedAt`) at apply time — the hook a
 * future "template changed in DB, refresh these fields?" prompt compares against.
 */
export function mergeAppliedProvenance(prev, { fields, templateId, templateName, templateUpdatedAt, appliedAt }) {
  const stamp = { templateId, templateName, templateUpdatedAt, appliedAt };
  const nextFields = { ...(prev?.fields || {}) };
  (fields || []).forEach(path => { nextFields[path] = stamp; });
  return { ...(prev || {}), fields: nextFields };
}
