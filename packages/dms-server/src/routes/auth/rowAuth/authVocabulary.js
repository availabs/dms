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
 * transitional `legacyVerbs.js` it replaced — deleted 2026-11-03, leaving this the only answer
 * to what a permission string confers.
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
  const maps = { self: {}, descendants: {}, flat: {},
                 fields: { self: {}, descendants: {}, flat: {} },
                 when:   { self: {}, descendants: {}, flat: {} },
                 fieldVerbs: { self: [], descendants: [], flat: [] } };
  let any = false;
  for (const scope of SCOPES) {
    const entries = vocabulary[scope];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry.value !== 'string' || !entry.value) continue;
      const implies = Array.isArray(entry.implies) ? entry.implies.filter(s => typeof s === 'string') : [];
      maps[scope][entry.value] = implies;
      maps.flat[entry.value] = [...new Set([...(maps.flat[entry.value] || []), ...implies])];
      // FIELD CLAIMS, PER SCOPE — and the scope is not decorative. A pattern row's vocabulary
      // carries both: `edit-pattern` claims `*` under `self`, `edit-page` claims `*` under
      // `descendants`. Flattening them makes an ordinary page edit ask for "edit-pattern or
      // edit-page", which is wrong in both directions — it offers a page editor the pattern's verb
      // and a pattern editor the page's. A row is governed by `self` when it declares its own
      // vocabulary and by `descendants` when it inherited one.
      const claims = Array.isArray(entry.fields) ? entry.fields.filter(f => typeof f === 'string' && f) : [];
      const when = Array.isArray(entry.when) ? entry.when.filter(c => c && typeof c.field === 'string') : [];
      if (claims.length || when.length) {
        for (const bucket of [scope, 'flat']) {
          for (const f of claims) {
            const at = maps.fields[bucket][f] || (maps.fields[bucket][f] = []);
            if (!at.includes(entry.value)) at.push(entry.value);
          }
          if (when.length) maps.when[bucket][entry.value] = when.map(c => ({ field: c.field, notValue: c.notValue }));
          if (!maps.fieldVerbs[bucket].includes(entry.value)) maps.fieldVerbs[bucket].push(entry.value);
        }
      }
      any = true;
    }
  }
  return any ? maps : null;
}

/**
 * WHICH VERBS AN EDIT NEEDS, read from the vocabulary rather than from a `switch`.
 *
 * Returns **a list of ANY-OF GROUPS**, and the shape is the whole point: two fields in one write
 * mean the caller needs a verb for EACH of them, while two verbs claiming ONE field mean either
 * will do. A flat list cannot say both, and getting that wrong silently widens
 * `filters` — which `authRules.js` grants to `edit-page` OR `edit-page-params`.
 *
 *     ['title']               → [['edit-page']]
 *     ['title','sections']    → [['edit-page'], ['publish-page']]        both required
 *     ['filters']             → [['edit-page-params','edit-page']]       either will do
 *
 * Returns `{ groups, covered }`: `covered` lists the keys the declaration actually answered, so a
 * caller can fall back PER KEY for the rest. All-or-nothing silently dropped a key nobody claimed —
 * the site row's `dms_envs`, which is judged against a different owner's grants entirely.
 *
 * `scope` is `self` for a row that declares its own vocabulary and `descendants` for one that
 * inherited it; see `impliesMaps`.
 *
 * `changed` is `planEdit`'s changed-key list; `patch` is the write, read only for a `when`
 * condition's value test. The verbs are VALUES — the names a grant is written in. Both
 * implementations read this: row auth expands them to structural verbs, kind auth checks them by
 * name, and neither contains the rule.
 *
 * Three cases, in the order they are asked:
 *   - a field a verb CLAIMS                           → that verb
 *   - a field a verb claims WHEN its value is not X   → that verb, only when the write says so
 *   - any other field                                 → the verbs that claimed `'*'`
 *
 * NOTHING CHANGED (`changed` empty) is an edit that writes only timestamps, and any of the row's
 * edit verbs passes it — one group holding every verb that governs any field. Derived here rather
 * than declared, so it cannot drift from the claims above it.
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
  const groups = [];
  const covered = [];
  const seen = new Set();
  for (const key of keys) {
    const claimed = [];
    for (const verb of (fields[key] || [])) if (!claimed.includes(verb)) claimed.push(verb);
    // Conditional claims live in `when` and nowhere else, so a field named only there is found here.
    for (const [verb, conds] of Object.entries(when)) {
      const mine = conds.filter(c => c.field === key);
      if (mine.length && mine.every(c => patch[key] !== c.notValue) && !claimed.includes(verb)) claimed.push(verb);
    }
    const group = claimed.length ? claimed : wildcard;
    if (!group.length) continue;              // nothing declared for this key — the caller decides
    covered.push(key);
    const sig = [...group].sort().join('|');
    if (seen.has(sig)) continue;
    seen.add(sig);
    groups.push(group);
  }
  return { groups, covered };
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
  SCOPES, vocabularyOf, impliesMaps, verbsForFields, expandPerms, expandWithVocabulary, childRefsOf, ownerKindOf,
  publicReadOf,
};
