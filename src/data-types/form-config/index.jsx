import React, {useEffect, useMemo, useState} from "react"
import {useTheme} from '../../theme'
import {RenderField} from "./components/RenderField";
import {RenderAddField} from "./components/RenderAddField";
import {Alert} from "../../patterns/forms/ui/icons"
const parseJson = value => {
    try {
        return JSON.parse(value)
    } catch (e) {
        return value
    }
}

const Edit = ({value = '{}', onChange, className, placeholder, manageTemplates, apiLoad, format, ...rest}) => {
    const theme = useTheme()
    const [item, setItem] = useState(parseJson(value))
    const [search, setSearch] = useState('');

    useEffect(() => setItem(parseJson(value)), [value]);

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
                <input className={'p-2 mb-2 w-full border rounded-md shrink'} value={search}
                       onChange={e => setSearch(e.target.value)} placeholder={'search...'}/>
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
                                attribute.display_name.toLowerCase().includes(search.toLowerCase()))
                        )
                        .map((attribute, i) => {
                            return (
                                <RenderField i={i} item={attribute} placeholder={placeholder} id={`field-comp-${i}`} key={`field-comp-${i}`}
                                             attribute={attribute?.name}
                                             theme={theme} updateAttribute={updateAttribute}
                                             removeAttribute={removeAttribute} apiLoad={apiLoad} format={format}/>
                            )
                        })
                }
            </div>

            <div className={'w-full p-2'}>
                <RenderAddField attributes={item.attributes} placeholder={'New field name...'} theme={theme}
                          className={className} addAttribute={addAttribute}/>
            </div>
        </div>
    )
}

const View = ({value, className}) => {
    if (!value) return false
    const theme = useTheme()
    return (
        <div
            className={className || (theme?.text?.view)}
        >
            {value}
        </div>
    )
}

export default {
    "EditComp": Edit,
    "ViewComp": View
}