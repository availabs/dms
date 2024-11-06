import React, {useMemo, useState, useEffect, useRef, useContext} from 'react'
import {useParams, useLocation} from "react-router"
import {CMSContext} from "../siteConfig";
import get from "lodash/get";
import {Link} from "react-router-dom";
import writeXlsxFile from 'write-excel-file';
import {Download} from '../ui/icons'
import {getUrlSlug} from "../pages/_utils";
import Switch from "../../../data-types/lexical/editor/ui/Switch";
import RenderSwitch from "../../forms/components/selector/ComponentRegistry/spreadsheet/components/Switch";


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
    {name: 'section_id', display_name: 'id'},
    {name: 'parent', display_name: 'Parent'},
    {name: 'page_title', display_name: 'Page Title'},
    {name: 'section_title', display_name: 'Section Title'},
    {name: 'element_type', display_name: 'Type'},
    {name: 'tags', display_name: 'Tags'},
    {name: 'url', display_name: 'URL'},
    {name: 'element_data', display_name: 'DataSource'}, // link to cenrep, and version name in data
]

const DownloadExcel = ({ sections, pattern, fileName='sections' }) => {

    const handleDownload = async () => {
        const data = (sections || []).map(section => sectionCols.reduce((acc, {name}) => {
            acc[name] = name === 'url' ? getURL({name, section, pattern}) :
                name === 'element_data' ? getAttribution({section}) :
                section[name];
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
const getURL = ({name, section, pattern}) => {
    const url = name === 'page_title' ? section.url_slug : `${section.url_slug}#${section.section_id}`;
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
    if(!section.element_data) return null;

    const attribution = Array.isArray(section.element_data) ? section.element_data : [section.element_data];
    return attribution.map(attr => attr.version).join(', ')
}
const RenderTags = ({value}) => !value ? <div className={'p-1'}>N/A</div> :
    <div className={'flex flex-wrap'}>
        {
            value.split(',').map((tag, i) =>
                <div key={`${tag}-${i}`} className={'text-sm font-semibold text-white m-0.5 py-0.5 px-1 rounded-lg bg-red-300 h-fit w-fit'}>{tag}</div>)}
    </div>

const RenderAttribution = ({value, section}) => {
    const attribution = getAttribution({section});
    return <div>{attribution || 'N/A'}</div>
}

const RenderText = ({value}) => <div className={'p-1 overflow-hidden'}>{value || 'N/A'}</div>;

const RenderLink = ({value, section, name, pattern}) => {
    const url = getURL({name, section, pattern})
    return <Link className={'p-1 overflow-hidden'} to={url}>{name === 'url' ? 'link' : (value || 'N/A')}</Link>;
}

// const RenderParent = ({section, sections}) => {
//     return getParentChain(section, sections).map(p => p.page_title || p.url_slug).join('/')
// }
const RenderValue = ({value, name, section, sections, pattern}) =>
    name === 'tags' ? <RenderTags value={value} /> :
        name === 'element_data' ? <RenderAttribution value={value} section={section}/> :
            ['page_title', 'section_title', 'url'].includes(name) ?
                <RenderLink name={name} value={value} section={section} pattern={pattern}/> :
                    // name === 'parent' ? <RenderParent section={section} sections={sections} /> :
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

    // console.log('getting sections', dataPath)
    // const sections = await falcor.get(dataPath);
    // console.log('sections', sections)
    // const pageDataWithSectionIds = get(falcor.getCache(), [...dataPath, 'value'], {});
    //
    // const sectionIds = pageDataWithSectionIds.map(d => d.section_id);
    // console.log('sections', sectionIds, pageDataWithSectionIds)
    //
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

const Edit = ({value, onChange, size}) => {
    const {app, baseUrl, falcor, falcorCache, ...rest} = useContext(CMSContext) || {}
    const cachedData = parseIfJson(value) ? JSON.parse(value) : {};
    const [loading, setLoading] = useState(false);
    const [patterns, setPatterns] = useState([]);
    const [pattern, setPattern] = useState(cachedData.pattern || []);
    const [sections, setSections] = useState(cachedData.sections || [])
    const [currentPage, setCurrentPage] = useState(0);
    const [filterNullTags, setFilterNullTags] = useState(false);

    // ============================================ data load begin ====================================================
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
    }, [app, pattern])
    // ============================================ data load end ======================================================

    // ============================================ save begin =========================================================
    useEffect(() => {
        onChange && onChange(JSON.stringify({
            ...cachedData, pattern
        }))
    }, [pattern]);
    // ============================================ save end ===========================================================

    return (
        <div>
            <div className={'flex justify-between items-center'}>
                <div className={'flex w-full'}>
                    <label htmlFor={'pattern-selector'}>Pattern: </label>
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
            <div className={'flex items-center p-1 text-sm rounded-md my-1 w-fit bg-gray-100 hover:bg-gray-200 cursor-pointer'}
                 onClick={() => setFilterNullTags(!filterNullTags)}
            >
                <span className={'mr-1'}>Filter Empty Tags</span>
                <RenderSwitch enabled={filterNullTags} setEnabled={e => setFilterNullTags(e)} label={'filter null tags'} size={'small'}/>
            </div>
            <div className={'grid grid-cols-8 divide-x font-semibold border-x border-t'}>
                {
                    sectionCols.map(c => <div key={c.name} className={'p-1'}>{c.display_name}</div>)
                }
            </div>
            {
                loading ? <div className={'w-full text-center'}>loading...</div> :
                    <div className={'max-h-[700px] overflow-auto scrollbar-sm border rounded-md'}>
                        {
                            (sections || [])
                                .filter((s, sI) => !filterNullTags || s.tags?.length)
                                .map(section => (
                                <div key={section.section_id} className={'grid grid-cols-8 divide-x divide-y font-light hover:bg-blue-100'}>
                                    {
                                        sectionCols.map(({name}) =>
                                            <RenderValue key={`${section.section_id}_${name}`}
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

           {/* {
                !loading && sections.length ? (
                    <div className={'flex flex-row items-center float-right'}>
                        <div className={'mx-1 cursor-pointer hover:text-gray-800'}
                             onClick={() => setCurrentPage(currentPage > 0 ? currentPage - 1 : currentPage)}>{`<< prev`}</div>
                        <select
                            className={'p-0.5 border-2 text-gray-800 hover:bg-blue-50 rounded-lg'}
                            value={currentPage}
                            onChange={e => setCurrentPage(+e.target.value)}
                        >
                            {
                                [...new Array( Math.ceil(sections.length / 20)).keys()]
                                    .map((i) =>
                                        <option
                                            className={'p-2 border-2 text-gray-800 hover:bg-blue-50'}
                                            value={i} key={i}>{i + 1}
                                        </option>)
                            }
                        </select>
                        <div className={'mx-1 cursor-pointer text-gray-500 hover:text-gray-800'}
                             onClick={() => setCurrentPage(currentPage < sections.length - 1 ? currentPage + 1 : currentPage)}>{`next >>`}</div>
            </div>
                ) : null
            }*/}
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