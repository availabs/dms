import React from "react"
import { useTheme } from '../theme'
import get from 'lodash/get'

const Edit = ({value, onChange}) => {
    return (
        <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
        />      
    )
}

const View = ({value}) => {
    const theme = useTheme()
    if (!value) return false
    return (
        <pre className={get(theme,'textarea.viewWrapper','')}>
            {JSON.stringify(value,null,3)}
        </pre>
    )
}


export default {
    "EditComp": Edit,
    "ViewComp": View
}