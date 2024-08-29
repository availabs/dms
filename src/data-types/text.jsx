import React, {useEffect, useState} from "react"
import { useTheme } from '../theme'


const Edit = ({value = '', onChange, className, placeholder, ...rest}) => {
    const [tmpValue, setTmpValue] = useState(value)
    const theme = useTheme()

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
    const theme = useTheme()
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