'use strict';

/**
 * `parent_id` on the way in — the client declares it, the server validates it.
 *
 * Task: planning/tasks/current/row-auth-parentage.md. Hub:
 * planning/tasks/current/server-side-auth-general.md.
 *
 * ---------------------------------------------------------------------------
 * Why the CLIENT supplies it
 *
 * The type system deliberately does not model the page → component edge. From the type-system
 * refactor's own map, pages and components are both children of the PATTERN, "identified by row
 * ID": a page carries no instance name, so nothing can name it as a parent in a type string. That
 * is why `{pattern}|component` resolves only as far as the pattern.
 *
 * The server therefore cannot derive a component's page. The client can — it is adding the child's
 * ref to that very page in the same save (`api/index.js`, the `dms-format` child loops). So the
 * client states it and the server checks it, rather than the server rediscovering what the caller
 * already knew.
 *
 * ---------------------------------------------------------------------------
 * What is checked, and why it is not a kind list
 *
 * A client that could name any parent could inherit any parent's grants — pick a permissive page,
 * attach to it, read what it can read. The check is structural and names no kind:
 *
 *   same app, AND the claimed parent is either
 *     a) the NAMED CONTAINER the child's type points at   — `chenango|page` → `prod|chenango:pattern`
 *     b) a SIBLING KIND under that same container          — `chenango|component` → `chenango|page`
 *
 * Both are read off the type strings. A new pattern type gets the same protection with no change
 * here, which is the point (src/dms/CLAUDE.md, "DMS Interprets Data").
 *
 * ---------------------------------------------------------------------------
 * It never throws
 *
 * A parent that does not exist, or fails the check, is DROPPED with a warning — the row is still
 * written, with no `parent_id`. `parent_id` carries no foreign key for the same reason: an
 * inconsistency in parentage must not turn into a failed write. The resolver already truncates a
 * chain it cannot follow (measured: 243 dangling ids on the migration clone), and a short chain is
 * safe in a way a 500 is not.
 */

const { getParent, getInstance, getKind } = require('#db/type-utils.js');

/**
 * May a row of `childType` name a row of `parentType` as its parent?
 *
 * Returns true for the two structural shapes above. Everything else — a different container, a
 * different app's row, an unparseable type — is false.
 */
function isPlausibleParent(childType, parentType, ownerKind = null) {
  if (!childType || !parentType) return false;
  const container = getParent(childType);
  if (!container) return false;                       // a root row names no container
  const inContainer = getInstance(parentType) === container   // the named container itself
    || getParent(parentType) === container;                   // a sibling kind inside it
  if (!inContainer) return false;

  // A row must name its NEAREST parent, not merely an ancestor. A component naming its PATTERN
  // instead of its page is inside the container and therefore passes the structural check — but it
  // skips a level of inheritance, which is permissive in the wrong direction and is exactly the
  // move an attacker would make.
  //
  // Nothing in a type string says pages sit between patterns and components, so this cannot be
  // decided structurally — it needs the owning kind, which the pattern DECLARES (`auth.childRefs`,
  // the same channel as `auth.vocabulary`). When the caller supplies it, it is enforced exactly;
  // when it does not, the structural check stands alone and the reconciler reports the drift.
  if (ownerKind) return getKind(parentType) === ownerKind;
  return true;
}

/**
 * Pull a client-supplied `parent_id` out of a create payload.
 *
 * Returns `{ data, claimed }` — `data` with the key removed (it belongs in the column, not in the
 * jsonb, where it would become a second copy to drift), and the claimed id as a string, or null.
 */
function takeParentId(data) {
  if (!data) return { data, claimed: null };
  const obj = typeof data === 'string' ? safeJson(data) : data;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { data, claimed: null };
  const raw = obj.parent_id;
  if (raw === undefined) return { data: obj, claimed: null };
  const rest = { ...obj };
  delete rest.parent_id;
  const s = raw === null ? '' : String(raw).trim();
  return { data: rest, claimed: /^[0-9]+$/.test(s) ? s : null };
}

const safeJson = (v) => { try { return JSON.parse(v); } catch { return null; } };

