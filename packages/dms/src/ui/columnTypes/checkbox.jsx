import React, {useEffect, useState} from "react"


const theme = {
    text: {
        input: 'px-2 py-1 w-full text-sm font-light border rounded-md focus:border-blue-300 bg-white focus:outline-none transition ease-in',
        view: 'text-sm font-light truncate bg-red-500'
    }
}

const Edit = ({value = '', onChange, className, placeholder, trueValue=true, ...rest}) => {
    const [tmpValue, setTmpValue] = useState(value)


    useEffect(() => setTmpValue(value), [value]);
    return (
        <input
            {...rest}
            type="checkbox"
            className={className || "w-full border p-2"}
            checked={tmpValue === trueValue}
            onChange={(e) => {
                const newValue = e.target.checked ? trueValue : undefined;
                setTmpValue(newValue);
                onChange?.(newValue);
            }}
        />
    )
}

const View = ({value, className, trueValue=true, ...rest}) => {
    if (!value) return false

    return (
        <div
            className={ className || (theme?.text?.view)}
        >
            <input
                {...rest}
                type={'checkbox'}
                className={ className || (theme?.text?.input || 'w-full border p-2')}
                checked={value === trueValue}
                disabled={false}
            />        </div>
    )
}

export default {
    "EditComp": Edit,
    "ViewComp": View
}