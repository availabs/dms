import React, {useEffect, useState} from "react"
//import {ThemeContext} from "../useTheme";
import textTheme from "./text.theme";

const theme = {
  text: textTheme
}

const Edit = ({value = '', onChange, className, placeholder, ...rest}) => {
    // const {theme: themeFromContext={}} = React.useContext(ThemeContext) || {};
    // const theme = {...themeFromContext, text: {...textTheme, ...(themeFromContext.text || {})}}
    const [tmpValue, setTmpValue] = useState(value && typeof value === 'object' ? JSON.stringify(value) : value)

    useEffect(() => setTmpValue(value), [value]);
    return (
        <input
            type={''}
            {...rest}
            className={`${className} ${theme?.text?.input}`}
            value={tmpValue}
            placeholder={placeholder}
            onChange={(e) => {
                setTmpValue(e.target.value)
                onChange(e.target.value)
            }}
        />
    )
}

const View = ({value, className, ...rest}) => {
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

export default {
    "EditComp": Edit,
    "ViewComp": View
}
