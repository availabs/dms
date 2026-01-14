import React, { useContext } from 'react'
import ColumnControls from "./ColumnControls";
import MoreControls from "./MoreControls";
import { ComponentContext, CMSContext } from "../../../../../context";

const controlComponents = {
    columns: ColumnControls,
    more: MoreControls
}

export const Controls = ({context=ComponentContext, cms_context=CMSContext}) => {
    const {controls= {}} = useContext(context);
    return (
        <div className={'flex items-center'}>
            {
                Object.keys(controls).map(control => {
                    const Component = controls[control]?.Comp || controlComponents[control];

                    if (!Component) return null;
                    return <Component key={control} context={context} cms_context={cms_context}/>
                })
            }
        </div>
    )
}