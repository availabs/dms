import React from "react"

const theme = {
    text: {
            input: 'px-2 py-1 w-full text-sm font-light border rounded-md focus:border-blue-300 bg-white focus:outline-none transition ease-in',
            view: 'text-sm font-light truncate bg-red-500'
        },
}

const Edit = ({value, item, onChange, className, attributes={}, ...rest}) => {
    // how do i pass pattern attributes here?
   // console.log('can i pass item here?', item, value, rest)
   
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