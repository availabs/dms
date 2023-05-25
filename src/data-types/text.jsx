import React from "react"

const Edit = ({value = '', onChange, className, placeholder}) => {
    return (
        <input
            className={className || 'w-full p-2'}
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