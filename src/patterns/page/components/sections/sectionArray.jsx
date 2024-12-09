import React, { Fragment, useState, useLayoutEffect, useRef } from "react"
import { useLocation } from 'react-router-dom';
import { isEqual, cloneDeep } from "lodash-es"
import { Popover, Transition, Combobox } from '@headlessui/react'
import { Link } from "react-router-dom";
import { usePopper } from 'react-popper'
import { CMSContext } from '../../siteConfig'
import { getSizeClass, sizeOptionsSVG } from './sizes'
import {
    SquarePlus,
    InfoCircle,
    TrashCan,
    RemoveCircle,
    CancelCircle,
    FloppyDisk,
    CirclePlusDot,
    PencilSquare,
    ArrowDownSquare,
    ArrowUpSquare,
    ChevronDownSquare,
    ChevronUpSquare,
    InfoSquare,
    MoreSquare,
    Tags,
    Copy, Download, Printer, PDF
} from '../../ui/icons'
import {DeleteModal} from "../../ui";

const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

function SizeSelect ({size='1', setSize, onChange}) {
    
    return (
        <div
          className="flex space-x-1 rounded-lg bg-blue-50 p-0.5"
          role="tablist"
          aria-orientation="horizontal"
        >        
        {sizeOptionsSVG.map((s,i) => (
            <button
                key={i}
                className={
                    s.name === size ?
                    "flex items-center rounded-md py-[0.4375rem] pl-2 pr-2 text-sm font-semibold lg:pr-3 bg-white shadow" :
                    "flex items-center rounded-md py-[0.4375rem] pl-2 pr-2 text-sm font-semibold lg:pr-3 hover:text-blue-500"
                }
                id="headlessui-tabs-tab-3"
                role="tab"
                type="button"
                tabIndex={-1}
                onClick={() => {
                    onChange(s.name) 
                }}
              >
                
                {s.icon}
              </button>
        ))}
        </div>
    )
} 

const RenderError = ({data}) => (
    <div className={'p-2 rounded-md bg-red-300 border-red-500 text-white min-h-[50px]'}>
        Error: {data?.status}
    </div>)

