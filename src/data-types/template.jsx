import React from "react"
import { useTheme } from '../theme'


const Edit = ({value, item, onChange, className, attributes={}, ...rest}) => {
    // how do i pass pattern attributes here?
    console.log('can i pass item here?', item, value, rest)
    const theme = useTheme()
    return Object.keys(attributes).map(attribute => {
        const EditComp = attributes[attribute].EditComp;

        return <EditComp placeholder={attributes[attribute].key} {...attributes[attribute]} {...rest}/>
    })
    // return (
    //     <input
    //         className={ className || (theme?.text?.input || 'w-full border p-2')}
    //         value={value}
    //         placeholder={placeholder}
    //         onChange={(e) => onChange(e.target.value)}
    //     />
    // )
}

const View = ({value, className, ...rest}) => {
    if (!value) return false
    console.log('template', value, rest)
    const theme = useTheme()
    return (
        <div
            className={ className || (theme?.text?.view)}
        >
            {JSON.stringify(value)}
        </div>
    )
}

export default {
    "EditComp": Edit,
    "ViewComp": View
}