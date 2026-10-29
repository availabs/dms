'use strict';

/**
 * The row-auth gate — what every surface calls.
 *
 * `rowAuth.js` resolves ancestry, `mergeAuth.js` merges it; this turns a merged object into a
 * verdict, applies the hub's defaults, and handles the rollout mode. It is the only place that knows
 * what an UNSTATED chain means, because that is policy rather than mechanism.
 *
 * Design: planning/tasks/current/server-side-auth-general.md (hub).
 *
 * ---------------------------------------------------------------------------
 * Defaults (hub, "Direction settled: strict defaults")
 *
 *   - A blank chain is READABLE. Strict-as-deny-everything would lock out whoever has to set the
 *     first grant, and would break every app that has never configured permissions.
 *   - Writes (`create` / `edit` / `delete` / `grant`) REQUIRE a grant. No "unconfigured ⇒ a
 *     signed-in user may".
 *   - Anonymous callers pass only where `public` explicitly holds the permission — unchanged from
 *     the existing rule in routes/dms/auth.js.
 *   - `${app} Admin` always passes: the bootstrap escape, kept from both designs.
 *
 * ---------------------------------------------------------------------------
 * Rollout
 *
 * `DMS_ROW_AUTH_MODE`: `legacy` | `log` | `enforce`, default **`log`**.
 *
 *   legacy   nothing is checked — today's behaviour exactly.
 *   log      today's behaviour, and every request the new rule WOULD refuse is written out as
 *            `[row-auth] would-deny …` so grants can be fixed before anything flips.
 *   enforce  the rule decides.
 *
 * Its own flag rather than reusing `DMS_READ_AUTH_MODE` (datasets reads) or `DMS_DATA_AUTH_MODE`
 * (dms writes): those gate existing, separately-owned checks, and flipping one must not silently
 * flip this.
 *
 * **Before flipping any app to `enforce`, check parent-resolution coverage for it** (hub). A row
 * that is private only by inheritance opens up when its parent cannot be resolved — measured at
 * 99.2% derivable on `mitigat-ny-prod`, so the exposed set is small but not empty.
 */

const { createResolver } = require('./rowAuth');
const { can, isUnstated, VERBS } = require('./mergeAuth');

function rowAuthMode() {
  const m = String(process.env.DMS_ROW_AUTH_MODE || 'log').toLowerCase();
  return ['legacy', 'log', 'enforce'].includes(m) ? m : 'log';
}

/** `${app} Admin` — the same group check the rest of DMS uses. */
const isAppAdmin = (user, app) => !!(user && (user.groups || []).some(g => g === `${app} Admin`));

/**
 * Does `user` hold `verb` under `merged`?
 *
 * Rule 5 lives here: an unstated chain is not a denial. It means nothing was ever configured, which
 * is read-allowed and edit-denied — NOT deny-everything, and NOT allow-everything.
 */
function verdict(merged, user, verb, app) {
  if (isAppAdmin(user, app)) return { allow: true, reason: `${app} Admin` };
  if (isUnstated(merged)) {
    return verb === 'read'
      ? { allow: true, reason: 'nothing stated — read is the default' }
      : { allow: false, reason: 'nothing stated — writes need a grant' };
  }
  return can(merged, user, verb)
    ? { allow: true, reason: 'granted' }
    : { allow: false, reason: `missing ${verb}` };
}

function logWouldDeny(app, row, user, verb, reason) {
  console.warn(
    `[row-auth] would-deny ${verb} ${app}/${row && row.id} type=${row && row.type} ` +
    `user=${(user && (user.id ?? user.email)) ?? 'anon'} ` +
    `groups=${((user && user.groups) || []).join('|')} reason=${reason}`
  );
}

/**
 * A gate bound to one app and one caller.
 *
 * `controller` supplies the two loaders (`authRowsByIds`, `authContainers`); passing it rather than
 * a database keeps this module free of the table resolver, and lets sync hand in rows it has
 * already fetched.
 */
