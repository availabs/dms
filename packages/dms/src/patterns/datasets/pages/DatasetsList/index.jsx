import React, {useMemo, useState, useEffect, useRef, useContext} from 'react'
import {useParams, useLocation} from "react-router"
import {get, isEqual} from "lodash-es";
import {Link, useSearchParams} from "react-router";
import SourcesLayout from "../layout";
import {DatasetsContext} from "../../context";
import {Modal} from "../../ui";
import { cloneDeep } from "lodash-es";
import { buildEnvsForListing } from "../../utils/datasources";

export const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

const range = (start, end) => Array.from({length: (end + 1 - start)}, (v, k) => k + start);

const getSources = async ({envs, falcor, parent, user}) => {
    if(!envs || !Object.keys(envs)) return [];
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

                        if(['categories'].includes(attr)) {
                            value = typeof value === 'string' ? JSON.parse(value || '[]') : (value || []);
                            return ({...acc, ['categories']: value})
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


const SourceThumb = ({ source={}, format }) => {
    const {UI} = useContext(DatasetsContext);
    const {ColumnTypes} = UI;
    const Lexical = ColumnTypes.lexical.ViewComp;
    const source_id = source.id || source.source_id;
    const {isDms} = source;
    const icon = isDms ? (format.registerFormats || []).find(f => f?.type?.includes('|source'))?.type === source.type ? 'Datasets' : 'Forms' : 'External';

    return (
        <div className="w-full p-4 bg-white hover:bg-blue-50 border shadow flex">
            <div>
                <Link to={`${isDms ? 'internal_source' : 'source'}/${source_id}`} className="text-xl font-medium w-full block">
                    <span>{source?.name || source?.doc_type}</span> <span className={'text-sm text-gray-900 italic'}>{icon}</span>
                </Link>
                <div>
                    {(Array.isArray(source?.categories) ? source?.categories : [])
                        .map(cat => (typeof cat === 'string' ? [cat] : cat).map((s, i) => (
                            <Link key={i} to={`?cat=${i > 0 ? cat[i - 1] + "/" : ""}${s}`}
                                  className="text-xs p-1 px-2 bg-blue-200 text-blue-600 mr-2">{s}</Link>
                        )))
                    }
                </div>
                <Link to={`${isDms ? 'internal_source' : 'source'}/${source_id}`} className="py-2 block">

                    <Lexical value={source?.description}/>
                </Link>
            </div>


        </div>
    );
};

const RenderAddPattern = ({isAdding, setIsAdding, updateData, sources=[], type, damaDataTypes}) => {
    const [data, setData] = useState({name: ''});
    const ExternalComp = damaDataTypes[data?.type]?.sourceCreate?.component;
    return (
        <Modal open={isAdding} setOpen={setIsAdding} className={'w-full p-4 bg-white hover:bg-blue-50 border shadow flex items-center'}>
            <select className={'w-full p-1 rounded-md border bg-white'}
                    value={data.id}
                    onChange={e => {
                        const matchingSource = sources.find(s => s.id === e.target.value);
                        if(matchingSource) {
                            const numMatchingDocTypes = sources.filter(s => s.doc_type.includes(`${matchingSource.doc_type}_copy_`)).length;
                            const clone = cloneDeep(matchingSource);
                            // delete clone.id; remove on btn click since it's used to ID in select.
                            clone.name = `${clone.name} copy (${numMatchingDocTypes+1})`
                            setData(clone)
                        }else if(damaDataTypes[e.target.value]){
                            setData({...data, type: e.target.value})
                        }else{
                            setData({name: ''})
                        }
                    }}>
                <option key={'create-new'} value={undefined}>Create new</option>
                {
                    (sources || []).filter(s => s.doc_type).map(source => <option key={source.id} value={source.id}>{source.name} ({source.doc_type})</option> )
                }
                {
                    Object.keys(damaDataTypes).map(source => (<option key={source} value={source}>{source}</option>))
                }
            </select>
            <input className={'p-1 mx-1 text-sm font-light w-full block'}
                   key={'new-form-name'}
                   value={data.name}
                   placeholder={'Name'}
                   onChange={e => setData({...data, name: e.target.value})}
            />
            {
                !damaDataTypes[data?.type] || !ExternalComp ? (
                    <>
                        <button className={'p-1 mx-1 bg-blue-300 hover:bg-blue-500 text-white'}
                                disabled={!data.name}
                                onClick={async () => {
                                    const clonedData = cloneDeep(data);
                                    delete clonedData.id;
                                    delete clonedData.views;
                                    clonedData.doc_type = crypto.randomUUID();
                                    await updateData({sources: [...(sources || []).filter(s => s.type === `${type}|source`), clonedData]})
                                    window.location.reload()
                                }}
                        >add</button>
                        <button className={'p-1 mx-1 bg-red-300 hover:bg-red-500 text-white'}
                                onClick={() => {
                                    setData({name: ''})
                                    setIsAdding(false)
                                }}
                        >cancel</button>
                    </>
                ) : <ExternalComp context={DatasetsContext} source={data} />
            }
        </Modal>
    )
}
export default function ({attributes, item, dataItems, apiLoad, apiUpdate, updateAttribute, format, submit, ...r}) {
    const {baseUrl, user, parent, falcor, siteType, type, damaDataTypes, datasources} = useContext(DatasetsContext);
    const [sources, setSources] = useState([]);
    const [layerSearch, setLayerSearch] = useState("");
    const {...rest } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const [sort, setSort] = useState('asc');
    const [isAdding, setIsAdding] = useState(false);
    const actionButtonClassName = 'bg-transparent hover:bg-blue-100 rounded-sm p-2 ml-0.5 border-2';
    const isListAll = false;
    const filteredCategories = []; // categories you want to exclude from landing list page.
    const cat1 = searchParams.get('cat');
    const cat2 = undefined;
    const envs = buildEnvsForListing(datasources, format);

    const updateData = (data) => {
        console.log('updating data', parent, data, format)
        return apiUpdate({data: {...parent, ...data}, config: {format}})
    }

    useEffect(() => {
        let isStale = false;
        getSources({envs, falcor, apiLoad, user}).then(data => {
            setSources(data)
        });

        return () => {
            isStale = true;
        }
    }, [format?.app, siteType]);

    const categories = [...new Set(
        (sources || [])
            .filter(source => {
                return isListAll || (
                    // we're not listing all sources
                    !isListAll &&
                    !(Array.isArray(source?.categories) ? source?.categories : []).find(cat =>
                        // find if current category $cat includes any of filtered categories
                        filteredCategories.find(filteredCategory => cat.includes(filteredCategory))))
            })
            .reduce((acc, s) => [...acc, ...((Array.isArray(s?.categories) ? s?.categories : [])?.map(s1 => s1[0]) || [])], []))].sort()


      const categoriesCount = categories.reduce((acc, cat) => {
        acc[cat] = (sources || []).filter(p => p?.categories).filter(pattern => {
            return (Array.isArray(pattern?.categories) ? pattern?.categories : [pattern?.categories])
                ?.find(category => category.includes(cat))
        })?.length
        return acc;
    }, {})

    return (
        <SourcesLayout fullWidth={true} isListAll={false} hideBreadcrumbs={false} hideNav={true}
                       baseUrl={`${baseUrl}/${rest['*']}`} page={cat1 ? {name: cat1, href: `?cat=${cat1}`} : {}} >
            <div className="flex flex-rows items-center">
                <input
                    className="w-full text-lg p-2 border border-gray-300 "
                    placeholder="Search datasources"
                    value={layerSearch}
                    onChange={(e) => setLayerSearch(e.target.value)}
                />

                <button
                    className={actionButtonClassName}
                    title={'Toggle Sort'}
                    onClick={() => setSort(sort === 'asc' ? 'desc' : 'asc')}
                >
                    <i className={`fa-solid ${sort === 'asc' ? `fa-arrow-down-z-a` : `fa-arrow-down-a-z`} text-xl text-blue-400`}/>
                </button>

                {
                    user?.authed &&
                    <button
                        className={actionButtonClassName} title={'Add'}
                        onClick={() => setIsAdding(!isAdding)}
                    >
                        <i className={`fa-solid fa-add text-xl text-blue-400`}/>
                    </button>
                }

            </div>
            <div className={'flex flex-row'}>
                <div className={'w-1/4 flex flex-col space-y-1.5 max-h-[80dvh] overflow-auto scrollbar-sm'}>
                    {(categories || [])
                        // .filter(cat => cat !== sourceDataCat) // should be already filtered out. if not, fix categories logic.
                        .sort((a,b) => a.localeCompare(b))
                        .map(cat => (
                            <Link
                                key={cat}
                                className={`${cat1 === cat || cat2 === cat ? `bg-blue-100` : `bg-white`} hover:bg-blue-50 p-2 rounded-md flex items-center`}
                                to={`${isListAll ? `/listall` : ``}?cat=${cat}`}
                            >
                                <i className={'fa fa-category'} /> {cat}
                                <div className={'bg-blue-200 text-blue-600 text-xs w-5 h-5 ml-2 shrink-0 grow-0 rounded-lg flex items-center justify-center border border-blue-300'}>{categoriesCount[cat]}</div>
                            </Link>
                        ))
                    }
                </div>
                <div className={'w-3/4 flex flex-col space-y-1.5 ml-1.5 max-h-[80dvh] overflow-auto scrollbar-sm'}>
                  <RenderAddPattern
                    sources={sources}
                    setSources={setSources}
                    damaDataTypes={damaDataTypes}
                    updateData={updateData}
                    isAdding={isAdding}
                    setIsAdding={setIsAdding}
                    submit={submit}
                    type={type}
                  />
                    {
                        (sources || [])
                            .filter(source => {
                                return isListAll || (
                                    // we're not listing all sources
                                    !isListAll &&
                                    !(Array.isArray(source?.categories) ? source?.categories : [])?.find(cat =>
                                        // find if current category $cat includes any of filtered categories
                                        filteredCategories.find(filteredCategory => cat.includes(filteredCategory))))
                            })
                            .filter(source => {
                                let output = true;
                                if (cat1) {
                                    output = false;
                                    (Array.isArray(source?.categories) ? source?.categories : [])
                                        .forEach(site => {
                                            if (site[0] === cat1 && (!cat2 || site[1] === cat2)) {
                                                output = true;
                                            }
                                        });
                                }
                                return output;
                            })
                            .filter(source => {
                                let searchTerm = ((source?.name || source?.doc_type) + " " + (
                                    (Array.isArray(source?.categories) ? source?.categories : [source?.categories]) || [])
                                    .reduce((out,cat) => {
                                        out += Array.isArray(cat) ? cat.join(' ') : typeof cat === 'string' ? cat : '';
                                        return out
                                    },'')) //get(source, "categories[0]", []).join(" "));
                                return !layerSearch.length > 2 || searchTerm.toLowerCase().includes(layerSearch.toLowerCase());
                            })
                            .sort((a,b) => {
                                const m = sort === 'asc' ? 1 : -1;
                                return m * a?.doc_type?.localeCompare(b?.doc_type)
                            })
                            .map((s, i) => <SourceThumb key={i} source={s} baseUrl={baseUrl} format={format} />)
                    }
                </div>
            </div>
        </SourcesLayout>
    )
}
