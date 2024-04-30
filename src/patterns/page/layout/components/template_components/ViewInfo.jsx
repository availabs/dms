import React, {useMemo, useState} from "react";
import {getConfig} from "../../template/pages.jsx";
import {dmsDataLoader} from "../../../../../index.js";
import get from "lodash/get.js";
//import {falcor} from "~/modules/avl-falcor"
import { CMSContext } from '../../../siteConfig'
import Selector from "./Selector.jsx";
import {updatePages} from "./updatePages.js";
import {generatePages} from "./generatePages.js";
import {pgEnv} from "../utils/constants.js";

export const ViewInfo = ({submit, item, onChange, loadingStatus, setLoadingStatus=() => {}}) => {

    // console.log('ViewInfo', id_column, active_id)
    const { falcor, falcorCache} = React.useContext(CMSContext)
    const [generatedPages, setGeneratedPages] = useState([]);
    const [showAdditionalOptions, setShowAdditionalOptions] = useState(false);
    const [urlSuffixCol, setUrlSuffixCol] = useState('geoid');
    const {
        url, 
        destination = item.type,
        source,
        view,
        view_id,
        id_column,
        active_row
    } = item?.data_controls

    const locationNameMap = [destination]
    



    React.useEffect(() => {
        if(view.view_id){
            falcor.get(["dama", pgEnv, "viewsbyId", view.view_id, "data", "length"])
        }
    }, [pgEnv,  view.view_id]);

    const dataLength = React.useMemo(() => {
        return get(
            falcorCache,
            ["dama", pgEnv, "viewsbyId", view.view_id, "data", "length"],
            0
        );
    }, [pgEnv, view.view_id, falcorCache]);

    const attributes = React.useMemo(() => {

        let md = get(source, ["metadata", "columns"], get(source, "metadata", []));
        if (!Array.isArray(md)) {
            md = [];
        }

        return md.filter(col => !['geom', 'wkb_geometry', 'ogc_fid'].includes(col?.name))

    }, [source]);

    // console.log('attributes', attributes)

    React.useEffect(() =>{
        if(view?.view_id && id_column?.name && dataLength ) {
            falcor
                .get(
                    [
                        "dama",
                        pgEnv,
                        "viewsbyId",
                        view.view_id,
                        "databyIndex",
                        {"from":0, "to": dataLength-1},
                        attributes.map(d => d.name),
                    ]
                )
        }
    },[id_column,view.view_id,dataLength])

    const dataRows = React.useMemo(()=>{
        return Object.values(get(falcorCache,[
            "dama",
            pgEnv,
            "viewsbyId",
            view.view_id,
            "databyIndex"
        ],{})).map(v => get(falcorCache,[...v.value],''))
    },[id_column,view.view_id,falcorCache])

    //const [idCol, setIdCol] = useState('')
    React.useEffect(() => {
        // get generated pages and sections
        (async function () {
            setLoadingStatus('Loading Pages...')

            const pages = await locationNameMap.reduce(async (acc, type) => {
                const prevPages = await acc;
                const attributes = [
                    { key: 'id', label: 'id'},
                    { key: `data->>'id_column_value' as id_column_value`, label: 'id_column_value'},
                    { key: `data->>'num_errors' as num_errors`, label: 'num_errors'}
                ];

                let currentPages = await dmsDataLoader(falcor, getConfig({
                    app: 'dms-site',
                    type,
                    filter: {[`data->>'template_id'`]: [item.id]},
                    attributes
                }), '/');

                currentPages = currentPages.map(page => attributes.reduce((acc, curr) => {
                        acc[curr.label] = page[curr.key]
                        return acc;
                    }, {})
                );

                return [...prevPages, ...currentPages];
            }, Promise.resolve([]));
            setGeneratedPages(pages);
            setLoadingStatus(undefined);
        })()
    }, [item.id, item.data_controls?.sectionControls])

    // console.log('view info', id_column, active_row, dataRows)
    // to update generated pages,check if:
    // 1. existing section has changed
    // 2. new sections have been added
    // 3. existing section has been deleted

    const errorIdColValues = useMemo(() => generatedPages.filter(page => typeof +page.num_errors === 'number' && +page.num_errors > 0).map(page => page.id_column_value.toString()), [generatedPages]);
    const generatedIdColValues = useMemo(() => generatedPages.filter(page => page.id_column_value && typeof page.id_column_value !== 'object').map(page => page.id_column_value.toString()), [generatedPages]);
    const missingPagesDataRows = useMemo(() => dataRows.filter(row => !generatedIdColValues.includes(row[id_column.name])), [generatedIdColValues, dataRows, id_column.name]);
    const errorPagesDataRows = useMemo(() => dataRows.filter(row => errorIdColValues.includes(row[id_column.name])), [errorIdColValues, dataRows, id_column.name]);

    return (
        <div className='flex flex-col'>
            {/*<div>View Info</div>*/}
            {/*  <div>Rows: {dataLength} </div>
            <div>Attributes : {attributes?.length || 0}</div>*/}

            <span className='text-xs uppercase font-bold text-slate-400 ml-4'> url suffix </span>
            <Selector
                className={'ml-2.5 relative w-full cursor-default overflow-hidden bg-transparent border-b-2 border-slate-300 text-slate-500 text-left sm:text-sm'}
                options={attributes.map(d => d.name)}
                value={urlSuffixCol}
                nameAccessor={d => d?.name}
                valueAccessor={d => d?.name}
                onChange={d => setUrlSuffixCol(d)}
            />

            <Selector
                options={['',...attributes]}
                value={id_column}
                nameAccessor={d => d?.name}
                valueAccessor={d => d?.name}
                onChange={d => onChange('id_column',d)}
            />

            {id_column?.name ?
                <Selector
                    options={dataRows}
                    value={active_row}
                    nameAccessor={d => id_column?.name === 'geoid' ? d?.['county'] || d?.['name'] || d?.[id_column?.name] : d?.[id_column?.name] }
                    onChange={d => onChange('active_row',{
                            active_row:d
                        }
                    )}
                /> : ''}

            <div className='flex items-center pt-2'>
                {
                    generatedPages?.length || dataRows?.length ?
                        <div className={'flex flex-col'}>
                            <div className={'flex flex-row'}>
                                <button className={`inline-flex w-36 justify-center rounded-lg cursor-pointer text-sm font-semibold 
                                            py-2 px-2 text-white shadow-lg border active:border-b-2 active:mb-[2px] active:shadow-none 
                                            ${loadingStatus ? `bg-gray-500 border-b-2 border-gray-800 cursor-not-allowed` :
                                    `bg-blue-500 hover:bg-blue-400 border-b-4 border-blue-800 hover:border-blue-700`}`}
                                        disabled={loadingStatus}
                                        onClick={e =>
                                            generatePages({
                                                item, url, destination, id_column,
                                                dataRows, falcor, setLoadingStatus,
                                                locationNameMap, setGeneratedPages,
                                                urlSuffixCol
                                            })}
                                >
                                    {loadingStatus || (generatedPages?.length ? 'Update Pages' : 'Generate Pages')}
                                </button>
                                <button
                                    disabled={loadingStatus}
                                    className={`inline-flex rounded-lg cursor-pointer text-white text-bold px-2 py-2.5 shadow-lg
                                border active:border-b-2 active:mb-[2px] active:shadow-none 
                                ${loadingStatus ? `bg-gray-500 border-b-2 border-gray-800 cursor-not-allowed` :
                                        `bg-blue-500 hover:bg-blue-400 border-b-4 border-blue-800 hover:border-blue-700`}`}
                                    onClick={() => setShowAdditionalOptions(!showAdditionalOptions)}
                                >
                                    <i className={showAdditionalOptions ? 'fa fa-caret-up' : 'fa fa-caret-down'}/>
                                </button>

                            </div>

                            {/*additional options*/}
                            <div className={showAdditionalOptions ? `flex flex-col` : 'hidden'}>
                                {/*generate missing pages*/}
                                <button className={`inline-flex w-36 justify-center rounded-lg text-sm font-semibold 
                                            py-2 px-2 text-white shadow-lg border active:border-b-2 active:mb-[2px] active:shadow-none' 
                                            ${loadingStatus || !missingPagesDataRows?.length ? `bg-gray-500 border-b-2 border-gray-800 cursor-not-allowed` :
                                    `bg-blue-500 hover:bg-blue-400 border-b-4 border-blue-800 hover:border-blue-700 cursor-pointer`}`}
                                        disabled={loadingStatus || !missingPagesDataRows?.length}
                                        onClick={e => {
                                            setShowAdditionalOptions(false);
                                            return generatePages({
                                                item, url, destination, id_column,
                                                dataRows: missingPagesDataRows, falcor, setLoadingStatus,
                                                locationNameMap, setGeneratedPages,
                                                urlSuffixCol
                                            })
                                        }}
                                >
                                    {loadingStatus || `Generate missing pages (${missingPagesDataRows?.length})`}
                                </button>

                                {/*update errored pages*/}
                                <button className={`inline-flex w-36 justify-center rounded-lg text-sm font-semibold 
                                            py-2 px-2 text-white shadow-lg border active:border-b-2 active:mb-[2px] active:shadow-none' 
                                            ${loadingStatus || !errorPagesDataRows?.length ? `bg-gray-500 border-b-2 border-gray-800 cursor-not-allowed` :
                                    `bg-blue-500 hover:bg-blue-400 border-b-4 border-blue-800 hover:border-blue-700 cursor-pointer`}`}
                                        disabled={loadingStatus || !errorPagesDataRows?.length}
                                        onClick={e => {
                                            setShowAdditionalOptions(false);
                                            return generatePages({
                                                item, url, destination, id_column,
                                                dataRows: errorPagesDataRows, falcor, setLoadingStatus,
                                                locationNameMap, setGeneratedPages,
                                                urlSuffixCol
                                            })
                                        }}
                                >
                                    {loadingStatus || `Update errored pages (${errorPagesDataRows?.length})`}
                                </button>
                            </div>
                            {/*additional options end*/}
                        </div> :
                        <button
                            className={`mt-4 p-2 rounded-lg text-white bg-gray-500 border border-b-2 border-gray-800 cursor-not-allowed`}
                            disabled={true}
                        >
                            No template data available.
                        </button>
                }
            </div>
        </div>
    );
};