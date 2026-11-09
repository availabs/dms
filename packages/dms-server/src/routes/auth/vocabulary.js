'use strict';
/**
 * A ROW'S DECLARATIONS, interpreted: the vocabulary (which verbs exist and which fields each
 * governs), `publicRead`, and `childRefs`.
 *
 * The server cannot read the client's registry, so a pattern type declares these in its formats
 * (`permissionDomain`, `childRefs`, `publicRead`), registration derives them, and they reach the
 * server as the site's `formats` rows (./formats.js, read first by owners.js and dms.controller.js)
 * or, for rows created before the registration, as the STAMP this file reads: the `auth` column
 * (`auth.vocabulary`, `auth.childRefs`) when the table has one, else `data.authVocabulary` /
 * `data.childRefs`. Nothing here knows a verb, a kind or a pattern by name.
 *
 * Declared shape (packages/dms/src/patterns/authVocabulary.js):
 *
 *     { self:        [ { value, label, implies, fields?, when? }, … ],
 *       descendants: [ … ],
 *       publicRead?: true }
 *
 * `self` governs the declaring row; `descendants` governs the rows beneath it. `fields` is which
 * attributes a verb governs (`'*'` = every attribute nobody else claimed); `when` is the one
 * value-predicate (`{ field, notValue }`). `implies` is carried for the client and not read here:
 * the judge matches verbs BY NAME against what a grant says.
 */
const { parseJson } = require('./grants');

const SCOPES = ['self', 'descendants'];

/** One of the declaration keys off a row: the `auth` column first, `data` as the fallback. */
function declared(row, authKey, dataKey) {
  if (!row) return null;
  const auth = parseJson(row.auth);
  let v = auth && typeof auth === 'object' && !Array.isArray(auth) ? auth[authKey] : null;
  if (v == null) {
    const data = parseJson(row.data);
    v = data && data[dataKey];
  }
  v = parseJson(v);
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

const vocabularyOf = (row) => declared(row, 'vocabulary', 'authVocabulary');
const childRefsOf = (row) => declared(row, 'childRefs', 'childRefs');
const publicReadOf = (row) => { const v = vocabularyOf(row); return !!(v && v.publicRead === true); };

/**
 * `{ fields, when, fieldVerbs }` per scope (`self`, `descendants`, `flat` = both), or null when the
 * vocabulary declares nothing usable.
 */
function fieldMaps(vocabulary) {
  if (!vocabulary || typeof vocabulary !== 'object') return null;
  const maps = { fields: { self: {}, descendants: {}, flat: {} }, when: { self: {}, descendants: {}, flat: {} },
                 fieldVerbs: { self: [], descendants: [], flat: [] } };
  let any = false;
  for (const scope of SCOPES) {
    for (const entry of (Array.isArray(vocabulary[scope]) ? vocabulary[scope] : [])) {
      if (!entry || typeof entry.value !== 'string' || !entry.value) continue;
      any = true;
      const claims = Array.isArray(entry.fields) ? entry.fields.filter(f => typeof f === 'string' && f) : [];
      const when = Array.isArray(entry.when) ? entry.when.filter(c => c && typeof c.field === 'string') : [];
      if (!claims.length && !when.length) continue;
      for (const bucket of [scope, 'flat']) {
        for (const f of claims) {
          const at = maps.fields[bucket][f] || (maps.fields[bucket][f] = []);
          if (!at.includes(entry.value)) at.push(entry.value);
        }
        if (when.length) maps.when[bucket][entry.value] = when.map(c => ({ field: c.field, notValue: c.notValue }));
        if (!maps.fieldVerbs[bucket].includes(entry.value)) maps.fieldVerbs[bucket].push(entry.value);
      }
    }
  }
  return any ? maps : null;
}

/**
 * WHICH VERBS AN EDIT NEEDS, as a list of ANY-OF groups: two fields in one write need a verb for
 * EACH, two verbs claiming one field mean EITHER will do.
 *
 *     ['title']            → [['edit-page']]                       the `'*'` claim
 *     ['title','sections'] → [['edit-page'], ['publish-page']]     both required
 *     ['filters']          → [['edit-page-params','edit-page']]    either will do
 *
 * `covered` lists the keys the declaration answered, so a caller can fall back per key for the
 * rest. No changed keys at all is an edit that writes only timestamps: any verb that governs any
 * field passes it.
 */
function verbsForFields(changed, maps, patch = {}, scope = 'flat') {
  const empty = { groups: [], covered: [] };
  if (!maps || !maps.fields || !maps.fields[scope]) return empty;
  const fields = maps.fields[scope];
  const when = maps.when[scope] || {};
  const keys = [...new Set([].concat(changed || []))];
  if (!keys.length) {
    const all = maps.fieldVerbs[scope] || [];
    return all.length ? { groups: [[...all]], covered: [] } : empty;
  }
  const wildcard = fields['*'] || [];
  const groups = [], covered = [], seen = new Set();
  for (const key of keys) {
    const claimed = [...(fields[key] || [])];
    for (const [verb, conds] of Object.entries(when)) {
      const mine = conds.filter(c => c.field === key);
      if (mine.length && mine.every(c => patch[key] !== c.notValue) && !claimed.includes(verb)) claimed.push(verb);
    }
    const group = claimed.length ? claimed : wildcard;
    if (!group.length) continue;
    covered.push(key);
    const sig = [...group].sort().join('|');
    if (!seen.has(sig)) { seen.add(sig); groups.push(group); }
  }
  return { groups, covered };
}

/** Which kind owns `childKind` per a `childRefs` declaration (`{ [ownerKind]: { [attr]: childKind } }`), or null. */
function ownerKindOf(childRefs, childKind) {
  if (!childRefs || !childKind) return null;
  for (const [owner, attrs] of Object.entries(childRefs)) {
    if (attrs && typeof attrs === 'object' && Object.values(attrs).includes(childKind)) return owner;
  }
  return null;
}

module.exports = { SCOPES, vocabularyOf, childRefsOf, publicReadOf, fieldMaps, verbsForFields, ownerKindOf };