function createGate({ controller, app, user, subdomain = '', mode: modeOverride = null }) {
  // `modeOverride` lets a surface run under its OWN rollout flag while sharing this gate. The write
  // surface below uses it to stay on `DMS_DATA_AUTH_MODE`, so moving writes here does not drag them
  // under the read flag — and so the existing write-path suite still drives them.
  const modeNow = () => modeOverride || rowAuthMode();
  const resolver = createResolver({
    loadByIds: (ids) => controller.authRowsByIds(ids, app),
    loadContainers: () => controller.authContainers(app),
    subdomain,
  });

  /**
   * Judge many rows at once — the shape every surface wants, and the one that scales: ancestry is
   * resolved breadth-first in ~depth queries regardless of how many rows are asked about.
   *
   * Returns `Map(id → { allow, reason })`. In `legacy` and `log` the verdict is always allow; `log`
   * additionally writes a would-deny line for each row the rule would refuse.
   */
  async function judge(rows, verb = 'read') {
    const mode = modeNow();
    const out = new Map();
    const list = (rows || []).filter(r => r && r.id != null);
    if (!list.length) return out;

    if (mode === 'legacy') {
      for (const r of list) out.set(String(r.id), { allow: true, reason: 'legacy' });
      return out;
    }

    const merged = await resolver.resolve(list);
    for (const row of list) {
      const id = String(row.id);
      const v = verdict(merged.get(id), user, verb, app);
      if (!v.allow && mode === 'log') {
        logWouldDeny(app, row, user, verb, v.reason);
        out.set(id, { allow: true, reason: `would-deny (${v.reason})` });
      } else {
        out.set(id, v);
      }
    }
    return out;
  }

  /** One row. A create judges its PARENT, since the row does not exist yet — use `judgeCreate`. */
  async function judgeOne(row, verb = 'read') {
    const m = await judge([row], verb);
    return m.get(String(row && row.id)) || { allow: true, reason: 'no row' };
  }

  /** A create resolves against the parent's chain: the new row has no auth of its own yet. */
  async function judgeCreate(parentRow) {
    const mode = modeNow();
    if (mode === 'legacy') return { allow: true, reason: 'legacy' };
    const merged = await resolver.resolveForCreate(parentRow);
    const v = verdict(merged, user, 'create', app);
    if (!v.allow && mode === 'log') {
      logWouldDeny(app, parentRow || {}, user, 'create', v.reason);
      return { allow: true, reason: `would-deny (${v.reason})` };
    }
    return v;
  }

  return { judge, judgeOne, judgeCreate, resolver };
}

// ===========================================================================
// The WRITE surface — dataAuth.js's API, judged by this gate
//
// `routes/dms/dataAuth.js` is KIND auth: a `switch` over eleven row kinds, each with hand-written
// rules. It stays exactly as it is — untouched, still the live gate for any surface whose `require`
// still points at it — and will be deleted when the owner says so (2026-10-29: "keep the rowAuth and
// kindAuth separate. I will remove kind auth when the time is right").
//
// This section is its row-based twin, with the SAME exports and the SAME signatures, so a surface
// moves by changing one import line and moves back the same way.
//
// It lives here rather than in a file of its own because task 7's completion test is "one decision
// module", and this file already claims that role at the top: reads come through `judge`, writes
// come through `assertDataWrite`, and both end at the same `verdict`.
//
// What changes behind the identical API:
//
//   - **No `getKind` switch.** A write is judged against the row's own merged chain, so a kind
//     nobody wrote a case for INHERITS rather than falling through to a default. That is the whole
//     point of the exercise (hub: "The default must be inheritance, never permission").
//   - **Five structural verbs** replace the per-kind permission names. What a legacy permission
//     string confers is `LEGACY_IMPLIES` in legacyVerbs.js — one table, in one place, meant to be
//     deleted once every pattern declares its own vocabulary.
//   - **A create is judged against its PARENT's chain**, since the row does not exist yet.
//   - **The mode flag is `DMS_ROW_AUTH_MODE`**, not `DMS_DATA_AUTH_MODE`. Swapping the import swaps
//     which flag governs that surface; both default to `log`, so the swap by itself refuses nothing
//     and changes no behaviour.
//   - **Mode is handled once.** `judge`/`judgeOne`/`judgeCreate` already apply it and already write
//     the would-deny line, so `assertDataWrite` has no `log` branch of its own — it would be a
//     second place for the rollout to be wrong.
// ===========================================================================

