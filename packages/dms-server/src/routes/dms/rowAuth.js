'use strict';

/**
 * Row auth — ancestry resolution. The database half; `mergeAuth.js` is the pure half.
 *
 * Design: planning/tasks/current/server-side-auth-general.md (hub).
 * Measurements this is built on: planning/tasks/current/row-auth-chain-spike.md.
 *
 * One `resolve()` serves every surface — dms reads and writes, uda, sync, the socket — because the
 * rule is type-free. Nothing here switches on a row kind.
 *
 * ---------------------------------------------------------------------------
 * Two parentage sources, in SEQUENCE (not alternatives)
 *
 *     follow parent_id while present → then the type path → then stop.
 *
 * `parent_id` is the real answer: the client states it on every write, the server validates it
 * (`validateParentId`) and an owner re-asserts it over its own declared child arrays on every save
 * (`stampChildren`). A migrated app walks the column alone — verified on a migrated clone, where
 * walking 300 components took **1,452 hops from the column and 0 from the type path.**
 *
 * The type path is the UNMIGRATED fallback, and a hit on a migrated app is worth treating as a
 * signal that the migration is incomplete. It is the weaker mechanism twice over. It routes a
 * component to its *pattern*, SKIPPING its page, so on an unmigrated app a private page's
 * restriction does not reach its own sections. And it names a parent by NAME, and names collide:
 * `mitigat-ny-prod` has 323 container rows but only 239 distinct instance names, with "admin"
 * naming two different `prod|admin:pattern` rows. This resolver takes first-wins, i.e. it guesses;
 * the migration reports the collisions for a human instead, which is the right place to fix them.
 *
 * ---------------------------------------------------------------------------
 * `data.parent` was the third source. Retired 2026-10-29.
 *
 * It carried only the within-pattern hierarchy — 528,158 component → page and 4,159 page → page in
 * `mitigat-ny-prod`, nothing pointing at a pattern — in three encodings that were all live at once:
 * a jsonb object, the same object double-encoded as JSON text, and a bare numeric string.
 *
 * What retired it is not the encodings but the content: nothing maintained it. Measured against the
 * page that actually lists each component on `rowauth-test`, it disagreed for **52.6%** of the
 * 33,259 components carrying one, and 231 named a row that no longer existed. Copy and paste
 * propagated the staleness (`section_utils.js` `handlePaste` spread it verbatim) and no reader ever
 * corrected it, so it drifted in one direction only.
 *
 * On a COMPONENT row it is now neither written nor read anywhere. On a PAGE row `data.parent` is a
 * different field that happens to share the name — the nav / URL tree — and that one is
 * load-bearing and stays. See planning/tasks/current/row-auth-parentage.md, Remaining 3.
 *
 * ---------------------------------------------------------------------------
 * CALLER CONTRACT: pass PROJECTED rows, never whole ones
 *
 * `resolve()` reads exactly four fields: `id`, `type`, `parent_id`, `auth` — and, only when the
 * `auth` column is absent, `data.authPermissions`. Select those and nothing else:
 *
 *     SELECT id, type, parent_id, auth FROM <table> WHERE …
 *
 * Production rows average ~10KB of `data` jsonb (5.7GB over 541k rows in `mitigat-ny-prod`), and
 * selecting `data` exhausted the V8 heap at 20,000 rows during development. With the projection,
 * measured against a 33,764-row migrated clone:
 *
 *     500 rows →  151ms,  4 queries,  16MB heap
 *   5,000 rows →  260ms,  3 queries,  79MB heap
 *  33,764 rows →  942ms,  2 queries, 411MB heap
 *
 * The query count FALLS as the batch grows, because more ancestors are already in the input set.
 * Above roughly 30k rows the heap becomes the limit, not the time: chunk the input, or use a
 * recursive CTE (the spike measured 521ms for 50k rows resolved entirely in SQL).
 *
 * Measured derivability 99.2%, resolving to a real row 98.4%. The rest resolve to a truncated chain,
 * which is safe: ancestors only ever narrow, so a short chain can only be MORE permissive. That is
 * the right direction to fail during a migration — but it is why parent-resolution coverage gates
 * any `enforce` flip (hub).
 */

const { getParent, getInstance } = require('#db/type-utils.js');
const { mergeAuthChain, can, isUnstated, VERBS } = require('./mergeAuth');
const { resolveAuthPermissions } = require('./auth');
const { expandAuth } = require('./legacyVerbs');
const { vocabularyOf, impliesMaps, expandWithVocabulary } = require('./authVocabulary');

/** Hub: cycles and pathological depth truncate, never deny. Measured max depth is 5 (~7 end to end). */
const MAX_DEPTH = 16;

