import React, {useState, useEffect, useContext, useMemo} from 'react'
import {CMSContext} from "../../../siteConfig";
import {cloneDeep, get} from "lodash-es";
import {Link} from "react-router-dom";
import writeXlsxFile from 'write-excel-file';
import {Download} from '../../icons'
import RenderSwitch from "./dataWrapper/components/Switch";
import FilterableSearch from "./FilterableSearch";
import { RegisteredComponents } from "./index";
import {dmsDataEditor} from "../../../../../api";

const range = (start, end) => Array.from({length: (end + 1 - start)}, (v, k) => k + start);

const parseIfJson = str => {
    if(typeof str === "object") return str;

    try{
        return JSON.parse(str);
    }catch (e){
        return str;
    }
}

const cols = {
    [`data->>'base_url' as base_url`]: {label: 'Base Url', name: 'base_url'},
    [`data->>'doc_type' as doc_type`]: {label: 'Doc Type', name: 'doc_type'},
    [`data->>'subdomain' as subdomain`]: {label: 'Subdomain', name: 'subdomain'},
    [`data->>'authLevel' as authLevel`]: {label: 'Auth Level', name: 'authLevel'}
}

const sectionCols = [
    // {name: 'sortBy', display_name: 'sort'},
    {name: 'tracking_id', display_name: 'id'},
    {name: 'parent', display_name: 'Parent'},
    {name: 'page_title', display_name: 'Page Title'},
    {name: 'section_title', display_name: 'Section Title'},
    {name: 'element_type', display_name: 'Type'},
    {name: 'tags', display_name: 'Tags'},
    {name: 'url', display_name: 'URL'},
    {name: 'attribution', display_name: 'Current Version'}, // link to cenrep, and version name in data
]