/**
 * The predicate for "a row of kind `childKind` inside container `container`" — the bound every
 * parentage statement is held to.
 *
 * TWO TYPE SHAPES, because `{parent}:{instance}|{kind}` lets any segment be omitted:
 *
 *     chenango|component          instance-less — page, component, page-edit
 *     prod|test_env:dmsenv        instanced     — dmsenv, source, view, pattern
 *
 * An exact `=` on `${container}|${childKind}` matches only the first, so until 2026-10-29 a
 * declaration naming an INSTANCED child kind stamped nothing at all — silently, since a statement
 * that matches no rows is not an error. Found by `tests/test-row-auth-uda.js`: the datasets
 * pattern's `{ pattern: { dmsEnvId: 'dmsenv' } }` never reached `prod|test_env:dmsenv`.
 *
 * **The security bound is unchanged.** Both forms pin the CONTAINER and the KIND; only the instance
 * segment is free, and an instance is a name, not a scope. A row in another container or of another
 * kind still cannot be matched — which is the property that stops cross-pattern capture.
 *
 * `_` and `%` are escaped: container and kind come from a type string, and instance names routinely
 * carry underscores (`my_site|%:dmsenv` would otherwise match `myXsite`).
 */
const likeEscape = (v) => String(v).replace(/([\\%_])/g, '\\$1');
function childTypeParams(container, childKind) {
  return [`${container}|${childKind}`, `${likeEscape(container)}|%:${likeEscape(childKind)}`];
}
const CHILD_TYPE_SQL = (a, b) => `(type = $${a} OR type LIKE $${b} ESCAPE '\\')`;
const numericId = (v) => (/^[0-9]+$/.test(String(v)) ? BigInt(v) : null);

/**
 * Validate a claimed parent against the database. `loadType(id) -> { app, type } | null`.
 * Returns the id to store, or null to store nothing. Never throws.
 */
async function validateParentId(claimed, { app, type, loadType, ownerKind = null }) {
  if (!claimed) return null;
  let parent;
  try {
    parent = await loadType(claimed);
  } catch (e) {
    console.warn(`[parent-id] lookup failed for ${claimed}: ${e.message} — dropping`);
    return null;
  }
  if (!parent) {
    console.warn(`[parent-id] ${app}/${type} claims parent ${claimed}, which does not exist — dropping`);
    return null;
  }
  if (String(parent.app) !== String(app)) {
    console.warn(`[parent-id] ${app}/${type} claims parent ${claimed} in app ${parent.app} — dropping`);
    return null;
  }
  if (!isPlausibleParent(type, parent.type, ownerKind)) {
    console.warn(`[parent-id] ${app}/${type} claims parent ${claimed} of type ${parent.type}`
      + (ownerKind ? `, but its declared owner is "${ownerKind}"` : ', which is outside its container')
      + ' — dropping');
    return null;
  }
  return claimed;
}

/**
 * The ids a declared reference array names.
 *
 * Production writes an element as `{"id":"2231673","ref":"app+type"}`; a bare id is accepted
 * because nothing stops a pattern writing one. `ref` is deliberately ignored — it carries the app
 * the row was written under, which a copied database no longer matches (measured: every element on
 * the `rowauth-test` clone still says `mitigat-ny-prod+…`). The id is checked against the table
 * instead, which is the only claim that can be verified.
 */
function refIdsOf(value) {
  const v = typeof value === 'string' ? (safeJson(value) ?? value) : value;
  // A reference attribute may hold a SINGLE id rather than an array — the datasets pattern points
  // at its env with a bare `dmsEnvId`, where a page points at its sections with `[{id, ref}]`.
  // Both are "the rows this attribute names", so both are reference attributes; only the arity
  // differs. Without this `refIdsOf(1676363)` was `[]` and a scalar childRef stamped nothing.
  const arr = Array.isArray(v) ? v
    : (v !== null && v !== undefined && (typeof v !== 'object' || v.id !== undefined) ? [v] : []);
  const out = [];
  for (const el of arr) {
    const raw = el && typeof el === 'object' ? el.id : el;
    const s = raw === null || raw === undefined ? '' : String(raw).trim();
    if (/^[0-9]+$/.test(s)) out.push(s);
  }
  return out;
}

/**
 * Merge every `childRefs` declaration in an app into one map keyed by OWNER KIND.
 *
 * A declaration is written per pattern type but it is a statement about a KIND: "a row of kind
 * `page` owns components through `sections`". Merging by kind is what lets the backfill reach rows
 * whose pattern row is gone — 22,790 of the clone's 33,342 components sit under a pattern that was
 * deleted out from under them, and a per-instance reading would leave every one of them unparented.
 *
 * Where two patterns disagree about the same attribute of the same kind there is no app-wide
 * answer, so that attribute is dropped and reported rather than guessed — the same rule pass 3
 * applies to ambiguous instance names.
 *
 * `declarations` is `[{ id, type, childRefs }]`. Returns `{ byOwnerKind, conflicts }`.
 */
