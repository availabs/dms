import React, {useMemo, useState, useEffect, useRef, useContext} from 'react'
import {Link} from "react-router-dom";
import {FormsContext} from "../../../index";
import {InfoCircle} from "../../../../admin/ui/icons";

export const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

const uploadGisDataset = async ({file, user, etlContextId, damaServerPath, setGisUploadId, setLoading}) => {
    try {
        setLoading(true)
        // Prepare upload request
        const formData = new FormData();
        // https://moleculer.services/docs/0.14/moleculer-web.html#File-upload-aliases
        // text form-data fields must be sent before files fields.
        formData.append("etlContextId", etlContextId);
        formData.append("user_id", user.userId);
        formData.append("email", user.email);
        formData.append("fileSizeBytes", file.size);
        formData.append("file", file);

        console.log('sending upload')

        const res = await fetch(
            `${damaServerPath}/gis-dataset/upload`,
            { method: "POST", body: formData }
        );
        console.log('sending upload finished ')

        // update state from request
        const resValue = await res.json();
        if (Array.isArray(resValue)) {
            const [{ id }] = resValue;
            console.log('gisUploadId', id)
            setGisUploadId(id)
            setLoading(false)
        } else {
            setLoading(false)
            throw resValue;
        }
    } catch (err) {
        setLoading(false)
        // catch error & reset file so new attempt can be made
        console.error(err?.message)
    }
}

