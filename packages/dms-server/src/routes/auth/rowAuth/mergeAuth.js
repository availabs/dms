'use strict';

/**
 * The auth merge — the pure half of row auth.
 *
 * Design and reasoning: planning/tasks/current/server-side-auth-general.md (hub).
 * This file holds NO knowledge of any row type, pattern or app, and touches no database. It takes a
 * chain of auth objects (root → leaf) and answers one question about the result. That is deliberate:
 * a type-keyed rule cannot be shared across surfaces that do not share types, which is why DMS grew
 * five separate "may this user do X" implementations. See the hub, "One decision function".
 *
 * ---------------------------------------------------------------------------
 * The shape
 *
 *   { groups: { 'Planning Staff': ['read','edit'] },
 *     users:  { 'u_1842': ['read','edit'] },
 *     otherwise: ['read'] }                       // the ceiling for anyone not named
 *
 * A row may instead split by scope, when it delegates differently than it governs itself:
 *
 *   { self:        { groups: { Admins:  ['read','edit'] } },   // governs THIS row
 *     descendants: { groups: { Editors: ['read','edit'] } } }  // governs rows BENEATH it
 *
 * A flat object means BOTH — that is the common case and carries no scope keys. Legacy
 * `data.authPermissions` is flat and already meant both: today `patternCan` reads it for
 * `edit-pattern` (self) and dms.route.js's page gate reads the same object for pages (descendants).
 * So coalescing legacy values reinterprets nothing.
 *
 * ---------------------------------------------------------------------------
 * The five rules
 *
 *  1. Merge PER PRINCIPAL, never per permission. A child's entry for a group replaces the parent's
 *     entry for that group, wholesale. Permission arrays are never combined element-wise — lodash
 *     `merge` combines arrays BY INDEX, which turns ['read'] over ['read','edit'] into both. The same
 *     trap mergeTheme documents for `fonts` (packages/dms/src/ui/useTheme.js).
 *  2. A principal the child does not name KEEPS what the chain gave it. This is what makes it a
 *     merge rather than a replace — and why listing your members does not, by itself, make a row
 *     private.
 *  3. A child may only NARROW — but only where an ancestor actually spoke. If no ancestor ever
 *     mentioned a principal there is no ceiling and the child may grant freely. Clamping unmentioned
 *     principals to a default makes the FIRST grant in any chain impossible: the chat pattern grants
 *     `members`, the site above it never mentioned them, and nobody could post.
 *  4. `otherwise` caps every principal this object does not name — and `public` EVEN WHEN IT DOES.
 *     Every user is in `public` (routes/dms/auth.js) and the Access editor seeds it into everything
 *     it saves, so without that exception a seeded `public: ['read']` punches straight through
 *     `otherwise: []` and nothing could ever be made private through the UI.
 *  5. An empty result is NOT a denial. It means nothing was ever stated, which the caller turns into
 *     the agreed default: read allowed, edit denied.
 *
 * `'*'` as a VALUE means every verb. It is expanded here, at resolve time rather than on save, so a
 * verb added later is picked up by grants already written. It cannot escalate: a child granting
 * ['*'] under a parent that allowed only ['read'] still yields ['read'].
 */

/**
 * The structural verbs — the complete server vocabulary, and it never grows by configuration.
 *
 * A verb belongs here only if the server can identify it FROM THE OPERATION ALONE, with no knowledge
 * of the row's type. That is the whole test, and it is why the list is five rather than twenty-one:
 * the server may only be trusted with a verb it can determine itself, because the alternative is
 * letting the caller name its own check (a client picks the weakest) or deriving it from the row's
 * type (per-type knowledge, a server registry, a deploy per pattern).
 *
 *   read    the request returns row data
 *   create  a create route — no row exists yet, so it resolves against the PARENT
 *   edit    the request modifies an existing row
 *   delete  a delete route
 *   grant   the write touches the auth column — the escalation guard, made structural
 *
 * Pattern verbs (`publish-page`, `download-source`, `view-as`, …) are NOT here and never will be:
 * the server cannot tell what they do without knowing the type. They live in the same auth object,
 * are merged and clamped by this file like any other string, and are checked by the client.
 */
const VERBS = Object.freeze(['read', 'create', 'edit', 'delete', 'grant']);

const ALL = '*';

/** A principal's stated permissions, or null for "not mentioned" (rule 2 vs rule 3 turn on this). */
function expand(perms) {
  if (perms === undefined || perms === null) return null;
  const list = Array.isArray(perms) ? perms : [perms];
  if (list.includes(ALL)) return [...VERBS];
  // Unknown strings (pattern verbs) are carried through untouched: the server ignores them for
  // enforcement, but they must survive the merge so the client can still check them.
  return [...list];
}

/** Only the five are structural; everything else is a pattern verb we carry but never enforce. */
const isStructural = (v) => VERBS.includes(v);