function mergeChildRefs(declarations) {
  const byOwnerKind = {};
  const seen = new Map();          // `${ownerKind}.${attribute}` -> { childKind, from: [ids] }
  const conflicts = [];
  for (const d of declarations || []) {
    const refs = d && d.childRefs;
    if (!refs || typeof refs !== 'object' || Array.isArray(refs)) continue;
    for (const [ownerKind, attrs] of Object.entries(refs)) {
      if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) continue;
      for (const [attribute, childKind] of Object.entries(attrs)) {
        if (typeof childKind !== 'string' || !childKind) continue;
        const key = `${ownerKind}.${attribute}`;
        const prev = seen.get(key);
        if (!prev) { seen.set(key, { childKind, from: [d.id] }); continue; }
        if (prev.childKind === childKind) { prev.from.push(d.id); continue; }
        prev.conflicted = true;
        conflicts.push({ ownerKind, attribute, declared: [prev.childKind, childKind], rows: [prev.from[0], d.id] });
      }
    }
  }
  for (const [key, v] of seen) {
    if (v.conflicted) continue;
    const i = key.indexOf('.');
    const ownerKind = key.slice(0, i), attribute = key.slice(i + 1);
    (byOwnerKind[ownerKind] || (byOwnerKind[ownerKind] = {}))[attribute] = v.childKind;
  }
  return { byOwnerKind, conflicts };
}

/** Every kind that some declaration names as a child — the kinds the type path must NOT guess. */
function declaredChildKinds(byOwnerKind) {
  const out = new Set();
  for (const attrs of Object.values(byOwnerKind || {})) {
    for (const childKind of Object.values(attrs || {})) out.add(childKind);
  }
  return out;
}

/**
 * Plan the repair for children that TWO owners name.
 *
 * `parent_id` is one column and the data says two parents, so the column cannot express it. The
 * repair is to make the data true: the lowest-id owner keeps the original row, every other owner
 * gets its own copy, and that owner's reference arrays are repointed at the copy. The pages render
 * exactly what they rendered before, and the copies can now diverge the way whoever duplicated the
 * page always believed they could.
 *
 * Lowest id, because the rule has to be stable across runs: the same owner must win every time or
 * a second run duplicates again.
 *
 * `detail` is `Map(childId -> Map(ownerId -> { ownerKind, attrs: string[] }))`. `childType` and
 * `ownerType` are lookups, `byOwnerKind` the merged declaration. Returns
 * `{ keepers: Map(childId -> ownerId), copies: [{ child, owner, ownerKind, attrs }], rejected }`.
 */
function planDuplication(detail, { childType, ownerType, byOwnerKind }) {
  const keepers = new Map();
  const copies = [];
  const rejected = [];
  for (const [child, owners] of detail || new Map()) {
    const type = childType(child);
    // Every owner is held to the SAME check a live write is: the declared kind, and the structural
    // container rule. An owner that fails it is not a parent and does not earn a copy.
    const valid = [...owners.entries()].filter(([oid, info]) => {
      const declared = (byOwnerKind || {})[info.ownerKind] || {};
      const attrs = Array.from(info.attrs || []);          // a Set or an array, whichever the caller kept
      return type && attrs.some(a => declared[a] === getKind(type))
        && isPlausibleParent(type, ownerType(oid), info.ownerKind);
    });
    if (!valid.length) { rejected.push(child); continue; }
    // Numeric where the ids are numbers ("100" must not sort before "9"), lexical otherwise —
    // this runs mid-migration and must not throw on an id shape it did not expect.
    valid.sort((a, b) => {
      const x = numericId(a[0]), y = numericId(b[0]);
      if (x !== null && y !== null) return x < y ? -1 : (x > y ? 1 : 0);
      return String(a[0]) < String(b[0]) ? -1 : 1;
    });
    keepers.set(child, valid[0][0]);
    for (const [owner, info] of valid.slice(1)) {
      copies.push({ child, owner, ownerKind: info.ownerKind, attrs: Array.from(info.attrs || []) });
    }
  }
  return { keepers, copies, rejected };
}

/**
 * Rewrite one reference array so the ids in `swaps` point at their copies.
 *
 * Element shape is preserved — a `ref`, or anything else the pattern writes beside the id, survives
 * untouched — and so is order, which is the rendering order of the page.
 */
function repointRefs(value, swaps) {
  const arr = typeof value === 'string' ? safeJson(value) : value;
  if (!Array.isArray(arr) || !swaps || !swaps.size) return null;
  let changed = false;
  const next = arr.map((el) => {
    if (el && typeof el === 'object') {
      const to = swaps.get(String(el.id));
      if (!to) return el;
      changed = true;
      return { ...el, id: to };
    }
    const to = swaps.get(String(el));
    if (!to) return el;
    changed = true;
    return to;
  });
  return changed ? next : null;
}

