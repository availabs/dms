import React from "react";
import {ThemeContext} from '../useTheme'

export const labelTheme = {
    labelWrapper: 'px-[12px] pt-[9px] pb-[7px] rounded-md',
    label: 'inline-flex items-center rounded-md px-1.5 py-0.5 text-sm/5 font-medium sm:text-xs/5 forced-colors:outline'
}

export default function ({text, children}) {
    const { theme = {label: labelTheme}} = React.useContext(ThemeContext);
    return (
        <div className={`${theme.label.labelWrapper}`}>
            <span className={`${theme.label.label}`}>{text || children}</span>
        </div>
    )
}