const getSources = async ({envs, falcor, setLoading}) => {
    const lenRes = await falcor.get(['uda', Object.keys(envs), 'sources', 'length']);
    setLoading(true);
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

const getViews = async ({envs, source, falcor}) => {
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

const DownloadExcel = ({ sections, pattern, fileName='sections' }) => {

    const handleDownload = async () => {
        const data = (sections || []).map(section => sectionCols.reduce((acc, {name}) => {
            let value;

            if(name === 'attribution'){
                const attribution = getAttribution({section});
                value = (attribution || []).map(attr => `${attr.version} (${attr.source})`).join(', ')
            }else if(name === 'url'){
                value = getURL({name, section, pattern});
            }else{
                value = section[name]
            }
            acc[name] = typeof value !== 'object' ? value.toString() : value;
            return acc;
        }, {}))
        // Define the schema for the Excel file (columns and their data types)
        const schema = sectionCols.map(({name, display_name}) => ({
            column: display_name,
            type: String,
            value: data => data?.[name],
            ...name === 'url' && {'hyperlink': data => data?.[name]}
        }));

        // Use the writeXlsxFile function to create and download the Excel file
        await writeXlsxFile(data, {
            schema,
            fileName: `${fileName}.xlsx`,
        });
    };

    return (
        <button className={'p-1 border rounded-md group'} onClick={handleDownload}>
            <Download className={'text-blue-500 group-hover:text-blue-700'} height={20} width={20}/>
        </button>
    );
};
const getURL = ({name, section={}, pattern={}}) => {
    const url = name === 'page_title' ? section.url_slug : `${section.url_slug}#${section.section_id}`;
    const patternBaseUrl = pattern.base_url?.replace('/', '')
    const {protocol, host} = window.location;
    const domain = host.split('.').length > 2 ? host.split('.').slice(1).join('.') : host; // devmny.org
    const subDomain = typeof pattern.subdomain === 'string' ? `${pattern.subdomain}.${domain}` : domain ;
    return patternBaseUrl?.length ? `${protocol}//${subDomain}/${patternBaseUrl}/edit/${url}` : `${protocol}//${subDomain}/edit/${url}`;
}

const getCenRepURL = ({name, section, pattern}) => {
    const url = '/cenrep';
    const patternBaseUrl = pattern.base_url?.replace('/', '')
    const {protocol, host} = window.location;
    const domain = host.split('.').length > 2 ? host.split('.').slice(1).join('.') : host; // devmny.org
    const subDomain = typeof pattern.subdomain === 'string' ? `${pattern.subdomain}.${domain}` : domain ;
    return patternBaseUrl?.length ? `${protocol}//${subDomain}/${patternBaseUrl}/${url}` : `${protocol}//${subDomain}/${url}`;
}

const getParentChain = (item, items, enableDebugging) => {
    enableDebugging && console.log('running for', item.page_title, item)
    if(!items?.length) return [];
    if(!item.page_parent) return [item];

    const parent = items.find(i => +i.page_id === +item.page_parent);
    enableDebugging && console.log('parent for ', item.page_title, parent, items)
    if(!parent) return [];
    if(!parent.page_parent) return [parent, item];
    return [...getParentChain(parent, items), item];
};

const getAttribution = ({section}) => {
    if(!section.attribution) return null;

    const attribution = Array.isArray(section.attribution) ? section.attribution : [section.attribution];
    return attribution.map(attr => ({version: attr.version, source: attr.source_id, view: attr.view_id, url: `/cenrep/source/${attr.source_id}/versions/${attr.view_id}`}))
}
const RenderTags = ({value}) => !value ? <div className={'p-1'}>N/A</div> :
    <div className={'flex flex-wrap items-center'}>
        {
            value.split(',').map((tag, i) =>
                <div key={`${tag}-${i}`} className={'text-sm font-semibold text-white m-0.5 py-0.5 px-1 rounded-lg bg-red-300 h-fit w-fit'}>{tag}</div>)}
    </div>

const RenderAttribution = ({value, section}) => {
    const attribution = getAttribution({section});
    const links = (attribution || []).map((attr, i) => <Link key={i} to={attr.url} className={'p-1'}>{attr.version}</Link>)
    return <div>{links || 'N/A'}</div>
}

const RenderText = ({value}) => <div className={'p-1 overflow-hidden'}>{value || 'N/A'}</div>;

const RenderLink = ({value, section, name, pattern}) => {
    const url = getURL({name, section, pattern})
    return <Link className={'p-1 overflow-hidden'} to={url}>{name === 'url' ? 'link' : (value || 'N/A')}</Link>;
}

const RenderParent = ({value=''}) => {
    return <div className={'flex flex-wrap text-gray-900 text-sm items-center'}>
        {
            value?.split('/')
                .map((p, i) => <span key={i} className={'bg-blue-300 font-semibold text-white m-0.5 py-0.5 px-1 w-fit h-fit rounded-lg'}>{p}</span>)
                .reduce((acc, curr, i) => i === 0 ? [curr] : [...acc, <span key={`${i}_`}>/</span>, curr], [])

        }
    </div>
}

const RenderValue = ({value, name, section, sections, pattern}) =>
    name === 'tags' ? <RenderTags value={value} /> :
        name === 'attribution' ? <RenderAttribution value={value} section={section}/> :
            ['page_title', 'section_title', 'url'].includes(name) ?
                <RenderLink name={name} value={value} section={section} pattern={pattern}/> :
                    name === 'parent' ? <RenderParent value={value} /> :
                <RenderText value={value} />

async function getPatterns({app, falcor}){
    const options = JSON.stringify({
        filter: {
            "data->>'pattern_type'": ['page']
        }
    });
    const attributes = [
        `data->>'base_url' as base_url`,`data->>'doc_type' as doc_type`,
        `data->>'subdomain' as subdomain`, `data->>'authLevel' as authLevel`
    ]
    const lenPath = ['dms', 'data', `${app}+pattern`, 'options', options, 'length']
    const lengthRes = await falcor.get(lenPath);
    const length = get(lengthRes, ['json', ...lenPath], 0);

    if(!length) return;

    const dataPath = ['dms', 'data', `${app}+pattern`, 'options', options, 'byIndex'];
    await falcor.get([...dataPath, {from: 0, to: length - 1}, attributes]);
    const data = get(falcor.getCache(), dataPath, {});

    return Object.values(data).map(pattern => Object.keys(pattern).reduce((acc, col) => ({...acc, [cols[col].name]: pattern[col]}), {}));
}

async function getSections({app, pattern, falcor, setLoading}){
    setLoading(true)
    const dataPath = ['dms', 'data', `${app}+${pattern}`, 'sections'];
    await falcor.get(dataPath);
    return get(falcor.getCache(), [...dataPath, 'value'], {});
}

const processSections = (sections) => sections.map((s) => {
    const parentChain = getParentChain(s, sections);
    const parent = parentChain.map(p => p.page_title || p.url_slug).join('/');
    const sortBy = parentChain.map(p => p.page_index).join('-');
    return {...s, parent, sortBy};
})
    .filter(s => s.parent && s.sortBy) // orphans
    .sort((a,b) => a.sortBy.localeCompare(b.sortBy));

const updateSections = async ({sections, newView, falcor, user, setUpdating}) => {
    // for each section, update view. call dmsDataEditor. Update page flag too. group all page updates and do them togather. avoid duplicate page update calls.
    setUpdating(true);

    const updatedSections = sections.map(async section => {
        try {
            const section_id = section.section_id;
            const page_id = section.page_id;

            const comp = RegisteredComponents[section.element_type];
            const dataRes = await falcor.get(['dms', 'data', 'byId', [section_id], ['app', 'type', 'data']]);

            const sectionData = get(dataRes, ['json', 'dms', 'data', 'byId', section_id, 'data'], {});
            const sectionApp = get(dataRes, ['json', 'dms', 'data', 'byId', section_id, 'app'], {});
            const sectionType = get(dataRes, ['json', 'dms', 'data', 'byId', section_id, 'type'], {});
            const sectionConfig = {format: {app: sectionApp, type: sectionType}};

            const data = sectionData?.['element']?.['element-data'] ? JSON.parse(sectionData.element['element-data']) : {};

            let additionalVariables = data.additionalVariables;

            let controlVars = (comp?.variables || []).reduce((out,curr) => {
                out[curr.name] =  data[curr.name]
                return out
            },{})

            const args = {...controlVars, version: newView, additionalVariables};

            return comp?.getData ? comp.getData(args,falcor).then(async data => {
                sectionData.element['element-data'] = JSON.stringify(data);
                sectionData.id = section_id;

                await dmsDataEditor(falcor, sectionConfig, sectionData);

                return ({page_id, section_id, sectionTitle: sectionData.title})
            }) : ({err: 'no getData'})
        }catch (err){
            console.error('<Update-Section> Error: ', err)
            return ({err})
        }
    });

    const sectionsResolvedPromises = await Promise.allSettled(updatedSections);

    const updatedPages = sectionsResolvedPromises.reduce((acc, {value: {err, page_id, ...rest}}) => {
        if(err) return acc;
        const existingIndex = acc.findIndex(a => a.page_id === page_id);
        const currSection = rest;

        if(existingIndex >= 0){
            acc[existingIndex].sections.push(currSection)
        }else{
            acc.push({page_id, sections: [currSection]})
        }
        return acc;
    }, [])
        .map(async ({page_id, sections}) => {
            try {
                // update page history, and has_changes to true;
                const dataRes = await falcor.get(['dms', 'data', 'byId', [page_id], ['app', 'type', 'data']]);

                const pageData = get(dataRes, ['json', 'dms', 'data', 'byId', page_id, 'data'], {});
                const pageApp = get(dataRes, ['json', 'dms', 'data', 'byId', page_id, 'app'], {});
                const pageType = get(dataRes, ['json', 'dms', 'data', 'byId', page_id, 'type'], {});
                const pageConfig = {format: {app: pageApp, type: pageType}};

                let historyUpdate = sections.map(({section_id, sectionTitle}) => ({
                    type: `Updated Section remotely ${sectionTitle || pageData.draft_sections.findIndex(s => +s.id === +section_id) + 1}`,
                    user: user.email,
                    time: new Date().toString()
                }))

                let history = pageData?.history ? cloneDeep(pageData.history) : []
                history.push(...historyUpdate);

                const updatedPage = {
                    ...pageData,
                    has_changes: true,
                    history
                }
                await dmsDataEditor(falcor, pageConfig, updatedPage);
            }catch (err){
                console.error('<Update-Page> Error:', err)
                return {err}
            }
    })

    await Promise.allSettled(updatedPages).then(() => {
        setUpdating(false)
        window.location = window.location;
    });
}

const Edit = ({value, onChange}) => {
    const {app, siteType, baseUrl, falcor, falcorCache, pgEnv, user, ...rest} = useContext(CMSContext) || {}
    const cachedData = parseIfJson(value) ? JSON.parse(value) : {};
    const [loading, setLoading] = useState(false);
    const [patterns, setPatterns] = useState([]);
    const [pattern, setPattern] = useState(cachedData.pattern || []);
    const [sections, setSections] = useState(cachedData.sections || [])
    const [filterNullTags, setFilterNullTags] = useState(false);
    const [sources, setSources] = useState([]);
    const [source, setSource] = useState({});
    const [views, setViews] = useState([]);
    const [view, setView] = useState();
    const [newView, setNewView] = useState();
    const [elementType, setElementType] = useState();
    const [updating, setUpdating] = useState(false);

    // ============================================ data load begin ====================================================
    const envs = useMemo(() => ({
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
    }), [pgEnv, app, siteType]);

    useEffect(() => {
        setLoading(true)
        getPatterns({app, falcor}).then(patterns => {
            setPatterns(patterns);
            setLoading(false);
        });
    }, [])

    useEffect(() => {
        if(!pattern) return;
        getSections({app, pattern, falcor, setLoading}).then(sections => {
            setSections(processSections(sections));
            setLoading(false);
        })

        getSources({envs, falcor, setLoading}).then(data => {
            setSources(data);
            setLoading(true);
        });
    }, [app, pattern, envs])

    useEffect(() => {
        if(!pattern) return;
        getViews({envs, source, falcor}).then(v => {
            setViews(v)
            // if(v?.length === 1) setView(v?.[0]?.id)
        })
    }, [source, app, pattern, envs]);

    const sectionTypeCount = useMemo(() => sections.reduce((acc, curr) => {
        acc[curr.element_type] = (acc[curr.element_type] || 0) + 1;
        return acc;
    }, {}), [sections]);
    // ============================================ data load end ======================================================

    // ============================================ save begin =========================================================
    useEffect(() => {
        onChange && onChange(JSON.stringify({
            ...cachedData, pattern
        }))
    }, [pattern]);
    // ============================================ save end ===========================================================
    const gridTemplateColumns = '0.2fr 2fr 1fr 1fr 0.5fr 0.7fr 0.2fr 1fr';

    const filterSectionBySourceCondition = (section) => {
        // if no source has been selected, return true.
        // if a source is selected, but a view is not selected, match source
        // regardless of source and view, if an element type has been selected, match it.

        const attribution = getAttribution({section});

        const sourceViewCondition = !source?.id || attribution?.some(attr => +attr.source === +source?.id && (!view || +attr.view === +view));
        const elementTypeCondition = !elementType || elementType === section?.element_type;

        return sourceViewCondition && elementTypeCondition;
    }

    return (
        <div>
            <div className={'flex justify-between items-center'}>
                <div className={'flex w-full'}>
                    <label htmlFor={'pattern-selector'}>Site: </label>
                    <select
                        id={'pattern-selector'}
                        className={'flex-0 w-full p-1 bg-blue-100 hover:bg-blue-300 border rounded-md'}
                        value={pattern}
                        onChange={e => setPattern(e.target.value)}
                    >
                        <option>please select a pattern</option>
                        {
                            (patterns || []).map(pattern => <option key={pattern.doc_type}
                                                                    value={pattern.doc_type}>{pattern.doc_type}</option>)
                        }
                    </select>
                </div>
                {
                    !loading && <DownloadExcel sections={sections} pattern={patterns.find(p => p.doc_type === pattern)}
                                               fileName={`${pattern}_sections`}/>
                }
            </div>
            <div
                className={'flex items-center p-1 text-sm rounded-md my-1 w-fit bg-gray-100 hover:bg-gray-200 cursor-pointer'}
                onClick={() => setFilterNullTags(!filterNullTags)}
            >
                <span className={'mr-1'}>Filter Empty Tags</span>
                <RenderSwitch enabled={filterNullTags} setEnabled={e => setFilterNullTags(e)} label={'filter null tags'}
                              size={'small'}/>
            </div>
            <div className={'flex w-full bg-white items-center'}>
                <label className={'p-1'}>Type: </label>
                <div className={'w-1/6'}>
                    <FilterableSearch
                        className={'flex-row-reverse'}
                        placeholder={'Search...'}
                        options={
                            Object.keys(RegisteredComponents)
                                .filter(k => !RegisteredComponents[k].hideInSelector)
                                .sort((a,b) => (sectionTypeCount[a] || 0) - (sectionTypeCount[b] || 0))
                                .map(k => (
                                    {
                                        key: k, label: `${RegisteredComponents[k].name} (${sectionTypeCount[k] || 0})` || RegisteredComponents[k].name || k
                                    }
                                ))
                        }
                        value={elementType}
                        onChange={e => setElementType(e)}
                    />
                </div>
                <label className={'p-1'}>Source: </label>
                <div className={'w-1/4'}>
                    <FilterableSearch
                        className={'flex-row-reverse'}
                        placeholder={'Search...'}
                        options={sources.map(({id, name, srcEnv}) => ({
                            key: id,
                            label: `${name} (${envs[srcEnv].label})`
                        }))}
                        value={source?.id}
                        onChange={e => {
                            setSource(sources.find(s => +s.id === +e))
                        }}
                    />
                </div>
                <label className={'p-1'}>Current Version: </label>
                <div className={'w-1/4'}>
                    <FilterableSearch
                        className={'flex-row-reverse'}
                        placeholder={'Search...'}
                        options={views.map(({id, name, version}) => ({key: id, label: name || version}))}
                        value={view}
                        onChange={e => setView(e)}
                    />
                </div>
                {
                    view ? (
                        <>
                            <label className={'p-1'}>Update to Version: </label>
                            <div className={'w-1/4'}>
                                <FilterableSearch
                                    className={'flex-row-reverse'}
                                    placeholder={'Search...'}
                                    options={views.filter(v => v.id !== view).map(({id, name, version}) => ({
                                        key: id,
                                        label: name || version
                                    }))}
                                    value={newView}
                                    onChange={e => setNewView(e)}
                                />
                            </div>
                        </>
                    ) : null
                }

                {
                    newView ? (
                        <button
                            disabled={updating}
                            className={'p-1 bg-blue-300 hover:bg-blue-600 text-white rounded-md'}
                            onClick={() => updateSections({
                                user,
                                newView,
                                sections: sections.filter((s, sI) => (!filterNullTags || s.tags?.length) && filterSectionBySourceCondition(s)),
                                falcor,
                                setUpdating
                            })}
                        >{updating ? 'updating...' : 'update'}</button>
                    ) : null
                }
            </div>
            <div className={'grid grid-cols-8 divide-x font-semibold text-sm border-x border-t'}
                 style={{gridTemplateColumns}}>
                {
                    sectionCols.map(c => <div key={c.name} className={'p-1'}>{c.display_name}</div>)
                }
            </div>
            {
                loading ? <div className={'w-full text-center'}>loading...</div> :
                    <div className={'max-h-[700px] overflow-auto scrollbar-sm border rounded-md'}>
                        {
                            (sections || [])
                                .filter((s, sI) => (!filterNullTags || s.tags?.length) && filterSectionBySourceCondition(s))
                                .map((section, i) => (
                                    <div key={`${section.section_id}-${i}`}
                                         className={'grid grid-cols-8 font-light text-sm even:bg-blue-50 hover:bg-blue-100'}
                                         style={{gridTemplateColumns}}>
                                        {
                                            sectionCols.map(({name}) =>
                                                <RenderValue key={`${section.section_id}_${i}_${name}`}
                                                             value={section[name]}
                                                             name={name}
                                                             section={section}
                                                             sections={sections}
                                                             pattern={patterns.find(p => p.doc_type === pattern)}
                                                />)
                                        }
                                    </div>
                                ))
                        }
                    </div>
            }
        </div>
    )
}

Edit.settings = {
    hasControls: true,
    name: 'ElementEdit'
}


export default {
    "name": 'Table: Components Index',
    "type": 'table',
    "variables": [],
    "EditComp": Edit,
    "ViewComp": Edit
}