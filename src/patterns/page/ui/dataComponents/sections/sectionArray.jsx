import React, {Fragment, useState, useLayoutEffect, useRef, useEffect} from "react"
import { useLocation } from 'react-router-dom'
import { isEqual, cloneDeep } from "lodash-es"
import { v4 as uuidv4 } from 'uuid';
import { CMSContext } from '../../../siteConfig'
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
} from '../../icons'

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
    container: 'w-full grid grid-cols-6 gap-1',
    layouts: {
        centered: 'md:grid-cols-[1fr_repeat(6,_minmax(_100px,_170px))_1fr]',
        fullwidth:'md:grid-cols-[_minmax(_0px,0px)_repeat(6,_1fr)_minmax(_0px,0px)]'
    }
}

const Edit = ({Component, value, onChange, attr, full_width = false, siteType, apiLoad, apiUpdate, format, ...rest }) => {
    const [values, setValues] = useState([]);
    const { baseUrl, user, theme = { sectionArray: sectionArrayTheme} } = React.useContext(CMSContext) || {}

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
        const trackingId = uuidv4();
        let action = ''
        // edit.value.has_changes = true
        if(edit.type === 'update') {
            cloneValue[edit.index] = edit.value

            action = `edited section ${edit?.value?.title ? `${edit?.value?.title} ${edit.index+1}` : edit.index+1}`
        } else {
            cloneValue.splice(edit.index, 0, {...(edit.value || {}), trackingId})
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


    //console.log('ids', values)
    return (
        <div className={`${theme.sectionArray.container} ${theme.sectionArray.layouts[full_width === 'show' ? 'fullwidth' : 'centered']} `}>
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
                        id={v?.id}
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
            <ScrollToHashElement />
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