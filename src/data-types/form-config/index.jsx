import React, {useEffect, useMemo, useState} from "react"
import {useTheme} from '../../theme'
import {RenderField} from "./components/RenderField";
import {RenderAddField} from "./components/RenderAddField";

const labelClass = 'font-light capitalize font-gray-700';

const parseJson = value => {
    try {
        return JSON.parse(value)
    } catch (e) {
        return value
    }
}

const Edit = ({value = '{}', onChange, className, placeholder, manageTemplates, ...rest}) => {
    //console.log('form-config', value, rest)
    const theme = useTheme()
    const [item, setItem] = useState(parseJson(value))

    useEffect(() => setItem(parseJson(value)), [value]);

    const updateAttribute = (col, value) => {
        const newAttribute = (item?.attributes || []).map(column => column.name === col ? {...column, ...value} : column)
        const newItem = {...item, 'attributes': newAttribute}
        setItem(newItem)
        onChange(JSON.stringify(newItem))
    }

    const addAttribute = (value) => {
        // here, value is the new attribute. this triggers on changing the name field.
        // value should be {name: 'xyz'}. after this triggers, the field controls are presented and edited via updateAttributes.
        const newItem = {...item, 'attributes': [...(item.attributes || []), value]}
        setItem(newItem)
        onChange(JSON.stringify(newItem))
    }

    const removeAttribute = (col) => {
        // here, value is the new attribute. this triggers on changing the name field.
        // value should be {name: 'xyz'}. after this triggers, the field controls are presented and edited via updateAttributes.
        const newItem = {...item, 'attributes': item.attributes.filter(attr => attr.name !== col)}
        setItem(newItem)
        onChange(JSON.stringify(newItem))
    }

    return <div className={'border-2 p-2'}>
        <div>managing {manageTemplates ? 'templates' : 'config'}</div>
        <label className={labelClass}>Manage Config</label>
        {
            Object.keys(item)
                .filter(attribute => attribute === 'attributes')
                .map(attribute => {
                    return (
                        <div className={'w-full p-2'}>
                            <RenderField item={item} placeholder={placeholder} attribute={attribute} theme={theme}
                                         className={className} updateAttribute={updateAttribute}
                                         removeAttribute={removeAttribute}/>
                        </div>
                    )
                })
        }
        <div className={'w-full p-2'}>
            <RenderAddField item={{}} placeholder={'New field name...'} theme={theme}
                      className={className} addAttribute={addAttribute}/>
        </div>
    </div>
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