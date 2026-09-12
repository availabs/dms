import React from "react";

export const InputControl = ({type, placeHolder, value, setValue, coerce, title, className, inputClassName, onKeyDown, displayCdn=true, ...rest}) => setValue && displayCdn ? (
    <div>
        <div
            className={className || `inline-flex w-full justify-center items-center rounded-md px-1.5 py-1 text-sm font-regular 
            text-gray-900 bg-white hover:bg-gray-50 cursor-pointer`}
        >
            <span className={'flex-1 select-none mr-1 w-fit'}>{title}</span>
            <input className={inputClassName || 'flex-1 p-0.5 border-b border-0.5'}
                   type={type}
                   placeholder={placeHolder}
                   value={value}
                   // `coerce` (when supplied) owns the raw->stored conversion: it clamps to
                   // min/max and maps a blank field to undefined ("unset"). Without it the
                   // historical behavior is kept verbatim — note `+''` is 0, which is exactly
                   // the trap coerce exists to avoid for bounded numeric controls.
                   onChange={e => setValue(coerce ? coerce(e.target.value) : (type === 'number' ? +e.target.value : e.target.value))}
                   onKeyDown={onKeyDown}
                   onWheel={e => e.target.blur()}
                   {...rest}
            />
        </div>
    </div>
) : null;