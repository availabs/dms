import React from "react";
import {CMSContext} from "../../../siteConfig";

export const labelTheme = {
    labelWrapper: 'px-[12px] pt-[9px] pb-[7px] rounded-md',
    label: 'inline-flex items-center rounded-md px-1.5 py-0.5 text-sm/5 font-medium sm:text-xs/5 forced-colors:outline'
}

export default function ({text}) {
    const { theme = { label: labelTheme } } = React.useContext(CMSContext) || {};
    return (
        <div className={`${theme.label.labelWrapper}`}>
            <span className={`${theme.label.label}`}>{text}</span>
        </div>
    )
}