const publish = async ({userId, email, gisUploadId, layerName, app, type, dmsServerPath, setPublishing, setPublishStatus,
                           updateMetaData, existingAttributes = [], columns = []}) => {
    const publishData = {
        user_id: userId,
        email: email,
        gisUploadId,
        layerName,
        columns
    };

    setPublishing(true);

    // add columns not present in metadata currently
    const newColumns = columns.filter(c => !existingAttributes.find(ea => ea.display_name === c.display_name || ea.name === c.name));
    if(newColumns.length){
        updateMetaData(JSON.stringify({
            attributes: [...existingAttributes, ...newColumns]
        }), 'config');
    }

    const res = await fetch(`${dmsServerPath}/dms/${app}+${type}/publish`,
        {
            method: "POST",
            body: JSON.stringify(publishData),
            headers: {
                "Content-Type": "application/json",
            },
        });

    const publishFinalEvent = await res.json();
    setPublishing(false);
    setPublishStatus(true);
    console.log('publishFinalEvent', publishFinalEvent)
}
const Edit = ({value, onChange, size, format, apiLoad, apiUpdate, parent, ...rest}) => {
    // this component should let a user:
    // 1. upload
    // 2. post upload change column name and display names -- avoiding this. this should be done in meta manager.
    // 3. set columns to geo columns
    // 4. map multiple columns to a single column. this converts column headers to values of a new column
    // todo 5. choose an id column to update data if there's id match. -- in progress

    const {API_HOST, user, baseUrl} = useContext(FormsContext);
    const pgEnv = 'hazmit_dama'
    const damaServerPath = `${API_HOST}/dama-admin/${pgEnv}`; // need to use this format to utilize existing api fns
    const dmsServerPath = `${API_HOST}/dama-admin`; // to use for publish. no need for pgEnv.

    const [loading, setLoading] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [publishStatus, setPublishStatus] = useState(false)
    const [search, setSearch] = useState('');
    const [etlContextId, setEtlContextId] = useState();
    const [gisUploadId, setGisUploadId] = useState(); // 'shaun-XPS-13-9340_7ae040fc-3854-480e-8279-622a6c199f69'
    const [layers, setLayers] =useState([]);
    const [layerName, setLayerName] = useState('');
    const inputClass = `p-1.5 hover:bg-blue-100 rounded-sm`;
    const existingAttributes = JSON.parse(parent.config || '{}')?.attributes || [];
    const [columns, setColumns] = useState([]);
    // pivot columns convert column headers into their values if source column has any data in them.
    // {Flooding: {pivotColumn: 'associated_hazards'}
    // pivotColumns: {finalCOlName: [srcCol1, srcCol2, srcCol3, ...]}

    const updateMetaData = (data, attrKey) => {
        apiUpdate({data: {...parent, ...{[attrKey]: data}}, config: {format}})
    }
    // ================================================= get etl context begin =========================================
    useEffect(() => {
        async function getContextId () {
            const newEtlCtxRes = await fetch(
                `${damaServerPath}/etl/new-context-id`
            );
            const newEtlCtxId = +(await newEtlCtxRes.text());
            setEtlContextId(newEtlCtxId);
        }
        getContextId()
    }, [pgEnv]);
    // ================================================= get etl context end ===========================================

    // ================================================= get layers begin ==============================================
    useEffect(() => {
        if (gisUploadId) {
            try {
                const fetchData = async (gisUploadId) => {
                    const url = `${damaServerPath}/gis-dataset/${gisUploadId}/layers`;
                    const layerNamesRes = await fetch(url);
                    const layers = await layerNamesRes.json();
                    setLayers(layers)
                    setLayerName(layers?.[0]?.layerName)
                }
                fetchData(gisUploadId)
            } catch (err) {
                console.error(err)
            }
        }
    }, [ gisUploadId, damaServerPath ]);

    useEffect(() => {
        if(layers.find(layer => layer.layerName === layerName)?.fieldsMetadata){
            setColumns(layers.find(layer => layer.layerName === layerName)?.fieldsMetadata
                .map(({name, display_name}, i) => {
                    const existingColumn = existingAttributes.find(col => col.display_name === display_name || col.name === name);
                    return {
                        name: name || `col_${i+1}`, // safeguarding blank headers
                        display_name: display_name || name || `col_${i+1}`,
                        existingColumnMatch: existingColumn?.name,
                        options: ['select', 'multiselect'].includes(existingColumn?.type) ? existingColumn.options : null,
                        type: ['select', 'multiselect'].includes(existingColumn?.type) ? existingColumn?.type : 'text',
                        required: existingColumn?.required === "yes"
                    }
                }))
        }
    }, [layers, layerName]);
    // ================================================= get layers end ================================================
    console.log('columns', columns)
    const pivotColumns = existingAttributes.filter(existingCol => columns.filter(c => c.existingColumnMatch === existingCol.name).length > 1);

    if(publishStatus){
        return <div className={'flex items-center justify-center w-full h-[150px] border rounded-md'}>
            The Sheet has been Processed. To Validate your records, <Link className={'text-blue-500 hover:text-blue-700 px-1'} to={`${baseUrl}/manage/validate`}>click here</Link>
        </div>
    }
    return !gisUploadId ?
    // file uploader UI
    (
        <div className={'w-full h-[300px]'}>

            <div className="flex items-center justify-center w-full">
                <label htmlFor="dropzone-file"
                       className="flex flex-col items-center justify-center w-full h-96 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:bg-gray-600">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <svg className="w-8 h-8 mb-4 text-gray-500 dark:text-gray-400" aria-hidden="true"
                             xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                  d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                        </svg>
                        {
                            loading ? <p className="text-xs text-gray-500 dark:text-gray-400">Uploading...</p> : (
                                <>
                                    <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                                        <span className="font-semibold">Click to upload</span> or drag and drop</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">CSV or Excel</p>
                                </>
                            )
                        }
                    </div>
                    <input disabled={loading} id="dropzone-file" type="file" className="hidden" onChange={(e) =>
                        uploadGisDataset({file: e.target.files[0], user, etlContextId, damaServerPath, setGisUploadId, setLoading})}/>
                </label>
            </div>


        </div>
    ) :
        // post upload UI
        // after a file has been uploaded to the server, make required selection. then publish.
        (
            <div className={'w-full border p-2 rounded-md'}>
                <div className={'w-full pb-4'}>
                    <label htmlFor={'layer-selector'}>Please select a sheet to upload:</label>
                    <select
                        id={'layer-selector'}
                        className={'p-2 ml-4 bg-transparent border rounded-md hover:cursor-pointer'}
                        value={layerName}
                        onChange={e => setLayerName(e.target.value)}
                    >
                        {
                            (layers || []).map(({layerName}) => <option key={layerName}
                                                                        value={layerName}>{layerName}</option>)
                        }
                    </select>
                </div>
                {/*display pivot columns*/}
                {
                    pivotColumns.length ?
                        <div className={'p-2 border border-blue-300 rounded-md'}>
                            <div className={'flex items-center text-blue-500 font-semibold'}>Pivot Columns
                                <InfoCircle className={'ml-1 text-blue-500 hover:text-blue-300 cursor-pointer'} height={18} width={18}
                                            title={'These column headers will become values for the Destination column if there exists a value for a given row in the data.'}/>
                            </div>
                            <div className={'grid grid-cols-2'}
                                 style={{gridTemplateColumns: '1fr 2fr'}}>
                                <div>Destination Column</div>
                                <div>Source Columns</div>
                            </div>
                            {

                                pivotColumns.map(existingCol => (
                                    <div key={existingCol.name} className={'grid grid-cols-2'} style={{gridTemplateColumns: '1fr 2fr'}}>
                                        <div>{existingCol.display_name || existingCol.name}</div>
                                        <div>{columns.filter(c => c.existingColumnMatch === existingCol.name).map(c => c.display_name || c.name).join(', ')}</div>
                                    </div>
                                ))

                            }
                        </div> : null
                }
                {/* if there are attributes for this pattern, show them as well. and give option to map detected columns to them */}
                {
                    columns?.length ?
                        <>
                            <div className={'p-1 hover:bg-blue-50 rounded-md grid grid-cols-3 font-semibold border-b'} style={{gridTemplateColumns: "1fr 1fr 100px"}}>
                                <label className={'flex flex-wrap items-center'}>
                                    Display Name
                                    <input className={'p-0.5 mx-1 border rounded-md text-sm font-light'} value={search} onChange={e => setSearch(e.target.value)} placeholder={'search...'}/></label>
                                <label>Existing Column Match</label>
                                <label>GEO Column</label>
                            </div>
                            <div className={'flex flex-col max-h-[700px] overflow-auto scrollbar-sm'}>
                                {
                                    columns
                                        .filter(({display_name, name}) => !search || (display_name || name).toLowerCase().includes(search.toLowerCase()))
                                        .map(({name, display_name, existingColumnMatch, geo_col}) => (
                                            <div key={name} className={'p-0.5 hover:bg-blue-50 rounded-md grid grid-cols-3'} style={{gridTemplateColumns: "1fr 1fr 100px"}}>
                                                {/*<input disabled className={inputClass} value={name}/>*/}
                                                <div key={`${name}_display_name`} className={inputClass}>{display_name}</div>
                                                <select  key={`${name}_select_existing_col`} className={existingColumnMatch ? inputClass : `${inputClass} bg-red-50`}
                                                        value={existingColumnMatch}
                                                        onChange={e =>
                                                            setColumns(columns.map(c => c.name === name ? ({...c, existingColumnMatch: e.target.value}) : c))}
                                                >
                                                    <option>Please select...</option>
                                                    {
                                                        existingAttributes
                                                            .sort((a,b) => a?.display_name?.localeCompare(b?.display_name))
                                                            .map(({name, display_name}) => (
                                                                <option key={name} value={name}>
                                                                    {display_name || name}
                                                                </option>))
                                                    }
                                                </select>
                                                <div  key={`${name}_geo_col_div`} className={'flex items-center justify-center'}>
                                                    <input className={''} type={"checkbox"} checked={geo_col || false}
                                                           onChange={() => {}}
                                                           onClick={e => {
                                                               setColumns(columns.map(c => c.name === name ? ({
                                                                   ...c,
                                                                   geo_col: e.target.checked
                                                               }) : c))
                                                           }}/>
                                                </div>
                                            </div>
                                        ))
                                }
                            </div>
                            <div className={'mt-1 flex justify-end'}>
                                <button className={'p-1 bg-blue-300 hover:bg-blue-600 text-white rounded-md'}
                                        disabled={publishing}
                                        onClick={() => publish({
                                            ...user,
                                            gisUploadId,
                                            layerName,
                                            app: format.app,
                                            type: format.type,
                                            dmsServerPath,
                                            columns,
                                            publishStatus,
                                            setPublishStatus,
                                            setPublishing,
                                            existingAttributes,
                                            updateMetaData
                                        })}>
                                    {publishing ? 'publishing...' : 'publish'}
                                </button>
                            </div>
                        </> : <div>No columns available.</div>
                }
            </div>
        )
}

Edit.settings = {
    hasControls: true,
    name: 'ElementEdit'
}


export default {
    "name": 'Upload',
    "type": 'Upload',
    "variables": [],
    "EditComp": Edit,
    "ViewComp": Edit
}