/**
 * What an ancestor granted a principal (rule 3).
 *
 * `explicitOnly` is the subtle half. An ancestor's `otherwise` ceiling binds principals the child
 * does NOT name — but when the child names a principal deliberately, only an explicit ancestor entry
 * for that same principal clamps it.
 *
 * Why: without this, `otherwise: []` on a channel makes it impossible for any descendant to grant a
 * USER directly, because ancestors name groups, not individuals. That breaks "only the author may
 * edit their own message" — the message names `users: { u2: [...] }`, u2 was never named above, and
 * the ceiling would wipe it. Owner's requirement: "to prevent someone editing someone else's message
 * you simply add the more specific edit:user_id to that message."
 *
 * The cost is deliberate and bounded: a row may name a principal its ancestors never mentioned.
 * Writing a row's auth requires `grant`, which is itself inherited and clamped — so widening is
 * available only to someone already trusted to administer permissions on that row, which is the
 * ordinary meaning of `grant`. Principals an ancestor DID name can still only be narrowed.
 */
function ceilingFor(parent, kind, principal, explicitOnly) {
  const own = expand(parent && parent[kind] && parent[kind][principal]);
  if (own) return own;
  if (explicitOnly) return null;
  const any = expand(parent && parent.otherwise);
  if (any) return any;
  return null;
}

/**
 * Merge one level onto the resolved parent. `child` is one ancestor's `descendants` block, or the
 * judged row's own `self` block. Returns a new object; neither argument is mutated.
 */
function mergeAuthLevel(parent, child) {
  const out = { groups: {}, users: {} };
  const childCeiling = expand(child && child.otherwise);

  for (const kind of ['groups', 'users']) {
    const principals = new Set([
      ...Object.keys((parent && parent[kind]) || {}),
      ...Object.keys((child && child[kind]) || {}),
    ]);
    for (const p of principals) {
      const named = expand(child && child[kind] && child[kind][p]);
      // Rule 4: the child's ceiling caps principals it does not name — and `public` even when it
      // does, because `public` is everybody and the Access editor seeds it everywhere.
      const capped = (named === null || (kind === 'groups' && p === 'public')) ? childCeiling : null;
      // Rules 1 + 2: the child's entry wins wholesale; otherwise keep what the chain gave.
      const stated = named !== null ? named : childCeiling;
      // Rule 3: an ancestor ceiling binds only where an ancestor actually spoke. A principal the
      // child names deliberately is clamped only by an EXPLICIT ancestor entry (see ceilingFor).
      const ceiling = ceilingFor(parent, kind, p, named !== null);
      let value = stated !== null && stated !== undefined ? stated : (ceiling || []);
      if (capped) value = value.filter(v => capped.includes(v) || !isStructural(v));
      out[kind][p] = ceiling
        ? value.filter(v => ceiling.includes(v) || !isStructural(v))
        : value;
    }
  }

  if ((child && child.otherwise !== undefined) || (parent && parent.otherwise !== undefined)) {
    out.otherwise = childCeiling || expand(parent && parent.otherwise) || [];
  }
  return out;
}

/** A level's "what I hand down" half. A flat object hands itself down (the common case). */
const handsDown = (level) => (level && level.descendants) ? level.descendants : level;

/** A level's "what governs me" half. A row that splits and states no `self` governs itself with nothing. */
const governsSelf = (level) =>
  (level && level.self) ? level.self : ((level && level.descendants) ? {} : level);

/**
 * Resolve a chain into the auth that governs its LAST entry.
 *
 * `chain` runs root → leaf, each entry an auth object (flat, or `{self, descendants}`). Every
 * ancestor contributes its `descendants`; the judged row contributes its `self`.
 */
function mergeAuthChain(chain) {
  const list = (chain || []).filter(Boolean);
  if (!list.length) return { groups: {}, users: {} };
  const inherited = list.slice(0, -1).reduce(
    (acc, level) => mergeAuthLevel(acc, handsDown(level)),
    { groups: {}, users: {} }
  );
  return mergeAuthLevel(inherited, governsSelf(list[list.length - 1]));
}

/**
 * Does `user` hold `verb` under a merged auth object?
 *
 * A user's permissions are the UNION across every group they are in plus their own entry — which is
 * why `otherwise` has to be a ceiling applied during the merge rather than a grant checked here: a
 * union can never subtract.
 *
 * `public` is unioned in for everyone, signed in or not, mirroring routes/dms/auth.js.
 */
function can(merged, user, verb) {
  if (!merged) return false;
  const held = new Set();
  const groups = [...new Set([...((user && user.groups) || []), 'public'])];
  for (const g of groups) {
    const entry = (merged.groups && merged.groups[g] !== undefined)
      ? merged.groups[g]
      : merged.otherwise;
    (entry || []).forEach(v => held.add(v));
  }
  const own = merged.users && user && merged.users[user.id];
  (own || []).forEach(v => held.add(v));
  return held.has(verb) || held.has(ALL);
}

/** True when nothing anywhere in the chain stated anything — rule 5's "empty is not a denial". */
const isUnstated = (merged) =>
  !merged
  || (Object.keys(merged.groups || {}).length === 0
      && Object.keys(merged.users || {}).length === 0
      && merged.otherwise === undefined);

module.exports = { VERBS, mergeAuthChain, mergeAuthLevel, can, isUnstated, expand };
