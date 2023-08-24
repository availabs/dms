import React from "react"
import { useTheme } from '../theme'


const Edit = ({value = '', onChange, className, placeholder}) => {
    const theme = useTheme()
    return (
        <input
            className={ className || (theme?.text?.input || 'w-full border p-2')}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
        />
    )
}

const View = ({value, className}) => {
    if (!value) return false
    const theme = useTheme()
    return (
        <div
            className={ className || (theme?.text?.view)}
        >
            {value}
        </div>
    )
}

export default {
    "EditComp": Edit,
    "ViewComp": View
}