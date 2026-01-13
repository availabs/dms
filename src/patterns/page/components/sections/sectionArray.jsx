import React, {Fragment, useState, useLayoutEffect, useRef, useEffect} from "react";
import { useLocation } from 'react-router';
import { isEqual, cloneDeep, set } from "lodash-es";

import { ThemeContext, getComponentTheme } from "../../../../ui/useTheme";
import { CMSContext, PageContext } from '../../context'

import { SectionEdit, SectionView } from './section'
import { isJson } from './section_utils'
import { sectionArrayTheme } from './sectionArray.theme'

const Edit = ({ value, onChange, attr, group, siteType, ...rest }) => {

    const { baseUrl, user } = React.useContext(CMSContext) || {}
    const { editPane, apiLoad, apiUpdate, format, item  } =  React.useContext(PageContext) || {}
    const { theme:fullTheme = { sectionArray: sectionArrayTheme}, UI } = React.useContext(ThemeContext) || {}
    const theme = getComponentTheme(fullTheme, 'pages.sectionArray')
    const [ values, setValues ] = useState([]);
    const [ active, setActive ] = useState(); // to handle multiple spreadsheet components on a page in conjunction with arrow/selection/copy controls

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

    React.useEffect(() => {
        const id = setTimeout(() => {
            if(!isEqual(values, value)) onChange(values);
        }, 300);
        return () => clearTimeout(id);
    }, [values]);

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
        // /* await */ onChange(cloneValue)
    }

    const save = /* async */ () => {

        let cloneValue = cloneDeep(value || [])
        const trackingId = crypto.randomUUID();
        let action = ''
        // edit.value.has_changes = true
        if(edit.type === 'update') {
            cloneValue[edit.index] = edit.value

            action = `edited section ${edit?.value?.title ? `${edit?.value?.title} ${edit.index+1}` : edit.index+1}`
        } else {
            cloneValue.splice(edit.index, 0, {
                ...(edit.value || {}),
                trackingId,
                group: group?.name,
                is_draft: true,
                parent: JSON.stringify({
                    id: item.id,
                    ref: `${item.app}+${item.type}`
                })
            })
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
        <div className={theme?.wrapper}>
        { editPane?.showGrid && (
            <div className={theme?.gridOverlay}>
                <div className={`
                        ${theme?.container}
                        ${theme?.gridviewGrid}
                        ${theme?.layouts[group?.full_width === 'show' ? 'fullwidth' : 'centered']}
                    `}
                >
                    {[...Array(theme?.gridSize).keys()].map(d => <div className={theme?.gridviewItem}  />)}
                </div>
            </div>
        )}
            <div className={`
                ${theme?.container}
                ${theme?.layouts?.[group?.full_width === 'show' ? 'fullwidth' : 'centered']}
            `}>

                {[...values,{}]
                    //.filter(v => v.group === group.name || !v.group && group?.name === 'default')
                    .map((v,i) => {
                    // only render sections in this group
                    // but must render fragments for all to maintain indexes.
                    if(!(v.group === group.name || (!v.group && group?.name === 'default')) && i !== edit.index) {
                        //console.log('fragment',group.name, v.group)
                        return <React.Fragment key={i}></React.Fragment>
                    }

                    const size = (edit.index === i ? edit?.value?.size : v?.size) || "1";
                    const rowspan = (edit.index === i ? edit?.value?.rowspan : v?.rowspan) || "1";
                    const colspanClass = (theme?.sizes?.[size] || theme?.sizes?.["1"])?.className;
                    const rowspanClass = (theme?.rowspans?.[rowspan] || theme?.rowspans?.["1"])?.className

                    // console.log('section', v, v.error)
                    return (
                        <div
                            key={i}
                            id={v?.id}
                            className={`
                                ${v?.padding ?  v.padding : theme?.sectionPadding}
                                ${theme?.sectionEditWrapper}
                                ${colspanClass} ${rowspanClass}
                                ${theme?.border?.[v?.border || 'none']}

                            `}
                            style={{paddingTop: v?.offset }}
                            onClick={() => {
                                if(active === v.id) return;

                                if (v?.element?.['element-type'] === 'Spreadsheet' && active !== v?.id) {
                                    setActive(v.id);
                                }else if(v.id){
                                    setActive(undefined)
                                }
                            }}
                        >
                            <div className={theme?.sectionEditHover} />
                            {/* add to top */}
                            {
                                edit?.index === -1 && <div
                                    onClick={() => setEditIndex(Math.max(i, 0))}
                                    className={theme?.addSectionButton}>
                                    <div className={theme?.spacer} />
                                    <div className={theme?.addSectionIconWrapper}>
                                        <div><Icon icon='InsertSection' className={theme?.addSectionIcon}/></div>
                                    </div>
                                    <div className={theme?.spacer} />
                                </div>
                             }

                            {/* edit new or existing section */}
                            {edit.index === i
                                ? <SectionEdit
                                    // key={v.id} having key introduces bugs while adding a new section
                                    value={edit.value}
                                    onChange={setEditValue}
                                    onSave={save}
                                    onCancel={cancel}
                                    onRemove={remove}
                                    moveItem={moveItem}
                                    attributes={attr?.attributes}
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
                                    key={v.id} // to prevent value glitch while removing sections
                                    value={v}
                                    i={i}
                                    moveItem={moveItem}
                                    attributes={attr?.attributes}
                                    edit={true}
                                    onEdit={ edit.index === -1 ? (e) => update(i)  : null }
                                    onRemove={remove}
                                    onChange={ saveIndex }
                                    addAbove={() => setEditIndex(i)}
                                    siteType={siteType}
                                    apiLoad={apiLoad}
                                    apiUpdate={apiUpdate}
                                    format={format}
                                    isActive={v?.element?.['element-type'] === 'Spreadsheet' ? active === v?.id : undefined}
                                /> : v?.status?.length > 1 ? <div>Error</div> : ''}

                            {/* add new section at end  */}

                        </div>
                    )
                })
            }
            {
                edit?.index === -1 ? <AddSectionButton onClick={() => setEditIndex(Math.max(values.length, 0))}/> : ''
            }

            <ScrollToHashElement />
            </div>
        </div>
    )
}

