import React, {useState} from "react";
import { FormsContext } from '../siteConfig'
import SourcesLayout from "../components/selector/ComponentRegistry/patternListComponent/layout";
import {DeleteModal} from "../../page/ui";
const buttonClass = 'p-2 mx-1 bg-red-500 hover:bg-red-700 text-white rounded-md'

const DeleteSourceBtn = ({}) => {
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    return (
        <>
            <button className={buttonClass} onClick={() => setShowDeleteModal(true)}>Delete Source</button>

            <DeleteModal
                title={`Delete Source`} open={showDeleteModal}
                prompt={`Are you sure you want to delete this source? All of the source data will be permanently removed
                                            from our servers forever. This action cannot be undone.`}
                setOpen={(v) => setShowDeleteModal(v)}
                onDelete={() => {
                    async function deleteItem() {
                        // await onRemove()
                        setShowDeleteModal(false)
                    }

                    deleteItem()
                }}
            />
        </>
    )
}

const ClearDataBtn = ({}) => {
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    return (
        <>
            <button className={buttonClass} onClick={() => setShowDeleteModal(true)}>Clear Data</button>

            <DeleteModal
                title={`Clear Uploaded Data`} open={showDeleteModal}
                prompt={`Are you sure you want to clear all uploaded data for this source? This action cannot be undone.`}
                setOpen={(v) => setShowDeleteModal(v)}
                onDelete={() => {
                    async function deleteItem() {
                        // await onRemove()
                        setShowDeleteModal(false)
                    }

                    deleteItem()
                }}
            />
        </>
    )
}
const Admin = ({
                   adminPath,
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
                   parent,
                   manageTemplates = false,
                   // ...rest
               }) => {
    const {API_HOST, baseUrl, pageBaseUrl, theme, user, ...rest} = React.useContext(FormsContext) || {};

    const {app, type, config} = parent;
    console.log('what am i passing', item, parent)
    return (
        <SourcesLayout fullWidth={false} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} isListAll={false}
                       hideBreadcrumbs={false}
                       form={{name: item.name || item.doc_type, href: format.url_slug}}
                       page={{name: 'Admin', href: `${pageBaseUrl}/${params.id}/admin`}}
                       id={params.id} //page id to use for navigation
        >
            <div className={`${theme?.page?.wrapper1}`}>
                <div className={'w-full p-2 bg-white flex'}>

                    <ClearDataBtn />
                    <DeleteSourceBtn />
                </div>
            </div>
        </SourcesLayout>

    )
}

export default Admin