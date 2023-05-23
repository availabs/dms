import React from "react"

const Edit = ({value, onChange}) => {
    return (
        <input
            value={value}
            className='w-full p-2'
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