import {useEffect} from "react";
import get from "lodash/get"
import isEqual from "lodash/isEqual"

import {dmsDataTypes} from "../../../../index"

import FilterableSearch from "./FilterableSearch.jsx";

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
    const {value, onChange, size, ...rest} = props
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

    // console.log('RegisteredComponents', RegisteredComponents)

    let DataComp = (RegisteredComponents[get(value, "element-type", "lexical")] || RegisteredComponents['lexical']).EditComp

    const handlePaste = async (e) => {
        e.preventDefault();

        try{
            const text = await navigator.clipboard.readText();
            const copiedValue = isJson(text) && JSON.parse(text || '{}');
            if(!copiedValue || !copiedValue['element-type']) return;

            updateAttribute('element-type', copiedValue['element-type']);
            onChange({...value, ...copiedValue});
        }catch (e) {
            console.error('<paste>', e)
        }
    }
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
                            onClick: handlePaste
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
                    value={value?.['element-data'] || ''}
                    onChange={v => updateAttribute('element-data', v)}
                    size={size}
                    {...rest}
                />
            </div>
        </div>
    )
}

function ViewComp({value, ...rest}) {
    // if (!value) return false
    // console.log('selector view', rest)
    let Comp = RegisteredComponents[get(value, "element-type", 'lexical')] ?
        RegisteredComponents[get(value, "element-type", "lexical")].ViewComp :
        () => <div> Component {value["element-type"]} Not Registered </div>

    return (
        <Comp value={value?.['element-data'] || ''} {...rest}/>
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

