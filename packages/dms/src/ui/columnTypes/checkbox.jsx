import React, {useEffect, useRef, useState} from "react"
import { ThemeContext, getComponentTheme } from "../useTheme"
import { checkboxTheme } from "./checkbox.theme"

// checkbox column type. The look comes from theme.checkbox's named styles (checkbox.theme.js), picked by the
// column's `activeStyle`. A host's `className` (the table cell passes one) is overridden: {...rest} comes before
// className={t.input} (owner 2026-10-15: themed like the other components, no className).
// `rowLabel` (optional): text shown after the checkbox; the two then sit in one themed <label> (`row` / `label` keys),
// so clicking the text toggles it. Named `rowLabel`, not `label`: table cells spread the whole column object in.
// `indeterminate` (optional): the part-ticked look (e.g. a tree parent with some children ticked). It is a DOM
// property, not an attribute, so it is set on the element.


export const CheckboxEdit = ({value = '', onChange, placeholder, trueValue=true, activeStyle, rowLabel, indeterminate = false, ...rest}) => {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...checkboxTheme.styles[0], ...getComponentTheme(themeFromContext, 'checkbox', activeStyle) };
    const [tmpValue, setTmpValue] = useState(value)
    const inputRef = useRef(null);


    useEffect(() => setTmpValue(value), [value]);
    useEffect(() => { if (inputRef.current) inputRef.current.indeterminate = !!indeterminate; }, [indeterminate]);
    const input = (
        <input
            {...rest}
            ref={inputRef}
            type="checkbox"
            className={t.input}
            checked={tmpValue === trueValue}
            onChange={(e) => {
                const newValue = e.target.checked ? trueValue : undefined;
                setTmpValue(newValue);
                onChange?.(newValue);
            }}
        />
    );
    if (rowLabel === undefined || rowLabel === null) return input;
    return (
        <label className={t.row}>
            {input}
            <span className={t.label}>{rowLabel}</span>
        </label>
    )
}

export const CheckboxView = ({value, trueValue=true, onChange, activeStyle, rowLabel, ...rest}) => {
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
            {rowLabel !== undefined && rowLabel !== null ? <span className={t.label}>{rowLabel}</span> : null}
        </div>
    )
}

