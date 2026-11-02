'use strict';
/**
 * Expand one level's grants into structural verbs — the ONE place that chooses between a pattern's
 * declared vocabulary and the transitional shim.
 *
 * A grant names pattern verbs (`view-page`, `update-source`, `edit-pattern`). Every decision in
 * the server asks a STRUCTURAL question instead — `read`, `edit`, `create`, `delete`, `grant` — so
 * a level's grants have to be expanded before they are merged into a chain, or a grant of
 * `update-source` never becomes `read`+`edit` and every verdict is a refusal.
 *
 * ---------------------------------------------------------------------------
 * The precedence, stated once
 *
 *   maps  → the pattern DECLARED its vocabulary. It wins, and the shim is never consulted.
 *   null  → nothing declared. Fall back to `legacyVerbs.js`, which is the only place in the
 *           server that names a pattern's verbs, and is meant to be deleted.
 *
 * This existed as the same ternary copied into three modules — `rowAuth.authOf`,
 * `sourceSnapshot.js` and `rowSourceAuth.js`, two of them character-identical — so every consumer
 * imported both modules and had to remember which way round the precedence ran. One function now.
 *
 * ---------------------------------------------------------------------------
 * Why it is a SEPARATE module from both of the things it chooses between
 *
 * `authVocabulary.js` is a pure interpreter that names no verb and no pattern — that is the whole
 * difference between it and `legacyVerbs.js`, and it is what `src/dms/CLAUDE.md` ("DMS Interprets
 * Data — It Never Knows Types") requires of it. Putting this fallback inside it would make the
 * interpreter import the hardcoded verb table, which is the coupling both files exist to avoid.
 *
 * And `legacyVerbs.js` is scheduled for deletion. Keeping the choice here means that deletion
 * stays a `git rm` plus the one branch below, rather than surgery inside a file that must survive.
 *
 * NOT A NULL GUARD. `expandWithVocabulary` already returns `auth` untouched when `maps` is null;
 * the branch picks the fallback, it does not prevent a crash.
 */
const { expandWithVocabulary } = require('./authVocabulary');
const { expandAuth } = require('./legacyVerbs');

const expandLevel = (auth, maps) => (maps ? expandWithVocabulary(auth, maps) : expandAuth(auth));

module.exports = { expandLevel };
