import React, {useRef, useState} from "react";
import {CMSContext} from "../../patterns/page/context";
import Modal from "./Modal";

export function DeleteModal ({title, prompt, item={}, open, setOpen, onDelete})  {
    const cancelButtonRef = useRef(null)
    const { baseUrl } = React.useContext(CMSContext) || {}
    const [loading, setLoading] = useState(false)
    return (
        <Modal
            open={open}
            setOpen={setOpen}
            initialFocus={cancelButtonRef}
        >
            <div className="sm:flex sm:items-start">
                <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <i className="fa fa-danger h-6 w-6 text-red-600" aria-hidden="true" />
                </div>
                <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                    <Headless.DialogTitle as="h3" className="text-base font-semibold leading-6 text-gray-900">
                        {title || `Delete ${item.title || ''} ${item.id}`}
                    </Headless.DialogTitle>
                    <div className="mt-2">
                        <p className="text-sm text-gray-500">
                            {prompt || `Are you sure you want to delete this page? All of the page data will be permanently removed
              from our servers forever. This action cannot be undone.`}
                        </p>
                    </div>
                </div>
            </div>
            <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                <button
                    type="button"
                    disabled={loading}
                    className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:ml-3 sm:w-auto"
                    onClick={onDelete}
                >
                    Delet{loading ? 'ing...' : 'e'}
                </button>
                <button
                    type="button"
                    className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                    onClick={() => setOpen(false)}
                    ref={cancelButtonRef}
                >
                    Cancel
                </button>
            </div>
        </Modal>
    )

}