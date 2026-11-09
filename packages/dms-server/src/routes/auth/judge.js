'use strict';
/**
 * THE JUDGE — a pure interpreter over a row kind's rule. No I/O, no mode, no logging.
 *
 *     judge(rule, env, { op, keys, patch, split, row, maps, scope, publicRead }) → { allow, reason }
 *
 * A rule (authored in the formats beside the `permissionDomain`, stamped on rows, built-in copy in
 * ./rules.js):
 *
 *     { owner:   'self' | 'parent' | 'ancestor:<kind>' | 'site' | [ … spread ],
 *       escape:  { owner, perms },          satisfied → allow, before anything else
 *       ifOwnerBlank: { owner, perms, unless: { field, in } },
 *                                           a signed-in user on an owner granting nothing is judged there instead
 *       noChange: [verbs],                  an edit changing nothing passes on any of these
 *       appliesWhen: 'split',               the rule applies to split rows only
 *       ops: { read: [verbs], create: …, edit: { byKey, when, onlyKeys, default }, delete: …, '*': … } }
 *
 * A requirement is `[verbs]` (on the rule's owner), `{ owner, perms }`, `{ blank: owner }` (satisfied
 * when that owner grants nothing: how a rule says "a row with no grants is readable") or
 * `{ anyOf: [ … ] }`.
 *
 * `env`: `{ user, grants: { [owner]: grants | null }, holds(grants, perms), isBlank(grants) }`.
 *
 * Reads: `publicRead` passes; a kind with no `read` op is open; otherwise the `read` requirement.
 * Writes: a named verb or `*` on the owner's grants, explicitly; nothing is open by absence.
 * Any other verb (`update-source`, `auth-users`, a capability) is asked of the rule's owner by name.
 */
const { verbsForFields } = require('./vocabulary');

const allow = (reason) => ({ allow: true, reason });
const deny  = (reason, extra) => ({ allow: false, reason, ...(extra || {}) });
const list  = (v) => [].concat(v == null ? [] : v);
const STRUCTURAL = ['read', 'create', 'edit', 'delete'];

// A requirement is { owner, perms } or { anyOf: [ … ] }. Normalise the shorthands a rule may use.
const one = (c, defaultOwner) =>
  c.blank !== undefined ? { blank: c.blank === true ? defaultOwner : c.blank } : { owner: c.owner || defaultOwner, perms: list(c.perms) };
const req = (clause, defaultOwner) =>
  Array.isArray(clause) || typeof clause === 'string'
    ? [{ owner: defaultOwner, perms: list(clause) }]
    : clause.anyOf
      ? [{ anyOf: clause.anyOf.map(c => one(c, defaultOwner)) }]
      : [one(clause, defaultOwner)];

const key = (owner) => (Array.isArray(owner) ? owner.join('+') : owner);

const satisfied = (env, r) =>
  r.anyOf ? r.anyOf.some(alt => satisfied(env, alt))
    : r.blank !== undefined ? env.isBlank(env.grants[key(r.blank)])
    : env.holds(env.grants[key(r.owner)], r.perms);

// `ifOwnerBlank`: a signed-in user's requirements on a blank owner are checked as this clause instead.
function blankSwap(rule, env, row) {
  const c = rule.ifOwnerBlank;
  if (!c || !(env.user && env.user.authed)) return null;
  if (c.unless && list(c.unless.in).includes((row || {})[c.unless.field])) return null;
  return env.isBlank(env.grants[key(rule.owner)]) ? { owner: c.owner, perms: list(c.perms) } : null;
}

/**
 * Which requirements an edit's changed keys produce. The declaration wins: when the governing
 * vocabulary says which fields each verb governs, that answers the question for those keys. The
 * spec's own `byKey` / `when` / `onlyKeys` remain for a key no vocabulary claimed — a field judged
 * against a DIFFERENT owner's grants (the site row's `dms_envs`) — and for a chain declaring nothing.
 */
