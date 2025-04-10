import React, {useContext, useEffect, useState} from "react";
import isEqual from "lodash/isEqual";
import {CMSContext} from "../../../../siteConfig";
import {get} from "lodash-es";
import FilterableSearch from "../FilterableSearch";
const range = (start, end) => Array.from({length: (end + 1 - start)}, (v, k) => k + start);

// get forms, and their sources
const getSources = async ({envs, falcor, apiLoad}) => {
    const lenRes = await falcor.get(['uda', Object.keys(envs), 'sources', 'length']);

    const sources = await Promise.all(
        Object.keys(envs).map(async e => {
            const len = get(lenRes, ['json', 'uda', e, 'sources', 'length']);
            if(!len) return [];

            const r = await falcor.get(['uda', e, 'sources', 'byIndex', {from: 0, to: len - 1}, envs[e].srcAttributes]);

            const valueGetter = (i, attr) => get(r, ['json', 'uda', e, 'sources', 'byIndex', i, attr])
            return range(0, len-1).map(i => {
                const doc_type = valueGetter(i, 'doc_type');
                const app = valueGetter(i, 'app');
                const env = doc_type ? `${app}+${doc_type}` : e;
                return {
                    ...envs[e].srcAttributes.reduce((acc, attr) => {
                        let value = valueGetter(i, attr);
                        if(['metadata'].includes(attr)) {
                            value = value?.columns || [];
                            return ({...acc, ['columns']: value})
                        }
                        if(['config'].includes(attr)) {
                            value =  JSON.parse(value || '{}')?.attributes || [];
                            return ({...acc, ['columns']: value})
                        }
                        return ({...acc, [attr]: value})
                    }, {}),
                    source_id: get(r, ['json', 'uda', e, 'sources', 'byIndex', i, '$__path', 4]),
                    env, // to fetch data
                    srcEnv: e, // to refer back
                    isDms: envs[e].isDms // mostly to apply data->>
                }
            });
    }));
    return sources.reduce((acc, curr) => [...acc, ...curr], []);
}

const getViews = async ({envs, source, falcor, apiLoad}) => {
    if(!source || !source.srcEnv || !source.source_id) return [];
    const {srcEnv, source_id} = source;

    const lenRes = await falcor.get(['uda', srcEnv, 'sources', 'byId', source_id, 'views', 'length']);
    const len = get(lenRes, ['json', 'uda', srcEnv, 'sources', 'byId', source_id, 'views', 'length']);
    if(!len) return [];

    const byIndexRes = await falcor.get(['uda', srcEnv, 'sources', 'byId', source_id, 'views', 'byIndex', {from:0, to: len - 1}, envs[srcEnv].viewAttributes]);

    return range(0, len - 1).map(i => ({
        view_id: get(byIndexRes, ['json', 'uda', srcEnv, 'sources', 'byId', source_id, 'views', 'byIndex', i, '$__path', 4]),
        ...envs[srcEnv].viewAttributes.reduce((acc, attr) => ({...acc, [attr]: get(byIndexRes, ['json', 'uda', srcEnv, 'sources', 'byId', source_id, 'views', 'byIndex', i, attr])}), {})
    }));
}


export const DataSourceSelector = ({
    // this comp isn't using context as it's intended to be reused by multiple components with their own states.
  state, setState,
  formatFromProps,
  apiLoad,
}) => {
    const {app, siteType, falcor, pgEnv} = useContext(CMSContext);
    const [sources, setSources] = useState([]);
    const [views, setViews] = useState([]);

    if(formatFromProps?.config) return null;

    const envs = {
        [pgEnv]: {
            label: 'external',
            srcAttributes: ['name', 'metadata'],
            viewAttributes: ['version', '_modified_timestamp']
        },
        [`${app}+${siteType}`]: {
            label: 'managed',
            isDms: true,
            // {doc_type}-{view_id} is used as type to fetch data items for dms views.
            // for invalid entries, it should be {doc_type}-{view_id}-invalid-entry.
            srcAttributes: ['app', 'name', 'doc_type', 'config'],
            viewAttributes: ['name', 'updated_at']
        }
    };

    useEffect(() => {
        let isStale = false;
        getSources({envs, falcor, apiLoad}).then(data => {
            if(isStale) return;
            setSources((data || []));

            const existingSource = data.find(d => d.source_id === state.sourceInfo?.source_id);

            if(existingSource && !isEqual(existingSource.columns, state.sourceInfo.columns)) {
                // meta update
                setState(draft => {
                    draft.sourceInfo = {...draft.sourceInfo, ...existingSource};
                })
            }
        });

        return () => {
            isStale = true;
        }
    }, [app, siteType]);

    useEffect(() => {
        // if source changes, get views
        let isStale = false;
        getViews({envs, source: state.sourceInfo, falcor, apiLoad}).then(views => {
            if(isStale) return;
            setViews(views)

            const existingView = views.find(view => view.view_id === state.sourceInfo?.view_id);
            if(existingView && (existingView.view_id !== state.sourceInfo.view_id)) {
                const {view_id, name, version, updated_at, _modified_timestamp} = existingView;
                // meta update
                setState(draft => {
                    draft.sourceInfo = {...draft.sourceInfo, view_id, view_name: version || name, updated_at: _modified_timestamp || updated_at};
                })
            }
        })

        return () => {
            isStale = true;
        }
    }, [state.sourceInfo.source_id])
    const sourceOptions = sources.map(({source_id, name, srcEnv}) => ({key: source_id, label: `${name} (${envs[srcEnv].label})`}));
    const viewOptions = views.map(({view_id, name, version}) => ({key: view_id, label: name || version}));
    return (
        <div className={'flex w-full bg-white items-center'}>
            <label className={'p-1'}>Source: </label>
            <div className={'w-1/2'}>
                <FilterableSearch
                    className={'flex-row-reverse'}
                    placeholder={'Search...'}
                    options={sourceOptions}
                    value={state.sourceInfo?.source_id}
                    onChange={e => {
                        const {doc_type, ...source} = sources.find(f => +f.source_id === +e) || {};
                        setState(draft => {
                            // reset values, set source
                            draft.columns = []; // clears our visible columns, and all of their settings (group, filter, etc).
                            draft.sourceInfo = source;
                            // for internally sourced data-sources, doc_type becomes type when we fetch their data items.
                            draft.sourceInfo.type = doc_type;
                        })
                    }}
                />
            </div>
            <label className={'p-1'}>Version: </label>
            <div className={'w-1/2'}>
                <FilterableSearch
                    className={'flex-row-reverse'}
                    placeholder={'Search...'}
                    options={viewOptions}
                    value={state.sourceInfo?.view_id}
                    onChange={e => {
                        const currView = views.find(v => +v.view_id === +e);
                        if(currView) {
                            const {view_id, name, version, updated_at, _modified_timestamp} = currView;
                            setState(draft => {
                                draft.sourceInfo = {...draft.sourceInfo, view_id, view_name: version || name, updated_at: _modified_timestamp || updated_at};
                            })
                        }
                    }}
                />
            </div>
        </div>
    )
}