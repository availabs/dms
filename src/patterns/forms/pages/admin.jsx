import React, {useEffect, useState} from "react";
import { FormsContext } from '../siteConfig'
import SourcesLayout from "../components/patternListComponent/layout";
import {DeleteModal, Modal} from "../../page/ui";
import { cloneDeep } from "lodash-es";
import {useNavigate} from "react-router-dom";
const buttonRedClass = 'p-2 mx-1 bg-red-500 hover:bg-red-700 text-white rounded-md';
const buttonGreenClass = 'p-2 mx-1 bg-green-500 hover:bg-green-700 text-white rounded-md';

const DeleteSourceBtn = ({parent, item, apiUpdate, baseUrl}) => {
    // update parent to exclude item. the item still stays in the DB.
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const navigate = useNavigate();

    const deleteSource = async () => {
        const parentType = parent.ref.split('+')[1];
        if(!parentType) return;

        const config = {
            format: {
                app: parent.app,
                type: parentType
            }
        }
        const data = cloneDeep(parent);
        data.sources = data.sources.filter(s => s.id !== item.id);
        console.log('parent', config, data, item)

        await apiUpdate({data, config});
        // navigate(baseUrl)
        window.location.assign(baseUrl);
    }
    return (
        <>
            <button className={buttonRedClass} onClick={() => setShowDeleteModal(true)}>Delete Source</button>

            <DeleteModal
                title={`Delete Source`} open={showDeleteModal}
                prompt={`Are you sure you want to delete this source? All of the source data will be permanently removed
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
        </>
    )
}

const AddViewBtn = ({item, format, apiLoad, apiUpdate}) => {
    // update parent to exclude item. the item still stays in the DB.
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [name, setName] = useState('');
    const navigate = useNavigate();
    const defaultViewName = `version ${(item?.views?.length || 0) + 1}`;

    const addView = async () => {
        const config = {format}
        const data = cloneDeep(item);
        data.views = [...(data.views || []), {name: name || defaultViewName}];

        const res = await apiUpdate({data, config});
        console.log('res', res)
        // navigate(baseUrl)
        // window.location.assign(baseUrl);
    }
    return (
        <>
            <button disabled={!item.id} className={buttonGreenClass} onClick={() => setShowDeleteModal(true)}>Add Version</button>

            <Modal open={showDeleteModal} setOpen={(v) => setShowDeleteModal(v)}>
                <input key={'view-name'} placeholder={defaultViewName} value={name} onChange={e => setName(e.target.value)}/>
                <button className={buttonGreenClass} onClick={() => {
                    async function add() {
                        await addView()
                        setShowDeleteModal(false)
                    }

                    add()
                }}>add</button>
            </Modal>
        </>
    )
}

const ClearDataBtn = ({app, type, apiLoad, apiUpdate}) => {
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const clearData = async () => {
        // fetch all ids based on app and type (doc_type of source), and then call dmsDataEditor with config={app, type}, data={id}, requestType='delete
        const attributes = ['id']
        const action = 'load'
        const config = {
            format: {
                app: app,
                type: type,
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

        const res = await apiLoad(config);
        if(!res?.length) return;
        const ids = res.map(r => r.id).filter(r => r);
        if(!ids?.length) return;

        await apiUpdate({data: {id: ids}, config, requestType: 'delete'});
    }
    return (
        <>
            <button className={buttonRedClass} onClick={() => setShowDeleteModal(true)}>Clear Data</button>

            <DeleteModal
                title={`Clear Uploaded Data`} open={showDeleteModal}
                prompt={`Are you sure you want to clear all uploaded data for this source? This action cannot be undone.`}
                setOpen={(v) => setShowDeleteModal(v)}
                onDelete={() => {
                    async function deleteItem() {
                        await clearData()
                        setShowDeleteModal(false)
                    }

                    deleteItem()
                }}
            />
        </>
    )
}
const Admin = ({
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
    const {app, API_HOST, baseUrl, pageBaseUrl, theme, user, parent, ...rest} = React.useContext(FormsContext) || {};

    return (
        <SourcesLayout fullWidth={false} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} isListAll={false}
                       hideBreadcrumbs={false}
                       form={{name: item.name || item.doc_type, href: format.url_slug}}
                       page={{name: 'Admin', href: `${pageBaseUrl}/${params.id}/admin`}}
                       id={params.id} //page id to use for navigation
        >
            <div className={`${theme?.page?.wrapper1}`}>
                <div className={'w-full p-2 bg-white flex'}>
                    <AddViewBtn item={item} format={format} apiLoad={apiLoad} apiUpdate={apiUpdate}/>
                    <ClearDataBtn app={app} type={item.doc_type} apiLoad={apiLoad} apiUpdate={apiUpdate}/>
                    <DeleteSourceBtn parent={parent} item={item} apiUpdate={apiUpdate} baseUrl={baseUrl}/>
                </div>
            </div>
        </SourcesLayout>

    )
}

export default Admin