import React from "react"

const Edit = ({value, onChange}) => {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
        >
            <option value={true}>True</option>
            <option value={false}>False</option>
        </select>

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