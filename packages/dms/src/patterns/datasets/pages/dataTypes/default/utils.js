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

export const updateSourceData = ({data, attrKey, isDms, apiUpdate, setSource, format, source, pgEnv, falcor, id}) => {
    console.log('updating', data)
        if(isDms && (!format?.app || !source?.type)) {
            throw new Error("Update Error. Source invalid.")
        }

        falcor.set({
            paths: [
                ['uda', isDms ? `${format.app}+${source.type}` : pgEnv, 'sources', 'byId', id, attrKey]
            ],
            jsonGraph: {
                uda: {
                    [isDms ? `${format.app}+${source.type}` : pgEnv]: {
                        sources: {
                            byId: {
                                [id]: {[attrKey]: attrKey === 'description' || attrKey === 'categories'  || attrKey === 'statistics' ? JSON.stringify(data) : data}
                            }
                        }
                    }
                }
            }
        }).then(d => {
            setSource({...source, [attrKey]: data})
        })
}

export const updateVersionData = ({data, attrKey, isDms, apiUpdate, setView, format, source, view, pgEnv, falcor, id}) => {
        if(isDms && (!format?.app || !source?.type)) {
            throw new Error("Update Error. Source invalid.")
        }

        falcor.set({
            paths: [
                ['uda', isDms ? `${format.app}+${source.type}` : pgEnv, 'views', 'byId', id, attrKey]
            ],
            jsonGraph: {
                uda: {
                    [isDms ? `${format.app}+${source.type}` : pgEnv]: {
                        views: {
                            byId: {
                                [id]: {[attrKey]: attrKey === 'description' || attrKey === 'categories'  || attrKey === 'statistics' ? JSON.stringify(data) : data}
                            }
                        }
                    }
                }
            }
        }).then(d => {
            setView({...view, [attrKey]: data})
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