function TagComponent ({value, placeholder, onChange, edit=false}) {
    const arrayValue = Array.isArray(value) ? value :  (value?.split(',')?.filter(v => v?.length) || [])
    const [newTag, setNewTag] = useState('');
    console.log('hola', value, arrayValue)

    const tags = [
        'Hazard',
        'Hurricane',
        'Avalanche',
        'Earthquake',
        'Rec',
        "S1","S1-a","S2","S2-a","S2-a1","S2-a2","S2-a3","S2-a4","S2-a5","S2-a6","S2-a7","S2-a8","S2-a9","S3","S3-a","S3-a1","S3-a2","S3-a3","S3-b2","S4","S4-a","S4-b","S5","S5-a","S5-b","S5-1","S6","S6-a","S6-a1","S6-a2","S6-a2.i","S6-a2.ii","S6-a2.iii","S6-b","S7","S7-a","S7-a1","S7-a2","S7-a3","S7-a4","S8","S8-1","S8-a","S8-a1","S8-a2","S8-a2.i","S8-a3","S8-a3.i","S8-a3.ii","S8-a3.iii","S8-a3.iv","S8-a3.v","S8-a4","S8-b","S8-b1","S8-b2","S8-b3","S8-c","S8-c1","S8-c2","S9","S9-a","S9-b","S10","S10-a","S10-b","S10-c","S10-d","S11","S11-a","S11-b","S12","S12-a","S12-b","S13","S13-a","S13-b","S13-b1","S13-b2","S14","S14-a","S14-a1","S14-a2","S14-a3","S14-b","S14-b1","S14-b2","S15","S15-a","S15-a1","S15-a2","S15-a3","S16","S16-a","S16-b","S17","S17-1","S17-1a","S17-1b","S18","S18-a","S18-b","S18-b1","S18-b2","S18-b3","S18-c","S19","S19-a","S19-1","S20","S20-a","S20-b","HHPD1","HHPD1-1","HHPD1-a","HHPD1-b","HHPD1-b1","HHPD1-b2","HHPD1-2","HHPD2","HHPD2-1","HHPD2-a","HHPD2-b","HHPD2-b1","HHPD2-b2","HHPD2-b3","HHPD2-b4","HHPD2-c","HHPD3","HHPD3-1","HHPD3-a","HHPD3-a1","HHPD3-a2","HHPD3-a3","HHPD3-a4","HHPD3-b","HHPD4","HPPD4-1","HPPD4-a","HPPD4-a1","HPPD4-a2","HPPD4-a3","HPPD4-a4","HPPD4-a5","HHPD4-b","HHPD4-c","HHPD5","HHPD5-a","HHPD6","HHPD6-1","HHPD6-a","HHPD6-b","HHPD6-c","HHPD7","HHPD7-1","HHPD7-a","HHPD7-b","FMAG1","FMAG1-a","FMAG1-b","FMAG1-c","FMAG1-d","FMAG2","FMAG2-a"
    ]

    return (
        <div className='w-full border border-blue-200'>
            {edit && <Combobox>
                <div className="relative z-20">
                    <Combobox.Input
                        className="h-12 w-[189px] bg-blue-50 m-1 p-2 text-gray-900 placeholder:text-gray-400 focus:ring-0 sm:text-sm"
                        placeholder={placeholder}
                        value={newTag}
                        onChange={(e) => {setNewTag( e.target.value) }}
                        
                        onKeyUp={(e => {
                            if(e.key === 'Enter' && newTag.length > 0) {
                              onChange([...arrayValue,newTag].join(','))
                              setNewTag('')
                            }
                        })}
                    />
                </div>
                {tags
                    .filter(tag => (!newTag?.length || tag.toLowerCase().includes(newTag.toLowerCase())))
                    .length ? (
                        <Combobox.Options 
                            static
                            className="max-h-96 transform-gpu scroll-py-3 overflow-y-auto p-3"
                        >
                            
                            {tags
                                .filter(tag => (newTag.length > 0 && tag.toLowerCase().includes(newTag.toLowerCase())))
                                .filter((tag, i) => i <= 5)
                                .map((tag) => (
                                    <Combobox.Option
                                        key={tag}
                                        value={tag}
                                        onClick={() => {
                                            setNewTag(tag)
                                            
                                            
                                        }}
                                        className={({active}) => `flex cursor-pointer select-none rounded-xl p-1 ${active && 'bg-gray-100'}`}
                                    >
                                        {({active}) => (
                                            <div>
                                                <i className="text-sm text-blue-400 fa fa-tag" />
                                                <span
                                                    className={`ml-2 text-sm font-medium ${active ? 'text-gray-900' : 'text-gray-700'}`}
                                                >
                                                    {tag}
                                                </span>
                                            </div>
                                        )}
                                    </Combobox.Option>
                                ))}
                        </Combobox.Options>
                    ) : null
                }
            </Combobox>}
            <div className='w-full min-h-8 border-blue-200'>
            {
                arrayValue
                    .sort((a,b) => a.localeCompare(b))
                    .map((d,i) => (
                    <div key={i} className='px-2 py-1 text-sm border border-blue-200 m-1 rounded bg-blue-100 flex justify-between items-center'>
                        <div className='text-slate-600'>{d}</div>
                        {edit ? <div className='cursor-pointer' onClick={() => onChange(arrayValue.filter(v => v !== d ).join(','))}>
                            <RemoveCircle className='text-red-400 hover:text-red-600  w-[16px] h-[16px]'/>
                        </div> : null}
                    </div>
                ))
            }
            </div>
        </div>
    )

}

const handlePaste = async (e, setKey, value, onChange, ) => {
    e.preventDefault();
    try{
        const text = await navigator.clipboard.readText();
        const copiedValue = isJson(text) && JSON.parse(text || '{}');

        if(!copiedValue || !copiedValue['element']?.['element-type']) return;
        setKey(copiedValue['element']['element-type']) // mainly for lexical so it updates with value
        const pastedValue = {}

        Object.keys(copiedValue)
            .filter(key => !['id', 'ref'].includes(key))
            .map(key => {
                pastedValue[key] = copiedValue[key]
            })

        onChange({...value, ...pastedValue});
    }catch (e) {
        console.error('<paste>', e)
    }
}

