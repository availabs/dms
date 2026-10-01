// Authoritative views — which view(s) of a source pages should bind, and why.
//
// Stored on the source at `metadata.authority` (DMS: `data.metadata.authority`) and read through
// the derived, read-only `authority` source attribute (`uda[env].sources.byId[id].authority`).
// Only the `uda.sources.setAuthoritativeView` / `clearAuthoritativeView` calls write it
// (api/index.js `udaSetAuthoritativeView` / `udaClearAuthoritativeView`); a generic metadata
// save preserves it.
//
//   { views: [ { view_id, key?, note, set_by, set_at } ] }
//
// Most sources have ONE authoritative view (an entry with no `key`). A source holding parallel
// products has keyed entries ({ year: '2024' }) that all use the same key names. No record means
// UNDECIDED — never "the newest view".
//
// Mirror of dms-server `src/routes/uda/authority.js`; the two packages do not share code, so keep
// the shape and rules in sync.

// Values arrive as objects, JSON text, or JSON text holding JSON text (DMS attributes written
// through the wire helper). Unwrap up to two levels.
export const parseJsonish = (value) => {
    let v = value;
    for (let i = 0; i < 2 && typeof v === 'string'; i++) {
        try { v = JSON.parse(v); } catch { return null; }
    }
    return v === undefined ? null : v;
};

// A source object vs an authority record: both can carry a `views` array (a source's is its list of
// versions!), so tell them apart by the fields only a source has.
const SOURCE_FIELDS = ['authority', 'metadata', 'source_id', 'id', 'name', 'categories', 'config'];
const isSourceLike = (o) => !!o && typeof o === 'object' && SOURCE_FIELDS.some(f => f in o);

// Accepts the `authority` attribute itself, or a source (reads `source.authority`, falling back to
// `source.metadata.authority`). Returns `{views}` or null (undecided).
export const readAuthority = (sourceOrAuthority) => {
    if (!sourceOrAuthority) return null;
    let a = parseJsonish(sourceOrAuthority);
    if (isSourceLike(a)) {
        a = parseJsonish(a.authority) || parseJsonish(parseJsonish(a.metadata)?.authority) || null;
    }
    if (!a || !Array.isArray(a.views)) return null;
    const views = a.views.filter(e => e && Number.isFinite(+e.view_id)).map(e => ({ ...e, view_id: +e.view_id }));
    return views.length ? { views } : null;
};

export const authoritativeViews = (source) => readAuthority(source)?.views || [];

// The entry marking `viewId` authoritative, or null.
export const isAuthoritative = (source, viewId) =>
    viewId == null ? null : (authoritativeViews(source).find(e => +e.view_id === +viewId) || null);

// 'undecided' | 'single' | 'keyed'
export const authorityState = (source) => {
    const views = authoritativeViews(source);
    if (!views.length) return 'undecided';
    return views[0].key && Object.keys(views[0].key).length ? 'keyed' : 'single';
};

// The key names a keyed source uses (e.g. ['year']); [] for single or undecided.
export const authorityKeyNames = (source) => {
    const first = authoritativeViews(source).find(e => e.key && Object.keys(e.key).length);
    return first ? Object.keys(first.key).sort() : [];
};

// { year: '2024' } → 'year 2024'; { level: 'county', vintage: '2020' } → 'level county · vintage 2020'
export const keyLabel = (key) =>
    key && Object.keys(key).length
        ? Object.keys(key).sort().map(k => `${k.replace(/_/g, ' ')} ${key[k]}`).join(' · ')
        : '';

// The view a datasets page should open when none is in the URL: the single authoritative view,
// or the first keyed one (in list order), or null when undecided (callers keep their old default).
export const preferredViewId = (source, views = [], idOf = (v) => v?.view_id ?? v?.id) => {
    const entries = authoritativeViews(source);
    if (!entries.length) return null;
    const ids = new Set(entries.map(e => +e.view_id));
    const inList = views.find(v => ids.has(+idOf(v)));
    return inList ? idOf(inList) : entries[0].view_id;
};

// Picker helper: the one view to preselect when a source is chosen, or null (none, or keyed).
export const singleAuthoritativeViewId = (source) =>
    authorityState(source) === 'single' ? authoritativeViews(source)[0].view_id : null;

// Picker helper: authoritative views first (in their original order), then the rest.
export const sortAuthoritativeFirst = (source, views = [], idOf = (v) => v?.view_id ?? v?.id) => {
    const ids = new Set(authoritativeViews(source).map(e => +e.view_id));
    if (!ids.size) return views;
    return [...views.filter(v => ids.has(+idOf(v))), ...views.filter(v => !ids.has(+idOf(v)))];
};

// Picker label suffix: ' ★' or ' ★ year 2024'
export const authorityMarker = (source, viewId) => {
    const e = isAuthoritative(source, viewId);
    if (!e) return '';
    const k = keyLabel(e.key);
    return k ? ` ★ ${k}` : ' ★';
};
