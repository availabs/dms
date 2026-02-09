import React, {useState, useEffect, useContext, useMemo} from 'react'
import {get} from "lodash-es";
import {Link, useSearchParams} from "react-router";
import {DatasetsContext} from "../../context";
import {ThemeContext} from "../../../../ui/useTheme";
import { cloneDeep } from "lodash-es";
import { buildEnvsForListing } from "../../utils/datasources";
import Breadcrumbs from "../../components/Breadcrumbs";

export const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

const range = (start, end) => Array.from({length: (end + 1 - start)}, (v, k) => k + start);

const sourcesCache = new Map();

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


const SourceThumb = React.memo(({ source={}, format }) => {
    const {UI} = useContext(DatasetsContext);
    const {theme} = useContext(ThemeContext) || {};
    const t = theme?.datasets?.datasetsList || {};
    const {ColumnTypes} = UI;
    const Lexical = ColumnTypes.lexical.ViewComp;
    const source_id = source.id || source.source_id;
    const {isDms} = source;
    const icon = isDms ? (format.registerFormats || []).find(f => f?.type?.includes('|source'))?.type === source.type ? 'Datasets' : 'Forms' : 'External';

    return (
        <div className={t.sourceCard}>
            <div>
                <Link to={`${isDms ? 'internal_source' : 'source'}/${source_id}`} className={t.sourceTitle}>
                    <span>{source?.name || source?.doc_type}</span> <span className={t.sourceTypeLabel}>{icon}</span>
                </Link>
                <div>
                    {(Array.isArray(source?.categories) ? source?.categories : [])
                        .map(cat => (typeof cat === 'string' ? [cat] : cat).map((s, i) => (
                            <Link key={i} to={`?cat=${i > 0 ? cat[i - 1] + "/" : ""}${s}`}
                                  className={t.sourceCategoryBadge}>{s}</Link>
                        )))
                    }
                </div>
                <div className={t.sourceDescription}>
                    <Lexical value={source?.description}/>
                </div>
            </div>
        </div>
    );
});