function SectionEdit ({value, i, onChange, attributes, size, onCancel, onSave, onRemove, siteType, apiLoad, apiUpdate, format}) {
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    let sectionTitleCondition = value?.['title'] 
    let {theme} = React.useContext(CMSContext) || {}

    const updateAttribute = (k, v) => {
        if(!isEqual(value, {...value, [k]: v})) {
            onChange({...value, [k]: v})
        }
    }

    let TitleComp = attributes?.title?.EditComp
    let LevelComp = attributes?.level?.EditComp
    let TagsComp = attributes?.tags?.EditComp
    let ElementComp = attributes?.element?.EditComp
    let HelpComp = attributes?.helpText?.EditComp
    // console.log('props in sectionEdit', siteType)
    return (
        <div className={``}>
            {/* -------------------top line buttons ----------------------*/}
            <div className={`flex w-full`}>
                <div className='flex-1'/>
                    <div className={`z-10 relative`}>
                        <div className={`absolute mr-16 top-[-14px] right-[-60px] flex`}>
                            {/*delete*/}
                            <button className={'flex items-center text-md cursor-pointer pr-1'}
                                    onClick={() => setShowDeleteModal(!showDeleteModal)}
                            >
                                {/*<i className="fa-light fa-angle-down text-xl fa-fw" title="Move Down"/>*/}
                                <TrashCan className='text-red-400 hover:text-red-600 w-[24px] h-[24px]'
                                          title="Move Down"/>
                            </button>
                            <DeleteModal
                                title={`Delete Section ${value?.title || ''} ${value?.id}`} open={showDeleteModal}
                                prompt={`Are you sure you want to delete this section? All of the section data will be permanently removed
                                            from our servers forever. This action cannot be undone.`}
                                setOpen={(v) => setShowDeleteModal(v)}
                                onDelete={() => {
                                    async function deleteItem() {
                                        await onRemove()
                                        setShowDeleteModal(false)
                                    }

                                    deleteItem()
                                }}
                            />
                            {/*help text*/}
                            <Popover className="relative">
                                <Popover.Button className={'flex items-center cursor-pointer pt-1 pr-1'}>
                                    <InfoSquare className='text-blue-400 hover:text-blue-600  w-[24px] h-[24px]'
                                                title="Help Text"/>
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
                                        anchor="bottom"
                                        className="absolute shadow-lg bg-white z-10 w-screen max-w-sm transform px-4 border border-blue-200 lg:max-w-lg">

                                        <HelpComp
                                            value={value?.['helpText']}
                                            onChange={(v) => updateAttribute('helpText', v)}
                                        />
                                    </Popover.Panel>
                                </Transition>
                            </Popover>
                            {/*tags*/}
                            <Popover className="relative">
                                <Popover.Button className={'flex items-center cursor-pointer pt-1 pr-1'}>
                                    <Tags className='text-blue-400 hover:text-blue-600  w-[24px] h-[24px]'
                                          title="Tags"/>
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
                                        anchor="bottom"
                                        className="absolute -left-[100px] shadow-lg bg-white z-10 w-[200px] transform border border-blue-200 ">

                                        <TagComponent
                                            edit={true}
                                            className='p-2 flex-0'
                                            value={value?.['tags']}
                                            placeholder={'Add Tag...'}
                                            onChange={(v) => updateAttribute('tags', v)}
                                        />
                                    </Popover.Panel>
                                </Transition>
                            </Popover>
                            {/*save*/}
                            <button className={'text-lg cursor-pointer hover:text-blue-500 text-slate-400 pr-1'}
                                    onClick={onSave}>
                                <FloppyDisk className='text-slate-400 hover:text-blue-500 w-[24px] h-[24px]'/>
                            </button>
                            {/*cancel*/}
                            <button
                                className={' flex items-center text-md cursor-pointer  py-1 pr-1 text-slate-400'}
                                onClick={onCancel}
                            >
                                {/*<i className="fa-light fa-pencil text-xl fa-fw" title="Edit"></i>*/}
                                <CancelCircle className='text-slate-400 hover:text-red-500 w-[24px] h-[24px]'/>

                            </button>
                            {/*section details*/}
                            <Popover className="relative">
                                <Popover.Button className={'flex items-center cursor-pointer pt-1 pr-1'}>
                                    <MoreSquare className='text-blue-400 hover:text-blue-600  w-[24px] h-[24px]'
                                                title="section details"/>
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
                                        anchor="bottom"
                                        className="fixed right-0 lg:absolute lg:left-[35px] lg:top-[14px] shadow bg-blue-50 z-10 w-[280px] min-h-[250px] z-40 rounded border border-blue-300 transform px-4">

                                        <div className='flex flex-col'>
                                            <div className='flex-0 grow'>
                                                <TitleComp //todo make it blue if H!
                                                    className={`${theme?.heading?.base} ${theme?.heading[value?.['level']] || theme?.heading['default']}`}
                                                    placeholder={'Section Title'}
                                                    value={value?.['title']}
                                                    onChange={(v) => updateAttribute('title', v)}
                                                />
                                            </div>
                                            <div>
                                                <LevelComp
                                                    className='p-2 w-full bg-transparent'
                                                    value={value?.['level']}
                                                    placeholder={'level'}
                                                    options={attributes.level.options}
                                                    onChange={(v) => updateAttribute('level', v)}
                                                />
                                            </div>
                                            <div className={'self-center pl-2'}>
                                                <SizeSelect
                                                    size={value?.['size']}
                                                    onChange={v => updateAttribute('size', v)}
                                                />
                                            </div>
                                        </div>
                                    </Popover.Panel>
                                </Transition>
                            </Popover>
                        </div>
                    </div>
            </div>
            {sectionTitleCondition && (
                <div className='flex h-[50px]'>
                    <div className='flex'>
                        <TitleComp //todo make it blue if H!
                            className={`p-2 w-full font-sans font-medium text-md  ${
                                (value?.['level']) === '1' ?
                                    `text-blue-500 font-bold text-xl tracking-wider py-1 pl-1` :
                                    value?.['level'] === '2' ?
                                        `text-lg tracking-wider` :
                                        value?.['level'] === '3' ?
                                            `text-md tracking-wide` :
                                            ``}`}
                            placeholder={'Section Title'}
                            value={value?.['title']}

                            onChange={(v) => updateAttribute('title', v)}
                        />
                    </div>
                </div>
            )}
            <div className={''}>
                <ElementComp
                    value={value?.['element']}
                    onChange={(v) => updateAttribute('element', v)}
                    handlePaste={(e, setKey) => handlePaste(e, setKey, value, onChange)}
                    size={size}
                    siteType={siteType}
                    apiLoad={apiLoad}
                    apiUpdate={apiUpdate}
                    pageFormat={format}
                />
            </div>
        </div>
    )
}

