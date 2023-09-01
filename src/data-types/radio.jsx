import React from "react"
import { useTheme } from '../theme'


const Edit = ({value = '', onChange, options = [], inline}) => {
    // options: ['1', 's', 't'] || [{label: '1', value: '1'}, {label: 's', value: '2'}, {label: 't', value: '3'}]
    const theme = useTheme();
    const isInvalidValue = value && !options.find(o => o === value);
    return (
        <>
            {
                isInvalidValue ? <div className={theme?.radio?.error}>Invalid Value: {JSON.stringify(value)}</div> : null
            }
            <div className={`flex ${inline ? `flex-row` : `flex-col`}`}>
                {
                    options.map((o, i) => (
                        <div key={i} className={theme?.radio?.wrapper || 'p-1 flex'}>
                            <input id={o}
                                   className={theme?.radio?.input || 'self-center p-1'}
                                   type="radio" value={o} checked={value === o} onChange={e => onChange(e.target.value)} />

                            <label
                                htmlFor={o}
                                className={theme?.radio?.label || 'text-sm font-light p-1 self-center'}
                            > {o} </label>
                        </div>
                    ))
                }
            </div>
        </>
    )

}

const View = ({className, value}) => {
    if (!value) return false

    const theme = useTheme();

    return (
        <div className={ className || (theme?.text?.view)}>
            {value}
        </div>
    )
}

export default {
    "EditComp": Edit,
    "ViewComp": View
}