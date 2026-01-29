import React, {useContext, useEffect, useState} from "react";
import {useNavigate} from "react-router";
import { DatasetsContext } from '../../../context'
import { ThemeContext } from "../../../../../ui/useTheme";
import SourcesLayout from "../../layout";
import {getSourceData, updateVersionData} from "./utils";
import { getExternalEnv } from "../../../utils/datasources";
import {cloneDeep} from "lodash-es";
import ExternalVersionControl from "../../../components/ExternalVersionControls";

const buttonRedClass = 'w-full p-2 mx-1 bg-red-300 hover:bg-red-500 text-gray-800 rounded-md';

const DeleteViewBtn = ({source, view_id, format, url, apiUpdate, baseUrl}) => {
    const {UI} = useContext(ThemeContext);
    const {DeleteModal} = UI;
    // update parent to exclude source. the source still stays in the DB.
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const navigate = useNavigate();

    const deleteSource = async () => {
        const config = {format}
        const data = cloneDeep(source);
        data.views = data.views.filter(s => s.id !== view_id);
        console.log('parent', config, data, source)

        await apiUpdate({data, config});
        // navigate(baseUrl)
        navigate(url);
    }
    return (
        <div className={'w-full'}>
            <button className={buttonRedClass} onClick={() => setShowDeleteModal(true)}>Delete Version</button>

            <DeleteModal
                title={`Delete View`} open={showDeleteModal}
                prompt={`Are you sure you want to delete this version? All of the version data will be permanently removed
                                            from our servers forever. This action cannot be undone.`}
                setOpen={(v) => setShowDeleteModal(v)}
                onDelete={() => {
                    async function deleteItem() {
                        await deleteSource()
                        setShowDeleteModal(false)
                    }

                    deleteItem()
                }}
            />
        </div>
    )
}

const ClearDataBtn = ({app, type, view_id, apiLoad, apiUpdate}) => {
    const {UI} = useContext(ThemeContext);
    const {DeleteModal} = UI;
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const clearData = async () => {
        // fetch all ids based on app and type (doc_type of source), and then call dmsDataEditor with config={app, type}, data={id}, requestType='delete
        const attributes = ['id']
        const action = 'load'
        const validDataconfig = {
            format: {
                app: app,
                type: `${type}-${view_id}`,
                attributes
            },
            children: [
                {
                    type: () => {},
                    action,
                    filter: {
                        options: JSON.stringify({}),
                        attributes
                    },
                    path: '/'
                }
            ]
        }
        const invalidDataconfig = {
            format: {
                app: app,
                type: `${type}-${view_id}-invalid-entry`,
                attributes
            },
            children: [
                {
                    type: () => {},
                    action,
                    filter: {
                        options: JSON.stringify({}),
                        attributes
                    },
                    path: '/'
                }
            ]
        }

        const validDataRes = await apiLoad(validDataconfig);
        const invalidDataRes = await apiLoad(invalidDataconfig);
        if(!validDataRes?.length && !invalidDataRes?.length) return;
        const ids = [...validDataRes, ...invalidDataRes].map(r => r.id).filter(r => r && typeof r !== 'object');
        if(!ids?.length) return;

        await apiUpdate({data: {id: ids}, config: validDataconfig, requestType: 'delete'});
    }
    return (
        <div className={'w-full'}>
            <button className={buttonRedClass} onClick={() => setShowDeleteModal(true)}>Clear Data</button>

            <DeleteModal
                title={`Clear Uploaded Data`} open={showDeleteModal}
                prompt={`Are you sure you want to clear all uploaded data for this version? This action cannot be undone.`}
                setOpen={(v) => setShowDeleteModal(v)}
                onDelete={() => {
                    async function deleteItem() {
                        await clearData()
                        setShowDeleteModal(false)
                    }

                    deleteItem()
                }}
            />
        </div>
    )
}

export default function ManageForm ({ status, apiLoad, apiUpdate, format, source, params, isDms }) {
    const {id} = params;
    const navigate = useNavigate();
    const { app, baseUrl, pageBaseUrl, theme, falcor, datasources } = React.useContext(DatasetsContext) || {}
    const pgEnv = getExternalEnv(datasources);
    const {UI} = React.useContext(ThemeContext) || {}
    const {Input} = UI;
    const [currentView, setCurrentView] = React.useState((source?.views || []).find(v => +(v.view_id || v.id) === +params.view_id) || {});

    useEffect(() => {
        if(!params.view_id && source?.views?.length){
            const recentView = Math.max(...source.views.map(({id, view_id}) => view_id || id));
            navigate(`${pageBaseUrl}/${params.id}/version/${recentView}`)
        }
    }, [source.views]);

    useEffect(() => {
        const newView = (source?.views || []).find(v => +(v.view_id || v.id) === +params.view_id) || {};
        if((currentView.view_id || currentView.id) !== (newView.view_id || newView.id)) setCurrentView(newView)
    }, [source, params.view_id]);

    console.log('source', source, currentView)

    return (
            <div className={`${theme?.page?.wrapper1}`}>
                    <div className={'overflow-auto flex flex-1 gap-2 w-full flex-col shadow bg-white relative text-md font-light leading-7 p-4'}>
                        {status ? <div>{JSON.stringify(status)}</div> : ''}
                        <div className={'w-full text-lg text-gray-500 border-b'}>{source?.name} - {currentView?.version || currentView?.name || currentView?.view_id || currentView?.id}</div>
                        <div className={'flex gap-12'}>
                            <div className={'flex-grow'}>
                                <label>Version</label>
                                <Input type={'text'} value={currentView.version || currentView.name} onChange={e => {
                                    updateVersionData({
                                        data: e.target.value,
                                        attrKey: isDms ? 'name' : 'version',
                                        isDms, apiUpdate,
                                        view: currentView, setView: setCurrentView, format, source, pgEnv, falcor, id: currentView.view_id || currentView.id
                                    })
                                }}/>
                            </div>
                            <div className={'flex flex-col gap-4'}>
                                {
                                    ['created_at', 'updated_at'].map(key => (
                                        <div className={''}>
                                            <div className={'text-sm text-gray-500 capitalize'}>{key.replace('_', ' ')}</div>
                                            <div className={'text-blue-500'}>{currentView?.[key]}</div>
                                        </div>
                                    ))
                                }
                                {
                                    isDms ? (
                                            <>
                                                <ClearDataBtn app={app} type={source.doc_type} view_id={params.view_id} apiLoad={apiLoad} apiUpdate={apiUpdate}/>
                                                <DeleteViewBtn source={source} format={format} view_id={params.view_id} url={`${pageBaseUrl}/${params.id}`} apiUpdate={apiUpdate} baseUrl={baseUrl}/>
                                            </>
                                    ) : <ExternalVersionControl source={source} view={currentView} sourceId={params.id} viewId={params.view_id} />
                                }
                            </div>
                        </div>
                    </div>
            </div>
    )
}