const { isEqual } = require('lodash');
const { getParent } = require('#db/type-utils.js');
const { parentIdOf } = require('./rowAuth');
const { expandLegacy } = require('./legacyVerbs');
const { takeParentId, isPlausibleParent } = require('./parentId');

const parseJson = (v) => {
  if (v == null) return null;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return v;
};

// Row columns some clients copy into a whole-row save's data. The timestamps / authors are never
// judged and never written into data; `id` / `app` / `type` count as unchanged when they equal the
// stored data's value or the row's own column (the site editor echoes `type: 'prod:site'`).
const ECHO_ONLY = ['created_at', 'updated_at', 'created_by', 'updated_by'];
const ROW_KEYS = ['id', 'app', 'type'];

// Changing these IS changing the grant, whatever kind the row is — so it needs `grant`, not just
// `edit`. The ONLY key-sensitive rule here, and deliberately so (owner, 2026-10-29: row auth stays
// five structural verbs on a row; which attribute needs which verb is business logic and belongs in
// the pattern, not the server). This one survives that line because the auth object is not business
// data — it is the permission system's own state, `grant` is already a structural verb, and without
// it anyone holding `edit` can grant themselves anything.
//
// See planning/tasks/current/row-auth-dms-writes.md, "Field-level rules are out of scope", for what
// is given up: publish-page, edit-page-params and edit-source-data stop being enforced server-side.
const GRANT_KEYS = ['authPermissions', 'auth', 'auth_permissions'];

/**
 * How an edit is judged and what it writes — carried over verbatim from dataAuth.js, because it is
 * the one part of that file with no kind knowledge in it.
 *
 * Editors often save whole rows (the site editor sends `site_name` with a new `patterns` list; the
 * pattern editor its unchanged `authPermissions`), so a key equal to the stored value is not a
 * change. It is also NOT WRITTEN: `write` holds only the changed keys, each of which the guard
 * judged.
 *
 * `replace` (sync/push I onto an existing row: the whole data is replaced): a stored key the patch
 * leaves out is removed, so it is a change too; `write` is the full new data, with every key judged
 * unchanged taken from the stored row. Without the stored row (split rows) every key is a change
 * and the patch is written as sent. Returns `{ keys, write }`.
 */
function planEdit(row, patch, { replace = false } = {}) {
  const p = parseJson(patch) || {};
  const st = parseJson(row && row.data);
  if (!st) return { keys: Object.keys(p).filter(k => !ECHO_ONLY.includes(k)), write: p };
  const unchanged = (k) => isEqual(p[k], st[k])
    || (ROW_KEYS.includes(k) && row[k] != null && String(p[k]) === String(row[k]));
  const sent = Object.keys(p).filter(k => !ECHO_ONLY.includes(k));
  const changed = sent.filter(k => !unchanged(k));
  const removed = replace ? Object.keys(st).filter(k => !ECHO_ONLY.includes(k) && !(k in p)) : [];
  const pick = (obj, ks) => Object.fromEntries(ks.map(k => [k, obj[k]]));
  const write = replace
    ? { ...pick(st, Object.keys(st).filter(k => ECHO_ONLY.includes(k))),
        ...pick(st, sent.filter(unchanged)), ...pick(p, changed) }
    : pick(p, changed);
  return { keys: [...changed, ...removed], write };
}

/**
 * The structural verbs a legacy permission string requires — ALL of them, not any.
 * `edit-pattern-permissions` implies read + edit + grant, and an action behind it needs all three.
 * A string the table does not know confers nothing, so it is treated as a plain write.
 */
function verbsFor(perms) {
  const named = expandLegacy([].concat(perms || [])).filter(v => VERBS.includes(v));
  return named.length ? named : ['edit'];
}

