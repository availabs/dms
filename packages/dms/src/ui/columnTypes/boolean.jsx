import React from "react"
import Select from "../components/Select"


export const BooleanEdit = ({value, onChange, placeHolder='Please Select'}) => {
    return (
        // UI.Select (2026-10-17, raw-HTML pass). Values stay the strings the native <select> handed back.
        <Select
            value={value === undefined || value === null || value === '' ? '' : String(value)}
            onChange={onChange}
            placeholder={placeHolder}
            options={[{ label: 'True', value: 'true' }, { label: 'False', value: 'false' }]}
        />

    )
}

export const BooleanView = ({value}) => {
    if (!value) return false
    return (
        <div>
            {value}
        </div>
    )
}