function SectionView ({value,i, attributes, edit, onEdit, moveItem, addAbove, siteType, apiLoad, apiUpdate, format}) {
    let [referenceElement, setReferenceElement] = useState()
    let [popperElement, setPopperElement] = useState()
    let { styles, attributes:popperAttributes } = usePopper(referenceElement, popperElement)
    const { baseUrl, user, theme } = React.useContext(CMSContext) || {}
    
    const hideDebug = true
    let TitleComp = attributes?.title?.ViewComp
    let TagsComp = attributes?.tags?.ViewComp 
    let ElementComp = attributes?.element?.ViewComp
    let HelpComp = attributes?.helpText?.ViewComp
    let sectionTitleCondition = value?.['title']  //|| value?.['tags'] ;// edit
    let helpTextCondition = value?.['helpText'] && !(
        (value?.['helpText']?.root?.children?.length === 1 && value?.['helpText']?.root?.children?.[0]?.children?.length === 0) || // empty child
        (value?.['helpText']?.root?.children?.length === 0) // no children
    )
    let interactCondition = false //typeof onEdit !== 'function' && value?.element?.['element-type']?.includes('Map:');
    let isTemplateSectionCondition = false//value?.element?.['template-section-id'];
    let showEditIcons = edit && typeof onEdit === 'function' && !isTemplateSectionCondition

    const element = React.useMemo(() => {
        return <ElementComp value={value?.['element']} siteType={siteType} apiLoad={apiLoad} apiUpdate={apiUpdate} pageFormat={format}/>
    }, 
    [value])
    if(!value?.element?.['element-type'] && !value?.element?.['element-data']) return null;
        
    return (
        <div className={`h-full ${hideDebug ? '' : ''}`} style={{pageBreakInside: "avoid"}}>
            {/* -------------------top line buttons ----------------------*/}
            <div className={`flex w-full ${hideDebug ? '' : ''}`}>
                <div className='flex-1'/>
                    
                    {value?.is_header && edit ?  <div className={`z-10 relative ${hideDebug ? '': ''}`}>
                        <div className={`absolute mr-16 right-[-60px] flex`}>
                            <button
                                className={' flex items-center text-md cursor-pointer hover:text-blue-500 text-slate-400'}
                                onClick={ onEdit }
                            >
                                {/*<i className="fa-light fa-pencil text-xl fa-fw" title="Edit"></i>*/}
                                <PencilSquare className='text-slate-400 hover:text-blue-500'/>
                               
                            </button>
                        </div>
                    </div>
                    :
                    <div className={`z-10 relative`}>
                        <div className={`absolute mr-16 top-[-14px] right-[-60px] flex items-center h-[32px]`}> 
                            {value?.['tags']?.length ? <Popover className="pr-1 h-[24px] z-20">
                                <Popover.Button  className={'flex items-center cursor-pointer'} >
                                    <Tags  className='text-slate-400 hover:text-blue-500 w-[24px] h-[24px]' title="Move Up"/>
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
                                        anchor="bottom"
                                        className="absolute -left-[174px] shadow-lg bg-white z-30 w-[200px] transform border border-blue-200 ">
                                        <TagComponent
                                            
                                            className='p-2 flex-0'
                                            value={value?.['tags']}
                                            placeholder={'Add Tag...'} 
                                            onChange={(v) => updateAttribute('tags', v)}
                                        />
                                  </Popover.Panel>
                                </Transition>
                            </Popover> : null}
                                    
                            {helpTextCondition && <Popover className="relative pr-1 h-[24px]">
                                <Popover.Button
                                    
                                    className={' cursor-pointer '}>
                                    {/*<i className="fa fa-circle-info text-2xl fa-fw" title="Help"/>*/}
                                    <InfoSquare className='text-blue-400 hover:text-blue-500 w-[24px] h-[24px]' title="Move Up"/>
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
                                        
                                        
                                        className="absolute shadow bg-white z-10 w-screen max-w-sm transform px-4 border border-blue-200 lg:max-w-lg">
                                        
                                            <HelpComp
                                                value={value?.['helpText']}
                                            />
                                        


                                    </Popover.Panel>
                                </Transition>
                            </Popover>}
                            {showEditIcons && (
                                <>
                                    <button 
                                        className={'flex items-center text-md cursor-pointer hover:text-blue-500 text-slate-400 pr-1'}
                                        onClick={ () => moveItem(i,-1) }
                                    >
                                        {/*<i className="fa-light fa-angle-up text-xl fa-fw"  />*/}
                                        <ChevronUpSquare className='text-slate-400 hover:text-blue-500 w-[24px] h-[24px]' title="Move Up"/>
                                       
                                    </button>
                                    <button className={'flex items-center text-md cursor-pointer hover:text-blue-500 text-slate-400 pr-1'}
                                        onClick={ () =>  moveItem(i,1) }
                                    >
                                        {/*<i className="fa-light fa-angle-down text-xl fa-fw" title="Move Down"/>*/}
                                        <ChevronDownSquare className='text-slate-400 hover:text-blue-500 w-[24px] h-[24px]' title="Move Down"/>
                                    </button>
                               
                                    <button
                                        className={' flex items-center text-md cursor-pointer hover:text-blue-500 py-1 pr-1 text-slate-400'}
                                        onClick={() => navigator.clipboard.writeText(JSON.stringify(value))}
                                    >
                                        {/*<i className="fa-light fa-pencil text-xl fa-fw" title="Edit"></i>*/}
                                        <Copy title={'Copy Section'} className='text-slate-400 hover:text-blue-500 w-[24px] h-[24px]'/>
                                       
                                    </button>

                                    <button
                                        className={' flex items-center text-md cursor-pointer hover:text-blue-500 py-1 pr-1 text-slate-400'}
                                        onClick={ onEdit }
                                    >
                                        {/*<i className="fa-light fa-pencil text-xl fa-fw" title="Edit"></i>*/}
                                        <PencilSquare className='text-slate-400 hover:text-blue-500 w-[24px] h-[24px]'/>

                                    </button>
                                    <button className={'text-lg cursor-pointer hover:text-blue-500 text-slate-400 pr-3'} onClick={addAbove}> 
                                        <SquarePlus className='text-slate-400 hover:text-blue-500 w-[24px] h-[24px]'/>
                                    </button>
                                </>
                            )}
                                
                            
                    
                         
                        </div>
                    </div>
                    }
                   
                </div>
                {/* -------------------END top line buttons ----------------------*/}
                {/* -------------------Section Header ----------------------*/}
                {
                    (sectionTitleCondition || interactCondition) &&
                    <div className={`flex w-full h-[50px] items-center ${(value?.['level']) === '1' ? `border-b` : ``} ${hideDebug ? '' : 'border border-dashed border-pink-500'}`}>

                        <div id={`#${value?.title?.replace(/ /g, '_')}`}
                             className={`flex-1 flex-row py-2  font-display font-medium uppercase scroll-mt-36 ${sectionTitleCondition ? '' : 'invisible'}`}>
                            <TitleComp
                                className={`w-full ${theme.heading[value?.['level']] || theme.heading['default']}`}
                                value={value?.['title']}
                            />
                        </div>


                        {
                            value?.element?.['element-type']?.includes('Map:') &&
                            <Link
                                className={`${interactCondition ? 'pl-6 py-0.5 text-md cursor-pointer hover:text-blue-500 text-slate-400' : 'hidden'}`}
                                to={`/interact/${value?.id}`}
                                title={'interact'}>
                                <i className={'fa-light fa-window-restore'}/>
                            </Link>
                        }

                        { sectionTitleCondition && typeof onEdit === 'function' && !isTemplateSectionCondition ?
                            <>
                                {/*<div className='py-2'>
                                    <button
                                        className={'pl-3 flex items-center text-md cursor-pointer hover:text-blue-500 text-slate-400'}
                                        onClick={ () => moveItem(i,-1) }
                                    >
                                        <i className="fa-light fa-angle-up text-xl fa-fw" title="Move Up"></i>
                                        {
                                    </button>

                                </div>
                                <div className='py-2'>
                                    <button
                                        className={'pl-3  flex items-center text-md cursor-pointer hover:text-blue-500 text-slate-400'}
                                        onClick={ () =>  moveItem(i,1) }
                                    >
                                        <i className="fa-light fa-angle-down text-xl fa-fw" title="Move Down"></i>
                                       

                                </div>
                                <div className='py-2'>
                                    <button
                                        className={'pl-6 py-0.5 flex items-center text-md cursor-pointer hover:text-blue-500 text-slate-400'}
                                        onClick={ onEdit }
                                    >
                                        <i className="fa-light fa-pencil text-xl fa-fw" title="Edit"></i>
                                        
                                    </button>

                                </div>*/}
                            </> :
                            isTemplateSectionCondition && typeof onEdit === 'function'?
                                <i className={'pl-5 py-0.5 fa-light fa-lock p-2 text-slate-400'} title={'Template generated section'}/> : <></>
                        }
                    </div>

                }
            {/* -------------------END Section Header ----------------------*/}
            <div className={`h-full ${hideDebug ? '' : 'border border-dashed border-orange-500'}`}>
                {element}
            </div>
        </div>
    )
}  

