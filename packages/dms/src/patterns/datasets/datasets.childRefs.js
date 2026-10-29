// Which of this pattern's rows OWN other rows — see ../page/page.childRefs.js for the shape and
// why the server needs a copy on the pattern row.
//
// ONE ENTRY, deliberately. Datasets ancestry is almost entirely derivable from the type path
// already, and a declaration that restates it would be noise that can go stale:
//
//     test_meta_forms_env|roads:source  → container `test_meta_forms_env` = the dmsEnv's INSTANCE ✓
//     roads|v1:view                     → container `roads`               = the source's INSTANCE ✓
//     prod|test_meta_forms_env:dmsenv   → container `prod`                = the SITE's instance    ✗
//
// The last one is the gap: a dmsEnv's type names the site, so the walk runs
// source → dmsEnv → site and never passes the datasets pattern whose grants govern it. The pattern
// points at its env with a scalar `data.dmsEnvId`, which is a reference attribute like any other —
// it just holds one id rather than an array (`refIdsOf` accepts both as of 2026-10-29).
//
// Declaring it makes `stampChildren` write the env's `parent_id` on the pattern's own save, so the
// chain becomes source → dmsEnv → pattern → site and internal datasets stop being a special case.
//
// Keyed by the OWNER'S KIND, which for a datasets pattern row (`prod|datasets:pattern`) is
// `pattern` — not `datasets`. A page pattern is the same kind and simply carries no `dmsEnvId`, so
// the merged declaration is a no-op there.
//
// Owner decision 2026-10-29: "a pattern doesn't own them directly, only through an env, that is how
// it should be." So `sources` is NOT declared here even though a pattern may carry one — on an
// env-backed pattern that array is stale and `getSiteSources` ignores it, and declaring it would
// record an ownership the system does not honour.
//
// PURE DATA — no imports (scripts/emit-auth-vocabulary.mjs loads it as a `data:` URL).

export const datasetsChildRefs = {
    pattern: {
        dmsEnvId: 'dmsenv',
    },
}

export default datasetsChildRefs
