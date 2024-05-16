import React, { useEffect, Fragment, useRef, useState } from 'react'
import { useSubmit, useLocation } from "react-router-dom";
import { Dialog, Transition, Switch, Popover } from '@headlessui/react'
import { usePopper } from 'react-popper'
import cloneDeep from 'lodash/cloneDeep'
import get from 'lodash/get'
import isEqual from "lodash/isEqual"

import ButtonSelector from './buttonSelector'
import TemplateDataControls from './templateDataControls'
import {ViewInfo} from "./template_components/ViewInfo.jsx";
import {json2DmsForm, getUrlSlug, toSnakeCase} from './utils/navItems'
import {parseJSON} from "./utils/parseJSON.js";

import EditPagesNav  from './editPages'
import EditHistory from './editHistory'

import { RegisteredComponents } from '../../selector'

import { CMSContext } from '../../siteConfig'


const theme = {
  pageControls: {
    controlItem: 'pl-6 py-0.5 text-md cursor-pointer hover:text-blue-500 text-slate-400 flex items-center',
    select: 'bg-transparent border-none rounded-sm focus:ring-0 focus:border-0 pl-1',
    selectOption: 'p-4 text-md cursor-pointer hover:text-blue-500 text-slate-400 hover:bg-blue-600',
    content: '',
  }
}

