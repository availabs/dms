// THE JUDGE, on the client — the same functions dms-server decides with (routes/auth/grants.js,
// vocabulary.js, judge.js), so a gate in the UI and the gate on the server read the same rule and
// the same grants and cannot drift.
//
// The two packages share no code, so these are COPIES. `authJudge.sync.test.js` compares each
// function here with its server original, body for body, and fails when they differ: change the
// server, then paste the change here.
//
//   holds(user, grants, perms)                               the name-match over a grant
//   fieldMaps(vocabulary) / verbsForFields(keys, maps, …)    which verbs an edit needs
//   judge(rule, env, { op, keys, patch, row, maps, scope })  the interpreter over a kind's rule
//
// A rule comes from the registry (`getPatternType(type).authRules[kind]`); grants come from the rows
// the client already holds (a pattern's `authPermissions`, the site's). See utils/adminPermissions.js.

// ---- grants.js ----------------------------------------------------------------------------------

const parseJson = (v) => {
  if (v == null) return null;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return v;
};

const asList = (p) => (Array.isArray(p) ? p : p ? [p] : []);

function resolveAuthPermissions(raw, subdomain = '') {
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== 'object') return {};
  if (parsed['*'] !== undefined) return parseJson(parsed[subdomain] !== undefined ? parsed[subdomain] : parsed['*']) || {};
  return parsed;
}

function scopeOf(ap, scope) {
  if (!ap || typeof ap !== 'object') return {};
  if (ap.self === undefined && ap.descendants === undefined) return ap;
  return (scope === 'self' ? ap.self : ap.descendants) || {};
}

const hasGrants = (ap) =>
  Object.keys((ap && ap.groups) || {}).some(g => g !== 'public') || Object.keys((ap && ap.users) || {}).length > 0;

function holds(user, ap, perms) {
  const want = asList(perms);
  if (!want.length) return true;
  const groups = (ap && ap.groups) || {};
  const users = (ap && ap.users) || {};
  const mine = [...new Set([...((user && user.groups) || []), 'public'])];
  const held = [
    ...asList(user && user.id != null ? users[user.id] : null),
    ...mine.flatMap(g => asList(groups[g])),
  ];
  return held.some(p => p === '*' || want.includes(p));
}

const isAppAdmin = (user, app) => !!app && ((user && user.groups) || []).some(g => g === `${app} Admin`);

function mergeAuthPermissions(base = {}, override) {
  if (!override) return base || {};
  const out = { groups: { ...((base && base.groups) || {}) }, users: { ...((base && base.users) || {}) } };
  for (const key of ['users', 'groups']) {
    for (const [who, perms] of Object.entries((override && override[key]) || {})) {
      if (Array.isArray(perms) && perms.length === 0) delete out[key][who];
      else out[key][who] = perms;
    }
  }
  return out;
}

// ---- vocabulary.js ------------------------------------------------------------------------------

const SCOPES = ['self', 'descendants'];

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

// ---- judge.js -----------------------------------------------------------------------------------

const allow = (reason) => ({ allow: true, reason });
const deny  = (reason, extra) => ({ allow: false, reason, ...(extra || {}) });
const list  = (v) => [].concat(v == null ? [] : v);
const STRUCTURAL = ['read', 'create', 'edit', 'delete'];

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

function blankSwap(rule, env, row) {
  const c = rule.ifOwnerBlank;
  if (!c || !(env.user && env.user.authed)) return null;
  if (c.unless && list(c.unless.in).includes((row || {})[c.unless.field])) return null;
  return env.isBlank(env.grants[key(rule.owner)]) ? { owner: c.owner, perms: list(c.perms) } : null;
}

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

/** The `env` a client judge runs with: the user, the grants per owner position, and the two predicates. */
export function judgeEnv(user, grants) {
  return {
    user, grants,
    holds: (ap, perms) => (ap == null ? false : holds(user, ap, perms)),
    isBlank: (ap) => ap != null && !hasGrants(ap) && ap.view !== false,
  };
}

export {
  parseJson, asList, resolveAuthPermissions, scopeOf, hasGrants, holds, isAppAdmin, mergeAuthPermissions,
  fieldMaps, verbsForFields, judge, STRUCTURAL,
};
