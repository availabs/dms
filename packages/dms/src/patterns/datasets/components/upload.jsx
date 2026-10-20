import React, { useState, useEffect, useContext} from 'react'
import {InfoCircle} from "../../admin/ui/icons";
import { getExternalEnv } from "../utils/datasources";
import { ThemeContext } from "../../../ui/useTheme";
import { uploadTheme } from "./upload.theme";
import { authedFetch, PermissionError } from "../../../utils/authedFetch";

// UI.Select reads '' as "no value": the "None (always insert)" primary-column choice
const NO_PRIMARY = '__none__';
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
const uploadGisDataset = async ({file, user, damaServerPath, setGisUploadId, setLoading, setLayers, setLayerName, setPublishStatus}) => {
    try {
        setLoading(true)
        const formData = new FormData();
        formData.append("user_id", user.id);
        formData.append("email", user.email);
        formData.append("fileSizeBytes", file.size);
        formData.append("file", file);

        const res = await authedFetch(
            `${damaServerPath}/gis-dataset/upload`,
            { method: "POST", body: formData, user }
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
                            const res = await authedFetch(url, { user });
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
        if (err instanceof PermissionError) setPublishStatus(err.message)
        console.error(err?.message)
    }
}

const publish = async ({user, gisUploadId, layerName, app, type, dmsServerPath, setPublishing, setPublishStatus,
                           updateMetaData, existingAttributes = [], columns = [], sourceId, primaryColName}) => {
    const publishData = {
        user_id: user?.id,
        email: user?.email,
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

    let res;
    try {
        res = await authedFetch(`${dmsServerPath}/dms/${app}+${type}/publish`,
            {
                method: "POST",
                body: JSON.stringify(publishData),
                headers: {
                    "Content-Type": "application/json",
                },
                user,
            });
    } catch (err) {
        setPublishing(false);
        setPublishStatus(err instanceof PermissionError ? err.message : 'Error! There was a problem uploading the file.');
        return;
    }

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
    const { theme, UI } = useContext(ThemeContext) || {};
    const t = { ...uploadTheme, ...(theme?.datasets?.upload || {}) };
    const { Button, FieldLabel, FileInput, Input, Select, ColumnTypes } = UI;
    const CheckboxEdit = ColumnTypes.checkbox.EditComp;
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
    const existingAttributeOptions = [...existingAttributes]
        .sort((a, b) => a?.display_name?.localeCompare(b?.display_name))
        .map(({name, display_name}) => ({label: display_name || name, value: name}));
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

            <div className={t.uploaderDropzone}>
                <FileInput dropzone hint={'a zipped CSV or Excel'} loading={loading}
                           onChange={files => files[0] && uploadGisDataset({
                               file: files[0], user, damaServerPath, setGisUploadId, setLoading, setLayers, setLayerName, setPublishStatus
                           })} />
            </div>


        </div>
    ) :
        // post upload UI
        // after a file has been uploaded to the server, make required selection. then publish.
        (
            <div className={t.postUploadOuter}>
                <div className={t.postUploadLayerRow}>
                    <FieldLabel text={'Sheet to upload:'} />
                    <Select
                        options={(layers || []).map(({layerName}) => layerName)}
                        placeholder={'Please select...'}
                        value={layerName}
                        onChange={v => setLayerName(v || '')}
                    />
                </div>
                {/*display pivot columns*/}
                {
                    pivotColumns.length ?
                        <div className={t.pivotColumnsWrapper}>
                            <div className={t.pivotColumnsTitle}>Pivot Columns
                                <InfoCircle className={t.pivotInfoIcon}
                                            height={18} width={18}
                                            title={'These column headers will become values for the Destination column if there exists a value for a given row in the data.'}/>
                            </div>
                            <div className={t.pivotColumnsHeadGrid}
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
                    <FieldLabel text={<>Primary Column <span className={t.primaryColHint}>(Existing records will be updated when the primary column value matches)</span>:</>} />
                    <Select
                        options={[
                            {label: 'id (Row ID)', value: 'id'},
                            {label: 'None (always insert)', value: NO_PRIMARY},
                            ...columns.map(({name, display_name}) => ({label: display_name || name, value: name})),
                        ]}
                        value={primaryColName === '' ? NO_PRIMARY : primaryColName}
                        onChange={v => setPrimaryColName(v === NO_PRIMARY || v === undefined ? '' : v)}
                    />
                </div>
                {/* if there are attributes for this pattern, show them as well. and give option to map detected columns to them */}
                {
                    columns?.length ?
                        <>
                            <div className={t.columnsHeader}
                                 style={{gridTemplateColumns: "1fr 1fr 100px"}}>
                                <div className={t.columnsSearchLabel}>
                                    <FieldLabel activeStyle={'inline'} htmlFor={'upload-columns-search'} text={'Display Name'} />
                                    <Input id={'upload-columns-search'} activeStyle={'headerFilter'} value={search}
                                           onChange={e => setSearch(e.target.value)} placeholder={'search...'}/>
                                </div>
                                <div>Existing Column Match</div>
                                <div>GEO Column</div>
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
                                                {/* no match yet → the MultiSelect 'muted' style (pencil value) */}
                                                <Select key={`${name}_select_existing_col`}
                                                        activeStyle={existingColumnMatch ? undefined : 'muted'}
                                                        options={existingAttributeOptions}
                                                        placeholder={'Please select...'}
                                                        value={existingColumnMatch}
                                                        onChange={v =>
                                                            setColumns(columns.map(c => c.name === name ? ({
                                                                ...c,
                                                                existingColumnMatch: v
                                                            }) : c))}
                                                />
                                                <div key={`${name}_geo_col_div`}
                                                     className={t.columnGeoCell}>
                                                    <CheckboxEdit value={!!geo_col} aria-label={`${display_name} is a GEO column`}
                                                                  onChange={v => {
                                                                      setColumns(columns.map(c => c.name === name ? ({
                                                                          ...c,
                                                                          geo_col: !!v
                                                                      }) : c))
                                                                  }}/>
                                                </div>
                                            </div>
                                        ))
                                }
                            </div>
                            <div className={t.publishRow}>
                                <Button activeStyle={'primary'}
                                        disabled={publishing}
                                        onClick={() => publish({
                                            user,
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
                                </Button>
                            </div>
                        </> : <div className={t.noColumnsMsg || undefined}>No columns available.</div>
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
