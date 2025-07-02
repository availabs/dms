import React, {Fragment, useState, useLayoutEffect, useRef, useEffect} from "react";
import { useLocation } from 'react-router';
import { isEqual, cloneDeep, set } from "lodash-es";
import { v4 as uuidv4 } from 'uuid';

import { CMSContext, PageContext } from '../../context'
import { SectionEdit, SectionView } from './section'
import {ThemeContext} from "../../../../ui/useTheme";

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
    
    const [ values, setValues ] = useState([]);
    const [active, setActive] = useState(); // to handle multiple spreadsheet components on a page in conjunction with arrow/selection/copy controls
    const { UI, baseUrl, user } = React.useContext(CMSContext) || {}
    const { theme = { sectionArray: sectionArrayTheme} } = React.useContext(ThemeContext) || {}
    const { editPane, apiLoad, apiUpdate, format  } =  React.useContext(PageContext) || {}
    const { Icon } = UI;

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
                ${theme?.sectionArray?.container} 
                ${theme?.sectionArray?.layouts?.[group?.full_width === 'show' ? 'fullwidth' : 'centered']}
            `}>
                
                {[...values,{}]
                    .map((v,i) => {
                    //only render sections in this group
                    // return <div className='p-4 w-full'>{v.id}</div>
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
                                ${v?.padding ?  v.padding : theme?.sectionArray?.sectionPadding} 
                                ${theme?.sectionArray?.sectionEditWrapper} 
                                ${colspanClass} ${rowspanClass}
                                ${theme?.sectionArray?.border?.[v?.border || 'none']}
                                
                            `}
                            style={{paddingTop: v?.offset }}
                            onClick={() => {
                                if (active !== v?.id) {
                                    setActive(v.id);
                                }
                            }}
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
                                    isActive={active === v?.id}
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
                                    isActive={active === v?.id}
                                /> : v?.status?.length > 1 ? <div>Error</div> : ''}

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
    const { theme = {sectionArray: sectionArrayTheme} } = React.useContext(ThemeContext);
    const { apiLoad, apiUpdate, format  } =  React.useContext(PageContext) || {}
    const [active, setActive] = useState();

    const hideSectionCondition = section => {
        //console.log('hideSectionCondition', section?.element?.['element-data'] || '{}')
        let value = section?.element?.['element-data']
        let elementData = typeof value === 'object' ?
            value : value && isJson(value) ? JSON.parse(value) : {}
        return !elementData?.hideSection
    }

    return (
        <div 
            className={`
                ${theme?.sectionArray?.container} 
                ${theme?.sectionArray?.layouts?.[group?.full_width === 'show' ? 'fullwidth' : 'centered']}
            `}
        >
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
                                    ${v?.is_header ? '' : v?.padding ?  v.padding : theme?.sectionArray?.sectionPadding}
                                    ${theme?.sectionArray?.sectionViewWrapper} 
                                    ${colspanClass} ${rowspanClass}
                                    ${theme?.sectionArray?.border?.[v?.border || 'none']}
                                `}
                                style={{ paddingTop: v?.offset }}
                                 onClick={() => {
                                     if (active !== v?.id) {
                                         setActive(v.id);
                                     }
                                 }}
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
                                    isActive={active === v?.id}
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
    const { theme = {} } = React.useContext(ThemeContext);
    const { UI } = React.useContext(CMSContext) || {}
    const {Icon} = UI;
    return (
        <div
            className={`
                ${theme?.sectionArray?.sectionPadding} 
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
