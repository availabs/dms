import React from "react"
import {useTheme} from "../theme";

const Edit = ({value, onChange, placeHolder='Please Select'}) => {
    const theme = useTheme();
    return (
        <select
            className={theme?.boolean?.select}
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