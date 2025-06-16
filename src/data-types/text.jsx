import React, {useEffect, useState} from "react"


const theme = {
    text: {
        input: 'px-2 py-1 w-full text-sm font-light border rounded-md focus:border-blue-300 bg-white focus:outline-none transition ease-in',
        view: 'text-sm font-light truncate bg-red-500'
    }
}

const Edit = ({value = '', onChange, className, placeholder, ...rest}) => {
    const [tmpValue, setTmpValue] = useState(value)


    useEffect(() => setTmpValue(value), [value]);
    return (
        <input
            {...rest}
            className={ className || (theme?.text?.input || 'w-full border p-2')}
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
    if (!value) return false

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