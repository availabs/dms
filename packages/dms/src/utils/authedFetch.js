// fetch() for dms-server's REST routes (/dama-admin, /dms-admin, /dms/...), which decide by the
// caller's token rather than a body user_id.
//
// - Sends `Authorization: user.token` (the convention SchedulePage and page/pages/edit already use),
//   falling back to the signed-in token in localStorage (`userToken`, what the falcor client sends)
//   for callers with no user in reach — e.g. Lexical image uploads, whose upload settings are
//   serialized into page content and so must never carry the token.
// - `pattern` ({ app, id } — a datasets pattern row) appends `?dms_pattern=<app>/<id>`: external
//   sources inherit that pattern's grants (dms-server routes/uda/sourceAuth.js requestPatternRef,
//   mirror of this). A query param, not a header, so it needs no CORS preflight.
// - A 401 / 403 throws a PermissionError with a readable message instead of handing the caller a
//   response it would parse as data. Every other response comes back untouched.

export class PermissionError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'PermissionError';
        this.status = status;
    }
}

export function withPatternParam(url, pattern) {
    if (!pattern?.app || !pattern?.id) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}dms_pattern=${encodeURIComponent(`${pattern.app}/${pattern.id}`)}`;
}

function storedToken() {
    try { return typeof window !== 'undefined' ? window.localStorage?.getItem('userToken') : null; }
    catch { return null; }
}

export function authHeaders(user) {
    const token = user?.token || storedToken();
    return token ? { Authorization: token } : {};
}

export async function authedFetch(url, { user, pattern, headers, ...opts } = {}) {
    const res = await fetch(withPatternParam(url, pattern), {
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