const View = ({value, attr, group, siteType}) => {
    if (!value || !value.map) { return '' }
    const { apiLoad, apiUpdate, format  } =  React.useContext(PageContext) || {}
    const [active, setActive] = useState();
    const { theme:fullTheme = {sectionArray: sectionArrayTheme} } = React.useContext(ThemeContext);
    const theme = getComponentTheme(fullTheme,'pages.sectionArray')

    const hideSectionCondition = section => {
        //console.log('hideSectionCondition', section?.element?.['element-data'] || '{}')
        let value = section?.element?.['element-data']
        let elementData = typeof value === 'object' ?
            value : value && isJson(value) ? JSON.parse(value) : {}
        return !elementData?.hideSection && !elementData?.display?.hideSection && !section?.hideInView;
    }

    return (
        <div
            className={`
                ${theme?.container}
                ${theme?.layouts?.[group?.full_width === 'show' ? 'fullwidth' : 'centered']}
            `}
        >
            {
                value.filter(v => hideSectionCondition(v))
                    .filter(v => v.group === group.name || (!v.group && group?.name === 'default'))
                    //.sort((a,b) => a.order - b.order)
                    .map((v, i) => {
                        const size = v?.size || "1";
                        const rowspan = v?.rowspan || "1";
                        const colspanClass = (theme?.sizes?.[size] || theme?.sizes?.["1"])?.className;
                        const rowspanClass = (theme?.rowspans?.[rowspan] || theme?.rowspans?.["1"])?.className;

                        return (
                            <div id={v?.id} key={i}
                                className={`
                                    ${v?.is_header ? '' : v?.padding ?  v.padding : theme?.sectionPadding}
                                    ${theme?.sectionViewWrapper}
                                    ${colspanClass} ${rowspanClass}
                                    ${theme?.border?.[v?.border || 'none']}
                                `}
                                style={{ paddingTop: v?.offset }}
                                 onClick={() => {
                                     if(active === v.id) return;
                                     if (v?.element?.['element-type'] === 'Spreadsheet' && active !== v?.id) {
                                         setActive(v.id);
                                     }else if(v.id){
                                         setActive(undefined)
                                     }
                                 }}
                            >

                                <SectionView
                                    attributes={attr?.attributes}
                                    key={v?.id || i}
                                    i={i}
                                    value={v}
                                    siteType={siteType}
                                    apiLoad={apiLoad}
                                    apiUpdate={apiUpdate}
                                    format={format}
                                    isActive={v?.element?.['element-type'] === 'Spreadsheet' ? active === v?.id : undefined}
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
                }, 100);
            }
        }
    }, [location]);

    return null;
};

const AddSectionButton = ({onClick}) => {
    const { theme:fullTheme = {}, UI} = React.useContext(ThemeContext);
    const theme = getComponentTheme(fullTheme, 'pages.sectionArray')
    const {Icon} = UI;
    return (
        <div
            className={`
                ${theme?.sectionPadding}
                ${theme?.sectionEditWrapper}
                ${theme?.sizes?.["1"]?.className}
                ${theme?.rowspans?.["1"]?.className}
            `}
        >
            <div className={theme?.sectionEditHover} />
                <div
                    onClick={onClick}
                    className={theme?.addSectionButton}>
                    <div className={theme?.spacer} />
                    <div className={theme?.addSectionIconWrapper}>
                        <div><Icon icon='InsertSection' className={theme?.addSectionIcon}/></div>
                    </div>
                    <div className={theme?.spacer} />
                </div>
        </div>
    )
}
