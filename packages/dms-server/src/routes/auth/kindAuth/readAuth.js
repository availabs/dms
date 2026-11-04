'use strict';
/**
 * KIND AUTH'S DATASETS READ DECISION — and nothing else.
 *
 * `../sourceReads.js` owns the surface around it: the mode, the snapshot, the logging, the
 * redaction, the app locator. That layer is the same whichever implementation answers, which is
 * why it is no longer here. What remains is the one thing that is kind auth's: how a source's own
 * grants are matched against what was asked.
 *
 * The rule: `isUserAuthed` on the source's grants, which matches permission strings BY NAME and
 * cannot expand anything. `check` lets a caller substitute the lenient `isUserAuthedOpen` — that
 * is kind auth's strict/lenient pair and the row judge has no analogue for it, which is exactly
 * why this split exists rather than one shared decision with a flag.
 *
 * NOTHING LENDS TO A SOURCE (2026-11-03). `mergeAuthPermissions` is still called, with an empty
 * pattern level, so the shape of the merge is unchanged and visible — it used to carry a datasets
 * pattern's grants and no longer does. See row-auth-uda-unify-api.md, Slice K.
 */
const { mergeAuthPermissions, isUserAuthed } = require('./sourceAuth');

/**
 * The contract `../sourceReads.js` calls. `s` is the snapshot entry — `{ ap, view, maps }` — so the
 * grants arrive already resolved and expanded, and no database access happens here.
 */
const sourceDecision = {
    reads(s, user, app, reqPermissions) {
        const allow = isUserAuthed({
            user, reqPermissions, authPermissions: mergeAuthPermissions({}, s.ap || {}),
        });
        return { allow, reason: allow ? 'granted' : `missing ${reqPermissions[0]}` };
    },
    holds(s, user, app, reqPermissions, check = isUserAuthed) {
        const allow = check({
            user, reqPermissions, authPermissions: mergeAuthPermissions({}, s.ap || {}),
        });
        return { allow, reason: allow ? 'granted' : `missing ${reqPermissions[0]}` };
    },
};

module.exports = { sourceDecision };
