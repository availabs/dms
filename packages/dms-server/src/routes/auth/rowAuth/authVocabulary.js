'use strict';

/**
 * A pattern's declared vocabulary, interpreted.
 *
 * Task: planning/tasks/current/row-auth-vocabulary.md. Hub:
 * planning/tasks/current/server-side-auth-general.md, "Where `implies` is applied".
 *
 * The server has no dependency on `packages/dms` and cannot read `registerPatternTypes`, so a
 * pattern type DECLARES its vocabulary in the registry, the pattern ROW transports it
 * (`data.authVocabulary`, projected as `auth_vocabulary`), and this module INTERPRETS it. Nothing
 * here knows a pattern, a verb or a type name — which is the whole difference between this and the
 * transitional `legacyVerbs.js` it is built to replace.
 *
 * ---------------------------------------------------------------------------
 * Declared shape (packages/dms/src/patterns/authVocabulary.js)
 *
 *     { self:        [ { value, label, implies: [structural…] }, … ],
 *       descendants: [ { value, label, implies: [structural…] }, … ] }
 *
 * `label` is the client's; only `value` and `implies` are read here.
 *
 * ---------------------------------------------------------------------------
 * Scope is enforced, not decorative
 *
 * A verb declared only under `self` confers nothing when it turns up inside a `descendants` grant,
 * and vice versa. That is the point of the split: a pattern's own grants answer two different
 * questions — "may you edit this pattern?" and "may you edit its pages?" — and a vocabulary that
 * could not tell them apart would let `edit-pattern` on a pattern leak edit rights to every page
 * under it.
 *
 * A FLAT grant (no `self`/`descendants` keys) means both, as it always has, so it expands against
 * the union. Every legacy grant in production is flat, so this is the common path.
 *
 * ---------------------------------------------------------------------------
 * Fails closed, twice over
 *
 * An undeclared verb confers nothing. A malformed vocabulary yields `null`, and a `null` sends the
 * caller to the legacy shim (or, once that is gone, to no expansion at all) rather than to an
 * error. Neither case can widen access.
 */

const SCOPES = ['self', 'descendants'];

/**
 * The vocabulary a row declares.
 *
 * Same chain the GRANTS already use (rowAuth.js `rawAuthOf`): the `auth` column when the schema has
 * one, else `data`. A client can only ever write `data` — a pattern is created through
 * `dms.data.create`, which writes the row's data and knows nothing of the auth column — so
 * `data.authVocabulary` is the transport and `auth.vocabulary` is where the migration puts it.
 *
 * Read from the RAW `auth` object, before `resolveAuthPermissions` runs. That matters: a
 * subdomain-keyed object is `{'*': {...}, 'sub': {...}}` and resolution returns the picked branch,
 * which would drop a sibling key. A vocabulary is not per-subdomain, so it sits outside the pick.
 */
function vocabularyOf(row) {
  if (!row) return null;
  const auth = typeof row.auth === 'string' ? safeJson(row.auth) : row.auth;
  let v = auth && !Array.isArray(auth) ? auth.vocabulary : null;
  if (v === undefined || v === null) {
    const data = typeof row.data === 'string' ? safeJson(row.data) : row.data;
    v = data && data.authVocabulary;
  }
  if (typeof v === 'string') v = safeJson(v);
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

const safeJson = (v) => { try { return JSON.parse(v); } catch { return null; } };

/**
 * `{ self, descendants, flat }` implies-maps from a declared vocabulary, or `null` if it declares
 * nothing usable. `flat` is the union, because a flat grant has always meant self + descendants.
 */
function impliesMaps(vocabulary) {
  if (!vocabulary || typeof vocabulary !== 'object') return null;
  const maps = { self: {}, descendants: {}, flat: {} };
  let any = false;
  for (const scope of SCOPES) {
    const entries = vocabulary[scope];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry.value !== 'string' || !entry.value) continue;
      const implies = Array.isArray(entry.implies) ? entry.implies.filter(s => typeof s === 'string') : [];
      maps[scope][entry.value] = implies;
      maps.flat[entry.value] = [...new Set([...(maps.flat[entry.value] || []), ...implies])];
      any = true;
    }
  }
  return any ? maps : null;
}

