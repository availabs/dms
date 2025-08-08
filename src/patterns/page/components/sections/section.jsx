import React, {createContext, Fragment, useContext, useRef, useState} from "react"
import { isEqual } from "lodash-es"
import { Combobox } from '@headlessui/react'
import { Link } from "react-router";
import { usePopper } from 'react-popper'
import { CMSContext } from '../../context'

import {convert} from './convertToSpreadSheet'
import {ThemeContext} from "../../../../ui/useTheme";



const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

export function SectionEdit ({value, i, onChange, attributes, size, onCancel, onSave, onRemove, siteType, apiLoad, apiUpdate, format, isActive}) {
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    let sectionTitleCondition = value?.['title']
    const { theme } = React.useContext(ThemeContext);
    const { UI } = React.useContext(CMSContext) || {}
    const { Popover, Button, Icon, Menu, Label } = UI

    const updateAttribute = (k, v) => {
        // console.log('change',k,v, {...value, [k]: v})
        if(!isEqual(value, {...value, [k]: v})) {
            // console.log('change',k,v, {...value, [k]: v})
            onChange({...value, [k]: v})
        }
    }

    let TitleComp = attributes?.title?.EditComp
    let LevelComp = attributes?.level?.EditComp
    let TagsComp = attributes?.tags?.EditComp
    let ElementComp = attributes?.element?.EditComp
    let HelpComp = attributes?.helpText?.EditComp

    return (
        <div className={``}>
            {/* -------------------top line buttons ----------------------*/}
            <div className={theme?.section?.editTopLineIcons || `flex w-full`}>
                <div className='flex-1'/>
                    <div className={`z-10 relative`}>
                        <div className={`absolute mr-16 top-[-24px] right-[-60px] flex`}>
                            {/*delete*/}
                            <Button type='plain' padding='p-1' onClick={() => setShowDeleteModal(!showDeleteModal)}>
                                <Icon icon={'TrashCan'} className='text-red-400 hover:text-red-600 w-[24px] h-[24px]' title="Delete Section"/>
                            </Button>
                            <DeleteModal
                                title={`Delete Section ${value?.title || ''} ${value?.id}`} open={showDeleteModal}
                                prompt={`Are you sure you want to delete this section? All of the section data will be permanently removed
                                            from our servers forever. This action cannot be undone.`}
                                setOpen={(v) => setShowDeleteModal(v)}
                                onDelete={() => {
                                    async function deleteItem() {
                                        await onRemove(i)
                                        setShowDeleteModal(false)
                                    }

                                    deleteItem()
                                }}
                            />
                            {/*help text*/}
                            <Popover button={<Icon icon={'InfoSquare'} className='text-blue-400 hover:text-blue-600  w-[24px] h-[24px]' title="Help Text"/>} >
                                <HelpComp
                                    value={value?.['helpText']}
                                    onChange={(v) => updateAttribute('helpText', v)}
                                />
                            </Popover>
                            {/*tags*/}
                            <Popover button={<Icon icon={'Tags'} className='text-blue-400 hover:text-blue-600  w-[24px] h-[24px]' title="Tags"/>} >
                                <TagComponent
                                    edit={true}
                                    className='p-2 flex-0'
                                    value={value?.['tags']}
                                    placeholder={'Add Tag...'}
                                    onChange={(v) => updateAttribute('tags', v)}
                                />
                            </Popover>
                            {/*save*/}
                            <Button type='plain' padding='p-1' onClick={onSave}>
                                <Icon icon={'FloppyDisk'} className='text-slate-400 hover:text-blue-500 w-[24px] h-[24px]'/>
                            </Button>
                            {/*cancel*/}
                            <Button type='plain' padding='p-1' onClick={onCancel}>
                                <Icon icon={'CancelCircle'} className='text-slate-400 hover:text-red-500 w-[24px] h-[24px]'/>
                            </Button>
                            {/*section details*/}
                            <Popover button={<Icon icon={'MoreSquare'} className='text-blue-400 hover:text-blue-600  w-[24px] h-[24px]' title="section details"/>} >
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
                            </Popover>
                        </div>
                    </div>
                </div>
                {sectionTitleCondition && (
                    <div className='flex h-[50px]'>
                        <div className='flex'>
                            <TitleComp
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
                    {/* controls */}

                    <ElementComp
                        value={value?.['element']}
                        onChange={(v) => updateAttribute('element', v)}
                        handlePaste={(e, setKey, setState) => handlePaste(e, setKey, setState, value, onChange)}
                        size={size}
                        siteType={siteType}
                        apiLoad={apiLoad}
                        apiUpdate={apiUpdate}
                        pageFormat={format}
                        isActive={isActive}
                    />
                </div>
        </div>
    )
}
let handleCopy = (value) => {
    const elementType = value?.element?.['element-type'];
    //--------------------------------------
    // Temp Code to migrate off cenrep II
    //--------------------------------------
    if(elementType === 'Table: Cenrep II'){
        const spreadsheetData = convert(JSON.parse(value.element['element-data']));
        const ssElement = {...value, element: {'element-type': 'Spreadsheet', 'element-data': JSON.stringify(spreadsheetData)}};
        console.log(ssElement);
        navigator.clipboard.writeText(JSON.stringify(ssElement))
        return;
    }
    //--------------------------------------
    navigator.clipboard.writeText(JSON.stringify(value))
}

export function SectionView ({value,i, attributes, edit, onEdit,onChange, onRemove, moveItem, addAbove, siteType, apiLoad, apiUpdate, format, isActive}) {
    
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    let [referenceElement, setReferenceElement] = useState()
    let [popperElement, setPopperElement] = useState()
    let { styles, attributes:popperAttributes } = usePopper(referenceElement, popperElement)
    const { theme = {} } = React.useContext(ThemeContext);
    const {UI } = React.useContext(CMSContext) || {}
    const {Popover, Menu, Icon} = UI;
    // const updateAttribute = (k, v) => {
    //     onChange(value, k, v)
    // }
    

    // const updateAttribute = (k, v) => {
    //     console.log('change',k,v, {...value, [k]: v})
    //     if(!isEqual(value, {...value, [k]: v})) {
    //         console.log('change',k,v, {...value, [k]: v})
    //         onChange({...value, [k]: v})
    //     }
    // }
    const updateAttribute = (k, v) => {
        if(!isEqual(value, {...value, [k]: v})) {
            onChange(i, {...value, [k]: v})
        }
    }

    const hideDebug = true
    let TitleComp = attributes?.title?.ViewComp
    let TagsComp = attributes?.tags?.ViewComp 
    let ElementComp = attributes?.element?.ViewComp // selector
    let HelpComp = attributes?.helpText?.ViewComp
    let helpTextCondition = value?.['helpText'] && !(
        (value?.['helpText']?.root?.children?.length === 1 && value?.['helpText']?.root?.children?.[0]?.children?.length === 0) || // empty child
        (value?.['helpText']?.root?.children?.length === 0) // no children
    )
    let sectionTitleCondition = value?.['title'] || value?.['tags'] || helpTextCondition //|| value?.['tags'] ;// edit
    let interactCondition = false //typeof onEdit !== 'function' && value?.element?.['element-type']?.includes('Map:');
    let isTemplateSectionCondition = false//value?.element?.['template-section-id'];
    let showEditIcons = edit && typeof onEdit === 'function' && !isTemplateSectionCondition

    const element = React.useMemo(() => {
        return (
            <ElementComp 
                value={value?.['element']} 
                siteType={siteType} 
                apiLoad={apiLoad} 
                apiUpdate={apiUpdate} 
                pageFormat={format}
                isActive={isActive}
            />
        )
    }, [value, isActive])
    if(!value?.element?.['element-type'] && !value?.element?.['element-data']) return null;
    const sectionMenuItems = [
      { icon: 'PencilSquare', name: 'Edit', onClick: onEdit },
      { icon: 'Copy', name: 'Copy Section', onClick: () => handleCopy(value) },
      { type: 'seperator'},
      { icon: 'ChevronUpSquare', name: 'Move Up', onClick: () => moveItem(i,-1) },
      { icon: 'ChevronDownSquare', name: 'Move Down', onClick: () =>  moveItem(i,1) },
      { type: 'seperator'},
      { 
        icon:'Column', name: 'Width',
        type: 'menu', 
        value: value?.['size'] || 1,
        items: Object.keys(theme?.sectionArray?.sizes || {}).sort((a,b) => {
            let first = +theme?.sectionArray?.sizes?.[a].iconSize || 100
            let second = +theme?.sectionArray?.sizes?.[b].iconSize || 100
            return first - second
        }).map((name,i) => {
            return {
                'icon': name == (value?.['size'] || '1') ? 'CircleCheck' : 'Blank',
                'name': name,
                'onClick': () => {
                    console.log('colspan Item name click', name)
                    updateAttribute('size', name);
                }
            }
        })
      },
      { 
        icon: 'Row', name: 'Rowspan', 
        type: 'menu', 
        value: value?.['rowspan'] || 1,
        items: Object.keys(theme?.sectionArray?.rowspans || {}).sort((a,b) => {
            return +a - +b
        }).map((name,i) => {
            return {
                'icon': name == (value?.['rowspan'] || '1') ? 'CircleCheck' : 'Blank',
                'name': name,
                'onClick': () => {
                    //console.log('colspan Item name click', name)
                    updateAttribute('rowspan', name);
                }
            }
        })
      },
      { icon: 'Padding', name: 'Offset', 
        type: 'menu',
        value: value?.['offset'] || 16,
        items: [25,50,100,150,200,250,300,350,400,500].map((v,i) => {
            return {
                'icon': v == (value?.['offset'] || '1') ? 'CircleCheck' : 'Blank',
                'name': `${v}px`,
                'onClick': () => {
                    //console.log('colspan Item name click', name)
                    updateAttribute('offset', v);
                }
            }
        }),
        // inputProps: { 
        //     type: 'number', 
        //     value: value?.offset || theme?.sectionArray?.defaultOffset, 
        //     onChange: (v) => updateAttribute('offset', v.target.value)
        // }
      },
      { icon: 'Padding', name: 'padding', 
        type: 'menu',
        value: value?.['padding'] || theme?.sectionArray?.sectionPadding,
        items: ['p-0', 'p-1','p-2', theme?.sectionArray?.sectionPadding].map((v,i) => {
            return {
                'icon': v == (value?.['padding'] || '1') ? 'CircleCheck' : 'Blank',
                'name': `${v}`,
                'onClick': () => {
                    console.log('padding Item name click', v)
                    updateAttribute('padding', v);
                }
            }
        }),
        // inputProps: { 
        //     type: 'number', 
        //     value: value?.offset || theme?.sectionArray?.defaultOffset, 
        //     onChange: (v) => updateAttribute('offset', v.target.value)
        // }
      },
      // { icon: 'Blank', name: 'Padding', onClick: () => {} },
      { icon: 'Border', name: 'Border',
        type: 'menu',
        value: value?.['border'] || 1,
        items: Object.keys(theme?.sectionArray?.border || {})
            .map((name,i) => {
                return {
                    'icon': name == (value?.['border'] || 'None') ? 'CircleCheck' : 'Blank',
                    'name': name,
                    'onClick': () => {
                        //console.log('colspan Item name click', name)
                        updateAttribute('border', name);
                    }
                }
            })
      },
      { type: 'seperator'},
      { icon: 'TrashCan', name: 'Delete', onClick: () => setShowDeleteModal(!showDeleteModal) }
    ]

    return (
        <div className={``} style={{pageBreakInside: "avoid"}}>
            <DeleteModal
                title={`Delete Section ${value?.title || ''} ${value?.id}`} open={showDeleteModal}
                prompt={`Are you sure you want to delete this section? All of the section data will be permanently removed
                            from our servers forever. This action cannot be undone.`}
                setOpen={(v) => setShowDeleteModal(v)}
                onDelete={() => {
                    async function deleteItem() {
                        await onRemove(i)
                        setShowDeleteModal(false)
                    }

                    deleteItem()
                }}
            />
            {/* -------------------top line buttons ----------------------*/}
            <div className={`flex w-full`}>
                <div className='flex-1'/>
                    
                   
                    <div className={`z-10`}>
                        <div className={`absolute top-[6px] right-[6px] hidden group-hover:flex items-center`}> 
                            
                            {showEditIcons && (
                                <>
                                    {/*<Button type='plain' padding='p-0.5' onClick={ () => moveItem(i,-1) }>
                                        <ChevronUpSquare className='text-slate-400 hover:text-blue-500 w-[24px] h-[24px]' title="Move Up"/>
                                    </Button>
                                    <Button type='plain' padding='p-0.5' onClick={ () =>  moveItem(i,1) }>
                                        <ChevronDownSquare className='text-slate-400 hover:text-blue-500 w-[24px] h-[24px]' title="Move Down"/>
                                    </Button>
                                    <Button type='plain' padding='p-0.5' onClick={() => handleCopy(value)} >
                                        <Copy title={'Copy Section'} className='text-slate-400 hover:text-blue-500 w-[24px] h-[24px]'/>
                                    </Button>*/}
                                    {
                                    <Menu items={sectionMenuItems}> 
                                        <div  className='p-1 hover:bg-slate-100/75 rounded-lg'>
                                            <Icon icon="Menu" className='text-slate-500 hover:text-slate-900 size-6'/>
                                        </div>
                                    </Menu>
                                    }
                                    {/*<Button type='plain' padding='p-0.5' onClick={addAbove}> 
                                        <SquarePlus className='text-slate-400 hover:text-blue-500 w-[24px] h-[24px]'/>
                                    </Button>*/}
                                </>
                            )}
                        </div>
                    </div>
                    
                   
                </div>
                {/* -------------------END top line buttons ----------------------*/}
                {/* -------------------Section Header ----------------------*/}
                {(sectionTitleCondition || interactCondition) && (
                    <div className={`flex w-full min-h-[50px] items-center  pb-2 ${value?.['title'] ? '' : 'absolute top-2 -right-2 -left-2 pointer-events-none'} ${false && 'border border-dashed border-pink-500'}`}>

                        <div id={`#${value?.title?.replace(/ /g, '_')}`}
                             className={`flex-1 flex flex-row pb-2 font-display font-medium uppercase scroll-mt-36 items-center ${sectionTitleCondition ? '' : 'invisible'}`}>
                            <div className='flex-1'>
                                <TitleComp
                                    className={`w-full ${theme.heading?.[value?.['level']] || theme.heading?.['default']}`}
                                    value={value?.['title']}
                                />
                            </div>
                            <div className='pdf-hide-icon flex item-center h-full pointer-events-auto'>
                            {value?.['tags']?.length ? 
                            
                                (<Popover button={
                                    <div className='p-2 border border-[#E0EBF0] rounded-full'>
                                        <Icon icon={'Tags'} className='text-slate-400 hover:text-blue-500 size-4' title="Tags"/>
                                    </div>
                                    }>
                                    <TagComponent
                                        
                                        className='p-2 flex-0'
                                        value={value?.['tags']}
                                        placeholder={'Add Tag...'} 
                                        onChange={(v) => updateAttribute('tags', v)}
                                    />
                                </Popover>) : null}
                                        
                                {helpTextCondition && (
                                    <Popover button={<Icon icon={'InfoSquare'} className='text-blue-400 hover:text-blue-500 w-[24px] h-[24px]' title="Move Up"/>}>
                                        <HelpComp value={value?.['helpText']} />
                                    </Popover>)
                            }
                            </div>
                            
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

                        
                    </div>
                )}
            {/* -------------------END Section Header ----------------------*/}
            <div className={`h-full ${hideDebug ? '' : 'border border-dashed border-orange-500'}`}>
                {element}
            </div>
        </div>
    )
}


// ---------------------------------------------
// Supporting Functions & components
//----------------------------------------------
const pageSplitIcons = (size1=50, height=20, width=30, lines=false) => {
    let size2 = 100 - size1
    return (
        <svg width={width} height={height} >
            <line
                x1="0"
                y1="0"
                x2="0"
                y2={height}
                stroke="black"
                strokeDasharray="4 1.5 4 1.5" />
            <rect x={size1 === 100 ? 0 : 5} y="0"
                  width={Math.max(Math.floor(width * size1 / 100) - (size1 === 100 ? 0 : 6),0)} height={height} rx="1" ry="1"
                  style={{fill:'white', stroke:'black', strokeWidth:1, opacity:0.5}} />
            <rect x={(width * size1 / 100) - 1} y="0"
                  width={Math.max(Math.floor(width * size2 / 100) -  (size1 === 100 ? 0 : 6),0)} height={height} rx="1" ry="1"
                  style={{fill:'white', stroke:'black', strokeWidth:1, opacity:0.5}} />
            <line
                x1={width}
                y1="0"
                x2={width}
                y2={height}
                stroke="black"
                strokeDasharray="4 1.5 4 1.5" />
        </svg>
    )
}

function SizeSelect ({size='1', setSize, onChange}) {
    const { baseUrl, user, theme } = React.useContext(CMSContext) || {}
    return (
        <div
          className="flex space-x-1 z-50 rounded-lg bg-blue-50 p-0.5"
          role="tablist"
          aria-orientation="horizontal"
        >        
        {Object.keys(theme?.sectionArray?.sizes || {}).map((name,i) => (
            <button
                key={i}
                className={
                    name === size ?
                    "flex items-center rounded-md py-[0.4375rem] pl-2 pr-2 text-sm font-semibold lg:pr-3 bg-white shadow" :
                    "flex items-center rounded-md py-[0.4375rem] pl-2 pr-2 text-sm font-semibold lg:pr-3 hover:text-blue-500"
                }
                id="headlessui-tabs-tab-3"
                role="tab"
                type="button"
                tabIndex={-1}
                onClick={() => onChange(name)}
              >
                {pageSplitIcons(theme?.sectionArray?.sizes?.[name].iconSize || 100)}
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
    const {UI} = useContext(CMSContext);
    const {Icon, Label} = UI;
    const arrayValue = Array.isArray(value) ? value :  (value?.split(',')?.filter(v => v?.length) || [])
    const [newTag, setNewTag] = useState('');
    //console.log('hola', value, arrayValue)

    const tags = [
        'Hazard',
        'Hurricane',
        'Avalanche',
        'Earthquake',
        'Rec',
        "S1","S1-a","S2","S2-a","S2-a1","S2-a2","S2-a3","S2-a4","S2-a5","S2-a6","S2-a7","S2-a8","S2-a9","S3","S3-a","S3-a1","S3-a2","S3-a3","S3-b2","S4","S4-a","S4-b","S5","S5-a","S5-b","S5-1","S6","S6-a","S6-a1","S6-a2","S6-a2.i","S6-a2.ii","S6-a2.iii","S6-b","S7","S7-a","S7-a1","S7-a2","S7-a3","S7-a4","S8","S8-1","S8-a","S8-a1","S8-a2","S8-a2.i","S8-a3","S8-a3.i","S8-a3.ii","S8-a3.iii","S8-a3.iv","S8-a3.v","S8-a4","S8-b","S8-b1","S8-b2","S8-b3","S8-c","S8-c1","S8-c2","S9","S9-a","S9-b","S10","S10-a","S10-b","S10-c","S10-d","S11","S11-a","S11-b","S12","S12-a","S12-b","S13","S13-a","S13-b","S13-b1","S13-b2","S14","S14-a","S14-a1","S14-a2","S14-a3","S14-b","S14-b1","S14-b2","S15","S15-a","S15-a1","S15-a2","S15-a3","S16","S16-a","S16-b","S17","S17-1","S17-1a","S17-1b","S18","S18-a","S18-b","S18-b1","S18-b2","S18-b3","S18-c","S19","S19-a","S19-1","S20","S20-a","S20-b","HHPD1","HHPD1-1","HHPD1-a","HHPD1-b","HHPD1-b1","HHPD1-b2","HHPD1-2","HHPD2","HHPD2-1","HHPD2-a","HHPD2-b","HHPD2-b1","HHPD2-b2","HHPD2-b3","HHPD2-b4","HHPD2-c","HHPD3","HHPD3-1","HHPD3-a","HHPD3-a1","HHPD3-a2","HHPD3-a3","HHPD3-a4","HHPD3-b","HHPD4","HPPD4-1","HPPD4-a","HPPD4-a1","HPPD4-a2","HPPD4-a3","HPPD4-a4","HPPD4-a5","HHPD4-b","HHPD4-c","HHPD5","HHPD5-a","HHPD6","HHPD6-1","HHPD6-a","HHPD6-b","HHPD6-c","HHPD7","HHPD7-1","HHPD7-a","HHPD7-b","FMAG1","FMAG1-a","FMAG1-b","FMAG1-c","FMAG1-d","FMAG2","FMAG2-a"
    ]

    return (
        <div className='w-full'>

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
                                        className={({active}) => `flex cursor-pointer select-none rounded-xl p-1 ${active && 'bg-gray-100'}`}>
                                        <Label text={tag} />
                                    </Combobox.Option>
                                ))}
                        </Combobox.Options>
                    ) : null
                }
            </Combobox>}
            <div className='w-full min-h-8 flex flex-col gap-1 px-1 py-2'>
            {
                arrayValue
                    .sort((a,b) => a.localeCompare(b))
                    .map((d,i) => (
                        <Label text={
                            <div key={i} className='flex justify-between items-center'>
                                {d}
                                {edit ? <div className='cursor-pointer' onClick={() => onChange(arrayValue.filter(v => v !== d ).join(','))}>
                                    <Icon icon={'RemoveCircle'} className='text-red-400 hover:text-red-600  w-[16px] h-[16px]'/>
                                </div> : null}
                            </div>
                        } />
                ))
            }
            </div>
        </div>
    )

}

