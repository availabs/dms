import React from "react"
import { useTheme } from '../theme'
import get from 'lodash/get'

const Edit = ({value, onChange, className, placeholder}) => {
    const theme = useTheme()
    return (
        <textarea
            className={ className || (theme?.textarea?.input || 'w-full border p-2')}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
        />      
    )
}

const View = ({value}) => {
    const theme = useTheme()
    if (!value) return false
    return (
        <div className={get(theme,'textarea.viewWrapper','')}>
            {value}
        </div>
    )
}


export default {
    "EditComp": Edit,
    "ViewComp": View
}