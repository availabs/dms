import React, {useContext, useEffect, useRef, useState} from "react"
import {cloneDeep} from "lodash-es";

import {RenderField} from "./components/RenderField";
import {RenderAddField} from "./components/RenderAddField";
import {Alert} from "../../../ui/icons"
import {FormsContext} from "../../../siteConfig";

const parseJson = value => {
    try {
        return JSON.parse(value)
    } catch (e) {
        return value
    }
}

export default ({value = '{}', onChange, className, apiLoad, format}) => {
    const {UI} = useContext(FormsContext)
    const {Input} = UI;
    const theme = {}//useTheme()
    const [item, setItem] = useState(parseJson(value))
    const [search, setSearch] = useState('');
    const dragItem = useRef();
    const dragOverItem = useRef();

    useEffect(() => setItem(parseJson(value)), [value]);

    // ================================================== drag utils start =============================================
    const dragStart = (e, position) => {
        dragItem.current = position;
        e.dataTransfer.effectAllowed = "move";
    };

    const dragEnter = (e, position) => {
        dragOverItem.current = position;
    };
    const dragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const drop = (e) => {
        const copyListItems = cloneDeep(item.attributes);
        const dragItemContent = copyListItems[dragItem.current];
        copyListItems.splice(dragItem.current, 1);
        copyListItems.splice(dragOverItem.current, 0, dragItemContent);
        dragItem.current = null;
        dragOverItem.current = null;
        const newItem = {...item, 'attributes': copyListItems}
        setItem(newItem)
        onChange(JSON.stringify(newItem))
    };
    // ================================================== drag utils end ===============================================

    // after changing meta, set a flag to say validation needs to re-run
    const updateAttribute = (col, value) => {
        const newAttribute = (item?.attributes || []).map(column => column.name === col ? {...column, ...value} : column)
        const newItem = {...item, 'attributes': newAttribute, is_dirty: true}
        setItem(newItem)
        onChange(JSON.stringify(newItem))
    }

    const addAttribute = (value) => {
        // here, value is the new attribute. this triggers on changing the name field.
        // value should be {name: 'xyz'}. after this triggers, the field controls are presented and edited via updateAttributes.
        const newItem = {...item, 'attributes': [...(item.attributes || []), value], is_dirty: true}
        setItem(newItem)
        onChange(JSON.stringify(newItem))
    }

    const removeAttribute = (col) => {
        const newItem = {...item, 'attributes': item.attributes.filter(attr => attr.name !== col), is_dirty: true}
        setItem(newItem)
        onChange(JSON.stringify(newItem))
    }

    return (
        <div className={'p-2'}>
            <div className={'w-full'}>
                <Input value={search} onChange={e => setSearch(e.target.value)} placeHolder={'search...'}/>
                {
                    item.is_dirty ?
                        <div className={'flex text-sm italic items-center'}>
                            <Alert className={'text-yellow-600 cursor-pointer mx-1'}/>
                            <span>Metadata has changed since last data validation. Please re-run validate to ensure accuracy.</span>
                        </div> : null
                }
            </div>
            <div className={'max-h-[74dvh] overflow-auto scrollbar-sm'}>
                {
                    (item?.attributes || [])
                        .filter(attribute =>
                            !search ||
                            (attribute.name.toLowerCase().includes(search.toLowerCase()) ||
                                attribute.display_name?.toLowerCase()?.includes(search.toLowerCase()))
                        )
                        .map((attribute, i) => {
                            return (
                                <RenderField i={i} item={attribute} id={`field-comp-${i}`} key={`field-comp-${i}`}
                                             attribute={attribute?.name}
                                             attributeList={(item.attributes || []).map(a => a.name)}
                                             theme={theme} updateAttribute={updateAttribute}
                                             removeAttribute={removeAttribute} apiLoad={apiLoad} format={format}
                                             dragStart={dragStart} dragEnter={dragEnter} dragOver={dragOver} drop={drop}
                                />
                            )
                        })
                }
            </div>

            <div className={'w-full p-2'}>
                <RenderAddField attributes={item.attributes} placeHolder={'New field name...'} theme={theme}
                          className={className} addAttribute={addAttribute}/>
            </div>
        </div>
    )
}