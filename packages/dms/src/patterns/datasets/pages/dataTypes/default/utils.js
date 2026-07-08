import {get} from "lodash-es";
import {ExternalSourceAttributes, InternalSourceAttributes, InternalViewAttributes, ExternalViewAttributes} from "./consts";

export async function getViews ({pgEnv, falcor, source_id, isDms}) {
    try {
        const reqLenPath = ['uda', pgEnv, 'sources', 'byId', +source_id, 'views', 'length'];
        const resLenJson = await falcor.get(reqLenPath);
        const len = get(resLenJson, ['json', ...reqLenPath], 0);

        if (!len) return [];
        const reqIndexPath = ['uda', pgEnv, 'sources', 'byId', +source_id, 'views', 'byIndex'];

        const resIndexJson = await falcor.get([...reqIndexPath, {from: 0, to: len - 1}, isDms ? InternalViewAttributes : ExternalViewAttributes]);
        const views = get(resIndexJson, ['json', ...reqIndexPath], {})
        return Object.values(views).filter(version => +version.view_id).map(({
                                                                                 version,
                                                                                 _created_timestamp,
                                                                                 _modified_timestamp,
                                                                                 ...rest
                                                                             }) => ({
            name: version,
            created_at: _created_timestamp,
            updated_at: _modified_timestamp,
            ...rest
        }));
    } catch (e) {
        console.error(e)
        return []
    }
}

// Internal (DMS) source rows only store raw view refs [{ref, id}] under `views` —
// no `name`. Fetch the view rows themselves to attach `name`/`view_id`.
export async function resolveInternalViewNames ({pgEnv, falcor, rawViews}) {
    const viewIds = rawViews.map(v => +v.id).filter(Boolean);
    if (!viewIds.length) return rawViews;
    const nameRes = await falcor.get(['uda', pgEnv, 'views', 'byId', viewIds, InternalViewAttributes]);
    const viewsById = get(nameRes, ['json', 'uda', pgEnv, 'views', 'byId'], {});
    return rawViews.map(v => ({
        ...v,
        view_id: +v.id,
        name: viewsById[+v.id]?.name || v.name,
    }));
}

export async function getSourceData ({pgEnv, falcor, source_id, setSource, isDms}) {
    //console.log('gettting data')

        const externalViews = !isDms && await getViews({ pgEnv, falcor, source_id, isDms });
        const reqPath = ['uda', pgEnv, 'sources', 'byId', +source_id]
        const sourceAttributes = isDms ? InternalSourceAttributes : ExternalSourceAttributes;

        const resJson = await falcor.get([...reqPath, sourceAttributes]);
        const res = get(resJson, ['json', ...reqPath], {})

        let views;
        if (isDms) {
            const rawViews = parseIfJson(res.views) || [];
            views = await resolveInternalViewNames({ pgEnv, falcor, rawViews });
        } else {
            views = externalViews;
        }

        const firstView = views?.[0];
        const lastView = views?.[views?.length - 1];

        // The URL/route id IS the DMS row id — take it as canonical and
        // ignore whatever `id`/`source_id` legacy migrations left in data.
        // Keep `source_id` exposed for legacy callers but mirror the row id.
        setSource({...res, id: +source_id, source_id: +source_id, views, created_at: firstView?.created_at, updated_at: lastView?.updated_at });

}

// Falcor's wire protocol has no way to carry a plain object/array as a leaf graph value —
// this server's falcor-router only accepts a leaf if it's a primitive or already carries a
// `$type` sentinel (see jsongMerge.js); a bare object at the requested path's exact depth is
// treated as a branch to descend into, but the router has nowhere further to walk (the
// object's own keys were never part of the requested PathSet), so the value is silently
// dropped and the response backfills a bare `{$type:'atom'}` (i.e. `atom(undefined)`) —
// this is how "toggle allow editing" wiped a source's whole metadata blob. Stringify any
// non-primitive `data` for the wire; keep the ORIGINAL shape for the local optimistic
// update below so `source[attrKey]` matches what a GET response would parse it into.
const toWireValue = (data) => (data !== null && typeof data === 'object') ? JSON.stringify(data) : data;

export const updateSourceData = ({data, attrKey, isDms, apiUpdate, setSource, format, source, pgEnv, falcor, id}) => {
        if(isDms && (!format?.app || !source?.type)) {
            throw new Error("Update Error. Source invalid.")
        }

        const envKey = isDms ? `${format.app}+${source.type}` : pgEnv;

        return falcor.set({
            paths: [
                ['uda', envKey, 'sources', 'byId', id, attrKey]
            ],
            jsonGraph: {
                uda: {
                    [envKey]: {
                        sources: {
                            byId: {
                                [id]: {[attrKey]: toWireValue(data)}
                            }
                        }
                    }
                }
            }
        }).then(d => {
            // The server is authoritative — use whatever it actually confirms for this
            // attrKey when the response includes it (the sources.byId set route echoes
            // back every column of the updated row, so for external sources — where
            // attrKey is a real column like `metadata` — this is always present).
            // Fall back to the locally-known `data` only if it genuinely isn't there
            // (e.g. an isDms attrKey nested inside `data` rather than a literal column).
            // Resolving to this confirmed value (not just "the promise didn't reject")
            // lets callers verify the write actually landed instead of trusting a
            // round trip that could silently no-op.
            const confirmed = d?.json?.uda?.[envKey]?.sources?.byId?.[id]?.[attrKey];
            const resolved = confirmed !== undefined ? confirmed : data;
            setSource({...source, [attrKey]: resolved})
            return resolved;
        })
}

export const updateVersionData = ({data, attrKey, isDms, apiUpdate, setView, format, source, view, pgEnv, falcor, id}) => {
        if(isDms && (!format?.app || !source?.type)) {
            throw new Error("Update Error. Source invalid.")
        }

        const envKey = isDms ? `${format.app}+${source.type}` : pgEnv;

        return falcor.set({
            paths: [
                ['uda', envKey, 'views', 'byId', id, attrKey]
            ],
            jsonGraph: {
                uda: {
                    [envKey]: {
                        views: {
                            byId: {
                                [id]: {[attrKey]: toWireValue(data)}
                            }
                        }
                    }
                }
            }
        }).then(d => {
            // See updateSourceData's identical comment — verify against the server's own
            // echoed value rather than trusting the locally-known one.
            const confirmed = d?.json?.uda?.[envKey]?.views?.byId?.[id]?.[attrKey];
            const resolved = confirmed !== undefined ? confirmed : data;
            setView({...view, [attrKey]: resolved})
            return resolved;
        })
}

// parse JSON strings, else return original value or default value
export const parseIfJson = (value, defaultValue) => {
    try {
        return JSON.parse(value);
    }catch (e) {
        return value
    }
}

export const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}
