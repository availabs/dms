import React, {useEffect, useState} from "react"
import { Textarea } from "../components/Input"

const theme = {
    textarea: {
        viewWrapper: 'whitespace-normal text-sm font-light'
    }
}

// Mirrors text.jsx — cards occasionally pass values containing back-refs that
// JSON.stringify can't serialize. Coerce safely so we never throw mid-render.
const toInputValue = (v) => {
    if (v == null || typeof v !== 'object') return v ?? '';
    try { return JSON.stringify(v); }
    catch { return String(v); }
};

export const TextareaEdit = ({value, onChange, className, placeholder,
    // Destructure non-DOM props so they don't reach <textarea>
    loading, singleSelectOnly, displayDetailedValues, keepMenuOpen,
    tabular, displayInvalidMsg, onSearch, theme: _theme, format,
    ...rest}) => {
    const [tmpValue, setTmpValue] = useState(() => toInputValue(value))

    useEffect(() => {
        const next = toInputValue(value);
        if (next !== tmpValue) setTmpValue(next);
    }, [value]);
    return (
        <Textarea
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

export const TextareaView = ({value}) => {
    if (!value) return false
    return (
        <div className={theme?.textarea?.viewWrapper}>
            {typeof value === "object" ? JSON.stringify(value) : value}
        </div>
    )
}