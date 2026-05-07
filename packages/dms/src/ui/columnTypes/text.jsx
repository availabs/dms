import React, {useEffect, useState} from "react"
import Input from "../components/Input"
import textTheme from "./text.theme";

const theme = {
  text: textTheme
}

// Card cells occasionally receive values that are objects containing a React
// fiber or DOM node back-reference, which makes them cyclic. Stringify
// defensively so the input falls back to a primitive instead of throwing.
const toInputValue = (v) => {
    if (v == null || typeof v !== 'object') return v;
    try { return JSON.stringify(v); }
    catch { return String(v); }
};

export const TextEdit = ({value = '', onChange, className, placeholder,
    // Destructure non-DOM props so they don't get spread onto <input>
    loading, singleSelectOnly, displayDetailedValues, keepMenuOpen,
    tabular, displayInvalidMsg, onSearch, theme: _theme, format,
    ...rest}) => {
    const [tmpValue, setTmpValue] = useState(() => toInputValue(value));

    useEffect(() => setTmpValue(toInputValue(value)), [value]);
    return (
        <Input
            {...rest}
            value={tmpValue}
            placeholder={placeholder}
            onChange={(e) => {
                setTmpValue(e.target.value)
                onChange(e.target.value)
            }}
        />
    )
}

export const TextView = ({value, className, ...rest}) => {
    // const {theme: themeFromContext={}} = React.useContext(ThemeContext) || {};
    // const theme = {...themeFromContext, text: {...textTheme, ...(themeFromContext.text || {})}}
    if (!value) return (
        <div
            className={ className || (theme?.text?.view)}
        ></div>
    )

    return (
        <div
            className={ className || (theme?.text?.view)}
        >
            {typeof value === "object" ? JSON.stringify(value) : value}
        </div>
    )
}

