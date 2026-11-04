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
 * `DMS_AUTH_MODE` (../mode.js): `log` (default) | `enforce`, shared with every other surface and
 * with kind auth.
 *
 *   log      nothing is refused, and every request the rule WOULD refuse is written out as
 *            `[row-auth] would-deny …` so grants can be fixed before anything flips.
 *   enforce  the rule decides.
 *
 * It had its own flag until 2026-11-03 (`DMS_ROW_AUTH_MODE`), on the reasoning that separately-owned
 * checks should flip separately. Five flags later that reasoning had produced a server whose
 * enforcement state took five variables to describe. One flag now, both implementations.
 *
 * **Before flipping any app to `enforce`, check parent-resolution coverage for it** (hub). A row
 * that is private only by inheritance opens up when its parent cannot be resolved — measured at
 * 99.2% derivable on `mitigat-ny-prod`, so the exposed set is small but not empty.
 */

const { createResolver } = require('./rowAuth');
const { NO_CHANGE } = require('../settings');   // shared with kind auth — see that file
const { can, isUnstated, VERBS } = require('./mergeAuth');
const { publicReadOf } = require('./authVocabulary');
const { authMode } = require('../settings');

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
function createGate({ controller, app, user, subdomain = '' }) {
  const modeNow = () => authMode();
  const resolver = createResolver({
    loadByIds: (ids) => controller.authRowsByIds(ids, app),
    loadContainers: () => controller.authContainers(app),
    subdomain,
  });

  /**
   * Judge many rows at once — the shape every surface wants, and the one that scales: ancestry is
   * resolved breadth-first in ~depth queries regardless of how many rows are asked about.
   *
   * Returns `Map(id → { allow, reason })`. Under `log` the verdict is always allow, and a
   * would-deny line is written for each row the rule would refuse.
   */
  /**
   * `raw`: return the rule's own verdict, with the MODE NOT APPLIED and nothing logged.
   *
   * For a caller that must weigh several verbs before deciding — an any-of field group, where the
   * first alternative failing is not a refusal and must not be reported as one. Logging each
   * attempt wrote a would-deny for every granted publish, which `test-data-auth.js`'s "log is
   * silent for a granted write" caught immediately. The caller applies the mode once, at the end.
   */
  async function judge(rows, verb = 'read', { raw = false } = {}) {
    const mode = raw ? 'enforce' : modeNow();
    const out = new Map();
    const list = (rows || []).filter(r => r && r.id != null);
    if (!list.length) return out;

    // THE ROWS A SURFACE HANDS US MAY BE PROJECTED WITHOUT THE COLUMNS THIS GATE READS.
    //
    // `dms.route.js` selects `DATA_ATTRIBUTES` — `id, app, type, data, …` — with no `auth` and no
    // `parent_id`. On a MIGRATED app that is exactly where the grants and the declared vocabulary
    // live, so judging the row as handed over means reading a stale `data.authPermissions` and no
    // vocabulary at all. Measured live against the `rowauth-test` clone under `enforce`: the auth
    // pattern's `publicRead` was invisible, so the LOGIN PAGE was refused to logged-out visitors.
    //
    // Re-loading here rather than widening every SELECT: one batched query for the whole set, in
    // the one place that knows which columns matter, and it fixes every surface at once — the
    // alternative is auditing each read path and getting it wrong again when a new one appears.
    // (`row-auth-schema.md` / hub Phase A2 asked for the projection to be widened; this is the
    // same fix made load-bearing where it cannot be forgotten.)
    let list2 = list;
    if (list.some(r => r.auth === undefined && r.parent_id === undefined)) {
      try {
        if (!controller.hasAuthColumns || await controller.hasAuthColumns(app)) {
          const fresh = await controller.authRowsByIds(list.map(r => String(r.id)), app);
          const byId = new Map((fresh || []).map(r => [String(r.id), r]));
          list2 = list.map(r => byId.get(String(r.id)) || r);
        }
      } catch (e) {
        console.warn(`[row-auth] could not re-load the judged rows for ${app}: ${e.message}`);
      }
    }

    const merged = await resolver.resolve(list2);
    for (const row of list2) {
      const id = String(row.id);
      // A row that DECLARES it must be readable without a session is read-exempt — the login page
      // has to render for someone who cannot yet be anybody (authVocabulary.js `publicReadOf`).
      // Reads only: `publicRead` says "everyone may see this", never "everyone may change it".
      if (verb === 'read' && publicReadOf(row)) {
        out.set(id, { allow: true, reason: 'declares publicRead' });
        continue;
      }
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
  async function judgeOne(row, verb = 'read', opts = {}) {
    const m = await judge([row], verb, opts);
    return m.get(String(row && row.id)) || { allow: true, reason: 'no row' };
  }

  /** A create resolves against the parent's chain: the new row has no auth of its own yet. */
  async function judgeCreate(parentRow) {
    const mode = modeNow();
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
// still points at it. BOTH SIDES ARE PERMANENT (owner, 2026-11-03: "kind auth is never going to be
// deleted — we are planning on keeping both"), so this is not a migration staging post: it is one of
// two supported providers, and the differentials are the standing contract between them.
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
//   - **Five structural verbs** replace the per-kind permission names. What a permission string
//     confers is whatever the row's chain DECLARES (`authVocabulary.js`); an undeclared verb
//     confers nothing and is checked by name. The hardcoded table that used to answer this
//     (`legacyVerbs.js`) was deleted on 2026-11-03.
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
const { expandPerms, verbsForFields, vocabularyOf } = require('./authVocabulary');
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
// `edit`. WHICH ATTRIBUTE NEEDS WHICH VERB IS NOW DECLARED, in the format that owns the attribute
// (`permissionDomain` entries carry `fields`), and read here through `verbsForFields`. It used to
// be one hardcoded list — `GRANT_KEYS = ['authPermissions','auth','auth_permissions']` — which was
// the only key-sensitive rule the row gate had, with publish-page, edit-page-params and
// edit-source-data simply not enforced. The escalation guard is now a claim like any other:
// whichever verb declares `fields: ['authPermissions']` implies `grant`, so granting still cannot
// be reached with `edit` alone.
//
// A chain that declares NOTHING has no field rules at all, which is the same answer it gives to
// every other question: an undeclared verb confers nothing. See
// planning/tasks/current/unified-auth-api.md, Phase 1.
//
// ONE FLOOR SURVIVES, below the declarations: the attributes the permission system stores ITSELF in
// always need `grant`. That is not a pattern's business logic and not type knowledge — these are
// the auth layer's own storage keys, the same ones `rawAuthOf` reads a row's grants out of. Without
// the floor, an app that has declared nothing lets anyone holding `edit` grant themselves anything,
// which is the one thing no amount of "it was not declared" should excuse. A vocabulary that claims
// these keys (`fields: ['authPermissions']` on a verb implying `grant`) agrees with it exactly.
const AUTH_FIELDS = ['authPermissions', 'auth', 'auth_permissions'];

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
 * The structural verbs a permission string requires — ALL of them, not any.
 * `edit-pattern-permissions` implies read + edit + grant, and an action behind it needs all three.
 *
 * `maps` IS THE VOCABULARY THE ROW'S CHAIN DECLARES (`resolver.mapsFor`), and it is required:
 * there is no hardcoded table any more. A request names verbs in the same words a grant does, so
 * both halves have to be read against the same declaration — a grant of `edit-page` satisfies a
 * request for `view-page` only because the pattern says both imply `read`. With no `maps` (nothing
 * in the chain declares) nothing translates, and every asked permission is checked BY NAME.
 *
 * **Returns an EMPTY array for a permission that maps to no structural verb**, and the caller then
 * checks that permission BY NAME. It used to return `['edit']` instead, which was a shipped defect:
 * `download-source`, `manage-downloads` and `view-source-api` declare `implies: []` precisely
 * because they confer no row access, and the fallback silently overrode that declaration with
 * `edit`. Measured against the real `holdsAny` before the fix:
 *
 *     download-source only   may download?  false   ← the cap migrate-source-auth-to-permissions.js
 *     update-source  only    may download?  true       applies to anonymous `public`
 *
 * Exactly backwards: the download route was gated by `edit`, too strict for the people meant to
 * hold it and too loose for everyone who edits. Owner's rule (2026-10-30): *"read in the system
 * needs to be different from download — users need to be able to access a dataset in the system but
 * not be able to download it."*
 *
 * A by-name check works because `expandPerms` (authVocabulary.js) is ADDITIVE: expansion adds the
 * structural verbs and keeps the original strings, so a merged chain still holds `download-source`
 * itself. Nothing new has to be plumbed through.
 *
 * See planning/tasks/current/permission-domain-single-source.md, Phase 4(b).
 */
function verbsFor(perms, maps = null) {
  if (!maps) return [];
  return expandPerms([].concat(perms || []), maps.flat || {}).filter(v => VERBS.includes(v));
}

/**
 * Does the caller hold a named verb on this row — BY NAME, not by what it implies.
 *
 * The distinction decides whether field rules mean anything. `publish-page` implies `read` + `edit`,
 * and so does `edit-page`; asking for the implications would let any page editor publish, which is
 * exactly the gap the `field` divergence recorded. Asking for the NAME works because expansion is
 * additive — a merged chain holds `publish-page` itself alongside the structural verbs it conferred
 * — and `'*'` still passes everything, since `can` tests for it directly.
 *
 * `judgeOne` applies the mode and writes the would-deny line, so that happens once, here.
 */
async function holdsNamed(gate, row, name) {
  return gate.judgeOne(row, name, { raw: true });
}

/**
 * Does `user` hold `perm` under `merged`? The structural verbs it implies if it implies any,
 * otherwise the permission itself, by name. The one place the `verbsFor` contract is interpreted —
 * `holdsAny` (uda/rowSourceAuth.js) asks the same question of a merged chain.
 */
function holdsPermission(merged, user, app, perm, maps = null) {
  const verbs = verbsFor([perm], maps);
  return verbs.length
    ? verbs.every(v => verdict(merged, user, v, app).allow)
    : verdict(merged, user, perm, app).allow;      // a capability: no row access, checked by name
}

/**
 * The write surface's mode — the SAME `DMS_AUTH_MODE` every other surface reads (../mode.js).
 *
 * It was `DMS_DATA_AUTH_MODE` until 2026-11-03, kept apart so that moving dms writes onto this gate
 * would not also put them under the read flag. With one flag there is nothing to keep apart, and
 * `createGate`'s `modeOverride` went with it.
 */
const dataAuthMode = authMode;

/**
 * One judge per write. `ctx`: `{ app, subdomain, user, controller }` — the same shape dataAuth.js
 * takes, so a call site swaps the import and nothing else.
 *
 * THIS IS THE ROW JUDGE, FULL STOP. It used to check `DMS_WRITE_GATE` and hand the write to kind
 * auth when that said `kind`, which meant the write surface could be running a different
 * implementation from the rest of the server. Choosing between implementations is `../index.js`'s
 * job and only its job (2026-11-03): a caller that reached this file has already been routed here.
 */
const createJudge = (ctx) => createRowJudge(ctx);

function createRowJudge({ app, subdomain = '', user, controller }) {
  const gate = createGate({ controller, app, user, subdomain });

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
      if (op === 'edit') {
        if (keys.some(k => AUTH_FIELDS.includes(k))) {
          const g = await gate.judgeOne(row, 'grant');
          if (!g.allow) return g;
        }
        // WHAT THIS EDIT NEEDS, from the row's own vocabulary. Groups are ANY-OF within and ALL-OF
        // across: two verbs claiming one field mean either will do, two fields mean both verbs.
        const maps = await gate.resolver.mapsFor(row);
        // A row that declares its own vocabulary is governed by `self`; one that inherited it by
        // `descendants`. A pattern row carries both, and flattening them asks a page editor for the
        // pattern's verb.
        const scope = vocabularyOf(row) ? 'self' : 'descendants';
        const { groups, covered } = verbsForFields(keys, maps, parseJson(patch) || {}, scope);
        // A key the declaration did not answer is an ordinary edit, judged structurally below.
        const uncovered = keys.filter(k => !covered.includes(k));
        for (const group of groups) {
          // ANY-OF, judged raw: a failing alternative is not a refusal, so none of them logs.
          let best = null;
          for (const name of group) {
            const d = await holdsNamed(gate, row, name);
            if (d.allow) { best = d; break; }
            best = best || { allow: false, reason: `missing ${group.join(' or ')}` };
          }
          if (!best || !best.allow) {
            const reason = (best && best.reason) || `missing ${group.join(' or ')}`;
            // The mode, applied ONCE, for the whole group.
            if (dataAuthMode() === 'enforce') return { allow: false, reason };
            logWouldDeny(app, row, user, group.join(' or '), reason);
            return { allow: true, reason: `would-deny (${reason})` };
          }
        }
        if (groups.length && !uncovered.length) return { allow: true, reason: 'granted' };
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
    // ALL of the structural verbs the permissions imply, as before — plus any permission that
    // implies NONE, checked by name instead of falling through to `edit`. `judgeOne` takes any verb
    // string, and an expanded chain still holds the named permissions (expandPerms is additive).
    const asked = [].concat(perms || []);
    const maps = await gate.resolver.mapsFor(leaf);
    const named = asked.filter(p => verbsFor([p], maps).length === 0);
    for (const verb of [...verbsFor(asked, maps), ...named]) {
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
 * judged. There is no `log` branch here: the gate applies the mode and writes the would-deny line,
 * so under `log` this sees `allow` and returns the planned write.
 */
async function assertDataWrite(router, controller, op, app, row, patch, { replace = false, skipNoChange = false } = {}) {
  const user = (router && router.user) || null;
  const plan = op === 'edit' ? planEdit(row, patch, { replace }) : { keys: [], write: patch };
  // An edit that changes nothing is not an update, so it is never judged — the same rule kind auth
  // applies, with the same shared sentinel, so the route's `=== NO_CHANGE` holds either way.
  if (skipNoChange && op === 'edit' && row && row.data && plan.keys.length === 0) return NO_CHANGE;
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
  createGate, rowAuthMode: authMode, verdict, isAppAdmin, VERBS, NO_CHANGE,
  // the write surface — dataAuth.js's API, same names, same signatures
  assertDataWrite, dataAuthMode, createJudge, planEdit, verbsFor, holdsPermission,
  createRowJudge,            // the row judge, reachable for tests regardless of DMS_WRITE_GATE
};