// const SectionViewMemo = React.memo(SectionView,
//     (prev, next) => {
//         //console.log('svm', prev.value.id, prev.i, isEqual(prev.value, next.value))
//         return isEqual(prev.value, next.value)
// })


const AddSectionButton = ({onClick, showpageToggle}) => {
    let item = {}
    let baseUrl = ''
    return (
        <div className='flex w-full'>
            <div className='flex-1'/>
            <div className={`z-10 relative ${showpageToggle ? 'w-12' : 'w-8'}`}>
                <div className='absolute right-[14px] top-[-9px] flex'> 
                    <button 
                        className={'cursor-pointer pr-0.5'}
                        onClick={onClick}
                    > 
                    {/*<i className="fal fa-circle-plus text-lg fa-fw" title="Add Section"></i>*/}
                    <SquarePlus className='w-[24px] h-[24px] hover:text-blue-500 text-slate-400'/>
                    {/*☷ Add Section*/}
                    </button>
                    {/*showpageToggle ?  
                      <Link to={`${baseUrl}/${item.url_slug}`}>
                        <i className='fad fa-eye fa-fw flex-shrink-0 text-lg text-slate-400 hover:text-blue-500'/>
                      </Link> : ''    
                    */}
                </div>
            </div>
        </div>
    )
}

