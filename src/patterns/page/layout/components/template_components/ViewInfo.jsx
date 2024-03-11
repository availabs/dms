import React, {useState} from "react";
import {getConfig} from "../../template/pages.jsx";
import {dmsDataLoader} from "../../../../../index.js";
import get from "lodash/get.js";
import { CMSContext } from '../../layout'
import Selector from "./Selector.jsx";
import {updatePages} from "./updatePages.js";
import {generatePages} from "./generatePages.js";
import {pgEnv} from "../utils/constants.js";

export const ViewInfo = ({submit, item, onChange, loadingStatus, setLoadingStatus=() => {}}) => {

    // console.log('ViewInfo', id_column, active_id)
    const { falcor, falcorCache} = React.useContext(CMSContext)
    const [generatedPages, setGeneratedPages] = useState([]);
    const [generatedSections, setGeneratedSections] = useState([]);

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
            //console.log('locationNameMap', locationNameMap)
            const pages = await locationNameMap.reduce(async (acc, type) => {
                const prevPages = await acc;  
                const currentPages = await dmsDataLoader(getConfig({app: 'dms-site', type, filter: {[`data->>'template_id'`]: [item.id]}}), '/');
                return [...prevPages, ...currentPages];
            }, Promise.resolve([]));
            //console.log('pages', pages)
            setGeneratedPages(pages);
            if(!item.data_controls?.sectionControls) {
                setLoadingStatus(undefined)
                return
            }

            const sectionIds = pages.map(page => page.data.value.sections.map(section => section.id));
            const templateSectionIds = item.sections?.map(s => s.id)
            setGeneratedSections(sectionIds);

            // const sections = await sectionIds.reduce(async (acc, sectionId) => { //dont load data here?
            //     const prevSections = await acc;
            //     const currentSections = await dmsDataLoader(
            //         getConfig({
            //             app: 'dms-site',
            //             type: 'cms-section',
            //             filter: {
            //                 // ...templateSectionIds?.length && {[`data->'element'->>'template-section-id'`]: templateSectionIds}, // not needed as we need to pull extra sections
            //                 'id': sectionId // [] of ids
            //             }
            //         }), '/');
            //
            //     return [...prevSections, ...currentSections];
            // }, Promise.resolve([]));

            // setGeneratedSections(sections);
            setLoadingStatus(undefined);
        })()
    }, [item.id, item.data_controls?.sectionControls])

    // console.log('view info', id_column, active_row, dataRows)
    // to update generated pages,check if:
    // 1. existing section has changed
    // 2. new sections have been added
    // 3. existing section has been deleted


    return (
        <div className='flex flex-col'>
            {/*<div>View Info</div>*/}
          {/*  <div>Rows: {dataLength} </div>
            <div>Attributes : {attributes?.length || 0}</div>*/}
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

            <div className='flex items-center p-4'>
            {
                generatedPages?.length ?
                    <button className={`mt-4 p-2 rounded-lg text-white  ${loadingStatus ? `bg-gray-500 cursor-not-allowed` : `bg-blue-500 hover:bg-blue-300`}`}
                            disabled={loadingStatus}
                            onClick={e =>
                                updatePages({
                                    submit, item, url, destination, id_column,
                                    generatedPages, sectionIds: generatedSections, falcor, setLoadingStatus, dataRows
                                })}
                    >
                        {loadingStatus || 'Update Pages'}
                    </button> :
                    dataRows?.length ?
                    <button className={`inline-flex w-36 justify-center rounded-lg cursor-pointer text-sm font-semibold py-2 px-2 text-white shadow-lg border  active:border-b-2 active:mb-[2px] active:shadow-none' ${loadingStatus ? `bg-gray-500 border-b-2 border-gray-800 cursor-not-allowed` : `bg-blue-500 hover:bg-blue-400 border-b-4 border-blue-800 hover:border-blue-700`}`}
                            disabled={loadingStatus}
                            onClick={e =>
                                generatePages({
                                    item, url, destination, id_column,
                                    dataRows, falcor, setLoadingStatus
                                })}
                    >
                        {loadingStatus || 'Generate Pages'}
                    </button> :
                        <button className={`mt-4 p-2 rounded-lg text-white bg-gray-500 border border-b-2 border-gray-800 cursor-not-allowed`}
                                disabled={true}
                        >
                            No template data available.
                        </button>
            }
            </div>
        </div>
    );
};