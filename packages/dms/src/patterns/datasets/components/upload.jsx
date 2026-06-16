import React, { useState, useEffect, useContext} from 'react'
import {InfoCircle} from "../../admin/ui/icons";
import { getExternalEnv } from "../utils/datasources";
import { ThemeContext } from "../../../ui/useTheme";
import { uploadTheme } from "./upload.theme";

const preventDefaults = e => {
    e.preventDefault();
    e.stopPropagation();
}
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
const uploadGisDataset = async ({file, user, damaServerPath, setGisUploadId, setLoading, setLayers, setLayerName}) => {
    try {
        setLoading(true)
        const formData = new FormData();
        formData.append("user_id", user.userId);
        formData.append("email", user.email);
        formData.append("fileSizeBytes", file.size);
        formData.append("file", file);

        const res = await fetch(
            `${damaServerPath}/gis-dataset/upload`,
            { method: "POST", body: formData }
        );

        const resValue = await res.json();
        if (Array.isArray(resValue)) {
            const [{ id }] = resValue;

            if(id){
                try {
                    const fetchData = async (gisUploadId) => {
                        setLoading(true)
                        const url = `${damaServerPath}/gis-dataset/${gisUploadId}/layers`;

                        const pollForLayers = async () => {
                            const res = await fetch(url);
                            const layers = await res.json();
                            if (!Array.isArray(layers) || layers.length === 0) {
                                await delay(2000);
                                return pollForLayers();
                            }
                            return layers;
                        };

                        const layers = await pollForLayers();
                        setLayers(layers)
                        setLayerName(layers?.[0]?.layerName)
                        setGisUploadId(id)
                        setLoading(false)
                    }
                    fetchData(id)

                } catch (err) {
                    console.error(err)
                }
            }
            setLoading(false)
        } else {
            setLoading(false)
            throw resValue;
        }
    } catch (err) {
        setLoading(false)
        console.error(err?.message)
    }
}

