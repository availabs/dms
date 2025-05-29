import React, {useEffect, useState} from "react";

import { get, isEqual } from "lodash-es";
import { v4 as uuidv4 } from "uuid";

//import DataWrapper from "./dataWrapper";
import { Controls } from "./dataWrapper/components/Controls";

import { convertOldState } from "./dataWrapper/utils/convertOldState";
import { RenderFilters } from "./dataWrapper/components/filters/RenderFilters";
import FilterableSearch from "./FilterableSearch";

import { CMSContext, ComponentContext, PageContext } from '../../../context'
import ComponentRegistry from './ComponentRegistry'


// const convertOldState = d => d
// const RenderFilters = () => <div/>
// const FilterableSearch = () => <div/>
//const ComponentRegistry = {}


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

const initialState = defaultState => {
    if(defaultState && Object.keys(defaultState).length) return defaultState;

    return {
        // user controlled part
        columns: [
            //     visible columns or Actions
            //     {name, display_name, custom_name,
            //      justify, width, fn,
            //      groupBy: t/f, orderBy: t/f, excludeNull: t/f, openOut: t/f,
            //      formatFn, fontSize, hideHeader, cardSpan,
            //      isLink: t/f, linkText: ‘’, linkLocation: ‘’, actionName, actionType, icon,
            //      }
        ],
        display: {
            usePageFilters: false,
            usePagination: true,
            pageSize: 5,
            totalLength: 0,
            showGutters: false,
            transform: '', // transform fn to be applied
            loadMoreId:`id${uuidv4()}`,
            showAttribution: true,
        },
        // wrapper controlled part
        dataRequest: {},
        data: [],
        sourceInfo: {
            columns: [],
            // pgEnv,
            // source_id
            // view_id
            // version,
            // doc_type, type -- should be the same
        }
    }
}

function EditComp(props) {

    const {value, onChange, size, handlePaste, pageformat, ...rest} = props;
    const { theme } = React.useContext(CMSContext);
    const { pageState, editPane, apiLoad, apiUpdate, format, ...r  } =  React.useContext(PageContext) || {}
    const [state, setState] = useImmer(convertOldState(value?.['element-data'] || '', initialState(component.defaultState)));
    const [key, setKey] = useState();

    const updateAttribute = (k, v) => {
        if (!isEqual(value, {...value, [k]: v})) {
            onChange({...value, [k]: v})
        }
    }

    useEffect(() => {
        if (!value?.['element-type']) {
            onChange({...value, 'element-type': 'lexical'})
        }
    }, []);

    const component = (RegisteredComponents[get(value, "element-type", "lexical")] || RegisteredComponents['lexical']);
    //const DataComp = component.useDataSource ? DataWrapper.EditComp : component.EditComp;
    let DataComp = component.EditComp


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

                        } else if(e){
                            const component = (RegisteredComponents[e]);
                            onChange({...value, 'element-type': e, 'element-data': initialState(component.defaultState)})
                            setState(initialState(component.defaultState))
                        }
                    }}
                    filters={[
                        {
                            icon: 'fa-thin fa-paste',
                            label: 'Paste',
                            value: 'paste',
                            onClick: e => handlePaste(e, setKey, setState)
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
            <ComponentContext.Provider value={{
                state, setState, apiLoad,
                compType: component.name.toLowerCase(), // should be deprecated
                controls: component.controls,
                app: pageformat?.app
            }}>
                {/* controls with datasource selector */}
                {/*<Controls />*/}
                <RenderFilters state={state} setState={setState} apiLoad={apiLoad} isEdit={true} defaultOpen={true} />
                <DataComp
                    key={key || ''}
                    value={value?.['element-data'] || ''}
                    state={state}
                    setState={setState}
                    onChange={v => updateAttribute('element-data', v)}
                    size={size}
                    component={component?.useDataSource ? component : undefined}
                    apiLoad={apiLoad}
                    {...rest}
                />
            </ComponentContext.Provider>
        </div>
    )
}

function ViewComp({value, ...rest}) {

    const { theme } = React.useContext(CMSContext);
    const { pageState, editPane, apiLoad, apiUpdate, format, ...r  } =  React.useContext(PageContext) || {}
    const defaultComp = () => <div> Component {value["element-type"]} Not Registered </div>;

    const component = (RegisteredComponents[get(value, "element-type", "lexical")] || defaultComp);
    const [state, setState] = useImmer(convertOldState(value?.['element-data'] || '', initialState(component?.defaultState)));


    // let DataComp = !component ? 
    //     defaultComp : component.useDataSource ? 
    //     DataWrapper.ViewComp : component.ViewComp;
     let DataComp = !component ? 
        defaultComp : component.ViewComp;
    
    return (
        <ComponentContext.Provider value={{state, setState, apiLoad, controls: component.controls}}>
            <RenderFilters state={state} setState={setState} apiLoad={apiLoad} isEdit={false} defaultOpen={true}/>
            <DataComp value={value?.['element-data'] || ''}
                      state={state} setState={setState}
                      theme={theme} {...rest}
                      component={component?.useDataSource ? component : undefined}
                      apiLoad={apiLoad}
            />
        </ComponentContext.Provider>
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

