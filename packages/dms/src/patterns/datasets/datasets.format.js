// `view` and `source` MOVED to ../dmsEnv.format.js (2026-11-02): the env owns them, not this
// pattern. Re-exported here because the datasets UI still imports them from this module.
// See planning/tasks/current/row-auth-uda-unify-api.md.
export { view, source } from '../dmsEnv.format'
import { source } from '../dmsEnv.format'

const datasetsFormat = {
    app: "datasets",
    type: "form-manager",
    registerFormats: [source],
    attributes: [
        {
            key: 'name',
            placeholder: 'Name',
            type: "text",
            hidden: true
        },
        {
            key: 'sources',
            type: 'dms-format',
            isArray: true,
            format: 'datasets+source',
        },
        // The datasets PATTERN-INSTANCE domain. `form-manager` is the row kind that IS the datasets
        // pattern, so these join the shared `admin+pattern` domain to make this type's `self` scope
        // — they are granted at the pattern level and nowhere else.
        //
        // `view-sources` must NOT be a descendants verb. It is the verb that decides whether you
        // can see any pages at the datasets level, and it gates the pattern's whole route subtree by
        // name (siteConfig.jsx, `reqPermissions: ['view-sources']`). In `descendants` a pattern-level
        // `public: ['view-sources']` would open every source beneath it — the identical shape to the
        // `view-page` regression this replaces (row-auth-uda.md). `view-source` (singular) stays the
        // per-source read, on the source format below.
        {
            key: "authPermissions",
            type: "json",
            required: false,
            default: [],
            permissionDomain: [
                { label: 'View Sources',  value: 'view-sources',  implies: ['read'] },
                { label: 'Create Source', value: 'create-source', implies: ['read', 'create'] },
            ],
        },
    ]
}

export default datasetsFormat