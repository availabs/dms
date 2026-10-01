/**
 * Authoritative views — which view(s) of a source pages should bind, and why.
 *
 * Stored on the SOURCE, inside its metadata blob:
 *   DAMA: data_manager.sources.metadata -> 'authority'
 *   DMS:  source row data.metadata.authority
 *
 * Shape:
 *   { views: [ { view_id, key?, note, set_by, set_at } ] }
 *
 *   - Most sources have ONE authoritative view: a single entry with no `key`.
 *   - A source holding parallel products (a view per year, per geography level, …) has keyed
 *     entries, e.g. key { year: '2024' }. Every keyed entry on a source uses the same key names,
 *     and each key value has at most one entry. Unkeyed and keyed entries never mix.
 *   - No `authority` (or no entries) means UNDECIDED. It never falls back to "newest view".
 *
 * Pure functions only — no DB access. Mirror of `patterns/datasets/utils/authority.js` in the
 * dms package; the two packages do not share code, so keep them in sync.
 */

const KEY_NAME_RE = /^[a-z][a-z0-9_]*$/;

// Values arrive as objects, JSON text, or (DMS rows written through the wire helper) JSON text
// holding JSON text. Unwrap up to two levels; anything unparseable is null.
function parseJsonish(value) {
  let v = value;
  for (let i = 0; i < 2 && typeof v === 'string'; i++) {
    try { v = JSON.parse(v); } catch { return null; }
  }
  return v === undefined ? null : v;
}

// { Year: 2024 } → throws (names are snake_case); { year: 2024 } → { year: '2024' }; {} / null → null.
function normalizeKey(key) {
  if (key == null) return null;
  if (typeof key !== 'object' || Array.isArray(key)) {
    throw new Error('authority: `key` must be an object of name → value, e.g. { year: "2024" }');
  }
  const names = Object.keys(key);
  if (!names.length) return null;
  const out = {};
  for (const name of names.sort()) {
    if (!KEY_NAME_RE.test(name)) {
      throw new Error(`authority: key name "${name}" must be snake_case (lowercase letters, digits, underscores)`);
    }
    const v = key[name];
    if (v == null || String(v).trim() === '') throw new Error(`authority: key "${name}" needs a value`);
    out[name] = String(v).trim();
  }
  return out;
}

const keyNames = (key) => (key ? Object.keys(key).sort().join(', ') : '');
const sameKey = (a, b) =>
  keyNames(a) === keyNames(b) && Object.keys(a || {}).every(k => String(a[k]) === String(b[k]));

/** The authority record from a source's metadata (object or JSON text), or null when undecided. */
function readAuthority(metadata) {
  const meta = parseJsonish(metadata);
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const a = parseJsonish(meta.authority);
  if (!a || !Array.isArray(a.views)) return null;
  const views = a.views
    .filter(e => e && Number.isFinite(+e.view_id))
    .map(e => ({ ...e, view_id: +e.view_id }));
  return views.length ? { views } : null;
}

/**
 * Add an entry, or replace the one with the same key. Throws on a missing note, a malformed key,
 * or a key that doesn't fit the source's existing entries.
 */
function applySet(authority, { view_id, key, note } = {}, user) {
  if (!Number.isFinite(+view_id)) throw new Error('authority: `view_id` is required');
  const k = normalizeKey(key);
  const n = typeof note === 'string' ? note.trim() : '';
  if (!n) throw new Error('authority: a note explaining the choice is required');

  const views = [...(authority?.views || [])];
  if (views.length) {
    const have = keyNames(views[0].key);
    const want = keyNames(k);
    if (have !== want) {
      throw new Error(have
        ? `authority: this source's authoritative views are keyed by (${have}); use the same key names`
        : 'authority: this source has a single authoritative view; clear it before marking keyed views');
    }
  }

  const entry = {
    ...(k ? { key: k } : {}),
    view_id: +view_id,
    note: n,
    set_by: user?.email || null,
    set_at: new Date().toISOString(),
  };
  const i = views.findIndex(e => sameKey(e.key || null, k));
  if (i >= 0) views[i] = entry; else views.push(entry);
  return { views };
}

/** Remove the entry for `key` (no key = the single entry). Returns null when nothing is left. */
function applyClear(authority, { key } = {}) {
  const k = normalizeKey(key);
  const views = (authority?.views || []).filter(e => !sameKey(e.key || null, k));
  return views.length ? { views } : null;
}

module.exports = { parseJsonish, normalizeKey, readAuthority, applySet, applyClear, sameKey, keyNames };