function editRequirements(spec, defaultOwner, { keys, patch, maps, scope }) {
  if (Array.isArray(spec)) return req(spec, defaultOwner);
  const out = [];
  let rest = keys;
  if (maps) {
    const { groups, covered } = verbsForFields(keys, maps, patch, scope);
    out.push(...groups.map(perms => ({ owner: defaultOwner, perms })));
    rest = keys.filter(k => !covered.includes(k));
    if (!keys.length && groups.length) return out;
  }
  const matched = new Set();
  for (const k of rest) {
    if (spec.byKey && spec.byKey[k]) { out.push(...req(spec.byKey[k], defaultOwner)); matched.add(k); }
  }
  for (const w of spec.when || []) {
    const hit = rest.some(k => (w.keyIn ? w.keyIn.includes(k) : w.key === k) && (w.valueNot === undefined || patch[k] !== w.valueNot));
    if (hit) {
      out.push(...req(w.perms, defaultOwner));
      rest.filter(k => (w.keyIn ? w.keyIn.includes(k) : w.key === k)).forEach(k => matched.add(k));
    }
  }
  for (const o of spec.onlyKeys || []) {
    if (rest.length > 0 && rest.every(k => o.keys.includes(k))) return req(o.perms, defaultOwner);
  }
  if (spec.default && rest.some(k => !matched.has(k))) out.push(...req(spec.default, defaultOwner));
  return out;
}

function judge(rule, env, { op, keys = [], patch = {}, split = false, row = {}, maps = null, scope = 'flat', publicRead = false }) {
  if (op === 'read' && publicRead) return allow('public read');

  const applies = rule && (rule.appliesWhen !== 'split' || split);
  if (!applies) {
    if (op === 'read') return allow('read: no rule');
    return env.user && env.user.authed ? allow('signed in') : deny('sign in required');
  }

  if (rule.escape && satisfied(env, req(rule.escape, rule.owner)[0])) return allow('escape');

  const own = env.grants[key(rule.owner)];
  if (op === 'read' && rule.ops.read === undefined) return allow('read: open');

  const swap = blankSwap(rule, env, row);
  const check = (r) => (swap && !r.anyOf && key(r.owner) === key(rule.owner) ? satisfied(env, swap) : satisfied(env, r));

  if (op === 'edit' && keys.length === 0 && rule.noChange) {
    if (check({ owner: rule.owner, perms: list(rule.noChange) })) return allow('no change');
    const blank = !swap && own != null && env.isBlank(own);
    return deny(`missing ${list(swap ? swap.perms : rule.noChange).join(' or ')}${blank ? '; blank row (no grants: edits need an explicit grant)' : ''}`, blank ? { blank: true } : undefined);
  }

  let requirements;
  if (!STRUCTURAL.includes(op)) {
    requirements = [{ owner: rule.owner, perms: list(op) }];          // a named verb, asked of the owner
  } else {
    const spec = rule.ops[op] !== undefined ? rule.ops[op] : rule.ops['*'];
    if (spec === undefined) return deny(`no rule for ${row.kind || 'row'}/${op}`);
    requirements = op === 'edit' ? editRequirements(spec, rule.owner, { keys, patch, maps, scope }) : req(spec, rule.owner);
  }

  for (const r of requirements) {
    if (!check(r)) {
      const p = r.anyOf ? r.anyOf.flatMap(a => a.perms || []) : swap && key(r.owner) === key(rule.owner) ? swap.perms : r.perms;
      // A write refused on an owner that grants nothing is refused by the blank-row rule alone
      // (owner 2026-10-29: a row with no grants is read-only). `report.js` reads the mark.
      const blank = !swap && !r.anyOf && key(r.owner) === key(rule.owner) && own != null && env.isBlank(own);
      return blank ? deny(`missing ${p.join(' or ')}; blank row (no grants: edits need an explicit grant)`, { blank: true })
                   : deny(`missing ${p.join(' or ')}`);
    }
  }
  return allow('granted');
}

/** Every owner a rule names: its default, plus any clause's own. */
function ownersIn(rule) {
  const out = new Map();
  const add = (o) => { if (o) out.set(key(o), o); };
  add(rule.owner);
  const walk = (n) => {
    if (n && typeof n === 'object') {
      if (typeof n.owner === 'string' || Array.isArray(n.owner)) add(n.owner);
      if (typeof n.blank === 'string' || Array.isArray(n.blank)) add(n.blank);
      for (const v of Object.values(n)) walk(v);
    }
  };
  walk(rule);
  return [...out.values()];
}

module.exports = { judge, ownersIn, STRUCTURAL };