/**
 * The auth object governing a row, from the `auth` column when the schema has one, else coalesced
 * from `data.authPermissions`.
 *
 * Legacy values are FLAT, and flat already means self + descendants: today `patternCan` reads
 * `data.authPermissions` for `edit-pattern` (self) and dms.route.js's page gate reads the same
 * object for pages (descendants). Coalescing therefore reinterprets nothing — do not "upgrade"
 * legacy values into scoped ones.
 */
function authOf(row, subdomain = '', maps = null) {
  const raw = rawAuthOf(row, subdomain);
  if (!raw) return raw;
  // A declared vocabulary wins over the shim, so a pattern that has declared is already free of it
  // (row-auth-vocabulary.md, "Until then it stays"). `expandAuth` is the transitional fallback for
  // grants written before any pattern declared — see legacyVerbs.js.
  return maps ? expandWithVocabulary(raw, maps) : expandAuth(raw);
}

/**
 * The same object, subdomain-resolved but NOT expanded.
 *
 * The walk collects raw auth and expands once the chain is complete, because the map to apply is
 * the one belonging to the pattern **in the chain of the row being judged** — not the row each
 * grant happens to sit on (hub, rule 2). An ancestor's grant inherited by a page is read in that
 * page's vocabulary.
 */
function rawAuthOf(row, subdomain = '') {
  if (!row) return null;
  if (row.auth !== undefined && row.auth !== null) {
    const a = typeof row.auth === 'string' ? safeJson(row.auth) : row.auth;
    // `vocabulary` shares the column with the grants (see authVocabulary.js `vocabularyOf`) and is
    // read from the raw object there. Dropped here so nothing downstream can read it as a principal.
    if (a) {
      const { vocabulary, ...grants } = a;
      return resolveScoped(grants, subdomain);
    }
  }
  const data = typeof row.data === 'string' ? safeJson(row.data) : row.data;
  const legacy = data && (data.authPermissions || data.auth_permissions);
  return legacy ? resolveAuthPermissions(legacy, subdomain) : null;
}

/**
 * The implies-maps governing a chain: the NEAREST declaring row at or above the row being judged.
 *
 * Nearest rather than highest, so a pattern's vocabulary beats a site-wide one — the pattern is
 * what ships the verbs. `null` means nothing in the chain declared, and the caller falls back to
 * the shim.
 */
function mapsForChain(rows) {
  for (const row of rows) {                       // leaf → root
    const maps = impliesMaps(vocabularyOf(row));
    if (maps) return maps;
  }
  return null;
}

/** `{self, descendants}` survives subdomain resolution on each half; a flat object resolves directly. */
function resolveScoped(a, subdomain) {
  if (a && (a.self || a.descendants)) {
    const out = {};
    if (a.self) out.self = resolveAuthPermissions(a.self, subdomain);
    if (a.descendants) out.descendants = resolveAuthPermissions(a.descendants, subdomain);
    return out;
  }
  return resolveAuthPermissions(a, subdomain);
}

const safeJson = (v) => { try { return JSON.parse(v); } catch { return null; } };

/**
 * The parent row id a row names: the `parent_id` column, and nothing else. Returns a string or null.
 *
 * A row with no column (an unmigrated app) returns null here and resolves through the type path in
 * `parentOf` below. `data.parent` is NOT consulted — see this file's header for why it went.
 */
function parentIdOf(row) {
  if (!row) return null;
  const pid = row && row.parent_id;
  return (pid !== undefined && pid !== null && pid !== '') ? String(pid) : null;
}

/**
 * A row's identity for type-path purposes — what a CHILD's parent segment matches against.
 *
 *     prod:site                         → 'prod'
 *     prod|mitigateny_chenango:pattern  → 'mitigateny_chenango'
 *     mitigateny_chenango|component     → null  (not a container; nothing parents to it by name)
 *
 * Container rows are few — the spike counted 112 patterns, 1 site, 84 sources and 127 views in the
 * largest app — so the whole map is built once and held per resolver.
 */
const identityOf = (row) => (row && row.type) ? getInstance(row.type) : null;

/**
 * Build a resolver bound to one app.
 *
 * `loadByIds(ids) -> rows` and `loadContainers() -> rows` are supplied by the caller so this module
 * touches no table resolver and no adapter — and so sync can hand it a set it has already fetched.
 */
