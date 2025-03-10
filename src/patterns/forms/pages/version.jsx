import React, {useState} from "react";
import { FormsContext } from '../siteConfig'
import SourcesLayout from "../components/patternListComponent/layout";
import {DeleteModal} from "../../page/ui";
import { cloneDeep } from "lodash-es";
import {useNavigate} from "react-router-dom";
const buttonRedClass = 'w-full p-2 mx-1 bg-red-300 hover:bg-red-500 text-gray-800 rounded-md';
const buttonGreenClass = 'p-2 mx-1 bg-green-500 hover:bg-green-700 text-white rounded-md';

const DeleteViewBtn = ({item, view_id, format, url, apiUpdate, baseUrl}) => {
    // update parent to exclude item. the item still stays in the DB.
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const navigate = useNavigate();

    const deleteSource = async () => {
        const config = {format}
        const data = cloneDeep(item);
        data.views = data.views.filter(s => s.id !== view_id);
        console.log('parent', config, data, item)

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
        const ids = [...validDataRes, ...invalidDataRes].map(r => r.id).filter(r => r);
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
const Version = ({
                   status,
                   apiUpdate,
                   apiLoad,
                   attributes = {},
                   dataItems,
                   format,
                   item,
                   setItem,
                   updateAttribute,
                   params,
                   submit,
                   manageTemplates = false,
                   ...r
               }) => {
    const {API_HOST, baseUrl, pageBaseUrl, theme, user, parent} = React.useContext(FormsContext) || {};
    const {app, type, config} = parent;

    const currentView = (item?.views || []).find(v => v.id === params.view_id);

    return (
        <SourcesLayout fullWidth={false} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} isListAll={false}
                       hideBreadcrumbs={false}
                       form={{name: item.name || item.doc_type, href: format.url_slug}}
                       page={{name: 'Version', href: `${pageBaseUrl}/${params.id}/view/${params.view_id}`}}
                       id={params.id} //page id to use for navigation
                       view_id={params.view_id}
                       views={item.views}
                       showVersionSelector={true}
        >
            <div className={`${theme?.page?.wrapper1}`}>

                <div className={'w-full p-2 bg-white flex'}>
                    <div className={'w-full flex flex-col justify-between'}>
                        <div className={'w-full text-lg text-gray-500 border-b'}>{item?.name} - {currentView?.name || currentView?.id}</div>
                        <div className={'w-fit flex flex-col gap-1 text-center self-end'}>
                            {
                                ['created_at', 'updated_at'].map(key => (
                                    <div className={''}>
                                        <div className={'text-sm text-gray-500 capitalize'}>{key.replace('_', ' ')}</div>
                                        <div className={'text-blue-500'}>{currentView?.[key]}</div>
                                    </div>
                                ))
                            }
                            <ClearDataBtn app={app} type={item.doc_type} view_id={params.view_id} apiLoad={apiLoad} apiUpdate={apiUpdate}/>
                            <DeleteViewBtn item={item} format={format} view_id={params.view_id} url={`${pageBaseUrl}/${params.id}`} apiUpdate={apiUpdate} baseUrl={baseUrl}/>
                        </div>
                    </div>
                </div>
            </div>
        </SourcesLayout>

    )
}

export default Version