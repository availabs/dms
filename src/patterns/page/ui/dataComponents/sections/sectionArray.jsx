import React, {Fragment, useState, useLayoutEffect, useRef, useEffect} from "react"
import { useImmer } from "use-immer";
import { useLocation } from 'react-router-dom'
import { isEqual, cloneDeep, set } from "lodash-es"
import { v4 as uuidv4 } from 'uuid';
import { CMSContext } from '../../../siteConfig'
import { PageContext } from '../../../pages/view'
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
} from '../../icons'

import { Icon } from '../../'

import { SectionEdit, SectionView } from './section'

const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

export const sectionArrayTheme = {
    container: 'w-full grid grid-cols-6 ', //gap-1 md:gap-[12px]
    gridSize: 6,
    layouts: {
        centered: 'max-w-[1020px] mx-auto',
        fullwidth: ''
    },
    sectionEditWrapper: 'relative group',
    sectionEditHover: 'absolute inset-0 group-hover:border border-blue-300 border-dashed pointer-events-none z-10',
    sectionViewWrapper: 'relative group',
    sectionPadding: 'p-4',
    gridviewGrid: 'z-0 bg-slate-50 h-full',
    gridviewItem: 'border-x bg-white border-slate-100/75 border-dashed h-full p-[6px]',
    defaultOffset: 16,
    sizes: {
        "1/3": { className: 'col-span-6 md:col-span-2', iconSize: 33 },
        "1/2": { className: 'col-span-6 md:col-span-3', iconSize: 50 },
        "2/3": { className: 'col-span-6 md:col-span-4', iconSize: 66 },
        "1":   { className: 'col-span-6 md:col-span-6', iconSize: 100 },
    },
    rowspans: {
        "1" : { className: '' },
        "2" : { className: 'md:row-span-2'},
        "3" : { className: 'md:row-span-3'},
        "4" : { className: 'md:row-span-4'},
        "5" : { className: 'md:row-span-5'},
        "6" : { className: 'md:row-span-6'},
        "7" : { className: 'md:row-span-7'},
        "8" : { className: 'md:row-span-8'},
    },
    border: {
        none: '',
        full: 'border border-[#E0EBF0] rounded-lg',
        openLeft: 'border border-[#E0EBF0] border-l-transparent rounded-r-lg',
        openRight: 'border border-[#E0EBF0] border-r-transparent rounded-l-lg',
        openTop: 'border border-[#E0EBF0] border-t-transparent rounded-b-lg',
        openBottom: 'border border-[#E0EBF0] border-b-transparent rounded-t-lg',
        borderX: 'border border-[#E0EBF0] border-y-transparent'
    }
}