/**
 * The INVERSE of `validateParentId`: a row's own write names its children, so stamp them.
 *
 * `validateParentId` asks "may this child name that parent?" — the child states it, which only
 * works when the parent already exists. A page created with its sections in one call does not:
 * the children are written first so their ids can go into the page's array, so there is no id to
 * claim yet. And a child that is merely RE-ARRANGED is not `_dirty`, so it is never re-sent and
 * its claim is never refreshed. Both are answered here, from the one place that always knows:
 * the parent's own write, which carries the arrays.
 *
 * Same declaration as the check, read the other direction, so the two cannot disagree.
 *
 * ---------------------------------------------------------------------------
 * Why the predicate is an exact type string
 *
 * A child's type is fully determined by the owner's: an owner of type `chenango|page` has
 * components `chenango|component` — `getParent(ownerType)` plus the DECLARED child kind. So
 * `type = '{container}|{childKind}'` is `isPlausibleParent`'s rule — same app, same container,
 * declared kind — computed instead of checked, and portable (no `ANY`, no `substring … from`).
 *
 * It is also the security bound. Putting an arbitrary id in your page's `sections` would otherwise
 * capture that row's parentage and hand it your page's grants. This predicate limits that to
 * `{same pattern}|{declared kind}` — rows in a pattern you can already edit a page in, which is
 * exactly the bound the child-side check enforces. **Do not relax it to a kind match.**
 *
 * ---------------------------------------------------------------------------
 * What it does NOT do
 *
 * It never CLEARS a `parent_id`. A child dropped from the array keeps its parent: clearing would
 * need the previous array to diff against, and a save that momentarily omits a section would
 * orphan it. Removal belongs to `--verify-parents` ("named by nobody") and the migration's orphan
 * sweep.
 *
 * It never throws. A parentage failure must not fail a page save — the caller logs and carries on.
 *
 * `data` is the INCOMING patch, not the merged row: `setDataById` merges with `jsonMerge`, so
 * stamping from the result would rewrite every section on a title-only edit. Keying off the patch
 * means only a write that actually names children does any work.
 *
 * Returns the number of rows stamped.
 */
async function stampChildren(tx, { table, app, id, type, data, childRefs }) {
  const attrs = childRefs && childRefs[getKind(type)];
  if (!attrs || !id) return 0;                       // not an owner kind → nothing to do
  const obj = typeof data === 'string' ? safeJson(data) : data;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return 0;
  const container = getParent(type);
  if (!container) return 0;

  let stamped = 0;
  for (const [attribute, childKind] of Object.entries(attrs)) {
    if (!(attribute in obj)) continue;               // not named by THIS write
    const ids = [...new Set(refIdsOf(obj[attribute]))];
    const childTypes = childTypeParams(container, childKind);
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const ph = chunk.map((_, j) => `$${j + 3}`).join(',');
      const rows = await tx.promise(
        `UPDATE ${table} SET parent_id = $1
          WHERE app = $2 AND id IN (${ph})
            AND ${CHILD_TYPE_SQL(chunk.length + 3, chunk.length + 4)}
            AND (parent_id IS NULL OR parent_id <> $1)
          RETURNING id`,
        [id, app, ...chunk, ...childTypes]);
      stamped += (rows && rows.length) || 0;
    }
  }
  return stamped;
}

/**
 * Which children a write DROPPED: ids the owner's declared arrays named BEFORE the write and no
 * longer name AFTER it, grouped by child kind.
 *
 * **A set difference, deliberately — never "rows that nothing names".** A child row is created
 * BEFORE its parent's array is written (that is the whole reason `stampChildren` exists), so for a
 * moment every new section is a row no array names. Sweeping unreferenced rows would race that
 * window and delete sections as they are typed. Sweeping the REMOVED set cannot: a row that was
 * never in the old array is never a candidate, whatever else is true of it.
 *
 * **Grouped by child KIND, not by attribute**, so a row that moved between two attributes declaring
 * the same kind is not a removal. That is load-bearing for the page pattern, where `sections` and
 * `draft_sections` both declare `component`.
 *
 * `after` is the MERGED row as the write returned it, not the patch: a patch that names no child
 * attribute leaves the merged arrays as they were, so it removes nothing. Passing the patch here
 * would read every unmentioned array as emptied.
 */
