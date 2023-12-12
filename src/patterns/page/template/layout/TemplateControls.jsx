import React, {useEffect, Fragment, useRef, useState} from 'react'
import {Dialog, Transition, Switch} from '@headlessui/react'
import {ExclamationTriangleIcon} from '@heroicons/react/24/outline'
import cloneDeep from 'lodash/cloneDeep'
import isEqual from 'lodash/isEqual'
import {ToastContainer, toast, Slide} from 'react-toastify';
import {useSubmit, useLocation} from "react-router-dom";
import {json2DmsForm, getUrlSlug, toSnakeCase} from '~/modules/dms/src/patterns/page/layout/nav'
import 'react-toastify/dist/ReactToastify.css';
import DataControls from './TemplateDataControls'
import {parseJSON} from "./utils/parseJSON.js";
import {ViewInfo} from "./components/ViewInfo.jsx";
import ComponentRegistry from '~/sites/www/pages/cms/dms/ComponentRegistry'
import {useFalcor} from '~/modules/avl-falcor';


const theme = {
    pageControls: {
        controlItem: 'pl-6 py-0.5 text-md cursor-pointer hover:text-blue-500 text-slate-400 flex items-center',
        select: 'bg-transparent border-none rounded-sm focus:ring-0 focus:border-0 pl-1',
        selectOption: 'p-4 text-md cursor-pointer hover:text-blue-500 text-slate-400 hover:bg-blue-600',
        content: '',
    }
}


