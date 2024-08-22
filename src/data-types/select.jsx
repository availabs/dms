import React from "react"
import { useTheme } from '../theme'
import {Alert} from "../patterns/admin/ui/icons";


const Edit = ({value = '', onChange, className, placeholder, displayInvalidMsg=true, options = [], ...rest}) => {
    // options: ['1', 's', 't'] || [{label: '1', value: '1'}, {label: 's', value: '2'}, {label: 't', value: '3'}]
    const theme = useTheme();

    const isInvalidValue = value && !options.find(o => (o.value || o) === value);
    return (
        <>
            {
                isInvalidValue ? <Alert className={theme?.select?.error} title={`Invalid Value: ${JSON.stringify(value)}`} /> : null
            }
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
        </>
    )
}

const View = ({className, value, options = [], ...rest}) => {
    if (!value) return <div className={ `${className || theme?.select?.input}`} />

    const theme = useTheme();
    const option = options.find(o => (o.value || o) === value) || value;
    const isInvalidValue = value && !options.find(o => (o.value || o) === value);

    return (
        <div className={ `${className || theme?.select?.input}`} {...rest}>
            {option?.label || option}
        </div>
    )
}

export default {
    "EditComp": Edit,
    "ViewComp": View
}