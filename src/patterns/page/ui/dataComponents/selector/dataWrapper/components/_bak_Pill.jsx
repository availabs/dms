import React from 'react'

export const Pill = ({color, text, ...rest}) => {
    const colors = {
        orange: `bg-orange-500/15 text-orange-700 hover:bg-orange-500/25`,
        blue: `bg-blue-500/15 text-blue-700 hover:bg-blue-500/25`,
        gray: `text-gray-400`
    };
    return (
        <div className="relative inline-flex rounded-md focus:outline-none hover:cursor-pointer" {...rest}>
            <span className={
                `inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-sm/5 font-regular sm:text-xs/5 forced-colors:outline ${colors[color]}`}>
                {text}</span>
        </div>
    )
}