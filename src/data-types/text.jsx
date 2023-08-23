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

const View = ({value}) => {
    if (!value) return false
    return (
        <div>
            {value}
        </div>
    )
}

export default {
    "EditComp": Edit,
    "ViewComp": View
}