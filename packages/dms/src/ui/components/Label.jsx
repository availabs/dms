import React from "react";
import {ThemeContext} from '../useTheme'

export const labelTheme = {
    labelWrapper: 'px-[12px] pt-[9px] pb-[7px] rounded-md',
    label: 'font-sans text-sm font-medium text-[var(--t-ink)]'
}

export const docs = {
    text: 'Label Text'
}
export default function Label ({text, children}) {
    const { theme: themeFromContext = {}} = React.useContext(ThemeContext);
    const theme = {...themeFromContext, label: {...labelTheme, ...(themeFromContext.label || {})}};
    return (
        <div className={`${theme.label.labelWrapper}`}>
            <span className={`${theme.label.label}`}>{text || children}</span>
        </div>
    )
}