const publish = async ({userId, email, gisUploadId, layerName, app, type, dmsServerPath, setPublishing, setPublishStatus,
                           updateMetaData, existingAttributes = [], columns = [], sourceId, primaryColName}) => {
    const publishData = {
        user_id: userId,
        email: email,
        gisUploadId,
        layerName,
        columns,
        sourceId,
        primaryColName
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

    if(publishFinalEvent.err){
        setPublishStatus('Error! There was a problem uploading the file.')
        throw new Error(`Error while publishing: ${publishFinalEvent.err}`)
    }else{
        setPublishing(false);
        setPublishStatus('The Sheet has been Processed. Please validate your records.')
    }
}
const Edit = ({value, onChange, size, format, view_id, apiLoad, apiUpdate,
                  parent, // form/source item. used to update meta about the source
                  parentFormat, // format for the parent record (e.g. sourceFormat with type 'doc_type|source')
                  updateMeta=true, // if called from CMS, meta update should not happen
                  context,
                  ...rest}) => {
    // this component should let a user:
    // 1. upload
    // 2. post upload change column name and display names -- avoiding this. this should be done in meta manager.
    // 3. set columns to geo columns
    // 4. map multiple columns to a single column. this converts column headers to values of a new column
    // 5. choose an id column to update data if there's id match.

    const {API_HOST, user, datasources} = useContext(context);
    const { theme } = useContext(ThemeContext) || {};
    const t = { ...uploadTheme, ...(theme?.datasets?.upload || {}) };
    const pgEnv = getExternalEnv(datasources) || 'hazmit_dama';
    const damaServerPath = `${API_HOST}/dama-admin/${pgEnv}`;
    const dmsServerPath = `${API_HOST}/dama-admin`;

    const [loading, setLoading] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [publishStatus, setPublishStatus] = useState(false)
    const [search, setSearch] = useState('');
    const [gisUploadId, setGisUploadId] = useState();
    const [layers, setLayers] =useState([]);
    const [layerName, setLayerName] = useState('');
    const inputClass = t.columnDisplayName;
    const existingAttributes = JSON.parse(format.config || '{}')?.attributes || [];
    const [columns, setColumns] = useState([]);
    const [primaryColName, setPrimaryColName] = useState('id');
    // pivot columns convert column headers into their values if source column has any data in them.
    // {Flooding: {pivotColumn: 'associated_hazards'}
    // pivotColumns: {finalCOlName: [srcCol1, srcCol2, srcCol3, ...]}
    const updateMetaData = (data, attrKey) => {
      if (!updateMeta) return;
        const editFormat = parentFormat || format;
        console.log('updateMetadata', {data: {id: parent.source_id, [attrKey]: data}, config: {format: editFormat}})
        apiUpdate({data: {id: parent.source_id, [attrKey]: data}, config: {format: editFormat}})
    }
    // ================================================= get layers begin ==============================================

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
    const pivotColumns = existingAttributes.filter(existingCol => columns.filter(c => c.existingColumnMatch === existingCol.name).length > 1);

    if(!view_id) return 'No version selected.'
    if(publishStatus){
        return <div className={t.publishStatus}>
            {publishStatus}
        </div>
    }
    return !gisUploadId ?
    // file uploader UI
    (
        <div className={t.uploaderOuter}>

            <div className={t.uploaderDropzone}
                 onDragOver={preventDefaults}
                 onDragEnter={preventDefaults}
                 onDragLeave={preventDefaults}
                 onDrop={e => {
                     preventDefaults(e);
                     if(!e.dataTransfer.files[0]) return;
                     return uploadGisDataset({
                         file: e.dataTransfer.files[0],
                         user,
                         damaServerPath,
                         setGisUploadId,
                         setLoading,
                         setLayers,
                         setLayerName
                     })
                 }}
            >
                <label htmlFor="dropzone-file"
                       className={t.uploaderLabel}>
                    <div className={t.uploaderLabelInner}>
                        <svg className={t.uploaderSvg} aria-hidden="true"
                             xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                  d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                        </svg>
                        {
                            loading ? <p className={t.uploaderLoadingText}>Uploading...</p> : (
                                <>
                                    <p className={t.uploaderClickText}>
                                        <span className={t.uploaderClickBold}>Click to upload</span> or drag and drop</p>
                                    <p className={t.uploaderTypeText}>a zipped CSV or Excel</p>
                                </>
                            )
                        }
                    </div>
                    <input disabled={loading} id="dropzone-file" type="file" className={t.uploaderInput}
                           onChange={(e) =>
                        uploadGisDataset({file: e.target.files[0], user, damaServerPath, setGisUploadId, setLoading, setLayers, setLayerName})}/>
                </label>
            </div>


        </div>
    ) :
        // post upload UI
        // after a file has been uploaded to the server, make required selection. then publish.
        (
            <div className={t.postUploadOuter}>
                <div className={t.postUploadLayerRow}>
                    <label htmlFor={'layer-selector'}>Sheet to upload:</label>
                    <select
                        id={'layer-selector'}
                        className={t.postUploadLayerSelect}
                        value={layerName}
                        onChange={e => setLayerName(e.target.value)}
                    >
                        <option key={'default'} value={undefined}>Please select...</option>
                        {
                            (layers || []).map(({layerName}) => <option key={layerName}
                                                                        value={layerName}>{layerName}</option>)
                        }
                    </select>
                </div>
                {/*display pivot columns*/}
                {
                    pivotColumns.length ?
                        <div className={t.pivotColumnsWrapper}>
                            <div className={t.pivotColumnsTitle}>Pivot Columns
                                <InfoCircle className={'ml-1 text-blue-500 hover:text-blue-300 cursor-pointer'}
                                            height={18} width={18}
                                            title={'These column headers will become values for the Destination column if there exists a value for a given row in the data.'}/>
                            </div>
                            <div className={t.pivotColumnsGrid}
                                 style={{gridTemplateColumns: '1fr 2fr'}}>
                                <div>Destination Column</div>
                                <div>Source Columns</div>
                            </div>
                            {

                                pivotColumns.map(existingCol => (
                                    <div key={existingCol.name} className={t.pivotColumnsGrid}
                                         style={{gridTemplateColumns: '1fr 2fr'}}>
                                        <div>{existingCol.display_name || existingCol.name}</div>
                                        <div>{columns.filter(c => c.existingColumnMatch === existingCol.name).map(c => c.display_name || c.name).join(', ')}</div>
                                    </div>
                                ))

                            }
                        </div> : null
                }

                {/*Render primary column selector*/}
                <div className={t.primaryColRow}>
                    <label htmlFor={'primary-col-selector'}>Primary Column <span className={'text-xs italic'}>(Existing records will be updated when the primary column value matches)</span>:</label>
                    <select
                        id={'primary-col-selector'}
                        className={t.primaryColSelect}
                        value={primaryColName}
                        onChange={e => setPrimaryColName(e.target.value)}
                    >
                        <option key={'primary-col-id'} value={'id'}>id (Row ID)</option>
                        <option key={'primary-col-none'} value={''}>None (always insert)</option>
                        {
                            columns.map(({name, display_name}) => <option key={name}
                                                                          value={name}>{display_name || name}</option>)
                        }
                    </select>
                </div>
                {/* if there are attributes for this pattern, show them as well. and give option to map detected columns to them */}
                {
                    columns?.length ?
                        <>
                            <div className={t.columnsHeader}
                                 style={{gridTemplateColumns: "1fr 1fr 100px"}}>
                                <label className={'flex flex-wrap items-center'}>
                                    Display Name
                                    <input className={'p-0.5 mx-1 border rounded-md text-sm font-light'} value={search}
                                           onChange={e => setSearch(e.target.value)} placeholder={'search...'}/></label>
                                <label>Existing Column Match</label>
                                <label>GEO Column</label>
                            </div>
                            <div className={t.columnsBody}>
                                {
                                    columns
                                        .filter(({
                                                     display_name,
                                                     name
                                                 }) => !search || (display_name || name).toLowerCase().includes(search.toLowerCase()))
                                        .map(({name, display_name, existingColumnMatch, geo_col}) => (
                                            <div key={name}
                                                 className={t.columnRow}
                                                 style={{gridTemplateColumns: "1fr 1fr 100px"}}>
                                                {/*<input disabled className={inputClass} value={name}/>*/}
                                                <div key={`${name}_display_name`}
                                                     className={t.columnDisplayName}>{display_name}</div>
                                                <select key={`${name}_select_existing_col`}
                                                        className={existingColumnMatch ? t.columnSelectMatch : t.columnSelectNoMatch}
                                                        value={existingColumnMatch}
                                                        onChange={e =>
                                                            setColumns(columns.map(c => c.name === name ? ({
                                                                ...c,
                                                                existingColumnMatch: e.target.value
                                                            }) : c))}
                                                >
                                                    <option>Please select...</option>
                                                    {
                                                        existingAttributes
                                                            .sort((a, b) => a?.display_name?.localeCompare(b?.display_name))
                                                            .map(({name, display_name}) => (
                                                                <option key={name} value={name}>
                                                                    {display_name || name}
                                                                </option>))
                                                    }
                                                </select>
                                                <div key={`${name}_geo_col_div`}
                                                     className={t.columnGeoCell}>
                                                    <input className={''} type={"checkbox"} checked={geo_col || false}
                                                           onChange={() => {
                                                           }}
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
                            <div className={t.publishRow}>
                                <button className={t.publishBtn}
                                        disabled={publishing}
                                        onClick={() => publish({
                                            ...user,
                                            gisUploadId,
                                            layerName,
                                            app: format.app,
                                            type: format.type,
                                            dmsServerPath,
                                            columns,
                                            primaryColName,
                                            publishStatus,
                                            setPublishStatus,
                                            setPublishing,
                                            existingAttributes,
                                            updateMetaData,
                                            sourceId: parent?.source_id
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
