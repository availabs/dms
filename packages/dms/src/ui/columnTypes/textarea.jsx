import React, {useEffect, useState} from "react"

import { get } from "lodash-es"

const theme = {
    textarea: {
        input: 'px-2 py-1 w-full text-sm font-light border rounded-md focus:border-blue-300 focus:outline-none transition ease-in',
        viewWrapper: 'whitespace-normal text-sm font-light'
    }
}
export const TextareaEdit = ({value, onChange, className, placeholder, ...rest}) => {
    const [tmpValue, setTmpValue] = useState(value || '')

    useEffect(() => {
        if(value !== tmpValue) setTmpValue(value)
    }, [value]);
    return (
        <textarea
            className={ className || (theme?.textarea?.input || 'w-full border p-2')}
            value={tmpValue}
            placeholder={placeholder}
            onChange={(e) => {
                setTmpValue(e.target.value)
                onChange(e.target.value)
            }}
            {...rest}
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