import React, {useEffect, useState} from "react"
import { ThemeContext, getComponentTheme } from "../useTheme"
import { checkboxTheme } from "./checkbox.theme"

// checkbox column type. The look comes from theme.checkbox's named styles (checkbox.theme.js), picked by the
// column's `activeStyle`. A host's `className` (the table cell passes one) is overridden: {...rest} comes before
// className={t.input} (owner 2026-10-15: themed like the other components, no className).


export const CheckboxEdit = ({value = '', onChange, placeholder, trueValue=true, activeStyle, ...rest}) => {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...checkboxTheme.styles[0], ...getComponentTheme(themeFromContext, 'checkbox', activeStyle) };
    const [tmpValue, setTmpValue] = useState(value)


    useEffect(() => setTmpValue(value), [value]);
    return (
        <input
            {...rest}
            type="checkbox"
            className={t.input}
            checked={tmpValue === trueValue}
            onChange={(e) => {
                const newValue = e.target.checked ? trueValue : undefined;
                setTmpValue(newValue);
                onChange?.(newValue);
            }}
        />
    )
}

export const CheckboxView = ({value, trueValue=true, onChange, activeStyle, ...rest}) => {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...checkboxTheme.styles[0], ...getComponentTheme(themeFromContext, 'checkbox', activeStyle) };

    return (
        <div className={t.wrapper}>
            <input
                {...rest}
                type={'checkbox'}
                className={t.input}
                checked={value === trueValue}
                disabled={true}
                onChange={() => {}}
            />
        </div>
    )
}

