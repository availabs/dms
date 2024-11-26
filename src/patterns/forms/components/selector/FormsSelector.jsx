import React, {useContext, useEffect, useState} from "react";
import isEqual from "lodash/isEqual";
import {CMSContext} from "../../../page/siteConfig";
import {get} from "lodash-es";
import FilterableSearch from "./FilterableSearch";
export const range = (start, end) => Array.from({length: (end + 1 - start)}, (v, k) => k + start);

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
                    ...envs[e].srcAttributes.reduce((acc, attr) => ({...acc, [attr]: valueGetter(i, attr)}), {}),
                    id: get(r, ['json', 'uda', e, 'sources', 'byIndex', i, '$__path', 4]),
                    env, // to fetch data
                    srcEnv: e, // to refer back
                    isDms: envs[e].isDms // mostly to apply data->>
                }
            });
    }));
    return sources.reduce((acc, curr) => [...acc, ...curr], []);
}

const getViews = async ({envs, source, falcor, apiLoad}) => {
    if(!source || !source.srcEnv || !source.id) return [];
    const {srcEnv, id} = source;

    const lenRes = await falcor.get(['uda', srcEnv, 'sources', 'byId', id, 'views', 'length']);
    const len = get(lenRes, ['json', 'uda', srcEnv, 'sources', 'byId', id, 'views', 'length']);
    if(!len) return [];

    const byIndexRes = await falcor.get(['uda', srcEnv, 'sources', 'byId', id, 'views', 'byIndex', {from:0, to: len - 1}, envs[srcEnv].viewAttributes]);

    return range(0, len - 1).map(i => ({
        id: get(byIndexRes, ['json', 'uda', srcEnv, 'sources', 'byId', id, 'views', 'byIndex', i, '$__path', 4]),
        ...envs[srcEnv].viewAttributes.reduce((acc, attr) => ({...acc, [attr]: get(byIndexRes, ['json', 'uda', srcEnv, 'sources', 'byId', id, 'views', 'byIndex', i, attr])}), {})
    }));
}


export const FormsSelector = ({
  app, siteType, formatFromProps,
  format, setFormat,
  view, setView,
  apiLoad,
  setVisibleAttributes // to reset visible attributes reliably. remember: source can change even if its meta changes. that can't be used to detect change in source.
}) => {
    const [sources, setSources] = useState([]);
    const [existingSource, setExistingSource] = useState(format || {});
    const [views, setViews] = useState([]);
    const [currentView, setCurrentView] = useState(view);
    const {falcor, falcorCache, pgEnv} = useContext(CMSContext);

    if(formatFromProps?.config) return null;

    const envs = {
        [pgEnv]: {
            label: 'external',
            srcAttributes: ['name', 'metadata'],
            viewAttributes: ['version']
        },
        [`${app}+${siteType}`]: {
            label: 'managed',
            isDms: true,
            srcAttributes: ['app', 'name', 'doc_type', 'config'],
            viewAttributes: ['name']
        }
    };

    // ===================================== handle post init prop changes begin =======================================
    useEffect(() => {
        if(isEqual(format, existingSource)) return;
        setExistingSource(format)
    }, [format]);

    useEffect(() => {
        if(view === currentView) return;
        setCurrentView(view)
    }, [view]);
    // ===================================== handle post init prop changes end =========================================

    useEffect(() => {
        getSources({envs, falcor, apiLoad}).then(data => {
            setSources((data || []))
            const existingMatch = data.find(form => +form.id === +format.id);
            setExistingSource(existingMatch)

            // if the format updated (mostly meta) then keep doc_type and originalDocType.
            if(existingMatch && !isEqual(existingMatch, format)) {
                setFormat({
                    ...existingMatch,
                    view_id: existingSource.view_id,
                    doc_type: existingSource.doc_type || existingMatch.doc_type,
                    originalDocType: existingSource.originalDocType
                })
            };
        });
    }, [app, siteType]);

    useEffect(() => {
        // if source changes, get views
        getViews({envs, source: existingSource, falcor, apiLoad}).then(v => {
            setViews(v)
            if(v?.length === 1) setCurrentView(v?.[0]?.id)
        })
    }, [existingSource])

    useEffect(() => {
        // if view changes, update type and set format
        if(!currentView) return;
        setView(currentView)
    }, [currentView])

    return (
        <div className={'flex w-full bg-white items-center'}>
            <label className={'p-1'}>Source: </label>
            <div className={'w-1/2'}>
                <FilterableSearch
                    className={'flex-row-reverse'}
                    placeholder={'Search...'}
                    options={sources.map(({id, name, srcEnv}) => ({key: id, label: `${name} (${envs[srcEnv].label})`}))}
                    value={existingSource?.id}
                    onChange={e => {
                        const tmpFormat = sources.find(f => +f.id === +e) || {};
                        // add type, as we only get doc_type here.
                        setExistingSource({...tmpFormat, type: tmpFormat.type || tmpFormat.doc_type})
                        setFormat({...tmpFormat, type: tmpFormat.type || tmpFormat.doc_type})
                        setVisibleAttributes && setVisibleAttributes([]);
                    }}
                />
            </div>
            <label className={'p-1'}>View: </label>
            <div className={'w-1/2'}>
                <FilterableSearch
                    className={'flex-row-reverse'}
                    placeholder={'Search...'}
                    options={views.map(({id, name, version}) => ({key: id, label: name || version}))}
                    value={+currentView}
                    onChange={e => setCurrentView(e)}
                />
            </div>
        </div>
    )
}