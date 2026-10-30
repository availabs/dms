'use strict';
// Trial (DMS_DATA_AUTH_JUDGE=data): judge.cjs from auth-as-data (2026-10-27), unchanged. A pure interpreter over authRules.js.
const allow = (reason) => ({ allow: true, reason });
const deny  = (reason) => ({ allow: false, reason });
const list  = (v) => [].concat(v == null ? [] : v);

// A requirement is { owner, perms }. Normalise the shorthands the rules file uses.
const req = (clause, defaultOwner) =>
  Array.isArray(clause) || typeof clause === 'string'
    ? [{ owner: defaultOwner, perms: list(clause) }]
    : clause.anyOf
      ? [{ anyOf: clause.anyOf.map(c => ({ owner: c.owner || defaultOwner, perms: list(c.perms) })) }]
      : [{ owner: clause.owner || defaultOwner, perms: list(clause.perms) }];

const satisfied = (env, r) =>
  r.anyOf ? r.anyOf.some(alt => satisfied(env, alt))
          : env.holds(env.grants[r.owner], r.perms);

// Which requirements an edit's changed keys produce.
function editRequirements(spec, defaultOwner, { keys, patch }) {
  if (Array.isArray(spec)) return req(spec, defaultOwner);
  const out = [];
  const matched = new Set();

  for (const k of keys) {
    if (spec.byKey && spec.byKey[k]) { out.push(...req(spec.byKey[k], defaultOwner)); matched.add(k); }
  }
  for (const w of spec.when || []) {
    const hit = keys.some(k =>
      (w.keyIn ? w.keyIn.includes(k) : w.key === k) &&
      (w.valueNot === undefined || patch[k] !== w.valueNot));
    if (hit) {
      out.push(...req(w.perms, defaultOwner));
      keys.filter(k => (w.keyIn ? w.keyIn.includes(k) : w.key === k)).forEach(k => matched.add(k));
    }
  }
  for (const o of spec.onlyKeys || []) {
    if (keys.length > 0 && keys.every(k => o.keys.includes(k))) return req(o.perms, defaultOwner);
  }
  if (spec.default && keys.some(k => !matched.has(k))) out.push(...req(spec.default, defaultOwner));
  return out;
}

function judge(rules, env, { kind, op, keys = [], patch = {}, split = false }) {
  if (env.isAppAdmin) return allow('app admin');

  const rule = rules[kind];
  const applies = rule && (rule.appliesWhen !== 'split' || split);
  if (!applies) {
    return rules.DEFAULT.signedIn && env.user && env.user.authed
      ? allow('signed in') : deny('sign in required');
  }

  if (rule.escape && satisfied(env, req(rule.escape, rule.owner)[0])) return allow('escape');

  const noChange = op === 'edit' && keys.length === 0;
  if (noChange && rule.noChange) {
    return satisfied(env, { owner: rule.owner, perms: list(rule.noChange) })
      ? allow('no change') : deny(`missing ${list(rule.noChange).join(' or ')}`);
  }

  const spec = rule.ops[op] !== undefined ? rule.ops[op] : rule.ops['*'];
  if (spec === undefined) return deny(`no rule for ${kind}/${op}`);

  const requirements = op === 'edit'
    ? editRequirements(spec, rule.owner, { keys, patch })
    : req(spec, rule.owner);

  for (const r of requirements) {
    if (!satisfied(env, r)) {
      const p = r.anyOf ? r.anyOf.flatMap(a => a.perms) : r.perms;
      return deny(`${kind} missing ${p.join(' or ')}`);
    }
  }
  return allow(`${kind} grant`);
}

/**
 * THE BOUNDARY. These are the only things the interpreter cannot do, and they are all the same
 * question: "which row's grants govern this row?" Each is a lookup the caller performs first.
 *
 *   site-grants         the admin pattern row's grants, falling back to the auth pattern's
 *   datasets-grants     the union of the app's datasets patterns' grants
 *   self-pattern        this row
 *   parent-pattern      the content pattern named by the type's parent segment
 *   parent-pattern+row  that pattern's grants merged with this row's own
 *   self-source         this source row (via the datasets source check)
 *   owning-source       the source this view belongs to      ← a JOIN, resolved by lookup
 *   source-by-slug      the source named by the type's parent segment
 *
 * Every one of these is "find my owner". `parent_id` names the owner as data and makes the whole
 * list collapse to one walk — which is the point of the chain design.
 */
module.exports = { judge, RESOLVER_NAMES: [
  'site-grants', 'datasets-grants', 'self-pattern', 'parent-pattern',
  'parent-pattern+row', 'self-source', 'owning-source', 'source-by-slug',
] };