export function PageControls({item, dataItems, updateAttribute, attributes, edit, status, setItem}) {
    const submit = useSubmit()
    const {falcor, falcorCache} = useFalcor();
    const {pathname = '/edit'} = useLocation()
    const [loadingStatus, setLoadingStatus] = useState();
    const [showDelete, setShowDelete] = useState(false)
    const [showDataControls, setShowDataControls] = useState(false)
    const [statusMessage, setStatusMessage] = useState(status?.message)
    const [dataControls, setDataControls] = useState(item.data_controls || {
        source: null,
        view: null,
        num_rows: null,
        id_column: null,
        active_row: {},
        sectionControls: {}
    })
    const [url, setUrl] = useState(item.url || `${dataControls?.id_column?.name}/`);
    const [destination, setDestination] = useState(item.destination || 'docs-play');

    // const { baseUrl, setOpen, setHistoryOpen} = React.useContext(CMSContext)
    const baseUrl = '/admin/templates'
    const NoOp = () => {
    }

    const saveDataControls = () => {
        if (!isEqual(item.data_controls, dataControls)) {
            const newItem = cloneDeep(item)
            newItem.data_controls = dataControls
            submit(json2DmsForm(newItem), {method: "post", action: pathname})
        } else {
            console.log('equal', item.data_controls, dataControls)
        }
    }

    useEffect(() => {
        async function loadUpdates() {
            const totalSections = Object.keys(dataControls.sectionControls)?.filter((id, i) => id && id !== 'undefined')?.length;
            setLoadingStatus('Loading sections...');

            const updates = await Object.keys(dataControls.sectionControls)
                .filter((id, i) => id && id !== 'undefined')
                .reduce(async (acc, section_id, i) => {
                    const prev = await acc;
                    setLoadingStatus(`Updating section ${i+1}/${totalSections}`)
                    let section = item.sections.filter(d => d.id === section_id)?.[0] || {}
                    let data = parseJSON(section?.element?.['element-data']) || {}
                    let type = section?.element?.['element-type'] || ''
                    let comp = ComponentRegistry[type] || {}

                    let controlVars = (comp?.variables || []).reduce((out, curr) => {
                        out[curr.name] = data[curr.name]
                        return out
                    }, {})

                    let updateVars = Object.keys(dataControls.sectionControls[section_id])
                        .reduce((out, curr) => {
                            out[curr] = dataControls?.active_row?.[dataControls?.sectionControls?.[section_id]?.[curr]?.name] ||
                                dataControls?.active_row?.[dataControls?.sectionControls?.[section_id]?.[curr]] || null

                            return out
                        }, {})

                    let args = {...controlVars, ...updateVars}
                    const curr = comp?.getData ? await comp.getData(args, falcor).then(data => ({section_id, data})) : null
                    return curr ? [...prev, curr] : prev
                }, Promise.resolve([]))

            // console.log('updates', updates)
            if (updates.length > 0) {
                let newSections = cloneDeep(item.sections)
                updates.forEach(({section_id, data}) => {
                    let section = newSections.filter(d => d.id === section_id)?.[0] || {}
                    section.element['element-data'] = JSON.stringify(data)
                    // console.log('updating section', section_id, data)
                })
                updateAttribute('sections', newSections)
            }

            setLoadingStatus(undefined)



        }

        console.log('x-----------------x')
        loadUpdates()
        console.log('y-----------------y')


    }, [dataControls?.active_row])

    //console.log('render', showDataControls)

    useEffect(() => {
        setStatusMessage(status?.message)
        toast.success(status?.message, {
            toastId: 'page-update-success',
            position: "bottom-right",
            autoClose: 5000,
            transition: Slide,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            progress: undefined,
            theme: "light",
        })
    }, [status])

    const saveItem = async () => {
        const newItem = cloneDeep(item)
        newItem.url_slug = newItem.url_slug || getUrlSlug(newItem, dataItems) // in case of a template generated page
        submit(json2DmsForm(newItem), {method: "post", action: pathname})

    }

    const toggleSidebar = async (value = '') => {
        const newItem = cloneDeep(item)
        newItem.sidebar = value
        updateAttribute('sidebar', value)
        submit(json2DmsForm(newItem), {method: "post", action: pathname})
    }

    const saveUrl = async (value = '') => {
        const newItem = cloneDeep(item)
        newItem.url = value
        updateAttribute('url', value)
        submit(json2DmsForm(newItem), {method: "post", action: pathname})
    }

    const saveDestination = async (value = '') => {
        const newItem = cloneDeep(item)
        newItem.destination = value
        updateAttribute('destination', value)
        submit(json2DmsForm(newItem), {method: "post", action: pathname})
    }

    const TitleEdit = attributes['title'].EditComp

    //console.log('showDelete', showDelete)
    return (
        <>
            {edit &&
                <div className='p-4'>
                    <div className='w-full flex justify-center pb-6'>
                        <div
                            onClick={saveItem}
                            className='inline-flex w-36 justify-center rounded-lg cursor-pointer text-sm font-semibold py-2 px-4 bg-blue-600 text-white hover:bg-blue-500 shadow-lg border border-b-4 border-blue-800 hover:border-blue-700 active:border-b-2 active:mb-[2px] active:shadow-none'>
                <span className='flex items-center'>
                  <span className=''>Save Template</span>
                    {/*     <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>*/}

                </span>
                        </div>
                    </div>
                    <div className='pl-4 pb-4'>
                        <TitleEdit
                            className='w-full px-2 py-1 text font-medium text-slate-500 focus:outline-none border-slate-300 border-b-2 focus:border-blue-500'
                            value={item['title']}
                            onChange={(v) => updateAttribute('title', v)}
                            {...attributes['title']}
                        />
                    </div>
                    {/*<div className='pl-6 pb-2 text-gray-500 text-xs'>{item['id']}</div>*/}
                    <div className={theme.pageControls.controlItem}>
                        <i className={'text-xs pr-1 fa fa-link'}/>
                        <input
                            className={'w-full'}
                            type={'text'} value={url}
                            onChange={e => saveUrl(e.target.value) && setUrl(e.target.value)}/>
                    </div>

                    <div className={theme.pageControls.controlItem}>
                        <i className={'fa-solid fa-up-down-left-right text-sm'}/>
                        <select
                            title={'Move Page'}
                            className={theme.pageControls.select}
                            value={destination}
                            onChange={e => {
                                return saveDestination(e.target.value) && setDestination(e.target.value);
                            }}
                        >
                            <option key={'cms'} value={'docs-page'} className={theme.pageControls.selectOption}>Live
                            </option>
                            <option key={'draft'} value={'docs-draft'}
                                    className={theme.pageControls.selectOption}>Draft
                            </option>
                            <option key={'playground'} value={'docs-play'}
                                    className={theme.pageControls.selectOption}>Playground
                            </option>
                        </select>
                    </div>

                    <div className={theme.pageControls.controlItem + ' pb-6'}>
                        <SidebarSwitch
                            item={item}
                            toggleSidebar={toggleSidebar}
                        />
                        Show Sidebar
                    </div>
                    <div
                        className={theme.pageControls.controlItem}
                    >
              <span onClick={() => {
                  setShowDataControls(true);
              }}>
                {'☲ Data Controls'}
              </span>
                        <DataControls
                            item={item}
                            open={showDataControls}
                            setOpen={setShowDataControls}
                            dataControls={dataControls}
                            setDataControls={setDataControls}
                            saveDataControls={saveDataControls}
                            baseUrl={baseUrl}
                        />
                    </div>
                    {dataControls?.id_column && <div>
                        <ViewInfo
                            submit={submit}
                            item={item}
                            source={dataControls?.source}
                            view={dataControls?.view}
                            id_column={dataControls?.id_column}
                            active_row={dataControls?.active_row}
                            url={url}
                            destination={destination}
                            onChange={(k, v) => {
                                if (k === 'id_column') {
                                    setDataControls({...dataControls, ...{id_column: v, active_row: {}}})
                                }
                                if (k === 'active_row') {
                                    setDataControls({...dataControls, ...v})
                                }
                            }}
                            loadingStatus={loadingStatus}
                            setLoadingStatus={setLoadingStatus}
                            baseUrl={baseUrl}
                        />
                    </div>}
                    {/*<div onClick={() => setShowDelete(true)}
              className={theme.pageControls.controlItem}
            >
              { '☵ Delete' }
              <DeleteModal
                item={item}
                open={showDelete}
                setOpen={setShowDelete}
              />
            </div>*/}

                </div>
            }
            <ToastContainer/>
        </>
    )
}

