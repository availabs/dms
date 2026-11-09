// fetch() for dms-server's REST routes (/dama-admin, /dms-admin, /dms/...), which decide by the
// caller's token rather than a body user_id.
//
// - Sends `Authorization: user.token` (the convention SchedulePage and page/pages/edit already use),
//   falling back to the signed-in token in localStorage (`userToken`, what the falcor client sends)
//   for callers with no user in reach — e.g. Lexical image uploads, whose upload settings are
//   serialized into page content and so must never carry the token.
// - `app` (or `pattern.app`, for callers that hand over a datasets pattern row) appends `?dms_app=<app>`:
//   the site the request comes from, which is what locates the site's `:dmsenv` row above a pgEnv's
//   sources (dms-server routes/auth/requestUser.js requestApp). A query param, not a header, so it needs
//   no CORS preflight. A pattern lends no grants of its own (rule 2: a rule's owners are the row's
//   ancestors; the env row above a source is one, the pattern pointing at the env is not).
// - A 401 / 403 throws a PermissionError with a readable message instead of handing the caller a
//   response it would parse as data. Every other response comes back untouched.

export class PermissionError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'PermissionError';
        this.status = status;
    }
}

// `dms_app=<app>`: the site a request comes from (dms-server requestUser.js requestApp). The server files
// access-log rows under it, and reads a pgEnv's sources under that site's `:dmsenv` row for the pgEnv.
export function withAppParam(url, app) {
    if (!app) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}dms_app=${encodeURIComponent(app)}`;
}

// Kept for callers that hand over a pattern row: only its `app` is sent (`dms_pattern` is no longer read).
export function withPatternParam(url, pattern) {
    return withAppParam(url, pattern?.app);
}

// Tags every request of one pattern's Falcor model (render/dmsPageFactory.jsx) with `dms_app`, so the
// server knows which site's env rows sit above the external sources it reads. Wraps the model's data
// source hook; the token header it sets still goes on.
export function tagFalcorRequests(falcor, pattern, app = pattern?.app) {
    const source = falcor?._source;
    if (!source || !app) return falcor;
    const before = source.onBeforeRequest?.bind(source);
    source.onBeforeRequest = (config) => {
        before?.(config);
        if (config?.url) config.url = withAppParam(config.url, app);
    };
    return falcor;
}

function storedToken() {
    try { return typeof window !== 'undefined' ? window.localStorage?.getItem('userToken') : null; }
    catch { return null; }
}

export function authHeaders(user) {
    const token = user?.token || storedToken();
    return token ? { Authorization: token } : {};
}

export async function authedFetch(url, { user, pattern, app, headers, ...opts } = {}) {
    const res = await fetch(withAppParam(url, app || pattern?.app), {
        ...opts,
        headers: { ...authHeaders(user), ...headers },
    });
    if (res.status === 401 || res.status === 403) {
        let detail = '';
        try { detail = (await res.clone().json())?.error || ''; } catch { /* not JSON */ }
        const message = res.status === 401
            ? 'Sign in to do this.'
            : `You don't have permission to do this${detail ? ` (${detail})` : ''}.`;
        throw new PermissionError(message, res.status);
    }
    return res;
}
