/**
 * Source-rule registry (datasets-source-rules.md).
 *
 * A rule is a code-reviewed template that keeps a DAMA source's table correct: the author attaches
 * it to a source on the datasets Rules page, and the server installs it (a trigger, a column
 * default) on every table behind the source. Authors pick rules and columns; they never write SQL.
 *
 * Core rules register in ./index.js. An app adds its own through the data-type plugin bootstrap:
 * `registerDatatype(name, { rules: { <id>: spec } })`.
 *
 * A spec:
 *   label, description   shown on the Rules page
 *   removeNote           optional: what Remove leaves behind, shown when confirming
 *   params               [{ name, type, label, optional?, default?, columnKinds? }] — the form.
 *                        Types: column · geometry_column · bbox · number · string · boolean.
 *   appliesTo(info)      optional → boolean: offer the rule for a table like this one
 *   normalize({ info, params }) optional → params with defaults that depend on the table
 *   key(params)          → string: one attached instance per key (e.g. per target column)
 *   validate({ info, params })  throw an Error with a plain-language message. Runs for EVERY
 *                        table before ANY DDL.
 *   install({ info, params, names })    → [sql | { text, values }]
 *   uninstall({ info, params, names })  → [sql | { text, values }]
 *   backfill({ info, params })          optional → { text, values } returning one row of counts.
 *                        It must never raise row by row: one bad row can't abort the run.
 *   status({ q, info, params, names })  → 'installed' | 'missing', read from the catalog, never
 *                        from metadata.
 *
 * The safety rule for templates: only validated identifiers (quoteIdent, which refuses anything
 * that isn't a plain identifier) and finite numbers (sqlNumber) may be put into SQL text. Never
 * interpolate a string param.
 */

const rules = {};

const REQUIRED_FUNCTIONS = ['key', 'validate', 'install', 'uninstall', 'status'];

function registerRule(id, spec) {
  if (!/^[a-z][a-z0-9_]*$/.test(id || '')) {
    throw new Error(`registerRule: rule id "${id}" must be lowercase letters, digits and underscores`);
  }
  if (!spec || typeof spec.label !== 'string' || !Array.isArray(spec.params)) {
    throw new Error(`registerRule: rule "${id}" needs a label and a params array`);
  }
  for (const fn of REQUIRED_FUNCTIONS) {
    if (typeof spec[fn] !== 'function') throw new Error(`registerRule: rule "${id}" is missing ${fn}()`);
  }
  if (rules[id]) console.warn(`[rules] Overwriting existing rule: ${id}`);
  rules[id] = { ...spec, id };
}

function getRule(id) {
  return rules[id] || null;
}

function getRules() {
  return { ...rules };
}

module.exports = { registerRule, getRule, getRules };