/**
 * The WRITE surface's rollout flag — still `DMS_DATA_AUTH_MODE`, deliberately.
 *
 * Moving dms writes onto this gate must not also put them under the READ flag: the two surfaces are
 * separately shippable (hub, task 2), and the existing write-path suite drives `DMS_DATA_AUTH_MODE`.
 * Same three values, same default (`log`), so swapping the import refuses nothing by itself.
 */
function dataAuthMode() {
  const m = String(process.env.DMS_DATA_AUTH_MODE || 'log').toLowerCase();
  return ['legacy', 'log', 'enforce'].includes(m) ? m : 'log';
}

/**
 * WHICH judge the write surface uses: `DMS_WRITE_GATE` = `kind` (default) | `row`.
 *
 * All three write call sites now import from this file, but the default behaviour is still KIND
 * auth — this delegates to dataAuth.js untouched. That is what keeps the other author's suite
 * (`tests/test-data-auth.js`, 49 cases) meaningful and green while the row judge is built out, and
 * it makes the switch a one-variable experiment instead of a one-way edit.
 *
 * `DMS_WRITE_GATE=row` runs the judge below. The gap between the two is not a bug list — three of
 * its four causes are decisions the hub already made (strict defaults; which verb governs which
 * FIELD belongs in the pattern's format, not in a per-kind `switch`). See
 * planning/tasks/current/row-auth-dms-writes.md.
 */
function writeGate() {
  return String(process.env.DMS_WRITE_GATE || 'kind').toLowerCase() === 'row' ? 'row' : 'kind';
}

/**
 * One judge per write. `ctx`: `{ app, subdomain, user, controller }` — the same shape dataAuth.js
 * takes, so a call site swaps the import and nothing else.
 */
function createJudge(ctx) {
  if (writeGate() === 'kind') return require('./dataAuth').createJudge(ctx);
  return createRowJudge(ctx);
}

