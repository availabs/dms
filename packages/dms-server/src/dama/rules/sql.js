/**
 * SQL helpers shared by the rule templates. Everything a template puts into SQL text goes through
 * quoteIdent (identifiers) or sqlNumber (numbers); string params are never interpolated.
 */
const crypto = require('crypto');

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PG_IDENT_MAX = 63;

function quoteIdent(name) {
  if (typeof name !== 'string' || !SAFE_IDENTIFIER.test(name)) {
    throw new Error(`Unsupported identifier: ${JSON.stringify(name)}`);
  }
  return `"${name}"`;
}

function qualified(schema, table) {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`;
}

function sqlNumber(value) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error(`Expected a number, got ${JSON.stringify(value)}`);
  return String(n);
}

// A Postgres object name built from parts, kept under the 63-character limit. Long names keep a
// readable prefix and end in a short hash of the full name, so two long names never collide.
function objectName(...parts) {
  const full = parts
    .map(p => String(p).toLowerCase().replace(/[^a-z0-9_]+/g, '_'))
    .join('_')
    .replace(/_+/g, '_');
  if (full.length <= PG_IDENT_MAX) return full;
  const hash = crypto.createHash('sha1').update(full).digest('hex').slice(0, 8);
  return `${full.slice(0, PG_IDENT_MAX - 9)}_${hash}`;
}

// The DB objects a rule instance owns on one table. Triggers are per table, so the trigger name
// only needs the key; functions live in the table's schema, so theirs carries the table name too.
function ruleObjectNames(info, key) {
  return {
    trigger: objectName('dms_rule', key),
    fn: objectName('dms_rule', info.table, key),
  };
}

// A literal for a string the server itself generated (comments). Not for params.
function sqlLiteral(text) {
  return `'${String(text).replace(/'/g, "''")}'`;
}

module.exports = { SAFE_IDENTIFIER, quoteIdent, qualified, sqlNumber, objectName, ruleObjectNames, sqlLiteral };