const ScrollToHashElement = () => {
    const location = useLocation();

    useLayoutEffect(() => {
        const { hash } = location;
        const removeHashCharacter = (str) => {
            const result = str.slice(1);
            return +result;
        };

        if (hash) {
            const element = document.getElementById(removeHashCharacter(hash));
            if (element) {
                let position = element.getBoundingClientRect();
                setTimeout(function () {
                    window.scrollTo(position.x, position.y - 170);
                    // element.scrollIntoView({
                    //     behavior: "smooth",
                    //     block: "center",
                    // });
                }, 100);
            }
        }
    }, [location]);

    return null;
};

const Edit = ({Component, value, onChange, attr, full_width = false, siteType, apiLoad, apiUpdate, format, ...rest }) => {
    // console.log('.............', rest, attr, value)
    // console.log('---------------sa edit render-----------------')
    // console.log('sa edit sections', value)
    // const [values, setValues] = React.useState([...value , ''] || [''])
    const [values, setValues] = useState([]);
    React.useEffect(() => {
        if (!value || !value.map) {
            setValues([''])
        }else{
            !isEqual(value, [...value, '']) && setValues([...value,''])
        }
    }, [value]);

    const [edit, setEdit] = React.useState({
        index: -1,
        value: '',
        type: 'new'
    })

    const setEditValue = (v) => setEdit({...edit, value: v})
    const setEditIndex = (i) => setEdit({...edit, index: i})
    
    const cancel = () => {
       setEdit({index: -1, value:'',type:'new'}) 
    }

    const save = /* async */ () => {
        let cloneValue = cloneDeep(value || [])
        //console.log('save stuff', value, cloneValue)
        
        let action = ''
        // edit.value.has_changes = true
        if(edit.type === 'update') {
            cloneValue[edit.index] = edit.value

            action = `edited section ${edit?.value?.title ? `${edit?.value?.title} ${edit.index+1}` : edit.index+1}`
        } else {
            cloneValue.splice(edit.index, 0, edit.value)
            action = `added section ${edit?.value?.title ? `${edit?.value?.title} ${edit.index+1}` : edit.index+1}`
        }
        //console.log('edit on save', edit)
        
        cancel()
        setValues([...cloneValue, ''])
        /* await */ onChange(cloneValue,action)
    
    }

    const remove = () => {
        let cloneValue = cloneDeep(value)
        
        if(edit.type === 'update') {
            cloneValue.splice(edit.index, 1)
        }
        // console.log('value', value, cloneValue)
        // console.log('edit on remove', edit)
        cancel()
        onChange(cloneValue, `removed section ${edit?.value?.title ? `${edit?.value?.title} ${edit.index+1}` : edit.index+1}`)
    }

    const update = (i) => {
        setEdit({index: i, value:value[i],type:'update'})
    }

    function moveItem(from, dir) {
        let cloneValue = cloneDeep(value)
        // remove `from` item and store it
        let to = from + dir
        
        if(to < 0 || to >= cloneValue.length){
            return
        }
        var f = cloneValue.splice(from, 1)[0];
        // insert stored item into position `to`
        cloneValue.splice(to, 0, f);
        onChange(cloneValue)
    }
    let runningColTotal = 8;
    const hideDebug = true
    
    // each component should have md and lg col-start- class
    // 1 row can fit different components totaling in size 1 OR one component with size 1 or 2
    // col-start for md and lg depends upon previous components from the same row
    // every time component size total reaches 1, row changes


    const layouts = {
        centered: 'md:grid-cols-[1fr_repeat(6,_minmax(_100px,_170px))_1fr]',
        fullwidth:'md:grid-cols-[_minmax(_0px,0px)_repeat(6,_1fr)_minmax(_0px,0px)]'
    }

    
    return (
        <div className={`w-full grid grid-cols-6 ${layouts[full_width === 'show' ? 'fullwidth' : 'centered']} gap-1`}>
            <ScrollToHashElement />
            {values.map((v,i) => {
                //console.log()
                const size = (edit.index === i ? edit?.value?.size : v?.size) || "1";
                const requiredSpace = sizeOptionsSVG.find(s => s.name === size)?.value;
                const availableSpace = 6 - runningColTotal;

                if(runningColTotal === 0){
                    runningColTotal = requiredSpace
                }else if(requiredSpace <= availableSpace){
                    runningColTotal += requiredSpace
                }else{
                    runningColTotal = requiredSpace
                }

                const sizeClass = getSizeClass(size, requiredSpace, availableSpace, runningColTotal);

                // console.log('section', v, v.error)
                return (
                    <div
                        key={i}
                        id={`${v?.id}`}
                        className={`${v?.size ? "h-full" : ""} ${sizeClass} ${hideDebug ? '' : 'border border-green-500'}`}>
                        {/* add to top */}
                        { /*edit.index === -1 && i === 0 ? 
                            <AddSectionButton showpageToggle={true} onClick={() => setEditIndex(0)}/> : 
                                edit.index === -1 || i > 0 ? '' : <div className='' />
                        */ }

                        {/* edit new or existing section */}
                        {edit.index === i 
                            ? <SectionEdit 
                                value={edit.value} 
                                onChange={setEditValue}
                                onSave={save}
                                onCancel={cancel}
                                onRemove={remove}
                                attributes={attr.attributes}
                                size={size}
                                i={i}
                                siteType={siteType}
                                apiLoad={apiLoad}
                                apiUpdate={apiUpdate}
                                format={format}
                            />
                            : ''
                        }
                        
                        {/* show section if not being edited */}
                        { v !== '' && !(edit.index === i && edit.type === 'update') && (!v?.status || v?.status === 'success') ?
                            <SectionView
                                value={v} 
                                i={i}
                                moveItem={moveItem}
                                attributes={attr.attributes}
                                edit={true}
                                onEdit={ edit.index === -1 ? (e) => update(i)  : null }
                                addAbove={() => setEditIndex(i)}
                                siteType={siteType}
                                apiLoad={apiLoad}
                                apiUpdate={apiUpdate}
                                format={format}
                            /> : v?.status?.length > 1 ? <RenderError data={v} /> : ''}

                        {/* add new section at end  */}
                        { !values[0]?.is_header && edit.index == -1 && i === values.length-1 ? 
                            <div className=''>
                                <AddSectionButton onClick={() => setEditIndex(i)}/> 
                            </div>  : <div className='' />
                        }
                    </div>
                )
            })
        }
        </div>
    )
}