function EditControls({ item, dataItems, updateAttribute,attributes, edit, status, setItem, pageType = 'page' }) {
  const submit = useSubmit()
  const { pathname = '/edit' } = useLocation()
  //console.log('pathname editcontrols', pathname)
  const [ open, setOpen ] = React.useState(false)
  const [ historyOpen, setHistoryOpen] = React.useState(false)
  const [ showDataControls, setShowDataControls ] = useState(false)
  const [ showDelete, setShowDelete] = useState(false)
  const [ statusMessage, setStatusMessage ] = useState(status?.message)
  const [ moving, setMoving ] = useState(false);
  const [ type, setType] = useState(item.type);
  const [loadingStatus, setLoadingStatus] = useState();
  // const [dataControls, setDataControls] = useState(item.data_controls ||)
  
  

  const { baseUrl, user, falcor, falcorCache} = React.useContext(CMSContext)
  const NoOp = () => {}
  
  const saveItem = async (newSections) => {
    let newItem = {
      id: item.id,
      url_slug: getUrlSlug(item, dataItems)
    }
    if(newSections) {
      newItem.sections = newSections
    }
    submit(json2DmsForm(newItem), { method: "post", action: pageType  === 'template' ? pathname :`${baseUrl}/edit/${newItem.url_slug}` })
  }



  async function loadUpdates(dataControls) {
        const totalSections = Object.keys(dataControls.sectionControls)?.filter((id, i) => id && id !== 'undefined')?.length;
        setLoadingStatus('Loading sections...');

        const updates = await Object.keys(dataControls.sectionControls)
            .filter((id, i) => id && id !== 'undefined')
            .reduce(async (acc, section_id, i) => {
                const prev = await acc;
                let section = item.sections.filter(d => d.id === section_id)?.[0] || {}
                setLoadingStatus(`Updating section ${section?.title}  ${section?.element?.['element-type']}  ${i+1}/${totalSections}`)
                
                let data = parseJSON(section?.element?.['element-data']) || {}
                let type = section?.element?.['element-type'] || ''
                let comp = RegisteredComponents[type] || {}

                // here, identify if any sectionControls are in data.additionalControls and pass them as additionalcontrols.
                // this will let getData detect them as filters
                // do the same for generate pages script as well

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

                let additionalVariables = data.additionalVariables?.map(variable => {
                    // update the defaultValue here
                    const attrName = variable.name;
                    const sectionControlMappedName = dataControls?.sectionControls?.[section_id]?.[attrName];
                    variable.defaultValue = dataControls?.active_row?.[sectionControlMappedName]
                    return variable
                })

                let args = {...controlVars, ...updateVars, additionalVariables}
                const curr = comp?.getData ? await comp.getData(args, falcor).then(data => ({section_id, data})) : null
                return curr ? [...prev, curr] : prev
            }, Promise.resolve([]))

        // console.log('updates', updates)
        if (updates.length > 0) {
            let newSections = cloneDeep(item.sections)
            updates.forEach(({section_id, data}) => {
                let section = newSections.filter(d => d.id === section_id)?.[0] || {}
                section.element['element-data'] = JSON.stringify(data)
                //console.log('updating section', section_id, data.title)
            })
            updateAttribute('sections', newSections)
            saveItem(newSections)
        }

        setLoadingStatus(undefined)
    }

  

  const duplicateItem = () => {
    const highestIndex = dataItems
    .filter(d => !d.parent)
    .reduce((out,d) => {
      return Math.max(isNaN(d.index) ? -1 : d.index  , out)
    },-1)

    const newItem = cloneDeep(item)
    delete newItem.id
    newItem.title += ' Dup'
    newItem.index = highestIndex + 1
    newItem.url_slug = getUrlSlug(newItem, dataItems)
    newItem.sections.forEach(s => {
      delete s.ref
      delete s.id
    })
    
    submit(json2DmsForm(newItem), { method: "post", action: pathname })
  }



  const insertSubPage = async () => {
    const highestIndex = dataItems
    .filter(d => d.parent === item.id)
    .reduce((out,d) => {
      return Math.max(isNaN(d.index) ? 0 : d.index  , out)
    },0)

    //console.log(highestIndex, dataItems)
    const newItem = {
      title: 'New Page',
      parent: item.id,
      index: highestIndex + 1,
      published: 'draft',
      history: [{
        type:' created Page.',
        user: user.email, 
        time: new Date().toString()
      }]
    }
    newItem.url_slug = `${getUrlSlug(newItem,dataItems)}`

    submit(json2DmsForm(newItem), { method: "post", action: `${baseUrl}/edit/${newItem.url_slug}` })
  }
  
  const newPage = async () => {
    const highestIndex = dataItems
    .filter(d => !d.parent)
    .reduce((out,d) => {
      return Math.max(isNaN(d.index) ? 0 : d.index  , out)
    },0)

    //console.log(highestIndex, dataItems)
    const newItem = {
      title: 'New Page',
      parent: item.id,
      index: highestIndex + 1,
      published: 'draft',
      history: [{
        type:' created Page.',
        user: user.email, 
        time: new Date().toString()
      }]
    }
    newItem.url_slug = `${getUrlSlug(newItem,dataItems)}`

    submit(json2DmsForm(newItem), { method: "post", action: `${baseUrl}/edit/${newItem.url_slug}` })
  } 

  

  const getChildren = ({item, dataItems, children}) => {
    const currentChildren = dataItems.filter(di => di.parent === item.id);
    if(currentChildren.length){
      children.push(...currentChildren)
      currentChildren.forEach(child => getChildren({item: child, dataItems, children}))
    }
  }

  const movePages = async (type) => {
    const children = []
    getChildren({item, dataItems, children});

    [...children, item]
    .reduce(async (acc, currItem) => {
      await acc;
      const newItem = {id: currItem.id, type}
      submit(json2DmsForm(newItem, 'updateType'), { method: "post", action: `${baseUrl}/edit/` })

    }, Promise.resolve())
    setMoving(false);
    setType(item.type);
  }

  const toggleSidebar = async (type, value='') => {
    const newItem = cloneDeep(item)
    newItem[type] = value
   
    // console.log('item', newItem, value)
    let sectionType = pageType === 'template' ? 'sections' : 'draft_sections';
    if(type === 'header' && !newItem?.[sectionType]?.filter(d => d.is_header)?.[0]){
      //console.log('toggleHeader add header', newItem[sectionType])
      
      newItem[sectionType].unshift({
        is_header: true,
        element : {
          "element-type": "Header: Default Header",
          "element-data": {}
        }
      })
      //console.log('new item', newItem)
      updateAttribute('','',{
        header: value,
        [sectionType]: newItem[sectionType]
      })
    } else {
      updateAttribute(type, value)
    }
    submit(json2DmsForm(newItem), { method: "post", action: pathname })
  }

  const updateTitle = async ( value='') => {
    if(value !== item.title) {
      let history = item.history ? cloneDeep(item.history) : []
      let edit = {
        type: `changed page title to ${value}`,
        user: user.email, 
        time: new Date().toString()
      }
      history.push(edit)
      
      const newItem = {
        id: item.id,
        title:value,
        history
      }

      newItem.url_slug = getUrlSlug(newItem, dataItems)
      // console.log('create new item', newItem, baseUrl)
      updateAttribute('title', value)
      submit(json2DmsForm(newItem), { method: "post", action: `${baseUrl}/edit/${newItem.url_slug}` })
    }
  }

  const publish = async () => {
    let edit = {
      type: 'published changes.',
      user: user.email, 
      time: new Date().toString()
    }

    let history = item.history ? cloneDeep(item.history) : []
    history.push(edit)

    const newItem = {
      id: item.id,
      has_changes: false,
      published: '',
      history
    }
    let sectionsByDraftId = cloneDeep(item.sections || [])
      .reduce((o,s) => { 
        if(s.draft_id){
          o[s.draft_id] = s;
        }
        return o
      },{})

    newItem.sections = cloneDeep(item.draft_sections)
      .reduce((sections, draft) => {
        if(sectionsByDraftId[draft.id]) {
          draft.id = sectionsByDraftId[draft.id].id
        } else {
          delete draft.id
        }
        sections.push(draft)
        return sections
      },[])

    updateAttribute('','',{
      has_changes:false,
      published: '',
      history
    })

    submit(json2DmsForm(newItem), { method: "post", action: pathname })

  }

  const setDataControls = (v) => {
      if (!isEqual(item.data_controls, v)) {
          console.log('------setting data controls-------------')
          const newItem = cloneDeep(item)
          {
            id:item.id,
            newItem.data_controls = v
          }
          updateAttribute('data_controls',v)
          submit(json2DmsForm(newItem), {method: "post", action: pathname})
      } else {
          //console.log('equal', item.data_controls, dataControls)
      }
  }
  // console.log('nbool test', pageType === 'template', item?.data_controls?.id_column, pageType === 'template' && item?.data_controls?.id_column)
  // console.log('render', item?.data_controls)
  


  return (
    <>
      <EditPagesNav item={item} dataItems={dataItems}  edit={true} open={open} setOpen={setOpen}/>
      <EditHistory item={item}  historyOpen={historyOpen} setHistoryOpen={setHistoryOpen} />
      <TemplateDataControls
          item={item}
          open={showDataControls}
          setOpen={setShowDataControls}
          dataControls={item?.data_controls}
          setDataControls={setDataControls}
          loadingStatus={loadingStatus}
          setLoadingStatus={setLoadingStatus}
          baseUrl={baseUrl}
      />
        {edit &&
          <div className='p-4'>
            {pageType === 'page' && <div className='w-full flex justify-center pb-6'>
              <PublishButton item={item} onClick={publish} />
            </div>}
            <div className='pl-4 pb-2'>
              <span className='text-xs uppercase font-bold text-slate-400'> page name </span>
              <TitleEditComp
                value={item?.title}
                onChange={updateTitle}
              />
            </div>
            
            <div className='flex w-full h-12 px-4'>
              {pageType === 'page' && <IconPopover icon='fad fa-wrench p-2 text-blue-300 hover:text-blue-500 cursor-pointer text-lg' >
                <div className='py-2'>
                  <div className='px-6 font-medium text-sm'> Page Controls </div>
                  {/*(!item?.parent || item?.parent === '') &&
                      <div className={theme.pageControls.controlItem}>
                        <i className={'fa-solid fa-up-down-left-right text-sm'} />
                        <select
                            title={'Move Page'}
                            className={theme.pageControls.select}
                            value={type}
                            onChange={e => {
                              setMoving(true); // doesn't work yet
                              return movePages(e.target.value);
                            }}
                        >
                          <option key={'cms'} value={'docs-page'} className={theme.pageControls.selectOption}>Live</option>
                          <option key={'draft'} value={'docs-draft'} className={theme.pageControls.selectOption}>Draft</option>
                          <option key={'playground'} value={'docs-play'} className={theme.pageControls.selectOption}>Playground</option>
                        </select>
                      </div>
                  */}
                  <div onClick={insertSubPage}
                    className={theme.pageControls.controlItem}
                  >
                    {'☲ New Page'}
                  </div>
                  
                  <div onClick={insertSubPage}
                    className={theme.pageControls.controlItem}
                  >
                    {'☲ Insert Subpage'}
                  </div>
                  <div onClick={duplicateItem}
                    className={theme.pageControls.controlItem}
                  >
                    {'☳ Duplicate'}
                  </div>
                  <div onClick={() => setShowDelete(true)}
                    className={theme.pageControls.controlItem}
                  >
                    {'☵ Delete'}
                  </div>
                </div>
              </IconPopover>}
              <IconPopover icon='fad fa-sliders-h p-2 text-blue-300 hover:text-blue-500 cursor-pointer text-lg'>
                <div className='py-2'>
                  <div className='px-6 font-medium text-sm'> Page Settings </div>
                  <div className={theme.pageControls.controlItem } >
                    <SidebarSwitch
                      item={item}
                      type='sidebar'
                      toggleSidebar={toggleSidebar}
                    />
                    Show Sidebar
                    
                  </div>
                  <div className={theme.pageControls.controlItem } >
                    <SidebarSwitch
                      type='full_width'
                      item={item}
                      toggleSidebar={toggleSidebar}
                    />
                    Full Width
                  </div>
                  <div className={theme.pageControls.controlItem } >
                    <SidebarSwitch
                      type='hide_in_nav'
                      item={item}
                      toggleSidebar={toggleSidebar}
                    />
                    Hide In Nav
                  </div>
                  <div className={theme.pageControls.controlItem + ' pr-4' } >
                    
                    <ButtonSelector
                      label={'Header:'}
                      types={[{label: 'None', value: 'none'}, 
                          {label: 'Above', value: 'above'},
                          {label: 'Below', value: 'below'},
                          {label: 'In page', value: 'inpage'}
                        ]}
                      type={item.header}
                      setType={(e) => toggleSidebar('header',e)}
                    />
                    
                    
                  </div>
                  <div className={theme.pageControls.controlItem } >
                    <SidebarSwitch
                      type='footer'
                      item={item}
                      toggleSidebar={toggleSidebar}
                    />
                    Show Footer
                  </div>
                  
                </div>
              </IconPopover>
              {pageType === 'page' && <div 
                className='fad fa-file-alt p-2 text-blue-300 hover:text-blue-500 cursor-pointer text-lg' 
                onClick={() => setOpen(true)}
              />}
              {pageType === 'template' && <div 
                className='fad fa-sliders-h-square p-2 text-blue-300 hover:text-blue-500 cursor-pointer text-lg' 
                onClick={() => setShowDataControls(true)}
              />}
              <div 
                className='fad fa-history p-2 text-blue-300 hover:text-blue-500 cursor-pointer text-lg' 
                onClick={() => setHistoryOpen(true)}
              />

            </div>

            {pageType  === 'template' && <div className='pl-4 pb-2'>
              <span className='text-xs uppercase font-bold text-slate-400'> url prefix </span>
              <TitleEditComp
                value={item?.data_controls?.url}
                onChange={(value) => setDataControls({...item.data_controls, url:value})}
              />
            </div>}
            
            {(pageType === 'template' && item?.data_controls?.id_column) && <div>
                        <ViewInfo
                            item={item}
                            submit={submit}
                            onChange={(k, v) => {
                                let tmpDataControls;
                                console.log('test123', k,v)
                                if (k === 'id_column') {
                                    tmpDataControls = {...item?.data_controls, ...{id_column: v, active_row: {}}};
                                }
                                if (k === 'active_row') {
                                    tmpDataControls = {...item?.data_controls, ...v }
                                }

                                setDataControls(tmpDataControls);
                                loadUpdates(tmpDataControls);
                                
                            }}
                            loadingStatus={loadingStatus}
                            setLoadingStatus={setLoadingStatus}
                            baseUrl={baseUrl}
                        />
            </div>}
            <DeleteModal
                item={item}
                open={showDelete}
                setOpen={setShowDelete}
              />
            
          </div>
        }
        {/*<ToastContainer />*/}
    </>
  )
}