const Edit = ({ value, onChange, attr, group, siteType, ...rest }) => {
    const [ values, setValues ] = useImmer([]);
    const { baseUrl, user, theme = { sectionArray: sectionArrayTheme} } = React.useContext(CMSContext) || {}
    const { editPane, apiLoad, apiUpdate, format  } =  React.useContext(PageContext) || {}

    React.useEffect(() => {
        //------------------------------------------
        // update value edit clone on receiving data
        // -----------------------------------------
        if (!value || !value.map) {
            setValues([''])
        }else if(!isEqual(value, values)) {
            setValues(value)
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

    const saveIndex = (i, v) => {
        const cloneValue = cloneDeep(value || [])
        cloneValue[i] = v
        setValues([...cloneValue, ''])
        /* await */ onChange(cloneValue)
    }

    const save = /* async */ () => {

        let cloneValue = cloneDeep(value || [])
        const trackingId = uuidv4();
        let action = ''
        // edit.value.has_changes = true
        if(edit.type === 'update') {
            cloneValue[edit.index] = edit.value

            action = `edited section ${edit?.value?.title ? `${edit?.value?.title} ${edit.index+1}` : edit.index+1}`
        } else {
            cloneValue.splice(edit.index, 0, {...(edit.value || {}), trackingId, group: group?.name})
            action = `added section ${edit?.value?.title ? `${edit?.value?.title} ${edit.index+1}` : edit.index+1}`
        }
        //console.log('edit on save', edit)
        
        cancel()
        setValues([...cloneValue, ''])
        /* await */ onChange(cloneValue,action)
    
    }

    const remove = (i) => {
        let cloneValue = cloneDeep(value)
        
        if(edit.type === 'update') {
            cloneValue.splice(edit.index, 1)
        } else {
           cloneValue.splice(i, 1) 
        }
        const action = `removed section ${edit?.value?.title ? `${edit?.value?.title} ${edit.index+1}` : edit.index+1}`
        //console.log('remove', value, cloneValue)
        // console.log('edit on remove', edit)
        cancel()
        onChange(cloneValue, action)
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

    const hideDebug = true
    //console.log('test 123', values, group)

    return (
        <div className='relative'>
        { editPane?.showGrid && (
            <div className='absolute inset-0 pointer-events-none  '>
                <div className={`
                        ${theme?.sectionArray?.container} 
                        ${theme?.sectionArray?.gridviewGrid} 
                        ${theme?.sectionArray?.layouts[group?.full_width === 'show' ? 'fullwidth' : 'centered']}
                    `}
                >
                    {[...Array(theme?.sectionArray?.gridSize).keys()].map(d => <div className={theme?.sectionArray?.gridviewItem}  />)}
                </div>
            </div>
        )}
            <div className={`
                ${theme.sectionArray.container} 
                ${theme.sectionArray.layouts[group?.full_width === 'show' ? 'fullwidth' : 'centered']}
            `}>
                
                {[...values,{}]
                    .map((v,i) => {
                    //only render sections in this group
                    if(!(v.group === group.name || (!v.group && group?.name === 'default')) && i !== edit.index) {
                        return <React.Fragment key={i}></React.Fragment>
                    }

                    const size = (edit.index === i ? edit?.value?.size : v?.size) || "1";
                    const rowspan = (edit.index === i ? edit?.value?.rowspan : v?.rowspan) || "1";
                    const colspanClass = (theme?.sectionArray?.sizes?.[size] || theme?.sectionArray?.sizes?.["1"])?.className;
                    const rowspanClass = (theme?.sectionArray?.rowspans?.[rowspan] || theme?.sectionArray?.rowspans?.["1"])?.className

                    // console.log('section', v, v.error)
                    return (
                        <div
                            key={i}
                            id={v?.id}
                            className={`
                                ${v?.padding ?  v.padding : theme.sectionArray.sectionPadding} 
                                ${theme?.sectionArray?.sectionEditWrapper} 
                                ${colspanClass} ${rowspanClass}
                                ${theme?.sectionArray?.border?.[v?.border || 'none']}
                                
                            `}
                            style={{paddingTop: v?.offset }}
                        >
                            <div className={theme?.sectionArray?.sectionEditHover} />
                            {/* add to top */}
                            { 
                                edit?.index === -1 && <div 
                                    onClick={() => setEditIndex(Math.max(i, 0))}
                                    className={`
                                        cursor-pointer py-0.5 text-sm text-blue-200 hover:text-blue-400 truncate w-full  
                                        hover:bg-blue-50/75 -ml-4 hidden group-hover:flex absolute -top-5
                                    `}>
                                    <div className='flex-1' />
                                    <div className='flex items-center'>
                                        
                                        <div><Icon icon='InsertSection' className='size-6'/></div>
                                        
                                    </div>
                                    <div className='flex-1' />
                                </div>
                             }

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
                            { v !== '' && !(edit.index === i && edit.type === 'update') ?
                                <SectionView
                                    value={v}
                                    i={i}
                                    moveItem={moveItem}
                                    attributes={attr.attributes}
                                    edit={true}
                                    onEdit={ edit.index === -1 ? (e) => update(i)  : null }
                                    onRemove={remove}
                                    onChange={ saveIndex }
                                    addAbove={() => setEditIndex(i)}
                                    siteType={siteType}
                                    apiLoad={apiLoad}
                                    apiUpdate={apiUpdate}
                                    format={format}
                                /> : v?.status?.length > 1 ? <RenderError data={v} /> : ''}

                            {/* add new section at end  */}
                            
                        </div>
                    )
                })
            }
            {
                edit?.index === -1 && <AddSectionButton onClick={() => setEditIndex(Math.max(values.length, 0))}/>
            }
            
            <ScrollToHashElement />
            </div>
        </div>
    )
}

const View = ({value, attr, group, siteType}) => {
    if (!value || !value.map) { return '' }
    const { baseUrl, user, theme } = React.useContext(CMSContext) || {}
    const { apiLoad, apiUpdate, format  } =  React.useContext(PageContext) || {}

    const hideSectionCondition = section => {
        //console.log('hideSectionCondition', section?.element?.['element-data'] || '{}')
        let value = section?.element?.['element-data']
        let elementData = typeof value === 'object' ?
            value : value && isJson(value) ? JSON.parse(value) : {}
        return !elementData?.hideSection
    }

    return (
        <div className={`${theme.sectionArray.container} ${theme.sectionArray.layouts[group?.full_width === 'show' ? 'fullwidth' : 'centered']}`}>
            {
                value.filter(v => hideSectionCondition(v))
                    .filter(v => v.group === group.name || (!v.group && group?.name === 'default'))
                    //.sort((a,b) => a.order - b.order)
                    .map((v, i) => {
                        
                        const size = v?.size || "1";
                        const rowspan = v?.rowspan || "1";
                        const colspanClass = (theme?.sectionArray?.sizes?.[size] || theme?.sectionArray?.sizes?.["1"])?.className;
                        const rowspanClass = (theme?.sectionArray?.rowspans?.[rowspan] || theme?.sectionArray?.rowspans?.["1"])?.className;

                        return (
                            <div id={v?.id} key={i} 
                                className={`
                                    ${v?.is_header ? '' : v?.padding ?  v.padding : theme.sectionArray.sectionPadding}
                                    ${theme?.sectionArray?.sectionViewWrapper} 
                                    ${colspanClass} ${rowspanClass}
                                    ${theme?.sectionArray?.border?.[v?.border || 'none']}
                                `}
                                style={{ paddingTop: v?.offset }}
                            >   

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


const ScrollToHashElement = () => {
    const location = useLocation();

    useEffect(() => {
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

const AddSectionButton = ({onClick}) => {
    const { theme } = React.useContext(CMSContext) || {}
    return (
        <div
            className={`
                ${theme.sectionArray.sectionPadding} 
                ${theme?.sectionArray?.sectionEditWrapper} 
                ${theme?.sectionArray?.sizes?.["1"]?.className} 
                ${theme?.sectionArray?.rowspans?.["1"]?.className}
                ${theme?.sectionArray?.border?.['none']}
            `}
        >
            <div className={theme?.sectionArray?.sectionEditHover} />
                <div 
                    onClick={onClick}
                    className={`
                        cursor-pointer py-0.5 text-sm text-blue-200 hover:text-blue-400 truncate w-full  
                        hover:bg-blue-50/75 -ml-4 hidden group-hover:flex absolute -top-5
                    `}>
                    <div className='flex-1' />
                    <div className='flex items-center'>
                        
                        <div><Icon icon='InsertSection' className='size-6'/></div>
                        
                    </div>
                    <div className='flex-1' />
                </div>
        </div>
    )
}

const GridLines = () => (
<>
    <svg
        className="absolute -top-[9px] left-0 right-0 row-start-2 ml-[calc(50%-50vw)] h-px w-screen"
        fill="none"
      >
        <defs>
          <pattern
            id=":S1:"
            patternUnits="userSpaceOnUse"
            width="16"
            height="1"
          >
            <line
              className="stroke-zinc-950 dark:stroke-white"
              x1="0"
              x2="16"
              y1="0.5"
              y2="0.5"
              strokeDasharray="2 2"
              strokeWidth="1.5"
              strokeOpacity="0.1"
              strokeLinejoin="round"
            ></line>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#:S1:)"></rect>
      </svg>
      <svg
        className="absolute -top-[9px] left-0 right-0 row-start-3 ml-[calc(50%-50vw)] h-px w-screen"
        fill="none"
      >
        <defs>
          <pattern
            id=":S2:"
            patternUnits="userSpaceOnUse"
            width="16"
            height="1"
          >
            <line
              className="stroke-zinc-950 dark:stroke-white"
              x1="0"
              x2="16"
              y1="0.5"
              y2="0.5"
              strokeDasharray="2 2"
              strokeWidth="1.5"
              strokeOpacity="0.1"
              strokeLinejoin="round"
            ></line>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#:S2:)"></rect>
      </svg>
      {/*<svg className="absolute -top-[9px] left-0 right-0 row-start-4 ml-[calc(50%-50vw)] h-px w-screen" fill="none"><defs><pattern id=":S3:" patternUnits="userSpaceOnUse" width="16" height="1"><line className="stroke-zinc-950 dark:stroke-white" x1="0" x2="16" y1="0.5" y2="0.5" strokeDasharray="2 2" strokeWidth="1.5" strokeOpacity="0.1" strokeLinejoin="round"></line></pattern></defs><rect width="100%" height="100%" fill="url(#:S3:)"></rect></svg>
       */}
      <svg
        className="absolute -top-[9px] left-0 right-0 row-start-5 ml-[calc(50%-50vw)] h-px w-screen"
        fill="none"
      >
        <defs>
          <pattern
            id=":S4:"
            patternUnits="userSpaceOnUse"
            width="16"
            height="1"
          >
            <line
              className="stroke-zinc-950 dark:stroke-white"
              x1="0"
              x2="16"
              y1="0.5"
              y2="0.5"
              strokeDasharray="2 2"
              strokeWidth="1.5"
              strokeOpacity="0.1"
              strokeLinejoin="round"
            ></line>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#:S4:)"></rect>
      </svg>
      <svg
        className="absolute -top-[9px] left-0 right-0 row-start-6 ml-[calc(50%-50vw)] h-px w-screen xl:hidden"
        fill="none"
      >
        <defs>
          <pattern
            id=":S5:"
            patternUnits="userSpaceOnUse"
            width="16"
            height="1"
          >
            <line
              className="stroke-zinc-950 dark:stroke-white"
              x1="0"
              x2="16"
              y1="0.5"
              y2="0.5"
              strokeDasharray="2 2"
              strokeWidth="1.5"
              strokeOpacity="0.1"
              strokeLinejoin="round"
            ></line>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#:S5:)"></rect>
      </svg>
      <svg
        className="absolute -top-[9px] left-0 right-0 row-start-7 ml-[calc(50%-50vw)] h-px w-screen xl:hidden"
        fill="none"
      >
        <defs>
          <pattern
            id=":S6:"
            patternUnits="userSpaceOnUse"
            width="16"
            height="1"
          >
            <line
              className="stroke-zinc-950 dark:stroke-white"
              x1="0"
              x2="16"
              y1="0.5"
              y2="0.5"
              strokeDasharray="2 2"
              strokeWidth="1.5"
              strokeOpacity="0.1"
              strokeLinejoin="round"
            ></line>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#:S6:)"></rect>
      </svg>
      <svg
        className="absolute -top-[9px] left-0 right-0 row-start-8 ml-[calc(50%-50vw)] h-px w-screen md:hidden"
        fill="none"
      >
        <defs>
          <pattern
            id=":S7:"
            patternUnits="userSpaceOnUse"
            width="16"
            height="1"
          >
            <line
              className="stroke-zinc-950 dark:stroke-white"
              x1="0"
              x2="16"
              y1="0.5"
              y2="0.5"
              strokeDasharray="2 2"
              strokeWidth="1.5"
              strokeOpacity="0.1"
              strokeLinejoin="round"
            ></line>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#:S7:)"></rect>
      </svg>
      <svg
        className="absolute -top-[9px] left-0 right-0 row-start-9 ml-[calc(50%-50vw)] h-px w-screen md:hidden"
        fill="none"
      >
        <defs>
          <pattern
            id=":S8:"
            patternUnits="userSpaceOnUse"
            width="16"
            height="1"
          >
            <line
              className="stroke-zinc-950 dark:stroke-white"
              x1="0"
              x2="16"
              y1="0.5"
              y2="0.5"
              strokeDasharray="2 2"
              strokeWidth="1.5"
              strokeOpacity="0.1"
              strokeLinejoin="round"
            ></line>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#:S8:)"></rect>
      </svg>
      <svg
        className="absolute -top-[9px] left-0 right-0 row-start-10 ml-[calc(50%-50vw)] h-px w-screen md:hidden"
        fill="none"
      >
        <defs>
          <pattern
            id=":S9:"
            patternUnits="userSpaceOnUse"
            width="16"
            height="1"
          >
            <line
              className="stroke-zinc-950 dark:stroke-white"
              x1="0"
              x2="16"
              y1="0.5"
              y2="0.5"
              strokeDasharray="2 2"
              strokeWidth="1.5"
              strokeOpacity="0.1"
              strokeLinejoin="round"
            ></line>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#:S9:)"></rect>
      </svg>
      <svg
        className="absolute -top-[9px] left-0 right-0 row-start-11 ml-[calc(50%-50vw)] hidden h-px w-screen"
        fill="none"
      >
        <defs>
          <pattern
            id=":Sa:"
            patternUnits="userSpaceOnUse"
            width="16"
            height="1"
          >
            <line
              className="stroke-zinc-950 dark:stroke-white"
              x1="0"
              x2="16"
              y1="0.5"
              y2="0.5"
              strokeDasharray="2 2"
              strokeWidth="1.5"
              strokeOpacity="0.1"
              strokeLinejoin="round"
            ></line>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#:Sa:)"></rect>
      </svg>
      <svg
        className="absolute left-0 right-0 top-2 row-start-12 ml-[calc(50%-50vw)] h-px w-screen translate-y-1/2 sm:row-start-11 md:row-start-8 xl:row-start-6"
        fill="none"
      >
        <defs>
          <pattern
            id=":Sb:"
            patternUnits="userSpaceOnUse"
            width="16"
            height="1"
          >
            <line
              className="stroke-zinc-950 dark:stroke-white"
              x1="0"
              x2="16"
              y1="0.5"
              y2="0.5"
              strokeDasharray="2 2"
              strokeWidth="1.5"
              strokeOpacity="0.1"
              strokeLinejoin="round"
            ></line>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#:Sb:)"></rect>
      </svg>
      <svg
        className="absolute -left-[9px] top-[-88px] col-start-1 h-[calc(100%+88px+160px)] w-px"
        fill="none"
      >
        <defs>
          <pattern
            id=":Sc:"
            patternUnits="userSpaceOnUse"
            width="1"
            height="16"
          >
            <line
              className="stroke-zinc-950 dark:stroke-white"
              x1="0.5"
              x2="0.5"
              y1="0"
              y2="16"
              strokeDasharray="2 2"
              strokeWidth="1.5"
              strokeOpacity="0.1"
              strokeLinejoin="round"
            ></line>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#:Sc:)"></rect>
      </svg>
      <svg
        className="absolute -left-[9px] top-[-88px] hidden h-[calc(100%+88px+160px)] w-px sm:col-start-2 sm:block xl:col-start-6"
        fill="none"
      >
        <defs>
          <pattern
            id=":Sd:"
            patternUnits="userSpaceOnUse"
            width="1"
            height="16"
          >
            <line
              className="stroke-zinc-950 dark:stroke-white"
              x1="0.5"
              x2="0.5"
              y1="0"
              y2="16"
              strokeDasharray="2 2"
              strokeWidth="1.5"
              strokeOpacity="0.1"
              strokeLinejoin="round"
            ></line>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#:Sd:)"></rect>
      </svg>
      <svg
        className="absolute -left-[9px] top-[-88px] col-start-7 hidden h-[calc(100%+88px+160px)] w-px xl:block"
        fill="none"
      >
        <defs>
          <pattern
            id=":Se:"
            patternUnits="userSpaceOnUse"
            width="1"
            height="16"
          >
            <line
              className="stroke-zinc-950 dark:stroke-white"
              x1="0.5"
              x2="0.5"
              y1="0"
              y2="16"
              strokeDasharray="2 2"
              strokeWidth="1.5"
              strokeOpacity="0.1"
              strokeLinejoin="round"
            ></line>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#:Se:)"></rect>
      </svg>
      <svg
        className="absolute -left-[9px] top-[-88px] col-start-10 hidden h-[calc(100%+88px+160px)] w-px xl:block"
        fill="none"
      >
        <defs>
          <pattern
            id=":Sf:"
            patternUnits="userSpaceOnUse"
            width="1"
            height="16"
          >
            <line
              className="stroke-zinc-950 dark:stroke-white"
              x1="0.5"
              x2="0.5"
              y1="0"
              y2="16"
              strokeDasharray="2 2"
              strokeWidth="1.5"
              strokeOpacity="0.1"
              strokeLinejoin="round"
            ></line>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#:Sf:)"></rect>
      </svg>
      <svg
        className="absolute -left-[9px] top-[-88px] col-start-11 hidden h-[calc(100%+88px+160px)] w-px xl:block"
        fill="none"
      >
        <defs>
          <pattern
            id=":Sg:"
            patternUnits="userSpaceOnUse"
            width="1"
            height="16"
          >
            <line
              className="stroke-zinc-950 dark:stroke-white"
              x1="0.5"
              x2="0.5"
              y1="0"
              y2="16"
              strokeDasharray="2 2"
              strokeWidth="1.5"
              strokeOpacity="0.1"
              strokeLinejoin="round"
            ></line>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#:Sg:)"></rect>
      </svg>
      <svg
        className="absolute -right-2 top-[-88px] col-start-3 h-[calc(100%+88px+160px)] w-px translate-x-1/2 sm:col-start-4 xl:col-start-[16]"
        fill="none"
      >
        <defs>
          <pattern
            id=":Sh:"
            patternUnits="userSpaceOnUse"
            width="1"
            height="16"
          >
            <line
              className="stroke-zinc-950 dark:stroke-white"
              x1="0.5"
              x2="0.5"
              y1="0"
              y2="16"
              strokeDasharray="2 2"
              strokeWidth="1.5"
              strokeOpacity="0.1"
              strokeLinejoin="round"
            ></line>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#:Sh:)"></rect>
      </svg>
</>
)