const View = ({Component, value, attr, full_width, siteType, apiLoad, apiUpdate, format}) => {
    if (!value || !value.map) { return '' }
    const { baseUrl, user, theme } = React.useContext(CMSContext) || {}

    let runningColTotal = 8;
    let layouts = {
        centered: 'md:grid-cols-[1fr_repeat(6,_minmax(_100px,_170px))_1fr]',
        fullwidth:'md:grid-cols-[_minmax(_0px,0px)_repeat(6,_1fr)_minmax(_0px,0px)]'
    }
    const hideSectionCondition = section => {
        //console.log('hideSectionCondition', section?.element?.['element-data'] || '{}')
        let value = section?.element?.['element-data']
        let elementData = typeof value === 'object' ?
            value : value && isJson(value) ? JSON.parse(value) : {}
        return !elementData?.hideSection
    }


    // console.log('props in sectionArray.view', siteType)

    return (
        <div className={`w-full grid grid-cols-6 ${layouts[full_width === 'show' ? 'fullwidth' : 'centered']} gap-1`}>
            {
                value.filter(v => hideSectionCondition(v))
                    .map((v, i) => {
                        const size = v?.size || "1";
                        const requiredSpace = sizeOptionsSVG.find(s => s.name === size)?.value;
                        const availableSpace = 6 - runningColTotal;

                        if (runningColTotal === 0) {
                            runningColTotal = requiredSpace
                        } else if (requiredSpace <= availableSpace) {
                            runningColTotal += requiredSpace
                        } else {
                            runningColTotal = requiredSpace
                        }

                        const sizeClass = getSizeClass(size, requiredSpace, availableSpace, runningColTotal);

                        return (
                            <div id={v?.id} key={i} className={`${sizeClass}`} data-size={requiredSpace}>
                                <SectionView
                                    attributes={attr.attributes}
                                    key={i}
                                    i={i}
                                    value={v}
                                    siteType={siteType}
                                    apiLoad={apiLoad}
                                    apiUpdate={apiUpdate}
                                    format={format}
                                />
                            </div>
                        )
                    })
            }
            <ScrollToHashElement/>
        </div>
    )
}

export default {
    "EditComp": Edit,
    "ViewComp": View
}