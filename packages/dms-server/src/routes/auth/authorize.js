'use strict';
/**
 * `authorize` — the one question, asked the same way everywhere.
 *
 *     authorize({ row,  verb, fields, user, app, controller })   a DMS row
 *     authorize({ env, sourceId, verb, user, app })              a datasets source
 *     authorize({ env, viewId,   verb, user, app })              a view — judged on its source
 *
 * **Given a row and the grants it carries, may this user do this verb to it?**
 *
 * The two call shapes are not two questions. They are two ways of NAMING the row, and which one a
 * caller uses is a fact about that route, not about authorization: `dms.route.js` has the row in
 * hand because it owns the controller, while UDA gates before fetching and knows only `(env, id)`.
 * Resolving an address to a row is this layer's job, so it happens here and nowhere else — a route
 * never learns whether a source lives in `data_items` or in a pgEnv's `data_manager.sources`.
 *
 * Everything below the two entry points is already shared: one judge (`kindAuth/authJudge.js`),
 * one mode (`settings.authMode`), and rules that come from the rows themselves — the kind's rule
 * stamped from its format, and `permissionDomain` → `authVocabulary` → `verbsForFields` for which
 * verb governs which field.
 *
 * See planning/tasks/current/unified-auth-api.md and research/unified-auth-api.md.
 */

/**
 * `fields` — the attributes an edit touches (`planEdit(row, patch).keys`). The vocabulary decides
 * which verbs those fields require; omit it and the question is the plain one.
 *
 * Returns `{ allow, reason }`. The MODE is applied inside: under `log` nothing is refused and a
 * would-deny line is written, under `enforce` the rule decides.
 */
async function authorize(opts = {}) {
    const { row, env, sourceId, viewId } = opts;
    if (row) return authorizeRow(opts);
    if (env !== undefined && viewId !== undefined) return authorizeView(opts);
    if (env !== undefined && sourceId !== undefined) return authorizeSource(opts);
    return { allow: false, reason: 'authorize: name a row, or an env with a source or a view' };
}

/** A view is not a thing to be granted — it is judged on the SOURCE it belongs to. */
async function authorizeView({ env, viewId, verb = 'read', user, app, subdomain = '', patternRef = null, logOnly = false, kind = 'view' }) {
    const ok = await require('./sourceReads').allowViewRead({ env, viewId, user, subdomain, patternRef, app, logOnly, kind });
    return ok ? { allow: true, reason: 'granted' } : { allow: false, reason: 'read refused' };
}

/** A DMS row: judged by its kind's rule, against the grants its declared owners carry. */
async function authorizeRow({ row, verb = 'read', fields, user, app, subdomain = '', controller, cache }) {
    const kindAuth = require('./kindAuth');
    if (verb === 'read') {
        const blocked = await kindAuth.readBlocked({
            row, kind: require('#db/type-utils.js').getKind(row.type || ''),
            user, subdomain, app: app || row.app, controller, cache,
        });
        return blocked ? { allow: false, reason: 'read refused' } : { allow: true, reason: 'granted' };
    }
    const judge = kindAuth.createJudge({ app: app || row.app, subdomain, user, controller });
    return judge(verb === 'create' ? 'create' : verb, row, undefined, fields);
}

/**
 * A datasets source, named by its env and id. The grants, the chain and the vocabulary all come
 * from the per-env snapshot (`sourceSnapshot.js`), which is a CACHE of resolved chains rather than
 * a second way of resolving them — see its header.
 */
async function authorizeSource({ env, sourceId, verb = 'read', user, app, subdomain = '', patternRef = null, logOnly = false, quiet = false, kind = 'source' }) {
    const reads = require('./sourceReads');
    // `quiet`: ask without reporting. For a question whose answer SHAPES a reply rather than
    // refusing it — may this caller see the secrets in `statistics`, the full grant list — where a
    // "no" is not a refusal and must not be logged as one.
    if (quiet) {
        const ok = await reads.holdsOnSource({ env, sourceId, user, subdomain, patternRef, app, perms: [].concat(verb) });
        return ok ? { allow: true, reason: 'granted' } : { allow: false, reason: `missing ${[].concat(verb).join(' or ')}` };
    }
    if (verb === 'read') {
        const ok = await reads.allowSourceRead({ env, sourceId, user, subdomain, patternRef, app, logOnly, kind });
        return ok ? { allow: true, reason: 'granted' } : { allow: false, reason: 'read refused' };
    }
    const ok = await require('./sourceGuards').isUserAuthedForSource({
        env, sourceId, user, subdomain, patternRef, reqPermissions: [].concat(verb),
    });
    return ok ? { allow: true, reason: 'granted' } : { allow: false, reason: `missing ${[].concat(verb).join(' or ')}` };
}

module.exports = { authorize };