/**
 * Expand one principal's verbs with what they confer. Additive and idempotent — the original
 * strings stay so the client can still check its own vocabulary, and `'*'` is left alone because it
 * already means everything and expanding it would freeze today's verb list into the data.
 */
function expandPerms(perms, map) {
  const list = Array.isArray(perms) ? perms : (perms ? [perms] : []);
  if (list.includes('*')) return list;
  const out = new Set(list);
  for (const p of list) for (const s of (map[p] || [])) out.add(s);
  return [...out];
}

/** Every principal of a `{groups, users, otherwise}` object, against one map. */
function expandFlat(auth, map) {
  const out = {};
  for (const kind of ['groups', 'users']) {
    if (!auth[kind]) continue;
    out[kind] = {};
    for (const [who, perms] of Object.entries(auth[kind])) out[kind][who] = expandPerms(perms, map);
  }
  if (auth.otherwise !== undefined) out.otherwise = expandPerms(auth.otherwise, map);
  return out;
}

/**
 * Expand a subdomain-resolved auth object against a vocabulary's maps, honouring scope.
 * `maps` is the result of `impliesMaps`; a falsy one returns the object untouched.
 */
function expandWithVocabulary(auth, maps) {
  if (!auth || typeof auth !== 'object' || !maps) return auth;
  if (auth.self || auth.descendants) {
    const out = {};
    if (auth.self) out.self = expandFlat(auth.self, maps.self);
    if (auth.descendants) out.descendants = expandFlat(auth.descendants, maps.descendants);
    return out;
  }
  return expandFlat(auth, maps.flat);
}

/**
 * Does this row declare that it must be readable WITHOUT A SESSION?
 *
 * Task 7 Phase 1 (planning/tasks/current/row-auth-consolidate.md). It replaces a hardcoded
 * `pattern_type === 'auth' || pattern_type === 'admin'` in `dms.route.js` — a NAME check, which
 * `src/dms/CLAUDE.md` forbids and which no other pattern type could opt into.
 *
 * It rides inside the vocabulary rather than in a key of its own, so `--sync-vocabulary` already
 * transports it, `rawAuthOf` already strips it with the rest of `vocabulary`, and `impliesMaps`
 * ignores it (it reads only `self` / `descendants`). One declaration, no new plumbing.
 *
 * ⚠ A row that declares this is readable by EVERYONE, always, grants or not.
 */
function publicReadOf(row) {
  const v = vocabularyOf(row);
  return !!(v && v.publicRead === true);
}

/**
 * The `childRefs` a row declares — same chain as the vocabulary: the `auth` column, else `data`.
 * Shape `{ [ownerKind]: { [attribute]: childKind } }`; see
 * packages/dms/src/patterns/page/page.childRefs.js.
 */
function childRefsOf(row) {
  if (!row) return null;
  const auth = typeof row.auth === 'string' ? safeJson(row.auth) : row.auth;
  let v = auth && !Array.isArray(auth) ? auth.childRefs : null;
  if (v === undefined || v === null) {
    const data = typeof row.data === 'string' ? safeJson(row.data) : row.data;
    v = data && data.childRefs;
  }
  if (typeof v === 'string') v = safeJson(v);
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

/**
 * Which kind owns `childKind`, per a `childRefs` declaration, or null.
 *
 * This is what stops a row naming a parent that is merely an ANCESTOR — a component claiming its
 * pattern rather than its page. Structurally that claim is fine (the pattern is in the component's
 * type path); it just skips a level of inheritance, which is the wrong direction to be wrong in.
 */
function ownerKindOf(childRefs, childKind) {
  if (!childRefs || !childKind) return null;
  for (const [owner, attrs] of Object.entries(childRefs)) {
    if (attrs && typeof attrs === 'object' && Object.values(attrs).includes(childKind)) return owner;
  }
  return null;
}

module.exports = {
  SCOPES, vocabularyOf, impliesMaps, expandPerms, expandWithVocabulary, childRefsOf, ownerKindOf,
  publicReadOf,
};
