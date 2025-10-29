import {get} from "lodash-es";
import {ExternalSourceAttributes, ExternalViewAttributes} from "./consts";

export async function getViews ({pgEnv, falcor, source_id}) {
    try {
        const reqLenPath = ['uda', pgEnv, 'sources', 'byId', +source_id, 'views', 'length'];
        const resLenJson = await falcor.get(reqLenPath);
        const len = get(resLenJson, ['json', ...reqLenPath], 0);

        if (!len) return [];

        const reqIndexPath = ['uda', pgEnv, 'sources', 'byId', +source_id, 'views', 'byIndex'];
        const resIndexJson = await falcor.get([...reqIndexPath, {from: 0, to: len - 1}, ExternalViewAttributes]);
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
        return []
    }
}

export async function getSourceData ({pgEnv, falcor, source_id, setSource}) {
    console.log('gettting data')
    try {
        const views = await getViews({pgEnv, falcor, source_id});
        const reqPath = ['uda', pgEnv, 'sources', 'byId', +source_id]
        const resJson = await falcor.get([...reqPath, ExternalSourceAttributes]);
        const res = get(resJson, ['json', ...reqPath], {})

        const firstView = views?.[0];
        const lastView = views?.[views?.length - 1];
        console.log('source', res)
        setSource({...res, views, created_at: firstView?.created_at, updated_at: lastView?.updated_at });
    }catch (e) {
        throw Error(`Error fetching source: ${e}`);
    }
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

export const updateVersionData = ({data, attrKey, isDms, apiUpdate, setView, format, source, pgEnv, falcor, id}) => {
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
            setView({...source, [attrKey]: data})
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