function createResolver({ loadByIds, loadContainers, subdomain = '' }) {
  let containerMap = null;

  async function containers() {
    if (!containerMap) {
      containerMap = new Map();
      for (const row of (await loadContainers()) || []) {
        const id = identityOf(row);
        // First wins: a duplicate instance name is ambiguous, and the hub's rule is that an
        // unresolvable parent truncates rather than guesses.
        if (id && !containerMap.has(id)) containerMap.set(id, row);
      }
    }
    return containerMap;
  }

  /** The next row up: parent_id first, then the type path, then nothing. */
  async function parentOf(row, cache) {
    const pid = parentIdOf(row);
    if (pid) {
      const got = cache.get(pid) || (await loadByIds([pid]))[0];
      if (got) { cache.set(String(got.id), got); return got; }
      // Dangling id: fall through to the type path rather than stopping — measured 4,382 of 541,228.
    }
    const seg = row && row.type ? getParent(row.type) : null;
    if (!seg) return null;
    const map = await containers();
    const up = map.get(seg);
    return (up && String(up.id) !== String(row.id)) ? up : null;
  }

  /**
   * The chain for one row, root → leaf, as auth objects. Truncates on a repeat or at MAX_DEPTH and
   * logs: a data error must not become an outage, and a truncated chain still holds every distinct
   * ancestor reached before the repeat.
   */
  async function chainFor(row, cache) {
    const rows = [];
    const visited = new Set();
    let cur = row;
    for (let depth = 0; cur && depth < MAX_DEPTH; depth++) {
      const key = String(cur.id);
      if (visited.has(key)) {
        console.warn(`[row-auth] parentage cycle at id=${key} type=${cur.type} — truncating`);
        break;
      }
      visited.add(key);
      rows.push(cur);
      cur = await parentOf(cur, cache);
    }
    if (cur) console.warn(`[row-auth] depth cap ${MAX_DEPTH} reached from id=${row && row.id} — truncating`);
    const maps = mapsForChain(rows);              // leaf → root: the nearest declaring ancestor
    return rows.map(r => authOf(r, subdomain, maps) || {}).reverse();   // root → leaf
  }

  /**
   * Merged auth per row id.
   *
   * BREADTH-FIRST, one batched load per depth level — so the cost is ~depth queries no matter how
   * many rows are asked about. Resolving row by row instead cost ~2ms/row against
   * `mitigat-ny-prod`, which is fine for a Falcor read and far too slow for a sync bootstrap; this
   * is what lets the same function serve both (hub, "One decision function").
   */
  async function resolve(rows) {
    const cache = new Map();
    const input = (rows || []).filter(r => r && r.id != null);
    for (const r of input) cache.set(String(r.id), r);

    // chains[id] accumulates the ROWS leaf → root; frontier holds each row's current ancestor.
    // Rows rather than expanded auth, because the vocabulary to expand them with is not known until
    // the chain is complete (hub, rule 2) — see `mapsForChain`.
    const chains = new Map(input.map(r => [String(r.id), [r]]));
    const visited = new Map(input.map(r => [String(r.id), new Set([String(r.id)])]));
    let frontier = input.map(r => ({ root: String(r.id), row: r }));

    for (let depth = 0; depth < MAX_DEPTH && frontier.length; depth++) {
      // 1. work out every row we need next, and fetch the unseen ones in ONE query
      const wanted = new Set();
      for (const f of frontier) {
        const pid = parentIdOf(f.row);
        if (pid && !cache.has(pid)) wanted.add(pid);
      }
      if (wanted.size) {
        for (const got of await loadByIds([...wanted])) cache.set(String(got.id), got);
      }
      const map = await containers();

      // 2. advance each chain by one hop
      const next = [];
      for (const f of frontier) {
        const pid = parentIdOf(f.row);
        let up = pid ? cache.get(pid) : null;
        if (!up) {                                  // no id, or a dangling one → the type path
          const seg = f.row.type ? getParent(f.row.type) : null;
          up = seg ? map.get(seg) : null;
        }
        if (!up || String(up.id) === String(f.row.id)) continue;
        const seen = visited.get(f.root);
        if (seen.has(String(up.id))) {
          console.warn(`[row-auth] parentage cycle reaching id=${up.id} from root=${f.root} — truncating`);
          continue;
        }
        seen.add(String(up.id));
        chains.get(f.root).push(up);
        next.push({ root: f.root, row: up });
      }
      frontier = next;
    }
    if (frontier.length) {
      console.warn(`[row-auth] depth cap ${MAX_DEPTH} reached for ${frontier.length} row(s) — truncating`);
    }

    const out = new Map();
    for (const [id, rows] of chains) {
      const maps = mapsForChain(rows);            // leaf → root
      out.set(id, mergeAuthChain(rows.map(r => authOf(r, subdomain, maps) || {}).reverse()));
    }
    return out;
  }

  /**
   * Merged auth for a row that does not exist yet — a CREATE, which resolves against its parent.
   * This is why `create` is a structural verb of its own: it asks about a different row.
   */
  async function resolveForCreate(parentRow) {
    if (!parentRow) return { groups: {}, users: {} };
    const cache = new Map([[String(parentRow.id), parentRow]]);
    const chain = await chainFor(parentRow, cache);
    // The new row contributes nothing of its own, so the parent's `descendants` governs it.
    return mergeAuthChain([...chain, {}]);
  }

  return { resolve, resolveForCreate, chainFor, containers };
}

module.exports = {
  createResolver, authOf, rawAuthOf, mapsForChain, parentIdOf, identityOf, MAX_DEPTH,
  can, isUnstated, VERBS,
};
