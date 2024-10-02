import React, {useMemo, useState, useEffect, useRef, useContext} from 'react'
import {useParams, useLocation} from "react-router"
import {CMSContext} from "../../../../../page/siteConfig";
import get from "lodash/get";
import {Link, useSearchParams} from "react-router-dom";
import SourcesLayout from "./layout";
import {makeLexicalFormat} from "../../../../../../../../../pages/DataManager/DataTypes/default/Overview";
import {dmsDataTypes} from "~/modules/dms/src"
import {dmsDataLoader, dmsDataEditor} from "../../../../../../api";
import {getConfig} from "../../../../../page/pages/manager/template/pages";

export const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

const getData = async (app, type, siteType, falcor) => {
    const siteConfig = getConfig({
        app,
        type: siteType
    })

    const siteData = await dmsDataLoader(falcor, siteConfig, `/`);
    // these are the patterns which are in the site.
    // there may be deleted patterns which are not in the site.patterns array. don't wanna show them :shrug:
    const existingPatterns = (siteData?.[0]?.data?.value?.patterns || []).map(p => p.id)

    const config = getConfig({
        app,
        type: 'pattern',
        filter: {[`data->>'pattern_type'`]: ['form'], id: existingPatterns}
    })

    return await dmsDataLoader(falcor, config, `/`);
}

const addPattern = async (app, data, falcor) => {
    const config = {
        format: {
            app: app,
            type: 'pattern'
        }
    }

    return await dmsDataEditor(falcor, config, data);
}

const SourceThumb = ({ source }) => {
    const {pgEnv, baseUrl, falcor, falcorCache} = React.useContext(CMSContext)
    const Lexical = dmsDataTypes.lexical.ViewComp;

    return (
        <div className="w-full p-4 bg-white hover:bg-blue-50 block border shadow flex">
            <div>
                <Link to={`${source.data.value.base_url}/manage/overview`} className="text-xl font-medium w-full block">
                    <span>{source.data.value.doc_type}</span>
                </Link>
                <div>
                    {(get(source, ['data', 'value', "categories"], []) || [])
                        .map(cat => (typeof cat === 'string' ? [cat] : cat).map((s, i) => (
                            <Link key={i} to={`${baseUrl}/cat/${i > 0 ? cat[i - 1] + "/" : ""}${s}`}
                                  className="text-xs p-1 px-2 bg-blue-200 text-blue-600 mr-2">{s}</Link>
                        )))
                    }
                </div>
                <Link to={`${source.data.value.base_url}/manage/overview`} className="py-2 block">

                    <Lexical value={makeLexicalFormat(source.data.value.description)}/>
                </Link>
            </div>


        </div>
    );
};

