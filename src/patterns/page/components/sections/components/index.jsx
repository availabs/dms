import React, {useEffect, useImperativeHandle, useState} from "react";
import {isEqual} from "lodash-es";
import DataWrapper from "./dataWrapper";
import {Controls} from "./dataWrapper/components/Controls";
import {RenderFilters} from "./dataWrapper/components/filters/RenderFilters";
import FilterableSearch from "./FilterableSearch";

import {ComponentContext, PageContext} from '../../../context'
import {ThemeContext} from "../../../../../ui/useTheme";
import {RegisteredComponents} from "../section";


const icons = {
    card: 'fa-thin fa-credit-card',
    table: 'fa-thin fa-table',
    graph: 'fa-thin fa-chart-column',
    map: 'fa-thin fa-map',
    'lexical': 'fa-thin fa-text'
}

function EditComp({value, onChange, handlePaste, component, siteType, pageFormat}) {
    const [key, setKey] = useState(); // only used for pasting lexical component

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

    const DataComp = component.useDataSource ? DataWrapper.EditComp : component.EditComp;

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
                            const defaultState = e === 'lexical' ? undefined : initialState(component.defaultState);
                            onChange({...value, 'element-type': e, 'element-data': defaultState})
                            setState(defaultState)
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

                {/* controls with datasource selector */}
                <Controls />
                <RenderFilters isEdit={true} defaultOpen={true} />
                <DataComp
                    key={key || ''}
                    value={value?.['element-data'] || ''}
                    onChange={v => updateAttribute('element-data', v)}
                    component={component?.useDataSource ? component : undefined}
                    siteType={siteType}
                    pageFormat={pageFormat}
                />
        </div>
    )
}

function ViewComp({value, onChange, siteType, pageFormat, refreshDataBtnRef, component}) {
    const { apiLoad } =  React.useContext(PageContext) || {}
    const defaultComp = () => <div> Component {value["element-type"]} Not Registered </div>;

    const updateAttribute = (k, v) => {
        if (!isEqual(value, {...value, [k]: v})) {
            onChange({...value, [k]: v})
        }
    }

    let DataComp =
        !component ? defaultComp :
            component.useDataSource ? DataWrapper.ViewComp :
                component.ViewComp;



    async function refresh({setIsRefreshingData, fullDataLoad, clearCache}) {
        if(clearCache) {
            updateAttribute('element-data', JSON.stringify({...state, ['fullData'] : undefined}));
            return;
        }

        const getData = (component.useDataSource ? DataWrapper : component)?.getData;
        if (!getData) return;
        // console.time('fetching data')
        setIsRefreshingData(true);
        const { data } = await getData({
            state,
            apiLoad,
            keepOriginalValues: component.keepOriginalValues,
            fullDataLoad: component.fullDataLoad || fullDataLoad,
            // debugCall: true
        });
        // console.timeEnd('fetching data')
        updateAttribute('element-data', JSON.stringify({...state, [fullDataLoad ? 'fullData' : 'data'] : data}));
        setIsRefreshingData(false)
    }

    // expose refresh() to parent
    useImperativeHandle(refreshDataBtnRef, () => ({
        refresh: refresh
    }));

    return (
        <>
            <RenderFilters isEdit={false} defaultOpen={true}/>
            <DataComp value={value?.['element-data'] || ''}
                      component={component?.useDataSource ? component : undefined}
                      siteType={siteType}
                      pageFormat={pageFormat}
            />
        </>
    )
}

const Component = {
    EditComp,
    ViewComp
}

export default Component