const RenderAddPattern = ({isAdding, setIsAdding, updateData, sources=[], type, damaDataTypes}) => {
    const {UI} = useContext(DatasetsContext);
    const {Modal, Select, Input, Button} = UI;
    const [data, setData] = useState({name: ''});
    const ExternalComp = damaDataTypes[data?.type]?.sourceCreate?.component;

    const selectOptions = [
        {label: 'Create new', value: ''},
        ...(sources || []).filter(s => s.doc_type).map(s => ({label: `${s.name} (${s.doc_type})`, value: s.id})),
        ...Object.keys(damaDataTypes).map(k => ({label: k, value: k})),
    ];

    return (
        <Modal open={isAdding} setOpen={setIsAdding}>
            <Select
                options={selectOptions}
                value={data.id || ''}
                onChange={e => {
                    const val = e.target.value;
                    const matchingSource = sources.find(s => s.id === val);
                    if(matchingSource) {
                        const numMatchingDocTypes = sources.filter(s => s.doc_type.includes(`${matchingSource.doc_type}_copy_`)).length;
                        const clone = cloneDeep(matchingSource);
                        clone.name = `${clone.name} copy (${numMatchingDocTypes+1})`
                        setData(clone)
                    }else if(damaDataTypes[val]){
                        setData({...data, type: val})
                    }else{
                        setData({name: ''})
                    }
                }}
            />
            <Input
                value={data.name}
                placeholder={'Name'}
                onChange={e => setData({...data, name: e.target.value})}
            />
            {
                !damaDataTypes[data?.type] || !ExternalComp ? (
                    <div className="flex gap-2 mt-2">
                        <Button
                            disabled={!data.name}
                            onClick={async () => {
                                const clonedData = cloneDeep(data);
                                delete clonedData.id;
                                delete clonedData.views;
                                clonedData.doc_type = crypto.randomUUID();
                                await updateData({sources: [...(sources || []).filter(s => s.type === `${type}|source`), clonedData]})
                                window.location.reload()
                            }}
                        >add</Button>
                        <Button
                            type="plain"
                            onClick={() => {
                                setData({name: ''})
                                setIsAdding(false)
                            }}
                        >cancel</Button>
                    </div>
                ) : <ExternalComp context={DatasetsContext} source={data} />
            }
        </Modal>
    )
}
export default function ({attributes, item, dataItems, apiLoad, apiUpdate, updateAttribute, format, submit, ...r}) {
    const {baseUrl, user, parent, falcor, siteType, type, damaDataTypes, datasources, UI} = useContext(DatasetsContext);
    const {theme} = useContext(ThemeContext) || {};
    const t = theme?.datasets?.datasetsList || {};
    const {Layout, Icon, Button, Input} = UI;
    const cacheKey = `${format?.app}-${siteType}`;
    const [sources, setSources] = useState(() => sourcesCache.get(cacheKey) || []);
    const [layerSearch, setLayerSearch] = useState("");
    const [searchParams] = useSearchParams();
    const [sort, setSort] = useState('asc');
    const [isAdding, setIsAdding] = useState(false);
    const cat1 = searchParams.get('cat');
    const envs = useMemo(() => buildEnvsForListing(datasources, format), [datasources, format]);

    const updateData = (data) => {
        console.log('updating data', parent, data, format)
        return apiUpdate({data: {...parent, ...data}, config: {format}})
    }

    useEffect(() => {
        getSources({envs, falcor, apiLoad, user}).then(data => {
            setSources(data);
            sourcesCache.set(cacheKey, data);
        });
    }, [format?.app, siteType]);

    const categories = useMemo(() => [...new Set(
        (sources || [])
            .reduce((acc, s) => [...acc, ...((Array.isArray(s?.categories) ? s?.categories : [])?.map(s1 => s1[0]) || [])], []))].sort(),
    [sources]);

    const categoriesCount = useMemo(() => categories.reduce((acc, cat) => {
        acc[cat] = (sources || []).filter(p => p?.categories).filter(pattern => {
            return (Array.isArray(pattern?.categories) ? pattern?.categories : [pattern?.categories])
                ?.find(category => category.includes(cat))
        })?.length
        return acc;
    }, {}), [sources, categories]);

    return (
        <Layout navItems={[]}>
          <div className={t.pageWrapper}>
            <div className={t.header}>
                <Breadcrumbs items={[{icon: 'Database', href: baseUrl}]} />
                <div className={t.toolbar}>
                    <div className={t.toolbarSearch}>
                        <Input
                            placeholder="Search datasources"
                            value={layerSearch}
                            onChange={(e) => setLayerSearch(e.target.value)}
                        />
                    </div>

                    <Button
                        type="plain"
                        title={'Toggle Sort'}
                        onClick={() => setSort(sort === 'asc' ? 'desc' : 'asc')}
                    >
                        <Icon icon={sort === 'asc' ? 'SortDesc' : 'SortAsc'} className="size-5"/>
                    </Button>

                    {
                        user?.authed &&
                        <Button
                            type="plain"
                            title={'Add'}
                            onClick={() => setIsAdding(!isAdding)}
                        >
                            <Icon icon="CirclePlus" className="size-5"/>
                        </Button>
                    }

                </div>
            </div>
            <div className={t.body}>
                <div className={t.sidebar}>
                    {(categories || [])
                        .sort((a,b) => a.localeCompare(b))
                        .map(cat => (
                            <Link
                                key={cat}
                                className={cat1 === cat ? t.sidebarItemActive : t.sidebarItem}
                                to={`?cat=${cat}`}
                            >
                                <i className={'fa fa-category'} /> <span className={t.sidebarItemText}>{cat}</span>
                                <div className={t.sidebarBadge}>{categoriesCount[cat]}</div>
                            </Link>
                        ))
                    }
                </div>
                <div className={t.sourceList}>
                  <RenderAddPattern
                    sources={sources}
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
                                if (!cat1) return true;
                                return (Array.isArray(source?.categories) ? source?.categories : [])
                                    .some(site => site[0] === cat1);
                            })
                            .filter(source => {
                                let searchTerm = ((source?.name || source?.doc_type) + " " + (
                                    (Array.isArray(source?.categories) ? source?.categories : [source?.categories]) || [])
                                    .reduce((out,cat) => {
                                        out += Array.isArray(cat) ? cat.join(' ') : typeof cat === 'string' ? cat : '';
                                        return out
                                    },''));
                                return !layerSearch.length > 2 || searchTerm.toLowerCase().includes(layerSearch.toLowerCase());
                            })
                            .sort((a,b) => {
                                const m = sort === 'asc' ? 1 : -1;
                                return m * a?.doc_type?.localeCompare(b?.doc_type)
                            })
                            .map((s, i) => <SourceThumb key={s.source_id || s.id || i} source={s} baseUrl={baseUrl} format={format} />)
                    }
                </div>
            </div>
          </div>
        </Layout>
    )
}
