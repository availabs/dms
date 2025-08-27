import React from "react"


const Edit = ({value, onChange, placeHolder='Please Select'}) => {
    return (
        <select
            className={'px-2 py-1 w-full text-sm font-light border rounded-md focus:border-blue-300 bg-white hover:bg-blue-100 transition ease-in'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
        >
            <option value={undefined}>{placeHolder}</option>
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