export function SidebarSwitch({item, toggleSidebar}) {
    let enabled = item.sidebar === 'show'
    return (
        <Switch
            checked={enabled}
            onChange={(e) => toggleSidebar(enabled ? '' : 'show')}
            className="group relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2"
        >
            <span className="sr-only">Use setting</span>
            <span aria-hidden="true" className="pointer-events-none absolute h-full w-full rounded-md bg-white"/>
            <span
                aria-hidden="true"
                className={`
          ${enabled ? 'bg-blue-500' : 'bg-gray-200'}
          pointer-events-none absolute mx-auto h-4 w-9 rounded-full transition-colors duration-200 ease-in-out
        `}
            />
            <span
                aria-hidden="true"
                className={`
          ${enabled ? 'translate-x-5' : 'translate-x-0'}
          pointer-events-none absolute left-0 inline-block h-5 w-5 transform rounded-full border border-gray-200 bg-white shadow ring-0 transition-transform duration-200 ease-in-out
        `}
            />
        </Switch>
    )
}

export function DeleteModal({item, open, setOpen}) {
    const cancelButtonRef = useRef(null)
    const submit = useSubmit()
    // const { baseUrl } = React.useContext(CMSContext)
    const baseUrl = '/admin/templates'
    const [loading, setLoading] = useState(false)
    return (
        <Modal
            open={open}
            setOpen={setOpen}
            initialFocus={cancelButtonRef}
        >
            <div className="sm:flex sm:items-start">
                <div
                    className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <ExclamationTriangleIcon className="h-6 w-6 text-red-600" aria-hidden="true"/>
                </div>
                <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                    <Dialog.Title as="h3" className="text-base font-semibold leading-6 text-gray-900">
                        Delete Page {item.title} {item.id}
                    </Dialog.Title>
                    <div className="mt-2">
                        <p className="text-sm text-gray-500">
                            Are you sure you want to delete this page? All of the page data will be permanently removed
                            from our servers forever. This action cannot be undone.
                        </p>
                    </div>
                </div>
            </div>
            <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                <button
                    type="button"
                    disabled={loading}
                    className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:ml-3 sm:w-auto"
                    onClick={async () => {
                        setLoading(true)
                        await submit(json2DmsForm(item, 'delete'), {method: "post", action: `${baseUrl}/edit/`})
                        setLoading(false);
                        setOpen(false);
                    }}
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

export function Modal({open, setOpen, initialFocus, children}) {
    return (
        <Transition.Root show={open} as={Fragment}>
            <Dialog as="div" className="relative z-30" initialFocus={initialFocus} onClose={setOpen}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"/>
                </Transition.Child>

                <div className="fixed inset-0 z-10 overflow-y-auto">
                    <div
                        onClick={() => {
                            setOpen(false);
                        }}
                        className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0"
                    >
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                            enterTo="opacity-100 translate-y-0 sm:scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                        >
                            <Dialog.Panel
                                className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                                {children}
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition.Root>
    )
}

