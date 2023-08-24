import React from "react"
import { useTheme } from '../theme'


const Edit = ({value = '', onChange, className, placeholder = 'Please select an option', options = []}) => {
    // options: ['1', 's', 't'] || [{label: '1', value: '1'}, {label: 's', value: '2'}, {label: 't', value: '3'}]
    const theme = useTheme();

    return (
        <select
            className={ className || (theme?.select?.input || 'w-full border p-2')}
            value={value}
            onChange={(e) => onChange(e.target.value)}
        >
            <option value={''}>{placeholder}</option>
            {
                options.map((o, i) => <option key={i} value={o.value || o}>{o.label || o}</option>)
            }
        </select>
    )
}

const View = ({className, value, options = []}) => {
    if (!value) return false

    const theme = useTheme();
    const option = options.find(o => (o.value || o) === value);

    return (
        <div className={ className || (theme?.text?.view)}>
            {option?.label || option}
        </div>
    )
}

export default {
    "EditComp": Edit,
    "ViewComp": View
}