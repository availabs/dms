import React, {useMemo, useState, useEffect, useRef, useContext} from 'react'
import {useParams, useLocation} from "react-router"
import { get } from "lodash-es";
import {Link, useSearchParams} from "react-router-dom";
import SourcesLayout from "./layout";
import {dmsDataTypes} from "../../../../index"
import {FormsContext} from "../../siteConfig";
import {Modal} from "../../ui";
import { cloneDeep } from "lodash-es";
import { v4 as uuidv4 } from 'uuid';
export const makeLexicalFormat = value => (isJson(value) ? JSON.parse(value) : value)?.root?.children ? value : {
        root: {
            "children": [
                {
                    "children": [
                        {
                            "detail": 0,
                            "format": 0,
                            "mode": "normal",
                            "text": value || 'No Description',
                            "type": 'text',
                            "version": 1
                        },
                        {
                            "detail": 0,
                            "format": 0,
                            "mode": "normal",
                            "text": '\n\n',
                            "type": 'text',
                            "version": 1
                        }
                    ],
                    "tag": '',
                    "direction": "ltr",
                    "format": "",
                    "indent": 0,
                    "type": "paragraph",
                    "version": 1
                }
            ],
            "direction": "ltr",
            "format": "",
            "indent": 0,
            "type": "root",
            "version": 1
        }
    };



export const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

const getData = async ({format, apiLoad, parent}) => {
    const sources = (parent?.sources || []);

    if(!sources.length) return;
    const sourceIds = sources.map(s => +s.id);
    const sourceRef = (sources[0]?.ref || '').split('+');
    // use source ids to load source info

    const sourcesChildren = [{
        type: () => {
        },
        action: 'list',
        path: `/`,
        filter: {
            options: JSON.stringify({
                filter: {
                    ['id']: sourceIds
                }
            })
        },

    }]
    // load full pattern to get source ids
    const sourcesData = await apiLoad({
        app: format.app,
        type: sourceRef[1],
        format: {...format, type: sourceRef[1]},
        attributes: ['data'],
        children: sourcesChildren
    }, `/`);

    console.log('data', sourcesData)
    return sourcesData;
    // return {data: data.find(d => d.id === itemId), attributes}
}

const SourceThumb = ({ source }) => {
    const Lexical = dmsDataTypes.lexical.ViewComp;

    return (
        <div className="w-full p-4 bg-white hover:bg-blue-50 block border shadow flex">
            <div>
                <Link to={`source/${source.id}`} className="text-xl font-medium w-full block">
                    <span>{source?.name || source?.doc_type}</span>
                </Link>
                <div>
                    {(get(source, ['data', 'value', "categories"], []) || [])
                        .map(cat => (typeof cat === 'string' ? [cat] : cat).map((s, i) => (
                            <Link key={i} to={`?cat=${i > 0 ? cat[i - 1] + "/" : ""}${s}`}
                                  className="text-xs p-1 px-2 bg-blue-200 text-blue-600 mr-2">{s}</Link>
                        )))
                    }
                </div>
                <Link to={`source/${source.id}`} className="py-2 block">

                    <Lexical value={makeLexicalFormat(source?.description)}/>
                </Link>
            </div>


        </div>
    );
};

const RenderAddPattern = ({isAdding, setIsAdding, updateData, sources=[], setSources, submit}) => {
    const [data, setData] = useState({name: ''});
    console.log('sources', sources, data)
    return (
        <Modal open={isAdding} setOpen={setIsAdding} className={'w-full p-4 bg-white hover:bg-blue-50 block border shadow flex items-center'}>
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
                        }else{
                            setData({name: ''})
                        }
                    }}>
                <option key={'create-new'} value={undefined}>Create new</option>
                {
                    (sources || []).map(source => <option key={source.id} value={source.id}>{source.name} ({source.doc_type})</option> )
                }
            </select>

            <input className={'p-1 mx-1 text-sm font-light w-full block'}
                   key={'new-form-name'}
                   value={data.name}
                   placeholder={'Name'}
                   onChange={e => setData({...data, name: e.target.value})}
            />

            <button className={'p-1 mx-1 bg-blue-300 hover:bg-blue-500 text-white'}
                    disabled={!data.name}
                    onClick={async () => {
                        const clonedData = cloneDeep(data);
                        delete clonedData.id;
                        delete clonedData.views;
                        clonedData.doc_type = uuidv4();
                        await updateData({sources: [...(sources || []), clonedData]})
                        window.location.reload()
                    }}
            >add</button>
            <button className={'p-1 mx-1 bg-red-300 hover:bg-red-500 text-white'}
                    onClick={() => {
                        setData({name: ''})
                        setIsAdding(false)
                    }}
            >cancel</button>
        </Modal>
    )
}
const Edit = ({attributes, item, dataItems, apiLoad, apiUpdate, updateAttribute, format, submit, ...r}) => {
    const {baseUrl, user, parent} = useContext(FormsContext);
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
    console.log('??????????????????', item, parent, sources)
    const updateData = (data) => {
        console.log('updating data', parent, data, format)
        return apiUpdate({data: {...parent, ...data}, config: {format}})
    }

    useEffect(() => {
        getData({format, apiLoad, parent}).then(sources => setSources(sources));
    }, [format, parent?.sources]);

    const categories = [...new Set(
        (sources || [])
            .filter(source => {
                return isListAll || (
                    // we're not listing all sources
                    !isListAll &&
                    !source?.categories?.find(cat =>
                        // find if current category $cat includes any of filtered categories
                        filteredCategories.find(filteredCategory => cat.includes(filteredCategory))))
            })
            .reduce((acc, s) => [...acc, ...(s?.categories?.map(s1 => s1[0]) || [])], []))].sort()


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
                    user?.authed && user.authLevel === 10 &&
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
                    <RenderAddPattern sources={sources} setSources={setSources} updateData={updateData} isAdding={isAdding} setIsAdding={setIsAdding} submit={submit}/>
                    {
                        (sources || [])
                            .filter(source => {
                                return isListAll || (
                                    // we're not listing all sources
                                    !isListAll &&
                                    !source?.categories?.find(cat =>
                                        // find if current category $cat includes any of filtered categories
                                        filteredCategories.find(filteredCategory => cat.includes(filteredCategory))))
                            })
                            .filter(source => {
                                let output = true;
                                if (cat1) {
                                    output = false;
                                    (get(source, ['data', 'value', 'categories'], []) || [])
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
                            .map((s, i) => <SourceThumb key={i} source={s} baseUrl={baseUrl} />)
                    }
                </div>
            </div>
        </SourcesLayout>
    )
}

const View = ({value, format, apiLoad, apiUpdate, ...rest}) => {

    return (
        <div>
            View comp
        </div>
    )

}

Edit.settings = {
    hasControls: true,
    name: 'ElementEdit'
}


export default {
    "name": 'Pattern List',
    "type": 'CenRep',
    "variables": [],
    // getData,
    "EditComp": Edit,
    "ViewComp": Edit
}