export default EditControls

function TitleEditComp({value, onChange}) {
  const [editing, setEditing] = React.useState(false)
  const [newTitle, setNewTitle] = React.useState(value || '')


  return (
    <div  className='flex justify-between group'>
      <div  className="flex-1">
        <dd className=" text-sm text-gray-900 ">
          {editing ?
            <div className='flex group focus:outline-none border-slate-300 border-b-2 group-focus:border-blue-500'>
              <input
                className='w-full px-2 py-1 text font-medium text-slate-500 focus:outline-none focus:border-blue-500'
                value={newTitle} 
                onChange={v => setNewTitle(v.target.value)}
              />
              <div className='flex cursor-pointer' >
                <span className=" pt-0.5 text-green-500 rounded hover:bg-green-500 hover:text-white " onClick={e => { 
                    
                    onChange(newTitle);
                    setEditing(false);
                  }} >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                </span>
                  
                <span className="pt-0.5 text-slate-300  rounded  hover:text-red-300 " onClick={e =>  setEditing(false)}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                </span>

              </div>
            </div> :
            <div className='w-full min-h-[30px] flex flex-row px-2 py-1 text font-medium text-slate-500 focus:outline-none border-slate-300 border-b-2 focus:border-blue-500'>
              <div className='w-full'>{value}</div>
              <span className='hidden group-hover:block text-blue-300 hover:text-blue-500 cursor-pointer ' onClick={e => editing ? setEditing(false): setEditing(true)}>
                  <i className="fad fa-pencil absolute -ml-4 -mt-0.5 p-1.5 rounded hover:bg-blue-500 hover:text-white"/>
                  {/*<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 24" stroke-width="1.5" stroke="currentColor" className="w-5 h-5 ">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                  </svg>*/}

              </span>
            </div>
          }
        </dd>
      </div> 
     
    </div>
  )
}

