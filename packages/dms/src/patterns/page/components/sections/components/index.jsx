import React, {useEffect, useImperativeHandle} from "react";
import {isEqual} from "lodash-es";
import DataWrapper from "./dataWrapper";
import {Controls} from "./dataWrapper/components/Controls";
import {RenderFilters} from "./dataWrapper/components/filters/RenderFilters";
import {PageContext, ComponentContext} from '../../../context'

function EditComp({value, onChange, compKey, component, siteType, pageFormat}) {

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

    const DataComp = component.useDataWrapper ? DataWrapper.EditComp : component.EditComp;

    return (
        <>
                {/* controls with datasource selector */}
                <Controls />
                <RenderFilters isEdit={true} defaultOpen={true} />
                <DataComp
                    key={compKey || ''}
                    value={value?.['element-data'] || ''}
                    onChange={v => updateAttribute('element-data', v)}
                    component={component?.useDataWrapper ? component : undefined}
                    siteType={siteType}
                    pageFormat={pageFormat}
                />
        </>
    )
}

function ViewComp({value, onChange, siteType, pageFormat, refreshDataBtnRef, component}) {
    const { apiLoad } =  React.useContext(PageContext) || {}
    const { state } = React.useContext(ComponentContext);
    const defaultComp = () => <div> Component {value["element-type"]} Not Registered </div>;

    const updateAttribute = (k, v) => {
        if (!isEqual(value, {...value, [k]: v})) {
            onChange({...value, [k]: v})
        }
    }

    let DataComp =
        !component ? defaultComp :
            component.useDataWrapper ? DataWrapper.ViewComp :
                component.ViewComp;



    async function refresh({setIsRefreshingData, fullDataLoad, clearCache}) {
        if(clearCache) {
            updateAttribute('element-data', JSON.stringify({...state, ['fullData'] : undefined}));
            return;
        }

        //console.log('refresh component', component)

        const getData = (component.useDataWrapper ? DataWrapper : component)?.getData;
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
                      onChange={v => updateAttribute('element-data', v)}
                      component={component?.useDataWrapper ? component : undefined}
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
