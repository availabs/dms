import React, {useContext} from 'react'
import ColumnControls from "./ColumnControls";
import MoreControls from "./MoreControls";
import {ComponentContext} from "~/modules/dms/src/patterns/page/siteConfig";

const controlComponents = {
    columns: ColumnControls,
    more: MoreControls
}

export const Controls = ({context=ComponentContext}) => {
    const {controls= {}} = useContext(context);
    return (
        <div className={'flex items-center'}>
            {
                Object.keys(controls).map(control => {
                    const Component = controls[control]?.Comp || controlComponents[control];

                    if (!Component) return null;
                    return <Component key={control} context={context}/>
                })
            }
        </div>
    )
}