function PublishButton({item, onClick}) {

  const hasChanges = item.published === 'draft' || item.has_changes

  return (
    <div 
      onClick={() => hasChanges ? onClick() : null}
      className={`${ hasChanges ? 
        'inline-flex w-36 justify-center rounded-lg cursor-pointer text-sm font-semibold py-2 px-2 bg-blue-600 text-white hover:bg-blue-500 shadow-lg border border-b-4 border-blue-800 hover:border-blue-700 active:border-b-2 active:mb-[2px] active:shadow-none':
        'inline-flex w-36 justify-center rounded-lg cursor-not-allowed text-sm font-semibold py-2 px-2 bg-slate-300 text-white shadow border border-slate-400 border-b-4'
      }`}
    >
      <span className='flex items-center'>
        <span className='pr-2'>{hasChanges ? `Publish` : `No Changes`}</span>
        {hasChanges ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg> : ''}

      </span>
    </div>
  )
}

function IconPopover({icon,children}) {
  let [referenceElement, setReferenceElement] = useState()
  let [popperElement, setPopperElement] = useState()
  let { styles, attributes:popperAttributes } = usePopper(referenceElement, popperElement)

   return (
    <Popover className="relative">
        <Popover.Button
            ref={setReferenceElement}
            className={'text-md cursor-pointer hover:text-blue-800 text-blue-500'}>
            <i className={icon} title="Help"/>
        </Popover.Button>
        <Transition
            as={Fragment}
            enter="transition ease-out duration-200"
            enterFrom="opacity-0 translate-y-1"
            enterTo="opacity-100 translate-y-0"
            leave="transition ease-in duration-150"
            leaveFrom="opacity-100 translate-y-0"
            leaveTo="opacity-0 translate-y-1"
        >
            <Popover.Panel 
                ref={setPopperElement}
                style={styles.popper}
                {...popperAttributes.popper}
                className="shadow-lg bg-white rounded z-10 transform  border border-blue-200 w-[180px] ">
                
                {children}
          </Popover.Panel>
        </Transition>
    </Popover>)
}

export function SidebarSwitch({type,item,toggleSidebar}) {
  let enabled = item[type] === 'show'
  return (
    <Switch
      checked={enabled}
      onChange={(e) => toggleSidebar(type,enabled ? '' : 'show')}
      className="group relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2"
    >
      <span className="sr-only">Use setting</span>
      <span aria-hidden="true" className="pointer-events-none absolute h-full w-full rounded-md bg-white" />
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

export function DeleteModal ({item, open, setOpen})  {
  const cancelButtonRef = useRef(null)
  const submit = useSubmit()
  const { baseUrl } = React.useContext(CMSContext)
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
            await submit(json2DmsForm(item,'delete'), { method: "post", action: `${baseUrl}/edit/`})
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
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto" >
          <div 
            onClick={() =>  {setOpen(false);}} 
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
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                {children}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}