const RenderAddPattern = ({isAdding, setIsAdding, app, falcor}) => {
    const [data, setData] = useState({doc_type: '', base_url: ''});
    if(!isAdding) return null;

    return (
        <div className={'w-full p-4 bg-white hover:bg-blue-50 block border shadow flex items-center'}>
            <input className={'p-1 mx-1 text-sm font-medium w-full block'}
                   key={'new-form-doc-type'}
                   value={data.doc_type}
                   placeholder={'Doc Type'}
                   onChange={e => setData({...data, doc_type: e.target.value})}
            />
            <input className={'p-1 mx-1 text-sm font-light w-full block'}
                   key={'new-form-url-slug'}
                   value={data.base_url}
                   placeholder={'Base URL'}
                   onChange={e => setData({...data, base_url: e.target.value})}
            />
            <button className={'p-1 mx-1 bg-blue-300 hover:bg-blue-500 text-white'}
                    disabled={!data.doc_type || !data.base_url}
                    onClick={() => addPattern(app, data, falcor)}
            >add</button>
            <button className={'p-1 mx-1 bg-red-300 hover:bg-red-500 text-white'}
                    onClick={() => {
                        setData({doc_type: '', base_url: ''})
                        setIsAdding(false)
                    }}
            >cancel</button>
        </div>
    )
}
const Edit = ({siteType}) => {
    const {app, type, falcor, falcorCache, baseUrl, user} = useContext(CMSContext);
    const [patterns, setPatterns] = useState([]);
    const [layerSearch, setLayerSearch] = useState("");
    const { cat1, cat2, ...rest } = useParams();
    const [sort, setSort] = useState('asc');
    const [isAdding, setIsAdding] = useState(false);
    const actionButtonClassName = 'bg-transparent hover:bg-blue-100 rounded-sm p-2 ml-0.5 border-2';
    const isListAll = false;
    const filteredCategories = []; // categories you want to exclude from landing list page.

    useEffect(() => {
        getData(app, type, siteType, falcor).then(data => setPatterns(data));
    }, [app]);

    const categories = [...new Set(
        patterns
            .filter(source => {
                return isListAll || (
                    // we're not listing all sources
                    !isListAll &&
                    !source.data.value.categories?.find(cat =>
                        // find if current category $cat includes any of filtered categories
                        filteredCategories.find(filteredCategory => cat.includes(filteredCategory))))
            })
            .reduce((acc, s) => [...acc, ...(s.data.value.categories?.map(s1 => s1[0]) || [])], []))].sort()


      const categoriesCount = categories.reduce((acc, cat) => {
        acc[cat] = patterns.filter(p => p.data.value.categories).filter(pattern => {
            return (Array.isArray(pattern.data.value.categories) ? pattern.data.value.categories : [pattern.data.value.categories])
                ?.find(category => category.includes(cat))
        })?.length
        return acc;
    }, {})

    return (
        <SourcesLayout fullWidth={true} baseUrl={baseUrl} isListAll={false} page={{}} hideBreadcrumbs={true} hideNav={true}>
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

                {/*{*/}
                {/*    user?.authed && user.authLevel === 10 &&*/}
                {/*    <button*/}
                {/*        className={actionButtonClassName} title={'Add'}*/}
                {/*        onClick={() => setIsAdding(!isAdding)}*/}
                {/*    >*/}
                {/*        <i className={`fa-solid fa-add text-xl text-blue-400`}/>*/}
                {/*    </button>*/}
                {/*}*/}

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
                                to={`${baseUrl}${isListAll ? `/listall` : ``}/cat/${cat}`}
                            >
                                <i className={'fa fa-category'} /> {cat}
                                <div className={'bg-blue-200 text-blue-600 text-xs w-5 h-5 ml-2 shrink-0 grow-0 rounded-lg flex items-center justify-center border border-blue-300'}>{categoriesCount[cat]}</div>
                            </Link>
                        ))
                    }
                </div>
                <div className={'w-3/4 flex flex-col space-y-1.5 ml-1.5 max-h-[80dvh] overflow-auto scrollbar-sm'}>
                    <RenderAddPattern falcor={falcor} app={app} isAdding={isAdding} setIsAdding={setIsAdding}/>
                    {
                        patterns
                            .filter(source => {
                                return isListAll || (
                                    // we're not listing all sources
                                    !isListAll &&
                                    !source.data.value.categories?.find(cat =>
                                        // find if current category $cat includes any of filtered categories
                                        filteredCategories.find(filteredCategory => cat.includes(filteredCategory))))
                            })
                            .filter(source => {
                                let output = true;
                                if (cat1) {
                                    output = false;
                                    (get(source, "categories", []) || [])
                                        .forEach(site => {
                                            if (site[0] === cat1 && (!cat2 || site[1] === cat2)) {
                                                output = true;
                                            }
                                        });
                                }
                                return output;
                            })
                            .filter(source => {
                                let searchTerm = (source.data.value.doc_type + " " + (
                                    (Array.isArray(source.data.value?.categories) ? source.data.value?.categories : [source.data.value?.categories]) || [])
                                    .reduce((out,cat) => {
                                        out += Array.isArray(cat) ? cat.join(' ') : typeof cat === 'string' ? cat : '';
                                        return out
                                    },'')) //get(source, "categories[0]", []).join(" "));
                                return !layerSearch.length > 2 || searchTerm.toLowerCase().includes(layerSearch.toLowerCase());
                            })
                            .sort((a,b) => {
                                const m = sort === 'asc' ? 1 : -1;
                                return m * a.data.value.doc_type?.localeCompare(b.data.value.doc_type)
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