const handlePaste = async (e, setKey, setState, value, onChange) => {
    e.preventDefault();
    try{
        const text = await navigator.clipboard.readText();
        const copiedValue = isJson(text) && JSON.parse(text || '{}');

        if(!copiedValue || !copiedValue['element']?.['element-type']) return;
        const elementData = copiedValue['element']['element-data'];
        setKey(copiedValue['element']['element-type']) // mainly for lexical so it updates with value
        setState(isJson(elementData) ? JSON.parse(elementData) : elementData) // state inits with element-data from prop. need to update on paste.
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

export function DeleteModal ({title, prompt, item={}, open, setOpen, onDelete})  {
  const cancelButtonRef = useRef(null)
  const { UI, baseUrl } = React.useContext(CMSContext) || {}
  const { Dialog } = UI
  const [loading, setLoading] = useState(false)
  return (
    <Dialog
      open={open}
      setOpen={setOpen}
      initialFocus={cancelButtonRef}
    >
      <div className="sm:flex sm:items-start z-50">
        <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
          <i className="fa fa-danger h-6 w-6 text-red-600" aria-hidden="true" />
        </div>
        <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
          <h3 className="text-base font-semibold leading-6 text-gray-900">
              {title || `Delete ${item.title || ''} ${item.id}`}
          </h3>
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
    </Dialog>
  )
}

