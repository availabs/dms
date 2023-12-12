import React, {useState} from "react";
import {getConfig, locationNameMap} from "../templatePages.jsx";
import {dmsDataLoader} from "~/modules/dms/src/index.js";
import get from "lodash/get.js";
import {useFalcor} from '~/modules/avl-falcor';
import Selector from "../Selector.jsx";
import {updatePages} from "../utils/updatePages.js";
import {generatePages} from "../utils/generatePages.js";
import {pgEnv} from "../constants.js";

export const ViewInfo = ({submit, item, url, destination, source,view, id_column, active_row, onChange, loadingStatus, setLoadingStatus}) => {

    // console.log('ViewInfo', id_column, active_id)
    const { falcor, falcorCache } = useFalcor();
    const [generatedPages, setGeneratedPages] = useState([]);
    const [generatedSections, setGeneratedSections] = useState([]);

    //const [idCol, setIdCol] = useState('')
    React.useEffect(() => {
        // get generated pages and sections
        (async function () {
            setLoadingStatus('Loading Pages...')
            const pages = await Object.keys(locationNameMap).reduce(async (acc, type) => {
                const prevPages = await acc;
                const currentPages = await dmsDataLoader(getConfig({app: 'dms-site', type, filter: {[`data->>'template_id'`]: [item.id]}}), '/');

                return [...prevPages, ...currentPages];
            }, Promise.resolve([]));
            setGeneratedPages(pages);

            if(!item.data_controls?.sectionControls) return;
            const sectionIds = pages.map(page => page.data.value.sections.map(section => section.id));
            const sections = await sectionIds.reduce(async (acc, sectionId) => {
                const prevSections = await acc;
                const currentSections = await dmsDataLoader(
                    getConfig({
                        app: 'dms-site',
                        type: 'cms-section',
                        filter: {
                            [`data->'element'->>'template-section-id'`]: item.sections.map(s => s.id),
                            'id': sectionId // [] of ids
                        }
                    }), '/');

                return [...prevSections, ...currentSections];
            }, Promise.resolve([]));

            setGeneratedSections(sections);
            setLoadingStatus(undefined);
        })()
    }, [item.id, item.data_controls?.sectionControls])

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

        return md

    }, [source]);

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

    // console.log('view info', id_column, active_row, dataRows)
    // to update generated pages,check if:
    // 1. existing section has changed
    // 2. new sections have been added
    // 3. existing section has been deleted


    return (
        <div className='flex flex-col'>
            {/*<div>View Info</div>*/}
            <div>Rows: {dataLength} </div>
            <div>Attributes : {attributes?.length || 0}</div>
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
                    nameAccessor={d => d?.[id_column?.name] }
                    onChange={d => onChange('active_row',{
                            active_row:d
                        }
                    )}
                /> : ''}

            {
                generatedPages?.length ?
                    <button className={`mt-4 p-2 rounded-lg text-white  ${loadingStatus ? `bg-gray-500 cursor-none` : `bg-blue-500 hover:bg-blue-300`}`}
                            disabled={loadingStatus}
                            onClick={e =>
                                updatePages({
                                    submit, item, url, destination, id_column,
                                    generatedPages, generatedSections, falcor, setLoadingStatus
                                })}
                    >
                        {loadingStatus || 'Update Pages'}
                    </button> :
                    <button className={`mt-4 p-2 rounded-lg text-white ${loadingStatus ? `bg-gray-500 cursor-none` : `bg-blue-500 hover:bg-blue-300`}`}
                            disabled={loadingStatus}
                            onClick={e =>
                                generatePages({
                                    item, url, destination, id_column,
                                    dataRows, falcor, setLoadingStatus
                                })}
                    >
                        {loadingStatus || 'Generate Pages'}
                    </button>
            }
        </div>
    );
};