function planRemovedChildren(before, after, { type, childRefs }) {
  const attrs = childRefs && childRefs[getKind(type)];
  if (!attrs) return [];
  const b = typeof before === 'string' ? safeJson(before) : before;
  const a = typeof after === 'string' ? safeJson(after) : after;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return [];
  // A missing/unparseable `after` means "we cannot tell what survived" — never "nothing did".
  if (after !== null && after !== undefined && (!a || typeof a !== 'object' || Array.isArray(a))) return [];

  const byKind = new Map();
  for (const [attribute, childKind] of Object.entries(attrs)) {
    if (!byKind.has(childKind)) byKind.set(childKind, { old: new Set(), now: new Set() });
    const slot = byKind.get(childKind);
    for (const ref of refIdsOf(b[attribute])) slot.old.add(String(ref));
    if (a) for (const ref of refIdsOf(a[attribute])) slot.now.add(String(ref));
  }

  const out = [];
  for (const [childKind, { old, now }] of byKind) {
    const ids = [...old].filter((ref) => !now.has(ref));
    if (ids.length) out.push({ childKind, ids });
  }
  return out;
}

/**
 * Delete the children a write dropped — the counterpart of `stampChildren`, and the reason
 * `parent_id` can be trusted to mean containment rather than "the last page that happened to
 * mention this row".
 *
 * **`parent_id = <owner>` is the safety bound**, exactly as the exact-type predicate is
 * `stampChildren`'s. A row this owner is not the recorded parent of is never deleted, even when its
 * id appears in the removed set — which is what makes the sweep safe on data where two pages still
 * share a row, and on an unmigrated row (`parent_id IS NULL`), which it simply never matches.
 *
 * `mode`: `off` does nothing, `log` reports what it WOULD delete without deleting, `delete` deletes.
 * Default `log`, because this is the only irreversible thing parentage does.
 */
async function sweepRemovedChildren(tx, { table, app, id, type, removed, mode = 'log' }) {
  const out = { swept: 0, ids: [] };
  if (mode === 'off' || !removed || !removed.length || !id) return out;
  const container = getParent(type);
  if (!container) return out;

  for (const { childKind, ids } of removed) {
    const childTypes = childTypeParams(container, childKind);
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const ph = chunk.map((_, j) => `$${j + 3}`).join(',');
      const where = `WHERE app = $1 AND parent_id = $2 AND id IN (${ph})`
        + ` AND ${CHILD_TYPE_SQL(chunk.length + 3, chunk.length + 4)}`;
      const params = [app, id, ...chunk, ...childTypes];
      const rows = mode === 'delete'
        ? await tx.promise(`DELETE FROM ${table} ${where} RETURNING id`, params)
        : await tx.promise(`SELECT id FROM ${table} ${where}`, params);
      for (const r of (rows || [])) out.ids.push(String(r.id));
    }
  }
  out.swept = out.ids.length;
  return out;
}

/**
 * Every child of an owner that is itself being DELETED.
 *
 * No removed-set subtlety here and no need for the owner's arrays: when the owner goes, every row
 * it is the recorded parent of goes with it, including ones its arrays had already lost track of.
 * There is no race to lose — a child written concurrently for a page being deleted is garbage by
 * the time it lands either way.
 *
 * Still bounded the same two ways: `parent_id = <owner>`, and a type this owner's pattern actually
 * DECLARES as a child. A row that merely sits under the same container is not swept.
 */
async function sweepAllChildren(tx, { table, app, id, type, childRefs, mode = 'log' }) {
  const out = { swept: 0, ids: [] };
  if (mode === 'off' || !id) return out;
  const attrs = childRefs && childRefs[getKind(type)];
  if (!attrs) return out;
  const container = getParent(type);
  if (!container) return out;

  const kinds = [...new Set(Object.values(attrs))];
  if (!kinds.length) return out;
  const parts = [], params = [app, id];
  for (const k of kinds) {
    const [exact, like] = childTypeParams(container, k);
    parts.push(CHILD_TYPE_SQL(params.length + 1, params.length + 2));
    params.push(exact, like);
  }
  const where = `WHERE app = $1 AND parent_id = $2 AND (${parts.join(' OR ')})`;
  const rows = mode === 'delete'
    ? await tx.promise(`DELETE FROM ${table} ${where} RETURNING id`, params)
    : await tx.promise(`SELECT id FROM ${table} ${where}`, params);
  for (const r of (rows || [])) out.ids.push(String(r.id));
  out.swept = out.ids.length;
  return out;
}

module.exports = { planRemovedChildren, sweepRemovedChildren, sweepAllChildren, childTypeParams, isPlausibleParent, takeParentId, validateParentId, refIdsOf, mergeChildRefs,
  declaredChildKinds, planDuplication, repointRefs, stampChildren };
