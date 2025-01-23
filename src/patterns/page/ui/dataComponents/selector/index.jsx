import React, {useEffect, useState} from "react";
import { get,isEqual } from "lodash-es";

import {dmsDataTypes} from "../../../../../"
import { CMSContext } from '../../../siteConfig'

import FilterableSearch from "./FilterableSearch";

import ComponentRegistry from './ComponentRegistry'

export let RegisteredComponents = ComponentRegistry;


export const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}


const icons = {
    card: 'fa-thin fa-credit-card',
    table: 'fa-thin fa-table',
    graph: 'fa-thin fa-chart-column',
    map: 'fa-thin fa-map',
    'lexical': 'fa-thin fa-text'
}

function EditComp(props) {
    const {value, onChange, size, handlePaste, ...rest} = props;
    const { theme } = React.useContext(CMSContext);
    const [key, setKey] = useState();
    // console.log("selector props", props, value)
    // console.log('selector edit', rest)
    const updateAttribute = (k, v) => {
        if (!isEqual(value, {...value, [k]: v})) {
            onChange({...value, [k]: v})
        }
        //console.log('updateAttribute', value, k, v, {...value, [k]: v})
    }

    useEffect(() => {
        if (!value?.['element-type']) {
            onChange({...value, 'element-type': 'lexical'})
        }
    }, []);

    console.log('RegisteredComponents', RegisteredComponents, value?.['element-type'])

    let DataComp = (RegisteredComponents[get(value, "element-type", "lexical")] || RegisteredComponents['lexical']).EditComp

    return (
        <div className="w-full">
            <div className="relative my-1">
                {/*Selector Edit*/}
                <FilterableSearch
                    contentEditable={true}
                    className={'flex-row-reverse'}
                    placeholder={'Search for a Component...'}
                    options={
                        Object.keys(RegisteredComponents)
                            .filter(k => !RegisteredComponents[k].hideInSelector)
                            .map(k => (
                            {
                                key: k, label: RegisteredComponents[k].name || k
                            }
                        ))
                    }
                    value={value?.['element-type']}
                    onChange={async e => {
                        if (e === 'paste') {

                        } else {
                            updateAttribute('element-type', e)
                        }
                    }}
                    filters={[
                        {
                            icon: 'fa-thin fa-paste',
                            label: 'Paste',
                            value: 'paste',
                            onClick: e => handlePaste(e, setKey)
                        },
                        ...[...new Set(
                            Object.keys(RegisteredComponents)
                                .filter(k => !RegisteredComponents[k].hideInSelector)
                                .map(key => (RegisteredComponents[key].name || key).split(':')[0]))]
                            .map(c => (
                                {
                                    icon: `${icons[c.toLowerCase()] || c.toLowerCase()}`,
                                    label: c,
                                    filterText: c
                                }
                            ))
                    ]}
                />
            </div>
            <div>
                <DataComp
                    key={key || ''}
                    value={value?.['element-data'] || ''}
                    onChange={v => updateAttribute('element-data', v)}
                    size={size}
                    theme={theme}
                    {...rest}
                />
            </div>
        </div>
    )
}

function ViewComp({value, ...rest}) {
    // if (!value) return false
    // console.log('selector view', rest)
    const { theme } = React.useContext(CMSContext);
    let Comp = RegisteredComponents[get(value, "element-type", 'lexical')] ?
        RegisteredComponents[get(value, "element-type", "lexical")].ViewComp :
        () => <div> Component {value["element-type"]} Not Registered </div>

    return (
        <Comp value={value?.['element-data'] || ''} theme={theme} {...rest}/>
    )
}

const Selector = {
    EditComp,
    ViewComp
}

export default Selector

export const registerComponents = (comps = {}) => {
    RegisteredComponents = {...RegisteredComponents, ...comps}
} 