function createRowJudge({ app, subdomain = '', user, controller }) {
  const gate = createGate({ controller, app, user, subdomain, mode: dataAuthMode() });

  let patternRows;
  const patterns = async () => {
    if (!patternRows) {
      patternRows = (await controller.getPatternRows(app)).map(r => ({
        id: r.id, type: r.type, data: parseJson(r.data) || {},
      }));
    }
    return patternRows;
  };

  /** The root of this app's chain — the row nothing contains. Structural, never `:site`. */
  async function rootRow() {
    for (const r of (await gate.resolver.containers()).values()) {
      if (!getParent(r.type) && !parentIdOf(r)) return r;
    }
    return null;
  }

  /**
   * What a CREATE is judged against. The row does not exist yet, so it inherits the chain of
   * whatever will contain it: the parent the client claimed, else the container its type names.
   *
   * THE CLAIM IS VALIDATED HERE, NOT JUST LATER. `validateParentId` runs in `createData`, which is
   * after this guard has already allowed or refused the write — too late to un-allow it. Judging an
   * unvalidated claim would let the CALLER PICK THE CHAIN: name any row in the app with loose
   * grants, be judged against it, and the create succeeds even though `validateParentId` then drops
   * the claim and the row ends up with no parent at all. Same two checks, same helper, run here
   * first; a claim that fails falls back to the container rather than erroring, which is the
   * stricter of the two answers.
   */
  async function parentRowFor(row) {
    const { claimed } = takeParentId(row && row.data);
    if (claimed) {
      const [p] = await controller.authRowsByIds([String(claimed)], app);   // app-scoped by query
      const ownerKind = controller.ownerKindForType
        ? await controller.ownerKindForType(app, row.type) : null;
      if (p && isPlausibleParent(row.type, p.type, ownerKind)) return p;
      if (p) {
        console.warn(`[row-auth] ${app}/${row.type} claims parent ${claimed} (${p.type}), which is `
          + `not a plausible parent — judging against its container instead`);
      }
    }
    const seg = row && row.type ? getParent(row.type) : null;
    if (!seg) return null;
    return (await gate.resolver.containers()).get(seg) || null;
  }

  const decide = async (op, row, patch, keys = op === 'edit' ? planEdit(row, patch).keys : []) => {
    try {
      if (op === 'create') return await gate.judgeCreate(await parentRowFor(row));
      // The escalation guard, and the only key-sensitive rule here.
      if (op === 'edit' && keys.some(k => GRANT_KEYS.includes(k))) {
        const g = await gate.judgeOne(row, 'grant');
        if (!g.allow) return g;
      }
      return await gate.judgeOne(row, op === 'delete' ? 'delete' : 'edit');
    } catch (e) {
      return { allow: false, reason: `lookup failed: ${e.message}` };   // fail closed
    }
  };

  // For the pattern REST routes (dama/upload/auth.js requirePatternAction).
  //
  // RE-EXPRESSED AS ROW JUDGMENTS (owner, 2026-10-29). dataAuth.js answered these off the pattern
  // row's `authPermissions` directly, with a special case: an `admin`/`auth` pattern was strict and
  // every other pattern with no grants was open to anyone holding `view-pattern-list`. That special
  // case is gone — a pattern is judged like any other row, and one with no grants of its own
  // inherits its site's. `siteCan` asks the same question of the chain's root.
  decide.patterns = patterns;
  decide.rowCan = async (r, perms) => {
    if (!r) return false;
    // Re-read the leaf through the row-auth projection. `getPatternRows` selects `id, type, data`
    // and nothing else, so judging its rows as given would miss the `auth` COLUMN on a migrated app
    // (falling back to `data.authPermissions`) and miss `parent_id` (falling back to the type path).
    // Both fallbacks are correct-ish and both are the weaker mechanism; neither belongs in a gate.
    let leaf = r;
    if (r.id != null && (r.parent_id === undefined || r.auth === undefined)) {
      const [fresh] = await controller.authRowsByIds([String(r.id)], app);
      if (fresh) leaf = fresh;
    }
    for (const verb of verbsFor(perms)) {
      if (!(await gate.judgeOne(leaf, verb)).allow) return false;
    }
    return true;
  };
  decide.patternCan = (patternRow, perms) => decide.rowCan(patternRow, perms);
  decide.siteCan = async (perms) => decide.rowCan(await rootRow(), perms);
  decide.gate = gate;
  return decide;
}

/**
 * Throw unless `router.user` may do `op` on `row`. Same contract as dataAuth.js's: `row` is the
 * stored row (`{ id, app, type, data }`) for edits / deletes; `patch` is an edit's data; `replace`
 * means the write replaces the whole data (sync/push `I` onto an existing id).
 *
 * Returns the data to WRITE — for an edit judged against its stored row, only what `planEdit`
 * judged. `legacy` checks and filters nothing. There is no `log` branch: the gate applies the mode
 * and writes the would-deny line, so under `log` this sees `allow` and returns the planned write.
 */
async function assertDataWrite(router, controller, op, app, row, patch, { replace = false } = {}) {
  if (writeGate() === 'kind') {
    return require('./dataAuth').assertDataWrite(router, controller, op, app, row, patch, { replace });
  }
  if (dataAuthMode() === 'legacy') return patch;
  const user = (router && router.user) || null;
  const plan = op === 'edit' ? planEdit(row, patch, { replace }) : { keys: [], write: patch };
  const judge = createJudge({
    app, subdomain: (router && router.subdomain) || '', user, controller,
  });
  const d = await judge(op, row, patch, plan.keys);
  if (d.allow) return plan.write;
  const e = new Error(user ? `Not authorized: ${d.reason}` : 'Sign in to do this');
  e.status = user ? 403 : 401;                       // for the REST callers (sync/push)
  throw e;
}

module.exports = {
  createGate, rowAuthMode, verdict, isAppAdmin, VERBS,
  // the write surface — dataAuth.js's API, same names, same signatures
  assertDataWrite, dataAuthMode, createJudge, planEdit, verbsFor, writeGate, GRANT_KEYS,
  createRowJudge,            // the row judge, reachable for tests regardless of DMS_WRITE_GATE
};
